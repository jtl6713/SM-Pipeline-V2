from studio_produce.steps import _slide_captions


def test_slide_captions_never_fall_back_to_asset_names():
    labels = _slide_captions(
        [
            {"name": "Pérez Art Museum Miami 9.jpg", "caption": ""},
            {"file_name": "Pérez Art Museum Miami 10.jpg", "caption": None},
            {"asset_name": "Pérez Art Museum Miami 7", "caption": "Photo 3"},
        ],
        title="Miami Rain Plan: Museum Pairings",
    )
    assert labels == []


def test_slide_captions_keep_only_real_semantic_captions():
    labels = _slide_captions(
        [
            {"name": "Pérez Art Museum Miami 9.jpg", "caption": "Pérez Art Museum Miami"},
            {"name": "Frost Science 2.jpg", "caption": "Phillip and Patricia Frost Museum of Science"},
        ],
        title="Miami Rain Plan: Museum Pairings",
    )
    assert labels == ["Pérez Art Museum Miami", "Phillip and Patricia Frost Museum of Science"]


def test_slide_captions_drop_title_leak_and_photo_placeholder():
    labels = _slide_captions(
        [
            {"name": "internal-1.jpg", "caption": "Miami Rain Plan: Museum Pairings"},
            {"name": "internal-2.jpg", "caption": "Photo 2"},
            {"name": "internal-3.jpg", "caption": "Indoor art and waterfront views"},
        ],
        title="Miami Rain Plan: Museum Pairings",
    )
    assert labels == ["Indoor art and waterfront views"]
