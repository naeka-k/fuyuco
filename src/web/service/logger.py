'''
ロギングを設定するモジュール
ファイルとコンソールの両方にログを出力するように設定する
'''
import logging
import logging.handlers
from pathlib import Path
from datetime import datetime


def setup_logging(log_dir: str = "logs", log_level: int = logging.INFO) -> logging.Logger:
    '''
    ロギング設定を初期化する関数
    ファイルとコンソールの両方に出力する
    
    Args:
        log_dir: ログファイルを保存するディレクトリ
        log_level: ログレベル（デフォルト: INFO）
    
    Returns:
        logger インスタンス
    '''
    # ログディレクトリを作成
    log_path = Path(log_dir)
    log_path.mkdir(exist_ok=True)
    
    # ロガーを取得
    logger = logging.getLogger("fuyuco")
    logger.setLevel(log_level)
    
    # 既存のハンドラをクリア（重複登録を防ぐ）
    if logger.hasHandlers():
        logger.handlers.clear()
    
    # ログフォーマット
    formatter = logging.Formatter(
        '%(asctime)s - %(name)s - %(levelname)s - %(message)s',
        datefmt='%Y-%m-%d %H:%M:%S'
    )
    
    # ファイルハンドラ（日付ごとのローテーション）
    log_file = log_path / f"fuyuco_{datetime.now().strftime('%Y%m%d')}.log"
    file_handler = logging.FileHandler(log_file, encoding='utf-8')
    file_handler.setLevel(log_level)
    file_handler.setFormatter(formatter)
    logger.addHandler(file_handler)
    
    # コンソールハンドラ
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    console_handler.setFormatter(formatter)
    logger.addHandler(console_handler)
    
    logger.info(f"ロギングを初期化しました。ログファイル: {log_file}")
    
    return logger


def get_logger(name: str = "fuyuco") -> logging.Logger:
    '''
    ロガーインスタンスを取得する関数
    
    Args:
        name: ロガー名（デフォルト: "fuyuco"）
    
    Returns:
        logger インスタンス
    '''
    return logging.getLogger(name)
