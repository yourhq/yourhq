"""Tests for hq_submit_deliverable.py — deliverable submission and update."""

import json
import subprocess
import sys

import pytest

SCRIPT = "templates/_shared/skills/hq/scripts/hq_submit_deliverable.py"


def run_script(args, env_overrides=None):
    """Run hq_submit_deliverable.py as a subprocess with mocked env."""
    import os

    env = {
        **os.environ,
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-key",
        "AGENT_SLUG": "test-agent",
        "EMBEDDER_URL": "http://localhost:0",
    }
    if env_overrides:
        env.update(env_overrides)
    result = subprocess.run(
        [sys.executable, SCRIPT, *args],
        capture_output=True,
        text=True,
        env=env,
        timeout=10,
    )
    return result


@pytest.fixture(autouse=True)
def _setup_paths():
    import os

    os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
    os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-key")
    os.environ.setdefault("AGENT_SLUG", "test-agent")
    os.environ.setdefault("EMBEDDER_URL", "http://localhost:0")

    scripts_dir = "templates/_shared/skills/hq/scripts"
    if scripts_dir not in sys.path:
        sys.path.insert(0, scripts_dir)


class TestContentForStorage:
    def test_converts_markdown_to_tiptap_and_plain(self):
        from hq_base import content_for_storage

        tiptap_json, plain_text = content_for_storage("# Hello\n\nWorld")
        assert plain_text == "# Hello\n\nWorld"
        parsed = json.loads(tiptap_json)
        assert parsed["type"] == "doc"
        assert len(parsed["content"]) >= 1

    def test_empty_content_returns_none(self):
        from hq_base import content_for_storage

        assert content_for_storage("") == (None, None)
        assert content_for_storage("   ") == (None, None)

    def test_none_content_returns_none(self):
        from hq_base import content_for_storage

        assert content_for_storage(None) == (None, None)


class TestBuildEmbeddingInput:
    def test_title_only(self):
        from hq_base import build_embedding_input

        result = build_embedding_input("My Title")
        assert result == "My Title"

    def test_title_with_content(self):
        from hq_base import build_embedding_input

        result = build_embedding_input("Title", "Some body content")
        assert "Title" in result
        assert "Some body content" in result

    def test_title_with_tags(self):
        from hq_base import build_embedding_input

        result = build_embedding_input("Title", None, ["tag1", "tag2"])
        assert "tag1" in result
        assert "tag2" in result

    def test_truncates_to_6000(self):
        from hq_base import build_embedding_input

        long_content = "x" * 10000
        result = build_embedding_input("Title", long_content)
        assert len(result) <= 6000


class TestMarkdownToTiptap:
    def test_heading_conversion(self):
        from hq_base import markdown_to_tiptap

        result = markdown_to_tiptap("# Heading 1")
        nodes = result["content"]
        heading = nodes[0]
        assert heading["type"] == "heading"
        assert heading["attrs"]["level"] == 1

    def test_paragraph_conversion(self):
        from hq_base import markdown_to_tiptap

        result = markdown_to_tiptap("Just a paragraph")
        nodes = result["content"]
        assert nodes[0]["type"] == "paragraph"

    def test_bullet_list_conversion(self):
        from hq_base import markdown_to_tiptap

        result = markdown_to_tiptap("- item one\n- item two")
        nodes = result["content"]
        assert any(n["type"] == "bulletList" for n in nodes)

    def test_code_block_conversion(self):
        from hq_base import markdown_to_tiptap

        result = markdown_to_tiptap("```python\nprint('hi')\n```")
        nodes = result["content"]
        assert any(n["type"] == "codeBlock" for n in nodes)

    def test_bold_inline_mark(self):
        from hq_base import markdown_to_tiptap

        result = markdown_to_tiptap("This is **bold** text")
        para = result["content"][0]
        bold_nodes = [c for c in para["content"] if c.get("marks") and any(m["type"] == "bold" for m in c["marks"])]
        assert len(bold_nodes) >= 1


class TestScriptArgs:
    def test_requires_task_id(self):
        result = run_script(["--title", "Test"])
        assert result.returncode != 0

    def test_requires_title(self):
        result = run_script(["--task-id", "some-uuid"])
        assert result.returncode != 0

    def test_type_choices_validated(self):
        result = run_script(["--task-id", "some-uuid", "--type", "invalid", "--title", "Test"])
        assert result.returncode != 0
        assert "invalid choice" in result.stderr


class TestExtractText:
    def test_plain_string(self):
        from hq_base import extract_text

        assert extract_text("hello") == "hello"

    def test_tiptap_doc(self):
        from hq_base import extract_text

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Hello world"}],
                }
            ],
        }
        result = extract_text(doc)
        assert "Hello world" in result

    def test_none_returns_empty(self):
        from hq_base import extract_text

        assert extract_text(None) == ""

    def test_nested_content(self):
        from hq_base import extract_text

        doc = {
            "type": "doc",
            "content": [
                {
                    "type": "heading",
                    "content": [{"type": "text", "text": "Title"}],
                },
                {
                    "type": "paragraph",
                    "content": [{"type": "text", "text": "Body"}],
                },
            ],
        }
        result = extract_text(doc)
        assert "Title" in result
        assert "Body" in result
