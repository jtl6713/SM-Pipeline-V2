/**
 * Durable Quality Agent recovery events. Airtable remains write-authoritative.
 *
 * A successful scan, a retry attempt, and a stale note are never recovery events.
 * Record a verified outcome only AFTER an authoritative read-back proves that
 * the existing output is Published with the same remote post identity.
 *
 * Event_Key is deterministic per output/outcome; concurrent duplicate ledger
 * inserts are harmless to reporting because reporting deduplicates by key.
 * No Meta tokens, upload URLs, or user credentials belong in this ledger.
 */
import { mirrorQualityRecoveryEvent } from "./supabase-pipeline-reads.mjs";

export const QUALITY_RECOVERY_LEDGER_TABLE = "Quality Agent Recovery Ledger";
export const QUALITY_RECOVERY_OUTCOME = "reconciled_published";
const recordPattern = /^rec[A-Za-z0-9]{14}$/;
// Meta Page feed posts use page_id_post_id while Reels and Stories may use a
// single numeric ID. Both are authoritative provider identities.
const metaPostIdPattern = /^\d{6,30}(?:_\d{6,30})?$/;
const get = (row, key) => row?.fields?.[key] ?? row?.[key] ?? null;
const val = (row, key) => String(get(row, key) ?? "").trim();
const profileId = (row) => {
  const profile = get(row, "Content_Profile");
  return Array.isArray(profile) ? String(profile[0] || "") : "";
};

export function qualityRecoveryEventKey(recordId) {
  const id = String(recordId || "").trim();
  if (!recordPattern.test(id)) throw new Error("Invalid Quality Agent recovery record identity");
  return `QA-AUTOVERIFY:${id}:${QUALITY_RECOVERY_OUTCOME}`;
}

export function verifiedRecoveryLedgerFields(record, evidence = {}, { at = new Date().toISOString() } = {}) {
  const remotePost = val(record, "Platform_Post_ID");
  const media = val(record, "Platform_Media_ID");
  const source = String(evidence.source || "").trim();
  if (val(record, "Publish_Status") !== "Published" || val(record, "Output_Status") !== "Published"
      || !metaPostIdPattern.test(remotePost) || (evidence.post_id && String(evidence.post_id) !== remotePost))
    throw new Error("Quality Agent recovery requires authoritative Published read-back with matching remote post ID");
  if (source === "meta_page_stories_exact_media_id"
      && (!/^\d{6,30}$/.test(media) || media !== String(evidence.media_id || "")))
    throw new Error("Exact Meta recovery evidence does not match the stored media identity");
  if (!["meta_page_stories_exact_media_id", "airtable_existing_publication_receipt"].includes(source))
    throw new Error("Quality Agent recovery evidence source is not authoritative");
  const timestamp = new Date(at).toISOString();
  return {
    Event_Key: qualityRecoveryEventKey(record.id),
    Output_Record_ID: record.id,
    Output_ID: Number(val(record, "Output_ID")) || 0,
    Profile_ID: profileId(record),
    Platform: val(record, "Platform"),
    Output_Type: val(record, "Platform_Output_Type"),
    Outcome: QUALITY_RECOVERY_OUTCOME,
    Evidence_Source: source,
    Media_ID: media,
    Post_ID: remotePost,
    Verified_At: timestamp,
    Reconciled_At: timestamp,
    Actor: "studio-quality-agent",
    Details_JSON: JSON.stringify({
      source,
      remote_status: String(evidence.remote_status || "PUBLISHED").slice(0, 40),
      no_new_meta_create: true,
      output_readback: "Published",
    }),
  };
}

/** Idempotent read-before-append; counts are independently deduped by Event_Key. */
export async function appendVerifiedRecoveryEvent(record, evidence, {
  readExisting, createEvent, at = new Date().toISOString(),
} = {}) {
  const fields = verifiedRecoveryLedgerFields(record, evidence, { at });
  if (typeof readExisting !== "function" || typeof createEvent !== "function")
    throw new Error("Recovery ledger unavailable; do not claim a recovery metric");
  const existing = await readExisting(fields.Event_Key);
  if (!Array.isArray(existing)) throw new Error("Recovery ledger lookup incomplete");
  if (existing.some((item) => val(item, "Event_Key") === fields.Event_Key))
    return { recorded: true, already_present: true, event_key: fields.Event_Key };
  const created = await createEvent(fields);
  if (!created) throw new Error("Recovery ledger write did not confirm a record");
  return { recorded: true, already_present: false, event_key: fields.Event_Key };
}

/** Count unique, confirmed output recoveries; never infer success from a note. */
export function recoveredOutcomesFromLedger(rows = [], {
  nowMs = Date.now(), periodDays = 7,
} = {}) {
  const periodStart = nowMs - periodDays * 86400000;
  const events = new Map();
  for (const row of rows) {
    const key = val(row, "Event_Key");
    const id = val(row, "Output_Record_ID");
    const outcome = val(row, "Outcome");
    const reconciledAt = Date.parse(val(row, "Reconciled_At"));
    if (!recordPattern.test(id) || key !== qualityRecoveryEventKey(id)
        || outcome !== QUALITY_RECOVERY_OUTCOME
        || !Number.isFinite(reconciledAt) || reconciledAt < periodStart || reconciledAt > nowMs
        || !metaPostIdPattern.test(val(row, "Post_ID"))
        || !["meta_page_stories_exact_media_id", "airtable_existing_publication_receipt"].includes(val(row, "Evidence_Source")))
      continue;
    const prior = events.get(id);
    if (!prior || Date.parse(prior.reconciled_at) > reconciledAt) {
      events.set(id, {
        record_id: id,
        output_id: val(row, "Output_ID"),
        profile_id: val(row, "Profile_ID") || "unknown",
        platform: val(row, "Platform"),
        output_type: val(row, "Output_Type"),
        evidence_source: val(row, "Evidence_Source"),
        remote_post_id: val(row, "Post_ID"),
        reconciled_at: new Date(reconciledAt).toISOString(),
      });
    }
  }
  return [...events.values()];
}

/** Worker adapter: existing Airtable read/writer, no privileged public route. */
export async function persistVerifiedRecoveryInAirtable(env, record, evidence, {
  listRecords, airtableFetch, at,
} = {}) {
  if (!env || typeof listRecords !== "function" || typeof airtableFetch !== "function")
    throw new Error("Airtable recovery ledger adapter is unavailable");
  return appendVerifiedRecoveryEvent(record, evidence, {
    at,
    readExisting: (key) => listRecords(env, QUALITY_RECOVERY_LEDGER_TABLE, {
      limit: 3,
      filterFormula: `{Event_Key}="${key}"`,
    }),
    createEvent: async (fields) => {
      const saved = await airtableFetch(env, QUALITY_RECOVERY_LEDGER_TABLE, "", {
        method: "POST", body: JSON.stringify({ fields, typecast: true }),
      });
      if (saved?.id) await mirrorQualityRecoveryEvent(env, { id: saved.id, fields }).catch(() => null);
      return saved?.id || null;
    },
  });
}
