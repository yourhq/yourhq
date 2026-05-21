"""Secrets synchronization daemon helper.

Fetches encrypted secrets from Supabase, decrypts them using the same
HKDF-derived key as the UI, and writes per-agent .env files to disk.
Triggered by Realtime subscription on the secrets table and by a periodic
safety re-sync every 5 minutes.

The decrypted values are written as:
  ~/.openclaw/secrets/gateway.env        (gateway-level, no agent_id)
  ~/.openclaw/secrets/agents/<slug>.env  (merged: gateway defaults + agent overrides)

Files are chmod 0600; directories chmod 0700.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import struct
import threading
import time
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Optional

HOME = Path(os.path.expanduser("~"))
OPENCLAW_HOME = Path(os.environ.get("OPENCLAW_HOME", str(HOME / ".openclaw")))
SECRETS_DIR = OPENCLAW_HOME / "secrets"
AGENTS_SECRETS_DIR = SECRETS_DIR / "agents"

PREFIX = "enc:v1:"
HKDF_SALT = b"yourhq-secrets-v1"
HKDF_INFO = b"aes-256-gcm"

SYNC_INTERVAL = 300  # 5 minutes safety re-sync

# Module-level config — set by start_secrets_sync()
_supabase_url = ""
_supabase_key = ""
_gateway_id = ""
_encryption_key: Optional[bytes] = None
_sync_lock = threading.Lock()


def _log(msg: str):
    from datetime import datetime, timezone

    entry = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": "info",
        "daemon": "secrets_sync",
        "msg": msg,
    }
    print(json.dumps(entry, default=str), flush=True)


# ── HKDF-SHA256 (RFC 5869) ────────────────────────────────────────────


def _hkdf_extract(salt: bytes, ikm: bytes) -> bytes:
    return hmac.new(salt, ikm, hashlib.sha256).digest()


def _hkdf_expand(prk: bytes, info: bytes, length: int) -> bytes:
    n = (length + 31) // 32
    okm = b""
    t = b""
    for i in range(1, n + 1):
        t = hmac.new(prk, t + info + struct.pack("B", i), hashlib.sha256).digest()
        okm += t
    return okm[:length]


def _derive_key(service_role_key: str) -> bytes:
    prk = _hkdf_extract(HKDF_SALT, service_role_key.encode())
    return _hkdf_expand(prk, HKDF_INFO, 32)


def _get_encryption_key() -> bytes:
    global _encryption_key
    if _encryption_key is not None:
        return _encryption_key

    hosted_key = os.environ.get("HOSTED_SECRETS_KEY", "").strip()
    if hosted_key:
        for encoding in ("base64url", "base64", "hex"):
            try:
                if encoding == "base64url":
                    key = base64.urlsafe_b64decode(hosted_key + "==")
                elif encoding == "base64":
                    key = base64.b64decode(hosted_key + "==")
                else:
                    key = bytes.fromhex(hosted_key)
                if len(key) == 32:
                    _encryption_key = key
                    return key
            except Exception:
                continue
        raise RuntimeError("HOSTED_SECRETS_KEY must decode to exactly 32 bytes")

    _encryption_key = _derive_key(_supabase_key)
    return _encryption_key


# ── AES-256-GCM decryption ────────────────────────────────────────────


def _decrypt(ciphertext_str: str) -> Optional[str]:
    """Decrypt an enc:v1: formatted value. Returns None on failure."""
    if not ciphertext_str or not ciphertext_str.startswith(PREFIX):
        return ciphertext_str if ciphertext_str else None

    try:
        from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    except ImportError:
        _log("cryptography library not available — cannot decrypt secrets")
        return None

    parts = ciphertext_str[len(PREFIX) :].split(".")
    if len(parts) == 4 and parts[0] == "":
        parts = parts[1:]
    if len(parts) != 3:
        return None

    try:
        key = _get_encryption_key()
        iv = base64.urlsafe_b64decode(parts[0] + "==")
        tag = base64.urlsafe_b64decode(parts[1] + "==")
        ct = base64.urlsafe_b64decode(parts[2] + "==")

        aesgcm = AESGCM(key)
        plaintext = aesgcm.decrypt(iv, ct + tag, None)
        return plaintext.decode("utf-8")
    except Exception as e:
        _log(f"Decryption failed: {e}")
        return None


# ── Supabase API ──────────────────────────────────────────────────────


def _api_get(table: str, params: dict) -> list:
    url = _supabase_url.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(
        url,
        headers={
            "apikey": _supabase_key,
            "Authorization": f"Bearer {_supabase_key}",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return json.loads(r.read().decode())


def _api_patch_many(table: str, filter_params: dict, payload: dict):
    url = _supabase_url.rstrip("/") + f"/rest/v1/{table}?" + urllib.parse.urlencode(filter_params)
    data = json.dumps(payload).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="PATCH",
        headers={
            "apikey": _supabase_key,
            "Authorization": f"Bearer {_supabase_key}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        return r.read()


# ── Sync logic ────────────────────────────────────────────────────────


def _get_gateway_db_id() -> Optional[str]:
    """Resolve the gateway slug to its UUID."""
    try:
        rows = _api_get("gateways", {"select": "id", "slug": f"eq.{_gateway_id}", "limit": "1"})
        if rows:
            return rows[0]["id"]
    except Exception as e:
        _log(f"Failed to resolve gateway ID: {e}")
    return None


def _fetch_secrets(gateway_db_id: str) -> list:
    try:
        return _api_get(
            "secrets",
            {
                "select": "id,agent_id,key,encrypted_value,sync_status",
                "gateway_id": f"eq.{gateway_db_id}",
            },
        )
    except Exception as e:
        _log(f"Failed to fetch secrets: {e}")
        return []


def _get_agent_slugs(agent_ids: set) -> dict:
    """Map agent UUIDs to their slugs."""
    if not agent_ids:
        return {}
    slugs = {}
    try:
        filter_val = ",".join(agent_ids)
        rows = _api_get("agents", {"select": "id,slug", "id": f"in.({filter_val})"})
        for row in rows:
            slugs[row["id"]] = row["slug"]
    except Exception as e:
        _log(f"Failed to fetch agent slugs: {e}")
    return slugs


def _shell_quote(v: str) -> str:
    """Single-quote a value for safe shell sourcing."""
    return "'" + v.replace("'", "'\\''") + "'"


def _read_env_file(path: Path) -> dict[str, str]:
    """Read key=value pairs from a .env file."""
    result: dict[str, str] = {}
    if not path.is_file():
        return result
    for line in path.read_text().splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        v = v.strip()
        if len(v) >= 2 and v[0] == v[-1] and v[0] in ("'", '"'):
            v = v[1:-1]
        result[k.strip()] = v
    return result


def _write_env_file(path: Path, env_vars: dict, *, preserve_existing: bool = False):
    """Write key=value pairs to a .env file with secure permissions.

    When preserve_existing is True, existing keys not present in env_vars
    are kept (e.g. base infra creds written by the entrypoint).
    """
    path.parent.mkdir(parents=True, exist_ok=True)
    os.chmod(path.parent, 0o700)

    merged = {}
    if preserve_existing:
        merged.update(_read_env_file(path))
    merged.update(env_vars)

    lines = []
    for k, v in sorted(merged.items()):
        lines.append(f"{k}={_shell_quote(v)}")
    path.write_text("\n".join(lines) + "\n" if lines else "")
    os.chmod(path, 0o600)


def sync_secrets():
    """Main sync: fetch all secrets, decrypt, write .env files, mark active."""
    with _sync_lock:
        _sync_secrets_inner()


def _sync_secrets_inner():
    gateway_db_id = _get_gateway_db_id()
    if not gateway_db_id:
        return

    secrets = _fetch_secrets(gateway_db_id)
    if not secrets:
        if AGENTS_SECRETS_DIR.exists():
            for stale in AGENTS_SECRETS_DIR.glob("*.env"):
                stale.unlink(missing_ok=True)
        return

    agent_ids = {s["agent_id"] for s in secrets if s.get("agent_id")}
    agent_slugs = _get_agent_slugs(agent_ids)

    gateway_vars: dict[str, str] = {}
    agent_vars: dict[str, dict[str, str]] = {}
    synced_ids: list[str] = []

    for secret in secrets:
        plaintext = _decrypt(secret["encrypted_value"])
        if plaintext is None:
            continue

        key = secret["key"]
        agent_id = secret.get("agent_id")

        if agent_id:
            slug = agent_slugs.get(agent_id)
            if not slug:
                continue
            if slug not in agent_vars:
                agent_vars[slug] = {}
            agent_vars[slug][key] = plaintext
        else:
            gateway_vars[key] = plaintext

        synced_ids.append(secret["id"])

    SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(SECRETS_DIR, 0o700)

    _write_env_file(SECRETS_DIR / "gateway.env", gateway_vars, preserve_existing=True)

    AGENTS_SECRETS_DIR.mkdir(parents=True, exist_ok=True)
    os.chmod(AGENTS_SECRETS_DIR, 0o700)

    # Remove stale agent .env files
    active_slugs = set(agent_vars.keys())
    for existing in AGENTS_SECRETS_DIR.glob("*.env"):
        slug = existing.stem
        if slug not in active_slugs and slug != "gateway":
            existing.unlink(missing_ok=True)

    # Write per-agent files: gateway defaults merged with agent overrides
    all_agent_slugs = set(agent_vars.keys()) | set(agent_slugs.values())
    for slug in all_agent_slugs:
        merged = dict(gateway_vars)
        if slug in agent_vars:
            merged.update(agent_vars[slug])
        _write_env_file(AGENTS_SECRETS_DIR / f"{slug}.env", merged)

    # Mark synced secrets as active
    if synced_ids:
        from datetime import datetime, timezone

        now = datetime.now(timezone.utc).isoformat(timespec="seconds")
        try:
            filter_val = ",".join(synced_ids)
            _api_patch_many(
                "secrets",
                {
                    "id": f"in.({filter_val})",
                    "sync_status": "neq.active",
                },
                {
                    "sync_status": "active",
                    "last_synced_at": now,
                },
            )
        except Exception as e:
            _log(f"Failed to mark secrets as active: {e}")

    _log(f"Synced {len(synced_ids)} secret(s) ({len(gateway_vars)} gateway, {len(agent_vars)} agent-scoped)")


# ── Background loop ───────────────────────────────────────────────────


def _sync_loop():
    sync_secrets()
    while True:
        time.sleep(SYNC_INTERVAL)
        try:
            sync_secrets()
        except Exception as e:
            _log(f"Periodic sync failed: {e}")


def start_secrets_sync(supabase_url: str, supabase_key: str, gateway_id: str):
    """Start the secrets sync background thread. Called from command_runner main().

    Performs one synchronous sync before returning so callers can rely on
    .env files being present immediately after this call.
    """
    global _supabase_url, _supabase_key, _gateway_id

    _supabase_url = supabase_url
    _supabase_key = supabase_key
    _gateway_id = gateway_id

    try:
        sync_secrets()
    except Exception as e:
        _log(f"Initial secrets sync failed: {e}")

    t = threading.Thread(target=_sync_loop, daemon=True, name="secrets-sync")
    t.start()
    _log("Secrets sync started")
