/**
 * Human review of completed publishing-held outputs.
 * Supabase-only authoritative write; never lifts Do_Not_Publish or schedules.
 * Safety incident holds remain intact. Exact CAS prevents stale decisions.
 */
import { supabaseRest } from "./supabase-pipeline-reads.mjs";
import { factorySupabaseApprovalRows } from "./factory-supabase-approval.mjs";
import { evaluateReviewPackage, verifyReviewImages } from "./review-package-readiness.mjs";
import { assertSupabaseNativeGalleryPublicationPackage } from "./native-gallery-package-guard.mjs";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
const livePublish = /^(scheduled|publishing|published|uploading|platform processing|draft delivered)$/i;
const valueFilter = (field, value) => field + "=" +
  (value == null ? "is.null" : "eq." + encodeURIComponent(String(value)));

export function heldReviewEligibility(row) {
  if (!row || !RECORD_ID.test(String(row.airtable_record_id || ""))) return "Exact output identity unavailable";
  if (row.do_not_publish !== true) return "Output is not publication-held";
  if (row.test_run_id) return "Test output is not eligible";
  if (row.output_status !== "Ready for Review") return "Output is no longer awaiting review";
  if (!["", "Review Sent", "Pending Review", "Pending"].includes(String(row.review_status || "")))
    return "A review decision has already been recorded";
  if (!["Rendered", "Native Photo Route"].includes(String(row.render_status || "")))
    return "Review media has not finished rendering";
  const incidentReviewOnly = Boolean(row.error_messages?.Factory_Review_Handoff_Safety_Hold_At);
  if (row.error_messages?.SM_Factory_Held_Review_Receipt)
    return "A held creative review decision has already been recorded";
  // A detected preapproval publisher attempt must never be reset here.
  // It can receive a separate creative decision without altering publish state.
  if (!incidentReviewOnly && (livePublish.test(String(row.publish_status || "")) ||

      row.published_at || row.platform_post_url ||
      row.error_messages?.Publish_Started_At))
    return "Publication already started; verify the external receipt";
  if (incidentReviewOnly && (row.published_at || row.platform_post_url ||
      row.platform_publish_response))
    return "Provider evidence exists; verify external publication before creative decision";
  if (row.auto_publish_enabled === true || row.scheduled_post_date ||
      row.studio_scheduled_at || row.youtube_scheduled_publish_at)
    return "Existing scheduling or automatic publishing must be safely disarmed before review";
  if (!incidentReviewOnly && !["", "Not Ready"].includes(String(row.publish_status || "")))
    return "Publisher state must be reconciled before review";
  return null;
}

export async function factoryHeldReviewDecision(env, id, actor, decision, note = "", {
  verifyImages = verifyReviewImages,
} = {}) {
  if (!RECORD_ID.test(String(id || "")) || !["approve", "reject"].includes(decision))
    throw Error("Invalid exact held-review request");
  const entry = (await factorySupabaseApprovalRows(env, [id])).get(id);
  const row = entry?.row;
  const blocker = heldReviewEligibility(row);
  if (blocker) throw Error("Held review blocked: " + blocker);
  if (decision === "reject" && !String(note || "").trim()) throw Error("Rejection requires a reason");
  if (decision === "approve") {
    // Creative-only approval is still a real Factory acceptance. Never accept
    // a multi-image package whose exact canonical slides are absent, unlinked,
    // out of order, or not finally reviewed. Publishing hold is unchanged.
    await assertSupabaseNativeGalleryPublicationPackage(env, row);
    const ready = evaluateReviewPackage(entry.record);
    if (ready.readiness !== "READY") throw Error("Review media incomplete: " +
      ((ready.missing_requirements || []).join(", ") || ready.reason));
    const verified = await verifyImages(ready);
    if (verified?.readiness !== "READY")
      throw Error("Review media verification failed; no approval was committed");
  }
  const stamp = new Date().toISOString();
  const receipt = {
    decision, actor: String(actor || "Factory operator").slice(0, 140),
    note: String(note || "").slice(0, 3000), at: stamp,
    publishing_authorized: false, publishing_hold_preserved: true,
    incident_creative_only: Boolean(row.error_messages?.Factory_Review_Handoff_Safety_Hold_At),
    publish_state_at_decision: row.publish_status || null,
  };
  const incidentReviewOnly = Boolean(row.error_messages?.Factory_Review_Handoff_Safety_Hold_At);
  const fields = {
    ...(incidentReviewOnly ? {} : {
      output_status: decision === "approve" ? "Approved for Publishing" : "Changes Requested",
      review_status: decision === "approve" ? "Approved" : "Changes Requested",
      publish_status: "Not Ready",
    }),
    do_not_publish: true, auto_publish_enabled: false,
    updated_at: stamp,
    error_messages: {
      ...(row.error_messages && !Array.isArray(row.error_messages) ? row.error_messages : {}),
      SM_Factory_Held_Review_Receipt: receipt,
    },
  };
  const selector = "platform_outputs?id=eq." + encodeURIComponent(row.id)
    + "&airtable_record_id=eq." + encodeURIComponent(id)
    + "&updated_at=eq." + encodeURIComponent(row.updated_at)
    + "&output_status=eq." + encodeURIComponent("Ready for Review")
    + "&" + valueFilter("review_status", row.review_status)
    + "&" + valueFilter("publish_status", row.publish_status)
    + "&do_not_publish=eq.true"
    + "&auto_publish_enabled=" + (row.auto_publish_enabled == null ? "is.null" : "eq.false")
    + "&scheduled_post_date=is.null&published_at=is.null";
  const updated = await supabaseRest(env, selector, {
    method: "PATCH", body: fields, headers: { Prefer: "return=representation" },
  });
  if (!Array.isArray(updated) || updated.length !== 1)
    throw Error("Held review changed concurrently; refresh Factory before deciding");
  const check = (await factorySupabaseApprovalRows(env, [id])).get(id)?.row;
  if (!check || check.do_not_publish !== true || check.auto_publish_enabled !== false ||
      (incidentReviewOnly ? (
        check.publish_status !== row.publish_status ||
        check.output_status !== row.output_status ||
        check.review_status !== row.review_status
      ) : (
        check.publish_status !== "Not Ready" ||
        check.output_status !== fields.output_status ||
        check.review_status !== fields.review_status
      )) || check.published_at ||
      check.error_messages?.SM_Factory_Held_Review_Receipt?.at !== stamp)
    throw Error("Held review readback failed; publication lock must be inspected");
  return {
    id, held_review_decision: decision, publishing_authorized: false,
    publishing_hold_preserved: true, incident_creative_only: incidentReviewOnly,
    scheduled: false, published: false,
    message: decision === "approve"
      ? (incidentReviewOnly
        ? "Creative review recorded. Publisher incident is unresolved; publication status and safety hold were preserved."
        : "Creative approved. Publishing remains blocked pending separate authorized release.")
      : (incidentReviewOnly
        ? "Creative changes requested. Publisher incident is unresolved; publication status and safety hold were preserved."
        : "Changes requested. Publishing remains blocked."),
  };
}
