/**
 * Issue #2593: read committed Supabase FKs before declaring I3/I4 promotion.
 * A fanout receipt ("already" or a counted POST) is not proof that Platform
 * Output rows and typed ownership links survived the database write.
 * This module never writes, approves, schedules, or publishes anything.
 */
import {
  studioSupabaseConfigured,
  studioPhase6WriteSource,
  supabaseRest,
} from "./supabase-pipeline-reads.mjs";

const validRecord = (id) => /^rec[A-Za-z0-9]{14}$/.test(String(id || ""));
const sig = (platform, type) => `${String(platform || "").trim()}::${String(type || "").trim()}`;

export function verifyPromotionReadback({ request, content, plans, outputs, expected }) {
  if (!request?.id || !content?.id) return { ok: false, reason: "parent_or_request_missing" };
  if (content.production_request_id && content.production_request_id !== request.id)
    return { ok: false, reason: "parent_owner_mismatch" };
  if (request.promoted_content_item_id && request.promoted_content_item_id !== content.id)
    return { ok: false, reason: "promoted_parent_mismatch" };
  if (!Number.isInteger(expected) || expected < 1 || expected > 100)
    return { ok: false, reason: "invalid_expected_count" };
  if (!Array.isArray(plans) || plans.length !== expected)
    return { ok: false, reason: "enabled_plan_count_mismatch" };
  if (!Array.isArray(outputs) || outputs.length !== expected)
    return { ok: false, reason: "committed_output_count_mismatch" };

  const byId = new Map(outputs.map(row => [row?.id, row]));
  const linkedIds = new Set();
  if (byId.size !== outputs.length || byId.has(null) || byId.has(undefined))
    return { ok: false, reason: "duplicate_or_invalid_output_identity" };
  for (const plan of plans) {
    if (plan?.enabled !== true || plan.production_request_id !== request.id)
      return { ok: false, reason: "plan_request_owner_mismatch" };
    if (plan.content_item_id !== content.id || !plan.platform_output_id)
      return { ok: false, reason: "committed_plan_fk_missing" };
    const output = byId.get(plan.platform_output_id);
    if (!output || linkedIds.has(plan.platform_output_id))
      return { ok: false, reason: "missing_or_duplicate_output_link" };
    if (output.content_item_id !== content.id ||
        output.platform !== plan.platform ||
        sig(output.platform, output.studio_output_type) !== sig(plan.platform, plan.output_type) ||
        (content.content_profile_id && output.content_profile_id !== content.content_profile_id))
      return { ok: false, reason: "platform_type_or_profile_mismatch" };
    linkedIds.add(plan.platform_output_id);
  }
  if (linkedIds.size !== outputs.length)
    return { ok: false, reason: "unowned_extra_output" };
  return { ok: true, enabled: expected, committed: outputs.length, linked: linkedIds.size };
}

export async function readCommittedPromotionFanout(env, requestRecordId, contentRecordId, expected) {
  if (!validRecord(requestRecordId) || !validRecord(contentRecordId))
    return { ok: false, reason: "invalid_legacy_owner_identity" };
  if (!studioSupabaseConfigured(env) || studioPhase6WriteSource(env) !== "supabase")
    return { ok: false, reason: "canonical_source_unavailable" };
  const [requests, contents] = await Promise.all([
    supabaseRest(env, `production_requests?airtable_record_id=eq.${encodeURIComponent(requestRecordId)}&select=id,airtable_record_id,promoted_content_item_id&limit=2`),
    supabaseRest(env, `content_items?airtable_record_id=eq.${encodeURIComponent(contentRecordId)}&select=id,airtable_record_id,production_request_id,content_profile_id&limit=2`),
  ]);
  if (!Array.isArray(requests) || requests.length !== 1 ||
      !Array.isArray(contents) || contents.length !== 1)
    return { ok: false, reason: "canonical_request_or_parent_not_unique" };
  const request = requests[0], content = contents[0];
  if (content.production_request_id && content.production_request_id !== request.id)
    return { ok: false, reason: "parent_owner_mismatch" };
  const cap = Math.max(1, Math.min(100, Number(expected) || 1)) + 1;
  const [plans, outputs] = await Promise.all([
    supabaseRest(env, `production_request_outputs?production_request_id=eq.${encodeURIComponent(request.id)}&enabled=eq.true&select=id,enabled,production_request_id,content_item_id,platform_output_id,platform,output_type&limit=${cap}`),
    supabaseRest(env, `platform_outputs?content_item_id=eq.${encodeURIComponent(content.id)}&select=id,content_item_id,content_profile_id,platform,studio_output_type&limit=${cap}`),
  ]);
  return verifyPromotionReadback({ request, content, plans, outputs, expected });
}
