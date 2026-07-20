'''
TODO関連のAPIエンドポイントを定義するモジュール
このモジュールでは、TODOの作成、更新、削除、状態変更、タグの管理など、TODOに関連するAPIエンドポイントを定義している。
各エンドポイントは、対応するリポジトリ関数を呼び出してデータベース操作を行い、適切なHTTPレスポンスを返す
'''
from fastapi import APIRouter, HTTPException, Query
from ..schemas import (
    TodoCreate, TodoUpdate, StatusUpdate, TagCreate, TagColorUpdate, TagUpdate,
    TodoMemoCreate, TodoMemoUpdate, LabelLinkCreate, LabelLinkUpdate,
)
from ..repository import (
    get_all_todos,
    create_todo,
    toggle_todo,
    toggle_todo_starred,
    set_todo_status,
    update_todo,
    delete_todo,
    get_all_todo_labels,
    create_todo_label,
    update_todo_label,
    update_todo_label_color,
    delete_todo_label,
    get_todo_memos,
    create_todo_memo,
    update_todo_memo,
    delete_todo_memo,
    get_label_links,
    create_label_link,
    update_label_link,
    delete_label_link,
)

router = APIRouter()

@router.get("/api/todos")
def list_todos(tag_id: int | None = Query(default=None)):
    '''
    TODOの一覧を取得するエンドポイント
    tag_idで指定されたタグが付けられたTODOの一覧を返す。
    tag_idが指定されていない場合は全てのTODOの一覧を返す
    '''
    return get_all_todos(tag_id)


@router.post("/api/todos", status_code=201)
def create_todo_endpoint(body: TodoCreate):
    '''
    新しいTODOを作成するエンドポイント
    bodyで指定された内容のTODOを作成する。
    作成に成功した場合は作成されたTODOを返す
    '''
    return create_todo(body.title, body.deadline, body.recurrence)


@router.patch("/api/todos/{todo_id}/toggle")
def toggle_todo_endpoint(todo_id: int):
    '''
    TODOの完了状態を切り替えるエンドポイント
    todo_idで指定されたTODOの完了状態を切り替える。
    切り替えに成功した場合は更新されたTODOを返し、TODOが見つからない場合は404 Not Foundを返す
    '''
    todo = toggle_todo(todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo


@router.patch("/api/todos/{todo_id}/star")
def toggle_star_endpoint(todo_id: int):
    '''
    TODOのスター（優先度）をON/OFFするエンドポイント
    todo_idで指定されたTODOのstarredを切り替える。
    成功した場合は更新されたTODOを返し、見つからない場合は404 Not Foundを返す
    '''
    todo = toggle_todo_starred(todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo


@router.patch("/api/todos/{todo_id}/status")
def set_todo_status_endpoint(todo_id: int, body: StatusUpdate):
    '''
    TODOの状態を設定するエンドポイント
    todo_idで指定されたTODOの状態をbody.statusで設定する。
    設定に成功した場合は更新されたTODOを返し、TODOが見つからない場合は404 Not Foundを返す
    '''
    if body.status not in ('todo', 'doing', 'done', 'waiting'):
        raise HTTPException(status_code=400, detail="Invalid status")
    todo = set_todo_status(todo_id, body.status)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo


@router.put("/api/todos/{todo_id}")
def update_todo_endpoint(todo_id: int, body: TodoUpdate):
    '''
    TODOの内容を更新するエンドポイント
    todo_idで指定されたTODOの内容をbodyで更新する。
    更新に成功した場合は更新されたTODOを返し、TODOが見つからない場合は404 Not Foundを返す
    '''
    todo = update_todo(todo_id, body.title, body.deadline, body.memo,
                       body.urls, body.tag_ids, body.recurrence, body.notify)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo


@router.delete("/api/todos/{todo_id}", status_code=204)
def delete_todo_endpoint(todo_id: int):
    '''
    TODOを削除するエンドポイント
    todo_idで指定されたTODOを削除する。
    削除に成功した場合は204 No Contentを返し、TODOが見つからない場合は404 Not Foundを返す
    '''
    if not delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/todo-labels")
def list_todo_labels():
    return get_all_todo_labels()


@router.post("/api/todo-labels", status_code=201)
def create_todo_label_endpoint(body: TagCreate):
    return create_todo_label(body.name, body.color)


@router.patch("/api/todo-labels/{tag_id}/color")
def update_todo_label_color_endpoint(tag_id: int, body: TagColorUpdate):
    tag = update_todo_label_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag


@router.put("/api/todo-labels/{tag_id}")
def update_todo_label_endpoint(tag_id: int, body: TagUpdate):
    tag = update_todo_label(tag_id, body.name, body.color, body.closed, body.memo)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag


@router.delete("/api/todo-labels/{tag_id}", status_code=204)
def delete_todo_label_endpoint(tag_id: int):
    if not delete_todo_label(tag_id):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/todos/{todo_id}/memos")
def list_todo_memos(todo_id: int):
    return get_todo_memos(todo_id)


@router.post("/api/todos/{todo_id}/memos", status_code=201)
def create_todo_memo_endpoint(todo_id: int, body: TodoMemoCreate):
    return create_todo_memo(todo_id, body.content)


@router.put("/api/todos/{todo_id}/memos/{memo_id}")
def update_todo_memo_endpoint(todo_id: int, memo_id: int, body: TodoMemoUpdate):
    memo = update_todo_memo(memo_id, body.content)
    if memo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return memo


@router.delete("/api/todos/{todo_id}/memos/{memo_id}", status_code=204)
def delete_todo_memo_endpoint(todo_id: int, memo_id: int):
    if not delete_todo_memo(memo_id):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/todo-labels/{tag_id}/links")
def list_label_links(tag_id: int):
    return get_label_links(tag_id)


@router.post("/api/todo-labels/{tag_id}/links", status_code=201)
def create_label_link_endpoint(tag_id: int, body: LabelLinkCreate):
    return create_label_link(tag_id, body.title, body.url)


@router.put("/api/todo-labels/{tag_id}/links/{link_id}")
def update_label_link_endpoint(tag_id: int, link_id: int, body: LabelLinkUpdate):
    link = update_label_link(link_id, body.title, body.url)
    if link is None:
        raise HTTPException(status_code=404, detail="Not found")
    return link


@router.delete("/api/todo-labels/{tag_id}/links/{link_id}", status_code=204)
def delete_label_link_endpoint(tag_id: int, link_id: int):
    if not delete_label_link(link_id):
        raise HTTPException(status_code=404, detail="Not found")
