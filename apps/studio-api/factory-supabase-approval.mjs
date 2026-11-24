/**
 * Factory global approval authority. Supabase is the ONLY output/profile data
 * source in the Supabase write-SoR lane. Never fall back to Airtable here.
 *
 * The durable R2 Factory request/claim ledger owns retries and duplicate fences.
 * This module owns exact Supabase eligibility and compare-and-swap approval.
 * Approval deliberately stops at Ready to Schedule with auto publish disabled.
 */
import {
  supabaseRest, airtableShapedOutputFromSupabase,
} from "./supabase-pipeline-reads.mjs";
import { evaluateReviewPackage, formalFactoryApprovalReady, verifyReviewImages } from "./review-package-readiness.mjs";
import {
  assertSupabaseNativeGalleryPublicationPackage,
  preflightNycOwnerGalleryApproval,
  finalizeNycOwnerGalleryOnFactoryClick,
} from "./native-gallery-package-guard.mjs";
import { STORY_2915_ID, story2915GenerationValid, story2915NewApprovalValid, story2915HeldRecoveryReceiptValid } from "./story-expired-generation-2915.mjs";
import { originalIntentCoversGallery } from "./factory-original-intent.mjs";
import { factoryGlobalAcceptsOutput } from "./factory-batch-global-policy.mjs";
import {
  maeScheduleNextSlot, maeNormalizeTimeZone, maeTimeZoneFromTheme, MAE_SUGGEST_HORIZON_DAYS,
} from "./mae-schedule.mjs";
import { factoryBatchRolloutAcceptsOutput } from "./factory-batch-rollout.mjs";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
// Exact Factory read: avoid downloading multi-MB Remotion props, media manifests
// and analytics for every item in a 20-output approval batch.
const FACTORY_APPROVAL_SELECT = [
  "id", "airtable_record_id", "output_number",
  "content_item_id", "content_item_airtable_id", "content_profile_id",
  "platform", "format", "studio_output_type", "platform_output_type", "aspect_ratio",
  "output_title", "output_status", "review_status", "publish_status", "publish_method", "render_status",
  "do_not_publish", "publish_hold_released_at", "publish_hold_set_at", "publish_hold_reason", "publish_hold_source", "publish_hold_release_actor", "publish_retry_eligible", "test_run_id", "output_caption", "thumbnail_url",
  "studio_preview_url", "final_file_url", "publish_asset_url", "publish_next_retry_at", "selected_clip_count", "selected_assets", "render_clip_list",
  "error_messages", "updated_at", "auto_publish_enabled", "scheduled_post_date",
  "studio_scheduled_at", "youtube_scheduled_publish_at", "published_at", "platform_post_url",
  "platform_publish_response",
].join(",");
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const priorApprovalState = row => ["Approved for Publishing", "Published"].includes(String(row?.output_status || ""))
  || String(row?.review_status || "") === "Approved"
  || String(row?.publish_status || "") === "Published";
// An old approval label alone is not evidence of current completion. Fail
// closed for contradictory/held/unscheduled states, without reapproving or
// changing the existing schedule/provider receipt.
const satisfied = row => {
  if (row?.output_status === "Published" && row.publish_status === "Published")
    return Number.isFinite(Date.parse(String(row.published_at || ""))) && Boolean(row.platform_post_url);
  if (row?.output_status !== "Approved for Publishing" || row.review_status !== "Approved"
      || !["Ready to Schedule", "Ready to Publish", "Publishing"].includes(row.publish_status)
      || row.do_not_publish !== false || row.auto_publish_enabled !== true
      || !Number.isFinite(Date.parse(String(row.scheduled_post_date || "")))) return false;
  const release = Date.parse(String(row.publish_hold_released_at || ""));
  const receipt = row.error_messages?.SM_Factory_Supabase_Approval_Receipt;
  // This receipt records a real prior held review plus a separate owner-directed
  // reconciliation. The DB hold-release trigger stamps physical release after
  // the logical reconciliation timestamp; do not mistake that for stale review.
  if (row.airtable_record_id === STORY_2915_ID && story2915HeldRecoveryReceiptValid(row))
    return Number.isFinite(release) && Math.abs(release-Date.parse(receipt.approved_at))<5000 &&
      Date.parse(receipt.scheduled_for)===Date.parse(row.scheduled_post_date);
  return !Number.isFinite(release) || (Number.isFinite(Date.parse(String(receipt?.approved_at || "")))
    && Date.parse(receipt.approved_at) >= release);
};
const validIds = ids => {
  const unique = [...new Set((ids || []).map(id => String(id || "").trim()))];
  if (!unique.length || unique.length > 20 || unique.some(id => !RECORD_ID.test(id))) {
    throw Error("Factory Supabase exact output IDs required (1–20)");
  }
  return unique;
};
const listFilter = values => "in.(" + [...new Set(values)].map(encodeURIComponent).join(",") + ")";

export async function factorySupabaseApprovalRows(env, ids) {
  const unique = validIds(ids);
  const rows = await supabaseRest(env,
    "platform_outputs?airtable_record_id=" + listFilter(unique) + "&select=" + FACTORY_APPROVAL_SELECT + "&limit=21");
  if (!Array.isArray(rows) || rows.length !== unique.length) {
    throw Error("Factory Supabase output selection missing or ambiguous; no approval accepted");
  }
  const found = new Map();
  for (const row of rows) {
    if (!unique.includes(row?.airtable_record_id) || found.has(row.airtable_record_id)) {
      throw Error("Factory Supabase output identity is ambiguous");
    }
    found.set(row.airtable_record_id, row);
  }

  const contentIds = [...new Set(rows.map(row => row.content_item_id).filter(Boolean))];
  const contents = contentIds.length
    ? await supabaseRest(env,
      "content_items?id=" + listFilter(contentIds) + "&select=id,content_profile_id,airtable_record_id&limit=21")
    : [];
  if (!Array.isArray(contents)) throw Error("Factory Supabase content ownership unavailable");
  const contentMap = new Map(contents.map(row => [row.id, row]));
  const profileUuids = [...new Set(rows.flatMap(row => [
    row.content_profile_id, contentMap.get(row.content_item_id)?.content_profile_id,
  ]).filter(Boolean))];
  if (!profileUuids.length || profileUuids.some(id => !UUID.test(id))) {
    throw Error("Factory Supabase profile ownership unavailable");
  }
  const profiles = await supabaseRest(env,
    "content_profiles?id=" + listFilter(profileUuids) + "&select=id,airtable_record_id,market_name,platform_setup&limit=21");
  if (!Array.isArray(profiles) || profiles.length !== profileUuids.length) {
    throw Error("Factory Supabase profile ownership incomplete");
  }
  const profileMap = new Map(profiles.map(row => [row.id, row.airtable_record_id]));
  const profileZones = new Map(profiles.map(row => [row.id, maeNormalizeTimeZone(
    row.platform_setup?.Timezone || row.platform_setup?.timezone || maeTimeZoneFromTheme(row.market_name),
  )]));
  const result = new Map();
  for (const id of unique) {
    const row = found.get(id);
    const content = contentMap.get(row.content_item_id);
    if (row.content_item_id && !content) throw Error("Factory output Content Item missing from Supabase");
    const direct = row.content_profile_id;
    const linked = content?.content_profile_id;
    if (direct && linked && direct !== linked) {
      throw Error("Factory output and Content Item disagree on profile ownership");
    }
    const profileId = profileMap.get(direct || linked);
    if (!RECORD_ID.test(String(profileId || ""))) {
      throw Error("Factory output profile ownership could not be verified");
    }
    const record = airtableShapedOutputFromSupabase({
      ...row, content_profile_airtable_id: profileId,
      content_item_airtable_id: row.content_item_airtable_id || content?.airtable_record_id || null,
    });
    // The full manifest intentionally lives in a typed JSONB column, not the
    // lean error_messages projection used by Factory desk list reads.
    if (row.selected_assets != null) {
      record.fields.Selected_Assets_JSON = typeof row.selected_assets === "string"
        ? row.selected_assets : JSON.stringify(row.selected_assets);
    }
    result.set(id, { row, record, profileId, profileUuid: direct || linked,
      profileTimeZone: profileZones.get(direct || linked) });
  }
  return result;
}

export function factorySupabaseApprovalDisposition(entry, policy = null, pilotRollout = null) {
  const row = entry?.row;
  const record = entry?.record;
  if (!row || !record || !entry.profileId) return { eligible: false, reason: "Supabase output identity missing" };
  if (pilotRollout && !factoryBatchRolloutAcceptsOutput(pilotRollout, record)) {
    return { eligible: false, reason: "output outside the authorized Factory pilot" };
  }
  if (policy && !factoryGlobalAcceptsOutput(policy, record)) {
    return { eligible: false, reason: "platform/output type is not eligible" };
  }
  // A media-QA hold remains an independent creative veto even if an operator
  // accidentally clears the DNP flag before corrected media is re-reviewed.
  if (row.error_messages?.SM_2618_Creative_QA_Hold?.publishing_permitted === false)
    return { eligible: false, reason: "unresolved creative QA media correction; no approval permitted" };
  if (satisfied(row)) return { eligible: true, already_satisfied: true };
  if (priorApprovalState(row)) return { eligible: false, reason: "Existing approval lacks verified current scheduling or publication evidence; reconcile before retrying" };
  if (row.do_not_publish === true) return { eligible: false, reason: "publishing hold is active" };
  if(row.airtable_record_id===STORY_2915_ID&&!story2915GenerationValid(row))return {eligible:false,reason:"Corrected Story replacement generation not verified"};
  if (row.test_run_id) return { eligible: false, reason: "test output is not eligible for approval" };
  const readiness = evaluateReviewPackage(record);
  if (!formalFactoryApprovalReady(record, readiness)) {
    return { eligible: false, reason: (readiness.missing_requirements || []).join(", ")
      || readiness.reason || "output is no longer ready for approval" };
  }
  return { eligible: true, already_satisfied: false, readiness };
}

export async function factorySupabaseGroupPreflight(env, ids, policy) {
  const unique = validIds(ids);
  const rows = await factorySupabaseApprovalRows(env, unique);
  return Promise.all(unique.map(async id => {
    const entry = rows.get(id);
    const state = factorySupabaseApprovalDisposition(entry, policy);
    const number = entry?.row?.output_number || id;
    if (!state.eligible) {
      throw Error("Output #" + number + ": " + state.reason + ". No new batch was accepted.");
    }
    if (!state.already_satisfied) {
      try {
        // Read-only technical gallery preflight for a new authenticated approval.
        // The actual human decision is recorded only inside the claimed job.
        const review = await preflightNycOwnerGalleryApproval(env, entry.row);
        if (!review?.pending) {
          await assertSupabaseNativeGalleryPublicationPackage(env, entry.row);
        }
      } catch (error) {
        // This exact media-package gate runs BEFORE any R2 approval claim.
        // Its deterministic rejection is not a transient 503: otherwise an
        // unaccepted saved batch re-POSTs the same unrepaired output forever.
        // Preserve the output number and definitive no-acceptance evidence so
        // the browser can quarantine only this one rejected selection member.
        const reason = String(error?.message || error);
        if (/^Native gallery publication blocked: native_gallery_[a-z0-9_]+(?: \(output #\d+\))?$/i.test(reason)) {
          throw Error("Output #" + number + ": " + reason
            + ". No new batch was accepted. Repair native gallery media before approval.");
        }
        throw error; // Network, authentication and unknown errors remain uncertain.
      }
    }
    return {
      id, profile_id: entry.profileId,
      output_id: entry.row.output_number, platform: entry.row.platform,
      format: entry.row.studio_output_type || entry.row.format,
      title: entry.row.output_title || "", content_id: entry.row.content_item_airtable_id || null,
      // Internal current-review evidence, never trusted from browser payloads.
      requires_current_approval: !state.already_satisfied,
    };
  }));
}


/**
 * Factory approval must reserve an actual future MAE slot BEFORE it can commit
 * Approved. Never emit Approved/Ready to Schedule with a null publish date.
 * The Factory batch drain's per-profile R2 claim serializes Factory siblings.
 * All occupancy is read from Supabase; failed/incomplete reads block approval.
 */
async function factorySupabaseNextApprovedSlot(env, entry) {
  const row = entry.row;
  if (!entry.profileUuid || !UUID.test(entry.profileUuid)) {
    throw Error("Cannot approve: source profile identity unavailable for scheduling");
  }
  if (row.publish_method && row.publish_method !== "Automated") {
    throw Error("Cannot approve: output is explicitly configured for manual publishing");
  }
  if (!["Instagram", "Facebook", "YouTube", "TikTok"].includes(String(row.platform || ""))) {
    throw Error("Cannot approve: no supported automated publisher for this platform");
  }
  const now = new Date();
  const zone = maeNormalizeTimeZone(entry.profileTimeZone);
  const until = new Date(now.getTime() + (MAE_SUGGEST_HORIZON_DAYS + 2) * 86400000);
  const occupancy = [];
  const pageSize = 500;
  let complete = false;
  for (let offset = 0; offset < 3000; offset += pageSize) {
    const query = "platform_outputs?content_profile_id=eq." + encodeURIComponent(entry.profileUuid)
      + "&platform=eq." + encodeURIComponent(row.platform)
      + "&scheduled_post_date=gt." + encodeURIComponent(now.toISOString())
      + "&scheduled_post_date=lt." + encodeURIComponent(until.toISOString())
      + "&select=airtable_record_id,scheduled_post_date"
      + "&order=scheduled_post_date.asc&limit=" + pageSize + "&offset=" + offset;
    const existing = await supabaseRest(env, query);
    if (!Array.isArray(existing)) throw Error("Cannot approve: Supabase schedule occupancy unavailable");
    for (const other of existing) {
      if (other.airtable_record_id === row.airtable_record_id) continue;
      const at = Date.parse(String(other.scheduled_post_date || ""));
      if (Number.isFinite(at)) occupancy.push(at);
    }
    if (existing.length < pageSize) { complete = true; break; }
  }
  if (!complete) throw Error("Cannot approve: future scheduling occupancy cannot be verified completely");
  const slot = maeScheduleNextSlot({
    timeZone: zone, now, occupiedMs: occupancy, platformOccupiedMs: occupancy,
    horizonDays: MAE_SUGGEST_HORIZON_DAYS,
  });
  const at = Date.parse(String(slot.iso || ""));
  if (!slot.ok || !Number.isFinite(at) || at <= now.getTime()) {
    throw Error("Cannot approve: no verified future MAE publishing slot is available");
  }
  return { iso: new Date(at).toISOString(), timeZone: zone };
}

export async function factorySupabaseApproveOutput(env, id, profileId, {
  requestId = "", policy = null, pilotRollout = null,
  approvedByUserRecordId = null, submittedAt = null, originalIntentRecovery = false,
  verifyImages = verifyReviewImages, onStage = async () => {},
} = {}) {
  // These exact awaited checkpoints are observational only; the canonical
  // read, hold check, CAS write and readback remain the approval authority.
  await onStage("validating");
  const entries = await factorySupabaseApprovalRows(env, [id]);
  const entry = entries.get(id);
  if (!entry || entry.profileId !== profileId) {
    throw Error("Factory output ownership changed; no approval committed");
  }
  const state = factorySupabaseApprovalDisposition(entry, policy, pilotRollout);
  if (!state.eligible) throw Error("Cannot approve: " + state.reason);
  if (state.already_satisfied) {
    return { id, already_approved: true, message: "Already approved or published in Supabase" };
  }
  if(id===STORY_2915_ID&&(!story2915NewApprovalValid(entry.row,approvedByUserRecordId,submittedAt)||originalIntentRecovery))throw Error("Corrected Story requires a fresh authenticated approval after release");
  // Selected clips and covers never authorize publishing. For the exact
  // owner-released NYC pair only, distinguish verified gallery structure from
  // the final decision made by this NEW authenticated human Approve click.
  const pendingHumanReview = await preflightNycOwnerGalleryApproval(env, entry.row);
  if (originalIntentRecovery && !originalIntentCoversGallery({requestId,approvedByUserRecordId,submittedAt},entry.row,pendingHumanReview)) {
    throw Error("Original Factory intent recovery: media or release revision changed; fresh review required");
  }
  if (!pendingHumanReview?.pending) {
    await assertSupabaseNativeGalleryPublicationPackage(env, entry.row);
  }
  const verified = await verifyImages(state.readiness);
  if (verified?.readiness !== "READY") {
    throw Error("Cannot approve: public review media could not be verified");
  }
  // Slot must be proven BEFORE the single status+schedule CAS; otherwise the
  // Factory historically committed Approved with no future plan and no auto.
  const scheduled = await factorySupabaseNextApprovedSlot(env, entry);
  if (pendingHumanReview?.pending) {
    // Finalization itself re-runs the UNCHANGED persisted-slide publication
    // gate. No extra photo inventory read for unrelated Factory approvals.
    await finalizeNycOwnerGalleryOnFactoryClick(env, entry.row, {
      requestId, approvedByUserRecordId, submittedAt, originalIntentRecovery,
    });
  }
  const stamp = new Date().toISOString();
  const row = entry.row;
  if (!row.updated_at || !UUID.test(row.id)) {
    throw Error("Supabase approval version or immutable identity missing");
  }
  const receipt = {
    request_id: requestId, output_record_id: id,
    output_number: row.output_number, profile_record_id: profileId,
    approved_at: stamp, authority: "supabase", scheduled: true,
    // A saved batch submitter is attribution evidence, NOT proof of a
    // human visually inspecting images; never invent an old approver.
    approval_actor_record_id: /^rec[A-Za-z0-9]{14}$/.test(String(approvedByUserRecordId || ""))
      ? approvedByUserRecordId : null,
    actor_provenance: /^rec[A-Za-z0-9]{14}$/.test(String(approvedByUserRecordId || ""))
      ? "authenticated_factory_submission" : "legacy_batch_actor_not_captured",
    scheduled_for: scheduled.iso, scheduled_timezone: scheduled.timeZone,
    published: false,
  };
  const fields = {
    output_status: "Approved for Publishing",
    review_status: "Approved",
    publish_status: "Ready to Schedule",
    publish_method: "Automated",
    auto_publish_enabled: true,
    scheduled_post_date: scheduled.iso,
    studio_scheduled_at: scheduled.iso,
    youtube_scheduled_publish_at: row.platform === "YouTube" ? scheduled.iso : null,
    updated_at: stamp,
    error_messages: {
      ...(row.error_messages && typeof row.error_messages === "object" && !Array.isArray(row.error_messages)
        ? row.error_messages : {}),
      Review_Decision_At: stamp,
      SM_Factory_Supabase_Approval_Receipt: receipt,
    },
  };
  // Match the full observed review-cycle identity, not merely Output_Status.
  // Conditional zero-row responses are not success and must be reread.
  const valueFilter = (column, value) => column + "="
    + (value == null ? "is.null" : "eq." + encodeURIComponent(String(value)));
  const selector = "platform_outputs?id=eq." + encodeURIComponent(row.id)
    + "&airtable_record_id=eq." + encodeURIComponent(id)
    + "&updated_at=eq." + encodeURIComponent(row.updated_at)
    + "&output_status=eq." + encodeURIComponent("Ready for Review")
    + "&" + valueFilter("review_status", row.review_status)
    + "&" + valueFilter("publish_status", row.publish_status)
    + (row.content_profile_id ? "&content_profile_id=eq." + encodeURIComponent(row.content_profile_id) : "")
    + "&do_not_publish=eq.false"
    + "&" + valueFilter("test_run_id", row.test_run_id);
  await onStage("approving");
  const updated = await supabaseRest(env, selector, {
    method: "PATCH", body: fields, headers: { Prefer: "return=representation" },
  });
  await onStage("verifying");
  if (!Array.isArray(updated) || updated.length !== 1) {
    const fresh = (await factorySupabaseApprovalRows(env, [id])).get(id);
    if (fresh?.profileId === profileId && satisfied(fresh.row)) {
      return { id, already_approved: true, message: "Concurrent Supabase approval already satisfied" };
    }
    throw Error("Output changed during Supabase approval; no approval was committed by this attempt");
  }
  const check = (await factorySupabaseApprovalRows(env, [id])).get(id);
  if (check?.profileId !== profileId
    || check.row.output_status !== "Approved for Publishing"
    || check.row.review_status !== "Approved"
    || check.row.publish_status !== "Ready to Schedule"
    || check.row.publish_method !== "Automated"
    || check.row.auto_publish_enabled !== true
    || Date.parse(String(check.row.scheduled_post_date || "")) !== Date.parse(scheduled.iso)
    || Date.parse(String(check.row.studio_scheduled_at || "")) !== Date.parse(scheduled.iso)
    || check.row.published_at
    || check.row.error_messages?.SM_Factory_Supabase_Approval_Receipt?.request_id !== requestId
    || check.row.error_messages?.SM_Factory_Supabase_Approval_Receipt?.scheduled !== true) {
    throw Error("Supabase approval exact readback could not be verified");
  }
  return {
    id, platform: check.row.platform, format: check.row.studio_output_type || check.row.format,
    scheduled_ms: Date.parse(scheduled.iso),
    message: "Approved in Supabase; Ready to Schedule at " + scheduled.iso + " (" + scheduled.timeZone + ").",
  };
}
