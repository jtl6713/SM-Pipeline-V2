/**
 * #2618 — Supabase-only recovery for legacy R3 render metadata projected into
 * the JSON bag but never into typed R4 selector columns.
 *
 * Does not run R4, reset a job, lift a hold, review, schedule or publish.
 * Guard every exact row with owner/parent, package, stale-version and provider
 * preconditions. Operates on a small bounded slice of incomplete typed rows.
 */
import { studioSupabaseConfigured, supabaseRest } from "./supabase-pipeline-reads.mjs";

const RECORD = /^rec[A-Za-z0-9]{14}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const OUTPUT_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{8,199}\.mp4$/;
const CDN = "https://media.chicagoshining.com/";
const text = v => String(v ?? "").trim();

const SELECT = [
  "id","airtable_record_id","output_number","content_item_id","content_profile_id",
  "output_status","render_status","do_not_publish","test_run_id",
  "review_status","publish_status","auto_publish_enabled","remotion_job_id",
  "final_file_url","published_at","platform_post_url",
  "output_filename","render_total_frames","render_clip_list_text","render_clip_list",
  "selected_assets","selected_clip_count","error_messages","updated_at",
].join(",");

export function assessR4TypedMetadataRecovery(row) {
  const skip = reason => ({ eligible: false, reason });
  if (!row || !UUID.test(text(row.id)) || !RECORD.test(text(row.airtable_record_id)) ||
      !UUID.test(text(row.content_item_id)) || !UUID.test(text(row.content_profile_id)))
    return skip("unverified_output_identity");
  if (row.output_status !== "In Production" || row.render_status !== "Ready for Render")
    return skip("not_pre_render");
  if (row.do_not_publish !== false || text(row.test_run_id)) return skip("hold_or_test");
  if (text(row.review_status) || !["","Not Ready","Ready to Publish"].includes(text(row.publish_status)) ||
      row.auto_publish_enabled === true || row.remotion_job_id || row.final_file_url ||
      row.published_at || row.platform_post_url)
    return skip("approval_dispatch_or_existing_render");
  const bag = row.error_messages && typeof row.error_messages === "object" &&
    !Array.isArray(row.error_messages) ? row.error_messages : {};
  if ([
    "Publish_Locked_At", "Studio_Publish_Dispatch_At", "Studio_Render_Review_Hold_Active",
    "Factory_Review_Handoff_Safety_Hold_At", "Platform_Post_ID", "Platform_Media_ID",
  ].some(key => text(bag[key]))) return skip("historical_provider_or_review_hold");
  const filename = text(bag.Output_Filename);
  const rawFrames = text(bag.Render_Total_Frames);
  const frames = Number(rawFrames);
  if (!OUTPUT_FILE.test(filename) || !/^[1-9][0-9]{0,6}$/.test(rawFrames) ||
      !Number.isSafeInteger(frames) || frames > 100000 ||
      text(bag.Composition_ID) !== "ChicagoShiningPhotoSequence")
    return skip("invalid_authoritative_render_metadata");
  if (text(row.output_filename) && text(row.output_filename) !== filename)
    return skip("conflicting_typed_filename");
  if (row.render_total_frames != null && Number(row.render_total_frames) !== frames)
    return skip("conflicting_typed_frame_count");
  if (text(row.output_filename) && Number(row.render_total_frames) === frames)
    return skip("already_mapped");
  const clips = row.selected_assets?.selected_clips;
  const count = Number(row.selected_clip_count);
  if (!Number.isSafeInteger(count) || count < 1 || !Array.isArray(clips) ||
      clips.length !== count ||
      clips.some(clip => !text(clip?.url || clip?.src).startsWith(CDN)))
    return skip("source_manifest_not_verified");
  if (!Array.isArray(row.render_clip_list) || row.render_clip_list.length === 0 ||
      !text(row.render_clip_list_text))
    return skip("missing_render_clip_package");
  if (!text(row.updated_at)) return skip("missing_row_version");
  // A pre-existing future/date-only slot is NOT approval: preserve it untouched.
  // The final operator-owned review still decides whether it can be scheduled.
  return { eligible: true, filename, frames, reason: "legacy_typed_projection_missing" };
}

function observed(column, value) {
  return column + "=" + (value == null ? "is.null" : "eq." + encodeURIComponent(String(value)));
}

export async function sweepR4TypedMetadataRecovery(env, {
  limit = 4, scan = 48, now = () => new Date(),
} = {}) {
  const result = { scanned: 0, eligible: 0, repaired: 0, skipped: 0, races: 0, unavailable: 0 };
  if (!studioSupabaseConfigured(env)) return { ...result, reason: "supabase_not_configured" };
  const max = Math.max(1, Math.min(8, Number(limit) || 4));
  const size = Math.max(max, Math.min(80, Number(scan) || 48));
  const query = "platform_outputs?output_status=eq.In%20Production" +
    "&render_status=eq.Ready%20for%20Render&do_not_publish=eq.false" +
    "&test_run_id=is.null&remotion_job_id=is.null" +
    "&or=(output_filename.is.null,render_total_frames.is.null)" +
    "&and(error_messages->>Output_Filename.not.is.null,error_messages->>Render_Total_Frames.not.is.null)" +
    "&select=" + SELECT + "&order=output_number.asc&limit=" + size;
  const rows = await supabaseRest(env, query);
  if (!Array.isArray(rows)) throw Error("R4 typed-metadata Supabase scan unavailable");
  result.scanned = rows.length;
  for (const row of rows) {
    if (result.eligible >= max) break;
    const valid = assessR4TypedMetadataRecovery(row);
    if (!valid.eligible) { result.skipped++; continue; }
    // A UUID linked to an output is not proof of its Content Item/PR ownership.
    const parents = await supabaseRest(env, "content_items?id=eq." +
      encodeURIComponent(row.content_item_id) +
      "&content_profile_id=eq." + encodeURIComponent(row.content_profile_id) +
      "&select=id,production_request_id&limit=1");
    const prId = parents?.[0]?.production_request_id;
    if (!Array.isArray(parents) || parents.length !== 1 || !UUID.test(text(prId))) {
      result.unavailable++; continue;
    }
    const requests = await supabaseRest(env, "production_requests?id=eq." +
      encodeURIComponent(prId) + "&select=id,production_job&limit=1");
    if (!Array.isArray(requests) || requests.length !== 1 ||
        requests[0]?.production_job?.step !== "done") {
      result.unavailable++; continue;
    }
    result.eligible++;
    const stamp = now().toISOString();
    const path = "platform_outputs?id=eq." + encodeURIComponent(row.id) +
      "&airtable_record_id=eq." + encodeURIComponent(row.airtable_record_id) +
      "&updated_at=eq." + encodeURIComponent(row.updated_at) +
      "&output_status=eq.In%20Production&render_status=eq.Ready%20for%20Render" +
      "&do_not_publish=eq.false&test_run_id=is.null&remotion_job_id=is.null" +
      "&final_file_url=is.null&published_at=is.null&platform_post_url=is.null" +
      "&" + observed("review_status", row.review_status) +
      "&" + observed("publish_status", row.publish_status) +
      "&" + observed("auto_publish_enabled", row.auto_publish_enabled) +
      "&" + observed("output_filename", row.output_filename) +
      "&" + observed("render_total_frames", row.render_total_frames);
    const patched = await supabaseRest(env, path, {
      method: "PATCH",
      body: { output_filename: valid.filename, render_total_frames: valid.frames, updated_at: stamp },
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(patched) || patched.length !== 1) { result.races++; continue; }
    if (patched[0].output_filename !== valid.filename ||
        Number(patched[0].render_total_frames) !== valid.frames) {
      result.unavailable++; continue;
    }
    result.repaired++;
  }
  return result;
}
