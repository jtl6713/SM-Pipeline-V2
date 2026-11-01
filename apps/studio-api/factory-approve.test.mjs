import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import { evaluateReviewPackage } from "./review-package-readiness.mjs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const worker = readStudioWorkerSource();
const start = worker.indexOf("async function factoryApproveOutput(");
const end = worker.indexOf("function factoryFeedbackBlock(", start);
assert.ok(start > 0 && end > start, "Factory approval implementation exists");
const source = worker.slice(start, end);

function harness(fields) {
  let writes = 0;
  const output = { id: "recfSBXLxPm0IMw54", fields: {
    Output_Caption: "Ready for human review",
    Thumbnail_URL: "https://media.chicagoshining.com/studio/previews/thumbnails/test.jpg",
    Final_File_URL: "https://drive.google.com/file/d/test/view",
    ...fields,
  } };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const factory = new Function("airtableFetch", "f", "HttpError", "studioOutputReadyForPublishApproval",
    "approveOutputRecordForPublishing", "studioPublishCanDispatchNow", "studioDispatchApprovedPublishAndSchedule",
    "studioScheduleMs","reconcileCreativeMasterAtFactoryApproval",
    "evaluateReviewPackage", "verifyReviewImages",
    source + "\nreturn factoryApproveOutput;")(
      async () => output, (record, key) => record.fields[key],
      HttpError, () => true,
      async () => { writes++; return output; },
      () => false, async () => {},
      (value) => {
        const ms = Date.parse(String(value || ""));
        return Number.isFinite(ms) ? ms : null;
      },
      async () => ({status:"no_master"}),
      evaluateReviewPackage,
      async readiness => readiness,
    );
  return { approve: () => factory({ AIRTABLE_OUTPUT_TABLE_ID: "tblOutputs" }, output.id, "tester", ""), get writes() { return writes; } };
}

test("Factory refuses stale Ready for Review while render queue is unfinished", async () => {
  const h = harness({ Output_Status: "Ready for Review", Render_Status: "Waiting in Render Queue" });
  await assert.rejects(h.approve(), error => error.status === 409 && /rendering is incomplete/i.test(error.message));
  assert.equal(h.writes, 0);
});

test("Factory approve retry does not rewrite or redispatch already approved output", async () => {
  const h = harness({ Output_Status: "Approved for Publishing", Review_Status: "Approved", Render_Status: "Rendered" });
  const result = await h.approve();
  assert.equal(result.already_approved, true);
  assert.equal(h.writes, 0);
});

test("Factory approves a fully rendered Ready for Review output", async () => {
  const h = harness({ Output_Status: "Ready for Review", Render_Status: "Rendered" });
  const result = await h.approve();
  assert.match(result.message, /Approved/);
  assert.equal(h.writes, 1);
});

test("Factory does not approve a review-ready label without the actual caption and finished file", async () => {
  const h = harness({ Output_Status: "Ready for Review", Render_Status: "Rendered", Output_Caption: "", Final_File_URL: "" });
  await assert.rejects(h.approve(), error => error.status === 409 && /Output_Caption|Final_File_URL/.test(error.message));
  assert.equal(h.writes, 0);
});

test("POST approval returns committed result without a second operations queue dependency", () => {
  assert.match(worker, /if \(action === "approve"\) \{\s*\/\/ The Airtable write above is the authoritative approval transaction\./);
  assert.match(worker, /refresh_required: true/);
});
