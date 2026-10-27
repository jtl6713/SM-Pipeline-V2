import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const base = path.dirname(fileURLToPath(import.meta.url));
test("IG saved Reel containers are reconciled fairly without new media container creation", () => {
  const worker = fs.readFileSync(path.join(base, "worker.js"), "utf8");
  const module = fs.readFileSync(path.join(base, "worker-functions-04.mjs"), "utf8");
  const start = module.indexOf("export async function studioReconcilePublishingInstagramReels(");
  const end = module.indexOf("/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramReels__*/", start);
  assert.ok(start >= 0 && end > start);
  const scan = module.slice(start, end);
  assert.match(scan, /sortField: "Last_Publish_Attempt_At"/);
  assert.match(scan, /sortDirection: "asc"/);
  assert.match(scan, /Publish_Next_Retry_At/);
  assert.match(scan, /Platform_Media_ID/);
  assert.match(scan, /Platform_Post_ID/);
  assert.match(scan, /Do_Not_Publish/);
  assert.match(scan, /mediaId !== candidateMediaId/);
  assert.match(scan, /studioPulseAp1IgReel\(env, row\)/);
  assert.doesNotMatch(scan, /create_reel|studioPulseAp0PublicAsset/);
  assert.match(worker, /ctx\.waitUntil\(studioReconcilePublishingInstagramReels\(env, \{ limit: 1 \}\)/);
  const cron = worker.slice(worker.indexOf("async scheduled(event, env, ctx)"), worker.indexOf("class HttpError"));
  assert.equal((cron.match(/studioReconcilePublishingInstagramReels\(/g) || []).length, 1);
});


test("IG Reel resumption refuses uncertain or locked remote identities and is canary-bounded", () => {
  const source = fs.readFileSync(path.join(base, "worker-functions-04.mjs"), "utf8");
  const start = source.indexOf("export async function studioReconcilePublishingInstagramReels(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:studioReconcilePublishingInstagramReels__*/", start);
  const scan = source.slice(start, end);
  assert.match(scan, /let resumed = 0/);
  assert.match(scan, /if \(resumed >= limit\) break/);
  assert.match(scan, /Math\.min\(2, Number\(options\.limit \|\| 1\)\)/);
  assert.match(scan, /Publish_Attempt_Count/);
  assert.match(scan, /Publish_Locked_By/);
  assert.match(scan, /Publish_Locked_At/);
  assert.match(scan, /lastNotes\.includes\(processingProof\)/);
  assert.match(scan, /Platform_Post_URL/);
  assert.match(scan, /mediaId !== candidateMediaId/);
  assert.match(scan, /studioPulseAp1IgReel\(env, row\)/);
});
