import os

os.environ["FACEBOOK_AUTO_PUBLISH"] = "1"

from fb.assets import facebook_message, package_revision, photo_needs_create, post_fingerprint, resolved_publish_mode
from fb.graph import public_feed_url
from fb.eligibility import (
    fb0_eligibility_reason,
    fb1_eligibility_reason,
    fb2_eligibility_reason,
    fb2r_eligibility_reason,
    fb3_eligibility_reason,
)
from stages.registry import STAGE_NAMES, is_implemented


def _record(**fields):
    return {"id": "recABCDEFGHIJKLMN", "fields": fields}


def test_facebook_graph_publish_hold():
    os.environ["FACEBOOK_AUTO_PUBLISH"] = "0"
    try:
        ready = _record(Platform="Facebook", Auto_Publish_Enabled=True, Image_Output_Selected=True, FB_Publish_Status="Ready for Assets")
        assert fb0_eligibility_reason(ready) == "facebook_manual_publish"
        assert fb1_eligibility_reason(_record(Platform="Facebook", FB_Publish_Status="Ready for Photo Media")) == (
            "facebook_manual_publish"
        )
    finally:
        os.environ["FACEBOOK_AUTO_PUBLISH"] = "1"


def test_facebook_photo_stages_are_registered():
    for name in ("fb0", "fb1", "fb2", "fb2r", "fb3"):
        assert name in STAGE_NAMES
        assert is_implemented(name)


def test_fb0_gates():
    ready = _record(Platform="Facebook", Auto_Publish_Enabled=True, Image_Output_Selected=True, FB_Publish_Status="Ready for Assets")
    assert fb0_eligibility_reason(ready) is None
    assert fb0_eligibility_reason(_record(Platform="Instagram", Auto_Publish_Enabled=True, Image_Output_Selected=True, FB_Publish_Status="Ready for Assets")) == "not_facebook"
    assert fb0_eligibility_reason(_record(Platform="Facebook", Auto_Publish_Enabled=False, Image_Output_Selected=True, FB_Publish_Status="Ready for Assets")) == "auto_publish_disabled"
    assert fb0_eligibility_reason(_record(Platform="Facebook", Auto_Publish_Enabled=True, Do_Not_Publish=True, Image_Output_Selected=True, FB_Publish_Status="Ready for Assets")) == "do_not_publish"
    assert fb0_eligibility_reason(_record(Platform="Facebook", Auto_Publish_Enabled=True, Image_Output_Selected=True, Platform_Post_ID="123")) == "already_has_platform_post"
    assert fb0_eligibility_reason(
        _record(Platform="Facebook", Auto_Publish_Enabled=True, FB_Publish_Status="Retry Pending", Publish_Error_Stage="FB0_ASSETS")
    ) is None
    assert fb0_eligibility_reason(_record(Platform="Facebook", Auto_Publish_Enabled=True, Image_Output_Selected=True, FB_Publish_Status="Publishing")) == (
        "facebook_not_ready_for_assets"
    )


def test_fb1_and_publish_gates():
    ready = _record(Platform="Facebook", FB_Publish_Status="Ready for Photo Media")
    assert fb1_eligibility_reason(ready) is None
    assert fb1_eligibility_reason(ready, replace_transaction_id="txn") == "replace_address_mismatch"
    assert fb1_eligibility_reason(
        _record(Platform="Facebook", FB_Publish_Status="Retry Pending", Publish_Error_Stage="FB1_PHOTO_CREATE")
    ) is None

    publish = _record(FB_Publish_Status="Photo Media Ready", FB_Photo_Count=2, Image_Count=2)
    assert fb2_eligibility_reason(publish) is None
    assert fb2_eligibility_reason(_record(FB_Publish_Status="Photo Media Ready", FB_Photo_Count=1, Image_Count=2)) == (
        "facebook_photo_media_not_ready"
    )
    assert fb2_eligibility_reason(_record(FB_Publish_Status="Retry Pending", Publish_Error_Stage="FB2_PUBLISH", FB_Photo_Count=1, Image_Count=1)) is None

    reconcile = _record(FB_Publish_Status="Reconcile Pending")
    assert fb2r_eligibility_reason(reconcile) is None
    assert fb2r_eligibility_reason(_record(FB_Publish_Status="Publishing")) == "facebook_not_reconcile_pending"

    finalize = _record(Platform_Post_ID="123_456", FB_Publish_Status="Published Pending Finalize")
    assert fb3_eligibility_reason(finalize) is None
    assert fb3_eligibility_reason(_record(FB_Publish_Status="Published Pending Finalize")) == "missing_platform_post_id"
    assert fb3_eligibility_reason(_record(Platform_Post_ID="123", Publish_Status="Published")) == "already_published"


def test_asset_helpers():
    assert resolved_publish_mode(_record(FB_Resolved_Publish_Mode="Single Photo", Image_Count=4)) == "Single Photo"
    assert resolved_publish_mode(_record(Image_Count=1)) == "Single Photo"
    assert resolved_publish_mode(_record(Image_Count=3)) == "Slideshow Reel"
    assert facebook_message(_record(Output_Caption="Hello", Output_Hashtags="#Chicago")) == "Hello\n\n#Chicago"
    assert facebook_message(_record(Output_Caption="Hello")) == "Hello"
    slides = [
        {"fields": {"Shared_Asset_Revision": "a"}},
        {"fields": {"Asset_4x5_Public_URL": "https://media.example/b.jpg"}},
    ]
    assert len(package_revision(slides)) == 64
    assert post_fingerprint("Hello", ["1", "2"]) == post_fingerprint("Hello", ["1", "2"])
    assert photo_needs_create({"fields": {}}, package_rev="abc") is True
    assert photo_needs_create({"fields": {"FB_Photo_ID": "p", "FB_Photo_Status": "Ready", "FB_Photo_Package_Revision": "abc"}}, package_rev="abc") is False
    assert photo_needs_create({"fields": {"FB_Photo_ID": "p", "FB_Photo_Status": "Ready", "FB_Photo_Package_Revision": "old"}}, package_rev="abc") is True


def test_public_feed_url_prefers_vanity_over_new_pages_profile_id():
    npe = "https://www.facebook.com/122141526753022170/posts/122143898307022170"
    assert public_feed_url(
        page_id="831080826745798",
        page_username="ChicagoShining",
        post_id="831080826745798_122143898307022170",
        permalink_url=npe,
    ) == "https://www.facebook.com/ChicagoShining/posts/122143898307022170"
    assert public_feed_url(
        page_id="831080826745798",
        post_id="831080826745798_122143898307022170",
        permalink_url=npe,
    ) == "https://www.facebook.com/831080826745798/posts/122143898307022170"
