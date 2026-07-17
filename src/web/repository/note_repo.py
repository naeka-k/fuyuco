'''
ノート関連のデータベース操作を行うモジュール
このモジュールは、ノートの作成、更新、削除、アーカイブ状態の切り替え、タグの管理など、
ノートに関連するデータベース操作を行う関数を提供する。
これらの関数は、get_note_conn()を使用してノートデータベースへの接続を取得し、
必要なSQLクエリを実行してデータベース操作を行う。
'''
from .db_conn import get_note_conn
from .tag_repo import create_tag, delete_tag, get_all_tags, update_tag_color
from ..service.utils import attach_tags

def _attach_note_tags(conn, notes):
    '''
    ノートにタグ情報を付加する関数
    '''
    if not notes:
        return notes
    attach_tags(conn, notes, 'note_tag_links', 'note_id', 'note_tags')
    return notes


def get_all_notes(tag_id=None, archived=False):
    '''
    ノートの一覧を取得する関数
    tag_idで指定されたタグが付けられたノートの一覧を返す。
    tag_idが指定されていない場合は全てのノートの一覧を返す。
    archivedがtrueの場合はアーカイブされたノートの一覧を返し、falseの場合はアーカイブされていないノートの一覧を返す
    '''
    archived_val = 1 if archived else 0
    with get_note_conn() as conn:
        if tag_id is not None:
            rows = conn.execute(
                "SELECT n.* FROM notes n JOIN note_tag_links nl ON n.id = nl.note_id WHERE nl.tag_id = ? AND n.archived = ? ORDER BY n.position ASC, n.created_at DESC",
                (tag_id, archived_val)).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM notes WHERE archived = ? ORDER BY position ASC, created_at DESC",
                (archived_val, )).fetchall()
        notes = [dict(row) for row in rows]
        return _attach_note_tags(conn, notes)


def create_note(title, body, color):
    '''新しいノートを作成する関数
    title、body、colorで指定された内容のノートを作成する。
    作成されたノートを返す'''
    with get_note_conn() as conn:
        row = conn.execute("SELECT MIN(position) FROM notes").fetchone()
        min_pos = row[0] if row[0] is not None else 0
        new_pos = min_pos - 1
        cur = conn.execute(
            "INSERT INTO notes (title, body, color, position) VALUES (?, ?, ?, ?)",
            (title, body, color, new_pos))
        row = conn.execute("SELECT * FROM notes WHERE id = ?",
                           (cur.lastrowid, )).fetchone()
        note = dict(row)
        note["tags"] = []
    return note


def reorder_notes(ids):
    '''
    ノートの順番を更新する関数
    body.idsにノートIDのリストを渡すと、その順番でノートが並び替えられる
    '''
    with get_note_conn() as conn:
        for i, note_id in enumerate(ids):
            conn.execute("UPDATE notes SET position = ? WHERE id = ?",
                         (i, note_id))


def update_note(note_id, title, body, color, tag_ids):
    '''
    ノートの内容を更新する関数
    note_idで指定されたノートの内容をtitle、body、color、tag_idsで更新する。
    更新されたノートを返す。ノートが見つからない場合はNoneを返す
    '''
    with get_note_conn() as conn:
        conn.execute(
            "UPDATE notes SET title = ?, body = ?, color = ? WHERE id = ?",
            (title, body, color, note_id))
        conn.execute("DELETE FROM note_tag_links WHERE note_id = ?",
                     (note_id, ))
        for tid in tag_ids:
            conn.execute(
                "INSERT OR IGNORE INTO note_tag_links (note_id, tag_id) VALUES (?, ?)",
                (note_id, tid))
        row = conn.execute("SELECT * FROM notes WHERE id = ?",
                           (note_id, )).fetchone()
        if row is None:
            return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]


def toggle_note_archive(note_id):
    '''
    ノートのアーカイブ状態を切り替える関数
    note_idで指定されたノートのアーカイブ状態を切り替える。
    アーカイブされていないノートはアーカイブされ、アーカイブされたノートはアーカイブ解除される。
    切り替えに成功した場合は更新されたノートを返し、ノートが見つからない場合はNoneを返す
    '''
    with get_note_conn() as conn:
        conn.execute("UPDATE notes SET archived = 1 - archived WHERE id = ?",
                     (note_id, ))
        row = conn.execute("SELECT * FROM notes WHERE id = ?",
                           (note_id, )).fetchone()
        if row is None:
            return None
        note = dict(row)
        return _attach_note_tags(conn, [note])[0]


def delete_note(note_id):
    '''
    ノートを削除する関数
    note_idで指定されたノートを削除する。
    削除に成功した場合はTrueを返し、ノートが見つからない場合はFalseを返す
    '''
    with get_note_conn() as conn:
        conn.execute("DELETE FROM note_tag_links WHERE note_id = ?", (note_id,))
        affected = conn.execute("DELETE FROM notes WHERE id = ?", (note_id,)).rowcount
    return affected > 0


def update_note_tag(tag_id, name, color, closed):
    '''ノートタグを更新する関数。
    初めてクローズする場合のみclosed_atに現在日時を記録する。
    '''
    with get_note_conn() as conn:
        cur = conn.execute(
            "SELECT closed, closed_at FROM note_tags WHERE id = ?", (tag_id,)
        ).fetchone()
        if cur is None:
            return None
        if closed and not cur['closed'] and cur['closed_at'] is None:
            conn.execute(
                "UPDATE note_tags SET name = ?, color = ?, closed = ?, closed_at = datetime('now', 'localtime') WHERE id = ?",
                (name, color, closed, tag_id)
            )
        else:
            conn.execute(
                "UPDATE note_tags SET name = ?, color = ?, closed = ? WHERE id = ?",
                (name, color, closed, tag_id)
            )
        row = conn.execute(
            "SELECT * FROM note_tags WHERE id = ?", (tag_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def get_all_note_tags():
    '''
    ノートタグの一覧を取得する関数
    登録されているノートタグの一覧を返す
    '''
    with get_note_conn() as conn:
        return get_all_tags(conn, "note_tags")


def create_note_tag(name, color):
    '''
    新しいノートタグを作成する関数
    name、colorで指定された内容のノートタグを作成する。
    作成に成功した場合は作成されたノートタグを返す
    '''
    with get_note_conn() as conn:
        return create_tag(conn, "note_tags", name, color)


def update_note_tag_color(tag_id, color):
    '''
    ノートタグの色を更新する関数
    tag_idで指定されたノートタグの色をcolorで更新する。
    更新に成功した場合は更新されたノートタグを返す
    '''
    with get_note_conn() as conn:
        return update_tag_color(conn, "note_tags", tag_id, color)


def delete_note_tag(tag_id):
    '''
    ノートタグを削除する関数
    tag_idで指定されたノートタグを削除する。
    削除に成功した場合はTrueを返し、ノートタグが見つからない場合はFalseを返す
    '''
    with get_note_conn() as conn:
        return delete_tag(conn, "note_tags", "note_tag_links", tag_id)
