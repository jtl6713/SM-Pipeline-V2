from apc.assets import public_asset_url, r2_object_key, saved_public_url, source_image_url
from apc.common import expected_child_count, publish_caption, reconcile_caption
from apc.eligibility import (
    ap0c_eligibility_reason,
    ap1c_eligibility_reason,
    ap2c_eligibility_reason,
    ap3c_eligibility_reason,
    ap3p_eligibility_reason,
    ap4c_eligibility_reason,
    ap4r_eligibility_reason,
    ap5c_eligibility_reason,
)
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_instagram_carousel_stages_are_registered():
    for name in ("ap0c", "ap1c", "ap2c", "ap3c", "ap3p", "ap4c", "ap4r", "ap5c"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_ap0c_gates():
    ready = _record(
        Platform="Instagram",
        Platform_Output_Type="Instagram Carousel",
        Output_Status="Approved for Publishing",
        Publish_Status="Ready to Publish",
        Publish_Method="Automated",
        Auto_Publish_Enabled=True,
        IG_Carousel_Status="Ready for Asset Prep",
    )
    assert ap0c_eligibility_reason(ready) is None
    assert ap0c_eligibility_reason(_record(Platform="Facebook", Platform_Output_Type="Instagram Carousel", Output_Status="Approved for Publishing", Publish_Status="Ready to Publish", Publish_Method="Automated", Auto_Publish_Enabled=True, IG_Carousel_Status="Ready for Asset Prep")) == "not_instagram"
    assert ap0c_eligibility_reason(_record(**{**ready["fields"], "Do_Not_Publish": True})) == "do_not_publish"
    assert ap0c_eligibility_reason(_record(**{**ready["fields"], "Platform_Post_ID": "123"})) == "already_published"
    retry = _record(**{**ready["fields"], "IG_Carousel_Status": "Retry Pending", "Publish_Retry_Eligible": True})
    assert ap0c_eligibility_reason(retry) is None
    assert ap0c_eligibility_reason(_record(**{**ready["fields"], "IG_Carousel_Status": "Assets Ready"})) == "carousel_not_ready_for_assets"


def test_later_stage_gates():
    assert ap1c_eligibility_reason(_record(IG_Carousel_Status="Assets Ready", Publish_Method="Automated", Auto_Publish_Enabled=True)) is None
    assert ap1c_eligibility_reason(_record(IG_Carousel_Status="Ready for Asset Prep", Publish_Method="Automated", Auto_Publish_Enabled=True)) == "carousel_assets_not_ready"
    assert ap2c_eligibility_reason(_record(IG_Carousel_Status="Children Processing", IG_Carousel_Due_Now=1)) is None
    assert ap2c_eligibility_reason(_record(IG_Carousel_Status="Children Processing", IG_Carousel_Due_Now=0)) == "not_due"
    assert ap3c_eligibility_reason(_record(IG_Carousel_Status="Children Ready", IG_Carousel_All_Children_Ready=1)) is None
    assert ap3c_eligibility_reason(_record(IG_Carousel_Status="Children Ready", IG_Carousel_Parent_Container_ID="1")) == "parent_already_created"
    assert ap3p_eligibility_reason(_record(IG_Carousel_Status="Parent Processing", IG_Carousel_Parent_Container_ID="1")) is None
    assert ap4c_eligibility_reason(_record(IG_Carousel_Status="Parent Ready", IG_Carousel_Parent_Container_ID="1")) is None
    assert ap4c_eligibility_reason(_record(IG_Carousel_Status="Parent Ready", IG_Carousel_Parent_Container_ID="1"), replace_transaction_id="txn") == "replace_address_mismatch"
    assert ap4r_eligibility_reason(_record(IG_Carousel_Status="Publishing", IG_Carousel_Error_Stage="AP4C Parent Publishing")) is None
    assert ap4r_eligibility_reason(_record(IG_Carousel_Status="Publishing", IG_Carousel_Published_Media_ID="1", IG_Carousel_Error_Stage="AP4C Parent Publishing")) == "already_has_published_media"
    assert ap5c_eligibility_reason(_record(IG_Carousel_Status="Publishing", IG_Carousel_Published_Media_ID="1")) is None
    assert ap5c_eligibility_reason(_record(IG_Carousel_Status="Publishing", IG_Carousel_Published_Media_ID="1", Platform_Post_URL="https://instagram.com/p/x/")) == "already_finalized"


def test_asset_and_caption_helpers():
    slide = {"fields": {"Current Image URL": "https://media.chicagoshining.com/lettered/a.jpg", "Current Order": 3}}
    assert source_image_url(slide) == "https://media.chicagoshining.com/lettered/a.jpg"
    assert source_image_url({"fields": {"Asset_4x5_Public_URL": "https://cdn/b.jpg"}}) == "https://cdn/b.jpg"
    assert source_image_url({"fields": {"IG_Public_Asset_URL": "https://cdn/lettered/c.jpg"}}) == "https://cdn/lettered/c.jpg"
    assert source_image_url({"fields": {"IG_Public_Asset_URL": "https://cdn/plain.jpg"}}) == ""
    key = r2_object_key("ig-carousel", 224, slide)
    assert key == "ig-carousel/output-224/slide-03.jpg"
    assert public_asset_url(key) == "https://media.chicagoshining.com/ig-carousel/output-224/slide-03.jpg"
    assert saved_public_url("https://x/lettered/a.jpg", "https://generated") == "https://x/lettered/a.jpg"
    assert saved_public_url("https://x/plain.jpg", "https://generated") == "https://generated"
    assert publish_caption(_record(Output_Caption="Hello", Output_Hashtags="#Chicago")) == "Hello\n\n#Chicago"
    assert publish_caption(_record(Output_Caption="Hello")) == "Hello"
    assert reconcile_caption(_record(Output_Caption="Hello", Output_Hashtags="#Chicago")) == "Hello\n\n#Chicago"
    assert expected_child_count(_record(IG_Carousel_Child_Count=3), 3) == 3
    assert expected_child_count(_record(), 4) == 4
