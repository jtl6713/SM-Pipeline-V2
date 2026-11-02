import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const js = fs.readFileSync(path.join(here, "assets/factory-desk.js"), "utf8");
const css = fs.readFileSync(path.join(here, "assets/factory-layout-0680.css"), "utf8");

test("Factory batch UI has selection, activity, refresh, inspect and failed-only retry", () => {
  new Function(js); // Parse the production browser script without executing browser globals.
  assert.doesNotMatch(js, /no longer eligible/i, "Stale selection history must not appear in the Factory toolbar");
  for (const id of ["factoryBatchActivity", "factoryBatchSummary", "factoryBatchDetails",
    "factoryBatchSelectionCount", "factoryBatchSubmit", "factoryBatchClear",
    "factoryBatchInspect", "factoryBatchRetry", "factoryBatchRefresh"]) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(js, /data-factory-select-content/);
  assert.match(js, /data-factory-select-output/);
  assert.match(js, /new Set\(\)/);
  assert.match(js, /localStorage\.setItem\(FACTORY_SELECTION_KEY/);
  assert.match(js, /record_ids: ready\.map/);
  assert.match(js, /request_id: requestId/);
  assert.match(js, /already_running && !batch\.already_submitted/);
  assert.match(js, /refreshFactoryBatchActivity\(\)\.catch/);
  assert.match(js, /visibilitychange/);
  assert.match(js, /action: batch.group \? "retry_group" : "retry"/);
  assert.match(css, /position:sticky/);
  assert.match(css, /@media\(max-width:560px\)/);
});

test("Submit Approvals enables immediately while rollout configuration is loading", () => {
  assert.match(js, /state\.batchApprovalsEnabled === false/);
  assert.doesNotMatch(js, /state\.batchApprovalsEnabled !== true/);
});

test("Factory submit returns after durable enqueue rather than awaiting 20 approvals", () => {
  const start = js.indexOf("async function submitFactoryBatchApprovals");
  const end = js.indexOf("async function retryFactoryBatchFailures", start);
  assert.ok(start > 0 && end > start);
  const submit = js.slice(start, end);
  assert.match(submit, /await fetchJson\("\/api\/factory\/approval-batches"/);
  assert.doesNotMatch(submit, /await watchApproveAll/);
  assert.match(submit, /Never wait for all approvals/);
  assert.match(html, /factory-desk\.js\?v=0\.6\.\d+(?:-[a-z0-9-]+)?/i);
});

test("Finished durable batches reconcile the live Needs Eyes desk and clear selected row checkboxes", () => {
  const start = js.indexOf("async function reconcileFinishedBatchDesk(batch)");
  const end = js.indexOf("async function refreshFactoryBatchActivity(", start);
  assert.ok(start > 0 && end > start, "Terminal-state Desk reconciliation must be implemented");
  const reconcile = js.slice(start, end);
  assert.match(reconcile, /\["completed", "failed"\]\.includes\(batch\.status\)/);
  assert.match(reconcile, /item\.status === "approved" \|\| item\.status === "already_satisfied"/);
  assert.match(reconcile, /fetchJson\("\/api\/factory\/desk", \{ cache: "no-store" \}\)/);
  assert.match(reconcile, /renderDesk\(desk\)/);
  assert.match(reconcile, /confirmed\.every\(\(id\) => !stillReviewing\.has\(id\)\)/,
    "Stale read copies must be retried, not considered successfully reconciled");
  assert.match(js, /renderFactoryBatchActivity\(batch\);[\s\S]{0,180}reconcileFinishedBatchDesk\(batch\?\.batches\?\.\[0\] \|\| batch\)\.catch/);
  assert.match(js, /ready\.forEach\(\(card\) => state\.selectedOutputs\.delete\(card\.id\)\);\s*saveFactorySelection\(\);[\s\S]{0,220}if \(state\.desk\) renderDesk\(state\.desk\);/,
    "Submitting must repaint DOM selection once the accepted IDs leave selectedOutputs");
});

test("Global group UI is gated and follows the server-signed platform matrix", () => {
  assert.match(js,/state\.batchGlobal\?\.enabled/);
  assert.match(js,/state\.batchGlobal\.allowed_platforms/);
  assert.match(js,/allowed_output_types_by_platform/);
  assert.match(js,/action: "start_group"/);
  assert.match(js,/action: "start"/);
  assert.match(js,/readyFactoryOutputs\(true\)/);
  assert.match(js,/max_per_profile/);
  assert.match(js,/profile_ids/);
  assert.match(js,/retry_group/);
  assert.match(js,/supported outputs per backend batch/);
  assert.match(js,/profile_id: card\.profile_id \|\| null/);
  assert.match(js,/Factory desk timed out or failed/);
});
test("Story v3 UI remains dormant while Reel v2 restricts selection", () => {
  const fn = js.slice(js.indexOf("function canSelectBatchOutput("),
    js.indexOf("function factoryProfileId(", js.indexOf("function canSelectBatchOutput(")));
  assert.match(fn, /chicago_ig_reel_story_v3/);
  assert.match(fn, /rollout.mode === "chicago_ig_reel_story_v3" && type === "Story"/);
  assert.match(fn, /String\(card\?\.profile_id \|\| ""\) === String\(rollout.profile_id \|\| ""\)/);
  assert.match(fn, /String\(card\?\.platform \|\| ""\) === "Instagram"/);
  assert.match(js, /Chicago Instagram pilot: select up to five Reels or Stories per batch/);
});

function extractNamedFunction(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `Missing ${name}`);
  const brace = source.indexOf("{", start);
  let depth = 0;
  for (let i = brace; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  throw new Error(`Unterminated ${name}`);
}

test("Large global selections are partitioned instead of disabling Submit", () => {
  const fn = extractNamedFunction(js, "planFactoryApprovalBatches");
  const planFactoryApprovalBatches = new Function(`${fn}; return planFactoryApprovalBatches;`)();
  const chicago = Array.from({length:27}, (_,i)=>({id:`recChi${i}`,profile_id:"recChicago"}));
  const chunks = planFactoryApprovalBatches(chicago,20,10);
  assert.deepEqual(chunks.map(x=>x.length),[10,10,7]);
  assert.equal(chunks.flat().length,27);
  assert.equal(new Set(chunks.flat().map(x=>x.id)).size,27);

  const mixed = [
    ...Array.from({length:12},(_,i)=>({id:`recA${i}`,profile_id:"recA"})),
    ...Array.from({length:12},(_,i)=>({id:`recB${i}`,profile_id:"recB"})),
    ...Array.from({length:3},(_,i)=>({id:`recC${i}`,profile_id:"recC"})),
  ];
  const mixedChunks = planFactoryApprovalBatches(mixed,20,10);
  assert.equal(mixedChunks.flat().length,27);
  for (const chunk of mixedChunks) {
    assert.ok(chunk.length <= 20);
    const counts = new Map();
    for (const row of chunk) counts.set(row.profile_id,(counts.get(row.profile_id)||0)+1);
    assert.ok([...counts.values()].every(x=>x<=10));
  }
  assert.match(js,/will submit as \$\{planned\} batches/);
  assert.match(js,/submitFactoryGlobalApprovalBatches/);
  assert.match(js,/persistRemaining\(planned\)/);
  assert.match(js,/All \$\{ready\.length\} outputs accepted as/);
});

test("Ambiguous global POST responses reconcile only an exact durable Activity match", () => {
  const rowsFn = extractNamedFunction(js, "factoryActivityRows");
  const matchFn = extractNamedFunction(js, "factoryActivityMatchesPlan");
  const factoryActivityMatchesPlan = new Function(`${rowsFn}; ${matchFn}; return factoryActivityMatchesPlan;`)();
  const plan = {request_id:"req_ambiguous_123456",ids:["recOne","recTwo"]};
  const activity = {batches:[{
    job_id:"fg_req_ambiguous_123456",request_id:"req_ambiguous_123456",
    items:[{id:"recTwo"},{id:"recOne"}],status:"running",
  }]};
  assert.equal(factoryActivityMatchesPlan(activity,plan)?.status,"running");
  assert.equal(factoryActivityMatchesPlan({batches:[{
    request_id:"req_ambiguous_123456",items:[{id:"recOne"},{id:"recOther"}],
  }]},plan),null);
  assert.equal(factoryActivityMatchesPlan({batches:[{
    request_id:"different_request",items:[{id:"recOne"},{id:"recTwo"}],
  }]},plan),null);
  assert.match(js,/recoverSubmittedFactoryPlan\(plan, error\)/);
  assert.match(js,/reconcilePendingGlobalSelection\(batch\)/);
  assert.match(js,/Recovered a confirmed server submission after a connection error/);
});

test("Expired browser-only submissions clear only after an authoritative exact-ID miss", () => {
  const missingFn = extractNamedFunction(js, "factoryActivityProvesPlanMissing");
  const factoryActivityProvesPlanMissing = new Function(
    `${missingFn}; return factoryActivityProvesPlanMissing;`,
  )();
  const plan = {request_id: "req_stale_browser_only_123", ids: ["recOne"]};
  assert.equal(factoryActivityProvesPlanMissing({
    ok: true, exact_request_id: plan.request_id, batches: [],
  }, plan), true);
  assert.equal(factoryActivityProvesPlanMissing({
    ok: true, exact_request_id: "req_different_123456", batches: [],
  }, plan), false);
  assert.equal(factoryActivityProvesPlanMissing({
    ok: false, exact_request_id: plan.request_id, batches: [],
  }, plan), false);
  assert.equal(factoryActivityProvesPlanMissing({
    ok: true, exact_request_id: plan.request_id, batches: [{request_id: plan.request_id}],
  }, plan), false);
  const clearFn = extractNamedFunction(js, "clearAuthoritativelyMissingGlobalPlans");
  let stored = JSON.stringify({
    profile_id: "global", ids: plan.ids, batches: [plan], saved_ms: 1_000,
  });
  const localStorage = {
    getItem: () => stored,
    setItem: (_key, value) => { stored = value; },
    removeItem: () => { stored = null; },
  };
  const clearAuthoritativelyMissingGlobalPlans = new Function(
    "localStorage", "pendingFactoryApproval", "setStatus",
    "FACTORY_PENDING_REQUEST_KEY", "FACTORY_PENDING_MISSING_GRACE_MS",
    `${clearFn}; return clearAuthoritativelyMissingGlobalPlans;`,
  )(localStorage, () => stored ? JSON.parse(stored) : null, () => {}, "pending", 90_000);
  assert.equal(clearAuthoritativelyMissingGlobalPlans(new Set([plan.request_id]), 90_999), 0,
    "A request inside the grace period must stay locked");
  assert.ok(stored);
  assert.equal(clearAuthoritativelyMissingGlobalPlans(new Set([plan.request_id]), 91_000), 1);
  assert.equal(stored, null, "An expired exact-ID miss must release the stale browser lock");
  assert.match(js, /FACTORY_PENDING_MISSING_GRACE_MS = 90 \* 1000/);
  assert.match(js, /clearAuthoritativelyMissingGlobalPlans\(authoritativelyMissing\)/);
  assert.match(js, /Factory confirmed was never created/);
});

test("Submit Approvals hides queued and accepted outputs even with a stale Desk snapshot", () => {
  assert.match(js, /state\.submittingOutputIds = new Set\(selectionIds\)/);
  assert.match(js, /state\.submittingOutputIds = new Set\(ready\.map\(card => card\.id\)\)/);
  assert.match(js, /hiddenApprovals\.has\(card\.id\)/);
  assert.match(js, /bindCardActions\(visibleDesk\)/);
  assert.match(js, /recentFactoryAccepted\(\)\[String\(card\?\.id \|\| ""\)\]/);
  assert.match(js, /if \(state\.desk\) renderDesk\(state\.desk\)/);
});

test("Global Factory selects Instagram Stories with backend-normalized metadata", () => {
  const fn = extractNamedFunction(js, "canSelectBatchOutput");
  const state = {
    batchApprovalsEnabled: true,
    batchGlobal: {
      enabled: true,
      allowed_platforms: ["Instagram", "Facebook"],
      allowed_output_types_by_platform: {
        Instagram: ["Reel", "Story", "Single Image", "Carousel"],
        Facebook: ["Reel", "Story"],
      },
    },
  };
  const eligible = new Function("state", "recentFactoryAccepted",
    `${fn}; return canSelectBatchOutput;`)(state, () => ({}));
  const story = {id: "recStory9393", platform: "Instagram ", studio_output_type: "Story "};
  assert.equal(eligible(story), true, "Story #9393 must be selectable like the backend's trimmed fields");
  assert.equal(eligible({...story, studio_output_type: "Reel"}), true);
  assert.equal(eligible({...story, studio_output_type: "Unsupported"}), false);
  assert.equal(eligible({...story, platform: "TikTok"}), false);
  state.batchGlobal.enabled = false;
  state.batchRollout = {mode: "chicago_ig_reels_v2", profile_id: "recChicago"};
  assert.equal(eligible({...story, profile_id: "recChicago"}), false,
    "Legacy Reel-only policy must remain fail-closed for Stories");
});


test("Factory counts only visible review rows and tolerates one empty active poll", () => {
  assert.match(js, /needs_eyes: filtered\(desk\.lanes\?\.needs_eyes\)\.length/);
  assert.match(js, /state\.emptyActivityPolls = emptyActive/);
  assert.match(js, /emptyActive && state\.emptyActivityPolls < 2 \? state\.batch : fetched/);
  assert.match(js, /batch === fetched && previousActive\.some/);
});
