/**
 * Workstream A5 — Airtable ↔ Supabase mirror spot-check (read-only).
 * Kept outside worker-functions-*.mjs END/EXTRACT segments so CI source-split
 * reconstruction does not require Worker markers for helpers.
 */
import {
  studioReadSource,
  studioSupabaseConfigured,
  supabaseRest,
  stripDeletedDuplicateOutputRecords,
} from "./supabase-pipeline-reads.mjs";

export const MIRROR_CHECK_DELETED_OUTPUT_ID = "recAlU4bLFmWDBV4H"; // Output 7894 — see #1037

function mirrorCheckScalar(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.length ? String(value[0]) : null;
  if (typeof value === "object" && value && "name" in value) return String(value.name || "") || null;
  return String(value);
}

function mirrorCheckNormTime(value) {
  const raw = mirrorCheckScalar(value);
  if (!raw) return null;
  const ms = Date.parse(raw);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : raw;
}

function fieldValue(row, name) {
  if (!row) return null;
  if (row.fields && Object.prototype.hasOwnProperty.call(row.fields, name)) return row.fields[name];
  return row[name];
}

function firstLinkedId(value) {
  if (Array.isArray(value) && value.length) return String(value[0] || "");
  return "";
}

export function compareAirtableSupabaseOutputMirror(airtableRow, supabaseRow) {
  const mismatches = [];
  const pairs = [
    ["Output_ID", "output_number", mirrorCheckScalar],
    ["Platform", "platform", mirrorCheckScalar],
    ["Output_Status", "output_status", mirrorCheckScalar],
    ["Publish_Status", "publish_status", mirrorCheckScalar],
    ["Review_Status", "review_status", mirrorCheckScalar],
    ["Published_At", "published_at", mirrorCheckNormTime],
  ];
  for (const [airtableField, supabaseField, norm] of pairs) {
    const left = norm(fieldValue(airtableRow, airtableField));
    const right = norm(supabaseRow?.[supabaseField]);
    if (left == null && right == null) continue;
    if (left !== right) mismatches.push({ field: airtableField, airtable: left, supabase: right });
  }
  return mismatches;
}

export function compareAirtableSupabaseContentMirror(airtableRow, supabaseRow) {
  const mismatches = [];
  const pairs = [
    ["Content_ID", "content_number", mirrorCheckScalar],
    ["Content_Title", "content_title", mirrorCheckScalar],
    ["Content_Status", "content_status", mirrorCheckScalar],
  ];
  for (const [airtableField, supabaseField, norm] of pairs) {
    const left = norm(fieldValue(airtableRow, airtableField));
    const right = norm(supabaseRow?.[supabaseField]);
    if (left == null && right == null) continue;
    if (left !== right) mismatches.push({ field: airtableField, airtable: left, supabase: right });
  }
  return mismatches;
}

/**
 * @param {object} env Worker env with Supabase + Airtable bindings
 * @param {object} ops
 * @param {Function} ops.listRecords
 * @param {Function} ops.readRecord read one Airtable record by id (GET only)
 * @param {Function} ops.HttpError
 * @param {number} [ops.limit]
 */
export async function studioSupabaseMirrorSpotCheck(env, ops = {}) {
  const listRecords = ops.listRecords;
  const readRecord = ops.readRecord;
  const HttpError = ops.HttpError || Error;
  if (typeof listRecords !== "function" || typeof readRecord !== "function") {
    throw new HttpError(500, "mirror-check requires listRecords and readRecord");
  }
  if (!studioSupabaseConfigured(env)) {
    throw new HttpError(503, "Supabase is not configured (set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)");
  }

  const sampleLimit = Math.min(25, Math.max(3, Number(ops.limit) || 12));
  // Sample terminal publish/output states. Do not reference schedule writer
  // fields here — schedule-reservation-writer-audit treats those as writers.
  const outputFormula = [
    "OR(",
    "{Publish_Status}='Published',",
    "{Publish_Status}='Ready to Publish',",
    "{Output_Status}='Approved',",
    "{Output_Status}='Approved for Publishing',",
    "{Output_Status}='Published'",
    ")",
  ].join("");
  const airtableOutputs = await listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
    limit: sampleLimit,
    filterFormula: outputFormula,
    fields: [
      "Output_ID",
      "Platform",
      "Output_Status",
      "Publish_Status",
      "Review_Status",
      "Content_Item",
      "Published_At",
    ],
    sortField: "Output_ID",
    sortDirection: "desc",
  });

  const outputChecks = [];
  let outputMismatches = 0;
  let outputMissingInSupabase = 0;
  for (const row of airtableOutputs) {
    const id = String(row?.id || "");
    const sbRows = await supabaseRest(
      env,
      `platform_outputs?airtable_record_id=eq.${encodeURIComponent(id)}&select=airtable_record_id,output_number,platform,output_status,publish_status,review_status,published_at&limit=1`,
    );
    const sb = Array.isArray(sbRows) && sbRows[0] ? sbRows[0] : null;
    if (!sb) {
      outputMissingInSupabase += 1;
      outputChecks.push({
        id,
        output_id: fieldValue(row, "Output_ID"),
        ok: false,
        missing_in_supabase: true,
      });
      continue;
    }
    const mismatches = compareAirtableSupabaseOutputMirror(row, sb);
    if (mismatches.length) outputMismatches += 1;
    outputChecks.push({
      id,
      output_id: fieldValue(row, "Output_ID"),
      ok: mismatches.length === 0,
      mismatches,
    });
  }

  const contentIds = [...new Set(
    airtableOutputs
      .map((row) => firstLinkedId(fieldValue(row, "Content_Item")))
      .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)),
  )].slice(0, sampleLimit);

  const contentChecks = [];
  let contentMismatches = 0;
  let contentMissingInSupabase = 0;
  for (const contentId of contentIds) {
    let airtableRow = null;
    try {
      airtableRow = await readRecord(env, env.AIRTABLE_CONTENT_TABLE_ID || "tblwzN9AXWvmKVKPs", contentId);
    } catch (error) {
      contentChecks.push({
        id: contentId,
        ok: false,
        airtable_error: String(error?.message || error).slice(0, 160),
      });
      continue;
    }
    const sbRows = await supabaseRest(
      env,
      `content_items?airtable_record_id=eq.${encodeURIComponent(contentId)}&select=airtable_record_id,content_number,content_title,content_status&limit=1`,
    );
    const sb = Array.isArray(sbRows) && sbRows[0] ? sbRows[0] : null;
    if (!sb) {
      contentMissingInSupabase += 1;
      contentChecks.push({
        id: contentId,
        content_id: fieldValue(airtableRow, "Content_ID"),
        ok: false,
        missing_in_supabase: true,
      });
      continue;
    }
    const mismatches = compareAirtableSupabaseContentMirror(airtableRow, sb);
    if (mismatches.length) contentMismatches += 1;
    contentChecks.push({
      id: contentId,
      content_id: fieldValue(airtableRow, "Content_ID"),
      ok: mismatches.length === 0,
      mismatches,
    });
  }

  let deletedAirtablePresent = false;
  try {
    await readRecord(env, env.AIRTABLE_OUTPUT_TABLE_ID, MIRROR_CHECK_DELETED_OUTPUT_ID);
    deletedAirtablePresent = true;
  } catch {
    deletedAirtablePresent = false;
  }
  const deletedSbRows = await supabaseRest(
    env,
    `platform_outputs?airtable_record_id=eq.${encodeURIComponent(MIRROR_CHECK_DELETED_OUTPUT_ID)}&select=airtable_record_id,output_number&limit=1`,
  );
  const deletedStillInSupabase = Array.isArray(deletedSbRows) && deletedSbRows.length > 0;
  const stripped = stripDeletedDuplicateOutputRecords([
    { id: MIRROR_CHECK_DELETED_OUTPUT_ID, content_item_id: "recPOI2nA8AwzLCfS" },
    { id: "recKeepSibling00001", content_item_id: "recPOI2nA8AwzLCfS" },
  ]);
  const deletionSuppressed = !stripped.some((row) => row.id === MIRROR_CHECK_DELETED_OUTPUT_ID)
    && stripped.some((row) => row.id === "recKeepSibling00001");

  const ok = outputMissingInSupabase === 0
    && contentMissingInSupabase === 0
    && outputMismatches === 0
    && contentMismatches === 0
    && !deletedAirtablePresent
    && deletionSuppressed;

  return {
    ok,
    workstream_a5: ok ? "PASS" : "FAIL",
    read_source: studioReadSource(env),
    phase5_writes: "airtable_sor_write_through",
    sampled_outputs: outputChecks.length,
    sampled_content_items: contentChecks.length,
    output_missing_in_supabase: outputMissingInSupabase,
    content_missing_in_supabase: contentMissingInSupabase,
    output_mismatches: outputMismatches,
    content_mismatches: contentMismatches,
    deletion_guard: {
      output_id: 7894,
      airtable_record_id: MIRROR_CHECK_DELETED_OUTPUT_ID,
      airtable_present: deletedAirtablePresent,
      supabase_row_present: deletedStillInSupabase,
      list_strip_suppresses: deletionSuppressed,
      note: deletedStillInSupabase
        ? "Stale Supabase row may remain (deletes are not write-through); list strip must keep it hidden."
        : "Deleted output absent from Supabase mirror.",
    },
    outputs: outputChecks,
    content_items: contentChecks,
  };
}
