import pytest


def test_extract_text_markdown_returns_content():
    from file_processor import extract_text

    data = b"# Hello\n\nThis is markdown."
    result = extract_text(data, "text/markdown", "doc.md")
    assert result is not None
    assert "Hello" in result
    assert "markdown" in result


def test_extract_text_plain_text():
    from file_processor import extract_text

    data = b"plain text content here"
    result = extract_text(data, "text/plain", "notes.txt")
    assert result == "plain text content here"


def test_extract_text_image_returns_none():
    from file_processor import extract_text

    data = b"\x89PNG\r\n\x1a\n"
    result = extract_text(data, "image/png", "photo.png")
    assert result is None


def test_extract_text_csv():
    from file_processor import extract_text

    data = b"name,age\nAlice,30\nBob,25\n"
    result = extract_text(data, "text/csv", "data.csv")
    assert result is not None
    assert "Alice" in result
    assert "30" in result
    assert "Bob" in result


def test_extract_text_csv_by_extension():
    from file_processor import extract_text

    data = b"col1,col2\nval1,val2\n"
    result = extract_text(data, None, "report.csv")
    assert result is not None
    assert "col1" in result


def test_extract_text_json_as_text():
    from file_processor import extract_text

    data = b'{"key": "value"}'
    result = extract_text(data, None, "config.json")
    assert result is not None
    assert "key" in result


def test_extract_text_unknown_binary_returns_none():
    from file_processor import extract_text

    data = bytes(range(256))
    result = extract_text(data, "application/octet-stream", "blob.bin")
    assert result is None


def test_extract_text_python_file():
    from file_processor import extract_text

    data = b"def hello():\n    print('hi')\n"
    result = extract_text(data, None, "script.py")
    assert result is not None
    assert "def hello" in result


def test_resolve_config_uses_cfg_url_not_supabase_url(monkeypatch):
    """Validates the bug fix: resolve_config must use cfg.url, not cfg.supabase_url."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    import file_processor

    class FakeConfig:
        url = "https://resolved.supabase.co"
        service_role_key = "resolved-key"
        source = "registry"

    monkeypatch.setattr(file_processor, "resolve_hq_config", lambda: FakeConfig())

    result = file_processor.resolve_config()
    assert result is True
    assert file_processor.SUPABASE_URL == "https://resolved.supabase.co"
    assert file_processor.SUPABASE_KEY == "resolved-key"


def test_resolve_config_from_env(monkeypatch):
    import file_processor

    monkeypatch.setenv("SUPABASE_URL", "https://env.supabase.co")
    monkeypatch.setenv("SUPABASE_SERVICE_ROLE_KEY", "env-key")

    result = file_processor.resolve_config()
    assert result is True
    assert file_processor.SUPABASE_URL == "https://env.supabase.co"


def test_resolve_config_returns_false_when_empty(monkeypatch):
    import file_processor

    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)
    monkeypatch.setattr(file_processor, "resolve_hq_config", None)

    result = file_processor.resolve_config()
    assert result is False
