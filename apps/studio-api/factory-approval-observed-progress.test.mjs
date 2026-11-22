import test from "node:test";
import assert from "node:assert/strict";
import { factoryVerifiedApprovalIds } from "./factory-approval-observed-progress.mjs";

const profiles = ["recT2rbKX3MF7cVFU", "recpNlNn6U6eq0M9r", "recgtK8Z7eNADNtVy"];
const requestId = "f704bdab-466c-41b5-994d-20d39d9a4f2c";
const items = Array.from({ length: 14 }, (_, i) => ({
  id: "rec" + String(i + 1).padStart(14, "0"),
  output_id: 11031 + i,
  profile_id: i < 3 ? profiles[0] : i < 11 ? profiles[1] : profiles[2],
  status: "pending",
}));
const group = { group: true, request_id: requestId, items };
function recordsFor(approved = new Set(items.slice(0, 9).map(item => item.id))) {
  return new Map(items.map(item => {
    const wasApproved = approved.has(item.id);
    return [item.id, {
      profileId: item.profile_id,
      row: {
        airtable_record_id: item.id, output_number: item.output_id,
        output_status: wasApproved ? "Approved for Publishing" : "Ready for Review",
        review_status: wasApproved ? "Approved" : "Pending Review",
        error_messages: wasApproved ? { SM_Factory_Supabase_Approval_Receipt: {
          request_id: requestId, output_record_id: item.id,
          output_number: item.output_id, profile_record_id: item.profile_id,
          authority: "supabase", approved_at: "2026-11-22T02:51:48.981Z",
        }} : {},
      },
    }];
  }));
}
test("14-output, three-profile batch verifies nine original-request receipts without R2 status writes", () => {
  const records = recordsFor();
  const result = factoryVerifiedApprovalIds(group, records);
  assert.equal(result.length, 9);
  assert.deepEqual(result, items.slice(0, 9).map(item => item.id));
  assert.equal(items.every(item => item.status === "pending"), true);
});
test("wrong request, output number, owner, record identity and missing approval are not successes", () => {
  for (const corruption of [
    row => { row.error_messages.SM_Factory_Supabase_Approval_Receipt.request_id = "another-request"; },
    row => { row.output_number += 1; },
    row => { row.error_messages.SM_Factory_Supabase_Approval_Receipt.profile_record_id = profiles[2]; },
    row => { row.airtable_record_id = items[4].id; },
    row => { row.review_status = "Pending Review"; },
    row => { row.error_messages.SM_Factory_Supabase_Approval_Receipt.approved_at = "invalid"; },
  ]) {
    const records = recordsFor();
    corruption(records.get(items[0].id).row);
    assert.equal(factoryVerifiedApprovalIds(group, records).length, 8);
  }
});
test("duplicate R2 identity and missing canonical rows fail closed", () => {
  assert.throws(() => factoryVerifiedApprovalIds({ ...group, items: [...items, items[0]] }, recordsFor()),
    /Invalid Factory group progress identities/);
  const missing = recordsFor();
  missing.delete(items[0].id);
  assert.throws(() => factoryVerifiedApprovalIds(group, missing), /receipt read incomplete/);
});
