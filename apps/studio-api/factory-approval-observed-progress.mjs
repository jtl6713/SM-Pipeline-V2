/**
 * Read-only progress projection for Factory's R2 Activity GUI.
 *
 * R2's child ledger can lag a successfully committed Supabase approval. A
 * verified receipt from the SAME original request may be painted in the UI,
 * without rewriting R2 or repeating approval/scheduling/publishing.
 */
import { factorySupabaseApprovalRows } from "./factory-supabase-approval.mjs";

const OUTPUT_ID = /^rec[A-Za-z0-9]{14}$/;
const APPROVED_STATUS = new Set(["Approved for Publishing", "Scheduled", "Published"]);

export function factoryVerifiedApprovalIds(group, records) {
  const items = Array.isArray(group?.items) ? group.items : [];
  if (group?.group !== true || !group.request_id || !items.length || items.length > 20 ||
      new Set(items.map(item => item.id)).size !== items.length ||
      items.some(item => !OUTPUT_ID.test(String(item.id || "")))) {
    throw Error("Invalid Factory group progress identities");
  }
  if (!(records instanceof Map) || records.size !== items.length) {
    throw Error("Exact Factory receipt read incomplete");
  }
  const ids = [];
  for (const item of items) {
    const entry = records.get(item.id);
    const row = entry?.row;
    const receipt = row?.error_messages?.SM_Factory_Supabase_Approval_Receipt;
    if (entry?.profileId !== item.profile_id ||
        row?.airtable_record_id !== item.id ||
        Number(row?.output_number) !== Number(item.output_id) ||
        row?.review_status !== "Approved" ||
        !APPROVED_STATUS.has(String(row?.output_status || "")) ||
        receipt?.authority !== "supabase" ||
        receipt?.request_id !== group.request_id ||
        receipt?.profile_record_id !== item.profile_id ||
        receipt?.output_record_id !== item.id ||
        Number(receipt?.output_number) !== Number(item.output_id) ||
        !Number.isFinite(Date.parse(String(receipt?.approved_at || "")))) continue;
    ids.push(item.id);
  }
  return ids;
}

export async function factoryObservedApprovalProgress(env, group) {
  if (!group?.group || !Array.isArray(group.items)) return null;
  try {
    const records = await factorySupabaseApprovalRows(env, group.items.map(item => item.id));
    return {
      status: "verified",
      source: "exact_original_request_supabase_receipts",
      verified_at: new Date().toISOString(),
      approved_item_ids: factoryVerifiedApprovalIds(group, records),
    };
  } catch (error) {
    // Never turn a missing/ambiguous Supabase lookup into a count of zero
    // canonical approvals. Preserve ledger counts and disclose uncertainty.
    console.warn("Factory Activity canonical progress unavailable",
      String(group.request_id || "").slice(0, 48),
      String(error?.message || error).slice(0, 120));
    return { status: "unavailable", source: "r2_ledger_only" };
  }
}
