import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL(
  "./migrations/20261121_guard_meta_user_requested_changes_2563.sql", import.meta.url
), "utf8");

test("#2563: invalid Instagram/Facebook change requests fail closed, never publish", () => {
  assert.match(sql, /NEW\.platform NOT IN \('Instagram','Facebook'\)/);
  assert.match(sql, /NEW\.output_status := 'In Production'/);
  assert.match(sql, /NEW\.review_status := NULL/);
  assert.match(sql, /NEW\.do_not_publish := TRUE/);
  assert.match(sql, /NEW\.auto_publish_enabled := FALSE/);
  assert.match(sql, /NEW\.publish_retry_eligible := FALSE/);
  assert.match(sql, /SM_False_Changes_Requested_Recurrence_2563/);
  assert.match(sql, /'publishing_authorized', false/);
  assert.match(sql, /'publish_hold_preserved', true/);
});

test("#2563: all legitimate user-request sources require documented provenance", () => {
  assert.match(sql, /SM_Factory_Held_Review_Receipt/);
  assert.match(sql, /receipt->>'decision' = 'reject'/);
  assert.match(sql, /receipt->>'actor'/);
  assert.match(sql, /receipt->>'note'/);
  assert.match(sql, /receipt->>'at'/);
  assert.match(sql, /POSITION\(decision_at IN review_note\) > 0/);
  assert.match(sql, /Factory \(Desk\|content\) send-back by/);
  assert.match(sql, /Studio Phase 6 changes requested/);
  assert.match(sql, /Studio_Render_Review_Session_ID/);
  assert.match(sql, /Studio_Render_Review_Hold_ID/);
  assert.match(sql, /NEW\.do_not_publish IS TRUE\s+AND \(is_human_receipt OR is_legacy_review OR is_session_return\)/);
});

test("#2563: normalization is last and covers inserts and every status transition", () => {
  assert.match(sql, /CREATE TRIGGER zz_guard_meta_user_requested_changes_2563/);
  assert.match(sql, /BEFORE INSERT OR UPDATE OF platform, output_status, review_status, error_messages/);
  assert.match(sql, /ON public\.platform_outputs/);
  assert.match(sql, /EXECUTE FUNCTION public\.guard_meta_user_requested_changes_2563\(\)/);
});
