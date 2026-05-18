import hashlib

from connectors.base import (
    BrowseResult,
    ChangesResult,
    SourceContent,
    SourceItem,
)


def test_content_hash_is_stable_sha256():
    content = SourceContent(
        markdown="# Test\n\nHello world",
        title="Test",
        source_url="https://example.com",
    )
    expected = hashlib.sha256(b"# Test\n\nHello world").hexdigest()
    assert content.content_hash == expected
    assert content.content_hash == expected


def test_content_hash_changes_with_content():
    c1 = SourceContent(markdown="aaa", title="A", source_url="")
    c2 = SourceContent(markdown="bbb", title="A", source_url="")
    assert c1.content_hash != c2.content_hash


def test_source_content_defaults():
    c = SourceContent(markdown="md", title="T", source_url="u")
    assert c.properties == {}
    assert c.mime_type is None
    assert c.raw_bytes is None


def test_source_item_defaults():
    item = SourceItem(
        external_id="ext-1",
        title="Page 1",
        source_url="https://example.com/1",
        item_type="page",
    )
    assert item.last_modified is None
    assert item.parent_id is None
    assert item.has_children is False
    assert item.meta == {}


def test_browse_result_defaults():
    result = BrowseResult()
    assert result.items == []


def test_changes_result_defaults():
    result = ChangesResult()
    assert result.modified == []
    assert result.deleted == []
    assert result.cursor is None


def test_registry_returns_none_for_unknown_provider(monkeypatch):
    from connectors.registry import get_action_provider, get_connector

    monkeypatch.setattr("connectors.registry._discovered", True)
    monkeypatch.setattr("connectors.registry.CONNECTORS", {})
    monkeypatch.setattr("connectors.registry.ACTION_PROVIDERS", {})

    assert get_connector("nonexistent") is None
    assert get_action_provider("nonexistent") is None


def test_registry_returns_known_connector(monkeypatch):
    from connectors.base import BaseConnector
    from connectors.registry import get_connector

    class FakeConnector(BaseConnector):
        def validate_credentials(self, creds):
            return True

        def browse(self, creds, parent_id=None, search=None):
            return BrowseResult()

        def list_items(self, creds, external_ids):
            return []

        def fetch_item(self, creds, external_id):
            return SourceContent(markdown="", title="", source_url="")

        def detect_changes(self, creds, since, known_ids):
            return ChangesResult()

    monkeypatch.setattr("connectors.registry._discovered", True)
    monkeypatch.setattr("connectors.registry.CONNECTORS", {"fake": FakeConnector()})

    result = get_connector("fake")
    assert result is not None
    assert isinstance(result, BaseConnector)
