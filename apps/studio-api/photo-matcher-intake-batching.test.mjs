import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

test("background matcher checks pending intake batches in bounded groups", () => {
  const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function unfinishedIntakeBatchIds(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:unfinishedIntakeBatchIds__*/");
  assert.ok(start >= 0 && end > start);
  const check = source.slice(start, end);
  assert.match(check, /unique\.length; start \+= 4/);
  assert.match(check, /fields: \["Intake_Batch_ID"\]/);
  assert.match(check, /limit: 100/);
  assert.match(check, /rows\.length >= 100/);
  assert.match(check, /group\.forEach\(\(id\) => pending\.add\(id\)\)/);
  assert.doesNotMatch(check, /for \(const batchId of unique\.slice\(0, 20\)\)/);
  const evalStart = source.indexOf("export async function evaluateAndMaybeAttachWaitingIdeaPhotos(");
  const evalEnd = source.indexOf("/*__STUDIO_WORKER_END:evaluateAndMaybeAttachWaitingIdeaPhotos__*/");
  assert.match(source.slice(evalStart, evalEnd), /force \? \[\] : await unfinishedIntakeBatchIds/);
});

test("matcher persists HTTP class without logging credentials into Idea match status", () => {
  const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const sweep = source.slice(
    source.indexOf("export async function runWaitingIdeaPhotoMatches("),
    source.indexOf("/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/"),
  );
  assert.match(sweep, /error_http_status: Number\(error\?\.status/);
  assert.match(sweep, /reason: "matcher_error"/);
  assert.doesNotMatch(sweep, /error_message:|error_stack:/);
});