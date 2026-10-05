from quality_agent.signatures import TIKTOK_DUPLICATE_SLIDES, detect_tiktok_duplicate_slides


def test_detect_tiktok_duplicate_slides_signature():
    result = detect_tiktok_duplicate_slides(
        actual=14,
        expected=7,
        stamped_urls=[f"https://media.chicagoshining.com/{i}.jpg" for i in range(7)],
    )
    assert result is not None
    assert result["id"] == TIKTOK_DUPLICATE_SLIDES
    assert result["duplicate_factor"] == 2
    assert result["auto_repair_safe"] is True


def test_duplicate_signature_requires_authoritative_manifest():
    assert detect_tiktok_duplicate_slides(actual=14, expected=7, stamped_urls=[]) is None
    assert detect_tiktok_duplicate_slides(
        actual=13,
        expected=7,
        stamped_urls=[f"https://media.chicagoshining.com/{i}.jpg" for i in range(7)],
    ) is None
