import sqlite3
from contextlib import contextmanager

TODO_DB = "todo.db"
NOTE_DB = "memo.db"

@contextmanager
def get_conn(db_path: str):
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_todo_conn():
    return get_conn(TODO_DB)


def get_note_conn():
    return get_conn(NOTE_DB)
