import calendar
import json
from datetime import date, timedelta


def parse_rec(rec):
    if isinstance(rec, dict):
        return rec
    if rec is None:
        return {}
    try:
        return json.loads(rec)
    except (json.JSONDecodeError, TypeError, ValueError):
        return {'type': rec}


def calc_next_deadline(dl_str, rec):
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

    else:
        return None

    return next_d.isoformat() + time_part
