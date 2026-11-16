import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  classifyPromotedOrphanIdea,
  isPromotedOrphanIdea,
  PROMOTED_ORPHAN_MIN_AGE_MS,
} from "./promoted-orphan-ideas.mjs";
import { QUALITY_CHECKS, QUALITY_HEALS } from "./quality-checks.mjs";
import { CLASSIFIER_KINDS } from "./desk-inventory.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("promoted orphan predicate requires Promoted + blank content id + empty links + age", () => {
  const old = {
    airtable_record_id: "recOrphanIdea00001",
    status: "Promoted",
    candidate_title: "Orphan Pier",
    created_at: "2026-10-15T21:01:00.000Z",
    payload: {
      Promoted_Content_Record_ID: null,
      "Content Items": [],
    },
  };
  assert.equal(isPromotedOrphanIdea(old, { nowMs: Date.parse("2026-11-16T12:00:00.000Z") }), true);
  assert.equal(isPromotedOrphanIdea({ ...old, status: "Generated" }), false);
  assert.equal(isPromotedOrphanIdea({
    ...old,
    payload: { ...old.payload, Promoted_Content_Record_ID: "recContentItem0001" },
  }), false);
  assert.equal(isPromotedOrphanIdea({
    ...old,
    payload: { ...old.payload, "Content Items": ["recContentItem0001"] },
  }), false);
  assert.equal(isPromotedOrphanIdea(old, {
    nowMs: Date.parse("2026-10-15T22:00:00.000Z"),
    minAgeMs: PROMOTED_ORPHAN_MIN_AGE_MS,
  }), false);
});

test("classifyPromotedOrphanIdea fingerprints blank content id orphans", () => {
  const finding = classifyPromotedOrphanIdea({
    airtable_record_id: "recOrphanIdea00001",
    status: "Promoted",
    candidate_title: "Orphan Pier",
    created_at: "2026-10-15T21:01:00.000Z",
    payload: { Promoted_Content_Record_ID: "", "Content Items": [] },
  });
  assert.equal(finding.kind, "promoted_orphan_idea");
  assert.equal(finding.class, "data_repair");
  assert.equal(finding.actor, "worker_heal");
  assert.equal(finding.fingerprint, "promoted_orphan_idea:recOrphanIdea00001:blank_content_id");
});

test("quality catalog and desk inventory know promoted_orphan_idea", () => {
  assert.ok(QUALITY_HEALS.includes("delete_promoted_orphan_ideas"));
  const check = QUALITY_CHECKS.find((row) => row.kind === "promoted_orphan_idea");
  assert.ok(check);
  assert.equal(check.heal, "delete_promoted_orphan_ideas");
  assert.equal(check.actor, "worker_heal");
  assert.ok(CLASSIFIER_KINDS.includes("promoted_orphan_idea"));
});

test("Worker wires daily promoted orphan heal before autonomous harvest", () => {
  const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
  const fn = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
  assert.match(worker, /0\.10\.994-pipeline-search-all-weeks/);
  assert.match(worker, /studioHealPromotedOrphanIdeas/);
  assert.match(worker, /promoted orphan idea heal failed/);
  assert.match(fn, /export async function studioHealPromotedOrphanIdeas/);
  assert.match(fn, /classifyPromotedOrphanIdea/);
  const harvest = worker.slice(
    worker.indexOf("if (cadence.heavy && Number(cadence.minute) === 0)"),
    worker.indexOf("autonomous top-of-hour harvest failed"),
  );
  assert.match(harvest, /studioHealPromotedOrphanIdeas/);
  assert.match(harvest, /runStudioAutonomousProduce/);
  const healIdx = harvest.indexOf("studioHealPromotedOrphanIdeas");
  const produceIdx = harvest.indexOf("runStudioAutonomousProduce");
  assert.ok(healIdx >= 0 && produceIdx > healIdx);
});
