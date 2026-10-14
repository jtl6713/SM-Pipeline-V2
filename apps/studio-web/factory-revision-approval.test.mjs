import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("Factory return to Production: explicit Approve always authorizes revision", async () => {
  const app = await readFile(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
  assert.match(app, /BUILD_ID = "item4-0\\.6\\.677-factory-revision-approve"/);
  assert.match(app, /body: JSON\\.stringify\\(\\{ revision_approve: true \\}\\)/);
  assert.doesNotMatch(app, /revision_approve: activeProductionRequest\\?\\.revision_open === true/);
  assert.match(app, /await saveActiveProductionRequest\\(\\{ quiet: true \\}\\)/);
  assert.match(app, /\\/api\\/production-requests\\/\\$\\{encodeURIComponent\\(activeProductionRequest\\.id\\)\\}\\/promote/);
});

test("Factory revision backend retains automatic-promotion safety fence", async () => {
  const worker = await readFile(new URL("../studio-api/worker.js", import.meta.url), "utf8");
  assert.match(worker, /const revisionApprove = promotionPayload\\?\\.revision_approve === true/);
  assert.match(worker, /if \\(revisionOpen && !revisionApprove\\)/);
  assert.match(worker, /Do_Not_Publish: false/);
  assert.match(worker, /productionRequestRevisionOpen\\(requestRecord\\)/);
});
