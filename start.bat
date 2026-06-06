@echo off
set PYTHONPATH=%PYTHONPATH%;src
uvicorn web.main:app --reload --port 8001