#!/usr/bin/env python3
"""Local knowledge embedder for HQ.

Runs an internal HTTP embedding endpoint for agent scripts and a background
indexing loop that embeds pending knowledge items.
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
from dataclasses import dataclass
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

try:
    from fastembed import TextEmbedding
except ImportError:
    print("Missing dependency: fastembed", file=sys.stderr)
    raise

try:
    from memory_pressure import (
        PRESSURE_BACKOFF_SECONDS,
        compute_batch_size,
        emit_pressure_notification,
        get_available_memory_bytes,
        should_backoff,
    )
except ImportError:
    compute_batch_size = None  # type: ignore[assignment]
    emit_pressure_notification = None  # type: ignore[assignment]
    get_available_memory_bytes = None  # type: ignore[assignment]
    should_backoff = None  # type: ignore[assignment]
    PRESSURE_BACKOFF_SECONDS = 30  # type: ignore[assignment]

try:
    from registry_config import resolve as resolve_hq_config
except ImportError:
    resolve_hq_config = None  # type: ignore[assignment]


HOST = os.environ.get("EMBEDDER_HOST", "0.0.0.0")
PORT = int(os.environ.get("EMBEDDER_PORT", "18801"))
EMBEDDER_AUTH_TOKEN = os.environ.get("EMBEDDER_AUTH_TOKEN", "")
MODEL_NAME = os.environ.get("EMBEDDER_MODEL", "BAAI/bge-small-en-v1.5")
CACHE_DIR = os.environ.get("EMBEDDER_CACHE_DIR", "/models")
GATEWAY_ID = os.environ.get("GATEWAY_ID", "default")
POLL_INTERVAL = int(os.environ.get("EMBEDDER_POLL_INTERVAL", "10"))
BATCH_SIZE = int(os.environ.get("EMBEDDER_BATCH_SIZE", "8"))
LEASE_SECONDS = int(os.environ.get("EMBEDDER_LEASE_SECONDS", "300"))
MAX_INPUT_CHARS = int(os.environ.get("EMBEDDER_MAX_INPUT_CHARS", "6000"))
CHUNK_CHARS = int(os.environ.get("EMBEDDER_CHUNK_CHARS", "3500"))
CHUNK_OVERLAP = int(os.environ.get("EMBEDDER_CHUNK_OVERLAP", "500"))
MAX_CHUNKS = int(os.environ.get("EMBEDDER_MAX_CHUNKS", "500"))

SUPABASE_URL = ""
SUPABASE_KEY = ""
_MODEL: TextEmbedding | None = None
_MODEL_LOCK = threading.Lock()
MODEL_STATUS = "not_loaded"
MODEL_ERROR: str | None = None
MODEL_READY_AT: str | None = None


@dataclass
class ExtractedSource:
    title: str
    tags: list[str]
    text: str
    source_uri: str | None = None
    meta: dict[str, Any] | None = None


class KnowledgeItemAdapter:
    def extract(self, row: dict[str, Any]) -> ExtractedSource:
        title = str(row.get("title") or "").strip()
        tags = [str(tag).strip() for tag in (row.get("tags") or []) if str(tag).strip()]
        plain = str(row.get("plain_text") or "").strip()
        body = plain if plain else extract_text(row.get("content")).strip()
        parts = [title, ", ".join(tags), body]
        return ExtractedSource(
            title=title,
            tags=tags,
            text="\n\n".join(part for part in parts if part),
            meta={"extraction_method": "knowledge_item", "kind": row.get("kind")},
        )


_ITEM_ADAPTER = KnowledgeItemAdapter()


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


def embed_many(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    model = get_model()
    vectors = model.embed([text[:MAX_INPUT_CHARS] for text in texts])
    results: list[list[float]] = []
    for vector in vectors:
        values = vector.tolist() if hasattr(vector, "tolist") else list(vector)
        embedding = [float(v) for v in values]
        if len(embedding) != 384:
            raise ValueError(f"Expected 384-dim embedding, got {len(embedding)}")
        results.append(embedding)
    return results


def embed_text(text: str) -> list[float]:
    return embed_many([text])[0]


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
    with urllib.request.urlopen(request, timeout=60) as response:
        body = response.read().decode("utf-8")
        return json.loads(body) if body else None


def make_chunks(text: str) -> list[dict[str, Any]]:
    normalized = " ".join(text.split())
    if not normalized:
        return []
    chunks: list[dict[str, Any]] = []
    start = 0
    while start < len(normalized) and len(chunks) < MAX_CHUNKS:
        end = min(start + CHUNK_CHARS, len(normalized))
        if end < len(normalized):
            boundary = normalized.rfind(" ", start + max(1, CHUNK_CHARS - 400), end)
            if boundary > start:
                end = boundary
        content = normalized[start:end].strip()
        if content:
            chunks.append(
                {
                    "chunk_index": len(chunks),
                    "content": content,
                    "content_hash": source_hash(content),
                    "char_start": start,
                    "char_end": end,
                    "meta": {},
                }
            )
        if end >= len(normalized):
            break
        start = max(end - CHUNK_OVERLAP, start + 1)
    return chunks


def index_chunks(item_id: str, text: str, digest: str) -> None:
    chunks = make_chunks(text)
    if not chunks:
        rpc(
            "mark_knowledge_item_chunks_indexed",
            {
                "p_item_id": item_id,
                "p_chunk_count": 0,
                "p_source_hash": digest,
            },
        )
        return

    chunk_rows = (
        rpc(
            "upsert_knowledge_chunks",
            {
                "p_item_id": item_id,
                "p_chunks": chunks,
            },
        )
        or []
    )

    if not chunk_rows:
        rpc(
            "mark_knowledge_item_chunks_indexed",
            {
                "p_item_id": item_id,
                "p_chunk_count": 0,
                "p_source_hash": digest,
            },
        )
        return

    texts = [c["content"] for c in chunks]
    try:
        embeddings = embed_many(texts)
    except Exception as exc:
        log("chunk embedding failed", level="error", item_id=item_id, error=str(exc))
        rpc(
            "mark_knowledge_item_chunks_failed",
            {
                "p_item_id": item_id,
                "p_error": str(exc),
            },
        )
        return

    failed = 0
    for chunk_row, emb in zip(chunk_rows, embeddings):
        try:
            rpc(
                "mark_knowledge_chunk_indexed",
                {
                    "p_chunk_id": chunk_row["id"],
                    "p_embedding": emb,
                    "p_model": MODEL_NAME,
                    "p_dimensions": 384,
                },
            )
        except Exception as exc:
            failed += 1
            log("failed to index chunk", level="error", chunk_id=chunk_row.get("id"), error=str(exc))
            try:
                rpc(
                    "mark_knowledge_chunk_failed",
                    {
                        "p_chunk_id": chunk_row["id"],
                        "p_error": str(exc),
                    },
                )
            except Exception:
                pass

    if failed == len(chunk_rows):
        rpc(
            "mark_knowledge_item_chunks_failed",
            {
                "p_item_id": item_id,
                "p_error": f"All {failed} chunks failed to embed",
            },
        )
    else:
        rpc(
            "mark_knowledge_item_chunks_indexed",
            {
                "p_item_id": item_id,
                "p_chunk_count": len(chunk_rows) - failed,
                "p_source_hash": digest,
            },
        )

    log("indexed chunks", item_id=item_id, total=len(chunk_rows), failed=failed)


def index_knowledge_item(row: dict[str, Any]) -> None:
    extracted = _ITEM_ADAPTER.extract(row)
    text = extracted.text.strip()
    if not text:
        rpc(
            "mark_knowledge_item_failed",
            {
                "p_item_id": row["id"],
                "p_error": "No extractable text",
            },
        )
        return

    digest = source_hash(text)
    try:
        embedding = embed_text(text[:MAX_INPUT_CHARS])
    except Exception as exc:
        rpc(
            "mark_knowledge_item_failed",
            {
                "p_item_id": row["id"],
                "p_error": str(exc),
            },
        )
        return

    rpc(
        "mark_knowledge_item_indexed",
        {
            "p_item_id": row["id"],
            "p_embedding": embedding,
            "p_model": MODEL_NAME,
            "p_dimensions": 384,
            "p_source_hash": digest,
        },
    )
    log("indexed knowledge item", item_id=row.get("id"), kind=row.get("kind"), title=row.get("title", "")[:60])

    try:
        index_chunks(row["id"], text, digest)
    except Exception as exc:
        log("chunk indexing failed", level="error", item_id=row.get("id"), error=str(exc))
        try:
            rpc(
                "mark_knowledge_item_chunks_failed",
                {
                    "p_item_id": row["id"],
                    "p_error": str(exc),
                },
            )
        except Exception:
            pass


def indexing_loop() -> None:
    while True:
        try:
            if not resolve_config():
                log("waiting for Supabase config", level="warning")
                time.sleep(POLL_INTERVAL)
                continue

            if callable(should_backoff) and should_backoff():
                avail = get_available_memory_bytes() if callable(get_available_memory_bytes) else None
                avail_mb = (avail or 0) // (1024 * 1024)
                log("memory critically low, pausing indexing", level="warning", available_mb=avail_mb)
                if callable(emit_pressure_notification):
                    emit_pressure_notification("embedder", SUPABASE_URL, SUPABASE_KEY, avail_mb)
                time.sleep(PRESSURE_BACKOFF_SECONDS)
                continue

            effective_batch = BATCH_SIZE
            if callable(compute_batch_size):
                effective_batch = compute_batch_size(BATCH_SIZE)
                if effective_batch < BATCH_SIZE:
                    avail = get_available_memory_bytes() if callable(get_available_memory_bytes) else None
                    avail_mb = (avail or 0) // (1024 * 1024)
                    log(
                        "memory pressure, reducing batch size",
                        level="warning",
                        effective_batch=effective_batch,
                        configured_batch=BATCH_SIZE,
                        available_mb=avail_mb,
                    )

            items = (
                rpc(
                    "lease_knowledge_items_for_indexing",
                    {
                        "p_gateway_slug": GATEWAY_ID,
                        "p_limit": effective_batch,
                        "p_lease_seconds": LEASE_SECONDS,
                    },
                )
                or []
            )

            for row in items:
                try:
                    index_knowledge_item(row)
                except Exception as exc:
                    log("failed to index knowledge item", level="error", item_id=row.get("id"), error=str(exc))
                    try:
                        rpc(
                            "mark_knowledge_item_failed",
                            {
                                "p_item_id": row.get("id"),
                                "p_error": str(exc),
                            },
                        )
                    except Exception as mark_exc:
                        log("failed to mark knowledge item failure", level="error", error=str(mark_exc))

            if not items:
                time.sleep(POLL_INTERVAL)
                continue
        except urllib.error.URLError as exc:
            log("Supabase request failed", level="error", error=str(exc))
            time.sleep(POLL_INTERVAL)
        except Exception as exc:
            log("indexing loop error", level="error", error=str(exc))
            time.sleep(POLL_INTERVAL)


class Handler(BaseHTTPRequestHandler):
    server_version = "HQEmbedder/1.0"

    def _check_auth(self) -> bool:
        if not EMBEDDER_AUTH_TOKEN:
            return True
        auth = self.headers.get("Authorization", "")
        if auth == f"Bearer {EMBEDDER_AUTH_TOKEN}":
            return True
        self.respond_json({"error": "unauthorized"}, status=401)
        return False

    def do_GET(self) -> None:
        if self.path != "/healthz":
            self.send_error(404)
            return
        avail = get_available_memory_bytes() if callable(get_available_memory_bytes) else None
        eff_batch = compute_batch_size(BATCH_SIZE) if callable(compute_batch_size) else BATCH_SIZE
        self.respond_json(
            {
                "ok": True,
                "model": MODEL_NAME,
                "dimensions": 384,
                "model_status": MODEL_STATUS,
                "model_ready_at": MODEL_READY_AT,
                "model_error": MODEL_ERROR,
                "cache_dir": CACHE_DIR,
                "chunk_chars": CHUNK_CHARS,
                "chunk_overlap": CHUNK_OVERLAP,
                "max_chunks": MAX_CHUNKS,
                "adapters": ["knowledge_item"],
                "supabase_configured": bool(SUPABASE_URL or resolve_config()),
                "memory_available_mb": avail // (1024 * 1024) if avail else None,
                "effective_batch_size": eff_batch,
                "configured_batch_size": BATCH_SIZE,
            }
        )

    def do_POST(self) -> None:
        if self.path != "/embed":
            self.send_error(404)
            return
        if not self._check_auth():
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
            text = str(payload.get("input") or "")
            if not text.strip():
                self.respond_json({"error": "input_required"}, status=400)
                return
            embedding = embed_text(text)
            self.respond_json(
                {
                    "embedding": embedding,
                    "model": MODEL_NAME,
                    "dimensions": len(embedding),
                }
            )
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
    try:
        from sentry_init import init_sentry

        init_sentry("embedder")
    except ImportError:
        pass

    os.makedirs(CACHE_DIR, exist_ok=True)
    threading.Thread(target=warm_model_loop, daemon=True).start()
    threading.Thread(target=indexing_loop, daemon=True).start()
    server = ThreadingHTTPServer((HOST, PORT), Handler)
    log("embedder listening", host=HOST, port=PORT, model=MODEL_NAME)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
