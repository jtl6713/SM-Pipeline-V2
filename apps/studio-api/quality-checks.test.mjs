import assert from "node:assert/strict";
import test from "node:test";

import {
  CLASSIFIER_KINDS,
  buildDeskInventoryPayload,
} from "./desk-inventory.mjs";
import {
  QUALITY_CHECKS,
  QUALITY_CHECK_BY_KIND,
  assertQualityCatalog,
  attachQualityChecks,
  catalogCheckForKind,
} from "./quality-checks.mjs";

test("quality catalog titles are unique and every classifier kind maps to a catalog id", () => {
  assert.equal(assertQualityCatalog().ok, true);
  const titles = QUALITY_CHECKS.map((row) => row.title);
  assert.equal(new Set(titles).size, titles.length);
  for (const kind of CLASSIFIER_KINDS) {
    const check = catalogCheckForKind(kind);
    assert.ok(check, `classifier kind ${kind} must map to a catalog id`);
    assert.equal(check.kind, kind);
    assert.equal(QUALITY_CHECK_BY_KIND[kind].id, check.id);
  }
});

test("inventory payload.checks covers the catalog with pass or finding", () => {
  const payload = buildDeskInventoryPayload({
    mode: "observe",
    chicagoDate: "2026-09-07",
    chicagoHour: 18,
    generatedAt: "2026-09-07T23:00:00Z",
    incidents: [
      { kind: "intake_parked", class: "transient", fingerprint: "intake_parked:drive1:ingestion_residue" },
    ],
    health: [{ id: "pipeline-runner", ok: true }],
    scannedKinds: new Set(["intake_parked", "health_down"]),
  });
  assert.ok(Array.isArray(payload.checks));
  assert.equal(payload.checks.length, QUALITY_CHECKS.length);
  const parked = payload.checks.find((row) => row.kind === "intake_parked");
  assert.equal(parked.status, "finding");
  assert.equal(parked.incidents.length, 1);
  assert.equal(parked.checked_at, "2026-09-07T23:00:00Z");
  const health = payload.checks.find((row) => row.kind === "health_down");
  assert.equal(health.status, "pass");
  const nightly = payload.checks.find((row) => row.kind === "tester_nightly");
  assert.equal(nightly.status, "not_run");
  const attached = attachQualityChecks([], { generatedAt: "2026-09-07T23:00:00Z" });
  assert.equal(attached.every((row) => row.status === "pass"), true);
});
