import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";

const here = path.dirname(new URL(import.meta.url).pathname);
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

test("idea promotion reconciles successful side effects after transient handoff errors", () => {
  assert.match(worker, /0.10.527-home-overview-lean/);
  assert.match(worker, /studio_promotion_reconcile_after_handoff_error_v1: true/);
  assert.match(worker, /try \{\s*await fetchPromotionHandoff\(env, webhook\);\s*\} catch \(error\) \{/s);
  assert.match(worker, /const reconciled = await waitForPromotionResult\(env, recordId\);/);
  assert.match(worker, /if \(promotionCompleted\(reconciled\)\) \{/);
  assert.match(worker, /recovered_after_handoff_error: true/);
  assert.match(worker, /handoff: "I3-to-I4-reconciled"/);
  assert.match(worker, /throw error;/);
});
