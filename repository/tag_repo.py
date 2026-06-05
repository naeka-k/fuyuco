def get_all_tags(conn, tag_table):
    rows = conn.execute(f"SELECT * FROM {tag_table} ORDER BY name").fetchall()
    return [dict(r) for r in rows]


def create_tag(conn, tag_table, name, color):
    cur = conn.execute(
        f"INSERT INTO {tag_table} (name, color) VALUES (?, ?)",
        (name, color)
    )
    row = conn.execute(f"SELECT * FROM {tag_table} WHERE id = ?", (cur.lastrowid,)).fetchone()
    return dict(row)


def update_tag_color(conn, tag_table, tag_id, color):
    conn.execute(f"UPDATE {tag_table} SET color = ? WHERE id = ?", (color, tag_id))
    row = conn.execute(f"SELECT * FROM {tag_table} WHERE id = ?", (tag_id,)).fetchone()
    return dict(row) if row else None


def delete_tag(conn, tag_table, link_table, tag_id):
    conn.execute(f"DELETE FROM {link_table} WHERE tag_id = ?", (tag_id,))
    affected = conn.execute(f"DELETE FROM {tag_table} WHERE id = ?", (tag_id,)).rowcount
    return affected > 0
