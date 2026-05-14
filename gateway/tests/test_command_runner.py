import os
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
