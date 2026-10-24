import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("background photo matcher records only safe failure stage and class", () => {
  const src = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  assert.match(src, /async function ideaPhotoWaitStage\(stage, operation\)/);
  assert.match(src, /ideaPhotoStage = stage/);
  for (const stage of ["find_authorized_request", "find_draft_request", "rank_stills", "intake_batches", "create_draft", "attach_assets", "stamp_autonomous"]) {
    assert.ok(src.includes('"' + stage + '"'), stage);
  }
  const sweep = src.slice(
    src.indexOf("export async function runWaitingIdeaPhotoMatches("),
    src.indexOf("/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/"),
  );
  assert.match(sweep, /error_stage:/);
  assert.match(sweep, /error_name:/);
  assert.match(sweep, /error_http_status:/);
  assert.doesNotMatch(sweep, /error_stack|error_message:/);
  assert.match(sweep, /reason: "matcher_error"/);
});