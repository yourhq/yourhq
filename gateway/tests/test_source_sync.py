import pytest


def test_unknown_provider_marks_connection_error(monkeypatch):
    import source_sync

    monkeypatch.setattr(source_sync, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(source_sync, "SUPABASE_KEY", "test-key")

    patched_requests = []

    def fake_request(method, path, data=None, params=None):
        patched_requests.append((method, path, data, params))
        if method == "POST" and "source_sync_runs" in path:
            return [{"id": "run-1"}]
        if method == "GET" and "knowledge_items" in path:
            return []
        return None

    monkeypatch.setattr(source_sync, "supabase_request", fake_request)
    monkeypatch.setattr(source_sync, "supabase_rpc", lambda fn, params: None)

    from connectors.registry import CONNECTORS
    monkeypatch.setattr("connectors.registry.CONNECTORS", {})
    monkeypatch.setattr("connectors.registry._discovered", True)

    connection = {
        "id": "conn-123",
        "provider": "nonexistent_provider",
        "sync_interval_hours": 6,
        "credentials": {},
    }

    monkeypatch.setattr(source_sync, "_load_gateway_secrets", lambda: {})

    source_sync.sync_connection(connection)

    error_patch = [r for r in patched_requests if r[0] == "PATCH" and "source_connections" in r[1]]
    assert len(error_patch) == 1
    assert error_patch[0][2]["status"] == "error"
    assert "Unknown provider" in error_patch[0][2]["error_message"]


def test_resolve_config_uses_cfg_url(monkeypatch):
    """Validates the bug fix: resolve_config must use cfg.url, not cfg.supabase_url."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import source_sync

    class FakeConfig:
        url = "https://resolved.supabase.co"
        service_role_key = "resolved-key"
        source = "registry"

    monkeypatch.setattr(source_sync, "resolve_hq_config", lambda: FakeConfig())

    result = source_sync.resolve_config()
    assert result is True
    assert source_sync.SUPABASE_URL == "https://resolved.supabase.co"
    assert source_sync.SUPABASE_KEY == "resolved-key"


def test_resolve_config_from_env(monkeypatch):
    import source_sync

    monkeypatch.setenv("SUPABASE_URL", "https://env.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "env-key")

    result = source_sync.resolve_config()
    assert result is True
    assert source_sync.SUPABASE_URL == "https://env.supabase.co"


def test_resolve_config_returns_false_when_empty(monkeypatch):
    import source_sync

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(source_sync, "resolve_hq_config", None)

    result = source_sync.resolve_config()
    assert result is False
