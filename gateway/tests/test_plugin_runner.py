import hashlib
import hmac
import json
import os
import sys
import pytest


@pytest.fixture(autouse=True)
def _patch_plugin_runner_globals(monkeypatch):
    import plugin_runner as pr

    monkeypatch.setattr(pr, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(pr, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(pr, "GATEWAY_ID", "test-gw")
    monkeypatch.setattr(pr, "TENANT_ID", "00000000-0000-0000-0000-000000000000")
    monkeypatch.setattr(pr, "PLUGINS", {})


def test_dispatch_event_routes_to_matching_hooks(monkeypatch):
    import plugin_runner as pr

    dispatched = []

    class FakeHandler:
        def on_event(self, event):
            dispatched.append(event.event_type)
            return None

    pr.PLUGINS = {
        "p1": {
            "type": "local",
            "handler": FakeHandler(),
            "hooks": {"task.created", "task.updated"},
            "name": "Plugin 1",
        },
        "p2": {
            "type": "local",
            "handler": FakeHandler(),
            "hooks": {"agent.created"},
            "name": "Plugin 2",
        },
    }

    monkeypatch.setattr(pr, "record_plugin_event", lambda *a, **kw: None)
    pr.dispatch_event("task.created", "task", "t-1", {"title": "Test"})

    assert dispatched == ["task.created"]


def test_dispatch_event_skips_unsubscribed_plugins(monkeypatch):
    import plugin_runner as pr

    dispatched = []

    class FakeHandler:
        def on_event(self, event):
            dispatched.append(event.event_type)
            return None

    pr.PLUGINS = {
        "p1": {
            "type": "local",
            "handler": FakeHandler(),
            "hooks": {"agent.created"},
            "name": "Plugin 1",
        },
    }

    monkeypatch.setattr(pr, "record_plugin_event", lambda *a, **kw: None)
    pr.dispatch_event("task.created", "task", "t-1", {})

    assert dispatched == []


def test_dispatch_event_multiple_plugins_receive_same_event(monkeypatch):
    import plugin_runner as pr

    dispatched = []

    class FakeHandler:
        def __init__(self, pid):
            self.pid = pid

        def on_event(self, event):
            dispatched.append(self.pid)
            return None

    pr.PLUGINS = {
        "p1": {"type": "local", "handler": FakeHandler("p1"), "hooks": {"task.created"}, "name": "P1"},
        "p2": {"type": "local", "handler": FakeHandler("p2"), "hooks": {"task.created"}, "name": "P2"},
    }

    monkeypatch.setattr(pr, "record_plugin_event", lambda *a, **kw: None)
    pr.dispatch_event("task.created", "task", "t-1", {})

    assert "p1" in dispatched
    assert "p2" in dispatched


def test_dispatch_event_error_isolation(monkeypatch):
    import plugin_runner as pr

    results = []

    class CrashingHandler:
        def on_event(self, event):
            raise RuntimeError("plugin crash")

    class GoodHandler:
        def on_event(self, event):
            results.append("ok")
            return None

    pr.PLUGINS = {
        "crash": {"type": "local", "handler": CrashingHandler(), "hooks": {"task.created"}, "name": "Crash"},
        "good": {"type": "local", "handler": GoodHandler(), "hooks": {"task.created"}, "name": "Good"},
    }

    recorded = []
    monkeypatch.setattr(pr, "record_plugin_event", lambda pid, ev, status, dur=None, **kw: recorded.append((pid, status)))

    pr.dispatch_event("task.created", "task", "t-1", {})

    assert "ok" in results
    error_records = [(pid, s) for pid, s in recorded if s == "error"]
    assert len(error_records) == 1
    assert error_records[0][0] == "crash"


def test_dispatch_webhook_sends_hmac_signature(monkeypatch):
    import plugin_runner as pr

    captured = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        captured["url"] = url
        captured["data"] = data
        captured["headers"] = headers

        class FakeResp:
            status_code = 200

            def raise_for_status(self):
                pass

        return FakeResp()

    monkeypatch.setattr(pr, "http_requests", type("mod", (), {"post": staticmethod(fake_post)})())

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="evt-1",
        event_type="task.created",
        occurred_at="2025-01-01T00:00:00Z",
        tenant_id="t-1",
        entity_type="task",
        entity_id="task-1",
        payload={"title": "Test"},
    )

    entry = {
        "url": "https://example.com/webhook",
        "secret": "my-webhook-secret",
        "hooks": {"task.created"},
        "name": "Test Webhook",
    }

    pr.dispatch_webhook("wp-1", entry, event)

    assert captured["url"] == "https://example.com/webhook"
    assert captured["headers"]["Content-Type"] == "application/json"
    assert captured["headers"]["X-HQ-Event"] == "task.created"
    assert captured["headers"]["X-HQ-Plugin-Id"] == "wp-1"

    expected_sig = hmac.new(
        b"my-webhook-secret",
        captured["data"].encode(),
        hashlib.sha256,
    ).hexdigest()
    assert captured["headers"]["X-HQ-Signature"] == f"sha256={expected_sig}"


def test_dispatch_webhook_no_secret_omits_signature(monkeypatch):
    import plugin_runner as pr

    captured = {}

    def fake_post(url, data=None, headers=None, timeout=None):
        captured["headers"] = headers

        class FakeResp:
            status_code = 200

            def raise_for_status(self):
                pass

        return FakeResp()

    monkeypatch.setattr(pr, "http_requests", type("mod", (), {"post": staticmethod(fake_post)})())

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="evt-2",
        event_type="task.created",
        occurred_at="2025-01-01T00:00:00Z",
        tenant_id="t-1",
    )

    entry = {"url": "https://example.com/hook", "secret": None, "hooks": {"task.created"}, "name": "NoSec"}
    pr.dispatch_webhook("wp-2", entry, event)

    assert "X-HQ-Signature" not in captured["headers"]


def test_dispatch_webhook_raises_on_missing_url():
    import plugin_runner as pr

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(event_id="e", event_type="x", occurred_at="now", tenant_id="t")
    with pytest.raises(ValueError, match="No webhook URL"):
        pr.dispatch_webhook("p", {"url": None, "secret": None}, event)


def test_dispatch_webhook_falls_back_to_urllib(monkeypatch):
    import plugin_runner as pr

    monkeypatch.setattr(pr, "http_requests", None)

    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()

        class FakeResp:
            def read(self):
                return b""

            def __enter__(self):
                return self

            def __exit__(self, *a):
                pass

        return FakeResp()

    monkeypatch.setattr("urllib.request.urlopen", fake_urlopen)

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(event_id="e", event_type="test", occurred_at="now", tenant_id="t")
    entry = {"url": "https://example.com/hook", "secret": None}
    pr.dispatch_webhook("p", entry, event)

    assert captured["url"] == "https://example.com/hook"
    assert captured["method"] == "POST"


def test_record_plugin_event_posts_to_api(monkeypatch):
    import plugin_runner as pr

    posted = []
    monkeypatch.setattr(pr, "api_post", lambda table, body: posted.append((table, body)))

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(
        event_id="evt-1",
        event_type="task.created",
        occurred_at="now",
        tenant_id="t-1",
        entity_type="task",
        entity_id="task-1",
    )

    pr.record_plugin_event("p1", event, "success", duration_ms=42)

    assert len(posted) == 1
    assert posted[0][0] == "hq_plugin_events"
    body = posted[0][1]
    assert body["plugin_id"] == "p1"
    assert body["hook"] == "task.created"
    assert body["status"] == "success"
    assert body["duration_ms"] == 42


def test_record_plugin_event_truncates_error(monkeypatch):
    import plugin_runner as pr

    posted = []
    monkeypatch.setattr(pr, "api_post", lambda table, body: posted.append(body))

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(event_id="e", event_type="x", occurred_at="now", tenant_id="t")
    long_error = "x" * 2000
    pr.record_plugin_event("p", event, "error", error_message=long_error)

    assert len(posted[0]["error_message"]) <= 1000


def test_record_plugin_event_swallows_api_failure(monkeypatch):
    import plugin_runner as pr

    def failing_post(table, body):
        raise ConnectionError("network down")

    monkeypatch.setattr(pr, "api_post", failing_post)

    from gateway.plugins.sdk import PluginEvent

    event = PluginEvent(event_id="e", event_type="x", occurred_at="now", tenant_id="t")
    pr.record_plugin_event("p", event, "success")


def test_process_event_queue_dispatches_and_marks_processed(monkeypatch):
    import plugin_runner as pr

    dispatched = []
    patched = []

    monkeypatch.setattr(
        pr,
        "api_get",
        lambda table, params: [
            {
                "id": "eq-1",
                "event_type": "task.created",
                "entity_type": "task",
                "entity_id": "t-1",
                "payload": {"title": "A"},
                "processed": False,
            }
        ],
    )

    original_dispatch = pr.dispatch_event
    monkeypatch.setattr(
        pr,
        "dispatch_event",
        lambda et, ent_type, ent_id, payload: dispatched.append(et),
    )
    monkeypatch.setattr(
        pr,
        "api_patch",
        lambda table, filters, payload: patched.append((table, filters, payload)),
    )

    count = pr.process_event_queue()
    assert count == 1
    assert dispatched == ["task.created"]
    assert len(patched) == 1
    assert patched[0][2] == {"processed": True}


def test_process_event_queue_returns_zero_on_empty(monkeypatch):
    import plugin_runner as pr

    monkeypatch.setattr(pr, "api_get", lambda table, params: [])
    assert pr.process_event_queue() == 0


def test_process_event_queue_handles_api_failure(monkeypatch):
    import plugin_runner as pr

    def failing_get(table, params):
        raise ConnectionError("down")

    monkeypatch.setattr(pr, "api_get", failing_get)
    assert pr.process_event_queue() == 0


def test_process_event_queue_multiple_events(monkeypatch):
    import plugin_runner as pr

    events = [
        {"id": "eq-1", "event_type": "task.created", "entity_type": "task", "entity_id": "t-1", "payload": {}},
        {"id": "eq-2", "event_type": "agent.created", "entity_type": "agent", "entity_id": "a-1", "payload": {}},
    ]

    dispatched = []
    monkeypatch.setattr(pr, "api_get", lambda table, params: events)
    monkeypatch.setattr(pr, "dispatch_event", lambda *a: dispatched.append(a[0]))
    monkeypatch.setattr(pr, "api_patch", lambda *a, **kw: None)

    count = pr.process_event_queue()
    assert count == 2
    assert "task.created" in dispatched
    assert "agent.created" in dispatched


def test_load_plugins_fetches_enabled(monkeypatch):
    import plugin_runner as pr

    monkeypatch.setattr(
        pr,
        "api_get",
        lambda table, params: [
            {
                "plugin_id": "wh-1",
                "name": "Webhook Plugin",
                "source": "webhook",
                "hooks": ["task.created"],
                "entry_module": None,
                "webhook_url": "https://hook.example.com",
                "webhook_secret": "sec",
                "config": {},
                "capabilities": [],
            }
        ],
    )

    pr.load_plugins()
    assert "wh-1" in pr.PLUGINS
    assert pr.PLUGINS["wh-1"]["type"] == "webhook"
    assert pr.PLUGINS["wh-1"]["url"] == "https://hook.example.com"
    assert "task.created" in pr.PLUGINS["wh-1"]["hooks"]


def test_load_plugins_calls_on_shutdown_for_removed(monkeypatch):
    import plugin_runner as pr

    shutdown_called = []

    class FakeOldHandler:
        def on_shutdown(self):
            shutdown_called.append(True)

    pr.PLUGINS = {
        "old-plugin": {
            "type": "local",
            "handler": FakeOldHandler(),
            "hooks": set(),
            "name": "Old",
        }
    }

    monkeypatch.setattr(pr, "api_get", lambda table, params: [])
    pr.load_plugins()

    assert len(shutdown_called) == 1
    assert "old-plugin" not in pr.PLUGINS


def test_load_plugins_handles_api_failure(monkeypatch):
    import plugin_runner as pr

    pr.PLUGINS = {"existing": {"type": "webhook", "url": "x", "hooks": set(), "name": "X"}}

    def failing_get(table, params):
        raise ConnectionError("down")

    monkeypatch.setattr(pr, "api_get", failing_get)
    pr.load_plugins()

    assert "existing" in pr.PLUGINS


def test_plugin_listener_ws_url(monkeypatch):
    import plugin_runner as pr

    monkeypatch.setattr(pr, "SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setattr(pr, "SUPABASE_KEY", "my-key")

    listener = pr.PluginListener()
    url = listener._ws_url()
    assert url.startswith("wss://abc.supabase.co/realtime/v1/websocket")
    assert "apikey=my-key" in url


def test_plugin_listener_next_ref_increments():
    import plugin_runner as pr

    listener = pr.PluginListener()
    assert listener._next_ref() == "1"
    assert listener._next_ref() == "2"
    assert listener._next_ref() == "3"


def test_plugin_listener_on_message_plugin_config_change(monkeypatch):
    import plugin_runner as pr

    reload_called = []
    monkeypatch.setattr(pr, "load_plugins", lambda: reload_called.append(True))

    listener = pr.PluginListener()
    raw = json.dumps({
        "event": "postgres_changes",
        "payload": {
            "data": {
                "table": "hq_plugins",
                "type": "UPDATE",
            }
        },
    })
    listener._on_message(None, raw)
    assert len(reload_called) == 1


def test_plugin_listener_on_message_event_queue_insert(monkeypatch):
    import plugin_runner as pr

    processed = []
    monkeypatch.setattr(pr, "process_event_queue", lambda: (processed.append(True), 1)[1])

    listener = pr.PluginListener()
    raw = json.dumps({
        "event": "postgres_changes",
        "payload": {
            "data": {
                "table": "hq_plugin_event_queue",
                "type": "INSERT",
            }
        },
    })
    listener._on_message(None, raw)
    assert len(processed) == 1


def test_plugin_listener_on_message_ignores_malformed(monkeypatch):
    import plugin_runner as pr

    listener = pr.PluginListener()
    listener._on_message(None, "not-json")
    listener._on_message(None, json.dumps({"event": "heartbeat"}))


def test_dispatch_event_constructs_plugin_event_correctly(monkeypatch):
    import plugin_runner as pr

    captured_event = []

    class CapturingHandler:
        def on_event(self, event):
            captured_event.append(event)
            return None

    pr.PLUGINS = {
        "p1": {"type": "local", "handler": CapturingHandler(), "hooks": {"task.created"}, "name": "Cap"},
    }
    monkeypatch.setattr(pr, "record_plugin_event", lambda *a, **kw: None)

    pr.dispatch_event("task.created", "task", "t-123", {"title": "Hello"})

    assert len(captured_event) == 1
    evt = captured_event[0]
    assert evt.event_type == "task.created"
    assert evt.entity_type == "task"
    assert evt.entity_id == "t-123"
    assert evt.payload == {"title": "Hello"}
    assert evt.tenant_id == "00000000-0000-0000-0000-000000000000"
    assert evt.event_id
