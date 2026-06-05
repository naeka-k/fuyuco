from repository.db_conn import get_todo_conn
from service.recurrence import calc_next_deadline, parse_rec
from repository.tag_repo import create_tag, delete_tag, get_all_tags, update_tag_color
from service.utils import attach_tags, parse_urls, urls_to_json
from datetime import date


def generate_recurring_todos():
    today_str = date.today().isoformat()
    with get_todo_conn() as conn:
        series = conn.execute(
            "SELECT DISTINCT recurrence_id, recurrence FROM todos "
            "WHERE recurrence IS NOT NULL AND recurrence_id IS NOT NULL AND deadline IS NOT NULL"
        ).fetchall()
        for s in series:
            rid, rec = s["recurrence_id"], s["recurrence"]
            rec_data = parse_rec(rec)
            end_date = rec_data.get('end')
            if end_date and today_str > end_date:
                continue

            row = conn.execute(
                "SELECT MAX(deadline) AS max_dl FROM todos WHERE recurrence_id = ?",
                (rid,)
            ).fetchone()
            current_dl = row["max_dl"]
            if not current_dl or current_dl[:10] >= today_str:
                continue

            for _ in range(366):
                next_dl = calc_next_deadline(current_dl, rec_data)
                if not next_dl or next_dl[:10] > today_str:
                    break
                if end_date and next_dl[:10] > end_date:
                    break

                tmpl = conn.execute(
                    "SELECT * FROM todos WHERE recurrence_id = ? ORDER BY deadline DESC LIMIT 1",
                    (rid,)
                ).fetchone()
                cur = conn.execute(
                    "INSERT INTO todos (title, deadline, memo, url, recurrence, recurrence_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (tmpl["title"], next_dl, tmpl["memo"], tmpl["url"], rec, rid)
                )
                new_id = cur.lastrowid
                for tag in conn.execute("SELECT tag_id FROM todo_tag_links WHERE todo_id = ?", (tmpl["id"],)).fetchall():
                    conn.execute(
                        "INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)",
                        (new_id, tag["tag_id"])
                    )
                current_dl = next_dl


def _attach_todo_tags(conn, todos):
    if not todos:
        return todos
    attach_tags(conn, todos, 'todo_tag_links', 'todo_id', 'todo_tags')
    for todo in todos:
        todo["urls"] = parse_urls(todo.get("url"))
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
        todos = [dict(row) for row in rows]
        return _attach_todo_tags(conn, todos)


def create_todo(title, deadline, recurrence=None, urls=None):
    with get_todo_conn() as conn:
        cur = conn.execute(
            "INSERT INTO todos (title, deadline, recurrence, url) VALUES (?, ?, ?, ?)",
            (title, deadline, recurrence, urls_to_json(urls))
        )
        new_id = cur.lastrowid
        if recurrence:
            conn.execute("UPDATE todos SET recurrence_id = ? WHERE id = ?", (new_id, new_id))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (new_id,)).fetchone()
        todo = dict(row)
        todo["tags"] = []
        todo["urls"] = parse_urls(todo.get("url"))
    return todo


def _apply_status(conn, todo_id, todo, next_status):
    done = 1 if next_status == 'done' else 0
    conn.execute("UPDATE todos SET status = ?, done = ? WHERE id = ?", (next_status, done, todo_id))
    if next_status == 'done' and not todo["done"] and todo["recurrence"] and todo["recurrence_id"] and todo["deadline"]:
        rec_data = parse_rec(todo["recurrence"])
        end_date = rec_data.get("end")
        next_dl = calc_next_deadline(todo["deadline"], rec_data)
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
                    conn.execute(
                        "INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)",
                        (new_id, tag["tag_id"])
                    )


def toggle_todo(todo_id):
    _NEXT = {'todo': 'doing', 'doing': 'done', 'done': 'todo'}
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None:
            return None
        todo = dict(row)
        current = todo.get("status") or ('done' if todo["done"] else 'todo')
        _apply_status(conn, todo_id, todo, _NEXT[current])
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _attach_todo_tags(conn, [dict(row)])[0]


def set_todo_status(todo_id, status):
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None:
            return None
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
            (title, deadline, memo, urls_to_json(urls), recurrence, recurrence_id, todo_id)
        )
        conn.execute("DELETE FROM todo_tag_links WHERE todo_id = ?", (todo_id,))
        for tid in tag_ids:
            conn.execute("INSERT OR IGNORE INTO todo_tag_links (todo_id, tag_id) VALUES (?, ?)", (todo_id, tid))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None:
            return None
        todo = dict(row)
        return _attach_todo_tags(conn, [todo])[0]


def get_all_todo_tags():
    with get_todo_conn() as conn:
        return get_all_tags(conn, "todo_tags")


def create_todo_tag(name, color):
    with get_todo_conn() as conn:
        return create_tag(conn, "todo_tags", name, color)


def update_todo_tag_color(tag_id, color):
    with get_todo_conn() as conn:
        return update_tag_color(conn, "todo_tags", tag_id, color)


def delete_todo_tag(tag_id):
    with get_todo_conn() as conn:
        return delete_tag(conn, "todo_tags", "todo_tag_links", tag_id)
