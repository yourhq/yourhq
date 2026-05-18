import json
import logging

import pytest


def test_plugin_event_construction():
    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="evt-1",
        event_type="task.created",
        occurred_at="2025-01-01T00:00:00Z",
        tenant_id="t-1",
        entity_type="task",
        entity_id="task-1",
        payload={"title": "My Task"},
    )

    assert event.event_id == "evt-1"
    assert event.event_type == "task.created"
    assert event.occurred_at == "2025-01-01T00:00:00Z"
    assert event.tenant_id == "t-1"
    assert event.entity_type == "task"
    assert event.entity_id == "task-1"
    assert event.payload == {"title": "My Task"}


def test_plugin_event_defaults():
    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="e",
        event_type="test",
        occurred_at="now",
        tenant_id="t",
    )

    assert event.entity_type is None
    assert event.entity_id is None
    assert event.payload == {}


def test_plugin_event_to_dict():
    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="evt-1",
        event_type="task.created",
        occurred_at="2025-01-01",
        tenant_id="t-1",
        entity_type="task",
        entity_id="task-1",
        payload={"key": "value"},
    )

    d = event.to_dict()
    assert isinstance(d, dict)
    assert d["event_id"] == "evt-1"
    assert d["event_type"] == "task.created"
    assert d["entity_type"] == "task"
    assert d["payload"] == {"key": "value"}


def test_plugin_event_to_dict_is_json_serializable():
    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="e",
        event_type="test",
        occurred_at="now",
        tenant_id="t",
        payload={"nested": {"list": [1, 2, 3]}},
    )

    serialized = json.dumps(event.to_dict())
    deserialized = json.loads(serialized)
    assert deserialized["payload"]["nested"]["list"] == [1, 2, 3]


def test_plugin_response_defaults():
    from gateway.plugins.sdk import PluginResponse

    resp = PluginResponse()
    assert resp.data is None
    assert resp.log_message is None


def test_plugin_response_with_data():
    from gateway.plugins.sdk import PluginResponse

    resp = PluginResponse(data={"result": "ok"}, log_message="processed")
    assert resp.data == {"result": "ok"}
    assert resp.log_message == "processed"


def test_state_client_get_builds_correct_url(monkeypatch):
    from gateway.plugins.sdk import StateClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["headers"] = dict(req.headers)

        class Resp:
            def read(self):
                return json.dumps([{"state_value": "stored-val"}]).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("my-plugin", "tenant-1", "https://sb.co", "key-1")
    result = client.get("my_key")

    assert result == "stored-val"
    assert "my-plugin" in captured["url"]
    assert "my_key" in captured["url"]
    assert "tenant-1" in captured["url"]


def test_state_client_get_returns_none_on_empty(monkeypatch):
    from gateway.plugins.sdk import StateClient

    def fake_urlopen(req, timeout=None):
        class Resp:
            def read(self):
                return json.dumps([]).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    assert client.get("missing_key") is None


def test_state_client_get_returns_none_on_error(monkeypatch):
    from gateway.plugins.sdk import StateClient

    def failing_urlopen(req, timeout=None):
        raise ConnectionError("down")

    monkeypatch.setattr("urllib.request.urlopen", failing_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    assert client.get("key") is None


def test_state_client_set_sends_post(monkeypatch):
    from gateway.plugins.sdk import StateClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["data"] = json.loads(req.data.decode())

        class Resp:
            def read(self):
                return b""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("my-plugin", "tenant-1", "https://sb.co", "key-1")
    client.set("counter", 42)

    assert captured["method"] == "POST"
    assert captured["data"]["plugin_id"] == "my-plugin"
    assert captured["data"]["state_key"] == "counter"
    assert captured["data"]["state_value"] == "42"


def test_state_client_set_with_scope(monkeypatch):
    from gateway.plugins.sdk import StateClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["data"] = json.loads(req.data.decode())

        class Resp:
            def read(self):
                return b""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    client.set("key", "val", scope_kind="agent", scope_id="agent-1")

    assert captured["data"]["scope_kind"] == "agent"
    assert captured["data"]["scope_id"] == "agent-1"


def test_state_client_set_string_value_not_json_encoded(monkeypatch):
    from gateway.plugins.sdk import StateClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["data"] = json.loads(req.data.decode())

        class Resp:
            def read(self):
                return b""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    client.set("key", "already-a-string")

    assert captured["data"]["state_value"] == "already-a-string"


def test_state_client_set_swallows_error(monkeypatch):
    from gateway.plugins.sdk import StateClient

    def failing_urlopen(req, timeout=None):
        raise ConnectionError("down")

    monkeypatch.setattr("urllib.request.urlopen", failing_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    client.set("key", "val")


def test_state_client_delete_sends_delete(monkeypatch):
    from gateway.plugins.sdk import StateClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["method"] = req.get_method()
        captured["url"] = req.full_url

        class Resp:
            def read(self):
                return b""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = StateClient("my-plugin", "t", "https://sb.co", "k")
    client.delete("old_key")

    assert captured["method"] == "DELETE"
    assert "old_key" in captured["url"]


def test_state_client_delete_swallows_error(monkeypatch):
    from gateway.plugins.sdk import StateClient

    def failing_urlopen(req, timeout=None):
        raise ConnectionError("down")

    monkeypatch.setattr("urllib.request.urlopen", failing_urlopen)

    client = StateClient("p", "t", "https://sb.co", "k")
    client.delete("key")


def test_secrets_client_resolve_from_env_file(tmp_path, monkeypatch):
    from gateway.plugins.sdk import SecretsClient

    env_file = tmp_path / "gateway.env"
    env_file.write_text("MY_SECRET='secret_value'\nOTHER='other_val'\n")

    client = SecretsClient("t-1", "gw-1")
    client._secrets_dir = str(tmp_path)

    result = client.resolve("MY_SECRET")
    assert result == "secret_value"


def test_secrets_client_resolve_fallback_to_env(tmp_path, monkeypatch):
    from gateway.plugins.sdk import SecretsClient

    client = SecretsClient("t-1", "gw-1")
    client._secrets_dir = str(tmp_path / "nonexistent")

    monkeypatch.setenv("FALLBACK_KEY", "env_value")
    result = client.resolve("FALLBACK_KEY")
    assert result == "env_value"


def test_secrets_client_resolve_missing_returns_none(tmp_path, monkeypatch):
    from gateway.plugins.sdk import SecretsClient

    client = SecretsClient("t-1", "gw-1")
    client._secrets_dir = str(tmp_path / "nonexistent")

    monkeypatch.delenv("MISSING_KEY", raising=False)
    result = client.resolve("MISSING_KEY")
    assert result is None


def test_supabase_client_query(monkeypatch):
    from gateway.plugins.sdk import SupabaseClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url

        class Resp:
            def read(self):
                return json.dumps([{"id": "1", "name": "test"}]).encode()

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = SupabaseClient("https://sb.co", "key", "tenant-1")
    result = client.query("tasks", {"status": "eq.active"})

    assert len(result) == 1
    assert result[0]["name"] == "test"
    assert "tenant-1" in captured["url"]
    assert "tasks" in captured["url"]


def test_supabase_client_query_returns_empty_on_error(monkeypatch):
    from gateway.plugins.sdk import SupabaseClient

    def failing_urlopen(req, timeout=None):
        raise ConnectionError("down")

    monkeypatch.setattr("urllib.request.urlopen", failing_urlopen)

    client = SupabaseClient("https://sb.co", "key", "t")
    assert client.query("tasks") == []


def test_supabase_client_adds_tenant_id_default(monkeypatch):
    from gateway.plugins.sdk import SupabaseClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url

        class Resp:
            def read(self):
                return b"[]"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = SupabaseClient("https://sb.co", "key", "my-tenant")
    client.query("agents")

    assert "tenant_id=eq.my-tenant" in captured["url"]


def test_supabase_client_respects_custom_tenant_filter(monkeypatch):
    from gateway.plugins.sdk import SupabaseClient

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url

        class Resp:
            def read(self):
                return b"[]"

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return Resp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    client = SupabaseClient("https://sb.co", "key", "my-tenant")
    client.query("agents", {"tenant_id": "eq.other-tenant"})

    assert "eq.other-tenant" in captured["url"]
    assert "eq.my-tenant" not in captured["url"]


def test_plugin_context_construction():
    from gateway.plugins.sdk import PluginContext, SecretsClient, StateClient, SupabaseClient

    state = StateClient("p", "t", "https://sb.co", "k")
    secrets = SecretsClient("t", "gw")
    supabase = SupabaseClient("https://sb.co", "k", "t")
    logger = logging.getLogger("test")

    ctx = PluginContext(
        config={"setting": True},
        state=state,
        secrets=secrets,
        supabase=supabase,
        logger=logger,
    )

    assert ctx.config == {"setting": True}
    assert ctx.state is state
    assert ctx.secrets is secrets
    assert ctx.supabase is supabase
    assert ctx.logger is logger


def test_base_plugin_abstract():
    from gateway.plugins.sdk import BasePlugin

    with pytest.raises(TypeError):
        BasePlugin(None)


def test_base_plugin_subclass():
    from gateway.plugins.sdk import (
        BasePlugin,
        PluginContext,
        PluginEvent,
        PluginResponse,
        SecretsClient,
        StateClient,
        SupabaseClient,
    )

    class MyPlugin(BasePlugin):
        def on_event(self, event):
            return PluginResponse(data={"handled": True})

    ctx = PluginContext(
        config={},
        state=StateClient("p", "t", "https://sb.co", "k"),
        secrets=SecretsClient("t", "gw"),
        supabase=SupabaseClient("https://sb.co", "k", "t"),
        logger=logging.getLogger("test"),
    )

    plugin = MyPlugin(ctx)
    event = PluginEvent(event_id="e", event_type="test", occurred_at="now", tenant_id="t")
    result = plugin.on_event(event)

    assert result.data == {"handled": True}


def test_base_plugin_on_configure():
    from gateway.plugins.sdk import (
        BasePlugin,
        PluginContext,
        SecretsClient,
        StateClient,
        SupabaseClient,
    )

    class MyPlugin(BasePlugin):
        def on_event(self, event):
            return None

    ctx = PluginContext(
        config={"old": True},
        state=StateClient("p", "t", "https://sb.co", "k"),
        secrets=SecretsClient("t", "gw"),
        supabase=SupabaseClient("https://sb.co", "k", "t"),
        logger=logging.getLogger("test"),
    )

    plugin = MyPlugin(ctx)
    assert plugin.ctx.config == {"old": True}

    plugin.on_configure({"new": True})
    assert plugin.ctx.config == {"new": True}


def test_base_plugin_health():
    from gateway.plugins.sdk import BasePlugin, PluginContext, SecretsClient, StateClient, SupabaseClient

    class MyPlugin(BasePlugin):
        def on_event(self, event):
            return None

    ctx = PluginContext(
        config={},
        state=StateClient("p", "t", "https://sb.co", "k"),
        secrets=SecretsClient("t", "gw"),
        supabase=SupabaseClient("https://sb.co", "k", "t"),
        logger=logging.getLogger("test"),
    )

    plugin = MyPlugin(ctx)
    assert plugin.health() == {"status": "ok"}


def test_base_plugin_on_shutdown():
    from gateway.plugins.sdk import BasePlugin, PluginContext, SecretsClient, StateClient, SupabaseClient

    class MyPlugin(BasePlugin):
        def __init__(self, ctx):
            super().__init__(ctx)
            self.shutdown_called = False

        def on_event(self, event):
            return None

        def on_shutdown(self):
            self.shutdown_called = True

    ctx = PluginContext(
        config={},
        state=StateClient("p", "t", "https://sb.co", "k"),
        secrets=SecretsClient("t", "gw"),
        supabase=SupabaseClient("https://sb.co", "k", "t"),
        logger=logging.getLogger("test"),
    )

    plugin = MyPlugin(ctx)
    plugin.on_shutdown()
    assert plugin.shutdown_called
