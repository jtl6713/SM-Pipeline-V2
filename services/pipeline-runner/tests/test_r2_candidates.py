from r2.candidates import is_eligible_music_candidate, is_eligible_video_candidate


def _row(**fields):
    return {"id": "recVideo001", "fields": fields}


def test_eligible_video_candidate_passes_make_gate():
    row = _row(
        **{
            "Media_Class": "Video",
            "Asset_Role": "Raw Footage",
            "Raw_Source_Eligibility": "Eligible",
            "Classification_Status": "Classified",
            "Asset_Status": "Available",
            "Drive_Access_Status": "Public",
            "Exclusion_Reasons": "",
            "Active": True,
            "Do_Not_Use": False,
            "Google Drive URL": "https://drive.google.com/file/d/abc/view",
            "Rights_Status": "Owned",
        }
    )
    assert is_eligible_video_candidate(row) is True


def test_ineligible_video_candidate_rejects_exclusion_reasons():
    row = _row(
        **{
            "Media_Class": "Video",
            "Asset_Role": "Raw Footage",
            "Raw_Source_Eligibility": "Eligible",
            "Classification_Status": "Classified",
            "Asset_Status": "Available",
            "Drive_Access_Status": "Public",
            "Exclusion_Reasons": "watermark",
            "Active": True,
            "Do_Not_Use": False,
            "Google Drive URL": "https://drive.google.com/file/d/abc/view",
            "Rights_Status": "Owned",
        }
    )
    assert is_eligible_video_candidate(row) is False


def test_eligible_music_candidate_passes_make_gate():
    row = _row(
        **{
            "Media_Class": "Audio",
            "Asset_Role": "Music",
            "Raw_Source_Eligibility": "Not Applicable",
            "Classification_Status": "Classified",
            "Asset_Status": "Available",
            "Drive_Access_Status": "Public",
            "Exclusion_Reasons": "",
            "Active": True,
            "Do_Not_Use": False,
            "Google Drive URL": "https://drive.google.com/file/d/music/view",
            "Rights_Status": "Licensed",
        }
    )
    assert is_eligible_music_candidate(row) is True
