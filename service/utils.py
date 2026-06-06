import json

'''
ユーティリティ関数を提供するモジュール
このモジュールでは、URLの解析とJSON変換を行う関数や、アイテムにタグを付与する関数を提供する。
parse_urls関数は、URLの文字列を解析してリスト形式で返す。
urls_to_json関数は、URLのリストをJSON形式の文字列に変換する。
attach_tags関数は、データベース接続とアイテムのリストを受け取り、アイテムに関連するタグを付与して返す。
attach_tags関数は、タグの関連テーブルとタグテーブルの名前を引数として受け取ることで、TODOやノートなど異なるアイテムに対応できるようになっている。
'''


def parse_urls(url_str):
    '''
    URLの文字列を解析する関数
    url_strで指定されたURLの文字列を解析して、URLのリストを返す。
    url_strが空の場合は空のリストを返す。
    url_strがJSON形式のリストであれば、そのリストを返す。
    url_strがJSON形式のリストでない場合は、url_strを1つのURLとみなしてリストにして返す。
    '''
    if not url_str:
        return []
    try:
        parsed = json.loads(url_str)
        if isinstance(parsed, list):
            return [u for u in parsed if u]
    except (json.JSONDecodeError, ValueError):
        pass
    return [url_str]


def urls_to_json(urls):
    '''
    URLのリストをJSON形式の文字列に変換する関数
    urlsで指定されたURLのリストをJSON形式の文字列に変換して返す。
    urlsが空の場合はNoneを返す。
    urlsが空でない場合は、urlsの中の空でないURLをフィルタリングしてJSON形式の文字列に変換して返す。
    '''
    filtered = [u for u in (urls or []) if u]
    return json.dumps(filtered) if filtered else None


def attach_tags(conn, items, link_table, link_id_field, tag_table):
    '''
    アイテムにタグを付与する関数
    connで指定されたデータベース接続を使用して、itemsで指定されたアイテムのリストにタグを付与する。
    link_tableで指定されたタグの関連テーブルと、link_id_fieldで指定されたアイテムIDのフィールド名、tag_tableで指定されたタグテーブルの名前を使用して、アイテムに関連するタグを取得し、アイテムに'tags'キーで付与して返す。
    itemsが空の場合は、そのまま返す。
    '''
    if not items:
        return items

    ids = [item["id"] for item in items]
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT l.{link_id_field} AS item_id, t.id, t.name, t.color "
        f"FROM {link_table} l JOIN {tag_table} t ON t.id = l.tag_id WHERE l.{link_id_field} IN ({placeholders})",
        ids).fetchall()

    tag_map = {item["id"]: [] for item in items}
    for r in rows:
        tag_map[r["item_id"]].append({
            "id": r["id"],
            "name": r["name"],
            "color": r["color"]
        })

    for item in items:
        item["tags"] = tag_map[item["id"]]

    return items
