"""Tests for hq_comment_on.py — comment posting with @mention extraction."""

import re
import subprocess
import sys

SCRIPT = "templates/_shared/skills/hq/scripts/hq_comment_on.py"


def run_script(args, env_overrides=None):
    """Run hq_comment_on.py as a subprocess with mocked env."""
    import os

    env = {
        **os.environ,
        "SUPABASE_URL": "https://test.supabase.co",
        "SUPABASE_SERVICE_ROLE_KEY": "test-key",
        "AGENT_SLUG": "test-agent",
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


class TestMentionExtraction:
    """Test the @mention regex used by hq_comment_on.py.

    The script uses: list(set(re.findall(r'@[\\w-]+', body)))
    """

    def test_single_mention(self):
        body = "Hey @alice can you look at this?"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@alice"]

    def test_multiple_mentions(self):
        body = "@alice and @bob please review"
        mentions = sorted(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@alice", "@bob"]

    def test_duplicate_mentions_deduped(self):
        body = "@alice do this, @alice do that"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@alice"]

    def test_hyphenated_slug(self):
        body = "Hey @research-agent check this"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@research-agent"]

    def test_no_mentions(self):
        body = "Just a regular comment with no tags"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == []

    def test_mention_at_start(self):
        body = "@writer please draft this"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@writer"]

    def test_mention_at_end(self):
        body = "Please handle this @writer"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        assert mentions == ["@writer"]

    def test_email_not_extracted_as_mention(self):
        body = "Contact me at user@example.com"
        mentions = list(set(re.findall(r"@[\w-]+", body)))
        # regex will match @example — this is a known limitation
        assert "@example" in mentions


class TestScriptArgs:
    def test_requires_entity_type(self):
        result = run_script([])
        assert result.returncode != 0

    def test_requires_entity_id(self):
        result = run_script(["task"])
        assert result.returncode != 0

    def test_requires_body(self):
        result = run_script(["task", "some-uuid"])
        assert result.returncode != 0
