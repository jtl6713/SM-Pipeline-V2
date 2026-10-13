import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { classifyPreparingGap, fingerprint } from "./desk-inventory.mjs";
import { QUALITY_CHECKS } from "./quality-checks.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("Quality Agent classifies Preparing and Error variant gaps for worker heal", () => {
  const preparing = classifyPreparingGap({ id: "recPrep1", studio_variant_status: "Preparing" });
  assert.equal(preparing.kind, "variant_preparing");
  assert.equal(preparing.class, "transient");
  assert.equal(preparing.actor, "worker_heal");
  assert.equal(preparing.fingerprint, fingerprint("variant_preparing", "recPrep1", "preparing"));

  const errored = classifyPreparingGap({ id: "recErr1", studio_variant_status: "Error" });
  assert.equal(errored.kind, "variant_preparing");
  assert.equal(errored.fingerprint, fingerprint("variant_preparing", "recErr1", "error"));

  assert.equal(classifyPreparingGap({ id: "recReady", studio_variant_status: "Ready" }), null);

  const check = QUALITY_CHECKS.find((row) => row.id === "variant_preparing");
  assert.ok(check);
  assert.equal(check.heal, "requeue_failed");
  assert.match(check.title, /Error|Retry remaining/i);
});

test("Worker heal requeues Failed/Error leftovers like Retry remaining", () => {
  assert.match(worker, /item4RequeueFailedVariantsForHeal/);
  assert.match(worker, /Requeued by Quality Agent prepare heal/);
  assert.match(worker, /Studio_Variant_Status\}="Error"/);
  assert.match(worker, /Math\.min\(40,/);
  assert.match(worker, /0\.10\.579-factory-cancelled-exclude/);
  assert.match(worker, /item4HealIncompletePreparingVariants/);
  assert.match(worker, /item4HealTimelineAutoPrepare/);
});

test("Production UI auto-retries prepare when the poll window expires", () => {
  assert.match(app, /ITEM4_VARIANT_AUTO_RETRIES = 3/);
  assert.match(app, /item4NextVariantAutoRetry/);
  assert.match(app, /prepareItem4Variants\(\{ autoRetry: true \}\)/);
  assert.match(app, /Automatic retry \$\{item4VariantAutoRetries\}\/\$\{ITEM4_VARIANT_AUTO_RETRIES\}/);
  assert.match(app, /BUILD_ID = "item4-0.6.671-content-id"/);
  assert.match(app, /maybeAutoPrepareTimelineVariants/);
});
