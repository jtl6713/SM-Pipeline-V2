import test from "node:test";
import assert from "node:assert/strict";
import { PRE_FACTORY_READY_FORMULA, sweepPreFactoryReady } from "./pre-factory-ready-recovery.mjs";

const media = "https://media.chicagoshining.com/";
const old = "2026-10-01T00:00:00.000Z";
function photo() {
  return {
    id: "recPreFactory012345",
    createdTime: old,
    fields: {
      Output_Status: "In Production",
      Render_Status: "Native Photo Route",
      Output_Caption: "Chicago mural story",
      Thumbnail_URL: media + "cover.png",
      Studio_Preview_URL: media + "a.jpg",
      Selected_Clip_Count: 2,
      "Carousel Slides": [{ id: "recA" }, { id: "recB" }],
      Selected_Assets_JSON: JSON.stringify({
        validation_status: "Valid", selected_clips: [
          { url: media + "a.jpg" }, { url: media + "b.jpg" },
        ],
      }),
    },
  };
}
function harness({ changeBeforeRecheck = null, reachable = true } = {}) {
  let state = photo(), reads = 0, writes = 0, mirrors = 0, locks = 0;
  return {
    run: () => sweepPreFactoryReady({
      candidates: [{ id: state.id, createdTime: old }],
      read: async () => {
        reads++;
        if (reads === 2 && changeBeforeRecheck) state = { ...state, fields: { ...state.fields, ...changeBeforeRecheck } };
        return structuredClone(state);
      },
      patch: async (id, fields) => {
        writes++;
        state = { ...state, fields: { ...state.fields, ...fields } };
        return structuredClone(state);
      },
      lock: async (_id, callback) => { locks++; return callback(); },
      mirror: async () => { mirrors++; },
      fetchImpl: async () => ({
        ok: reachable, headers: { get: () => "image/jpeg" },
        body: { cancel: async () => {} },
      }),
      now: () => Date.parse("2026-11-01T16:00:00.000Z"),
    }),
    counts: () => ({ reads, writes, mirrors, locks, output: state.fields.Output_Status }),
  };
}

test("pre-Factory recovery requires real finish evidence and is idempotent", async () => {
  const h = harness();
  const first = await h.run();
  assert.equal(first.reconciled, 1);
  assert.equal(h.counts().output, "Ready for Review");
  assert.equal(h.counts().writes, 1);
  assert.equal(h.counts().mirrors, 1);
  const second = await h.run();
  assert.equal(second.reconciled, 0);
  assert.equal(h.counts().writes, 1);
});

test("pre-Factory never overrides a concurrent revision", async () => {
  const h = harness({ changeBeforeRecheck: { Review_Status: "Changes Requested" } });
  const outcome = await h.run();
  assert.equal(outcome.reconciled, 0);
  assert.equal(h.counts().writes, 0);
});

test("inaccessible review image blocks automatic state promotion", async () => {
  const h = harness({ reachable: false });
  const result = await h.run();
  assert.equal(result.blocked, 1);
  assert.equal(h.counts().writes, 0);
});

test("recovery candidate formula does not scan approved or published outputs", () => {
  assert.match(PRE_FACTORY_READY_FORMULA, /Output_Status}="In Production"/);
  assert.match(PRE_FACTORY_READY_FORMULA, /Published_At}=BLANK/);
  assert.match(PRE_FACTORY_READY_FORMULA, /Do_Not_Publish}=0/);
  assert.doesNotMatch(PRE_FACTORY_READY_FORMULA, /Approved for Publishing/);
});
