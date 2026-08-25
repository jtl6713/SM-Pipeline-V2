from orch.formulas import APCAR_BRANCHES, APCAR_GUARD, FB_BRANCHES, FB_PRE, TTD_BRANCHES, TTD_GUARD, YT_BRANCHES
from stages.registry import STAGE_NAMES, is_implemented


def test_publish_orch_stages_are_registered():
    for name in ("publish_tt", "publish_yt", "publish_fb", "publish_ig"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_ttd_orch_branches_match_make():
    assert [branch.name for branch in TTD_BRANCHES] == [
        "TTD0",
        "TTD1",
        "TTD2",
        "TTD3",
        "TTD0 Retry",
        "TTD1 Retry",
        "TTD2 Retry",
        "TTD3 Retry",
    ]
    assert TTD_BRANCHES[0].view == "TTD0 — Ready for Draft Asset Preparation"
    assert TTD_GUARD in TTD_BRANCHES[0].formula
    assert 'LEFT({Publish_Error_Stage},4)="TTD0"' in TTD_BRANCHES[4].formula
    assert '{Publish_Error_Stage}="TTD_CAPACITY"' in TTD_BRANCHES[5].formula


def test_yt_orch_branches_match_make():
    assert [branch.stage for branch in YT_BRANCHES] == ["yt0", "ytp1", "yts1", "yts2", "yts3"]
    assert '{YouTube_Stage}="YT1"' in YT_BRANCHES[1].formula
    assert '{YouTube_Processing_Status}="Succeeded"' in YT_BRANCHES[4].formula


def test_fb_orch_branches_match_make():
    assert [branch.name for branch in FB_BRANCHES[:5]] == ["FB0", "FB1", "FB2", "FB2R", "FB3"]
    assert FB_PRE == FB_BRANCHES[0].formula
    assert '{Publish_Retry_Eligible}=1' in FB_BRANCHES[5].formula
    assert FB_BRANCHES[10].stage == "fbs1"
    assert FB_BRANCHES[13].stage == "fbs4"


def test_apcar_orch_branches_match_make():
    assert [branch.stage for branch in APCAR_BRANCHES] == [
        "ap0c",
        "ap1c",
        "ap2c",
        "ap3c",
        "ap3p",
        "ap4c",
        "ap4r",
        "ap5c",
    ]
    assert APCAR_GUARD == APCAR_BRANCHES[0].formula
    assert '{IG_Carousel_Status}!="Published"' in APCAR_GUARD
