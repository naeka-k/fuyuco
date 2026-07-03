from web.service.recurrence import calc_next_deadline, parse_rec


class TestParseRec:
    def test_dict_passthrough(self):
        d = {"type": "daily"}
        assert parse_rec(d) is d

    def test_json_string(self):
        assert parse_rec('{"type": "weekly", "days": [1]}') == {"type": "weekly", "days": [1]}

    def test_bare_string_fallback(self):
        assert parse_rec("daily") == {"type": "daily"}

    def test_none_returns_empty_dict(self):
        assert parse_rec(None) == {}

    def test_invalid_json_fallback(self):
        assert parse_rec("{bad}") == {"type": "{bad}"}


class TestCalcNextDeadlineEdgeCases:
    def test_empty_deadline_returns_none(self):
        assert calc_next_deadline("", {"type": "daily"}) is None

    def test_none_deadline_returns_none(self):
        assert calc_next_deadline(None, {"type": "daily"}) is None

    def test_unknown_type_returns_none(self):
        assert calc_next_deadline("2023-01-01", {"type": "unknown"}) is None


class TestCalcNextDeadlineDaily:
    def test_increments_by_one_day(self):
        assert calc_next_deadline("2023-01-01T00:00:00", {"type": "daily"}) == "2023-01-02T00:00:00"

    def test_preserves_time_part(self):
        assert calc_next_deadline("2023-03-15T14:30:00", {"type": "daily"}) == "2023-03-16T14:30:00"

    def test_crosses_month_boundary(self):
        assert calc_next_deadline("2023-01-31T00:00:00", {"type": "daily"}) == "2023-02-01T00:00:00"

    def test_crosses_year_boundary(self):
        assert calc_next_deadline("2023-12-31T00:00:00", {"type": "daily"}) == "2024-01-01T00:00:00"


class TestCalcNextDeadlineWeekly:
    def test_no_days_adds_seven_days(self):
        assert calc_next_deadline("2023-01-02T00:00:00", {"type": "weekly", "days": []}) == "2023-01-09T00:00:00"

    def test_picks_next_day_in_same_week(self):
        # 2023-01-02 is Monday (weekday=0); next in [0,2] after 0 is Wed(2)
        assert calc_next_deadline("2023-01-02T09:00:00", {"type": "weekly", "days": [0, 2]}) == "2023-01-04T09:00:00"

    def test_wraps_to_first_day_of_next_week(self):
        # 2023-01-06 is Friday (weekday=4); no day >4 in [0,2], wraps to next Mon
        assert calc_next_deadline("2023-01-06T00:00:00", {"type": "weekly", "days": [0, 2]}) == "2023-01-09T00:00:00"

    def test_preserves_time_part(self):
        result = calc_next_deadline("2023-01-02T15:30:00", {"type": "weekly", "days": [4]})
        assert result.endswith("T15:30:00")


class TestCalcNextDeadlineMonthly:
    def test_no_dates_same_day_next_month(self):
        assert calc_next_deadline("2023-01-15T00:00:00", {"type": "monthly", "dates": []}) == "2023-02-15T00:00:00"

    def test_picks_next_date_in_same_month(self):
        # day 15, next date >15 in [10,20] is 20
        assert calc_next_deadline("2023-01-15T00:00:00", {"type": "monthly", "dates": [10, 20]}) == "2023-01-20T00:00:00"

    def test_wraps_to_first_date_of_next_month(self):
        # day 25, no date >25 in [10,20], wraps to Feb 10
        assert calc_next_deadline("2023-01-25T00:00:00", {"type": "monthly", "dates": [10, 20]}) == "2023-02-10T00:00:00"

    def test_clamps_to_last_day_of_short_month(self):
        # day 31 doesn't exist in Feb 2023
        assert calc_next_deadline("2023-01-31T00:00:00", {"type": "monthly", "dates": []}) == "2023-02-28T00:00:00"

    def test_crosses_year_boundary(self):
        assert calc_next_deadline("2023-12-15T00:00:00", {"type": "monthly", "dates": []}) == "2024-01-15T00:00:00"
