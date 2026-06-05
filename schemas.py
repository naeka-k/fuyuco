from pydantic import BaseModel

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
    status: str

class TagCreate(BaseModel):
    name: str
    color: str = "#93c5fd"

class TagColorUpdate(BaseModel):
    color: str
