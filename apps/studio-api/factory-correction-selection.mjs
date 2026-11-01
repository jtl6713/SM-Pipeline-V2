/**
 * Factory post-render correction selection (preflight only).
 *
 * The existing Production render-format signature is the sole format authority.
 * This module never writes approval, schedule, publication, review-session or
 * render-job state. The eventual Factory submit route must refresh Airtable
 * authority under an output lock before claiming a hold for EACH selected row.
 */
import { productionFormatSignature, matchingProductionRenderOutputs } from "./production-format-groups.mjs";

const value = input => String(input ?? "").trim();
const recordId = input => /^rec[A-Za-z0-9]{14}$/.test(value(input));
const isTrue = input => input === true;
const published = row =>
  Boolean(value(row?.published_at) || value(row?.platform_post_url)
    || value(row?.platform_post_id) || value(row?.platform_media_id)
    || value(row?.publish_started_at) || value(row?.publish_locked_at)
    || value(row?.publish_locked_by))
  || /^(published|publishing|dispatched|uploading|platform processing|draft delivered)$/i.test(
    value(row?.publish_status || row?.output_status));
const busy = row =>
  isTrue(row?.review_hold_active) || isTrue(row?.do_not_publish)
  || Boolean(value(row?.review_session_id) || value(row?.active_correction_id)
    || value(row?.producer_revision_id) || value(row?.active_render_job_id));
const validSignature = row => {
  const format = row?.render_format;
  return format && value(format.key) &&
    format.key === productionFormatSignature(format);
};
const sameContent = (row, source) =>
  value(row?.production_request_id) === value(source.production_request_id)
  && value(row?.content_item_id) === value(source.content_item_id)
  && value(row?.profile_id) === value(source.profile_id);

/** A conservative rendered/pre-approval snapshot, never a write authorization. */
export function factoryCorrectionEligible(row) {
  return Boolean(
    recordId(row?.id) &&
    row?.enabled !== false &&
    validSignature(row) &&
    /^rendered$/i.test(value(row?.render_status)) &&
    /^ready for review$/i.test(value(row?.output_status)) &&
    (value(row?.final_file_id) || value(row?.final_file_url)) &&
    !published(row) && !busy(row)
  );
}

/**
 * Select compatible outputs without using a platform allowlist.
 * Unknown mappings, missing identities, other requests/cities, non-rendered,
 * dispatched or already-held outputs fail closed. Source must itself be ready.
 */
export function factoryCorrectionMatches(source, outputs = [], { authorized_profile_ids = [] } = {}) {
  if (!factoryCorrectionEligible(source) ||
      !recordId(source?.production_request_id) ||
      !recordId(source?.content_item_id) ||
      !recordId(source?.profile_id) ||
      !(Array.isArray(authorized_profile_ids) && authorized_profile_ids.includes(source.profile_id)))
    return [];
  const candidates = Array.isArray(outputs) ? outputs : [];
  const matched = matchingProductionRenderOutputs(source, candidates);
  const seen = new Set();
  return matched.filter(row => {
    if (!sameContent(row, source) || !factoryCorrectionEligible(row) || seen.has(row.id))
      return false;
    seen.add(row.id);
    return true;
  });
}

/**
 * Synchronous, zero-side-effect gate for a proposed Factory correction.
 * The caller is responsible for authoritative membership, locking, durable
 * batch idempotency, all-or-none hold acquisition, and independent approvals.
 */
export function validateFactoryCorrectionSelection({
  source, outputs, authorized_profile_ids, selected_output_ids, note, client_request_id,
} = {}) {
  if (!/^[A-Za-z0-9_-]{8,120}$/.test(value(client_request_id)))
    throw new Error("A stable correction request ID is required");
  if (!value(note) || value(note).length > 3000)
    throw new Error("Creative feedback is required (maximum 3000 characters)");
  const matches = factoryCorrectionMatches(source, outputs, { authorized_profile_ids });
  if (!matches.some(row => row.id === source?.id))
    throw new Error("Source output is not eligible for correction");
  if (!Array.isArray(selected_output_ids) || !selected_output_ids.length)
    throw new Error("Select at least one matching output");
  if (selected_output_ids.length !== new Set(selected_output_ids).size)
    throw new Error("Duplicate output selected");
  const allowed = new Set(matches.map(row => row.id));
  if (selected_output_ids.some(id => !allowed.has(id)))
    throw new Error("Selected output is not an eligible matching format");
  const selected = matches.filter(row => selected_output_ids.includes(row.id));
  return Object.freeze({
    production_request_id: source.production_request_id,
    content_item_id: source.content_item_id,
    profile_id: source.profile_id,
    source_output_id: source.id,
    render_format_key: source.render_format.key,
    client_request_id: value(client_request_id),
    note: value(note),
    output_ids: selected.map(row => row.id),
    outputs: selected.map(row => Object.freeze({
      id: row.id,
      platform: row.platform,
      output_type: row.output_type,
      // The eventual transactional executor must release/reserve independently.
      requires_schedule_vacate: Boolean(value(row.scheduled_at)),
    })),
  });
}
