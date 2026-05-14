import hashlib
import json
import os
import sys
import types
import pytest

_fastembed_stub = types.ModuleType("fastembed")
_fastembed_stub.TextEmbedding = type("TextEmbedding", (), {"__init__": lambda *a, **kw: None})
sys.modules.setdefault("fastembed", _fastembed_stub)


@pytest.fixture(autouse=True)
def _patch_embedder_globals(monkeypatch):
    fake_model = type("FakeModel", (), {
        "embed": staticmethod(lambda texts: [
            type("V", (), {"tolist": lambda self: [0.1] * 384})()
            for _ in texts
        ])
    })()

    import embedder as emb

    monkeypatch.setattr(emb, "SUPABASE_URL", "https://test.supabase.co")
    monkeypatch.setattr(emb, "SUPABASE_KEY", "test-key")
    monkeypatch.setattr(emb, "GATEWAY_ID", "test-gw")
    monkeypatch.setattr(emb, "_MODEL", fake_model)
    monkeypatch.setattr(emb, "MODEL_STATUS", "ready")
    monkeypatch.setattr(emb, "MODEL_NAME", "test-model")
    monkeypatch.setattr(emb, "CHUNK_CHARS", 3500)
    monkeypatch.setattr(emb, "CHUNK_OVERLAP", 500)
    monkeypatch.setattr(emb, "MAX_CHUNKS", 500)
    monkeypatch.setattr(emb, "MAX_INPUT_CHARS", 6000)


def test_make_chunks_empty_text():
    from embedder import make_chunks

    assert make_chunks("") == []
    assert make_chunks("   ") == []


def test_make_chunks_short_text():
    from embedder import make_chunks

    chunks = make_chunks("Hello world")
    assert len(chunks) == 1
    assert chunks[0]["content"] == "Hello world"
    assert chunks[0]["chunk_index"] == 0
    assert chunks[0]["char_start"] == 0


def test_make_chunks_preserves_content_hash():
    from embedder import make_chunks, source_hash

    chunks = make_chunks("Some text here")
    assert chunks[0]["content_hash"] == source_hash(chunks[0]["content"])


def test_make_chunks_long_text_produces_multiple(monkeypatch):
    import embedder as emb

    monkeypatch.setattr(emb, "CHUNK_CHARS", 100)
    monkeypatch.setattr(emb, "CHUNK_OVERLAP", 20)

    text = " ".join(["word"] * 200)
    chunks = emb.make_chunks(text)
    assert len(chunks) > 1

    for i, chunk in enumerate(chunks):
        assert chunk["chunk_index"] == i
        assert chunk["content"]
        assert chunk["content_hash"]


def test_make_chunks_overlap(monkeypatch):
    import embedder as emb

    monkeypatch.setattr(emb, "CHUNK_CHARS", 50)
    monkeypatch.setattr(emb, "CHUNK_OVERLAP", 10)

    text = " ".join(["abcdef"] * 50)
    chunks = emb.make_chunks(text)

    if len(chunks) >= 2:
        end_of_first = chunks[0]["content"][-10:]
        assert end_of_first in chunks[1]["content"]


def test_make_chunks_respects_max_chunks(monkeypatch):
    import embedder as emb

    monkeypatch.setattr(emb, "CHUNK_CHARS", 10)
    monkeypatch.setattr(emb, "CHUNK_OVERLAP", 2)
    monkeypatch.setattr(emb, "MAX_CHUNKS", 3)

    text = " ".join(["word"] * 200)
    chunks = emb.make_chunks(text)
    assert len(chunks) <= 3


def test_make_chunks_normalizes_whitespace():
    from embedder import make_chunks

    chunks = make_chunks("hello   world\n\n  foo  bar")
    assert "  " not in chunks[0]["content"]


def test_source_hash_deterministic():
    from embedder import source_hash

    a = source_hash("test input")
    b = source_hash("test input")
    assert a == b
    assert a == hashlib.sha256("test input".encode("utf-8")).hexdigest()


def test_source_hash_different_inputs():
    from embedder import source_hash

    assert source_hash("hello") != source_hash("world")


def test_extract_text_none():
    from embedder import extract_text

    assert extract_text(None) == ""


def test_extract_text_string():
    from embedder import extract_text

    assert extract_text("hello") == "hello"


def test_extract_text_number():
    from embedder import extract_text

    assert extract_text(42) == "42"
    assert extract_text(3.14) == "3.14"


def test_extract_text_list():
    from embedder import extract_text

    result = extract_text(["hello", "world"])
    assert "hello" in result
    assert "world" in result


def test_extract_text_dict_with_text_key():
    from embedder import extract_text

    result = extract_text({"text": "paragraph content", "type": "p"})
    assert "paragraph content" in result


def test_extract_text_nested_dict():
    from embedder import extract_text

    result = extract_text({
        "title": "My Doc",
        "content": {"text": "Body text"},
        "children": [{"text": "Child text"}],
    })
    assert "My Doc" in result
    assert "Body text" in result
    assert "Child text" in result


def test_extract_text_json_string():
    from embedder import extract_text

    result = extract_text(json.dumps({"text": "from json"}))
    assert "from json" in result


def test_extract_text_bool():
    from embedder import extract_text

    assert extract_text(True) == "True"


def test_embed_many_empty():
    from embedder import embed_many

    assert embed_many([]) == []


def test_embed_many_returns_384_dim():
    from embedder import embed_many

    results = embed_many(["test text"])
    assert len(results) == 1
    assert len(results[0]) == 384
    assert all(isinstance(v, float) for v in results[0])


def test_embed_many_multiple():
    from embedder import embed_many

    results = embed_many(["one", "two", "three"])
    assert len(results) == 3


def test_embed_text_returns_single():
    from embedder import embed_text

    result = embed_text("hello")
    assert len(result) == 384


def test_embed_many_truncates_to_max_input_chars(monkeypatch):
    import embedder as emb

    monkeypatch.setattr(emb, "MAX_INPUT_CHARS", 10)

    captured = []
    original_model = emb._MODEL

    class TrackingModel:
        def embed(self, texts):
            captured.extend(texts)
            return original_model.embed(texts)

    monkeypatch.setattr(emb, "_MODEL", TrackingModel())

    emb.embed_many(["x" * 100])
    assert len(captured[0]) == 10


def test_knowledge_item_adapter_basic():
    from embedder import KnowledgeItemAdapter

    adapter = KnowledgeItemAdapter()
    row = {
        "title": "Test Item",
        "tags": ["python", "testing"],
        "plain_text": "This is the content",
        "kind": "page",
    }
    extracted = adapter.extract(row)
    assert extracted.title == "Test Item"
    assert "python" in extracted.tags
    assert "This is the content" in extracted.text
    assert extracted.meta["kind"] == "page"


def test_knowledge_item_adapter_empty_plain_text_uses_content():
    from embedder import KnowledgeItemAdapter

    adapter = KnowledgeItemAdapter()
    row = {
        "title": "Item",
        "tags": [],
        "plain_text": "",
        "content": {"text": "fallback content"},
        "kind": "skill",
    }
    extracted = adapter.extract(row)
    assert "fallback content" in extracted.text


def test_knowledge_item_adapter_missing_fields():
    from embedder import KnowledgeItemAdapter

    adapter = KnowledgeItemAdapter()
    row = {"kind": "page"}
    extracted = adapter.extract(row)
    assert extracted.title == ""
    assert extracted.tags == []


def test_index_knowledge_item_calls_rpc(monkeypatch):
    import embedder as emb

    rpc_calls = []

    def fake_rpc(fn_name, payload):
        rpc_calls.append((fn_name, payload))
        return None

    monkeypatch.setattr(emb, "rpc", fake_rpc)

    row = {
        "id": "item-1",
        "title": "Test",
        "tags": [],
        "plain_text": "Some content here",
        "kind": "page",
    }

    emb.index_knowledge_item(row)

    fn_names = [c[0] for c in rpc_calls]
    assert "mark_knowledge_item_indexed" in fn_names


def test_index_knowledge_item_no_text_marks_failed(monkeypatch):
    import embedder as emb

    rpc_calls = []

    def fake_rpc(fn_name, payload):
        rpc_calls.append((fn_name, payload))
        return None

    monkeypatch.setattr(emb, "rpc", fake_rpc)

    row = {
        "id": "item-empty",
        "title": "",
        "tags": [],
        "plain_text": "",
        "kind": "page",
    }

    emb.index_knowledge_item(row)

    fn_names = [c[0] for c in rpc_calls]
    assert "mark_knowledge_item_failed" in fn_names
    assert rpc_calls[0][1]["p_error"] == "No extractable text"


def test_index_chunks_empty_text(monkeypatch):
    import embedder as emb

    rpc_calls = []

    def fake_rpc(fn_name, payload):
        rpc_calls.append((fn_name, payload))
        return None

    monkeypatch.setattr(emb, "rpc", fake_rpc)

    emb.index_chunks("item-1", "", "hash")

    assert rpc_calls[0][0] == "mark_knowledge_item_chunks_indexed"
    assert rpc_calls[0][1]["p_chunk_count"] == 0


def test_index_chunks_with_content(monkeypatch):
    import embedder as emb

    rpc_calls = []

    def fake_rpc(fn_name, payload):
        rpc_calls.append((fn_name, payload))
        if fn_name == "upsert_knowledge_chunks":
            chunks = payload["p_chunks"]
            return [{"id": f"chunk-{i}"} for i in range(len(chunks))]
        return None

    monkeypatch.setattr(emb, "rpc", fake_rpc)

    emb.index_chunks("item-1", "Hello world content", "hash123")

    fn_names = [c[0] for c in rpc_calls]
    assert "upsert_knowledge_chunks" in fn_names
    assert "mark_knowledge_chunk_indexed" in fn_names
    assert "mark_knowledge_item_chunks_indexed" in fn_names


def test_index_chunks_embed_failure_marks_failed(monkeypatch):
    import embedder as emb

    rpc_calls = []

    def fake_rpc(fn_name, payload):
        rpc_calls.append((fn_name, payload))
        if fn_name == "upsert_knowledge_chunks":
            return [{"id": "chunk-1"}]
        return None

    monkeypatch.setattr(emb, "rpc", fake_rpc)

    def failing_embed(texts):
        raise RuntimeError("embedding service down")

    monkeypatch.setattr(emb, "embed_many", failing_embed)

    emb.index_chunks("item-1", "Some text", "hash")

    fn_names = [c[0] for c in rpc_calls]
    assert "mark_knowledge_item_chunks_failed" in fn_names


def test_handler_healthz(monkeypatch):
    import embedder as emb
    from io import BytesIO

    monkeypatch.setattr(emb, "MODEL_STATUS", "ready")
    monkeypatch.setattr(emb, "MODEL_READY_AT", "2025-01-01T00:00:00Z")
    monkeypatch.setattr(emb, "MODEL_ERROR", None)

    response_data = {}

    class FakeHandler(emb.Handler):
        def __init__(self):
            self.path = "/healthz"
            self._headers_buffer = []
            self.wfile = BytesIO()
            self.requestline = "GET /healthz HTTP/1.1"

        def send_response(self, code):
            response_data["status"] = code

        def send_header(self, key, value):
            self._headers_buffer.append((key, value))

        def end_headers(self):
            pass

    handler = FakeHandler()
    handler.do_GET()

    assert response_data["status"] == 200
    body = json.loads(handler.wfile.getvalue().decode())
    assert body["ok"] is True
    assert body["model"] == "test-model"
    assert body["dimensions"] == 384
    assert body["model_status"] == "ready"


def test_handler_healthz_404_wrong_path(monkeypatch):
    import embedder as emb
    from io import BytesIO

    response_data = {}

    class FakeHandler(emb.Handler):
        def __init__(self):
            self.path = "/unknown"
            self.wfile = BytesIO()
            self.requestline = "GET /unknown HTTP/1.1"
            self._headers_buffer = []

        def send_error(self, code):
            response_data["status"] = code

        def send_response(self, code):
            response_data["status"] = code

        def send_header(self, key, value):
            pass

        def end_headers(self):
            pass

    handler = FakeHandler()
    handler.do_GET()
    assert response_data["status"] == 404


def test_handler_embed_endpoint(monkeypatch):
    import embedder as emb
    from io import BytesIO

    response_data = {}
    payload = json.dumps({"input": "hello world"}).encode()

    class FakeHandler(emb.Handler):
        def __init__(self):
            self.path = "/embed"
            self.headers = {"Content-Length": str(len(payload))}
            self.rfile = BytesIO(payload)
            self.wfile = BytesIO()
            self.requestline = "POST /embed HTTP/1.1"
            self._headers_buffer = []

        def send_response(self, code):
            response_data["status"] = code

        def send_header(self, key, value):
            self._headers_buffer.append((key, value))

        def end_headers(self):
            pass

    handler = FakeHandler()
    handler.do_POST()

    assert response_data["status"] == 200
    body = json.loads(handler.wfile.getvalue().decode())
    assert "embedding" in body
    assert body["dimensions"] == 384
    assert len(body["embedding"]) == 384


def test_handler_embed_empty_input(monkeypatch):
    import embedder as emb
    from io import BytesIO

    response_data = {}
    payload = json.dumps({"input": ""}).encode()

    class FakeHandler(emb.Handler):
        def __init__(self):
            self.path = "/embed"
            self.headers = {"Content-Length": str(len(payload))}
            self.rfile = BytesIO(payload)
            self.wfile = BytesIO()
            self.requestline = "POST /embed HTTP/1.1"
            self._headers_buffer = []

        def send_response(self, code):
            response_data["status"] = code

        def send_header(self, key, value):
            pass

        def end_headers(self):
            pass

    handler = FakeHandler()
    handler.do_POST()

    assert response_data["status"] == 400
    body = json.loads(handler.wfile.getvalue().decode())
    assert body["error"] == "input_required"


def test_handler_embed_404_wrong_path(monkeypatch):
    import embedder as emb
    from io import BytesIO

    response_data = {}

    class FakeHandler(emb.Handler):
        def __init__(self):
            self.path = "/wrong"
            self.wfile = BytesIO()
            self.requestline = "POST /wrong HTTP/1.1"

        def send_error(self, code):
            response_data["status"] = code

    handler = FakeHandler()
    handler.do_POST()
    assert response_data["status"] == 404


def test_resolve_config_from_env(monkeypatch):
    import embedder as emb

    monkeypatch.setenv("SUPABASE_URL", "https://env.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "env-key")

    monkeypatch.setattr(emb, "SUPABASE_URL", "")
    monkeypatch.setattr(emb, "SUPABASE_KEY", "")

    result = emb.resolve_config()
    assert result is True
    assert emb.SUPABASE_URL == "https://env.supabase.co"
    assert emb.SUPABASE_KEY == "env-key"


def test_resolve_config_missing(monkeypatch):
    import embedder as emb

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setenv("SUPABASE_URL", "")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "")
    monkeypatch.setattr(emb, "resolve_hq_config", None)

    monkeypatch.setattr(emb, "SUPABASE_URL", "")
    monkeypatch.setattr(emb, "SUPABASE_KEY", "")

    result = emb.resolve_config()
    assert result is False
