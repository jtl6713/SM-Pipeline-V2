"""Profile-scoped music selection and rotation for R2/T1.

The Studio Content Profile owns an Autonomous_Music_Pool of approved Media Assets.
Normal Studio production must choose from that pool when it is populated, then rotate
away from recently used tracks while keeping sibling platform outputs for the same
Content Item on one consistent track.
"""

from __future__ import annotations

from typing import Any

from airtable.constants import CONTENT_PROFILES_TABLE, PLATFORM_OUTPUTS_TABLE

RECENT_OUTPUT_SCAN_LIMIT = 300
RECENT_TRACK_AVOID_LIMIT = 4
MIN_ROTATION_REMAINDER = 2


def _fields(record: dict[str, Any] | None) -> dict[str, Any]:
    return (record or {}).get("fields") or {}


def _field(record: dict[str, Any] | None, name: str) -> Any:
    return _fields(record).get(name)


def linked_record_ids(value: Any) -> list[str]:
    """Return Airtable linked record IDs from REST or rich connector-shaped values."""
    ids: list[str] = []
    if isinstance(value, str):
        if value.startswith("rec"):
            ids.append(value)
        return ids
    if isinstance(value, list):
        for item in value:
            ids.extend(linked_record_ids(item))
        return list(dict.fromkeys(ids))
    if isinstance(value, dict):
        direct = value.get("id")
        if isinstance(direct, str) and direct.startswith("rec"):
            ids.append(direct)
        for key in ("linkedRecordIds", "recordIds"):
            rows = value.get(key)
            if isinstance(rows, list):
                for item in rows:
                    if isinstance(item, str) and item.startswith("rec"):
                        ids.append(item)
        for key in ("valuesByLinkedRecordId", "value", "values"):
            nested = value.get(key)
            if isinstance(nested, dict):
                for record_id, child in nested.items():
                    if isinstance(record_id, str) and record_id.startswith("rec"):
                        ids.append(record_id)
                    ids.extend(linked_record_ids(child))
            elif nested is not None:
                ids.extend(linked_record_ids(nested))
    return list(dict.fromkeys(ids))


def _lookup_text_values(value: Any) -> list[str]:
    values: list[str] = []
    if value is None:
        return values
    if isinstance(value, str):
        text = value.strip()
        if text:
            values.append(text)
        return values
    if isinstance(value, (int, float, bool)):
        return [str(value)]
    if isinstance(value, list):
        for item in value:
            values.extend(_lookup_text_values(item))
        return values
    if isinstance(value, dict):
        name = value.get("name")
        if isinstance(name, str) and name.strip():
            values.append(name.strip())
        for key in ("value", "values", "valuesByLinkedRecordId"):
            nested = value.get(key)
            if isinstance(nested, dict):
                for child in nested.values():
                    values.extend(_lookup_text_values(child))
            elif nested is not None:
                values.extend(_lookup_text_values(nested))
    return list(dict.fromkeys(values))


def content_profile(client, content_item: dict[str, Any] | None) -> dict[str, Any] | None:
    profile_ids = linked_record_ids(_field(content_item, "Content_Profile"))
    if not profile_ids:
        return None
    return client.get_record(CONTENT_PROFILES_TABLE, profile_ids[0])


def profile_music_pool_ids(profile: dict[str, Any] | None) -> list[str]:
    return linked_record_ids(_field(profile, "Autonomous_Music_Pool"))


def scope_music_candidates_to_profile(
    client,
    *,
    content_item: dict[str, Any] | None,
    music_candidates: list[dict[str, Any]],
    preferred_media_asset_id: str = "",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Restrict music to the active profile pool when configured.

    A complete owner preferred-music choice remains authoritative. If its media asset
    is already in the eligible global candidate set, preserve it even when it is
    outside the profile pool.
    """
    rows = list(music_candidates or [])
    profile = content_profile(client, content_item)
    if not profile:
        return rows, {
            "profile_id": "",
            "profile_name": "",
            "profile_pool_configured": False,
            "profile_pool_count": 0,
            "profile_pool_eligible_count": len(rows),
        }

    profile_id = str(profile.get("id") or "")
    profile_name = str(_field(profile, "Profile_Name") or _field(profile, "Market_Name") or "").strip()
    pool_ids = profile_music_pool_ids(profile)
    if not pool_ids:
        return rows, {
            "profile_id": profile_id,
            "profile_name": profile_name,
            "profile_pool_configured": False,
            "profile_pool_count": 0,
            "profile_pool_eligible_count": len(rows),
        }

    by_id = {str(row.get("id") or ""): row for row in rows if row.get("id")}
    scoped = [by_id[asset_id] for asset_id in pool_ids if asset_id in by_id]
    preferred = str(preferred_media_asset_id or "").strip()
    if preferred and preferred in by_id and preferred not in {str(row.get("id") or "") for row in scoped}:
        scoped.insert(0, by_id[preferred])

    return scoped, {
        "profile_id": profile_id,
        "profile_name": profile_name,
        "profile_pool_configured": True,
        "profile_pool_count": len(pool_ids),
        "profile_pool_eligible_count": len(scoped),
        "profile_pool_ids": pool_ids,
    }


def _same_content_item(row: dict[str, Any], content_item_id: str) -> bool:
    if not content_item_id:
        return False
    return content_item_id in linked_record_ids(_field(row, "Content_Item"))


def _same_profile(row: dict[str, Any], profile_name: str) -> bool:
    if not profile_name:
        return False
    target = profile_name.casefold()
    return any(value.casefold() == target for value in _lookup_text_values(_field(row, "Content_Profile")))


def rotate_profile_music_candidates(
    client,
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    music_candidates: list[dict[str, Any]],
    profile_context: dict[str, Any] | None = None,
    preferred_media_asset_id: str = "",
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Apply same-content consistency plus least-recently-used profile rotation."""
    rows = list(music_candidates or [])
    context = dict(profile_context or {})
    if len(rows) <= 1:
        context.update({
            "rotation_candidate_count": len(rows),
            "rotation_avoided_ids": [],
            "rotation_recent_ids": [],
            "rotation_sibling_music_id": "",
        })
        return rows, context

    preferred = str(preferred_media_asset_id or "").strip()
    profile_name = str(context.get("profile_name") or "").strip()
    content_item_id = str((content_item or {}).get("id") or "")
    output_record_id = str(output.get("id") or "")
    candidate_ids = {str(row.get("id") or "") for row in rows if row.get("id")}

    recent_outputs = client.list_records(
        PLATFORM_OUTPUTS_TABLE,
        max_records=RECENT_OUTPUT_SCAN_LIMIT,
        fields=[
            "Output_ID",
            "Content_Item",
            "Content_Profile",
            "Selected_Music_Media_Asset_ID",
        ],
        sort_field="Output_ID",
        sort_direction="desc",
    )

    sibling_music_id = ""
    recent_ids: list[str] = []
    for prior in recent_outputs:
        if str(prior.get("id") or "") == output_record_id:
            continue
        selected_id = str(_field(prior, "Selected_Music_Media_Asset_ID") or "").strip()
        if not selected_id or selected_id not in candidate_ids:
            continue
        if not preferred and _same_content_item(prior, content_item_id):
            sibling_music_id = selected_id
            break

    if sibling_music_id:
        sibling = next((row for row in rows if str(row.get("id") or "") == sibling_music_id), None)
        if sibling:
            context.update({
                "rotation_candidate_count": 1,
                "rotation_avoided_ids": [],
                "rotation_recent_ids": [],
                "rotation_sibling_music_id": sibling_music_id,
                "rotation_mode": "reuse_sibling_content_track",
            })
            return [sibling], context

    for prior in recent_outputs:
        if str(prior.get("id") or "") == output_record_id:
            continue
        if not _same_profile(prior, profile_name):
            continue
        selected_id = str(_field(prior, "Selected_Music_Media_Asset_ID") or "").strip()
        if selected_id and selected_id in candidate_ids and selected_id not in recent_ids:
            recent_ids.append(selected_id)

    if preferred:
        context.update({
            "rotation_candidate_count": len(rows),
            "rotation_avoided_ids": [],
            "rotation_recent_ids": recent_ids,
            "rotation_sibling_music_id": "",
            "rotation_mode": "owner_preferred_music",
        })
        return rows, context

    avoid_count = min(
        RECENT_TRACK_AVOID_LIMIT,
        max(0, len(rows) - MIN_ROTATION_REMAINDER),
    )
    avoided_ids = [asset_id for asset_id in recent_ids[:avoid_count] if asset_id in candidate_ids]
    avoided = set(avoided_ids)
    filtered = [row for row in rows if str(row.get("id") or "") not in avoided]
    if not filtered:
        filtered = rows
        avoided_ids = []

    recent_rank = {asset_id: index for index, asset_id in enumerate(recent_ids)}
    original_rank = {str(row.get("id") or ""): index for index, row in enumerate(rows)}

    def sort_key(row: dict[str, Any]) -> tuple[int, int, int]:
        asset_id = str(row.get("id") or "")
        if asset_id not in recent_rank:
            return (0, 0, original_rank.get(asset_id, 9999))
        # Larger recent-rank index means older use, so prefer it first.
        return (1, -recent_rank[asset_id], original_rank.get(asset_id, 9999))

    filtered.sort(key=sort_key)
    context.update({
        "rotation_candidate_count": len(filtered),
        "rotation_avoided_ids": avoided_ids,
        "rotation_recent_ids": recent_ids,
        "rotation_sibling_music_id": "",
        "rotation_mode": "profile_lru",
    })
    return filtered, context
