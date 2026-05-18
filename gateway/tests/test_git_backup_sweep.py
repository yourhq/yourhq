import subprocess
from pathlib import Path


def test_run_handles_subprocess_timeout(monkeypatch):
    from git_backup_sweep import _run

    def fake_run(*args, **kwargs):
        raise subprocess.TimeoutExpired(cmd=args[0], timeout=60)

    monkeypatch.setattr(subprocess, "run", fake_run)

    code, out, err = _run(["git", "status"], Path("/tmp"))
    assert code == 124
    assert err == "timeout"


def test_run_handles_missing_git_command(monkeypatch):
    from git_backup_sweep import _run

    def fake_run(*args, **kwargs):
        raise FileNotFoundError("git not found")

    monkeypatch.setattr(subprocess, "run", fake_run)

    code, out, err = _run(["git", "status"], Path("/tmp"))
    assert code == 127
    assert err == "git not found"


def test_run_returns_normal_output(monkeypatch):
    from git_backup_sweep import _run

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="OK\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    code, out, err = _run(["git", "status"], Path("/tmp"))
    assert code == 0
    assert out == "OK"
    assert err == ""


def test_iter_worktrees_yields_only_workspace_dirs(monkeypatch, tmp_path):
    import git_backup_sweep as mod

    monkeypatch.setattr(mod, "OPENCLAW_HOME", tmp_path)

    (tmp_path / "workspace-agent1").mkdir()
    (tmp_path / "workspace-agent2").mkdir()
    (tmp_path / "repo.git").mkdir()
    (tmp_path / "agents").mkdir()
    (tmp_path / "shared-auth").mkdir()

    results = list(mod._iter_worktrees())
    names = sorted(p.name for p in results)
    assert names == ["workspace-agent1", "workspace-agent2"]


def test_iter_worktrees_empty_when_no_openclaw_home(monkeypatch, tmp_path):
    import git_backup_sweep as mod

    monkeypatch.setattr(mod, "OPENCLAW_HOME", tmp_path / "nonexistent")

    results = list(mod._iter_worktrees())
    assert results == []


def test_has_remote_false_when_no_remote(monkeypatch):
    import git_backup_sweep as mod

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    assert mod._has_remote() is False


def test_has_remote_true_when_origin_present(monkeypatch):
    import git_backup_sweep as mod

    def fake_run(cmd, **kwargs):
        return subprocess.CompletedProcess(args=cmd, returncode=0, stdout="origin\n", stderr="")

    monkeypatch.setattr(subprocess, "run", fake_run)

    assert mod._has_remote() is True
