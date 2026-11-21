"""#2374: a false 'Assets Ready' state must never POST a blank Graph image_url."""

from apc import ap1c


def slide(number, *, ig_url="", ig_status="", child_id="", child_status=""):
    return {
        "id": f"rec{number:014d}",
        "fields": {
            "Current Order": number,
            "Slide Number": number,
            "IG_Public_Asset_URL": ig_url,
            "IG_Public_Asset_Status": ig_status,
            # A valid alternate public source is NOT proof that AP0C staged it.
            "Asset_4x5_Public_URL":
                f"https://media.chicagoshining.com/approved/carousel/{number}.jpg",
            "Asset_4x5_Public_Status": "Ready",
            "IG_Child_Container_ID": child_id,
            "IG_Child_Container_Status": child_status,
        },
    }


def test_unstaged_ap1c_requires_explicit_ig_url_even_if_4x5_public_url_exists():
    reason = ap1c.ap1c_unstaged_asset_reason([slide(1), slide(2)])
    assert "QA-IG-AP1C-UNSTAGED-ASSET" in reason
    assert "do not call Graph" in reason


def test_only_approved_staged_https_instagram_urls_pass():
    ready = [
        slide(1, ig_url="https://media.chicagoshining.com/publish/ig/1.jpg", ig_status="Ready"),
        slide(2, ig_url="https://media.chicagoshining.com/publish/ig/2.jpg", ig_status="Ready"),
    ]
    assert ap1c.ap1c_unstaged_asset_reason(ready) is None
    ready[1]["fields"]["IG_Public_Asset_URL"] = "http://media.chicagoshining.com/2.jpg"
    assert "QA-IG-AP1C-UNSAFE-ASSET-URL" in ap1c.ap1c_unstaged_asset_reason(ready)
    ready[1]["fields"]["IG_Public_Asset_URL"] = "https://media.chicagoshining.com/2.jpg"
    ready[1]["fields"]["IG_Public_Asset_Status"] = "Preparing"
    assert "QA-IG-AP1C-UNSTAGED-ASSET" in ap1c.ap1c_unstaged_asset_reason(ready)


def test_retained_healthy_child_need_not_be_recreated_but_expired_parent_does():
    existing = slide(1, child_id="18123456789012", child_status="FINISHED")
    other = slide(2, ig_url="https://media.chicagoshining.com/ig/2.jpg", ig_status="Ready")
    assert ap1c.ap1c_unstaged_asset_reason([existing, other]) is None
    assert "QA-IG-AP1C-UNSTAGED-ASSET" in ap1c.ap1c_unstaged_asset_reason(
        [existing, other], force_fresh_children=True
    )


def test_duplicate_orders_park_even_when_public_ready_view_is_empty():
    assert ap1c.ap1c_duplicate_slide_order([slide(1), slide(2), slide(1)])
    assert not ap1c.ap1c_duplicate_slide_order([slide(1), slide(2), slide(3)])


def test_ap1c_missing_staged_asset_uses_no_graph_and_parks_retry(monkeypatch):
    output = {
        "id": "recABCDEFGHIJKLMN",
        "fields": {
            "Platform": "Instagram",
            "Platform_Output_Type": "Instagram Carousel",
            "Output_ID": 9400,
            "IG_Carousel_Status": "Assets Ready",
            "IG_Carousel_Child_Count": 2,
            "Image_Count": 2,
            "Publish_Method": "Automated",
            "Auto_Publish_Enabled": True,
            "Do_Not_Publish": False,
            "Publish_Attempt_Count": 1,
            "Publish_Retry_Eligible": True,
        },
    }
    updates = []

    class FakeClient:
        def get_record(self, _table, record_id):
            assert record_id == output["id"]
            return output

        def update_record(self, _table, record_id, fields, typecast=False):
            assert record_id == output["id"]
            updates.append(dict(fields))
            return {"id": record_id, "fields": fields}

    monkeypatch.setattr(ap1c, "AirtableClient", lambda: FakeClient())
    monkeypatch.setattr(ap1c, "list_final_slides", lambda *_a, **_kw: [slide(1), slide(2)])
    monkeypatch.setattr(ap1c, "PipelineSettings", lambda *_a, **_kw: (_ for _ in ()).throw(
        AssertionError("provider config must never be requested")
    ))
    monkeypatch.setattr(ap1c, "InstagramCarouselClient", lambda **_kw: (_ for _ in ()).throw(
        AssertionError("Graph create must never be invoked")
    ))

    response = ap1c.process_request(output_record_id=output["id"])
    assert response["processed"] is True
    assert response["reason"] == "unstaged_public_asset"
    assert response["new_children"] == 0
    assert response["retry_authorized"] is False
    assert len(updates) == 2
    assert updates[-1]["IG_Carousel_Status"] == "Retry Pending"
    assert updates[-1]["Publish_Retry_Eligible"] is False
    assert updates[-1]["Publish_Next_Retry_At"] is None
    assert "QA-IG-AP1C-UNSTAGED-ASSET" in updates[-1]["IG_Carousel_Error_Message"]
