'''
TODO関連のAPIエンドポイントを定義するモジュール
このモジュールでは、TODOの作成、更新、削除、状態変更、タグの管理など、TODOに関連するAPIエンドポイントを定義している。
各エンドポイントは、対応するリポジトリ関数を呼び出してデータベース操作を行い、適切なHTTPレスポンスを返す
'''
from fastapi import APIRouter, HTTPException, Query
from ..schemas import TodoCreate, TodoUpdate, StatusUpdate, TagCreate, TagColorUpdate
from ..repository import (
    get_all_todos,
    create_todo,
    toggle_todo,
    set_todo_status,
    update_todo,
    delete_todo,
    get_all_todo_tags,
    create_todo_tag,
    update_todo_tag_color,
    delete_todo_tag,
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


@router.patch("/api/todos/{todo_id}/status")
def set_todo_status_endpoint(todo_id: int, body: StatusUpdate):
    '''
    TODOの状態を設定するエンドポイント
    todo_idで指定されたTODOの状態をbody.statusで設定する。
    設定に成功した場合は更新されたTODOを返し、TODOが見つからない場合は404 Not Foundを返す
    '''
    if body.status not in ('todo', 'doing', 'done'):
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
                       body.urls, body.tag_ids, body.recurrence)
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


@router.get("/api/todo-tags")
def list_todo_tags():
    '''TODOタグの一覧を取得するエンドポイント
    登録されているTODOタグの一覧を返す
    '''
    return get_all_todo_tags()


@router.post("/api/todo-tags", status_code=201)
def create_todo_tag_endpoint(body: TagCreate):
    '''
    新しいTODOタグを作成するエンドポイント
    bodyで指定された内容のTODOタグを作成する。
    作成に成功した場合は作成されたTODOタグを返す
    '''
    return create_todo_tag(body.name, body.color)


@router.patch("/api/todo-tags/{tag_id}/color")
def update_todo_tag_color_endpoint(tag_id: int, body: TagColorUpdate):
    '''
    TODOタグの色を更新するエンドポイント
    tag_idで指定されたTODOタグの色をbodyで更新する。
    更新に成功した場合は更新されたTODOタグを返し、TODOタグが見つからない場合は404 Not Foundを返す
    '''
    tag = update_todo_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag


@router.delete("/api/todo-tags/{tag_id}", status_code=204)
def delete_todo_tag_endpoint(tag_id: int):
    '''
    TODOタグを削除するエンドポイント
    tag_idで指定されたTODOタグを削除する。
    削除に成功した場合は204 No Contentを返し、TODOタグが見つからない場合は404 Not Foundを返す
    '''
    if not delete_todo_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")
