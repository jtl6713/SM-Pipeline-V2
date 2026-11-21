import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const factory = readFileSync(join(here,"assets/factory-desk.js"),"utf8");
const worker = readFileSync(join(here,"../studio-api/worker-functions-04.mjs"),"utf8");
const api = readFileSync(join(here,"../studio-api/factory-held-review.mjs"),"utf8");

test("held rendered items have human review and rejection actions while publish hold stays active",()=>{
  assert.match(factory,/function canReviewHeldOutput\(/);
  assert.match(factory,/function canRejectHeldOutput\(/);
  assert.match(factory,/data-factory-held-review="approve:/);
  assert.match(factory,/data-factory-held-review="reject:/);
  assert.match(factory,/ready for your review · publishing held/);
  assert.match(factory,/action: decision === "approve" \? "approve_held_review" : "reject_held_review"/);
});
test("held review API is explicitly Supabase-only and never grants publication",()=>{
  assert.match(worker,/factoryHeldReviewDecision\(env, id, actor,/);
  assert.match(worker,/action === "approve_held_review" \|\| action === "reject_held_review"/);
  assert.match(api,/do_not_publish: true, auto_publish_enabled: false/);
  assert.match(api,/publish_status: "Not Ready"/);
  assert.match(api,/publishing_authorized: false/);
  assert.doesNotMatch(api,/airtableFetch\(/);
  assert.doesNotMatch(api,/scheduled_post_date: [^n]/);
});
