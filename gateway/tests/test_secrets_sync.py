import base64
import os

import pytest


@pytest.fixture(autouse=True)
def _reset_secrets_sync_globals(monkeypatch, tmp_path):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_supabase_url", "https://test.supabase.co")
    monkeypatch.setattr(ss, "_supabase_key", "test-service-role-key")
    monkeypatch.setattr(ss, "_gateway_id", "test-gw")
    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setattr(ss, "SECRETS_DIR", tmp_path / "secrets")
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", tmp_path / "secrets" / "agents")
    monkeypatch.delenv("HOSTED_SECRETS_KEY", raising=False)


def test_hkdf_extract_produces_32_bytes():
    from secrets_sync import _hkdf_extract

    prk = _hkdf_extract(b"salt", b"input-key-material")
    assert len(prk) == 32
    assert isinstance(prk, bytes)


def test_hkdf_extract_deterministic():
    from secrets_sync import _hkdf_extract

    a = _hkdf_extract(b"salt", b"ikm")
    b = _hkdf_extract(b"salt", b"ikm")
    assert a == b


def test_hkdf_extract_different_salts():
    from secrets_sync import _hkdf_extract

    a = _hkdf_extract(b"salt1", b"ikm")
    b = _hkdf_extract(b"salt2", b"ikm")
    assert a != b


def test_hkdf_expand_produces_requested_length():
    from secrets_sync import _hkdf_expand

    prk = b"\x00" * 32
    result = _hkdf_expand(prk, b"info", 32)
    assert len(result) == 32

    result16 = _hkdf_expand(prk, b"info", 16)
    assert len(result16) == 16

    result64 = _hkdf_expand(prk, b"info", 64)
    assert len(result64) == 64


def test_derive_key_returns_32_bytes():
    from secrets_sync import _derive_key

    key = _derive_key("my-service-role-key")
    assert len(key) == 32
    assert isinstance(key, bytes)


def test_derive_key_deterministic():
    from secrets_sync import _derive_key

    a = _derive_key("same-key")
    b = _derive_key("same-key")
    assert a == b


def test_derive_key_different_inputs():
    from secrets_sync import _derive_key

    a = _derive_key("key-1")
    b = _derive_key("key-2")
    assert a != b


def test_derive_key_uses_correct_salt_and_info():
    from secrets_sync import HKDF_INFO, HKDF_SALT, _derive_key, _hkdf_expand, _hkdf_extract

    service_key = "test-key-123"
    expected_prk = _hkdf_extract(HKDF_SALT, service_key.encode())
    expected = _hkdf_expand(expected_prk, HKDF_INFO, 32)
    assert _derive_key(service_key) == expected


def test_get_encryption_key_derives_from_supabase_key(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setattr(ss, "_supabase_key", "my-service-key")

    key = ss._get_encryption_key()
    assert len(key) == 32
    assert key == ss._derive_key("my-service-key")


def test_get_encryption_key_caches_result(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setattr(ss, "_supabase_key", "my-key")

    key1 = ss._get_encryption_key()
    key2 = ss._get_encryption_key()
    assert key1 is key2


def test_get_encryption_key_hosted_key_hex(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    raw_key = os.urandom(32)
    monkeypatch.setenv("HOSTED_SECRETS_KEY", raw_key.hex())

    key = ss._get_encryption_key()
    assert key == raw_key


def test_get_encryption_key_hosted_key_base64(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    raw_key = os.urandom(32)
    encoded = base64.urlsafe_b64encode(raw_key).decode().rstrip("=")
    monkeypatch.setenv("HOSTED_SECRETS_KEY", encoded)

    key = ss._get_encryption_key()
    assert key == raw_key


def test_get_encryption_key_hosted_key_invalid(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setenv("HOSTED_SECRETS_KEY", "tooshort")

    with pytest.raises(RuntimeError, match="32 bytes"):
        ss._get_encryption_key()


def test_decrypt_returns_none_for_empty():
    from secrets_sync import _decrypt

    assert _decrypt("") is None
    assert _decrypt(None) is None


def test_decrypt_returns_plaintext_without_prefix():
    from secrets_sync import _decrypt

    assert _decrypt("plain-value") == "plain-value"


def test_decrypt_returns_none_for_malformed_prefix():
    from secrets_sync import _decrypt

    assert _decrypt("enc:v1:only-one-part") is None


def test_decrypt_roundtrip(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setattr(ss, "_supabase_key", "roundtrip-key")

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        pytest.skip("cryptography not installed")

    key = ss._derive_key("roundtrip-key")
    aesgcm = AESGCM(key)
    iv = os.urandom(12)
    plaintext = "my-secret-value"
    ct_with_tag = aesgcm.encrypt(iv, plaintext.encode(), None)
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]

    iv_b64 = base64.urlsafe_b64encode(iv).decode().rstrip("=")
    tag_b64 = base64.urlsafe_b64encode(tag).decode().rstrip("=")
    ct_b64 = base64.urlsafe_b64encode(ct).decode().rstrip("=")

    encrypted = f"enc:v1:{iv_b64}.{tag_b64}.{ct_b64}"
    result = ss._decrypt(encrypted)
    assert result == "my-secret-value"


def test_decrypt_wrong_key_returns_none(monkeypatch):
    import secrets_sync as ss

    monkeypatch.setattr(ss, "_encryption_key", None)
    monkeypatch.setattr(ss, "_supabase_key", "wrong-key")

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        pytest.skip("cryptography not installed")

    real_key = ss._derive_key("correct-key")
    aesgcm = AESGCM(real_key)
    iv = os.urandom(12)
    ct_with_tag = aesgcm.encrypt(iv, b"secret", None)
    ct = ct_with_tag[:-16]
    tag = ct_with_tag[-16:]

    iv_b64 = base64.urlsafe_b64encode(iv).decode().rstrip("=")
    tag_b64 = base64.urlsafe_b64encode(tag).decode().rstrip("=")
    ct_b64 = base64.urlsafe_b64encode(ct).decode().rstrip("=")

    encrypted = f"enc:v1:{iv_b64}.{tag_b64}.{ct_b64}"
    result = ss._decrypt(encrypted)
    assert result is None


def test_shell_quote_simple():
    from secrets_sync import _shell_quote

    assert _shell_quote("hello") == "'hello'"


def test_shell_quote_with_single_quotes():
    from secrets_sync import _shell_quote

    assert _shell_quote("it's") == "'it'\\''s'"


def test_shell_quote_empty():
    from secrets_sync import _shell_quote

    assert _shell_quote("") == "''"


def test_write_env_file_creates_sorted_output(tmp_path):
    from secrets_sync import _write_env_file

    env_file = tmp_path / "test.env"
    _write_env_file(env_file, {"BETA": "2", "ALPHA": "1", "GAMMA": "3"})

    content = env_file.read_text()
    lines = content.strip().split("\n")
    assert lines[0] == "ALPHA='1'"
    assert lines[1] == "BETA='2'"
    assert lines[2] == "GAMMA='3'"


def test_write_env_file_secure_permissions(tmp_path):
    from secrets_sync import _write_env_file

    env_file = tmp_path / "secure.env"
    _write_env_file(env_file, {"KEY": "value"})

    assert oct(env_file.stat().st_mode & 0o777) == oct(0o600)
    assert oct(env_file.parent.stat().st_mode & 0o777) == oct(0o700)


def test_write_env_file_empty_dict(tmp_path):
    from secrets_sync import _write_env_file

    env_file = tmp_path / "empty.env"
    _write_env_file(env_file, {})

    assert env_file.read_text() == ""


def test_write_env_file_creates_parent_dirs(tmp_path):
    from secrets_sync import _write_env_file

    nested = tmp_path / "a" / "b" / "c" / "test.env"
    _write_env_file(nested, {"KEY": "val"})
    assert nested.exists()


def test_sync_secrets_no_gateway_id(monkeypatch, tmp_path):
    import secrets_sync as ss

    def fake_api_get(table, params):
        if "gateways" in table:
            return []
        return []

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    ss._sync_secrets_inner()


def test_sync_secrets_no_secrets_preserves_gateway_env(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    agents_dir.mkdir(parents=True)
    gateway_env = secrets_dir / "gateway.env"
    gateway_env.write_text("SUPABASE_URL=https://example.supabase.co\n")
    stale = agents_dir / "stale-agent.env"
    stale.write_text("STALE='yes'")

    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)

    call_log = []

    def fake_api_get(table, params):
        call_log.append((table, params))
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return []
        return []

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    ss._sync_secrets_inner()

    assert gateway_env.read_text() == "SUPABASE_URL=https://example.supabase.co\n"
    assert not stale.exists()


def test_sync_secrets_writes_gateway_and_agent_files(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)

    monkeypatch.setattr(ss, "_decrypt", lambda v: v.replace("encrypted:", ""))

    patch_calls = []

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return [
                {
                    "id": "s1",
                    "agent_id": None,
                    "key": "GW_TOKEN",
                    "encrypted_value": "encrypted:gw-token-value",
                    "sync_status": "pending",
                },
                {
                    "id": "s2",
                    "agent_id": "agent-uuid-1",
                    "key": "AGENT_KEY",
                    "encrypted_value": "encrypted:agent-key-value",
                    "sync_status": "pending",
                },
            ]
        if "agents" in table:
            return [{"id": "agent-uuid-1", "slug": "my-agent"}]
        return []

    def fake_api_patch_many(table, filter_params, payload):
        patch_calls.append((table, filter_params, payload))

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    monkeypatch.setattr(ss, "_api_patch_many", fake_api_patch_many)

    ss._sync_secrets_inner()

    gw_env = secrets_dir / "gateway.env"
    assert gw_env.exists()
    assert "GW_TOKEN='gw-token-value'" in gw_env.read_text()

    agent_env = agents_dir / "my-agent.env"
    assert agent_env.exists()
    content = agent_env.read_text()
    assert "AGENT_KEY='agent-key-value'" in content
    assert "GW_TOKEN='gw-token-value'" in content

    assert len(patch_calls) == 1
    assert "active" in str(patch_calls[0])


def test_sync_secrets_removes_stale_agent_files(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    agents_dir.mkdir(parents=True)
    stale = agents_dir / "old-agent.env"
    stale.write_text("OLD='yes'")

    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)
    monkeypatch.setattr(ss, "_decrypt", lambda v: "decrypted")

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return [
                {"id": "s1", "agent_id": "a1", "key": "KEY", "encrypted_value": "enc", "sync_status": "pending"},
            ]
        if "agents" in table:
            return [{"id": "a1", "slug": "new-agent"}]
        return []

    def fake_api_patch_many(table, fp, p):
        pass

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    monkeypatch.setattr(ss, "_api_patch_many", fake_api_patch_many)

    ss._sync_secrets_inner()

    assert not stale.exists()
    assert (agents_dir / "new-agent.env").exists()


def test_sync_secrets_skips_failed_decryption(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)

    def failing_decrypt(v):
        if "bad" in v:
            return None
        return "good-value"

    monkeypatch.setattr(ss, "_decrypt", failing_decrypt)

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return [
                {"id": "s1", "agent_id": None, "key": "GOOD", "encrypted_value": "good", "sync_status": "pending"},
                {"id": "s2", "agent_id": None, "key": "BAD", "encrypted_value": "bad", "sync_status": "pending"},
            ]
        return []

    def fake_api_patch_many(table, fp, p):
        pass

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    monkeypatch.setattr(ss, "_api_patch_many", fake_api_patch_many)

    ss._sync_secrets_inner()

    gw_env = secrets_dir / "gateway.env"
    content = gw_env.read_text()
    assert "GOOD='good-value'" in content
    assert "BAD" not in content


def test_sync_secrets_agent_inherits_gateway_defaults(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)
    monkeypatch.setattr(ss, "_decrypt", lambda v: f"dec-{v}")

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return [
                {"id": "s1", "agent_id": None, "key": "SHARED", "encrypted_value": "shared", "sync_status": "pending"},
                {"id": "s2", "agent_id": None, "key": "GW_ONLY", "encrypted_value": "gw", "sync_status": "pending"},
                {
                    "id": "s3",
                    "agent_id": "a1",
                    "key": "SHARED",
                    "encrypted_value": "override",
                    "sync_status": "pending",
                },
            ]
        if "agents" in table:
            return [{"id": "a1", "slug": "my-agent"}]
        return []

    def fake_api_patch_many(table, fp, p):
        pass

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    monkeypatch.setattr(ss, "_api_patch_many", fake_api_patch_many)

    ss._sync_secrets_inner()

    agent_env = agents_dir / "my-agent.env"
    content = agent_env.read_text()
    assert "SHARED='dec-override'" in content
    assert "GW_ONLY='dec-gw'" in content


def test_sync_secrets_lock_prevents_concurrent(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", secrets_dir / "agents")

    call_count = 0

    def counting_inner():
        nonlocal call_count
        call_count += 1

    monkeypatch.setattr(ss, "_sync_secrets_inner", counting_inner)

    ss.sync_secrets()
    assert call_count == 1


def test_start_secrets_sync_sets_globals(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", secrets_dir / "agents")

    def fake_api_get(table, params):
        if "gateways" in table:
            return []
        return []

    monkeypatch.setattr(ss, "_api_get", fake_api_get)

    ss.start_secrets_sync("https://my.supabase.co", "my-key", "gw-1")

    assert ss._supabase_url == "https://my.supabase.co"
    assert ss._supabase_key == "my-key"
    assert ss._gateway_id == "gw-1"


def test_sync_secrets_preserves_entrypoint_creds_in_gateway_env(monkeypatch, tmp_path):
    import secrets_sync as ss

    secrets_dir = tmp_path / "secrets"
    agents_dir = secrets_dir / "agents"
    secrets_dir.mkdir(parents=True)
    gateway_env = secrets_dir / "gateway.env"
    gateway_env.write_text(
        "SUPABASE_URL=https://example.supabase.co\n"
        "SUPABASE_SERVICE_ROLE_KEY=srk-123\n"
        "EMBEDDER_URL=http://embedder:18801\n"
    )

    monkeypatch.setattr(ss, "SECRETS_DIR", secrets_dir)
    monkeypatch.setattr(ss, "AGENTS_SECRETS_DIR", agents_dir)
    monkeypatch.setattr(ss, "_decrypt", lambda v: v.replace("enc:", ""))

    def fake_api_get(table, params):
        if "gateways" in table:
            return [{"id": "gw-uuid"}]
        if "secrets" in table:
            return [
                {
                    "id": "s1",
                    "agent_id": None,
                    "key": "CUSTOM_TOKEN",
                    "encrypted_value": "enc:my-token",
                    "sync_status": "pending",
                },
            ]
        return []

    def fake_api_patch_many(table, fp, p):
        pass

    monkeypatch.setattr(ss, "_api_get", fake_api_get)
    monkeypatch.setattr(ss, "_api_patch_many", fake_api_patch_many)

    ss._sync_secrets_inner()

    content = gateway_env.read_text()
    assert "SUPABASE_URL=" in content and "example.supabase.co" in content
    assert "SUPABASE_SERVICE_ROLE_KEY=" in content and "srk-123" in content
    assert "EMBEDDER_URL=" in content and "embedder:18801" in content
    assert "CUSTOM_TOKEN=" in content and "my-token" in content


def test_bridge_shells_out_to_paste_api_key(monkeypatch):
    """openclaw 5.x: provider keys are bridged via `openclaw models auth
    paste-api-key --provider <p>` (key on stdin, NO --agent flag)."""
    import subprocess

    import secrets_sync as ss

    runs = []
    stdins = []

    def fake_run(args, **kwargs):
        runs.append(list(args))
        stdins.append(kwargs.get("input"))
        return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    restarted = []
    monkeypatch.setattr(ss, "_reload_gateway_auth", lambda: restarted.append(True))

    ss._sync_provider_keys_to_auth_profiles({"OPENAI_API_KEY": "sk-test"})

    paste = [r for r in runs if r[:4] == ["openclaw", "models", "auth", "paste-api-key"]]
    assert paste, f"expected paste-api-key, got {runs}"
    assert "--provider" in paste[0] and "openai" in paste[0]
    assert "--agent" not in paste[0]
    assert "sk-test\n" in stdins
    assert restarted == [True], "gateway should reload after a new key"


def test_bridge_is_noop_when_key_unchanged(monkeypatch):
    """The 5-minute re-sync must NOT re-run paste-api-key or restart the
    gateway when the key hasn't changed (cache hit)."""
    import subprocess

    import secrets_sync as ss

    calls = {"runs": 0, "restarts": 0}

    def fake_run(args, **kwargs):
        calls["runs"] += 1
        return subprocess.CompletedProcess(args, 0, stdout="ok", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)
    monkeypatch.setattr(ss, "_reload_gateway_auth", lambda: calls.__setitem__("restarts", calls["restarts"] + 1))

    # First sync writes + restarts.
    ss._sync_provider_keys_to_auth_profiles({"OPENAI_API_KEY": "sk-test"})
    assert calls["runs"] == 1 and calls["restarts"] == 1
    # Second sync with the SAME key is a no-op (cache hit).
    ss._sync_provider_keys_to_auth_profiles({"OPENAI_API_KEY": "sk-test"})
    assert calls["runs"] == 1, "unchanged key should not re-run paste-api-key"
    assert calls["restarts"] == 1, "unchanged key should not restart gateway"


def test_bridge_reruns_when_key_changes(monkeypatch):
    """A changed key value re-runs paste-api-key and restarts the gateway."""
    import subprocess

    import secrets_sync as ss

    calls = {"runs": 0, "restarts": 0}
    monkeypatch.setattr(
        subprocess,
        "run",
        lambda args, **k: (calls.__setitem__("runs", calls["runs"] + 1), subprocess.CompletedProcess(args, 0, "", ""))[
            1
        ],
    )
    monkeypatch.setattr(ss, "_reload_gateway_auth", lambda: calls.__setitem__("restarts", calls["restarts"] + 1))

    ss._sync_provider_keys_to_auth_profiles({"OPENAI_API_KEY": "sk-old"})
    ss._sync_provider_keys_to_auth_profiles({"OPENAI_API_KEY": "sk-new"})
    assert calls["runs"] == 2 and calls["restarts"] == 2
