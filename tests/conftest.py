import pytest
import web.repository.db_conn as db_conn
from web.repository.db_init import init_db


@pytest.fixture
def db(tmp_path, monkeypatch):
    monkeypatch.setattr(db_conn, 'TODO_DB', str(tmp_path / 'todo.db'))
    monkeypatch.setattr(db_conn, 'NOTE_DB', str(tmp_path / 'memo.db'))
    init_db()
