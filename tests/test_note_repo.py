from web.repository.note_repo import (
    create_note,
    create_note_tag,
    delete_note,
    delete_note_tag,
    get_all_note_tags,
    get_all_notes,
    reorder_notes,
    toggle_note_archive,
    update_note,
    update_note_tag_color,
)


class TestCreateNote:
    def test_basic_fields(self, db):
        note = create_note("Title", "Body text", "#ffffff")
        assert note["title"] == "Title"
        assert note["body"] == "Body text"
        assert note["color"] == "#ffffff"
        assert note["archived"] == 0
        assert note["tags"] == []

    def test_each_new_note_gets_lower_position(self, db):
        n1 = create_note("First", "", "#fff")
        n2 = create_note("Second", "", "#fff")
        assert n2["position"] < n1["position"]


class TestGetAllNotes:
    def test_empty_database_returns_empty_list(self, db):
        assert get_all_notes() == []

    def test_returns_non_archived_by_default(self, db):
        create_note("Active", "", "#fff")
        n2 = create_note("To archive", "", "#fff")
        toggle_note_archive(n2["id"])

        titles = [n["title"] for n in get_all_notes()]
        assert "Active" in titles
        assert "To archive" not in titles

    def test_archived_true_returns_only_archived(self, db):
        create_note("Active", "", "#fff")
        n2 = create_note("Archived", "", "#fff")
        toggle_note_archive(n2["id"])

        notes = get_all_notes(archived=True)
        assert len(notes) == 1
        assert notes[0]["id"] == n2["id"]

    def test_filter_by_tag_returns_only_linked_notes(self, db):
        tag = create_note_tag("Work", "#ff0000")
        n1 = create_note("Note 1", "", "#fff")
        n2 = create_note("Note 2", "", "#fff")
        update_note(n1["id"], "Note 1", "", "#fff", [tag["id"]])

        result = get_all_notes(tag_id=tag["id"])
        ids = [n["id"] for n in result]
        assert n1["id"] in ids
        assert n2["id"] not in ids


class TestUpdateNote:
    def test_update_title_body_color(self, db):
        note = create_note("Old", "Old body", "#ffffff")
        result = update_note(note["id"], "New", "New body", "#ff0000", [])
        assert result["title"] == "New"
        assert result["body"] == "New body"
        assert result["color"] == "#ff0000"

    def test_update_tags(self, db):
        note = create_note("Note", "", "#fff")
        tag = create_note_tag("Work", "#ff0000")
        result = update_note(note["id"], "Note", "", "#fff", [tag["id"]])
        assert any(t["id"] == tag["id"] for t in result["tags"])

    def test_update_replaces_existing_tags(self, db):
        note = create_note("Note", "", "#fff")
        t1 = create_note_tag("Work", "#ff0000")
        t2 = create_note_tag("Home", "#0000ff")
        update_note(note["id"], "Note", "", "#fff", [t1["id"]])
        result = update_note(note["id"], "Note", "", "#fff", [t2["id"]])
        tag_ids = [t["id"] for t in result["tags"]]
        assert t1["id"] not in tag_ids
        assert t2["id"] in tag_ids

    def test_update_with_empty_tags_clears_all(self, db):
        note = create_note("Note", "", "#fff")
        tag = create_note_tag("Work", "#ff0000")
        update_note(note["id"], "Note", "", "#fff", [tag["id"]])
        result = update_note(note["id"], "Note", "", "#fff", [])
        assert result["tags"] == []

    def test_missing_id_returns_none(self, db):
        assert update_note(9999, "Title", "Body", "#fff", []) is None


class TestDeleteNote:
    def test_delete_existing_returns_true(self, db):
        note = create_note("Note", "", "#fff")
        assert delete_note(note["id"]) is True

    def test_delete_missing_returns_false(self, db):
        assert delete_note(9999) is False

    def test_deleted_note_absent_from_list(self, db):
        note = create_note("Note", "", "#fff")
        delete_note(note["id"])
        assert get_all_notes() == []

    def test_delete_removes_tag_links(self, db):
        note = create_note("Note", "", "#fff")
        tag = create_note_tag("Work", "#ff0000")
        update_note(note["id"], "Note", "", "#fff", [tag["id"]])
        delete_note(note["id"])
        tags = get_all_note_tags()
        assert any(t["id"] == tag["id"] for t in tags)


class TestToggleNoteArchive:
    def test_archive_non_archived_note(self, db):
        note = create_note("Note", "", "#fff")
        result = toggle_note_archive(note["id"])
        assert result["archived"] == 1

    def test_unarchive_archived_note(self, db):
        note = create_note("Note", "", "#fff")
        toggle_note_archive(note["id"])
        result = toggle_note_archive(note["id"])
        assert result["archived"] == 0

    def test_missing_id_returns_none(self, db):
        assert toggle_note_archive(9999) is None


class TestReorderNotes:
    def test_reorder_two_notes(self, db):
        n1 = create_note("First", "", "#fff")
        n2 = create_note("Second", "", "#fff")
        reorder_notes([n2["id"], n1["id"]])

        notes = get_all_notes()
        assert notes[0]["id"] == n2["id"]
        assert notes[1]["id"] == n1["id"]

    def test_reorder_three_notes(self, db):
        n1 = create_note("A", "", "#fff")
        n2 = create_note("B", "", "#fff")
        n3 = create_note("C", "", "#fff")
        reorder_notes([n3["id"], n1["id"], n2["id"]])

        notes = get_all_notes()
        assert [n["id"] for n in notes] == [n3["id"], n1["id"], n2["id"]]


class TestNoteTags:
    def test_create_tag(self, db):
        tag = create_note_tag("Work", "#ff0000")
        assert tag["name"] == "Work"
        assert tag["color"] == "#ff0000"

    def test_get_all_tags_empty(self, db):
        assert get_all_note_tags() == []

    def test_get_all_tags_returns_all(self, db):
        create_note_tag("Work", "#ff0000")
        create_note_tag("Personal", "#00ff00")
        names = {t["name"] for t in get_all_note_tags()}
        assert names == {"Work", "Personal"}

    def test_get_all_tags_sorted_by_name(self, db):
        create_note_tag("Zebra", "#fff")
        create_note_tag("Alpha", "#fff")
        names = [t["name"] for t in get_all_note_tags()]
        assert names == sorted(names)

    def test_update_tag_color(self, db):
        tag = create_note_tag("Work", "#ff0000")
        updated = update_note_tag_color(tag["id"], "#0000ff")
        assert updated["color"] == "#0000ff"
        assert updated["name"] == "Work"

    def test_update_missing_tag_returns_none(self, db):
        assert update_note_tag_color(9999, "#ff0000") is None

    def test_delete_tag(self, db):
        tag = create_note_tag("Work", "#ff0000")
        assert delete_note_tag(tag["id"]) is True
        assert get_all_note_tags() == []

    def test_delete_missing_tag_returns_false(self, db):
        assert delete_note_tag(9999) is False

    def test_delete_tag_removes_links_from_notes(self, db):
        note = create_note("Note", "", "#fff")
        tag = create_note_tag("Work", "#ff0000")
        update_note(note["id"], "Note", "", "#fff", [tag["id"]])
        delete_note_tag(tag["id"])
        assert get_all_notes()[0]["tags"] == []
