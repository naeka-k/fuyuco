import json
import sqlite3

from web.service.utils import attach_tags, parse_urls, urls_to_json


class TestParseUrls:
    def test_none_returns_empty_list(self):
        assert parse_urls(None) == []

    def test_empty_string_returns_empty_list(self):
        assert parse_urls("") == []

    def test_valid_json_array(self):
        result = parse_urls('["https://a.com", "https://b.com"]')
        assert result == ["https://a.com", "https://b.com"]

    def test_filters_empty_strings_in_array(self):
        assert parse_urls('["https://a.com", ""]') == ["https://a.com"]

    def test_all_empty_strings_returns_empty_list(self):
        assert parse_urls('["", ""]') == []

    def test_non_json_treated_as_single_url(self):
        assert parse_urls("https://example.com") == ["https://example.com"]


class TestUrlsToJson:
    def test_empty_list_returns_none(self):
        assert urls_to_json([]) is None

    def test_none_returns_none(self):
        assert urls_to_json(None) is None

    def test_list_with_only_empty_strings_returns_none(self):
        assert urls_to_json(["", ""]) is None

    def test_filters_empty_strings(self):
        result = urls_to_json(["https://a.com", ""])
        assert json.loads(result) == ["https://a.com"]

    def test_multiple_urls_serialized(self):
        result = urls_to_json(["https://a.com", "https://b.com"])
        assert json.loads(result) == ["https://a.com", "https://b.com"]


class TestAttachTags:
    def _make_conn(self):
        conn = sqlite3.connect(":memory:")
        conn.row_factory = sqlite3.Row
        conn.execute("CREATE TABLE tags (id INTEGER PRIMARY KEY, name TEXT, color TEXT)")
        conn.execute("CREATE TABLE item_tag_links (item_id INTEGER, tag_id INTEGER)")
        return conn

    def test_empty_items_returned_unchanged(self):
        conn = self._make_conn()
        assert attach_tags(conn, [], "item_tag_links", "item_id", "tags") == []

    def test_item_with_tag_gets_tags_list(self):
        conn = self._make_conn()
        conn.execute("INSERT INTO tags VALUES (10, 'tagA', '#ff0000')")
        conn.execute("INSERT INTO item_tag_links VALUES (1, 10)")
        items = [{"id": 1}]
        result = attach_tags(conn, items, "item_tag_links", "item_id", "tags")
        assert result[0]["tags"] == [{"id": 10, "name": "tagA", "color": "#ff0000"}]

    def test_item_without_tag_gets_empty_tags_list(self):
        conn = self._make_conn()
        items = [{"id": 1}]
        result = attach_tags(conn, items, "item_tag_links", "item_id", "tags")
        assert result[0]["tags"] == []

    def test_multiple_items_tags_assigned_correctly(self):
        conn = self._make_conn()
        conn.execute("INSERT INTO tags VALUES (1, 'A', '#aaa')")
        conn.execute("INSERT INTO tags VALUES (2, 'B', '#bbb')")
        conn.execute("INSERT INTO item_tag_links VALUES (10, 1)")
        conn.execute("INSERT INTO item_tag_links VALUES (20, 2)")
        items = [{"id": 10}, {"id": 20}]
        result = attach_tags(conn, items, "item_tag_links", "item_id", "tags")
        assert result[0]["tags"][0]["name"] == "A"
        assert result[1]["tags"][0]["name"] == "B"

    def test_item_can_have_multiple_tags(self):
        conn = self._make_conn()
        conn.execute("INSERT INTO tags VALUES (1, 'A', '#aaa')")
        conn.execute("INSERT INTO tags VALUES (2, 'B', '#bbb')")
        conn.execute("INSERT INTO item_tag_links VALUES (5, 1)")
        conn.execute("INSERT INTO item_tag_links VALUES (5, 2)")
        items = [{"id": 5}]
        result = attach_tags(conn, items, "item_tag_links", "item_id", "tags")
        assert len(result[0]["tags"]) == 2
