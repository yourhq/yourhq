"""Backup sweep for the gateway's bare repo and agent worktrees.

Runs periodically (every GIT_SYNC_INTERVAL seconds, default 1800 = 30 min)
inside the runner container. The sweep:

  1. For each agent worktree that has uncommitted changes, commit them
     with "autosync: <timestamp>" so nothing gets stranded on disk if an
     agent crashed mid-session or a user edited files directly.
  2. Push all branches to the remote (if one is configured) as insurance
     against missed pushes from the post-commit hook.
  3. Fetch from the remote and fast-forward any branches where the remote
     has moved ahead of local (only when the worktree is clean — we don't
     stomp on in-progress work).

This is the belt-and-suspenders layer. The primary sync path is:

  - add-agent.sh / update-agent.sh / files_api.py commit their own work
    with semantic messages.
  - An `post-commit` hook installed on the bare repo async-pushes every
    commit to origin.

If those work, the sweep is a no-op. If something slips, the sweep catches
it within half an hour.
"""

from __future__ import annotations

import os
import subprocess
import threading
import time
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable

HOME = Path(os.path.expanduser("~"))
OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(HOME / ".openclaw")))
REPO_DIR = OPENCLAW_HOME / "repo.git"
SYNC_INTERVAL = int(os.environ.get("GIT_SYNC_INTERVAL", "1800"))


def log(msg: str) -> None:
    print(f"[git-sweep] {msg}", flush=True)


def _run(cmd: list[str], cwd: Path) -> tuple[int, str, str]:
    """Run a git command, return (returncode, stdout, stderr)."""
    try:
        result = subprocess.run(
            cmd, cwd=str(cwd), capture_output=True, text=True, timeout=60
        )
        return result.returncode, result.stdout.strip(), result.stderr.strip()
    except subprocess.TimeoutExpired:
        return 124, "", "timeout"
    except FileNotFoundError:
        return 127, "", "git not found"


def _iter_worktrees() -> Iterable[Path]:
    """Yield every agent worktree directory under OPENCLAW_HOME/workspace-*."""
    if not OPENCLAW_HOME.exists():
        return
    for entry in OPENCLAW_HOME.iterdir():
        if entry.is_dir() and entry.name.startswith("workspace-"):
            yield entry


def _has_remote() -> bool:
    code, out, _ = _run(["git", "remote"], REPO_DIR)
    return code == 0 and "origin" in out.split()


def _is_dirty(worktree: Path) -> bool:
    code, out, _ = _run(["git", "status", "--porcelain"], worktree)
    return code == 0 and bool(out)


def _current_branch(worktree: Path) -> str | None:
    code, out, _ = _run(["git", "symbolic-ref", "--short", "HEAD"], worktree)
    return out if code == 0 and out else None


def commit_dirty_worktrees() -> int:
    """Commit any uncommitted changes in each worktree. Returns count."""
    committed = 0
    now = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    for wt in _iter_worktrees():
        if not _is_dirty(wt):
            continue
        branch = _current_branch(wt) or wt.name
        _run(["git", "add", "-A"], wt)
        code, _, err = _run(
            ["git", "commit", "-m", f"autosync: uncommitted changes at {now}"],
            wt,
        )
        if code == 0:
            log(f"committed dirty state in {branch}")
            committed += 1
        else:
            # Commit failed (nothing to commit after add, merge in progress, etc.)
            # Not worth reporting as an error — sweep is best-effort.
            if err and "nothing to commit" not in err:
                log(f"commit skipped in {branch}: {err}")
    return committed


def push_all() -> None:
    """Push every local branch to origin. Non-fatal on failure."""
    if not _has_remote():
        return
    code, _, err = _run(["git", "push", "--all", "origin"], REPO_DIR)
    if code != 0 and err:
        log(f"push --all failed: {err}")


def fetch_and_ff() -> int:
    """Fetch origin and fast-forward local branches where possible.

    Only fast-forwards when a branch's worktree is clean. Returns the
    number of branches that were advanced.
    """
    if not _has_remote():
        return 0

    code, _, err = _run(["git", "fetch", "origin", "--prune"], REPO_DIR)
    if code != 0:
        if err:
            log(f"fetch failed: {err}")
        return 0

    advanced = 0
    # Enumerate branches via `git branch --list`.
    code, out, _ = _run(["git", "for-each-ref", "--format=%(refname:short)", "refs/heads/"], REPO_DIR)
    if code != 0:
        return 0

    for branch in out.splitlines():
        branch = branch.strip()
        if not branch:
            continue
        # Is there a matching origin branch?
        code, _, _ = _run(
            ["git", "rev-parse", "--verify", f"refs/remotes/origin/{branch}"],
            REPO_DIR,
        )
        if code != 0:
            continue
        # Is local behind origin?
        code, out, _ = _run(
            [
                "git",
                "rev-list",
                "--left-right",
                "--count",
                f"refs/heads/{branch}...refs/remotes/origin/{branch}",
            ],
            REPO_DIR,
        )
        if code != 0:
            continue
        try:
            ahead, behind = (int(x) for x in out.split())
        except (ValueError, AttributeError):
            continue
        if behind == 0:
            continue  # Nothing to pull.
        if ahead > 0:
            log(f"skipping ff of {branch}: local has diverged ({ahead} ahead, {behind} behind)")
            continue

        # Find the worktree (if any). If it's dirty, skip — we don't want to
        # clobber in-progress edits.
        worktree = OPENCLAW_HOME / f"workspace-{branch.split('/')[-1]}"
        if worktree.exists() and _is_dirty(worktree):
            log(f"skipping ff of {branch}: worktree is dirty")
            continue

        # Fast-forward the branch ref itself.
        code, _, err = _run(
            ["git", "update-ref", f"refs/heads/{branch}", f"refs/remotes/origin/{branch}"],
            REPO_DIR,
        )
        if code != 0:
            if err:
                log(f"update-ref failed for {branch}: {err}")
            continue

        # If a worktree exists and is clean, refresh its files from the new HEAD.
        if worktree.exists():
            _run(["git", "reset", "--hard", f"refs/heads/{branch}"], worktree)

        log(f"fast-forwarded {branch}")
        advanced += 1

    return advanced


def sweep_once() -> None:
    """Run one pass of the sweep. Safe to call concurrently with other git ops."""
    try:
        committed = commit_dirty_worktrees()
        if committed:
            # Local commits would normally auto-push via the post-commit hook,
            # but we also call push_all here because the hook fires only inside
            # a worktree — the worktree's commit does trigger it. This is a
            # safety net.
            push_all()
        advanced = fetch_and_ff()
        if committed or advanced:
            log(f"sweep complete: committed {committed}, fast-forwarded {advanced}")
    except Exception as e:
        log(f"sweep error (non-fatal): {e}")


def _loop() -> None:
    log(f"Backup sweep started (every {SYNC_INTERVAL}s)")
    # Small initial delay so we don't race with entrypoint setup on boot.
    time.sleep(60)
    while True:
        sweep_once()
        time.sleep(SYNC_INTERVAL)


def start_backup_sweep() -> None:
    """Start the sweep in a background daemon thread."""
    if SYNC_INTERVAL <= 0:
        log("GIT_SYNC_INTERVAL<=0; backup sweep disabled")
        return
    t = threading.Thread(target=_loop, daemon=True, name="git-backup-sweep")
    t.start()


if __name__ == "__main__":
    # Allow running the sweep as a one-shot for testing.
    sweep_once()
