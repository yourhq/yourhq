"""Gateway state backup and restore.

Backs up ~/.openclaw/ (auth stores, config, secrets) to Supabase Storage
and restores on boot if no local state exists. Used by:

  - entrypoint.sh (restore on boot, backup on SIGTERM)
  - command_runner.py (backup_gateway command action from UI)
  - keepalive scripts (backup before extending sandbox timeout)

Retention: keeps the 3 most recent backups per gateway, prunes anything
older than 7 days. Restore picks the newest available backup; if it's
corrupt, falls back to the next.

Usage as CLI:
  python3 gateway_backup.py backup
  python3 gateway_backup.py restore
  python3 gateway_backup.py status   # prints JSON with last backup info
"""

import io
import json
import logging
import os
import re
import sys
import tarfile
import time
import urllib.error
import urllib.request

logging.basicConfig(level=logging.INFO, format="[gateway_backup] %(message)s")
log = logging.getLogger("gateway_backup")

SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
OPENCLAW_HOME = os.environ.get("OPENCLAW_HOME", os.path.expanduser("~/.openclaw"))
CHROME_DATA_DIR = os.path.expanduser("~/.config/google-chrome")

BUCKET = "gateway-backups"
MAX_BACKUPS = 5
MAX_AGE_DAYS = 7

EXCLUDE_DIRS = {"npm", "node_modules", "browser", "plugins", ".tmp", "tmp", "cache", "Cache", "repos"}
EXCLUDE_EXTENSIONS = {".log", ".pid", ".sock", ".sqlite-wal", ".sqlite-shm"}

# Chrome dirs to skip when backing up the browser profile — caches and models
# that Chrome regenerates on launch. Keeps backup ~6MB instead of ~180MB.
CHROME_EXCLUDE_DIRS = {
    "optimization_guide_model_store", "WasmTtsEngine", "component_crx_cache",
    "Safe Browsing", "DeferredBrowserMetrics", "OnDeviceHeadSuggestModel",
    "CertificateRevocation", "hyphen-data", "ZxcvbnData", "OptimizationHints",
    "PKIMetadata", "ActorSafetyLists", "Crowd Deny", "Subresource Filter",
    "GraphiteDawnCache", "extensions_crx_cache", "SafetyTips",
    "segmentation_platform", "GPUPersistentCache", "BrowserMetrics",
    "Crash Reports", "WidevineCdm", "NativeMessagingHosts", "OriginTrials",
    "SSLErrorAssistant", "MEIPreload", "FileTypePolicies", "CaptchaProviders",
    "TrustTokenKeyCommitments", "FirstPartySetsPreloaded",
    "AmountExtractionHeuristicRegexes", "PrivacySandboxAttestationsPreloaded",
    "Service Worker", "Cache", "Code Cache", "GPUCache", "GrShaderCache",
    "ShaderCache", "blob_storage",
}

TIMESTAMP_RE = re.compile(r"state-(\d{8}T\d{6}Z)\.tar\.gz$")


def _storage_url(path: str) -> str:
    return f"{SUPABASE_URL.rstrip('/')}/storage/v1/object/{BUCKET}/{path}"


def _storage_api(method: str, endpoint: str, body: dict | None = None, timeout: int = 30):
    url = f"{SUPABASE_URL.rstrip('/')}/storage/v1/{endpoint}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
        },
    )
    resp = urllib.request.urlopen(req, timeout=timeout)
    return json.loads(resp.read().decode())


def _api_patch(table: str, match: dict, body: dict) -> None:
    params = "&".join(f"{k}=eq.{v}" for k, v in match.items())
    url = f"{SUPABASE_URL.rstrip('/')}/rest/v1/{table}?{params}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        url,
        data=data,
        method="PATCH",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=15)
    except urllib.error.URLError as e:
        log.warning("Failed to update gateway metadata: %s", e)


def _list_backups() -> list[dict]:
    """List all backup files for this gateway, sorted newest-first."""
    try:
        items = _storage_api(
            "POST",
            f"object/list/{BUCKET}",
            {
                "prefix": f"{GATEWAY_ID}/",
                "limit": 100,
                "sortBy": {"column": "name", "order": "desc"},
            },
        )
    except urllib.error.URLError as e:
        log.warning("Failed to list backups: %s", e)
        return []

    backups = []
    for item in items:
        name = item.get("name", "")
        m = TIMESTAMP_RE.search(name)
        if m:
            backups.append({"name": name, "timestamp": m.group(1), "metadata": item})
    backups.sort(key=lambda b: b["timestamp"], reverse=True)
    return backups


def _prune_old_backups() -> int:
    """Delete backups beyond MAX_BACKUPS or older than MAX_AGE_DAYS."""
    backups = _list_backups()
    if len(backups) <= MAX_BACKUPS:
        return 0

    cutoff = time.strftime(
        "%Y%m%dT%H%M%SZ",
        time.gmtime(time.time() - MAX_AGE_DAYS * 86400),
    )

    to_delete = []
    for i, b in enumerate(backups):
        if i >= MAX_BACKUPS or b["timestamp"] < cutoff:
            to_delete.append(f"{GATEWAY_ID}/{b['name']}")

    if not to_delete:
        return 0

    try:
        _storage_api("DELETE", f"object/{BUCKET}", {"prefixes": to_delete})
        log.info("Pruned %d old backup(s)", len(to_delete))
    except urllib.error.URLError as e:
        log.warning("Failed to prune backups: %s", e)
    return len(to_delete)


def _tar_filter(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
    parts = tarinfo.name.split("/")
    for part in parts:
        if part in EXCLUDE_DIRS:
            return None
    if any(tarinfo.name.endswith(ext) for ext in EXCLUDE_EXTENSIONS):
        return None
    if tarinfo.size > 50 * 1024 * 1024:
        return None
    return tarinfo


def create_backup() -> dict:
    """Tar ~/.openclaw/ and upload to Supabase Storage.

    Returns dict with keys: ok, size_bytes, path, error.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"ok": False, "error": "Missing Supabase credentials"}

    if not os.path.isdir(OPENCLAW_HOME):
        return {"ok": False, "error": f"{OPENCLAW_HOME} does not exist"}

    log.info("Creating backup of %s ...", OPENCLAW_HOME)
    start = time.time()

    timestamp = time.strftime("%Y%m%dT%H%M%SZ", time.gmtime())
    storage_path = f"{GATEWAY_ID}/state-{timestamp}.tar.gz"

    def _chrome_filter(tarinfo: tarfile.TarInfo) -> tarfile.TarInfo | None:
        parts = tarinfo.name.split("/")
        for part in parts:
            if part in CHROME_EXCLUDE_DIRS:
                return None
        if tarinfo.size > 50 * 1024 * 1024:
            return None
        return tarinfo

    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode="w:gz") as tar:
        for entry in sorted(os.listdir(OPENCLAW_HOME)):
            if entry in EXCLUDE_DIRS:
                continue
            full = os.path.join(OPENCLAW_HOME, entry)
            try:
                tar.add(full, arcname=entry, filter=_tar_filter)
            except (PermissionError, OSError) as e:
                log.warning("Skipping %s: %s", entry, e)

        # Include Chrome profile data (OAuth sessions, cookies, local storage)
        if os.path.isdir(CHROME_DATA_DIR):
            try:
                tar.add(CHROME_DATA_DIR, arcname="_chrome_profile", filter=_chrome_filter)
                log.info("Included Chrome profile data")
            except (PermissionError, OSError) as e:
                log.warning("Skipping Chrome profile: %s", e)

    data = buf.getvalue()
    size = len(data)
    log.info("Tarball: %d bytes (%.1f KB), uploading to %s ...", size, size / 1024, storage_path)

    url = _storage_url(storage_path)
    req = urllib.request.Request(
        url,
        data=data,
        method="PUT",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/gzip",
            "x-upsert": "true",
        },
    )
    try:
        urllib.request.urlopen(req, timeout=120)
    except urllib.error.URLError as e:
        msg = str(e)
        if hasattr(e, "read"):
            msg = e.read().decode(errors="replace")
        return {"ok": False, "error": f"Upload failed: {msg}"}

    elapsed = time.time() - start
    log.info("Backup uploaded in %.1fs (%d bytes)", elapsed, size)

    _api_patch(
        "gateways",
        {"slug": GATEWAY_ID},
        {
            "last_backup_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "last_backup_size_bytes": size,
        },
    )

    _prune_old_backups()

    return {"ok": True, "size_bytes": size, "path": storage_path}


def restore_backup() -> dict:
    """Download the newest backup from Supabase Storage and extract to ~/.openclaw/.

    Tries backups newest-first; skips corrupt archives and falls back to the next.
    Returns dict with keys: ok, restored, path, error.
    """
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"ok": False, "restored": False, "error": "Missing Supabase credentials"}

    backups = _list_backups()
    if not backups:
        log.info("No backup found for gateway %s — starting fresh.", GATEWAY_ID)
        return {"ok": True, "restored": False}

    for b in backups:
        file_path = f"{GATEWAY_ID}/{b['name']}"
        url = _storage_url(file_path)
        req = urllib.request.Request(
            url,
            headers={
                "apikey": SUPABASE_KEY,
                "Authorization": f"Bearer {SUPABASE_KEY}",
            },
        )

        try:
            resp = urllib.request.urlopen(req, timeout=120)
            data = resp.read()
        except urllib.error.HTTPError as e:
            if e.code == 404:
                log.warning("Backup %s not found, trying next ...", b["name"])
                continue
            log.warning("Download failed for %s: %s, trying next ...", b["name"], e)
            continue
        except urllib.error.URLError as e:
            log.warning("Download failed for %s: %s, trying next ...", b["name"], e)
            continue

        log.info("Downloaded %s: %d bytes. Extracting ...", b["name"], len(data))

        os.makedirs(OPENCLAW_HOME, exist_ok=True)
        # Make existing files writable so tar can overwrite read-only git objects
        for root, dirs, files in os.walk(OPENCLAW_HOME, followlinks=False):
            for d in dirs:
                try:
                    os.chmod(os.path.join(root, d), 0o755)
                except OSError:
                    pass
            for f in files:
                try:
                    p = os.path.join(root, f)
                    st = os.stat(p)
                    os.chmod(p, st.st_mode | 0o200)
                except OSError:
                    pass
        buf = io.BytesIO(data)
        try:
            with tarfile.open(fileobj=buf, mode="r:gz") as tar:
                tar.extractall(path=OPENCLAW_HOME)
        except (tarfile.TarError, EOFError, OSError) as e:
            log.warning("Corrupt backup %s: %s — trying next ...", b["name"], e)
            continue

        # Relocate Chrome profile data from backup staging path
        chrome_staging = os.path.join(OPENCLAW_HOME, "_chrome_profile")
        if os.path.isdir(chrome_staging):
            import shutil

            os.makedirs(CHROME_DATA_DIR, exist_ok=True)
            for item in os.listdir(chrome_staging):
                src = os.path.join(chrome_staging, item)
                dst = os.path.join(CHROME_DATA_DIR, item)
                if os.path.isdir(dst):
                    shutil.rmtree(dst, ignore_errors=True)
                elif os.path.exists(dst):
                    os.remove(dst)
                shutil.move(src, dst)
            shutil.rmtree(chrome_staging, ignore_errors=True)
            log.info("Restored Chrome profile to %s", CHROME_DATA_DIR)

        # Fix ownership if running as root but openclaw user exists
        try:
            import pwd

            pw = pwd.getpwnam("openclaw")
            uid, gid = pw.pw_uid, pw.pw_gid
            for target in [OPENCLAW_HOME, CHROME_DATA_DIR]:
                for root, dirs, files in os.walk(target, followlinks=False):
                    for name in dirs + files:
                        try:
                            os.lchown(os.path.join(root, name), uid, gid)
                        except (FileNotFoundError, OSError):
                            pass
            log.info("Fixed ownership to openclaw:%d", uid)
        except (KeyError, PermissionError):
            pass

        log.info("Restore complete from %s.", b["name"])
        return {"ok": True, "restored": True, "path": file_path}

    log.warning("All %d backups failed to restore.", len(backups))
    return {"ok": False, "restored": False, "error": "All backups corrupt or unavailable"}


def get_status() -> dict:
    """Return backup metadata: count, newest, total size."""
    if not SUPABASE_URL or not SUPABASE_KEY:
        return {"ok": False, "error": "Missing Supabase credentials"}

    backups = _list_backups()

    url = (
        f"{SUPABASE_URL.rstrip('/')}/rest/v1/gateways?slug=eq.{GATEWAY_ID}&select=last_backup_at,last_backup_size_bytes"
    )
    req = urllib.request.Request(
        url,
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Accept": "application/json",
        },
    )
    gw_meta = {}
    try:
        resp = urllib.request.urlopen(req, timeout=15)
        rows = json.loads(resp.read().decode())
        if rows:
            gw_meta = rows[0]
    except urllib.error.URLError:
        pass

    return {
        "ok": True,
        "has_backup": len(backups) > 0,
        "backup_count": len(backups),
        "backups": [{"name": b["name"], "timestamp": b["timestamp"]} for b in backups],
        "last_backup_at": gw_meta.get("last_backup_at"),
        "last_backup_size_bytes": gw_meta.get("last_backup_size_bytes"),
    }


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: gateway_backup.py [backup|restore|status]", file=sys.stderr)
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "backup":
        result = create_backup()
    elif cmd == "restore":
        result = restore_backup()
    elif cmd == "status":
        result = get_status()
    else:
        print(f"Unknown command: {cmd}", file=sys.stderr)
        sys.exit(1)

    print(json.dumps(result))
    sys.exit(0 if result.get("ok") else 1)
