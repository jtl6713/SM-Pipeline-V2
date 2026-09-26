from orch.constants import IGPUB_PROMOTE_NOTE
from orch.formulas import (
    APCAR_BRANCHES,
    APCAR_GUARD,
    FB_BRANCHES,
    FB_PRE,
    IGPUB_AP0_FORMULA,
    IGPUB_AP1_FORMULA,
    IGPUB_BRANCHES,
    IGPUB_DUE_FORMULA,
    IGPUB_IGS_FORMULA,
    IGPUB_POLL_FORMULA,
    TTD_BRANCHES,
    TTD_GUARD,
    YT_BRANCHES,
)
from stages.registry import STAGE_NAMES, is_implemented


def test_publish_orch_stages_are_registered():
    for name in ("publish_tt", "publish_yt", "publish_fb", "publish_ig", "publish_igrs"):
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


def test_ig_pub_orch_branches_match_make():
    assert [branch.name for branch in IGPUB_BRANCHES] == [
        "Due promote",
        "AP0",
        "AP1-IG",
        "AP1-IGS",
        "AP1-IGS-POLL",
    ]
    assert [branch.stage for branch in IGPUB_BRANCHES] == [
        "promote",
        "ap0",
        "ap1_ig",
        "ap1_igs",
        "ap1_igs_poll",
    ]
    assert IGPUB_BRANCHES[0].action == "promote"
    assert IGPUB_BRANCHES[0].view is None
    assert IGPUB_BRANCHES[1].view == "AP0 - Ready to Prepare Publish Asset"
    assert IGPUB_BRANCHES[0].formula == IGPUB_DUE_FORMULA
    assert IGPUB_BRANCHES[1].formula == IGPUB_AP0_FORMULA
    assert IGPUB_BRANCHES[2].formula == IGPUB_AP1_FORMULA
    assert IGPUB_BRANCHES[3].formula == IGPUB_IGS_FORMULA
    assert IGPUB_BRANCHES[4].formula == IGPUB_POLL_FORMULA
    assert '{Publish_Status}="Ready to Schedule"' in IGPUB_DUE_FORMULA
    assert '{Platform_Output_Type}="Instagram Reel"' in IGPUB_AP1_FORMULA
    assert '{Platform_Media_ID}!=""' in IGPUB_AP1_FORMULA
    assert '{Publish_Status}="Publishing"' in IGPUB_AP1_FORMULA
    assert '{IG_Story_Status}="Publishing"' in IGPUB_POLL_FORMULA
    assert "Ready to Publish because its schedule is due" in IGPUB_PROMOTE_NOTE
