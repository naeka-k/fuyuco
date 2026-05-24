from fastapi import FastAPI, HTTPException, Query
from fastapi.staticfiles import StaticFiles
from fastapi.routing import APIRouter
from pydantic import BaseModel
import database

app = FastAPI()
router = APIRouter()
database.init_db()

class TodoCreate(BaseModel):
    title: str
    deadline: str | None = None
    recurrence: str | None = None

class TodoUpdate(BaseModel):
    title: str
    deadline: str | None = None
    memo: str | None = None
    urls: list[str] = []
    tag_ids: list[int] = []
    recurrence: str | None = None

class NoteCreate(BaseModel):
    title: str = ""
    body: str = ""
    color: str = "#ffffff"

class NoteUpdate(BaseModel):
    title: str = ""
    body: str = ""
    color: str = "#ffffff"
    tag_ids: list[int] = []

class NoteReorder(BaseModel):
    ids: list[int]

class StatusUpdate(BaseModel):
    status: str  # 'todo' | 'doing' | 'done'

class TagCreate(BaseModel):
    name: str
    color: str = "#93c5fd"

class TagColorUpdate(BaseModel):
    color: str

# ── TODO ────────────────────────────────────────

@router.get("/api/todos")
def list_todos(tag_id: int | None = Query(default=None)):
    return database.get_all_todos(tag_id)

@router.post("/api/todos", status_code=201)
def create_todo(body: TodoCreate):
    return database.create_todo(body.title, body.deadline, body.recurrence)

@router.patch("/api/todos/{todo_id}/toggle")
def toggle_todo(todo_id: int):
    todo = database.toggle_todo(todo_id)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.patch("/api/todos/{todo_id}/status")
def set_todo_status(todo_id: int, body: StatusUpdate):
    if body.status not in ('todo', 'doing', 'done'):
        raise HTTPException(status_code=400, detail="Invalid status")
    todo = database.set_todo_status(todo_id, body.status)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.put("/api/todos/{todo_id}")
def update_todo(todo_id: int, body: TodoUpdate):
    todo = database.update_todo(todo_id, body.title, body.deadline, body.memo, body.urls, body.tag_ids, body.recurrence)
    if todo is None:
        raise HTTPException(status_code=404, detail="Not found")
    return todo

@router.delete("/api/todos/{todo_id}", status_code=204)
def delete_todo(todo_id: int):
    if not database.delete_todo(todo_id):
        raise HTTPException(status_code=404, detail="Not found")

@router.get("/api/todo-tags")
def list_todo_tags():
    return database.get_all_todo_tags()

@router.post("/api/todo-tags", status_code=201)
def create_todo_tag(body: TagCreate):
    return database.create_todo_tag(body.name, body.color)

@router.patch("/api/todo-tags/{tag_id}/color")
def update_todo_tag_color(tag_id: int, body: TagColorUpdate):
    tag = database.update_todo_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag

@router.delete("/api/todo-tags/{tag_id}", status_code=204)
def delete_todo_tag(tag_id: int):
    if not database.delete_todo_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")

# ── NOTE ────────────────────────────────────────

@router.get("/api/notes")
def list_notes(tag_id: int | None = Query(default=None), archived: bool = Query(default=False)):
    return database.get_all_notes(tag_id, archived)

@router.post("/api/notes", status_code=201)
def create_note(body: NoteCreate):
    return database.create_note(body.title, body.body, body.color)

@router.put("/api/notes/reorder", status_code=204)
def reorder_notes(body: NoteReorder):
    database.reorder_notes(body.ids)

@router.put("/api/notes/{note_id}")
def update_note(note_id: int, body: NoteUpdate):
    note = database.update_note(note_id, body.title, body.body, body.color, body.tag_ids)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note

@router.patch("/api/notes/{note_id}/archive")
def archive_note(note_id: int):
    note = database.toggle_note_archive(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note

@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note(note_id: int):
    if not database.delete_note(note_id):
        raise HTTPException(status_code=404, detail="Not found")

@router.get("/api/note-tags")
def list_note_tags():
    return database.get_all_note_tags()

@router.post("/api/note-tags", status_code=201)
def create_note_tag(body: TagCreate):
    return database.create_note_tag(body.name, body.color)

@router.patch("/api/note-tags/{tag_id}/color")
def update_note_tag_color(tag_id: int, body: TagColorUpdate):
    tag = database.update_note_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag

@router.delete("/api/note-tags/{tag_id}", status_code=204)
def delete_note_tag(tag_id: int):
    if not database.delete_note_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")

app.include_router(router, prefix="/fuyuco")
app.mount("/fuyuco", StaticFiles(directory="static", html=True), name="static")
