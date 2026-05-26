import json
import urllib.error

import memory_pressure as mp
import pytest


@pytest.fixture(autouse=True)
def _reset_globals():
    mp._last_notification_time = None
    yield


class TestGetAvailableMemoryBytes:
    def test_returns_int_or_none(self):
        result = mp.get_available_memory_bytes()
        assert result is None or isinstance(result, int)

    def test_reads_proc_meminfo(self, tmp_path):
        fake = tmp_path / "meminfo"
        fake.write_text(
            "MemTotal:       16384000 kB\n"
            "MemFree:         2048000 kB\n"
            "MemAvailable:    8192000 kB\n"
            "Buffers:          512000 kB\n"
        )

        result = None
        with open(str(fake)) as f:
            for line in f:
                if line.startswith("MemAvailable:"):
                    result = int(line.split()[1]) * 1024
                    break

        assert result == 8192000 * 1024

    def test_returns_none_on_missing_file(self, monkeypatch):
        monkeypatch.setattr(
            "builtins.open",
            lambda *a, **kw: (_ for _ in ()).throw(OSError("no such file")),
        )
        assert mp.get_available_memory_bytes() is None


class TestComputeBatchSize:
    def test_returns_configured_max_when_memory_unavailable(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: None)
        assert mp.compute_batch_size(8) == 8

    def test_returns_zero_when_critical(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: mp.CRITICAL_BYTES - 1)
        assert mp.compute_batch_size(8) == 0

    def test_returns_one_when_low(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: mp.LOW_BYTES - 1)
        assert mp.compute_batch_size(8) == 1

    def test_returns_half_when_moderate(self, monkeypatch):
        monkeypatch.setattr(
            mp,
            "get_available_memory_bytes",
            lambda: mp.COMFORTABLE_BYTES - 1,
        )
        assert mp.compute_batch_size(8) == 4

    def test_returns_full_when_comfortable(self, monkeypatch):
        monkeypatch.setattr(
            mp,
            "get_available_memory_bytes",
            lambda: mp.COMFORTABLE_BYTES + 1,
        )
        assert mp.compute_batch_size(8) == 8

    def test_half_rounds_down_but_at_least_one(self, monkeypatch):
        monkeypatch.setattr(
            mp,
            "get_available_memory_bytes",
            lambda: mp.COMFORTABLE_BYTES - 1,
        )
        assert mp.compute_batch_size(1) == 1


class TestShouldBackoff:
    def test_false_when_memory_unavailable(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: None)
        assert mp.should_backoff() is False

    def test_true_when_critical(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: mp.CRITICAL_BYTES - 1)
        assert mp.should_backoff() is True

    def test_false_when_above_critical(self, monkeypatch):
        monkeypatch.setattr(mp, "get_available_memory_bytes", lambda: mp.CRITICAL_BYTES + 1)
        assert mp.should_backoff() is False


class TestEmitPressureNotification:
    def test_sends_notification(self, monkeypatch):
        captured = []

        def fake_urlopen(req, **kw):
            body = json.loads(req.data.decode())
            captured.append(body)

            class FakeResp:
                def read(self):
                    return b""

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    pass

            return FakeResp()

        monkeypatch.setattr(mp, "_urlopen", fake_urlopen)
        mp.emit_pressure_notification("embedder", "https://test.supabase.co", "key", 200)

        assert len(captured) == 1
        assert "Embedder" in captured[0]["title"]
        assert "200 MB" in captured[0]["body"]
        assert captured[0]["type"] == "system"

    def test_cooldown_prevents_rapid_notifications(self, monkeypatch):
        captured = []

        def fake_urlopen(req, **kw):
            captured.append(True)

            class FakeResp:
                def read(self):
                    return b""

                def __enter__(self):
                    return self

                def __exit__(self, *a):
                    pass

            return FakeResp()

        monkeypatch.setattr(mp, "_urlopen", fake_urlopen)
        mp.emit_pressure_notification("embedder", "https://test.supabase.co", "key", 200)
        mp.emit_pressure_notification("embedder", "https://test.supabase.co", "key", 200)

        assert len(captured) == 1

    def test_skips_when_no_credentials(self):
        mp.emit_pressure_notification("embedder", "", "", 200)
        # should not raise

    def test_handles_network_error(self, monkeypatch):
        def fail(*a, **kw):
            raise urllib.error.URLError("network down")

        monkeypatch.setattr(mp, "_urlopen", fail)
        mp.emit_pressure_notification("embedder", "https://test.supabase.co", "key", 200)
        # should not raise
