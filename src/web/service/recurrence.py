'''
繰り返し設定の解析と次の締め切りの計算を行う関数を提供するモジュール
このモジュールでは、繰り返し設定を解析するparse_rec関数と、次の締め切りを計算するcalc_next_deadline関数を提供する。
parse_rec関数は、繰り返し設定を辞書形式で返す。
文字列が渡された場合はJSONとして解析し、失敗した場合は'type'キーの値として文字列を持つ辞書を返す。
calc_next_deadline関数は、締め切りと繰り返し設定から次の締め切りを計算する。
繰り返し設定のタイプに応じて、日次、週次、月次、年次の計算を行う。
calc_next_deadline関数は、締め切りが空の場合や、繰り返し設定の内容が不正な場合はNoneを返す。
'''
import calendar
import json
from datetime import date, timedelta

def parse_rec(rec):
    '''
    繰り返し設定を解析する関数
    recが辞書の場合はそのまま返し、文字列の場合はJSONとして解析して返す。
    解析に失敗した場合は、recを'type'キーの値として持つ辞書を返す。
    '''
    if isinstance(rec, dict):
        return rec
    if rec is None:
        return {}
    try:
        return json.loads(rec)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {'type': rec}


def calc_next_deadline(dl_str, rec):
    '''
    次の締め切りを計算する関数
    dl_strで指定された締め切りとrecで指定された繰り返し設定から、次の締め切りを計算して返す。
    dl_strが空の場合や、recの内容が不正な場合はNoneを返す
    '''
    rec = parse_rec(rec)
    if not dl_str:
        return None

    date_part = dl_str[:10]
    time_part = dl_str[10:]
    d = date.fromisoformat(date_part)
    rec_type = rec.get('type', '')

    if rec_type == 'daily':
        next_d = d + timedelta(days=1)

    elif rec_type == 'weekly':
        days = sorted(rec.get('days', []))
        if not days:
            next_d = d + timedelta(weeks=1)
        else:
            cur_wd = d.weekday()
            nxt = next((day for day in days if day > cur_wd), None)
            if nxt is None:
                next_d = d + timedelta(days=7 - cur_wd + days[0])
            else:
                next_d = d + timedelta(days=nxt - cur_wd)

    elif rec_type == 'monthly':
        dates = sorted(rec.get('dates', []))
        if not dates:
            m, y = d.month + 1, d.year
            if m > 12:
                m, y = 1, y + 1
            next_d = date(y, m, min(d.day, calendar.monthrange(y, m)[1]))
        else:
            nxt_day = next((dt for dt in dates if dt > d.day), None)
            if nxt_day is None:
                m, y = d.month + 1, d.year
                if m > 12:
                    m, y = 1, y + 1
                nxt_day = dates[0]
            else:
                m, y = d.month, d.year
            next_d = date(y, m, min(nxt_day, calendar.monthrange(y, m)[1]))

    elif rec_type == 'yearly':
        y = d.year + 1
        next_d = date(y, d.month, min(d.day, calendar.monthrange(y, d.month)[1]))

    else:
        return None

    return next_d.isoformat() + time_part
