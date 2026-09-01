from config import _without_retired_make_urls


def test_settings_drop_make_webhooks_and_make_backends():
    cleaned = _without_retired_make_urls(
        {
            "p3_webhook_url": "https://hook.us2.make.com/abc",
            "public_base_url": "https://pipeline.chicagoshining.com",
            "stage_backend_p2": "make",
            "stage_backend_p3": "python",
        }
    )
    assert cleaned["p3_webhook_url"] == ""
    assert cleaned["public_base_url"] == "https://pipeline.chicagoshining.com"
    assert cleaned["stage_backend_p2"] == "python"
    assert cleaned["stage_backend_p3"] == "python"
