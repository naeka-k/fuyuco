'''
ノート関連のAPIエンドポイントを定義するモジュール
このモジュールでは、ノートの作成、更新、削除、アーカイブ、タグの管理など、ノートに関連するAPIエンドポイントを定義している。
各エンドポイントは、対応するリポジトリ関数を呼び出してデータベース操作を行い、適切なHTTPレスポンスを返す
'''
from fastapi import APIRouter, HTTPException, Query
from ..schemas import NoteCreate, NoteUpdate, NoteReorder, TagCreate, TagColorUpdate
from ..repository import (
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
def list_notes(tag_id: int | None = Query(default=None),
               archived: bool = Query(default=False)):
    '''
    ノートの一覧を取得するエンドポイント
    tag_idで指定されたタグが付けられたノートの一覧を返す。
    tag_idが指定されていない場合は全てのノートの一覧を返す。
    archivedがtrueの場合はアーカイブされたノートの一覧を返し、
    falseの場合はアーカイブされていないノートの一覧を返す
    '''
    return get_all_notes(tag_id, archived)


@router.post("/api/notes", status_code=201)
def create_note_endpoint(body: NoteCreate):
    '''
    新しいノートを作成するエンドポイント
    bodyで指定された内容のノートを作成する。
    作成に成功した場合は作成されたノートを返す
    '''
    return create_note(body.title, body.body, body.color)


@router.put("/api/notes/reorder", status_code=204)
def reorder_notes_endpoint(body: NoteReorder):
    ''' 
    ノートの順番を更新するエンドポイント。
    body.idsにノートIDのリストを渡すと、その順番でノートが並び替えられる
    '''
    reorder_notes(body.ids)


@router.put("/api/notes/{note_id}")
def update_note_endpoint(note_id: int, body: NoteUpdate):
    '''
    ノートの内容を更新するエンドポイント
    note_idで指定されたノートの内容をbodyで更新する。
    更新に成功した場合は更新されたノートを返し、ノートが見つからない場合は404 Not Foundを返す
    '''
    note = update_note(note_id, body.title, body.body, body.color,
                       body.tag_ids)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note


@router.patch("/api/notes/{note_id}/archive")
def archive_note_endpoint(note_id: int):
    '''
    ノートのアーカイブ状態を切り替えるエンドポイント。
    アーカイブされていないノートはアーカイブされ、アーカイブされたノートはアーカイブ解除される
    note_idで指定されたノートのアーカイブ状態を切り替える。
    切り替えに成功した場合は更新されたノートを返し、ノートが見つからない場合は404 Not Foundを返す'''
    note = toggle_note_archive(note_id)
    if note is None:
        raise HTTPException(status_code=404, detail="Not found")
    return note


@router.delete("/api/notes/{note_id}", status_code=204)
def delete_note_endpoint(note_id: int):
    '''
    ノートを削除するエンドポイント
    note_idで指定されたノートを削除する。
    削除に成功した場合は204 No Contentを返し、ノートが見つからない場合は404 Not Foundを返す
    '''
    if not delete_note(note_id):
        raise HTTPException(status_code=404, detail="Not found")


@router.get("/api/note-tags")
def list_note_tags():
    '''
    ノートタグの一覧を取得するエンドポイント
    登録されているノートタグの一覧を返す
    '''
    return get_all_note_tags()


@router.post("/api/note-tags", status_code=201)
def create_note_tag_endpoint(body: TagCreate):
    '''
    新しいノートタグを作成するエンドポイント
    bodyで指定された内容のノートタグを作成する。
    作成に成功した場合は作成されたノートタグを返す
    '''
    return create_note_tag(body.name, body.color)


@router.patch("/api/note-tags/{tag_id}/color")
def update_note_tag_color_endpoint(tag_id: int, body: TagColorUpdate):
    '''
    ノートタグの色を更新するエンドポイント
    tag_idで指定されたノートタグの色をbodyで更新する。
    更新に成功した場合は更新されたノートタグを返し、ノートタグが見つからない場合は404 Not Foundを返す
    '''
    tag = update_note_tag_color(tag_id, body.color)
    if tag is None:
        raise HTTPException(status_code=404, detail="Not found")
    return tag


@router.delete("/api/note-tags/{tag_id}", status_code=204)
def delete_note_tag_endpoint(tag_id: int):
    '''
    ノートタグを削除するエンドポイント
    tag_idで指定されたノートタグを削除する。
    削除に成功した場合は204 No Contentを返し、ノートタグが見つからない場合は404 Not Foundを返す
    '''
    if not delete_note_tag(tag_id):
        raise HTTPException(status_code=404, detail="Not found")
