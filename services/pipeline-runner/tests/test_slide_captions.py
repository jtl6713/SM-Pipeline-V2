from studio_produce.steps import _slide_captions


def test_slide_captions_use_photo_names_when_caption_blank():
    labels = _slide_captions(
        [
            {"name": "Roosevelt Island Tram 1.jpg", "caption": ""},
            {"name": "Roosevelt_Island_Tram_5.jpg", "caption": ""},
            {"name": "Roosevelt Island Tram 3", "caption": None},
        ],
        title="Roosevelt Island Tram Plan",
    )
    assert labels == [
        "Roosevelt Island Tram 1",
        "Roosevelt Island Tram 5",
        "Roosevelt Island Tram 3",
    ]


def test_slide_captions_prefer_real_caption_over_filename():
    labels = _slide_captions(
        [
            {"name": "Roosevelt Island Tram 1.jpg", "caption": "Queensboro Bridge View"},
            {"name": "Roosevelt Island Tram 5.jpg", "caption": ""},
        ],
        title="Roosevelt Island Tram Plan",
    )
    assert labels[0] == "Queensboro Bridge View"
    assert labels[1] == "Roosevelt Island Tram 5"


def test_slide_captions_skip_title_leaked_as_first_caption():
    labels = _slide_captions(
        [
            {"name": "Roosevelt Island Tram 1", "caption": "Roosevelt Island Tram Plan"},
            {"name": "Roosevelt Island Tram 5", "caption": ""},
            {"name": "Roosevelt Island Tram 3", "caption": "Photo 3"},
        ],
        title="Roosevelt Island Tram Plan",
    )
    assert labels == [
        "Roosevelt Island Tram 1",
        "Roosevelt Island Tram 5",
        "Roosevelt Island Tram 3",
    ]


def test_slide_captions_only_use_photo_n_when_name_missing():
    labels = _slide_captions([{"caption": ""}, {"name": "", "caption": ""}], title="Any Title")
    assert labels == ["Photo 1", "Photo 2"]
