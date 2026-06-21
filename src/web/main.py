'''
アプリケーションのエントリーポイントを定義するモジュール
このモジュールでは、FastAPIアプリケーションを作成し、必要なルーターをインクルードし、静的ファイルの提供を設定する。
また、アプリケーションの起動時にデータベースの初期化を行うための関数も呼び出している。
'''

from fastapi import FastAPI
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.staticfiles import StaticFiles
from starlette.requests import Request
from starlette.responses import Response
import time
from .router.todo import router as todo_router
from .router.note import router as note_router
from .repository import init_db
from .service.logger import setup_logging, get_logger

# ロギングを初期化
setup_logging(log_dir="logs")
logger = get_logger()

app = FastAPI()
logger.info("FastAPIアプリケーションを起動しました")


class LoggingMiddleware(BaseHTTPMiddleware):
    '''
    リクエスト・レスポンスをログに記録するミドルウェア
    '''
    async def dispatch(self, request: Request, call_next):
        # リクエスト情報をログ出力
        start_time = time.time()
        logger.info(f"[REQUEST] {request.method} {request.url.path}")
        
        try:
            response = await call_next(request)
            # レスポンス情報をログ出力
            process_time = time.time() - start_time
            logger.info(f"[RESPONSE] {request.method} {request.url.path} - Status: {response.status_code} - Time: {process_time:.3f}s")
            return response
        except Exception as e:
            # エラーをログ出力
            process_time = time.time() - start_time
            logger.error(f"[ERROR] {request.method} {request.url.path} - Exception: {str(e)} - Time: {process_time:.3f}s")
            raise


# ミドルウェアを追加
app.add_middleware(LoggingMiddleware)

try:
    init_db()
    logger.info("データベースを初期化しました")
except Exception as e:
    logger.error(f"データベース初期化エラー: {e}")

app.include_router(todo_router, prefix="/fuyuco")
app.include_router(note_router, prefix="/fuyuco")
app.mount("/fuyuco", StaticFiles(directory="static", html=True), name="static")
