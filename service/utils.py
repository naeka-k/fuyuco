import json


def parse_urls(url_str):
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
    filtered = [u for u in (urls or []) if u]
    return json.dumps(filtered) if filtered else None


def attach_tags(conn, items, link_table, link_id_field, tag_table):
    if not items:
        return items

    ids = [item["id"] for item in items]
    placeholders = ",".join("?" * len(ids))
    rows = conn.execute(
        f"SELECT l.{link_id_field} AS item_id, t.id, t.name, t.color "
        f"FROM {link_table} l JOIN {tag_table} t ON t.id = l.tag_id WHERE l.{link_id_field} IN ({placeholders})",
        ids
    ).fetchall()

    tag_map = {item["id"]: [] for item in items}
    for r in rows:
        tag_map[r["item_id"]].append({"id": r["id"], "name": r["name"], "color": r["color"]})

    for item in items:
        item["tags"] = tag_map[item["id"]]

    return items
