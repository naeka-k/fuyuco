'''
アプリケーションのエントリーポイントを定義するモジュール
このモジュールでは、FastAPIアプリケーションを作成し、必要なルーターをインクルードし、静的ファイルの提供を設定する。
また、アプリケーションの起動時にデータベースの初期化を行うための関数も呼び出している。
'''

from fastapi import FastAPI
from starlette.staticfiles import StaticFiles
from .router.todo import router as todo_router
from .router.note import router as note_router
from .repository import init_db

app = FastAPI()
init_db()

app.include_router(todo_router, prefix="/fuyuco")
app.include_router(note_router, prefix="/fuyuco")
app.mount("/fuyuco", StaticFiles(directory="static", html=True), name="static")
