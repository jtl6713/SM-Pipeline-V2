from publish.destinations import destination_value, resolve_publish_theme, theme_from_records


class FakeSettings:
    def __init__(self, values: dict[str, str]) -> None:
        self._values = values

    def get(self, name: str) -> str:
        return self._values.get(name, "")


def test_theme_la_from_profile_name():
    assert theme_from_records({"fields": {"Profile_Name": "LA - Los Angeles"}}) == "la"


def test_theme_chicago_does_not_match_la_word():
    assert theme_from_records({"fields": {"Market_Name": ["Chicago"]}}) == "chicago"


def test_la_tiktok_url_never_falls_back_to_chicago():
    settings = FakeSettings(
        {
            "TIKTOK_WORKER_BASE_URL": "https://auth.chicagoshining.com",
            "LA_TIKTOK_WORKER_BASE_URL": "https://auth-la.chicagoshining.com",
        }
    )
    assert destination_value(settings, "TIKTOK_WORKER_BASE_URL", "la") == (
        "https://auth-la.chicagoshining.com"
    )
    empty = FakeSettings({"TIKTOK_WORKER_BASE_URL": "https://auth.chicagoshining.com"})
    assert destination_value(empty, "TIKTOK_WORKER_BASE_URL", "la") == ""


def test_shared_secret_falls_back_for_la():
    settings = FakeSettings({"TIKTOK_PIPELINE_SECRET": "shared"})
    assert destination_value(settings, "TIKTOK_PIPELINE_SECRET", "la") == "shared"


def test_resolve_theme_from_output_market_lookup():
    output = {"id": "recOut", "fields": {"Market_Name": ["Los Angeles"]}}
    assert resolve_publish_theme(output=output) == "la"
