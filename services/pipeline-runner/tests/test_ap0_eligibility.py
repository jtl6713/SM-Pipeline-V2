from ap0.eligibility import (
    asset_plan,
    eligibility_reason,
    expected_file_name,
    is_eligible,
    public_asset_url,
    r2_object_key,
)
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def _eligible(**overrides):
    fields = {
        "Platform": "Instagram",
        "Review_Status": "Approved",
        "Output_Status": "Approved for Publishing",
        "Publish_Method": "Automated",
        "Auto_Publish_Enabled": True,
        "Do_Not_Publish": False,
        "Publish_Status": "Ready to Publish",
        "Final_File_ID": "driveFile123",
        "Platform_Output_Type": "Instagram Reel",
        "Output_ID": 42,
    }
    fields.update(overrides)
    return _record(**fields)


def test_ap0_is_registered():
    assert "ap0" in STAGE_NAMES
    assert is_implemented("ap0")
    assert is_implemented("publish_tt")


def test_ap0_r2_key_and_public_url():
    record = _eligible()
    assert r2_object_key(record) == "publish/platform-output-42/driveFile123.mp4"
    assert public_asset_url(record) == (
        "https://media.chicagoshining.com/publish/platform-output-42/driveFile123.mp4"
    )
    assert expected_file_name(record) == "platform-output-42-driveFile123.mp4"
    plan = asset_plan(record)
    assert plan["publish_asset_url"].endswith(plan["r2_object_key"])


def test_ap0_new_reel_is_eligible():
    assert is_eligible(_eligible())
    assert eligibility_reason(_eligible()) is None


def test_ap0_revised_filename_is_eligible():
    record = _eligible(
        Publish_Asset_URL="https://media.chicagoshining.com/old.mp4",
        Publish_Asset_File_Name="platform-output-42-oldDrive.mp4",
    )
    assert is_eligible(record)


def test_ap0_already_prepared_is_skipped():
    record = _eligible(
        Publish_Asset_URL="https://media.chicagoshining.com/publish/platform-output-42/driveFile123.mp4",
        Publish_Asset_File_Name="platform-output-42-driveFile123.mp4",
    )
    assert eligibility_reason(record) == "already_prepared"


def test_ap0_youtube_short_and_facebook_reel():
    assert is_eligible(_eligible(Platform="YouTube", Platform_Output_Type="YouTube Short"))
    assert is_eligible(_eligible(Platform="Facebook", Platform_Output_Type="Facebook Reel"))
    assert is_eligible(_eligible(Platform_Output_Type="Instagram Story"))


def test_ap0_tiktok_video_is_eligible():
    assert is_eligible(_eligible(Platform="TikTok", Platform_Output_Type="TikTok Video"))
    assert is_eligible(_eligible(Platform="TikTok", Platform_Output_Type="TikTok Video Draft"))


def test_ap0_finished_master_without_drive_id():
    record = _eligible(
        Final_File_ID="",
        Final_File_URL="https://media.chicagoshining.com/studio/master-assets/recPR1/clip.mp4",
    )
    assert eligibility_reason(record) is None
    assert r2_object_key(record) == "publish/platform-output-42/finished.mp4"


def test_ap0_master_assets_url_is_not_already_prepared():
    record = _eligible(
        Publish_Asset_URL="https://media.chicagoshining.com/studio/master-assets/recPR1/clip.mp4",
        Publish_Asset_File_Name="platform-output-42-driveFile123.mp4",
    )
    assert eligibility_reason(record) is None


def test_ap0_gate_failures():
    assert eligibility_reason(_eligible(Review_Status="Pending")) == "review_not_approved"
    assert eligibility_reason(_eligible(Auto_Publish_Enabled=False)) == "auto_publish_disabled"
    assert eligibility_reason(_eligible(Do_Not_Publish=True)) == "do_not_publish"
    assert eligibility_reason(_eligible(Published_At="2026-08-24T00:00:00.000Z")) == "already_published"
    assert eligibility_reason(_eligible(Final_File_ID="")) == "missing_final_file_id"
    assert eligibility_reason({"id": "", "fields": {}}) == "missing_record_id"
