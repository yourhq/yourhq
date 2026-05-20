import subprocess

import pytest
from tests.helpers.subprocess_stubs import FakePopen


@pytest.fixture
def tracker():
    from inbox_dispatcher import WakeTracker

    return WakeTracker(cooldown_seconds=30)


def test_should_wake_returns_false_for_paused_agent(tracker, monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    def fake_api_get(table, params):
        if "agents" in table:
            return [{"status": "paused"}]
        if "agent_inbox_items" in table:
            return []
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "agent_paused"


def test_should_wake_returns_false_for_hibernating_agent(tracker, monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    def fake_api_get(table, params):
        if "agents" in table:
            return [{"status": "hibernating"}]
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "agent_paused"


def test_should_wake_returns_false_when_budget_hard_exceeded(tracker, monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    def fake_api_get(table, params):
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return [{"status": "exceeded", "hard_cutoff": True}]
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "budget_exceeded"


def test_should_wake_returns_false_during_cooldown(tracker, monkeypatch):
    import time

    with tracker.lock:
        tracker.last_wake["agent-1"] = time.time()

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "cooldown"


def test_should_wake_returns_false_when_wake_in_flight(tracker, monkeypatch):

    with tracker.lock:
        tracker.wake_in_flight["agent-1"] = True

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "wake_in_flight"


def test_wake_agent_passes_model_and_thinking_overrides(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")
    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)

    def always_wake(table, params):
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", always_wake)

    mod.wake_agent(
        "agent-1",
        "uuid-1",
        "test reason",
        tracker,
        context={"model_override": "gpt-5", "thinking_override": "high"},
    )

    assert len(captured_args) == 1
    cmd = captured_args[0]
    assert "--model" in cmd
    assert "gpt-5" in cmd
    assert "--thinking" in cmd
    assert "high" in cmd
    assert "--agent" in cmd
    assert "agent-1" in cmd


def test_wake_agent_without_overrides(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)

    def always_wake(table, params):
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", always_wake)

    mod.wake_agent("agent-1", "uuid-1", "test reason", tracker)

    assert len(captured_args) == 1
    cmd = captured_args[0]
    assert "--model" not in cmd
    assert "--thinking" not in cmd


def test_handle_new_item_enriches_task_assignment_with_blockers(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")


    with mod.LOCAL_AGENT_IDS_LOCK:
        mod.LOCAL_AGENT_IDS.clear()
        mod.LOCAL_AGENT_IDS.add("uuid-1")

    def fake_api_get(table, params):
        if "task_relations" in table:
            return [
                {
                    "target_task_id": "blocker-1",
                    "tasks": {"title": "Setup DB", "status": "in_progress"},
                },
                {
                    "target_task_id": "blocker-2",
                    "tasks": {"title": "Done Task", "status": "done"},
                },
            ]
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)
    monkeypatch.setattr(mod, "api_patch", lambda *a, **kw: None)

    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    dispatcher = mod.InboxDispatcher(tracker)

    record = {
        "agent_slug": "agent-1",
        "agent_id": "uuid-1",
        "event_type": "task_assignment",
        "summary": "Assigned: Write tests",
        "id": "inbox-1",
        "task_id": "task-1",
    }

    dispatcher._handle_new_item(record)

    assert len(captured_args) == 1
    msg = captured_args[0][captured_args[0].index("--message") + 1]
    assert "1 unresolved blocker" in msg
    assert "Setup DB" in msg
    assert "Done Task" not in msg


def test_handle_new_item_no_blockers_no_enrichment(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")


    with mod.LOCAL_AGENT_IDS_LOCK:
        mod.LOCAL_AGENT_IDS.clear()
        mod.LOCAL_AGENT_IDS.add("uuid-1")

    def fake_api_get(table, params):
        if "task_relations" in table:
            return []
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)
    monkeypatch.setattr(mod, "api_patch", lambda *a, **kw: None)

    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    dispatcher = mod.InboxDispatcher(tracker)

    record = {
        "agent_slug": "agent-1",
        "agent_id": "uuid-1",
        "event_type": "task_assignment",
        "summary": "Assigned: Simple task",
        "id": "inbox-2",
        "task_id": "task-2",
    }

    dispatcher._handle_new_item(record)

    assert len(captured_args) == 1
    msg = captured_args[0][captured_args[0].index("--message") + 1]
    assert "unresolved blocker" not in msg


def test_handle_new_item_non_task_assignment_skips_enrichment(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")


    with mod.LOCAL_AGENT_IDS_LOCK:
        mod.LOCAL_AGENT_IDS.clear()
        mod.LOCAL_AGENT_IDS.add("uuid-1")

    task_relation_called = []

    def fake_api_get(table, params):
        if "task_relations" in table:
            task_relation_called.append(True)
            return []
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)
    monkeypatch.setattr(mod, "api_patch", lambda *a, **kw: None)

    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    dispatcher = mod.InboxDispatcher(tracker)

    record = {
        "agent_slug": "agent-1",
        "agent_id": "uuid-1",
        "event_type": "message",
        "summary": "New message",
        "id": "inbox-3",
        "task_id": "task-3",
    }

    dispatcher._handle_new_item(record)

    assert len(task_relation_called) == 0


def test_handle_new_item_ignores_non_local_agent(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    with mod.LOCAL_AGENT_IDS_LOCK:
        mod.LOCAL_AGENT_IDS.clear()
        mod.LOCAL_AGENT_IDS.add("local-uuid")

    refresh_count = []

    def fake_refresh():
        refresh_count.append(True)

    monkeypatch.setattr(mod, "refresh_local_agents", fake_refresh)

    captured_args = []

    def fake_popen(cmd, **kwargs):
        captured_args.append(cmd)
        return FakePopen(args=cmd)

    monkeypatch.setattr(subprocess, "Popen", fake_popen)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    dispatcher = mod.InboxDispatcher(tracker)

    record = {
        "agent_slug": "remote-agent",
        "agent_id": "remote-uuid",
        "event_type": "message",
        "summary": "test",
        "id": "inbox-4",
    }

    dispatcher._handle_new_item(record)

    assert len(captured_args) == 0
    assert len(refresh_count) == 1


def test_should_wake_returns_false_when_no_actionable_work(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    def fake_api_get(table, params):
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return []
            return []
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "no_actionable_work"


def test_should_wake_returns_false_when_active_lease(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")

    def fake_api_get(table, params):
        if "agents" in table:
            return [{"status": "active"}]
        if "agent_inbox_items" in table:
            if "leased" in str(params):
                return [{"id": "leased-item"}]
            return [{"id": "item-1"}]
        if "agent_budgets" in table:
            return []
        return []

    monkeypatch.setattr(mod, "api_get", fake_api_get)

    tracker = mod.WakeTracker(cooldown_seconds=0)
    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "active_lease"


def test_wake_tracker_record_wake_done_success():
    from inbox_dispatcher import WakeTracker

    tracker = WakeTracker(cooldown_seconds=30)
    tracker.record_wake_start("agent-1")
    assert tracker.wake_in_flight.get("agent-1") is True

    tracker.record_wake_done("agent-1", True)
    assert tracker.wake_in_flight.get("agent-1") is False
    assert tracker.last_wake.get("agent-1") is not None


def test_wake_tracker_record_wake_done_failure():
    from inbox_dispatcher import WakeTracker

    tracker = WakeTracker(cooldown_seconds=30)
    tracker.record_wake_start("agent-1")
    tracker.record_wake_done("agent-1", False)
    assert tracker.wake_in_flight.get("agent-1") is False
    assert tracker.last_wake.get("agent-1", 0) == 0


def test_inbox_dispatcher_ws_url(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://abc.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "my-key")

    tracker = mod.WakeTracker(cooldown_seconds=30)
    dispatcher = mod.InboxDispatcher(tracker)
    url = dispatcher._ws_url()
    assert url.startswith("wss://abc.supabase.co")
    assert "apikey=my-key" in url
