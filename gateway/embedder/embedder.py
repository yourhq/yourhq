#!/usr/bin/env python3
"""Local document embedder for HQ.

Runs an internal HTTP embedding endpoint for agent scripts and a background
indexing loop that embeds pending documents in Supabase.
"""

from __future__ import annotations

import hashlib
import json
import os
import sys
import threading
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

try:
    from fastembed import TextEmbedding
except ImportError:
    print("Missing dependency: fastembed", file=sys.stderr)
    raise

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]


HOST = os.environ.get("EMBEDDER_HOST", "0.0.0.0")
PORT = int(os.environ.get("EMBEDDER_PORT", "18801"))
MODEL_NAME = os.environ.get("EMBEDDER_MODEL", "BAAI/bge-small-en-v1.5")
CACHE_DIR = os.environ.get("EMBEDDER_CACHE_DIR", "/models")
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
POLL_INTERVAL = int(os.environ.get("EMBEDDER_POLL_INTERVAL", "10"))
BATCH_SIZE = int(os.environ.get("EMBEDDER_BATCH_SIZE", "8"))
LEASE_SECONDS = int(os.environ.get("EMBEDDER_LEASE_SECONDS", "300"))
MAX_INPUT_CHARS = int(os.environ.get("EMBEDDER_MAX_INPUT_CHARS", "6000"))

SUPABASE_URL = ""
SUPABASE_KEY = ""
_MODEL: TextEmbedding | None = None
_MODEL_LOCK = threading.Lock()
MODEL_STATUS = "not_loaded"
MODEL_ERROR: str | None = None
MODEL_READY_AT: str | None = None


def log(message: str, level: str = "info", **extra: Any) -> None:
    payload = {
        "ts": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "level": level,
        "daemon": "embedder",
        "gateway_id": GATEWAY_ID,
        "msg": message,
    }
    payload.update(extra)
    print(json.dumps(payload, default=str), flush=True)


def resolve_config() -> bool:
    global SUPABASE_URL, SUPABASE_KEY
    env_url = os.environ.get("SUPABASE_URL", "").strip()
    env_key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
    if env_url and env_key:
        SUPABASE_URL = env_url
        SUPABASE_KEY = env_key
        return True

    if resolve_hq_config is not None:
        cfg = resolve_hq_config()
        if cfg:
            SUPABASE_URL = cfg.url
            SUPABASE_KEY = cfg.service_role_key
            return True

    SUPABASE_URL = ""
    SUPABASE_KEY = ""
    return False


def get_model() -> TextEmbedding:
    global _MODEL, MODEL_STATUS, MODEL_ERROR, MODEL_READY_AT
    with _MODEL_LOCK:
        if _MODEL is None:
            MODEL_STATUS = "loading"
            MODEL_ERROR = None
            try:
                log("loading embedding model", model=MODEL_NAME, cache_dir=CACHE_DIR)
                model = TextEmbedding(model_name=MODEL_NAME, cache_dir=CACHE_DIR)
                # Force lazy downloads/load while the log context is clear.
                list(model.embed(["warmup"]))
                _MODEL = model
                MODEL_STATUS = "ready"
                MODEL_READY_AT = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
                log("embedding model ready", model=MODEL_NAME, dimensions=384)
            except Exception as exc:
                _MODEL = None
                MODEL_STATUS = "failed"
                MODEL_ERROR = str(exc)
                log("embedding model failed to load", level="error", model=MODEL_NAME, error=str(exc))
                raise
        return _MODEL


def warm_model_loop() -> None:
    while True:
        try:
            get_model()
            return
        except Exception:
            time.sleep(POLL_INTERVAL)


def embed_text(text: str) -> list[float]:
    model = get_model()
    vector = next(iter(model.embed([text[:MAX_INPUT_CHARS]])))
    values = vector.tolist() if hasattr(vector, "tolist") else list(vector)
    return [float(v) for v in values]


def extract_text(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return value
        if isinstance(parsed, (dict, list)):
            return extract_text(parsed)
        return value
    if isinstance(value, (int, float, bool)):
        return str(value)
    if isinstance(value, list):
        return " ".join(part for item in value if (part := extract_text(item)))
    if isinstance(value, dict):
        parts: list[str] = []
        text = value.get("text")
        if isinstance(text, str):
            parts.append(text)
        for key in ("title", "content", "children"):
            if key in value:
                part = extract_text(value[key])
                if part:
                    parts.append(part)
        for key, item in value.items():
            if key in {"text", "title", "content", "children"}:
                continue
            if isinstance(item, (dict, list)):
                part = extract_text(item)
                if part:
                    parts.append(part)
        return " ".join(parts)
    return ""


def build_embedding_input(title: str, content: Any = None, tags: list[str] | None = None) -> str:
    parts = [title.strip()]
    if tags:
        parts.append(", ".join(t.strip() for t in tags if t.strip()))
    body = extract_text(content).strip()
    if body:
        parts.append(body)
    return "\n\n".join(part for part in parts if part)[:MAX_INPUT_CHARS]


def source_hash(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def rpc(function_name: str, payload: dict[str, Any]) -> Any:
    url = SUPABASE_URL.rstrip("/") + f"/rest/v1/rpc/{function_name}"
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        method="POST",
        headers={
            "apikey": SUPABASE_KEY,
            "Authorization": f"Bearer {SUPABASE_KEY}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else None


def index_one(row: dict[str, Any]) -> None:
    doc_id = row["id"]
    text = build_embedding_input(row.get("title") or "", row.get("content"), row.get("tags") or [])
    digest = source_hash(text)
    if not text:
        rpc("mark_document_embedding_failed", {
            "p_document_id": doc_id,
            "p_error": "Document has no embeddable text",
        })
        return

    embedding = embed_text(text)
    if len(embedding) != 384:
        raise ValueError(f"Expected 384-dim embedding, got {len(embedding)}")

    rpc("mark_document_embedding_indexed", {
        "p_document_id": doc_id,
        "p_embedding": embedding,
        "p_embedding_model": MODEL_NAME,
        "p_embedding_dimensions": len(embedding),
        "p_source_hash": digest,
    })
    log("indexed document", document_id=doc_id)


def indexing_loop() -> None:
    while True:
        try:
            if not resolve_config():
                log("waiting for Supabase config", level="warning")
                time.sleep(POLL_INTERVAL)
                continue

            rows = rpc("lease_documents_for_embedding", {
                "p_gateway_slug": GATEWAY_ID,
                "p_limit": BATCH_SIZE,
                "p_lease_seconds": LEASE_SECONDS,
            }) or []

            if not rows:
                time.sleep(POLL_INTERVAL)
                continue

            for row in rows:
                try:
                    index_one(row)
                except Exception as exc:
                    log("failed to index document", level="error", document_id=row.get("id"), error=str(exc))
                    try:
                        rpc("mark_document_embedding_failed", {
                            "p_document_id": row.get("id"),
                            "p_error": str(exc),
                        })
                    except Exception as mark_exc:
                        log("failed to mark document embedding failure", level="error", error=str(mark_exc))
        except urllib.error.URLError as exc:
            log("Supabase request failed", level="error", error=str(exc))
            time.sleep(POLL_INTERVAL)
        except Exception as exc:
            log("indexing loop error", level="error", error=str(exc))
            time.sleep(POLL_INTERVAL)


class Handler(BaseHTTPRequestHandler):
    server_version = "HQEmbedder/1.0"

    def do_GET(self) -> None:
        if self.path != "/healthz":
            self.send_error(404)
            return
        self.respond_json({
            "ok": True,
            "model": MODEL_NAME,
            "dimensions": 384,
            "model_status": MODEL_STATUS,
            "model_ready_at": MODEL_READY_AT,
            "model_error": MODEL_ERROR,
            "cache_dir": CACHE_DIR,
            "supabase_configured": bool(SUPABASE_URL or resolve_config()),
        })

    def do_POST(self) -> None:
        if self.path != "/embed":
            self.send_error(404)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            text = str(payload.get("input") or "")
            if not text.strip():
                self.respond_json({"error": "input_required"}, status=400)
                return
            embedding = embed_text(text)
            self.respond_json({
                "embedding": embedding,
                "model": MODEL_NAME,
                "dimensions": len(embedding),
            })
        except Exception as exc:
            log("embed request failed", level="error", error=str(exc))
            self.respond_json({"error": str(exc)}, status=500)

    def log_message(self, format: str, *args: Any) -> None:
        return

    def respond_json(self, payload: dict[str, Any], status: int = 200) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main() -> int:
    os.makedirs(CACHE_DIR, exist_ok=True)
    threading.Thread(target=warm_model_loop, daemon=True).start()
    threading.Thread(target=indexing_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log("embedder listening", host=HOST, port=PORT, model=MODEL_NAME)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
