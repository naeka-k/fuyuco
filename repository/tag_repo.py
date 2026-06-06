def get_all_tags(conn, tag_table):
    '''
    タグの一覧を取得する関数
    tag_tableで指定されたタグテーブルの一覧を取得する。
    タグはnameの'昇順でソートされて返される
    '''
    rows = conn.execute(f"SELECT * FROM {tag_table} ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def create_tag(conn, tag_table, name, color):
    '''
    新しいタグを作成する関数
    tag_tableで指定されたタグテーブルに、name、colorで指定された内容のタグを作成する。
    作成に成功した場合は作成されたタグを返す
    '''
    cur = conn.execute(f"INSERT INTO {tag_table} (name, color) VALUES (?, ?)",
                       (name, color))
    row = conn.execute(f"SELECT * FROM {tag_table} WHERE id = ?",
                       (cur.lastrowid, )).fetchone()
    return dict(row)


def update_tag_color(conn, tag_table, tag_id, color):
    '''
    タグの色を更新する関数
    tag_tableで指定されたタグテーブルの、tag_idで指定されたタグの色を更新する。
    更新に成功した場合は更新されたタグを返す
    '''
    conn.execute(f"UPDATE {tag_table} SET color = ? WHERE id = ?", (color, tag_id))
    row = conn.execute(f"SELECT * FROM {tag_table} WHERE id = ?", (tag_id,)).fetchone()
    return dict(row) if row else None


def delete_tag(conn, tag_table, link_table, tag_id):
    '''
    タグを削除する関数
    tag_tableで指定されたタグテーブルの、tag_idで指定されたタグを削除する。
    削除に成功した場合はTrueを返し、タグが見つからない場合はFalseを返す
    '''
    conn.execute(f"DELETE FROM {link_table} WHERE tag_id = ?", (tag_id, ))
    affected = conn.execute(f"DELETE FROM {tag_table} WHERE id = ?",
                            (tag_id, )).rowcount
    return affected > 0
