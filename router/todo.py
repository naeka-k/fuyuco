from fastapi import APIRouter, HTTPException, Query
from schemas import TodoCreate, TodoUpdate, StatusUpdate, TagCreate, TagColorUpdate
from repository import (
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
    return get_all_todos(tag_id)

@router.post("/api/todos", status_code=201)
def create_todo_endpoint(body: TodoCreate):
    return create_todo(body.title, body.deadline, body.recurrence)

@router.patch("/api/todos/{todo_id}/toggle")
def toggle_todo_endpoint(todo_id: int):
    todo = toggle_todo(todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.patch("/api/todos/{todo_id}/status")
def set_todo_status_endpoint(todo_id: int, body: StatusUpdate):
    if body.status not in ('todo', 'doing', 'done'):
        raise HTTPException(status_code=400, detail="Invalid status")
    todo = set_todo_status(todo_id, body.status)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.put("/api/todos/{todo_id}")
def update_todo_endpoint(todo_id: int, body: TodoUpdate):
    todo = update_todo(todo_id, body.title, body.deadline, body.memo, body.urls, body.tag_ids, body.recurrence)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.delete("/api/todos/{todo_id}", status_code=204)
def delete_todo_endpoint(todo_id: int):
    if not delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="Not found")

@router.get("/api/todo-tags")
def list_todo_tags():
    return get_all_todo_tags()

@router.post("/api/todo-tags", status_code=201)
def create_todo_tag_endpoint(body: TagCreate):
    return create_todo_tag(body.name, body.color)

@router.patch("/api/todo-tags/{tag_id}/color")
def update_todo_tag_color_endpoint(tag_id: int, body: TagColorUpdate):
    tag = update_todo_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag

@router.delete("/api/todo-tags/{tag_id}", status_code=204)
def delete_todo_tag_endpoint(tag_id: int):
    if not delete_todo_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")
