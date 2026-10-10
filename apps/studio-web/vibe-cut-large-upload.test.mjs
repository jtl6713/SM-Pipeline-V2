import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets", "app-item4-1008.js"), "utf8");

function between(start, end) {
  return app.slice(app.indexOf(start), app.indexOf(end));
}

test("Vibe Cut accepts a video without reclassifying it", () => {
  const adoption = between("function item4AdoptKindForIncomingFiles", "const ITEM4_CLIP_EDGE_MAX_BYTES");
  const support = between("function item4IsSupportedPhotoFile", "function item4UnsupportedPhotoMessage");
  assert.match(adoption, /ezIsVibeCut\(\)/);
  assert.match(support, /ezIsVibeCut\(\)/);
  assert.match(support, /kind === "vibe-cut"/);
  assert.match(support, /if \(ezIsVibeCut\(\) \|\| kind === "vibe-cut"\) return false/);
});

test("Vibe Cut uses the 1.5 GB multipart path and keeps its origin", () => {
  const hardMax = between("function item4VideoHardMaxBytes", "function item4OversizedClipFiles");
  const multipart = between("async function postItem4LargeFinishedVideo", "async function postItem4MasterFile");
  assert.match(hardMax, /ezIsVibeCut\(\)/);
  assert.match(multipart, /originKind = ezIsVibeCut\(\) \? "vibe-cut" : "finished-video"/);
  assert.match(multipart, /ITEM4_FINISHED_VIDEO_HARD_MAX_BYTES/);
  assert.match(multipart, /onProgress/);
  assert.ok(974 * 1024 * 1024 < Math.round(1.5 * 1024 * 1024 * 1024));
});

test("Vibe Cut reports acceptance, rejection, and multipart progress immediately", () => {
  assert.match(app, /was accepted for Vibe Cut/);
  assert.match(app, /Accepted \$\{file\.name\}/);
  assert.match(app, /cannot be uploaded in Studio/);
  assert.match(app, /Uploading \$\{file\.name\} · \$\{safePct\}%/);
  assert.match(app, /\["item4UploadProgress", "ezUploadProgress"\]/);
  assert.match(app, /setRequestMessage\(`\$\{title\}\. \$\{detail\}`/);
  assert.match(app, /setEzMessage\(`\$\{title\}\. \$\{detail\}`/);
  assert.match(app, /function item4IsVideoUploadMode/);
});
