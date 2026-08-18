'''
TODO関連のデータベース操作を行うモジュール
このモジュールは、TODOの作成、更新、削除、状態の切り替え、タグの管理など、TODOに関連するデータベース操作を行う関数を提供する。
これらの関数は、get_todo_conn()を使用してTODOデータベースへの接続を取得し、必要なSQLクエリを実行してデータベース操作を行う。
'''
from .db_conn import get_todo_conn
from .tag_repo import create_tag, delete_tag, get_all_tags, update_tag_color
from ..service.recurrence import calc_next_deadline, parse_rec
from ..service.utils import attach_tags, parse_urls, urls_to_json
from datetime import date

STATUS_LABELS = {
    'todo': '未着手',
    'doing': '実施中',
    'done': '完了',
    'waiting': '待機中',
}

def generate_recurring_todos():
    '''定期TODOを生成する関数
    定期TODOのルールに従って、必要なTODOを生成する。
    ルールは以下の通り
    - recurrenceとrecurrence_idが設定されているTODOを対象とする
    - 今日の日付を基準に、deadlineが今日以前のTODOを対象とする
    - 対象TODOのrecurrenceを解析し、次のTODOのdeadlineを計算する
    - 次のTODOのdeadlineが今日より後の場合は、次のTODOを生成する
    - 次のTODOのdeadlineが今日以前の場合は、次のTODOを生成し、さらに次のTODOのdeadlineを計算する。これを次のTODOのdeadlineが今日より後になるまで繰り返す
    - TODOを生成する際、元のTODOのtitle、memo、urlを引き継ぐ。また、recurrenceとrecurrence_idも引き継ぐ
    '''
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
                (rid, )).fetchone()
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
                    (rid, )).fetchone()
                cur = conn.execute(
                    "INSERT INTO todos (title, deadline, memo, url, recurrence, recurrence_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (tmpl["title"], next_dl, tmpl["memo"], tmpl["url"], rec,
                     rid))
                new_id = cur.lastrowid
                for tag in conn.execute(
                        "SELECT tag_id FROM todo_label_links WHERE todo_id = ?",
                    (tmpl["id"], )).fetchall():
                    conn.execute(
                        "INSERT OR IGNORE INTO todo_label_links (todo_id, tag_id) VALUES (?, ?)",
                        (new_id, tag["tag_id"]))
                current_dl = next_dl


def _attach_todo_labels(conn, todos):
    '''
    TODOにタグ情報を付与する関数
    todosにtag_idsのリストがある場合、そのIDに対応するタグ情報をtagsというキーで付与する。
    tag_idsがない場合はtagsは空のリストになる
    '''
    if not todos:
        return todos
    attach_tags(conn, todos, 'todo_label_links', 'todo_id', 'todo_labels')
    todo_ids = [t["id"] for t in todos]
    placeholders = ','.join('?' * len(todo_ids))
    memo_rows = conn.execute(
        f"SELECT todo_id, content FROM todo_memos WHERE todo_id IN ({placeholders}) ORDER BY created_at DESC",
        todo_ids
    ).fetchall()
    latest_memos = {}
    for row in memo_rows:
        if row["todo_id"] not in latest_memos:
            latest_memos[row["todo_id"]] = row["content"]
    for todo in todos:
        todo["urls"] = parse_urls(todo.get("url"))
        todo["latest_memo"] = latest_memos.get(todo["id"])
    return todos


def get_all_todos(tag_id=None):
    '''
    TODOの一覧を取得する関数
    tag_idで指定されたタグが付けられたTODOの一覧を取得する
    tag_idは単一のIDのほか、IDのリストも指定でき、その場合はいずれかのタグが付いたTODOを返す（OR条件）
    tag_idが指定されていない場合は全てのTODOの一覧を取得する
    取得されたTODOはdeadlineが近い順にソートされる。
    deadlineがNULLのTODOは最後にまとめて表示される
    '''
    with get_todo_conn() as conn:
        if tag_id is not None:
            tag_ids = tag_id if isinstance(tag_id, (list, tuple)) else [tag_id]
            placeholders = ','.join('?' * len(tag_ids))
            rows = conn.execute(
                f"SELECT DISTINCT t.* FROM todos t JOIN todo_label_links tl ON t.id = tl.todo_id "
                f"WHERE tl.tag_id IN ({placeholders}) ORDER BY t.deadline IS NULL, t.deadline, t.created_at",
                tag_ids).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM todos ORDER BY deadline IS NULL, deadline, created_at"
            ).fetchall()
        todos = [dict(row) for row in rows]
        return _attach_todo_labels(conn, todos)


def create_todo(title, deadline, recurrence=None, urls=None):
    '''
    新しいTODOを作成する関数
    title、deadline、recurrence、urlsで指定された内容のTODOを作成する。
    作成されたTODOを返す
    '''
    with get_todo_conn() as conn:
        cur = conn.execute(
            "INSERT INTO todos (title, deadline, recurrence, url) VALUES (?, ?, ?, ?)",
            (title, deadline, recurrence, urls_to_json(urls)))
        new_id = cur.lastrowid
        if recurrence:
            conn.execute("UPDATE todos SET recurrence_id = ? WHERE id = ?",
                         (new_id, new_id))
        row = conn.execute("SELECT * FROM todos WHERE id = ?",
                           (new_id, )).fetchone()
        todo = dict(row)
        todo["tags"] = []
        todo["urls"] = parse_urls(todo.get("url"))
    return todo


def _apply_status(conn, todo_id, todo, next_status):
    '''
    TODOの状態を更新する関数
    todo_idで指定されたTODOの状態をnext_statusに更新する。
    next_statusは'todo'、'doing'、'done'、'waiting'のいずれかでなければならない
    TODOが完了状態から未完了状態に変更された場合、recurrenceのルールに従って次のTODOを生成する
    '''
    done = 1 if next_status == 'done' else 0
    conn.execute("UPDATE todos SET status = ?, done = ? WHERE id = ?",
                 (next_status, done, todo_id))
    if next_status == 'done' and not todo["done"] and todo[
            "recurrence"] and todo["recurrence_id"] and todo["deadline"]:
        rec_data = parse_rec(todo["recurrence"])
        end_date = rec_data.get("end")
        next_dl = calc_next_deadline(todo["deadline"], rec_data)
        if next_dl and (not end_date or next_dl[:10] <= end_date):
            existing = conn.execute(
                "SELECT id FROM todos WHERE recurrence_id = ? AND deadline = ? AND done = 0",
                (todo["recurrence_id"], next_dl)).fetchone()
            if not existing:
                cur = conn.execute(
                    "INSERT INTO todos (title, deadline, memo, url, recurrence, recurrence_id) VALUES (?, ?, ?, ?, ?, ?)",
                    (todo["title"], next_dl, todo["memo"], todo["url"],
                     todo["recurrence"], todo["recurrence_id"]))
                new_id = cur.lastrowid
                for tag in conn.execute(
                        "SELECT tag_id FROM todo_label_links WHERE todo_id = ?",
                    (todo_id, )).fetchall():
                    conn.execute(
                        "INSERT OR IGNORE INTO todo_label_links (todo_id, tag_id) VALUES (?, ?)",
                        (new_id, tag["tag_id"]))


def toggle_todo(todo_id):
    '''
    TODOの完了状態を切り替える関数
    todo_idで指定されたTODOの完了状態を切り替える。
    切り替えに成功した場合は更新されたTODOを返し、TODOが見つからない場合はNoneを返す
    '''
    _NEXT = {'todo': 'doing', 'doing': 'done', 'done': 'todo', 'waiting': 'todo'}
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?",
                           (todo_id, )).fetchone()
        if row is None:
            return None
        todo = dict(row)
        current = todo.get("status") or ('done' if todo["done"] else 'todo')
        _apply_status(conn, todo_id, todo, _NEXT[current])
        row = conn.execute("SELECT * FROM todos WHERE id = ?",
                           (todo_id, )).fetchone()
        return _attach_todo_labels(conn, [dict(row)])[0]


def set_todo_status(todo_id, status, comment=None):
    '''
    TODOの状態を設定する関数
    todo_idで指定されたTODOの状態をstatusで設定する。
    statusは'todo'、'doing'、'done'、'waiting'のいずれかでなければならない
    状態が実際に変化した場合、「(「旧」→「新」)」形式の自動コメントをメモ履歴に追加する。
    commentが指定された場合はその内容を自動コメントに追記する
    設定に成功した場合は更新されたTODOを返し、TODOが見つからない場合はNoneを返す
    '''
    if status not in ['todo', 'doing', 'done', 'waiting']:
        raise ValueError("Invalid status. Must be 'todo', 'doing', 'done', or 'waiting'.")
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?",
                           (todo_id, )).fetchone()
        if row is None:
            return None
        todo = dict(row)
        old_status = todo.get("status") or ('done' if todo["done"] else 'todo')
        _apply_status(conn, todo_id, todo, status)
        if old_status != status:
            content = f"(「{STATUS_LABELS.get(old_status, old_status)}」→「{STATUS_LABELS.get(status, status)}」)"
            if comment:
                content += f"\n{comment}"
            conn.execute(
                "INSERT INTO todo_memos (todo_id, content) VALUES (?, ?)",
                (todo_id, content))
        row = conn.execute("SELECT * FROM todos WHERE id = ?",
                           (todo_id, )).fetchone()
        return _attach_todo_labels(conn, [dict(row)])[0]


def toggle_todo_starred(todo_id):
    '''
    TODOのスター（優先度）をON/OFFする関数
    todo_idで指定されたTODOのstarredを0→1→0と切り替える。
    成功した場合は更新されたTODOを返し、見つからない場合はNoneを返す
    '''
    with get_todo_conn() as conn:
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        if row is None:
            return None
        new_starred = 0 if row["starred"] else 1
        conn.execute("UPDATE todos SET starred = ? WHERE id = ?", (new_starred, todo_id))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id,)).fetchone()
        return _attach_todo_labels(conn, [dict(row)])[0]


def delete_todo(todo_id):
    '''
    TODOを削除する関数
    todo_idで指定されたTODOを削除する。
    削除に成功した場合はTrueを返し、TODOが見つからない場合はFalseを返す
    '''
    with get_todo_conn() as conn:
        conn.execute("DELETE FROM todo_label_links WHERE todo_id = ?",
                     (todo_id, ))
        affected = conn.execute("DELETE FROM todos WHERE id = ?",
                                (todo_id, )).rowcount
    return affected > 0


def update_todo(todo_id,
                title,
                deadline,
                memo,
                urls,
                tag_ids,
                recurrence=None,
                notify=None):
    '''
    TODOの内容を更新する関数
    todo_idで指定されたTODOの内容をtitle、deadline、memo、urls、tag_ids、recurrenceで更新する。
    urlsはURLのリストで、内部的にはJSON文字列として保存される
    tag_idsはタグIDのリストで、更新の際に既存のタグリンクは全て削除され、
    tag_idsで指定されたタグIDのリンクが新たに作成される
    recurrenceは定期TODOのルールを表す文字列で、更新の際にrecurrence_idの更新も行われる。
    recurrenceが設定されたTODOは、完了状態から未完了状態に変更された際にrecurrenceのルールに従って次のTODOが生成されるようになる
    更新に成功した場合は更新されたTODOを返し、TODOが見つからない場合はNoneを返す
    '''
    with get_todo_conn() as conn:
        current = conn.execute("SELECT recurrence_id FROM todos WHERE id = ?",(todo_id, )).fetchone()
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
            "UPDATE todos SET title = ?, deadline = ?, memo = ?, url = ?, recurrence = ?, recurrence_id = ?, notify = ? WHERE id = ?",
            (title, deadline, memo, urls_to_json(urls), recurrence, recurrence_id, notify, todo_id))
        conn.execute("DELETE FROM todo_label_links WHERE todo_id = ?", (todo_id, ))
        for tid in tag_ids:
            conn.execute(
                "INSERT OR IGNORE INTO todo_label_links (todo_id, tag_id) VALUES (?, ?)",
                (todo_id, tid))
        row = conn.execute("SELECT * FROM todos WHERE id = ?", (todo_id, )).fetchone()
        if row is None:
            return None
        todo = dict(row)
        return _attach_todo_labels(conn, [todo])[0]


def get_todo_memos(todo_id):
    '''
    TODOのメモを取得する関数。
    複数ありうる。
    順序は作成日の降順。
    '''
    with get_todo_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM todo_memos WHERE todo_id = ? ORDER BY created_at DESC",
            (todo_id,)
        ).fetchall()
        return [dict(row) for row in rows]


def create_todo_memo(todo_id, content):
    '''
    TODOのメモを新規追加する関数
    作成に成功した場合はその内容を返す
    '''

    with get_todo_conn() as conn:
        cur = conn.execute(
            "INSERT INTO todo_memos (todo_id, content) VALUES (?, ?)",
            (todo_id, content)
        )
        row = conn.execute(
            "SELECT * FROM todo_memos WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def update_todo_memo(memo_id, content):
    '''
    TODOのメモを更新する関数
    更新に成功した場合はその内容を返す
    '''
    with get_todo_conn() as conn:
        conn.execute(
            "UPDATE todo_memos SET content = ? WHERE id = ?",
            (content, memo_id)
        )
        row = conn.execute(
            "SELECT * FROM todo_memos WHERE id = ?", (memo_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def delete_todo_memo(memo_id):
    '''
    TODOのメモを削除する関数
    1件以上削除に成功した場合はTrueを返し、見つからない場合はFalseを返す
    '''
    with get_todo_conn() as conn:
        affected = conn.execute(
            "DELETE FROM todo_memos WHERE id = ?", (memo_id,)
        ).rowcount
    return affected > 0


def get_label_timeline(label_id):
    '''ラベルのタイムラインを取得する関数。
    label_idで指定されたラベルが付けられたTODOのメモを、
    作成日時の降順（新しい順）で返す。
    各要素にはメモの内容・作成日時に加え、紐づくTODOのidとtitleを含む。
    '''
    with get_todo_conn() as conn:
        rows = conn.execute(
            "SELECT m.id, m.todo_id, m.content, m.created_at, t.title AS todo_title "
            "FROM todo_memos m "
            "JOIN todo_label_links tl ON tl.todo_id = m.todo_id "
            "JOIN todos t ON t.id = m.todo_id "
            "WHERE tl.tag_id = ? "
            "ORDER BY m.created_at DESC",
            (label_id,)
        ).fetchall()
        return [dict(row) for row in rows]


def update_todo_label(tag_id, name, color, closed, memo=""):
    '''TODOラベルを更新する関数。
    クローズする際は毎回closed_atに現在日時を記録する（再クローズ時も更新される）。
    '''
    with get_todo_conn() as conn:
        cur = conn.execute(
            "SELECT closed, closed_at FROM todo_labels WHERE id = ?", (tag_id,)
        ).fetchone()
        if cur is None:
            return None
        if closed and not cur['closed']:
            conn.execute(
                "UPDATE todo_labels SET name = ?, color = ?, closed = ?, memo = ?, closed_at = datetime('now', 'localtime') WHERE id = ?",
                (name, color, closed, memo, tag_id)
            )
        else:
            conn.execute(
                "UPDATE todo_labels SET name = ?, color = ?, closed = ?, memo = ? WHERE id = ?",
                (name, color, closed, memo, tag_id)
            )
        row = conn.execute(
            "SELECT * FROM todo_labels WHERE id = ?", (tag_id,)
        ).fetchone()
        if row is None:
            return None
        return dict(row)


def get_all_todo_labels():
    '''
    TODOタグの一覧を取得する関数
    登録されているTODOタグの一覧を返す
    '''
    with get_todo_conn() as conn:
        return get_all_tags(conn, "todo_labels")


def create_todo_label(name, color):
    '''
    TODOタグを作成する関数
    nameで指定された名前とcolorで指定された色を持つTODOタグを作成する。
    作成に成功した場合は作成されたタグを返し、失敗した場合はNoneを返す
    '''
    with get_todo_conn() as conn:
        return create_tag(conn, "todo_labels", name, color)


def update_todo_label_color(tag_id, color):
    '''
    TODOタグの色を更新する関数
    tag_idで指定されたTODOタグの色をcolorで更新する。
    更新に成功した場合はTrueを返し、タグが見つからない場合はFalseを返す
    '''
    with get_todo_conn() as conn:
        return update_tag_color(conn, "todo_labels", tag_id, color)


def delete_todo_label(tag_id):
    '''
    TODOタグを削除する関数
    tag_idで指定されたTODOタグを削除する。
    削除に成功した場合はTrueを返し、TODOタグが見つからない場合はFalseを返す
    '''
    with get_todo_conn() as conn:
        return delete_tag(conn, "todo_labels", "todo_label_links", tag_id)


def get_label_links(label_id):
    '''ラベルに紐づくリンクの一覧を取得する関数。
    label_idで指定されたラベルのリンクを、作成日時の昇順で返す。
    '''
    with get_todo_conn() as conn:
        rows = conn.execute(
            "SELECT * FROM label_links WHERE label_id = ? ORDER BY id",
            (label_id,)
        ).fetchall()
        return [dict(r) for r in rows]


def create_label_link(label_id, title, url):
    '''ラベルにリンクを新規作成する関数。
    作成に成功した場合は作成されたリンクを返す。
    '''
    with get_todo_conn() as conn:
        cur = conn.execute(
            "INSERT INTO label_links (label_id, title, url) VALUES (?, ?, ?)",
            (label_id, title, url)
        )
        row = conn.execute(
            "SELECT * FROM label_links WHERE id = ?", (cur.lastrowid,)
        ).fetchone()
        return dict(row)


def update_label_link(link_id, title, url):
    '''ラベルのリンクを更新する関数。
    更新に成功した場合は更新されたリンクを返し、リンクが見つからない場合はNoneを返す。
    '''
    with get_todo_conn() as conn:
        cur = conn.execute(
            "UPDATE label_links SET title = ?, url = ? WHERE id = ?",
            (title, url, link_id)
        )
        if cur.rowcount == 0:
            return None
        row = conn.execute(
            "SELECT * FROM label_links WHERE id = ?", (link_id,)
        ).fetchone()
        return dict(row)


def delete_label_link(link_id):
    '''ラベルのリンクを削除する関数。
    削除に成功した場合はTrueを返し、リンクが見つからない場合はFalseを返す。
    '''
    with get_todo_conn() as conn:
        affected = conn.execute(
            "DELETE FROM label_links WHERE id = ?", (link_id,)
        ).rowcount
        return affected > 0
