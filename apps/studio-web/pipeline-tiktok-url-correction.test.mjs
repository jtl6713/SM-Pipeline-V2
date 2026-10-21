import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const worker = readStudioWorkerSource();

test("Pipeline exposes URL correction on already published TikTok rows", () => {
  assert.match(app, /pipeline-tiktok-url-edit/);
  assert.match(app, /Edit TikTok URL/);
  assert.match(app, /data-tiktok-complete/);
  assert.match(app, /tiktokNeedsUrlEntry\(record\) \|\| alreadyLive \|\| failed/);
  assert.match(app, /This URL is already saved/);
  assert.match(html, /post-url-edit=1/);
});

test("TikTok URL corrections use metadata-only Operations route and preserve published timestamp", () => {
  assert.match(app, /isCorrectionOrRecovery/);
  assert.match(app, /api\/operations\/outputs/);
  const start = worker.indexOf("export async function patchTiktokManualPublish(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:patchTiktokManualPublish__*/", start);
  assert.ok(start > 0 && end > start);
  const body = worker.slice(start, end);
  assert.match(body, /previousUrl && alreadyPublished/);
  assert.match(body, /Studio TikTok public URL corrected/);
  const correction = body.slice(body.indexOf("if (previousUrl && alreadyPublished)"), body.indexOf("const music ="));
  assert.doesNotMatch(correction, /Published_At:|TikTok_Manual_Posted_At:/);
  assert.match(correction, /Platform_Post_URL: url/);
  assert.match(correction, /Manual_Published_URL: url/);
});
