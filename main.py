from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from router.todo import router as todo_router
from router.note import router as note_router
from repository import init_db

app = FastAPI()
init_db()

app.include_router(todo_router, prefix="/fuyuco")
app.include_router(note_router, prefix="/fuyuco")
app.mount("/fuyuco", StaticFiles(directory="static", html=True), name="static")
