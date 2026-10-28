"""Independent review guard; never infer approval from Do_Not_Publish=False.

This is an initial deny gate, not the shared dispatch lease. Admissions remain
disabled until shared ownership and exact-attempt scheduling are integrated.
"""

REVIEW_MARKERS = (
    "Studio_Render_Review_Hold_Active",
    "Studio_Render_Review_Hold_ID",
    "Studio_Render_Review_Hold_Owner",
    "Studio_Render_Review_Session_ID",
    "Studio_Review_Hold_ID",
    "Studio_Review_Hold_Owner",
)


def rendering_review_reason(record):
    if not isinstance(record, dict) or not record.get("id") or not isinstance(record.get("fields"), dict):
        return "review_output_unavailable"
    if any(record["fields"].get(key) for key in REVIEW_MARKERS):
        return "rendering_review_requires_exact_approval"
    return None


def verify_before_reel_publication(client, table, output_id, expected_output):
    """Fresh authority read immediately before media_publish; failure denies.

    Do not clear holds, reset provider containers, or schedule a retry here.
    Caller must preserve existing media for independent reconciliation.
    """
    current = client.get_record(table, output_id)
    reason = rendering_review_reason(current)
    if not reason and current.get("id") != output_id:
        reason = "review_output_identity_mismatch"
    if not reason and current["fields"].get("Do_Not_Publish"):
        reason = "do_not_publish"
    if not reason:
        for key in ("Final_File_ID", "Final_File_URL", "Publish_Asset_URL", "Platform_Media_ID"):
            if current["fields"].get(key) != expected_output.get("fields", {}).get(key):
                reason = "publication_artifact_changed"
                break
    return reason
