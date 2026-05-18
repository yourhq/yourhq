"""Stubs for subprocess.run / subprocess.Popen used by daemon modules."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class FakeCompletedProcess:
    args: list[str] = field(default_factory=list)
    returncode: int = 0
    stdout: str = ""
    stderr: str = ""


@dataclass
class FakePopen:
    """Minimal Popen stub for inbox_dispatcher wake calls."""

    args: list[str] = field(default_factory=list)
    returncode: int | None = 0
    pid: int = 12345

    def poll(self) -> int | None:
        return self.returncode

    def wait(self, timeout: float | None = None) -> int:
        return self.returncode or 0

    def terminate(self) -> None:
        pass

    def kill(self) -> None:
        pass
