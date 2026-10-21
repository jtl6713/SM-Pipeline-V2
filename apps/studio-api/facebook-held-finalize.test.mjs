import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");
const start = worker.indexOf("export async function studioReconcileFacebookPhotos(");
const end = worker.indexOf("/*__STUDIO_WORKER_END:studioReconcileFacebookPhotos__*/", start);
const source = worker.slice(start, end);
test("Existing Facebook photo posts can run FB3 finalize during Graph publishing hold", () => {
  assert.ok(start >= 0 && end > start);
  assert.match(source, /const graphPublishHeld = studioFacebookGraphPublishHeld\(env\)/);
  assert.doesNotMatch(source, /if \(studioFacebookGraphPublishHeld\(env\)\) return \[\]/);
  assert.match(source, /if \(graphPublishHeld && scan\.stage !== "fb3"\) continue/);
  assert.match(source, /stage: "fb3",[\s\S]*?Platform_Post_ID\}!=/);
});
test("Finalization precedes all creation stages and prioritizes oldest overdue", () => {
  const at3 = source.indexOf('stage: "fb3"');
  const at0 = source.indexOf('stage: "fb0"');
  assert.ok(at3 >= 0 && at3 < at0);
  assert.match(source, /sortField: "Scheduled_Post_Date", sortDirection: "asc"/);
});
test("Graph hold never sends FB0, FB1, FB2, FB2R", () => {
  assert.match(source, /if \(graphPublishHeld && scan\.stage !== "fb3"\) continue/);
  for (const stage of ["fb0","fb1","fb2","fb2r"]) assert.match(source, new RegExp('stage: "'+stage+'"'));
});
