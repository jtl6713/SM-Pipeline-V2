import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(root, "worker.js"), "utf8");
const stages = fs.readFileSync(path.join(root, "worker-functions-04.mjs"), "utf8");

test("YTS1 existing upload jobs are checked independently before heavy cron, with no new upload", () => {
  const start = stages.indexOf("export async function studioReconcileYoutubeExistingUploadJobs(");
  const end = stages.indexOf("/*__STUDIO_WORKER_END:studioReconcileYoutubeExistingUploadJobs__*/", start);
  assert.ok(start >= 0 && end > start);
  const existing = stages.slice(start, end);
  assert.match(existing, /sortField: "YouTube_Last_Checked_At", sortDirection: "asc"/);
  assert.match(existing, /YouTube_Upload_Job_ID/);
  assert.match(existing, /Publish_Next_Retry_At/);
  assert.match(existing, /Do_Not_Publish/);
  assert.match(existing, /candidateJobId/);
  assert.match(existing, /studioPulseYtRecord\(env, "yts1", "YTS1", row\)/);
  assert.doesNotMatch(existing, /studioPulseYtRecord\(env, "yt0"|studioPulseYtRecord\(env, "ytp1"/);
  const ordinary = stages.slice(stages.indexOf("export async function studioReconcileYoutubePublishes("),
    stages.indexOf("/*__STUDIO_WORKER_END:studioReconcileYoutubePublishes__*/"));
  assert.doesNotMatch(ordinary, /stage: "yts1"/);
  assert.match(worker, /ctx\.waitUntil\(studioReconcileYoutubeExistingUploadJobs\(env, \{ limit: 3 \}\)/);
  assert.match(worker, /STUDIO_WORKER_EXTRACT:studioReconcileYoutubeExistingUploadJobs/);
});
