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
import { factoryGlobalAcceptsOutput } from "./factory-batch-global-policy.mjs";

const RECORD_ID = /^rec[A-Za-z0-9]{14}$/;
// Exact Factory read: avoid downloading multi-MB Remotion props, media manifests
// and analytics for every item in a 20-output approval batch.
const FACTORY_APPROVAL_SELECT = [
  "id", "airtable_record_id", "output_number",
  "content_item_id", "content_item_airtable_id", "content_profile_id",
  "platform", "format", "studio_output_type", "platform_output_type",
  "output_title", "output_status", "review_status", "publish_status", "render_status",
  "do_not_publish", "test_run_id", "output_caption", "thumbnail_url",
  "studio_preview_url", "final_file_url", "selected_clip_count", "selected_assets",
  "error_messages", "updated_at", "auto_publish_enabled", "scheduled_post_date",
  "studio_scheduled_at", "youtube_scheduled_publish_at", "published_at", "platform_post_url",
].join(",");
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const satisfied = row => ["Approved for Publishing", "Published"].includes(String(row?.output_status || ""))
  || String(row?.review_status || "") === "Approved"
  || String(row?.publish_status || "") === "Published";
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
    "content_profiles?id=" + listFilter(profileUuids) + "&select=id,airtable_record_id&limit=21");
  if (!Array.isArray(profiles) || profiles.length !== profileUuids.length) {
    throw Error("Factory Supabase profile ownership incomplete");
  }
  const profileMap = new Map(profiles.map(row => [row.id, row.airtable_record_id]));
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
    result.set(id, { row, record, profileId });
  }
  return result;
}

export function factorySupabaseApprovalDisposition(entry, policy = null) {
  const row = entry?.row;
  const record = entry?.record;
  if (!row || !record || !entry.profileId) return { eligible: false, reason: "Supabase output identity missing" };
  if (policy && !factoryGlobalAcceptsOutput(policy, record)) {
    return { eligible: false, reason: "platform/output type is not eligible" };
  }
  if (satisfied(row)) return { eligible: true, already_satisfied: true };
  if (row.do_not_publish === true) return { eligible: false, reason: "publishing hold is active" };
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
  return unique.map(id => {
    const entry = rows.get(id);
    const state = factorySupabaseApprovalDisposition(entry, policy);
    const number = entry?.row?.output_number || id;
    if (!state.eligible) {
      throw Error("Output #" + number + ": " + state.reason + ". No new batch was accepted.");
    }
    return {
      id, profile_id: entry.profileId,
      output_id: entry.row.output_number, platform: entry.row.platform,
      format: entry.row.studio_output_type || entry.row.format,
      title: entry.row.output_title || "", content_id: entry.row.content_item_airtable_id || null,
    };
  });
}

export async function factorySupabaseApproveOutput(env, id, profileId, {
  requestId = "", policy = null, verifyImages = verifyReviewImages,
} = {}) {
  const entries = await factorySupabaseApprovalRows(env, [id]);
  const entry = entries.get(id);
  if (!entry || entry.profileId !== profileId) {
    throw Error("Factory output ownership changed; no approval committed");
  }
  const state = factorySupabaseApprovalDisposition(entry, policy);
  if (!state.eligible) throw Error("Cannot approve: " + state.reason);
  if (state.already_satisfied) {
    return { id, already_approved: true, message: "Already approved or published in Supabase" };
  }
  const verified = await verifyImages(state.readiness);
  if (verified?.readiness !== "READY") {
    throw Error("Cannot approve: public review media could not be verified");
  }
  const stamp = new Date().toISOString();
  const row = entry.row;
  if (!row.updated_at || !UUID.test(row.id)) {
    throw Error("Supabase approval version or immutable identity missing");
  }
  const receipt = {
    request_id: requestId, output_record_id: id,
    output_number: row.output_number, profile_record_id: profileId,
    approved_at: stamp, authority: "supabase", scheduled: false, published: false,
  };
  const fields = {
    output_status: "Approved for Publishing",
    review_status: "Approved",
    publish_status: "Ready to Schedule",
    auto_publish_enabled: false,
    scheduled_post_date: null,
    studio_scheduled_at: null,
    youtube_scheduled_publish_at: null,
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
  const updated = await supabaseRest(env, selector, {
    method: "PATCH", body: fields, headers: { Prefer: "return=representation" },
  });
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
    || check.row.auto_publish_enabled !== false
    || check.row.scheduled_post_date || check.row.published_at
    || check.row.error_messages?.SM_Factory_Supabase_Approval_Receipt?.request_id !== requestId) {
    throw Error("Supabase approval exact readback could not be verified");
  }
  return {
    id, platform: check.row.platform, format: check.row.studio_output_type || check.row.format,
    scheduled_ms: null, message: "Approved in Supabase; Ready to Schedule. No publishing started.",
  };
}
