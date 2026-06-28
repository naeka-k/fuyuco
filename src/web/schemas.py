'''
このモジュールは、TODOやノートの作成、更新、削除などのAPIエンドポイントで使用されるPydanticモデルを定義する。
これらのモデルは、APIエンドポイントでリクエストボディのバリデーションやシリアライズに使用される。
TODOCreateは、TODOの作成に必要なフィールドを定義するモデルで、titleは必須で、deadlineとrecurrenceはオプションである。
TODOUpdateは、TODOの更新に必要なフィールドを定義するモデルで、titleは必須で、deadline、memo、urls、tag_ids、recurrenceはオプションである。
NoteCreateは、ノートの作成に必要なフィールドを定義するモデルで、title、body、colorはすべてオプションである。
NoteUpdateは、ノートの更新に必要なフィールドを定義するモデルで、title、body、colorはすべてオプションで、tag_idsもオプションである。
NoteReorderは、ノートの順番を更新するためのモデルで、idsフィールドはノートIDのリストを定義する。
StatusUpdateは、TODOの状態を更新するためのモデルで、statusフィールドは  'todo'、'doing'、'done'のいずれかを定義する。
TagCreateは、タグの作成に必要なフィールドを定義するモデルで、nameは必須で、colorはオプションである。
TagColorUpdateは、タグの色を更新するためのモデルで、colorフィールドは必須である。
'''
from pydantic import BaseModel

class TodoCreate(BaseModel):
    '''TODOの作成に必要なフィールドを定義するモデル
    titleは必須で、deadlineとrecurrenceはオプションである
    '''
    title: str
    deadline: str | None = None
    recurrence: str | None = None

class TodoUpdate(BaseModel):
    '''TODOの更新に必要なフィールドを定義するモデル
    titleは必須で、deadline、memo、urls、tag_ids、recurrenceはオプションである
    '''
    title: str
    deadline: str | None = None
    memo: str | None = None
    urls: list[str] = []
    tag_ids: list[int] = []
    recurrence: str | None = None

class NoteCreate(BaseModel):
    '''
    ノートの作成に必要なフィールドを定義するモデル
    title、body、colorはすべてオプションである
    '''
    title: str = ""
    body: str = ""
    color: str = "#ffffff"

class NoteUpdate(BaseModel):
    '''
    ノートの更新に必要なフィールドを定義するモデル
    title、body、colorはすべてオプションで、tag_idsもオプションである
    '''
    title: str = ""
    body: str = ""
    color: str = "#ffffff"
    tag_ids: list[int] = []

class NoteReorder(BaseModel):
    '''
    ノートの順番を更新するためのモデル
    idsフィールドはノートIDのリストを定義する
    '''
    ids: list[int]

class StatusUpdate(BaseModel):
    '''
    TODOの状態を更新するためのモデル
    statusフィールドは 'todo'、'doing'、'done'のいずれかを定義する
    '''
    status: str

class TagCreate(BaseModel):
    '''
    タグの作成に必要なフィールドを定義するモデル
    nameは必須で、colorはオプションである
    '''
    name: str
    color: str = "#93c5fd"

class TagColorUpdate(BaseModel):
    '''
    タグの色を更新するためのモデル
    colorフィールドは必須である
    '''
    color: str

class TodoMemoCreate(BaseModel):
    content: str = ""

class TodoMemoUpdate(BaseModel):
    content: str = ""
