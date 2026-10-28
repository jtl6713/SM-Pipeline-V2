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


def verify_before_reel_creation(client, table, output_id, expected_output, *, require_lock=False):
    """Fresh authority read before an Instagram media *create* (not just publish).

    This is a defense-in-depth preflight, NOT the common enrollment/dispatch
    lease. The pilot must remain disabled until the Worker and runner share an
    irreversible-operation ownership contract. An unsafe or unavailable read
    never grants permission to create a provider container.
    """
    current = client.get_record(table, output_id)
    reason = rendering_review_reason(current)
    if reason:
        return reason
    if current["id"] != output_id or expected_output.get("id") != output_id:
        return "review_output_identity_mismatch"
    fields = current["fields"]
    expected = expected_output.get("fields") or {}
    if fields.get("Do_Not_Publish"):
        return "do_not_publish"
    if any(fields.get(key) for key in (
        "Published_At", "Platform_Post_ID", "Platform_Post_URL", "Platform_Media_ID",
    )):
        return "remote_publication_already_started"
    for key in ("Final_File_ID", "Final_File_URL", "Publish_Asset_URL",
                "Platform", "Platform_Output_Type", "Content_Item"):
        if fields.get(key) != expected.get(key):
            return "publication_artifact_changed"
    if require_lock:
        for key in ("Publish_Locked_By", "Publish_Locked_At", "Publish_Started_At"):
            if not expected.get(key) or fields.get(key) != expected.get(key):
                return "publication_lock_changed"
        if fields.get("Publish_Status") != expected.get("Publish_Status"):
            return "publication_lock_changed"
    elif any(fields.get(key) for key in (
        "Publish_Locked_By", "Publish_Locked_At", "Publish_Started_At",
    )):
        return "publication_lock_already_owned"
    return None
