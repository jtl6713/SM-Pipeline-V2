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
  assert.match(js,/retrySavedFactoryPlan\(saved, recoveryKey, plan\)/);
  assert.match(js,/reconcilePendingGlobalSelection\(batch\)/);
  assert.match(js,/Recovered a confirmed server submission after a connection error/);
});

test("A rejected submission stays visible across the automatic Desk refresh", () => {
  assert.match(js, /batchSubmissionError: null/);
  assert.match(js, /FACTORY_SUBMISSION_ERROR_KEY = "studio\.factory\.submission-error\.v1"/);
  assert.match(js, /sessionStorage\.setItem\(FACTORY_SUBMISSION_ERROR_KEY/);
  assert.match(js, /setBatchSubmissionError\(`Confirmed \$\{acceptedOutputs\} of \$\{ready\.length\} outputs accepted/);
  assert.match(js, /if \(state\.batchSubmissionError\) setStatus\(state\.batchSubmissionError, true\);\s*else setStatus\(desk\.warning \|\| "Factory Desk ready\."\);/);
  assert.match(js, /submitFactoryBatchApprovals\(\)\.catch\(\(error\) => setBatchSubmissionError/);
});

test("Retryable Factory failures retain an exact payload for bounded background retry", () => {
  assert.match(js, /JSON.stringify\(plan.payload\)/);
  assert.match(js, /auto_retry: true/);
  assert.match(js, /Math.min\(60000, 15000 \* saved.attempts\)/);
  assert.match(js, /saved.next_retry_ms/);
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
  let clearedErrors = 0;
  const clearAuthoritativelyMissingGlobalPlans = new Function(
    "localStorage", "pendingFactoryApproval", "setStatus", "setBatchSubmissionError",
    "FACTORY_PENDING_REQUEST_KEY", "FACTORY_PENDING_MISSING_GRACE_MS",
    `${clearFn}; return clearAuthoritativelyMissingGlobalPlans;`,
  )(localStorage, () => stored ? JSON.parse(stored) : null, () => {},
    message => { if (message === null) clearedErrors++; }, "pending", 90_000);
  assert.equal(clearAuthoritativelyMissingGlobalPlans(new Set([plan.request_id]), 90_999), 0,
    "A request inside the grace period must stay locked");
  assert.ok(stored);
  assert.equal(clearAuthoritativelyMissingGlobalPlans(new Set([plan.request_id]), 91_000), 1);
  assert.equal(stored, null, "An expired exact-ID miss must release the stale browser lock");
  assert.equal(clearedErrors, 1, "Reconciled request must also clear its stale failure banner");
  assert.match(js, /FACTORY_PENDING_MISSING_GRACE_MS = 90 \* 1000/);
  assert.match(js, /await reconcileFactorySubmissionFence\(saved, key\)/);
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

function factoryPendingRecoveryHarness(saved, fetchJson) {
  let stored = saved ? JSON.stringify(saved) : null;
  const calls = [], accepted = [], messages = [];
  const state = { selectedOutputs: new Set(["recExistingA", "recExistingB", "recNewChicago"]), desk: null };
  const localStorage = {
    getItem: () => stored, setItem: (_key, value) => { stored = value; },
    removeItem: () => { stored = null; },
  };
  const rowsFn = extractNamedFunction(js, "factoryActivityRows");
  const matchesFn = extractNamedFunction(js, "factoryActivityMatchesPlan");
  const missingFn = extractNamedFunction(js, "factoryActivityProvesPlanMissing");
  // The generic extractor starts at "function" and omits the async modifier.
  const recoveryFn = "async " + extractNamedFunction(js, "reconcileFactorySubmissionFence");
  const rows = new Function(rowsFn + "; return factoryActivityRows;")();
  const matches = new Function("factoryActivityRows",
    matchesFn + "; return factoryActivityMatchesPlan;")(rows);
  const missing = new Function(missingFn + "; return factoryActivityProvesPlanMissing;")();
  const reconcile = new Function(
    "pendingFactoryApproval", "FACTORY_PENDING_MISSING_GRACE_MS",
    "fetchJson", "localStorage", "FACTORY_PENDING_REQUEST_KEY",
    "factoryActivityMatchesPlan", "factoryActivityProvesPlanMissing",
    "rememberFactoryAccepted", "state", "saveFactorySelection",
    "setBatchSubmissionError", "renderDesk", "updateFactoryBatchToolbar", "setStatus",
    "factorySavedPayloadMatchesPlan", "retrySavedFactoryPlan", "factoryRecoveryEntries",
    recoveryFn + "; return reconcileFactorySubmissionFence;",
  )(
    () => stored ? JSON.parse(stored) : null, 90_000,
    (url, options) => { calls.push({url, options}); return fetchJson(url); },
    localStorage, "pending", matches, missing,
    ids => accepted.push(...ids), state, () => {},
    () => {}, () => {}, () => {}, message => messages.push(message), () => false, async () => null, () => [],
  );
  return { reconcile, state, calls, accepted, messages, pending: () => stored ? JSON.parse(stored) : null };
}

test("Factory reconciles legacy profile-local saved approvals by exact ID before new global submission", async () => {
  const request_id = "legacy_factory_chicago_20261102";
  const saved = {profile_id:"recChicago", request_id, ids:["recExistingA"], saved_ms:Date.now()-120_000};
  const fixture = factoryPendingRecoveryHarness(saved, async url => {
    assert.match(url, /profile=recChicago&request_id=legacy_factory_chicago_20261102/);
    return {ok:true,batch:true,job_id:"fb_"+request_id,request_id,profile_id:"recChicago",
      status:"completed",items:[{id:"recExistingA",status:"approved"}]};
  });
  const result = await fixture.reconcile();
  assert.equal(result.resolved,true);
  assert.deepEqual(fixture.accepted,["recExistingA"]);
  assert.equal(fixture.pending(),null);
  assert.ok(!fixture.state.selectedOutputs.has("recExistingA"));
  assert.ok(fixture.state.selectedOutputs.has("recNewChicago"));
  assert.equal(fixture.calls.length,1);
  assert.deepEqual(fixture.calls[0].options,{cache:"no-store"});
});

test("Factory releases only positively absent legacy request after 90-second grace", async () => {
  const request_id="legacy_factory_missing_20261102";
  const old = factoryPendingRecoveryHarness(
    {profile_id:"recChicago",request_id,ids:["recExistingA"],saved_ms:Date.now()-120_000},
    async () => ({ok:true,batch:true,status:"idle",job_id:null,items:[]}));
  assert.equal((await old.reconcile()).resolved,true);
  assert.equal(old.pending(),null);
  assert.equal(old.state.selectedOutputs.has("recExistingA"),true);
  const recent = factoryPendingRecoveryHarness(
    {profile_id:"recChicago",request_id,ids:["recExistingA"],saved_ms:Date.now()-1_000},
    async () => ({ok:true,batch:true,status:"idle",job_id:null,items:[]}));
  assert.equal((await recent.reconcile()).resolved,false);
  assert.ok(recent.pending(),"an in-flight commit must retain its original ID");
});

test("Factory recovers committed global groups, including completed and failed rows", async () => {
  const request_id="global_factory_committed_20261102";
  const plan={request_id,ids:["recExistingB","recExistingA"]};
  const old=factoryPendingRecoveryHarness(
    {profile_id:"global",ids:plan.ids,batches:[plan],saved_ms:Date.now()-120_000},
    async url => {
      assert.match(url,/scope=all&request_id=global_factory_committed_20261102/);
      return {ok:true,exact_request_id:request_id,batches:[{
        job_id:"fg_"+request_id,request_id,status:"completed",
        items:[{id:"recExistingA",status:"approved"},{id:"recExistingB",status:"failed"}]}]};
    });
  assert.equal((await old.reconcile()).resolved,true);
  assert.equal(old.pending(),null);
  assert.deepEqual(old.accepted,plan.ids);
  assert.ok(old.state.selectedOutputs.has("recNewChicago"));
});

test("Factory preserves original fence when status unavailable or identity conflicts", async () => {
  const request_id="legacy_factory_ambiguous_20261102";
  const pending={profile_id:"recChicago",request_id,ids:["recExistingA"],saved_ms:Date.now()-120_000};
  const cases = [
    async () => { throw Error("429 Airtable cooling down"); },
    async () => ({ok:false,batch:true,status:"idle",job_id:null}),
    async () => ({ok:true,batch:true,job_id:"fb_"+request_id,request_id,
      profile_id:"recOther",items:[{id:"recExistingA"}]}),
    async () => ({ok:true,batch:true,job_id:"fb_"+request_id,request_id,
      profile_id:"recChicago",items:[{id:"recDifferent"}]}),
  ];
  for (const response of cases) {
    const h=factoryPendingRecoveryHarness(pending,response);
    const result=await h.reconcile();
    assert.equal(result.resolved,false);
    assert.ok(h.pending(),"unverified job identity must not be discarded");
    assert.equal(h.accepted.length,0);
  }
  assert.match(js,/await reconcileFactorySubmissionFence\(saved, key\)/);
  assert.doesNotMatch(html,/id="factoryBatchRecoverPending"/);
  assert.match(html,/UI build \d+\.\d+\.\d+/);
});

test("Factory partly committed global groups preserve unsubmitted selection", async () => {
  const planA={request_id:"factory_group_committed_A",ids:["recExistingA"]};
  const planB={request_id:"factory_group_uncommitted_B",ids:["recExistingB"]};
  const h=factoryPendingRecoveryHarness({
    profile_id:"global",ids:["recExistingA","recExistingB"],
    batches:[planA,planB],saved_ms:Date.now()-120_000,
  },async url => url.includes(planA.request_id)
    ? {ok:true,exact_request_id:planA.request_id,batches:[{
        request_id:planA.request_id,job_id:"fg_"+planA.request_id,
        items:[{id:"recExistingA"}],status:"completed"}]}
    : {ok:true,exact_request_id:planB.request_id,batches:[]});
  assert.equal((await h.reconcile()).resolved,true);
  assert.deepEqual(h.accepted,["recExistingA"]);
  assert.ok(h.state.selectedOutputs.has("recExistingB"));
  assert.ok(h.state.selectedOutputs.has("recNewChicago"));
});

test("Foreground submission has one POST and background retry preserves request identity", () => {
  const retry=extractNamedFunction(js,"retrySavedFactoryPlan");
  assert.match(retry,/JSON.stringify\(plan.payload\)/);
  assert.doesNotMatch(retry,/newFactoryRequestId/);
  assert.match(retry,/\[400, 401, 403, 409, 422\]/);
  assert.match(js,/const batch = await submitPlan\(\)/);
});


test("Factory recovery never disables Submit or Clear", () => {
  const fn = extractNamedFunction(js, "updateFactoryBatchToolbar");
  const make = (saved, busy = false) => {
    const nodes = new Map();
    const el = (id) => {
      if (!nodes.has(id)) nodes.set(id,{
        hidden:false,disabled:false,textContent:"",title:"",
        removeAttribute(name){if(name==="title")this.title="";}
      });
      return nodes.get(id);
    };
    // The browser may retain 12 selected IDs from earlier city filters while
    // only two remain actively reviewable. The toolbar counts eligible rows.
    const selectedOutputs = new Set([
      "recSelectedA", "recSelectedB",
      ...Array.from({length:10},(_,i)=>"recLegacy"+i),
    ]);
    const state = {
      selectedOutputs, submittingBatch:false,
      batchGlobal:{enabled:true,max_total:20,max_per_profile:10,stage:"expanded",
        allowed_platforms:["Instagram"]},
      batchRollout:null,batchApprovalsEnabled:true,
    };
    const available = [{id:"recSelectedA",profile_id:"recChicago"},
      {id:"recSelectedB",profile_id:"recChicago"}];
    const compile = new Function("$","readyFactoryOutputs","state",
      "planFactoryApprovalBatches","pendingFactoryApproval",
      "factoryRecoveringIds", "factoryRecoveryEntries",
      fn+"; return updateFactoryBatchToolbar;");
    const call = compile(el,()=>available,state,(cards)=>[cards],()=>saved,
      () => new Set(saved?.ids || []), () => saved ? [{saved}] : []);
    call();
    return {get:el,state};
  };
  const saved = {profile_id:"global",ids:["recSelectedA","recSelectedB"],
    batches:[{ids:["recSelectedA","recSelectedB"],request_id:"saved_global_20261102"}],
    saved_ms:Date.now()-300_000};
  const pending=make(saved);
  assert.match(pending.get("factoryBatchSelectionCount").textContent,/^2 outputs selected/);
  assert.equal(pending.get("factoryBatchSubmit").disabled,false);
  assert.equal(pending.get("factoryBatchClear").disabled,false);
  assert.match(pending.get("factoryBatchPendingNotice").textContent,/2 outputs awaiting server acceptance/);
  const recovering=make(saved,true);
  assert.equal(recovering.get("factoryBatchSubmit").disabled,false);
  assert.equal(recovering.get("factoryBatchClear").disabled,false);
  const absent=make(null);
  assert.equal(absent.get("factoryBatchPendingNotice").hidden,true);
  assert.equal(absent.get("factoryBatchSubmit").disabled,false);

});

test("Factory errors count the current attempted outputs only, not saved cross-city selection", () => {
  assert.match(js,/const remaining = ready\.filter\(card => state\.selectedOutputs\.has\(card\.id\)\)\.length/);
  assert.doesNotMatch(js,/const remaining = state\.selectedOutputs\.size/);
  assert.match(js,/Unconfirmed outputs are checked automatically in the background/);
  assert.doesNotMatch(js,/Use Recover saved submission/);
  assert.match(html,/id="factoryBatchPendingNotice"/);
  assert.match(html,/UI build \d+\.\d+\.\d+/);
});


test("Factory recovery is automatic with no recovery button", () => {
  assert.doesNotMatch(html, /id="factoryBatchRecoverPending"/);
  assert.doesNotMatch(js, /Recover saved submission first/);
  assert.match(js, /state.loading = true;[\s\S]*?reconcilePersistedFactoryPending\(true\)/);
});


test("Factory does not restore a stale HTTP 500 banner after request is reconciled", () => {
  assert.match(js, /if \(!pendingFactoryApproval\(\)\) \{\s*sessionStorage\.removeItem\(FACTORY_SUBMISSION_ERROR_KEY\);/,
    "Hydration must clear session errors when no exact-ID pending fence exists");
  assert.match(js, /if \(!pendingFactoryApproval\(\)\) setBatchSubmissionError\(null\)/,
    "Confirmed-absent automatic reconciliation must clear the saved error");
  assert.match(js, /if \(!pendingFactoryApproval\(\)\) \{\s*setBatchSubmissionError\(null\);\s*setStatus\("Previous Factory request verified in batch history/,
    "Confirmed-committed automatic reconciliation must clear the saved error");
  assert.match(js, /if \(savedError\?\.message && Date\.now\(\) - Number\(savedError\.saved_ms \|\| 0\) < 30 \* 60 \* 1000\)/,
    "A real pending submission should retain its last error within the normal time window");
});

function automaticRecoveryHarness(saved, response) {
  const store = new Map();
  if (saved) store.set('pending', JSON.stringify(saved));
  const localStorage = { get length(){return store.size;}, key(i){return [...store.keys()][i];},
    getItem(k){return store.get(k) ?? null;}, setItem(k,v){store.set(k,v);}, removeItem(k){store.delete(k);} };
  const state = {submittingBatch:false, selectedOutputs:new Set(['recExistingA','recNewChicago']),
    batchApprovalsEnabled:true,batchGlobal:{enabled:true,max_total:20},desk:null};
  const submitted=[],messages=[];
  const functions = ['pendingFactoryApproval','factoryRecoveryEntries','archiveFactoryPending',
    'factoryRecoveringIds','waitingFactorySelection','factoryActivityRows','factoryActivityMatchesPlan',
    'factoryActivityProvesPlanMissing','factorySavedPayloadMatchesPlan'].map(n=>extractNamedFunction(js,n)).join('\n');
  const asyncFunctions=['retrySavedFactoryPlan','reconcileFactorySubmissionFence','reconcilePersistedFactoryPending',
    'submitFactoryBatchApprovals'].map(n=>'async '+extractNamedFunction(js,n)).join('\n');
  const compile=new Function('localStorage','state','fetchJson','submitFactoryGlobalApprovalBatches','messages',`
    const FACTORY_PENDING_REQUEST_KEY='pending', FACTORY_RECOVERY_PREFIX='recovery.',
      FACTORY_WAITING_SELECTION_KEY='waiting', FACTORY_PENDING_MISSING_GRACE_MS=90000;
    let factoryPendingReconcileAt=0, factoryPendingReconcileRunning=false;
    const setBatchSubmissionError=message=>messages.push(message),setStatus=()=>{},updateFactoryBatchToolbar=()=>{},
      saveFactorySelection=()=>{},renderDesk=()=>{},rememberFactoryAccepted=()=>{};
    const refreshFactoryApprovalPolicy=async()=>{};
    const readyFactoryOutputs=()=>[...state.selectedOutputs].map(id=>({id,profile_id:'recChicago'}));
    ${functions}\n${asyncFunctions}
    return {archiveFactoryPending,factoryRecoveryEntries,reconcilePersistedFactoryPending,submitFactoryBatchApprovals};
  `);
  const api=compile(localStorage,state,response,async rows=>{submitted.push(rows.map(x=>x.id));},messages);
  return {...api,store,state,submitted,messages};
}
const interrupted = () => ({profile_id:'recChicago', request_id:'saved_request_20261104',
  ids:['recExistingA'],saved_ms:Date.now()-120000});

test('503 recovery does not block a new selection and preserves both intents', async()=>{
  const h=automaticRecoveryHarness(interrupted(),async()=>{throw Error('503');});
  await h.reconcilePersistedFactoryPending(true);
  await h.submitFactoryBatchApprovals();
  assert.deepEqual(h.submitted,[['recNewChicago']]);
  assert.deepEqual(JSON.parse(h.store.get('waiting')),['recExistingA']);
  assert.equal(h.factoryRecoveryEntries()[0].saved.request_id,'saved_request_20261104');
  assert.equal(h.store.has('pending'),false);
});
test('queued overlapping selection proceeds automatically after authoritative absence',async()=>{
  const h=automaticRecoveryHarness(interrupted(),async()=>({ok:true,batch:true,status:'idle',job_id:null}));
  h.archiveFactoryPending();
  h.store.set('waiting',JSON.stringify(['recExistingA']));
  await h.reconcilePersistedFactoryPending(true);
  assert.deepEqual(h.submitted,[['recExistingA']]);
  assert.equal(h.factoryRecoveryEntries().length,0);
});
test('confirmed prior submission is never submitted again',async()=>{
  const saved=interrupted();
  const h=automaticRecoveryHarness(saved,async()=>({ok:true,job_id:'fb_'+saved.request_id,
    request_id:saved.request_id,profile_id:saved.profile_id,items:[{id:'recExistingA'}]}));
  h.archiveFactoryPending();h.store.set('waiting',JSON.stringify(saved.ids));
  await h.reconcilePersistedFactoryPending(true);
  assert.deepEqual(h.submitted,[]);
  assert.equal(h.state.selectedOutputs.has('recExistingA'),false);
});
test('one unresolved recovery cannot overwrite or starve another saved request',async()=>{
  const h=automaticRecoveryHarness(interrupted(),async url=>{
    if(url.includes('saved_request_20261104'))throw Error('503');
    return {ok:true,batch:true,status:'idle',job_id:null};
  });
  h.archiveFactoryPending();
  h.store.set('pending',JSON.stringify({...interrupted(),request_id:'second_request_20261104',ids:['recNewChicago']}));
  h.archiveFactoryPending();
  assert.equal(h.factoryRecoveryEntries().length,2);
  await h.reconcilePersistedFactoryPending(true);
  assert.equal(h.factoryRecoveryEntries().length,1);
  assert.equal(h.factoryRecoveryEntries()[0].saved.request_id,'saved_request_20261104');
});

function savedGlobalEnvelope() {
  const ids=['recExistingA'];
  const request_id='durable_factory_request_20261104';
  return {profile_id:'global',ids,saved_ms:Date.now()-120000,auto_retry:true,
    batches:[{request_id,ids,payload:{action:'start_group',request_id,record_ids:ids,
      items:[{id:ids[0],profile_id:'recChicago',platform:'Instagram',format:'Reel'}]}}]};
}
test('transient POST failure retains the full original submission and automatically retries the same ID',async()=>{
  const saved=savedGlobalEnvelope(), posts=[];
  let fail=true;
  const h=automaticRecoveryHarness(saved,async(url,options)=>{
    if(options.method==='POST'){
      const body=JSON.parse(options.body);posts.push(body);
      if(fail)throw Object.assign(Error('Airtable busy'),{status:503,retryAfterSeconds:2});
      return {accepted:true,items:body.record_ids.map(id=>({id}))};
    }
    return {ok:true,exact_request_id:saved.batches[0].request_id,batches:[]};
  });
  await h.reconcilePersistedFactoryPending(true);
  assert.equal(posts.length,1);
  let row=h.factoryRecoveryEntries()[0];
  assert.ok(row.saved.batches[0].payload,'absence must never erase original submit intent');
  assert.equal(row.saved.last_error,'Airtable busy');
  fail=false;row.saved.next_retry_ms=0;h.store.set(row.key,JSON.stringify(row.saved));
  await h.reconcilePersistedFactoryPending(true);
  assert.equal(posts.length,2);
  assert.deepEqual(posts[0],posts[1]);
  assert.equal(h.factoryRecoveryEntries().length,0);
  assert.equal(h.state.selectedOutputs.has('recExistingA'),false);
});
test('lost acceptance response is reconciled without another POST or new request ID',async()=>{
  const saved=savedGlobalEnvelope();let posts=0;
  const h=automaticRecoveryHarness(saved,async(url,options)=>{
    if(options.method==='POST'){posts++;throw Object.assign(Error('Connection lost'),{status:504});}
    return {ok:true,exact_request_id:saved.batches[0].request_id,batches:posts ? [{
      request_id:saved.batches[0].request_id,job_id:'fg_'+saved.batches[0].request_id,
      items:saved.ids.map(id=>({id})),status:'queued'}] : []};
  });
  await h.reconcilePersistedFactoryPending(true);
  await h.reconcilePersistedFactoryPending(true);
  assert.equal(posts,1);assert.equal(h.factoryRecoveryEntries().length,0);
});
test('validation errors stay visible and do not become silent automatic POST loops',async()=>{
  const saved=savedGlobalEnvelope();let posts=0;
  const h=automaticRecoveryHarness(saved,async(url,options)=>{
    if(options.method==='POST'){posts++;throw Object.assign(Error('Output is held'),{status:409});}
    return {ok:true,exact_request_id:saved.batches[0].request_id,batches:[]};
  });
  await h.reconcilePersistedFactoryPending(true);
  await h.reconcilePersistedFactoryPending(true);
  const row=h.factoryRecoveryEntries()[0];
  assert.equal(posts,1);assert.equal(row.saved.retry_blocked,true);
  assert.equal(row.saved.last_error,'Output is held');
  assert.ok(h.messages.some(message=>message?.includes('Output is held')), 'actual blocker must be displayed, not swallowed');
});
