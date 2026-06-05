from fastapi import APIRouter, HTTPException, Query
from schemas import NoteCreate, NoteUpdate, NoteReorder, TagCreate, TagColorUpdate
from repository import (
    get_all_notes,
    create_note,
    reorder_notes,
    update_note,
    toggle_note_archive,
    delete_note,
    get_all_note_tags,
    create_note_tag,
    update_note_tag_color,
    delete_note_tag,
)

router = APIRouter()

@router.get("/api/notes")
def list_notes(tag_id: int | None = Query(default=None), archived: bool = Query(default=False)):
    return get_all_notes(tag_id, archived)

@router.post("/api/notes", status_code=201)
def create_note_endpoint(body: NoteCreate):
    return create_note(body.title, body.body, body.color)

@router.put("/api/notes/reorder", status_code=204)
def reorder_notes_endpoint(body: NoteReorder):
    reorder_notes(body.ids)

@router.put("/api/notes/{note_id}")
def update_note_endpoint(note_id: int, body: NoteUpdate):
    note = update_note(note_id, body.title, body.body, body.color, body.tag_ids)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note

@router.patch("/api/notes/{note_id}/archive")
def archive_note_endpoint(note_id: int):
    note = toggle_note_archive(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note

@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note_endpoint(note_id: int):
    if not delete_note(note_id):
        raise HTTPException(status_code=404, detail="Not found")

@router.get("/api/note-tags")
def list_note_tags():
    return get_all_note_tags()

@router.post("/api/note-tags", status_code=201)
def create_note_tag_endpoint(body: TagCreate):
    return create_note_tag(body.name, body.color)

@router.patch("/api/note-tags/{tag_id}/color")
def update_note_tag_color_endpoint(tag_id: int, body: TagColorUpdate):
    tag = update_note_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag

@router.delete("/api/note-tags/{tag_id}", status_code=204)
def delete_note_tag_endpoint(tag_id: int):
    if not delete_note_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")
