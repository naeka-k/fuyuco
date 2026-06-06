import sqlite3
from contextlib import contextmanager

TODO_DB = "todo.db"
NOTE_DB = "memo.db"

'''
データベース接続を管理するモジュール
このモジュールは、SQLiteデータベースへの接続を管理するための関数を提供する。
get_todo_conn()とget_note_conn()は、それぞれTODOデータベースとノートデータベースへの接続を取得するための関数である。これらの関数は、get_conn()という共通のコンテキストマネージャ関数を使用して、データベース接続の確立とクリーンアップを管理する
'''

@contextmanager
def get_conn(db_path: str):
    '''
    データベース接続を管理するコンテキストマネージャ
    db_pathで指定されたSQLiteデータベースへの接続を管理する。接続はコンテキストの開始時に確立され、終了時にコミットされて閉じられる
    '''
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def get_todo_conn():
    '''
    TODOデータベースへの接続を取得する関数
    TODO_DBで指定されたSQLiteデータベースへの接続を取得する
    '''
    return get_conn(TODO_DB)


def get_note_conn():
    '''
    ノートデータベースへの接続を取得する関数
    NOTE_DBで指定されたSQLiteデータベースへの接続を取得する
    '''
    return get_conn(NOTE_DB)
