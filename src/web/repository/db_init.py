'''
データベースの初期化を行うモジュール
このモジュールは、TODOデータベースとノートデータベースの両方を初期化するための関数を提供する。
init_db()は、両方のデータベースに必要なテーブルを作成し、必要に応じてカラムを追加する。
TODOデータベースにはtodos、todo_tags、todo_tag_linksの3つのテーブルが作成され、
ノートデータベースにはnotes、note_tags、note_tag_linksの3つのテーブルが作成される。
'''
import sqlite3
from .db_conn import get_note_conn, get_todo_conn

def ensure_column(conn, table, column, definition):
    '''
    テーブルにカラムが存在することを確認する関数
    tableで指定されたテーブルにcolumnで指定されたカラムが存在することを確認する。
    カラムが存在しない場合はdefinitionで指定された定義でカラムを追加する
    '''
    try:
        conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
    except sqlite3.OperationalError:
        pass


def drop_name_unique(conn, table):
    '''nameカラムのUNIQUE制約をテーブルから削除する。
    SQLiteはALTER TABLE DROP CONSTRAINTに対応していないため、テーブルを再作成する。
    UNIQUE制約がない場合は何もしない。
    '''
    row = conn.execute(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?", (table,)
    ).fetchone()
    if row is None or 'UNIQUE' not in row['sql'].upper():
        return
    cols = ', '.join(r['name'] for r in conn.execute(f"PRAGMA table_info({table})").fetchall())
    tmp = f'{table}_tmp'
    conn.execute(f"ALTER TABLE {table} RENAME TO {tmp}")
    conn.execute(f"""
        CREATE TABLE {table} (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            color TEXT NOT NULL DEFAULT '#93c5fd',
            closed INTEGER NOT NULL DEFAULT 0,
            closed_at TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
        )
    """)
    conn.execute(f"INSERT INTO {table} ({cols}) SELECT {cols} FROM {tmp}")
    conn.execute(f"DROP TABLE {tmp}")


def init_db():
    '''
    データベースを初期化する関数
    '''
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
        ensure_column(conn, "todos", "notify", "TEXT")
        ensure_column(conn, "todos", "starred", "INTEGER NOT NULL DEFAULT 0")
        conn.execute(
            "UPDATE todos SET status = 'done' WHERE done = 1 AND status = 'todo'"
        )

        try:
            conn.execute("ALTER TABLE todo_tags RENAME TO todo_labels")
        except sqlite3.OperationalError:
            pass
        try:
            conn.execute("ALTER TABLE todo_tag_links RENAME TO todo_label_links")
        except sqlite3.OperationalError:
            pass

        conn.execute("""
            CREATE TABLE IF NOT EXISTS todo_labels (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#93c5fd',
                closed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
                memo TEXT NOT NULL DEFAULT ''
            )
        """)
        drop_name_unique(conn, "todo_labels")
        ensure_column(conn, "todo_labels", "closed", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "todo_labels", "closed_at", "TEXT")
        ensure_column(conn, "todo_labels", "created_at", "TEXT")
        ensure_column(conn, "todo_labels", "memo", "TEXT NOT NULL DEFAULT ''")
        conn.execute(
            "UPDATE todo_labels SET created_at = datetime('now', 'localtime') WHERE created_at IS NULL"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS todo_label_links (
                todo_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (todo_id, tag_id)
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS todo_memos (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                todo_id INTEGER NOT NULL,
                content TEXT NOT NULL DEFAULT '',
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        rows = conn.execute(
            "SELECT id, memo FROM todos WHERE memo IS NOT NULL AND memo != ''"
        ).fetchall()
        for row in rows:
            existing = conn.execute(
                "SELECT id FROM todo_memos WHERE todo_id = ?", (row["id"],)
            ).fetchone()
            if not existing:
                conn.execute(
                    "INSERT INTO todo_memos (todo_id, content) VALUES (?, ?)",
                    (row["id"], row["memo"])
                )

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
        zero_cnt = conn.execute(
            "SELECT COUNT(*) FROM notes WHERE position = 0").fetchone()[0]
        if count > 1 and count == zero_cnt:
            rows = conn.execute(
                "SELECT id FROM notes ORDER BY created_at DESC").fetchall()
            for i, row in enumerate(rows):
                conn.execute("UPDATE notes SET position = ? WHERE id = ?",
                             (i, row["id"]))

        conn.execute("""
            CREATE TABLE IF NOT EXISTS note_tags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT NOT NULL,
                color TEXT NOT NULL DEFAULT '#93c5fd',
                closed INTEGER NOT NULL DEFAULT 0,
                created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
            )
        """)
        drop_name_unique(conn, "note_tags")
        ensure_column(conn, "note_tags", "closed", "INTEGER NOT NULL DEFAULT 0")
        ensure_column(conn, "note_tags", "closed_at", "TEXT")
        ensure_column(conn, "note_tags", "created_at", "TEXT")
        conn.execute(
            "UPDATE note_tags SET created_at = datetime('now', 'localtime') WHERE created_at IS NULL"
        )
        conn.execute("""
            CREATE TABLE IF NOT EXISTS note_tag_links (
                note_id INTEGER NOT NULL,
                tag_id INTEGER NOT NULL,
                PRIMARY KEY (note_id, tag_id)
            )
        """)
