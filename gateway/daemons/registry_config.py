"""Read Supabase credentials from the UI's project registry.

The UI manages a split-file registry at /config/projects.json (public)
and /config/secrets.json (0600, service role keys). After Phase 2, users
connect Supabase via the browser onboarding screen, so the gateway side
can't rely on SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY being set in .env
before boot.

This module is the fallback: if the env vars aren't set, it reads the
registry volume (mounted read-only at /config) and returns the active
project's credentials.

Called from:
  - gateway/entrypoint.sh (via `python3 -m registry_config env` to source)
  - gateway/daemons/inbox_dispatcher.py + command_runner.py (direct import)

If neither env vars nor registry has a project, returns None values so
callers can poll instead of crashing.
"""

from __future__ import annotations

import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

CONFIG_DIR = Path(os.environ.get("HQ_CONFIG_DIR", "/config"))
REGISTRY_PATH = CONFIG_DIR / "projects.json"
SECRETS_PATH = CONFIG_DIR / "secrets.json"


@dataclass
class ResolvedConfig:
    url: str
    service_role_key: str
    anon_key: str
    project_id: str | None
    source: str  # "env" or "registry"


def _load_json(path: Path) -> Optional[dict]:
    try:
        with path.open("r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        return None
    except Exception as e:
        print(
            f"[registry-config] Warning: could not parse {path}: {e}",
            file=sys.stderr,
        )
        return None


def read_from_registry() -> Optional[ResolvedConfig]:
    """Read the active project's creds from /config. None if empty/missing."""
    public = _load_json(REGISTRY_PATH)
    if not public or not isinstance(public, dict):
        return None
    projects = public.get("projects") or []
    if not projects:
        return None

    active_id = public.get("activeProjectId")
    project = None
    if active_id:
        project = next((p for p in projects if p.get("id") == active_id), None)
    if project is None:
        project = next((p for p in projects if p.get("isDefault")), None)
    if project is None:
        project = projects[0]

    secrets_file = _load_json(SECRETS_PATH) or {}
    project_secrets = (secrets_file.get("projects") or {}).get(project["id"]) or {}
    service_role_key = project_secrets.get("serviceRoleKey")

    if not project.get("url") or not project.get("anonKey") or not service_role_key:
        return None

    return ResolvedConfig(
        url=project["url"],
        service_role_key=service_role_key,
        anon_key=project["anonKey"],
        project_id=project["id"],
        source="registry",
    )


def resolve() -> Optional[ResolvedConfig]:
    """Prefer env vars when set; otherwise fall back to the registry."""
    env_url = os.environ.get("SUPABASE_URL", "").strip()
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if env_url and env_key:
        return ResolvedConfig(
            url=env_url,
            service_role_key=env_key,
            anon_key=os.environ.get("SUPABASE_ANON_KEY", "").strip(),
            project_id=None,
            source="env",
        )
    return read_from_registry()


def main() -> int:
    """CLI entry — used by entrypoint.sh to source resolved env vars.

    Usage from shell:
        eval "$(python3 /app/registry_config.py export)"
    Emits:
        export SUPABASE_URL='...'
        export SUPABASE_SERVICE_ROLE_KEY='...'
    (empty strings if nothing resolved; callers should check after)
    """
    args = sys.argv[1:]
    if not args or args[0] != "export":
        print("Usage: registry_config.py export", file=sys.stderr)
        return 2

    cfg = resolve()
    if cfg is None:
        # Emit empty assignments so eval never crashes on unbound vars.
        print("export SUPABASE_URL=''")
        print("export SUPABASE_SERVICE_ROLE_KEY=''")
        print("export HQ_CONFIG_SOURCE='none'")
        return 0

    # Escape single quotes for safe shell quoting.
    def quote(s: str) -> str:
        return "'" + s.replace("'", "'\\''") + "'"

    print(f"export SUPABASE_URL={quote(cfg.url)}")
    print(f"export SUPABASE_SERVICE_ROLE_KEY={quote(cfg.service_role_key)}")
    if cfg.anon_key:
        print(f"export SUPABASE_ANON_KEY={quote(cfg.anon_key)}")
    print(f"export HQ_CONFIG_SOURCE={quote(cfg.source)}")
    if cfg.project_id:
        print(f"export HQ_ACTIVE_PROJECT_ID={quote(cfg.project_id)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
