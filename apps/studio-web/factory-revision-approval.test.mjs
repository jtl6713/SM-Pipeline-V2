import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Factory return to Production: explicit Approve always authorizes revision", async () => {
  const app = await readFile(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  assert.ok(app.includes('BUILD_ID = "item4-0.6.690-mae-horizon-overflow"'));
  assert.ok(app.includes("body: JSON.stringify({ revision_approve: true })"));
  assert.ok(!app.includes("revision_approve: activeProductionRequest?.revision_open === true"));
  assert.ok(app.includes("await saveActiveProductionRequest({ quiet: true })"));
  assert.ok(app.includes("/promote"));
});

test("Factory revision backend retains automatic-promotion safety fence", async () => {
  const worker = await readFile(new URL("../studio-api/worker.js", import.meta.url), "utf8");
  assert.ok(worker.includes("const revisionApprove = promotionPayload?.revision_approve === true;"));
  assert.ok(worker.includes("if (revisionOpen && !revisionApprove)"));
  assert.ok(worker.includes("Do_Not_Publish: false"));
  assert.ok(worker.includes("productionRequestRevisionOpen(requestRecord)"));
});
