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
    import inbox_dispatcher as mod

    with tracker.lock:
        tracker.last_wake["agent-1"] = time.time()

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "cooldown"


def test_should_wake_returns_false_when_wake_in_flight(tracker, monkeypatch):
    import inbox_dispatcher as mod

    with tracker.lock:
        tracker.wake_in_flight["agent-1"] = True

    should, reason = tracker.should_wake("agent-1", "uuid-1")
    assert should is False
    assert reason == "wake_in_flight"


def test_wake_agent_passes_model_and_thinking_overrides(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(mod, "WORKSPACE_SLUG", "ws")

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
    assert "ws/agent-1" in cmd


def test_wake_agent_without_overrides(monkeypatch):
    import inbox_dispatcher as mod

    monkeypatch.setattr(mod, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(mod, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(mod, "WORKSPACE_SLUG", "ws")

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
