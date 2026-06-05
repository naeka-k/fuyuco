import sqlite3
import sqlite3
from .db_conn import get_note_conn, get_todo_conn


def ensure_column(conn, table, column, definition):
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except sqlite3.OperationalError:
        pass


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
                status TEXT NOT NULL DEFAULT 'todo',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        ensure_column(conn, "todos", "recurrence", "TEXT")
        ensure_column(conn, "todos", "recurrence_id", "INTEGER")
        ensure_column(conn, "todos", "status", "TEXT NOT NULL DEFAULT 'todo'")
        conn.execute("UPDATE todos SET status = 'done' WHERE done = 1 AND status = 'todo'")

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
                tag_id INTEGER NOT NULL,
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
                position INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        ensure_column(conn, "notes", "archived", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "notes", "position", "INTEGER NOT NULL DEFAULT 0")

        count = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        zero_cnt = conn.execute("SELECT COUNT(*) FROM notes WHERE position = 0").fetchone()[0]
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
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag_id)
            )
        """)
