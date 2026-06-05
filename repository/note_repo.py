from repository.db_conn import get_note_conn
from repository.tag_repo import create_tag, delete_tag, get_all_tags, update_tag_color
from service.utils import attach_tags


def _attach_note_tags(conn, notes):
    if not notes:
        return notes
    attach_tags(conn, notes, 'note_tag_links', 'note_id', 'note_tags')
    return notes


def get_all_notes(tag_id=None, archived=False):
    archived_val = 1 if archived else 0
    with get_note_conn() as conn:
        if tag_id is not None:
            rows = conn.execute(
                "SELECT n.* FROM notes n JOIN note_tag_links nl ON n.id = nl.note_id WHERE nl.tag_id = ? AND n.archived = ? ORDER BY n.position ASC, n.created_at DESC",
                (tag_id, archived_val)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM notes WHERE archived = ? ORDER BY position ASC, created_at DESC",
                (archived_val,)
            ).fetchall()
        notes = [dict(row) for row in rows]
        return _attach_note_tags(conn, notes)


def create_note(title, body, color):
    with get_note_conn() as conn:
        row = conn.execute("SELECT MIN(position) FROM notes").fetchone()
        min_pos = row[0] if row[0] is not None else 0
        new_pos = min_pos - 1
        cur = conn.execute(
            "INSERT INTO notes (title, body, color, position) VALUES (?, ?, ?, ?)",
            (title, body, color, new_pos)
        )
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (cur.lastrowid,)).fetchone()
        note = dict(row)
        note["tags"] = []
    return note


def reorder_notes(ids):
    with get_note_conn() as conn:
        for i, note_id in enumerate(ids):
            conn.execute("UPDATE notes SET position = ? WHERE id = ?", (i, note_id))


def update_note(note_id, title, body, color, tag_ids):
    with get_note_conn() as conn:
        conn.execute(
            "UPDATE notes SET title = ?, body = ?, color = ? WHERE id = ?",
            (title, body, color, note_id)
        )
        conn.execute("DELETE FROM note_tag_links WHERE note_id = ?", (note_id,))
        for tid in tag_ids:
            conn.execute("INSERT OR IGNORE INTO note_tag_links (note_id, tag_id) VALUES (?, ?)", (note_id, tid))
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None:
            return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]


def toggle_note_archive(note_id):
    with get_note_conn() as conn:
        conn.execute("UPDATE notes SET archived = 1 - archived WHERE id = ?", (note_id,))
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None:
            return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]


def delete_note(note_id):
    with get_note_conn() as conn:
        conn.execute("DELETE FROM note_tag_links WHERE note_id = ?", (note_id,))
        affected = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount
    return affected > 0


def get_all_note_tags():
    with get_note_conn() as conn:
        return get_all_tags(conn, "note_tags")


def create_note_tag(name, color):
    with get_note_conn() as conn:
        return create_tag(conn, "note_tags", name, color)


def update_note_tag_color(tag_id, color):
    with get_note_conn() as conn:
        return update_tag_color(conn, "note_tags", tag_id, color)


def delete_note_tag(tag_id):
    with get_note_conn() as conn:
        return delete_tag(conn, "note_tags", "note_tag_links", tag_id)
