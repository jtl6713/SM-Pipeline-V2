"""Item 4 master handoff resolves Content_Profile via Idea / Content Item."""

from __future__ import annotations

import inspect

from item4 import media_assets, processor


def test_production_profile_falls_back_to_idea_and_content_item():
    source = inspect.getsource(processor._production_profile)
    assert "SOURCE_CANDIDATES_TABLE" in source
    assert "CONTENT_ITEMS_TABLE" in source
    assert "Idea_Candidate" in source
    assert "Promoted_Content_Item" in source
    assert "Content_Profile" in source


def test_ensure_media_asset_backfills_blank_content_profile():
    source = inspect.getsource(media_assets.ensure_media_asset)
    assert 'existing_fields.get("Content_Profile")' in source
    assert 'client.update_record(MEDIA_ASSETS_TABLE, existing["id"], {"Content_Profile": wanted})' in source
