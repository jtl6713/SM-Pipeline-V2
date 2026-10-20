import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const worker = fs.readFileSync(path.join(root, "apps/studio-api/worker-functions-04.mjs"), "utf8");
const ui = fs.readFileSync(path.join(root, "apps/studio-web/assets/all-profiles-overview-1007.js"), "utf8");

test("profile overview includes overdue approved outputs separately from platform dispatch", () => {
  assert.match(worker, /const overdueUnpublished = mappedOutputs\.filter/);
  assert.match(worker, /review === "approved"/);
  assert.match(worker, /when > Date\.now\(\)/);
  assert.match(worker, /o\.published_at \|\| o\.platform_post_url \|\| o\.manual_published_url/);
  assert.match(worker, /overdue_unpublished: overdueUnpublished/);
  assert.match(worker, /overdue_unpublished: metrics\.overdue_unpublished/);
  assert.match(worker, /scheduled: studioOverviewScheduledCounts\(mappedOutputs\)/);
});

test("awaiting approval is review-ready but not approved or rendering", () => {
  assert.match(worker, /state !== "Ready for Review" && state !== "Awaiting Approval"/);
  assert.match(worker, /\["approved", "rejected", "skipped"\]\.includes\(review\)/);
  assert.match(worker, /ready for render\|waiting in render queue/);
});

test("parenthesized profile count uses overdue unpublished, not scheduled column sum", () => {
  assert.match(ui, /function overdueUnpublishedTotal\(row\)/);
  assert.match(ui, /overdue_unpublished: Number\(row\.overdue_unpublished\) \|\| 0/);
  assert.match(ui, /overdue_unpublished"\]/);
  assert.doesNotMatch(ui, /scheduledTotal\(row\)/);
});
