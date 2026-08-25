import pytest

from web.repository.db_conn import get_todo_conn
from web.repository.todo_repo import (
    create_label_link,
    create_todo,
    create_todo_label,
    create_todo_memo,
    delete_label_link,
    delete_todo,
    delete_todo_label,
    delete_todo_memo,
    get_all_todo_labels,
    get_all_todos,
    get_label_links,
    get_todo_memo_log,
    get_todo_memos,
    set_todo_status,
    toggle_todo,
    update_label_link,
    update_todo,
    update_todo_label,
    update_todo_label_color,
    update_todo_memo,
)


class TestCreateTodo:
    def test_basic_fields(self, db):
        todo = create_todo("Test task", "2023-06-01T10:00:00")
        assert todo["title"] == "Test task"
        assert todo["deadline"] == "2023-06-01T10:00:00"
        assert todo["status"] == "todo"
        assert todo["done"] == 0
        assert todo["tags"] == []
        assert todo["urls"] == []

    def test_no_deadline(self, db):
        todo = create_todo("No deadline", None)
        assert todo["deadline"] is None

    def test_recurrence_sets_recurrence_id_to_own_id(self, db):
        todo = create_todo("Daily", "2023-06-01T09:00:00", recurrence='{"type":"daily"}')
        assert todo["recurrence_id"] == todo["id"]

    def test_without_recurrence_recurrence_id_is_none(self, db):
        todo = create_todo("Simple", "2023-06-01T00:00:00")
        assert todo["recurrence_id"] is None

    def test_with_urls(self, db):
        todo = create_todo("Task", None, urls=["https://example.com"])
        assert todo["urls"] == ["https://example.com"]


class TestGetAllTodos:
    def test_empty_database_returns_empty_list(self, db):
        assert get_all_todos() == []

    def test_returns_all_created_todos(self, db):
        create_todo("Task 1", "2023-06-01T00:00:00")
        create_todo("Task 2", "2023-06-02T00:00:00")
        assert len(get_all_todos()) == 2

    def test_filter_by_label_returns_only_linked_todos(self, db):
        label = create_todo_label("Work", "#ff0000")
        t1 = create_todo("Task 1", "2023-06-01T00:00:00")
        t2 = create_todo("Task 2", "2023-06-02T00:00:00")
        update_todo(t1["id"], "Task 1", "2023-06-01T00:00:00", None, [], [label["id"]], None)

        result = get_all_todos(tag_id=label["id"])
        ids = [t["id"] for t in result]
        assert t1["id"] in ids
        assert t2["id"] not in ids


class TestToggleTodo:
    def test_cycles_todo_doing_done_todo(self, db):
        todo = create_todo("Cycle", "2023-06-01T00:00:00")
        assert toggle_todo(todo["id"])["status"] == "doing"
        assert toggle_todo(todo["id"])["status"] == "done"
        assert toggle_todo(todo["id"])["status"] == "todo"

    def test_missing_id_returns_none(self, db):
        assert toggle_todo(9999) is None


class TestSetTodoStatus:
    def test_set_to_doing(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        result = set_todo_status(todo["id"], "doing")
        assert result["status"] == "doing"
        assert result["done"] == 0

    def test_set_to_done_sets_done_flag(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        result = set_todo_status(todo["id"], "done")
        assert result["status"] == "done"
        assert result["done"] == 1

    def test_set_to_todo_clears_done_flag(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "done")
        result = set_todo_status(todo["id"], "todo")
        assert result["status"] == "todo"
        assert result["done"] == 0

    def test_missing_id_returns_none(self, db):
        assert set_todo_status(9999, "done") is None

    def test_set_to_waiting(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        result = set_todo_status(todo["id"], "waiting")
        assert result["status"] == "waiting"
        assert result["done"] == 0

    def test_invalid_status_raises_value_error(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        with pytest.raises(ValueError):
            set_todo_status(todo["id"], "invalid")

    def test_done_with_recurrence_spawns_next_todo(self, db):
        todo = create_todo("Daily", "2023-06-01T09:00:00", recurrence='{"type":"daily"}')
        set_todo_status(todo["id"], "done")
        deadlines = [t["deadline"] for t in get_all_todos()]
        assert "2023-06-02T09:00:00" in deadlines

    def test_done_without_recurrence_does_not_spawn(self, db):
        todo = create_todo("One-off", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "done")
        assert len(get_all_todos()) == 1

    def _get_status_log(self, todo_id):
        with get_todo_conn() as conn:
            rows = conn.execute(
                "SELECT * FROM todo_status_log WHERE todo_id = ?", (todo_id,)
            ).fetchall()
            return [dict(row) for row in rows]

    def test_status_change_is_logged(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "doing")
        rows = self._get_status_log(todo["id"])
        assert len(rows) == 1
        assert rows[0]["old_status"] == "todo"
        assert rows[0]["new_status"] == "doing"
        assert rows[0]["comment"] is None

    def test_status_change_with_comment_is_logged(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "doing", "念のため確認中")
        rows = self._get_status_log(todo["id"])
        assert rows[0]["comment"] == "念のため確認中"

    def test_status_change_does_not_create_memo(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "doing")
        assert get_todo_memos(todo["id"]) == []

    def test_no_status_change_does_not_log(self, db):
        todo = create_todo("Task", "2023-06-01T00:00:00")
        set_todo_status(todo["id"], "todo")
        assert self._get_status_log(todo["id"]) == []


class TestDeleteTodo:
    def test_delete_existing_returns_true(self, db):
        todo = create_todo("Task", None)
        assert delete_todo(todo["id"]) is True

    def test_delete_missing_returns_false(self, db):
        assert delete_todo(9999) is False

    def test_deleted_todo_absent_from_list(self, db):
        todo = create_todo("Task", None)
        delete_todo(todo["id"])
        assert get_all_todos() == []

    def test_delete_removes_label_links(self, db):
        todo = create_todo("Task", None)
        label = create_todo_label("Work", "#ff0000")
        update_todo(todo["id"], "Task", None, None, [], [label["id"]], None)
        delete_todo(todo["id"])
        labels = get_all_todo_labels()
        assert any(l["id"] == label["id"] for l in labels)


class TestUpdateTodo:
    def test_update_title_and_deadline(self, db):
        todo = create_todo("Old", "2023-06-01T00:00:00")
        result = update_todo(todo["id"], "New", "2023-07-01T00:00:00", None, [], [], None)
        assert result["title"] == "New"
        assert result["deadline"] == "2023-07-01T00:00:00"

    def test_update_urls(self, db):
        todo = create_todo("Task", None)
        result = update_todo(todo["id"], "Task", None, None, ["https://example.com"], [], None)
        assert "https://example.com" in result["urls"]

    def test_update_labels(self, db):
        todo = create_todo("Task", None)
        label = create_todo_label("Work", "#ff0000")
        result = update_todo(todo["id"], "Task", None, None, [], [label["id"]], None)
        assert any(t["id"] == label["id"] for t in result["tags"])

    def test_update_replaces_existing_labels(self, db):
        todo = create_todo("Task", None)
        l1 = create_todo_label("Work", "#ff0000")
        l2 = create_todo_label("Home", "#0000ff")
        update_todo(todo["id"], "Task", None, None, [], [l1["id"]], None)
        result = update_todo(todo["id"], "Task", None, None, [], [l2["id"]], None)
        tag_ids = [t["id"] for t in result["tags"]]
        assert l1["id"] not in tag_ids
        assert l2["id"] in tag_ids

    def test_update_with_empty_labels_clears_all(self, db):
        todo = create_todo("Task", None)
        label = create_todo_label("Work", "#ff0000")
        update_todo(todo["id"], "Task", None, None, [], [label["id"]], None)
        result = update_todo(todo["id"], "Task", None, None, [], [], None)
        assert result["tags"] == []

    def test_missing_id_returns_none(self, db):
        assert update_todo(9999, "Title", None, None, [], [], None) is None


class TestTodoMemos:
    def test_create_and_retrieve_memo(self, db):
        todo = create_todo("Task", None)
        memo = create_todo_memo(todo["id"], "Memo content")
        assert memo["content"] == "Memo content"
        assert memo["todo_id"] == todo["id"]
        memos = get_todo_memos(todo["id"])
        assert len(memos) == 1
        assert memos[0]["content"] == "Memo content"

    def test_memo_captures_status_at_creation_time(self, db):
        todo = create_todo("Task", None)
        set_todo_status(todo["id"], "doing")
        memo = create_todo_memo(todo["id"], "In progress note")
        assert memo["status"] == "doing"

        set_todo_status(todo["id"], "done")
        later_memo = create_todo_memo(todo["id"], "Done note")
        assert later_memo["status"] == "done"
        memos_by_content = {m["content"]: m for m in get_todo_memos(todo["id"])}
        assert memos_by_content["In progress note"]["status"] == "doing"

    def test_no_memos_returns_empty_list(self, db):
        todo = create_todo("Task", None)
        assert get_todo_memos(todo["id"]) == []

    def test_update_memo_content(self, db):
        todo = create_todo("Task", None)
        memo = create_todo_memo(todo["id"], "Old content")
        updated = update_todo_memo(memo["id"], "New content")
        assert updated["content"] == "New content"

    def test_update_missing_memo_returns_none(self, db):
        assert update_todo_memo(9999, "content") is None

    def test_delete_memo(self, db):
        todo = create_todo("Task", None)
        memo = create_todo_memo(todo["id"], "Content")
        assert delete_todo_memo(memo["id"]) is True
        assert get_todo_memos(todo["id"]) == []

    def test_delete_missing_memo_returns_false(self, db):
        assert delete_todo_memo(9999) is False

    def test_multiple_memos_all_returned(self, db):
        todo = create_todo("Task", None)
        create_todo_memo(todo["id"], "First")
        create_todo_memo(todo["id"], "Second")
        memos = get_todo_memos(todo["id"])
        assert len(memos) == 2
        assert {m["content"] for m in memos} == {"First", "Second"}


class TestTodoMemoLog:
    def _set_memo_created_at(self, memo_id, created_at):
        with get_todo_conn() as conn:
            conn.execute(
                "UPDATE todo_memos SET created_at = ? WHERE id = ?",
                (created_at, memo_id)
            )

    def test_entry_includes_todo_and_label_info(self, db):
        label = create_todo_label("Work", "#ff0000")
        todo = create_todo("Task", None)
        update_todo(todo["id"], "Task", None, None, [], [label["id"]], None)
        create_todo_memo(todo["id"], "Did something")

        entries = get_todo_memo_log()
        assert len(entries) == 1
        assert entries[0]["content"] == "Did something"
        assert entries[0]["todo_title"] == "Task"
        assert entries[0]["labels"] == ["Work"]
        assert entries[0]["todo_status_label"] == "未着手"

    def test_no_entries_returns_empty_list(self, db):
        assert get_todo_memo_log() == []

    def test_filters_by_date_range(self, db):
        todo = create_todo("Task", None)
        old_memo = create_todo_memo(todo["id"], "Old entry")
        new_memo = create_todo_memo(todo["id"], "New entry")
        self._set_memo_created_at(old_memo["id"], "2023-01-01 09:00:00")
        self._set_memo_created_at(new_memo["id"], "2023-06-01 09:00:00")

        entries = get_todo_memo_log(date_from="2023-05-01", date_to="2023-06-30")
        assert [e["content"] for e in entries] == ["New entry"]

    def test_entries_ordered_by_created_at_ascending(self, db):
        todo = create_todo("Task", None)
        first = create_todo_memo(todo["id"], "First")
        second = create_todo_memo(todo["id"], "Second")
        self._set_memo_created_at(first["id"], "2023-01-01 09:00:00")
        self._set_memo_created_at(second["id"], "2023-01-02 09:00:00")

        entries = get_todo_memo_log()
        assert [e["content"] for e in entries] == ["First", "Second"]

    def _set_status_log_created_at(self, todo_id, created_at):
        with get_todo_conn() as conn:
            conn.execute(
                "UPDATE todo_status_log SET created_at = ? WHERE todo_id = ?",
                (created_at, todo_id)
            )

    def test_status_change_entry_is_included(self, db):
        todo = create_todo("Task", None)
        set_todo_status(todo["id"], "doing")

        entries = get_todo_memo_log()
        assert len(entries) == 1
        assert entries[0]["content"] == "(「未着手」→「実施中」)"
        assert entries[0]["todo_title"] == "Task"

    def test_status_change_comment_is_appended_to_content(self, db):
        todo = create_todo("Task", None)
        set_todo_status(todo["id"], "doing", "念のため確認中")

        entries = get_todo_memo_log()
        assert entries[0]["content"] == "(「未着手」→「実施中」)\n念のため確認中"

    def test_memos_and_status_changes_are_merged_by_date(self, db):
        todo = create_todo("Task", None)
        memo = create_todo_memo(todo["id"], "手動メモ")
        self._set_memo_created_at(memo["id"], "2023-01-01 09:00:00")
        set_todo_status(todo["id"], "doing")
        self._set_status_log_created_at(todo["id"], "2023-01-02 09:00:00")

        entries = get_todo_memo_log()
        assert [e["content"] for e in entries] == [
            "手動メモ", "(「未着手」→「実施中」)"
        ]

    def test_status_changes_are_filtered_by_date_range(self, db):
        todo = create_todo("Task", None)
        set_todo_status(todo["id"], "doing")
        self._set_status_log_created_at(todo["id"], "2023-01-01 09:00:00")

        entries = get_todo_memo_log(date_from="2023-02-01", date_to="2023-02-28")
        assert entries == []

    def test_entries_for_deleted_todo_are_skipped(self, db):
        todo = create_todo("Task", None)
        create_todo_memo(todo["id"], "手動メモ")
        set_todo_status(todo["id"], "doing")
        delete_todo(todo["id"])

        assert get_todo_memo_log() == []

    def test_memo_status_reflects_time_of_writing_not_current_status(self, db):
        todo = create_todo("Task", None)
        set_todo_status(todo["id"], "doing")
        create_todo_memo(todo["id"], "作業中メモ")
        set_todo_status(todo["id"], "done")

        entries = get_todo_memo_log()
        memo_entry = next(e for e in entries if e["content"] == "作業中メモ")
        assert memo_entry["todo_status_label"] == "実施中"

    def test_legacy_memo_without_status_falls_back_to_status_log(self, db):
        todo = create_todo("Task", None)
        memo = create_todo_memo(todo["id"], "古いメモ")
        with get_todo_conn() as conn:
            conn.execute(
                "UPDATE todo_memos SET status = NULL, created_at = ? WHERE id = ?",
                ("2023-01-02 09:00:00", memo["id"])
            )
        set_todo_status(todo["id"], "doing")
        self._set_status_log_created_at(todo["id"], "2023-01-01 09:00:00")

        entries = get_todo_memo_log()
        memo_entry = next(e for e in entries if e["content"] == "古いメモ")
        assert memo_entry["todo_status_label"] == "実施中"


class TestTodoLabels:
    def test_create_label(self, db):
        label = create_todo_label("Work", "#ff0000")
        assert label["name"] == "Work"
        assert label["color"] == "#ff0000"

    def test_get_all_labels_empty(self, db):
        assert get_all_todo_labels() == []

    def test_get_all_labels_returns_all(self, db):
        create_todo_label("Work", "#ff0000")
        create_todo_label("Personal", "#00ff00")
        names = {l["name"] for l in get_all_todo_labels()}
        assert names == {"Work", "Personal"}

    def test_get_all_labels_sorted_by_name(self, db):
        create_todo_label("Zebra", "#fff")
        create_todo_label("Alpha", "#fff")
        names = [l["name"] for l in get_all_todo_labels()]
        assert names == sorted(names)

    def test_update_label_color(self, db):
        label = create_todo_label("Work", "#ff0000")
        updated = update_todo_label_color(label["id"], "#0000ff")
        assert updated["color"] == "#0000ff"
        assert updated["name"] == "Work"

    def test_update_missing_label_returns_none(self, db):
        assert update_todo_label_color(9999, "#ff0000") is None

    def test_delete_label(self, db):
        label = create_todo_label("Work", "#ff0000")
        assert delete_todo_label(label["id"]) is True
        assert get_all_todo_labels() == []

    def test_delete_missing_label_returns_false(self, db):
        assert delete_todo_label(9999) is False

    def test_delete_label_removes_links_from_todos(self, db):
        todo = create_todo("Task", None)
        label = create_todo_label("Work", "#ff0000")
        update_todo(todo["id"], "Task", None, None, [], [label["id"]], None)
        delete_todo_label(label["id"])
        assert get_all_todos()[0]["tags"] == []


class TestNotify:
    def test_notify_default_is_none(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        assert todo.get("notify") is None

    def test_update_sets_notify(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        result = update_todo(todo["id"], "Task", "2023-06-01T09:00:00", None, [], [], None, notify="30")
        assert result["notify"] == "30"

    def test_update_notify_all_values(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        for value in ("60", "30", "15", "5", "0"):
            result = update_todo(todo["id"], "Task", "2023-06-01T09:00:00", None, [], [], None, notify=value)
            assert result["notify"] == value

    def test_update_notify_to_none_clears_it(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        update_todo(todo["id"], "Task", "2023-06-01T09:00:00", None, [], [], None, notify="15")
        result = update_todo(todo["id"], "Task", "2023-06-01T09:00:00", None, [], [], None, notify=None)
        assert result["notify"] is None

    def test_notify_persisted_in_get_all_todos(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        update_todo(todo["id"], "Task", "2023-06-01T09:00:00", None, [], [], None, notify="5")
        fetched = next(t for t in get_all_todos() if t["id"] == todo["id"])
        assert fetched["notify"] == "5"

    def test_notify_independent_of_other_fields(self, db):
        todo = create_todo("Task", "2023-06-01T09:00:00")
        label = create_todo_label("Work", "#ff0000")
        result = update_todo(
            todo["id"], "Updated", "2023-07-01T10:00:00", None,
            ["https://example.com"], [label["id"]], None, notify="60"
        )
        assert result["notify"] == "60"
        assert result["title"] == "Updated"
        assert result["urls"] == ["https://example.com"]
        assert any(t["id"] == label["id"] for t in result["tags"])

class TestUpdateTodoLabel:
    def test_update_name(self, db):
        label = create_todo_label("Old", "#ff0000")
        result = update_todo_label(label["id"], "New", "#ff0000", 0)
        assert result["name"] == "New"

    def test_update_color(self, db):
        label = create_todo_label("Work", "#ff0000")
        result = update_todo_label(label["id"], "Work", "#0000ff", 0)
        assert result["color"] == "#0000ff"

    def test_update_closed_to_true(self, db):
        label = create_todo_label("Work", "#ff0000")
        result = update_todo_label(label["id"], "Work", "#ff0000", 1)
        assert result["closed"] == 1

    def test_update_closed_to_false(self, db):
        label = create_todo_label("Work", "#ff0000")
        update_todo_label(label["id"], "Work", "#ff0000", 1)
        result = update_todo_label(label["id"], "Work", "#ff0000", 0)
        assert result["closed"] == 0

    def test_default_closed_is_zero(self, db):
        label = create_todo_label("Work", "#ff0000")
        assert label["closed"] == 0

    def test_update_missing_label_returns_none(self, db):
        assert update_todo_label(9999, "Name", "#fff", 0) is None

    def test_update_persisted_in_get_all_labels(self, db):
        label = create_todo_label("Work", "#ff0000")
        update_todo_label(label["id"], "Updated", "#00ff00", 1)
        fetched = next(l for l in get_all_todo_labels() if l["id"] == label["id"])
        assert fetched["name"] == "Updated"
        assert fetched["color"] == "#00ff00"
        assert fetched["closed"] == 1


class TestLabelLinks:
    def test_create_link(self, db):
        label = create_todo_label("Work", "#ff0000")
        link = create_label_link(label["id"], "Backlog", "https://example.com")
        assert link["label_id"] == label["id"]
        assert link["title"] == "Backlog"
        assert link["url"] == "https://example.com"

    def test_get_links_empty(self, db):
        label = create_todo_label("Work", "#ff0000")
        assert get_label_links(label["id"]) == []

    def test_get_links_returns_only_own_label(self, db):
        label1 = create_todo_label("Work", "#ff0000")
        label2 = create_todo_label("Home", "#00ff00")
        create_label_link(label1["id"], "A", "https://a.example.com")
        create_label_link(label2["id"], "B", "https://b.example.com")
        links = get_label_links(label1["id"])
        assert len(links) == 1
        assert links[0]["title"] == "A"

    def test_update_link(self, db):
        label = create_todo_label("Work", "#ff0000")
        link = create_label_link(label["id"], "Old", "https://old.example.com")
        updated = update_label_link(link["id"], "New", "https://new.example.com")
        assert updated["title"] == "New"
        assert updated["url"] == "https://new.example.com"

    def test_update_missing_link_returns_none(self, db):
        assert update_label_link(9999, "Name", "https://example.com") is None

    def test_delete_link(self, db):
        label = create_todo_label("Work", "#ff0000")
        link = create_label_link(label["id"], "Old", "https://old.example.com")
        assert delete_label_link(link["id"]) is True
        assert get_label_links(label["id"]) == []

    def test_delete_missing_link_returns_false(self, db):
        assert delete_label_link(9999) is False

