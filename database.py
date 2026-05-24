import sqlite3
import calendar
import json
from contextlib import contextmanager
from datetime import date, timedelta

TODO_DB = "todo.db"
NOTE_DB = "memo.db"

def init_db():
    with get_todo_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS todos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                deadline TEXT,
                done INTEGER NOT NULL DEFAULT 0,
                memo TEXT,
                url TEXT,
                recurrence TEXT,
                recurrence_id INTEGER,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        try:
            conn.execute("ALTER TABLE todos ADD COLUMN recurrence TEXT")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE todos ADD COLUMN recurrence_id INTEGER")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE todos ADD COLUMN status TEXT NOT NULL DEFAULT 'todo'")
            conn.execute("UPDATE todos SET status = 'done' WHERE done = 1 AND status = 'todo'")
        except Exception:
            pass
        conn.execute("""
            CREATE TABLE IF NOT EXISTS todo_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#93c5fd'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS todo_tag_links (
                todo_id INTEGER NOT NULL,
                tag_id  INTEGER NOT NULL,
                PRIMARY KEY (todo_id, tag_id)
            )
        """)
    with get_note_conn() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL DEFAULT '',
                body TEXT NOT NULL DEFAULT '',
                color TEXT NOT NULL DEFAULT '#ffffff',
                archived INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        try:
            conn.execute("ALTER TABLE notes ADD COLUMN archived INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        try:
            conn.execute("ALTER TABLE notes ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
        except Exception:
            pass
        count     = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        zero_cnt  = conn.execute("SELECT COUNT(*) FROM notes WHERE position = 0").fetchone()[0]
        if count > 1 and count == zero_cnt:
            rows = conn.execute("SELECT id FROM notes ORDER BY created_at DESC").fetchall()
            for i, row in enumerate(rows):
                conn.execute("UPDATE notes SET position = ? WHERE id = ?", (i, row["id"]))
        conn.execute("""
            CREATE TABLE IF NOT EXISTS note_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL UNIQUE,
                color TEXT NOT NULL DEFAULT '#93c5fd'
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS note_tag_links (
                note_id INTEGER NOT NULL,
                tag_id  INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag_id)
            )
        """)

@contextmanager
def get_todo_conn():
    conn = sqlite3.connect(TODO_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

@contextmanager
def get_note_conn():
    conn = sqlite3.connect(NOTE_DB)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()

# ── URLヘルパー ──────────────────────────────────

def _parse_urls(url_str):
    if not url_str:
        return []
    try:
        parsed = json.loads(url_str)
        if isinstance(parsed, list):
            return [u for u in parsed if u]
    except (json.JSONDecodeError, ValueError):
        pass
    return [url_str]

def _urls_to_json(urls):
    filtered = [u for u in (urls or []) if u]
    return json.dumps(filtered) if filtered else None

# ── 繰り返しヘルパー ──────────────────────────────

def _parse_rec(rec):
    if isinstance(rec, dict):
        return rec
    try:
        return json.loads(rec)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {'type': rec}

def _calc_next_deadline(dl_str, rec):
    rec = _parse_rec(rec)
    date_part = dl_str[:10]
    time_part = dl_str[10:]
    d = date.fromisoformat(date_part)
    rec_type = rec.get('type', '')

    if rec_type == 'daily':
        next_d = d + timedelta(days=1)

    elif rec_type == 'weekly':
        days = sorted(rec.get('days', []))  # 0=Mon … 6=Sun (Python weekday)
        if not days:
            next_d = d + timedelta(weeks=1)
        else:
            cur_wd = d.weekday()
            nxt = next((day for day in days if day > cur_wd), None)
            if nxt is None:
                next_d = d + timedelta(days=7 - cur_wd + days[0])
            else:
                next_d = d + timedelta(days=nxt - cur_wd)

    elif rec_type == 'monthly':
        dates = sorted(rec.get('dates', []))  # 1-31
        if not dates:
            m, y = d.month + 1, d.year
            if m > 12: m, y = 1, y + 1
            next_d = date(y, m, min(d.day, calendar.monthrange(y, m)[1]))
        else:
            nxt_day = next((dt for dt in dates if dt > d.day), None)
            if nxt_day is None:
                m, y = d.month + 1, d.year
                if m > 12: m, y = 1, y + 1
                nxt_day = dates[0]
            else:
                m, y = d.month, d.year
            next_d = date(y, m, min(nxt_day, calendar.monthrange(y, m)[1]))

    else:
        return None

    return next_d.isoformat() + time_part

def generate_recurring_todos():
    today_str = date.today().isoformat()
    with get_todo_conn() as conn:
        series = conn.execute(
            "SELECT DISTINCT recurrence_id, recurrence FROM todos "
            "WHERE recurrence IS NOT NULL AND recurrence_id IS NOT NULL AND deadline IS NOT NULL"
        ).fetchall()
        for s in series:
            rid, rec = s["recurrence_id"], s["recurrence"]
            rec_data = _parse_rec(rec)
            end_date = rec_data.get('end')
            if end_date and today_str > end_date:
                continue
            row = conn.execute(
                "SELECT MAX(deadline) AS max_dl FROM todos WHERE recurrence_id = ?", (rid,)
            ).fetchone()
            current_dl = row["max_dl"]
            if not current_dl or current_dl[:10] >= today_str:
                continue
            for _ in range(366):
                next_dl = _calc_next_deadline(current_dl, rec_data)
                if not next_dl or next_dl[:10] > today_str:
                    break
                if end_date and next_dl[:10] > end_date:
                    break
                tmpl = conn.execute(
                    "SELECT * FROM todos WHERE recurrence_id = ? ORDER BY deadline DESC LIMIT 1", (rid,)
                ).fetchone()
                cur = conn.execute(
                    "INSERT INTO todos (title, deadline, memo, url, recurrence, recurrence_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (tmpl["title"], next_dl, tmpl["memo"], tmpl["url"], rec, rid)
                )
                new_id = cur.lastrowid
                for tag in conn.execute("SELECT tag_id FROM todo_tag_links WHERE todo_id = ?", (tmpl["id"],)).fetchall():
                    conn.execute("INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)", (new_id, tag["tag_id"]))
                current_dl = next_dl

# ── TODO ──────────────────────────────

def _attach_todo_tags(conn, todos):
    if not todos: return todos
    ids = [t["id"] for t in todos]
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT tl.todo_id, tg.id, tg.name, tg.color FROM todo_tag_links tl JOIN todo_tags tg ON tg.id = tl.tag_id WHERE tl.todo_id IN ({placeholders})",
        ids
    ).fetchall()
    tag_map = {t["id"]: [] for t in todos}
    for r in rows:
        tag_map[r["todo_id"]].append({"id": r["id"], "name": r["name"], "color": r["color"]})
    for t in todos:
        t["tags"] = tag_map[t["id"]]
        t["urls"] = _parse_urls(t.get("url"))
    return todos

def get_all_todos(tag_id=None):
    with get_todo_conn() as conn:
        if tag_id is not None:
            rows = conn.execute(
                "SELECT t.* FROM todos t JOIN todo_tag_links tl ON t.id = tl.todo_id WHERE tl.tag_id = ? ORDER BY t.deadline IS NULL, t.deadline, t.created_at",
                (tag_id,)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM todos ORDER BY deadline IS NULL, deadline, created_at"
            ).fetchall()
        todos = [dict(r) for r in rows]
        return _attach_todo_tags(conn, todos)

def create_todo(title, deadline, recurrence=None, urls=None):
    with get_todo_conn() as conn:
        cur = conn.execute(
            "INSERT INTO todos (title, deadline, recurrence, url) VALUES (?, ?, ?, ?)",
            (title, deadline, recurrence, _urls_to_json(urls))
        )
        new_id = cur.lastrowid
        if recurrence:
            conn.execute("UPDATE todos SET recurrence_id = ? WHERE id = ?", (new_id, new_id))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (new_id,)).fetchone()
        todo = dict(row)
        todo["tags"] = []
        todo["urls"] = _parse_urls(todo.get("url"))
    return todo

def _apply_status(conn, todo_id, todo, next_status):
    done = 1 if next_status == 'done' else 0
    conn.execute("UPDATE todos SET status = ?, done = ? WHERE id = ?", (next_status, done, todo_id))
    if next_status == 'done' and not todo["done"] and todo["recurrence"] and todo["recurrence_id"] and todo["deadline"]:
        rec_data = _parse_rec(todo["recurrence"])
        end_date = rec_data.get("end")
        next_dl = _calc_next_deadline(todo["deadline"], rec_data)
        if next_dl and (not end_date or next_dl[:10] <= end_date):
            existing = conn.execute(
                "SELECT id FROM todos WHERE recurrence_id = ? AND deadline = ? AND done = 0",
                (todo["recurrence_id"], next_dl)
            ).fetchone()
            if not existing:
                cur = conn.execute(
                    "INSERT INTO todos (title, deadline, memo, url, recurrence, recurrence_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (todo["title"], next_dl, todo["memo"], todo["url"], todo["recurrence"], todo["recurrence_id"])
                )
                new_id = cur.lastrowid
                for tag in conn.execute("SELECT tag_id FROM todo_tag_links WHERE todo_id = ?", (todo_id,)).fetchall():
                    conn.execute("INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)", (new_id, tag["tag_id"]))

def toggle_todo(todo_id):
    _NEXT = {'todo': 'doing', 'doing': 'done', 'done': 'todo'}
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None: return None
        todo = dict(row)
        current = todo.get("status") or ('done' if todo["done"] else 'todo')
        _apply_status(conn, todo_id, todo, _NEXT[current])
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _attach_todo_tags(conn, [dict(row)])[0]

def set_todo_status(todo_id, status):
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None: return None
        todo = dict(row)
        _apply_status(conn, todo_id, todo, status)
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _attach_todo_tags(conn, [dict(row)])[0]

def delete_todo(todo_id):
    with get_todo_conn() as conn:
        conn.execute("DELETE FROM todo_tag_links WHERE todo_id = ?", (todo_id,))
        affected = conn.execute("DELETE FROM todos WHERE id = ?", (todo_id,)).rowcount
    return affected > 0

def update_todo(todo_id, title, deadline, memo, urls, tag_ids, recurrence=None):
    with get_todo_conn() as conn:
        current = conn.execute("SELECT recurrence_id FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if current:
            if recurrence and not current["recurrence_id"]:
                recurrence_id = todo_id
            elif not recurrence:
                recurrence_id = None
            else:
                recurrence_id = current["recurrence_id"]
        else:
            recurrence_id = None
        conn.execute(
            "UPDATE todos SET title = ?, deadline = ?, memo = ?, url = ?, recurrence = ?, recurrence_id = ? WHERE id = ?",
            (title, deadline, memo, _urls_to_json(urls), recurrence, recurrence_id, todo_id)
        )
        conn.execute("DELETE FROM todo_tag_links WHERE todo_id = ?", (todo_id,))
        for tid in tag_ids:
            conn.execute("INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)", (todo_id, tid))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None: return None
        todo = dict(row)
        return _attach_todo_tags(conn, [todo])[0]

def get_all_todo_tags():
    with get_todo_conn() as conn:
        rows = conn.execute("SELECT * FROM todo_tags ORDER BY name").fetchall()
    return [dict(r) for r in rows]

def create_todo_tag(name, color):
    with get_todo_conn() as conn:
        cur = conn.execute("INSERT INTO todo_tags (name, color) VALUES (?, ?)", (name, color))
        row = conn.execute("SELECT * FROM todo_tags WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)

def update_todo_tag_color(tag_id, color):
    with get_todo_conn() as conn:
        conn.execute("UPDATE todo_tags SET color = ? WHERE id = ?", (color, tag_id))
        row = conn.execute("SELECT * FROM todo_tags WHERE id = ?", (tag_id,)).fetchone()
    return dict(row) if row else None

def delete_todo_tag(tag_id):
    with get_todo_conn() as conn:
        conn.execute("DELETE FROM todo_tag_links WHERE tag_id = ?", (tag_id,))
        affected = conn.execute("DELETE FROM todo_tags WHERE id = ?", (tag_id,)).rowcount
    return affected > 0

# ── NOTE ──────────────────────────────

def _attach_note_tags(conn, notes):
    if not notes: return notes
    ids = [n["id"] for n in notes]
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT nl.note_id, tg.id, tg.name, tg.color FROM note_tag_links nl JOIN note_tags tg ON tg.id = nl.tag_id WHERE nl.note_id IN ({placeholders})",
        ids
    ).fetchall()
    tag_map = {n["id"]: [] for n in notes}
    for r in rows:
        tag_map[r["note_id"]].append({"id": r["id"], "name": r["name"], "color": r["color"]})
    for n in notes:
        n["tags"] = tag_map[n["id"]]
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
        notes = [dict(r) for r in rows]
        return _attach_note_tags(conn, notes)

def create_note(title, body, color):
    with get_note_conn() as conn:
        row = conn.execute("SELECT MIN(position) FROM notes").fetchone()
        min_pos = row[0] if row[0] is not None else 0
        new_pos = min_pos - 1
        cur = conn.execute("INSERT INTO notes (title, body, color, position) VALUES (?, ?, ?, ?)", (title, body, color, new_pos))
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
        if row is None: return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]

def toggle_note_archive(note_id):
    with get_note_conn() as conn:
        conn.execute("UPDATE notes SET archived = 1 - archived WHERE id = ?", (note_id,))
        row = conn.execute("SELECT * FROM notes WHERE id = ?", (note_id,)).fetchone()
        if row is None: return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]

def delete_note(note_id):
    with get_note_conn() as conn:
        conn.execute("DELETE FROM note_tag_links WHERE note_id = ?", (note_id,))
        affected = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount
    return affected > 0

def get_all_note_tags():
    with get_note_conn() as conn:
        rows = conn.execute("SELECT * FROM note_tags ORDER BY name").fetchall()
    return [dict(r) for r in rows]

def create_note_tag(name, color):
    with get_note_conn() as conn:
        cur = conn.execute("INSERT INTO note_tags (name, color) VALUES (?, ?)", (name, color))
        row = conn.execute("SELECT * FROM note_tags WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)

def update_note_tag_color(tag_id, color):
    with get_note_conn() as conn:
        conn.execute("UPDATE note_tags SET color = ? WHERE id = ?", (color, tag_id))
        row = conn.execute("SELECT * FROM note_tags WHERE id = ?", (tag_id,)).fetchone()
    return dict(row) if row else None

def delete_note_tag(tag_id):
    with get_note_conn() as conn:
        conn.execute("DELETE FROM note_tag_links WHERE tag_id = ?", (tag_id,))
        affected = conn.execute("DELETE FROM note_tags WHERE id = ?", (tag_id,)).rowcount
    return affected > 0
