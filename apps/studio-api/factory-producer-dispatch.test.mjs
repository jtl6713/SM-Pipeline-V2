import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = path => readFileSync(new URL(path, import.meta.url), "utf8");
const worker = read("./worker-functions-04.mjs");
const entry = read("./worker.js");

test("Factory Producer submission holds request-level lock over the complete durable write", () => {
  assert.match(worker, /const submitContentRevision = \(\) => factorySendBackContent\(/);
  // Only the inner factorySendBackContent transaction owns this lease; the
  // action dispatch must never try to reacquire it with the same request id.
  const entry = worker.slice(worker.indexOf("export async function mutateFactoryDesk("));
  assert.match(worker, /return withOutputApprovalLock\\(env\\.STUDIO_MEDIA, requestId, async/);
  assert.doesNotMatch(entry, /await withOutputApprovalLock\\(\\s*env\\.STUDIO_MEDIA, String\\(payload\\?\\.production_request_id/);
  assert.match(worker, /Request_Status: "Draft"/);
  assert.match(worker, /Studio_Production_Job_JSON: revisionId \? JSON\.stringify\(/);
});

test("Replay prevention covers pending revisions and does not mistake completed work for an in-flight job", () => {
  const fragment = worker.slice(worker.indexOf("const priorFeedback = factoryLatestReviewFeedback"), worker.indexOf("const stamp = new Date().toISOString();", worker.indexOf("const priorFeedback = factoryLatestReviewFeedback")));
  assert.match(fragment, /state=pending/);
  assert.ok(!fragment.includes('&& /\\[factory-producer-revision id=/.test'), "completed revisions must not trigger an old broad replay match");
});

test("Cron can resume persisted Factory revisions and runner kickoff occurs after persistence", () => {
  assert.match(worker, /export async function factoryResumeProducerRevisions/);
  assert.match(worker, /await finalizeProductionRequestPromotion\(env, requestId, idea, ctx\)/);
  assert.match(worker, /ctx\.waitUntil\(factoryAdvanceProducerRevision\(/);
  assert.match(entry, /factoryResumeProducerRevisions\(env, ctx\)/);
});

test("Revisions revoke publishing approval and hold the old media before restarting work", () => {
  const start = worker.indexOf("export async function factorySendBackContent");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:factorySendBackContent__*/", start);
  const body = worker.slice(start, end);
  assert.match(body, /Do_Not_Publish: true/);
  assert.match(body, /Publish_Status: "Not Ready"/);
  assert.match(body, /Review_Status: "Changes Requested"/);
  assert.match(body, /await airtableBatchUpdate\(env, env\.AIRTABLE_OUTPUT_TABLE_ID, patches/);
});

test("Recovery and post-render QA scans only select pending revisions", () => {
  const recover = worker.slice(worker.indexOf("export async function factoryResumeProducerRevisions"), worker.indexOf("/*__STUDIO_WORKER_END:factoryResumeProducerRevisions__*/"));
  const verify = worker.slice(worker.indexOf("export async function factoryVerifyProducerRevisions"), worker.indexOf("/*__STUDIO_WORKER_END:factoryVerifyProducerRevisions__*/"));
  for (const scan of [recover, verify]) {
    assert.match(scan, /filterFormula:.*FIND\("state=pending\]",\{Production_Notes\}\)>0/);
  }
});
