import json

import pytest


@pytest.fixture(autouse=True)
def _patch_command_runner_globals(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(cr, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(cr, "WORKSPACE_SLUG", "ws")
    monkeypatch.setattr(cr, "RUNTIME_MODE", "systemd")
    monkeypatch.setattr(cr, "COMPOSE_PROJECT", "yourhq")
    monkeypatch.setattr(cr, "HOME", "/home/user")
    monkeypatch.setattr(cr, "GATEWAY_ID", "test-gw")


def test_validate_slug_accepts_valid():
    from command_runner import validate_slug

    assert validate_slug("my-agent") is True
    assert validate_slug("agent1") is True
    assert validate_slug("a") is True
    assert validate_slug("abc-def-ghi") is True


def test_validate_slug_rejects_empty():
    from command_runner import validate_slug

    assert validate_slug("") is False
    assert validate_slug(None) is False


def test_validate_slug_rejects_slashes():
    from command_runner import validate_slug

    assert validate_slug("bad/slug") is False
    assert validate_slug("../escape") is False


def test_validate_slug_rejects_spaces():
    from command_runner import validate_slug

    assert validate_slug("bad slug") is False


def test_validate_slug_rejects_uppercase():
    from command_runner import validate_slug

    assert validate_slug("BadSlug") is False


def test_validate_slug_rejects_too_long():
    from command_runner import validate_slug

    assert validate_slug("a" * 41) is False
    assert validate_slug("a" * 40) is True


def test_build_command_provision():
    from command_runner import build_command

    args, desc = build_command("provision", "my-agent", {"channel": "telegram"})
    assert args is not None
    assert args[0] == "/home/user/add-agent.sh"
    assert "ws/my-agent" in args
    assert "--channel" in args
    assert "telegram" in args
    assert "--slug" in args
    assert "my-agent" in args
    assert "Provisioning" in desc


def test_build_command_provision_with_discord_ids():
    from command_runner import build_command

    args, _ = build_command(
        "provision",
        "my-agent",
        {
            "channel": "discord",
            "discord_server_id": "111",
            "discord_user_id": "222",
        },
    )
    assert "--discord-server-id" in args
    assert "111" in args
    assert "--discord-user-id" in args
    assert "222" in args


def test_build_command_provision_rejects_invalid_slug():
    from command_runner import build_command

    args, err = build_command("provision", "bad slug!", {})
    assert args is None
    assert "Invalid" in err


def test_build_command_update():
    from command_runner import build_command

    args, desc = build_command("update", "my-agent", {})
    assert args is not None
    assert args[0] == "/home/user/update-agent.sh"
    assert args[1] == "ws/my-agent"


def test_build_command_update_requires_slug():
    from command_runner import build_command

    args, err = build_command("update", "", {})
    assert args is None
    assert "Missing" in err


def test_build_command_remove():
    from command_runner import build_command

    args, desc = build_command("remove", "my-agent", {})
    assert args is not None
    assert args[0] == "/home/user/remove-agent.sh"
    assert args[1] == "ws/my-agent"


def test_build_command_remove_requires_slug():
    from command_runner import build_command

    args, err = build_command("remove", "", {})
    assert args is None
    assert "Missing" in err


def test_build_command_restart_gateway_systemd(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "RUNTIME_MODE", "systemd")
    args, desc = cr.build_command("restart_gateway", None, {})
    assert args == ["openclaw", "gateway", "restart"]


def test_build_command_restart_gateway_docker(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "RUNTIME_MODE", "docker")
    monkeypatch.setattr(cr, "COMPOSE_PROJECT", "myproj")
    args, desc = cr.build_command("restart_gateway", None, {})
    assert args == ["docker", "compose", "-p", "myproj", "restart", "gateway"]


def test_build_command_restart_gateway_e2b(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "RUNTIME_MODE", "e2b")
    args, desc = cr.build_command("restart_gateway", None, {})
    assert args[0] == "bash"
    assert "e2b" in desc.lower()


def test_build_command_unknown_action():
    from command_runner import build_command

    args, err = build_command("nonexistent_action", "slug", {})
    assert args is None
    assert "Unknown action" in err


def test_build_command_provision_with_optional_fields():
    from command_runner import build_command

    args, _ = build_command(
        "provision",
        "my-agent",
        {
            "channel": "telegram",
            "name": "My Agent",
            "model": "gpt-4",
            "source_template": "default",
        },
    )
    assert "--name" in args
    assert "My Agent" in args
    assert "--model" in args
    assert "gpt-4" in args
    assert "--source-branch" in args
    assert "default" in args


def test_heartbeat_once_sets_ready_for_active_gateway(monkeypatch):
    import command_runner as cr

    api_calls = []

    def fake_api_get(table, params):
        api_calls.append(("GET", table, params))
        if "gateways" in table:
            return [{"status": "ready"}]
        return []

    upsert_calls = []

    def fake_upsert(table, body, on_conflict):
        upsert_calls.append((table, body))

    monkeypatch.setattr(cr, "api_get", fake_api_get)
    monkeypatch.setattr(cr, "api_post_upsert", fake_upsert)
    monkeypatch.setattr(cr, "HEARTBEAT_FILE", "/dev/null")

    cr.heartbeat_once()

    assert len(upsert_calls) == 1
    assert upsert_calls[0][1]["status"] == "ready"
    assert cr.GATEWAY_PAUSED is False


def test_heartbeat_once_preserves_paused_status(monkeypatch):
    import command_runner as cr

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"status": "paused"}]
        return []

    patch_calls = []

    def fake_patch_by_slug(table, slug, payload):
        patch_calls.append((table, slug, payload))

    monkeypatch.setattr(cr, "api_get", fake_api_get)
    monkeypatch.setattr(cr, "api_patch_by_slug", fake_patch_by_slug)
    monkeypatch.setattr(cr, "HEARTBEAT_FILE", "/dev/null")

    cr.heartbeat_once()

    assert cr.GATEWAY_PAUSED is True
    assert len(patch_calls) == 1
    assert "last_seen_at" in patch_calls[0][2]


def test_heartbeat_once_preserves_hibernating_status(monkeypatch):
    import command_runner as cr

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"status": "hibernating"}]
        return []

    patch_calls = []

    def fake_patch_by_slug(table, slug, payload):
        patch_calls.append(payload)

    monkeypatch.setattr(cr, "api_get", fake_api_get)
    monkeypatch.setattr(cr, "api_patch_by_slug", fake_patch_by_slug)
    monkeypatch.setattr(cr, "HEARTBEAT_FILE", "/dev/null")

    cr.heartbeat_once()

    assert cr.GATEWAY_PAUSED is True


def test_heartbeat_once_handles_api_failure(monkeypatch):
    import command_runner as cr

    def failing_get(table, params):
        raise ConnectionError("down")

    monkeypatch.setattr(cr, "api_get", failing_get)
    monkeypatch.setattr(cr, "HEARTBEAT_FILE", "/dev/null")

    cr.heartbeat_once()


def test_execute_command_timeout(monkeypatch):
    import subprocess

    import command_runner as cr

    rpc_calls = []

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    def fake_run(args, **kwargs):
        raise subprocess.TimeoutExpired(args, 120)

    monkeypatch.setattr(cr, "api_rpc", fake_rpc)
    monkeypatch.setattr(subprocess, "run", fake_run)

    cr.execute_command(
        {
            "id": "cmd-1",
            "action": "update",
            "agent_slug": "my-agent",
            "payload": {},
        }
    )

    fail_calls = [(fn, p) for fn, p in rpc_calls if fn == "fail_command"]
    assert len(fail_calls) == 1
    assert "Timed out" in fail_calls[0][1]["p_error"]


def test_execute_command_subprocess_error(monkeypatch):
    import subprocess

    import command_runner as cr

    rpc_calls = []

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    def fake_run(args, **kwargs):
        raise OSError("command not found")

    monkeypatch.setattr(cr, "api_rpc", fake_rpc)
    monkeypatch.setattr(subprocess, "run", fake_run)

    cr.execute_command(
        {
            "id": "cmd-2",
            "action": "update",
            "agent_slug": "my-agent",
            "payload": {},
        }
    )

    fail_calls = [(fn, p) for fn, p in rpc_calls if fn == "fail_command"]
    assert len(fail_calls) == 1
    assert "command not found" in fail_calls[0][1]["p_error"]


def test_execute_command_validation_failure(monkeypatch):
    import command_runner as cr

    rpc_calls = []

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    monkeypatch.setattr(cr, "api_rpc", fake_rpc)

    cr.execute_command(
        {
            "id": "cmd-3",
            "action": "nonexistent_action",
            "agent_slug": "my-agent",
            "payload": {},
        }
    )

    fail_calls = [(fn, p) for fn, p in rpc_calls if fn == "fail_command"]
    assert len(fail_calls) == 1
    assert "Unknown action" in fail_calls[0][1]["p_error"]


def test_process_pending_skipped_when_paused(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "GATEWAY_PAUSED", True)
    result = cr.process_pending()
    assert result == 0


def test_command_listener_ws_url(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "SUPABASE_URL", "https://xyz.supabase.co")
    monkeypatch.setattr(cr, "SUPABASE_KEY", "my-key")

    listener = cr.CommandListener()
    url = listener._ws_url()
    assert url.startswith("wss://xyz.supabase.co/realtime/v1/websocket")
    assert "apikey=my-key" in url


def test_command_listener_http_to_ws(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "SUPABASE_URL", "http://localhost:54321")
    monkeypatch.setattr(cr, "SUPABASE_KEY", "k")

    listener = cr.CommandListener()
    url = listener._ws_url()
    assert url.startswith("ws://localhost:54321")


def test_command_listener_next_ref_increments():
    import command_runner as cr

    listener = cr.CommandListener()
    assert listener._next_ref() == "1"
    assert listener._next_ref() == "2"
    assert listener._next_ref() == "3"


def test_command_listener_on_message_triggers_processing(monkeypatch):
    import json

    import command_runner as cr

    processed = []
    monkeypatch.setattr(cr, "process_pending", lambda: (processed.append(True), 1)[1])

    listener = cr.CommandListener()
    raw = json.dumps(
        {
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "agent_commands",
                    "type": "INSERT",
                    "record": {"action": "update", "agent_slug": "test"},
                }
            },
        }
    )
    listener._on_message(None, raw)
    assert len(processed) == 1


def test_command_listener_on_message_secrets_change(monkeypatch):
    import json

    import command_runner as cr

    sync_called = []

    import secrets_sync

    monkeypatch.setattr(secrets_sync, "sync_secrets", lambda: sync_called.append(True))

    listener = cr.CommandListener()
    raw = json.dumps(
        {
            "event": "postgres_changes",
            "payload": {
                "data": {
                    "table": "secrets",
                    "type": "UPDATE",
                }
            },
        }
    )
    listener._on_message(None, raw)
    assert len(sync_called) == 1


def test_command_listener_on_message_ignores_malformed():
    import command_runner as cr

    listener = cr.CommandListener()
    listener._on_message(None, "not-json")
    listener._on_message(None, json.dumps({"event": "heartbeat"}))


def test_parse_auth_progress_extracts_url():
    from command_runner import parse_auth_progress

    url, code = parse_auth_progress("Visit https://github.com/login/device to sign in")
    assert url == "https://github.com/login/device"


def test_parse_auth_progress_ignores_localhost():
    from command_runner import parse_auth_progress

    url, code = parse_auth_progress("Callback at http://localhost:1455/callback")
    assert url is None


def test_parse_auth_progress_extracts_code():
    from command_runner import parse_auth_progress

    url, code = parse_auth_progress("Enter code: ABCD-1234")
    assert code == "ABCD-1234"


def test_strip_ansi_removes_escape_sequences():
    from command_runner import strip_ansi

    assert strip_ansi("\x1b[32mhello\x1b[0m") == "hello"
    assert strip_ansi("\x1b[?25lhidden\x1b[?25h") == "hidden"


def test_sync_to_shared_auth_finds_deeply_nested_auth(monkeypatch, tmp_path):
    """sync_to_shared_auth should find auth-profiles.json even when written
    to an unexpected subdirectory (e.g. gateway/agent/ instead of agents/*)."""
    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    state_dir.mkdir()
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    # Simulate openclaw writing auth to an unexpected nested path
    deep_dir = state_dir / "gateway" / "agent"
    deep_dir.mkdir(parents=True)
    auth_data = {"profiles": {"openai:default": {"token": "sk-test"}}}
    (deep_dir / "auth-profiles.json").write_text(json.dumps(auth_data))

    cr.sync_to_shared_auth()

    shared = state_dir / "shared-auth" / "auth-profiles.json"
    assert shared.exists()
    result = json.loads(shared.read_text())
    assert result["profiles"]["openai:default"]["token"] == "sk-test"


def test_sync_to_shared_auth_links_to_existing_agents(monkeypatch, tmp_path):
    """When agents already exist, sync should symlink shared-auth into them."""
    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    state_dir.mkdir()
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    # Create an agent directory without auth
    agent_dir = state_dir / "agents" / "my-agent" / "agent"
    agent_dir.mkdir(parents=True)

    # Auth file in a non-standard location
    nested = state_dir / "default" / "agent"
    nested.mkdir(parents=True)
    auth_data = {"profiles": {"openai:default": {"token": "sk-test"}}}
    (nested / "auth-profiles.json").write_text(json.dumps(auth_data))

    cr.sync_to_shared_auth()

    agent_auth = agent_dir / "auth-profiles.json"
    assert agent_auth.is_symlink()
    result = json.loads(agent_auth.read_text())
    assert result["profiles"]["openai:default"]["token"] == "sk-test"


def test_sync_to_shared_auth_skips_when_nothing_found(monkeypatch, tmp_path):
    """sync_to_shared_auth should return gracefully when no auth files exist."""
    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    state_dir.mkdir()
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    cr.sync_to_shared_auth()

    shared = state_dir / "shared-auth" / "auth-profiles.json"
    assert not shared.exists()


def _make_sqlite_auth(path, agent_id, auth_data='{"version":1,"profiles":{"openai:test":{"type":"oauth"}}}'):
    """Helper: create a valid openclaw-agent.sqlite with auth data."""
    import sqlite3

    path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(str(path))
    conn.execute(
        "CREATE TABLE schema_meta "
        "(meta_key TEXT, type TEXT, version TEXT, agent_id TEXT, "
        "extra TEXT, created_at INTEGER, updated_at INTEGER)"
    )
    conn.execute(
        "INSERT INTO schema_meta VALUES (?, ?, ?, ?, ?, ?, ?)",
        ("primary", "agent", "1", agent_id, None, 0, 0),
    )
    conn.execute("CREATE TABLE auth_profile_store (key TEXT, store_json TEXT, updated_at INTEGER)")
    if auth_data:
        conn.execute("INSERT INTO auth_profile_store VALUES (?, ?, ?)", ("primary", auth_data, 0))
    conn.execute("CREATE TABLE cache_entries (key TEXT, value TEXT)")
    conn.execute("CREATE TABLE auth_profile_state (key TEXT, state_json TEXT, updated_at INTEGER)")
    conn.commit()
    conn.close()


def test_sqlite_auth_clone_to_new_agent(monkeypatch, tmp_path):
    """New agents without SQLite auth get cloned from the source agent."""
    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    # Source agent with valid auth
    src = state_dir / "agents" / "agent-a" / "agent"
    _make_sqlite_auth(src / "openclaw-agent.sqlite", "agent-a")

    # Target agent with no SQLite
    tgt = state_dir / "agents" / "agent-b" / "agent"
    tgt.mkdir(parents=True)

    cr.sync_to_shared_auth()

    import sqlite3

    db = sqlite3.connect(str(tgt / "openclaw-agent.sqlite"))
    aid = db.execute("SELECT agent_id FROM schema_meta WHERE meta_key = 'primary'").fetchone()
    store = db.execute("SELECT store_json FROM auth_profile_store LIMIT 1").fetchone()
    db.close()

    assert aid[0] == "agent-b"
    assert store is not None and len(store[0]) > 10


def test_sqlite_auth_clone_patches_agent_id(monkeypatch, tmp_path):
    """Cloned SQLite must have agent_id patched to match the target directory."""
    import sqlite3

    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    src = state_dir / "agents" / "source" / "agent"
    _make_sqlite_auth(src / "openclaw-agent.sqlite", "source")

    for name in ["target-1", "target-2"]:
        (state_dir / "agents" / name / "agent").mkdir(parents=True)

    cr.sync_to_shared_auth()

    for name in ["target-1", "target-2"]:
        db = sqlite3.connect(str(state_dir / "agents" / name / "agent" / "openclaw-agent.sqlite"))
        aid = db.execute("SELECT agent_id FROM schema_meta WHERE meta_key = 'primary'").fetchone()
        db.close()
        assert aid[0] == name


def test_sqlite_auth_skips_agent_with_valid_auth(monkeypatch, tmp_path):
    """Agents that already have valid auth and correct agent_id are not overwritten."""
    import sqlite3

    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    src = state_dir / "agents" / "agent-a" / "agent"
    _make_sqlite_auth(src / "openclaw-agent.sqlite", "agent-a")

    tgt = state_dir / "agents" / "agent-b" / "agent"
    own_auth = '{"version":1,"profiles":{"anthropic:own":{"type":"api-key"}}}'
    _make_sqlite_auth(tgt / "openclaw-agent.sqlite", "agent-b", auth_data=own_auth)

    cr.sync_to_shared_auth()

    db = sqlite3.connect(str(tgt / "openclaw-agent.sqlite"))
    store = db.execute("SELECT store_json FROM auth_profile_store LIMIT 1").fetchone()
    db.close()
    assert "anthropic:own" in store[0]


def test_sqlite_auth_fixes_mismatched_agent_id(monkeypatch, tmp_path):
    """An existing SQLite with wrong agent_id gets re-cloned with the correct ID."""
    import sqlite3
    import time

    import command_runner as cr

    state_dir = tmp_path / ".openclaw"
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(state_dir))
    monkeypatch.setattr(cr, "HOME", str(tmp_path))

    # Source agent — created first so it's the only valid candidate.
    src = state_dir / "agents" / "agent-a" / "agent"
    _make_sqlite_auth(src / "openclaw-agent.sqlite", "agent-a")
    # Ensure src has a newer mtime than the target.
    import os

    future = time.time() + 1
    os.utime(str(src / "openclaw-agent.sqlite"), (future, future))

    # Target: has auth but wrong agent_id (simulates a raw copy without patching).
    tgt = state_dir / "agents" / "agent-b" / "agent"
    _make_sqlite_auth(tgt / "openclaw-agent.sqlite", "agent-a")

    cr.sync_to_shared_auth()

    db = sqlite3.connect(str(tgt / "openclaw-agent.sqlite"))
    aid = db.execute("SELECT agent_id FROM schema_meta WHERE meta_key = 'primary'").fetchone()
    db.close()
    assert aid[0] == "agent-b"


def test_auth_set_default_uses_models_set(monkeypatch):
    """openclaw 5.x: default model is set via `models set <target>` (the
    legacy `set-default` subcommand was removed)."""
    import subprocess

    import command_runner as cr

    runs = []
    rpc_calls = []

    def fake_run(args, **kwargs):
        runs.append(list(args))
        return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(cr, "api_rpc", fake_rpc)

    cr.handle_auth_set_default("cmd-sd-1", {"provider": "openai-codex"})

    assert len(runs) == 1
    # openclaw >=6.x folded openai-codex into openai; the runner normalizes.
    assert runs[0] == ["openclaw", "models", "set", "openai"]
    assert "set-default" not in runs[0]
    assert any(fn == "complete_command" for fn, _ in rpc_calls)


def test_auth_set_default_failure(monkeypatch):
    """`models set` failing → fail_command with the exit code."""
    import subprocess

    import command_runner as cr

    rpc_calls = []

    def fake_run(args, **kwargs):
        return subprocess.CompletedProcess(args, 2, stdout="", stderr="nope")

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(cr, "api_rpc", fake_rpc)

    cr.handle_auth_set_default("cmd-sd-3", {"provider": "openai"})

    fail = [(fn, p) for fn, p in rpc_calls if fn == "fail_command"]
    assert len(fail) == 1
    assert fail[0][1]["p_exit_code"] == 2


def test_auth_set_api_key_uses_paste_api_key_cli(monkeypatch):
    """openclaw 5.x stores auth in per-agent SQLite; the api-key path shells
    out to `openclaw models auth paste-api-key` (NOT writing auth-profiles.json)."""
    import subprocess

    import command_runner as cr

    runs = []
    stdins = []
    rpc_calls = []

    def fake_run(args, **kwargs):
        runs.append(list(args))
        stdins.append(kwargs.get("input"))
        return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

    def fake_rpc(fn, payload=None):
        rpc_calls.append((fn, payload))
        return None

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(cr, "api_rpc", fake_rpc)
    monkeypatch.setattr(cr, "api_patch", lambda *a, **k: None)
    monkeypatch.setattr(cr, "_set_default_model_for_provider", lambda *a, **k: None)
    # No agents dir in the test env → handler falls back to ["main"].
    monkeypatch.setattr(cr.os.path, "exists", lambda p: False)

    cr.handle_auth_set_api_key("cmd-ak-1", {"provider": "openai", "api_key": "sk-test"})

    paste = [r for r in runs if r[:4] == ["openclaw", "models", "auth", "paste-api-key"]]
    assert paste, f"expected paste-api-key invocation, got {runs}"
    assert "--provider" in paste[0] and "openai" in paste[0]
    assert "--agent" not in paste[0]  # paste-api-key has no --agent flag in 5.28
    assert "sk-test\n" in stdins  # key delivered via stdin, not argv
    assert any(fn == "complete_command" for fn, _ in rpc_calls)


# ── provider normalization (openclaw >=6.x renames) ────────────────────


def test_normalize_provider_maps_openai_codex():
    import command_runner as mod

    assert mod.normalize_provider("openai-codex") == "openai"


def test_normalize_provider_maps_google_gemini_cli():
    import command_runner as mod

    assert mod.normalize_provider("google-gemini-cli") == "google"


def test_normalize_provider_passes_through_unmapped():
    import command_runner as mod

    assert mod.normalize_provider("anthropic") == "anthropic"
    assert mod.normalize_provider("openai") == "openai"


def test_normalize_model_rewrites_provider_segment():
    import command_runner as mod

    assert mod.normalize_model("openai-codex/gpt-5.4") == "openai/gpt-5.4"
    assert mod.normalize_model("anthropic/claude-sonnet-4-5") == "anthropic/claude-sonnet-4-5"


def test_normalize_model_leaves_bare_names():
    import command_runner as mod

    assert mod.normalize_model("gpt-5.4") == "gpt-5.4"
    assert mod.normalize_model("") == ""


# ── codex auth cache cleanup ───────────────────────────────────────────


def test_cleanup_stale_codex_auth_removes_cache(tmp_path, monkeypatch):
    import command_runner as mod

    codex_home = tmp_path / "codex-home"
    codex_home.mkdir()
    auth = codex_home / "auth.json"
    auth.write_text("{}")
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(tmp_path))

    mod._cleanup_stale_codex_auth("openai")
    assert not auth.exists()


def test_cleanup_stale_codex_auth_ignores_other_providers(tmp_path, monkeypatch):
    import command_runner as mod

    codex_home = tmp_path / "codex-home"
    codex_home.mkdir()
    auth = codex_home / "auth.json"
    auth.write_text("{}")
    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(tmp_path))

    mod._cleanup_stale_codex_auth("anthropic")
    assert auth.exists()


def test_cleanup_stale_codex_auth_noop_when_absent(tmp_path, monkeypatch):
    import command_runner as mod

    monkeypatch.setenv("OPENCLAW_STATE_DIR", str(tmp_path))
    mod._cleanup_stale_codex_auth("openai")  # must not raise


# ── resolve_branch / workspace slug race ──────────────────────────────


def test_resolve_branch_prefers_payload_workspace_slug(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "WORKSPACE_SLUG", "table-ws")
    assert cr.resolve_branch("alex", {"workspace_slug": "wizard-ws"}) == "wizard-ws/alex"


def test_resolve_branch_falls_back_to_table_lookup(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "WORKSPACE_SLUG", "table-ws")
    assert cr.resolve_branch("alex", {}) == "table-ws/alex"
    assert cr.resolve_branch("alex", None) == "table-ws/alex"


def test_resolve_branch_bare_when_no_slug_anywhere(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "WORKSPACE_SLUG", None)
    monkeypatch.setattr(cr, "api_get", lambda *a, **k: [])
    assert cr.resolve_branch("alex", {}) == "alex"


def test_get_workspace_slug_does_not_cache_empty(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "WORKSPACE_SLUG", None)
    calls = []

    def fake_api_get(*a, **k):
        calls.append(1)
        # First call: workspace row not written yet. Second call: it exists.
        return [] if len(calls) == 1 else [{"slug": "late-ws"}]

    monkeypatch.setattr(cr, "api_get", fake_api_get)
    assert cr.get_workspace_slug() == ""
    assert cr.get_workspace_slug() == "late-ws"
    # Now cached: no further lookups.
    assert cr.get_workspace_slug() == "late-ws"
    assert len(calls) == 2


def test_provision_branch_uses_payload_workspace_slug(monkeypatch):
    import command_runner as cr

    monkeypatch.setattr(cr, "WORKSPACE_SLUG", None)
    monkeypatch.setattr(cr, "api_get", lambda *a, **k: [])
    args, _desc = cr.build_command("provision", "alex", {"workspace_slug": "prajoth-hq", "channel": "none"})
    assert args[1] == "prajoth-hq/alex"
