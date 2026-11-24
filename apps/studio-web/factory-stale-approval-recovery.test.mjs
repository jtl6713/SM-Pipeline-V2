import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
function block(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, "Factory recovery helpers must remain testable");
  return source.slice(start, end);
}
const extracted = [
  block("  function factoryTerminalEligibilityError(", "\n  function factoryUnrecoverableSubmitError("),
  block("  function clearFactoryRecoveryFences(", "\n  function pruneFactorySelectionToNeedsEyes("),
  block("  function factoryRejectedOutputId(", "\n  async function fetchJson("),
].join("\n");

const A = "recAAAA1111AAAA11";
const B = "recBBBB2222BBBB22";
const C = "recCCCC3333CCCC33";
const recoveryKey = "studio.factory.recovery.v2.demo";
const waitingKey = "studio.factory.waiting-selection.v1";
function saved(error, ids = [A, B, C]) {
  return {
    profile_id: "global",
    ids,
    terminal_eligibility: true,
    last_error: error,
    batches: [{
      request_id: "factory_test_1234",
      ids,
      payload: {
        action: "start_group",
        request_id: "factory_test_1234",
        record_ids: ids,
        items: [
          { id: A, output_id: 101 },
          { id: B, output_id: 102 },
          { id: C, output_id: 103 },
        ],
      },
    }],
  };
}
function fixture(snapshot) {
  const store = new Map([[recoveryKey, JSON.stringify(snapshot)]]);
  const state = { selectedOutputs: new Set([A, B, C]) };
  let selectionWrites = 0;
  const localStorage = {
    removeItem(key) { store.delete(key); },
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, value); },
  };
  const context = {
    state, localStorage, FACTORY_WAITING_SELECTION_KEY: waitingKey,
    waitingFactorySelection: () => JSON.parse(store.get(waitingKey) || "[]"),
    factoryRecoveryEntries: () => store.has(recoveryKey)
      ? [{ key: recoveryKey, saved: JSON.parse(store.get(recoveryKey)) }] : [],
    factoryUnrecoverableSubmitError: message => /could not be loaded/i.test(String(message)),
    pendingFactoryApproval: () => null,
    saveFactorySelection: () => { selectionWrites++; },
    setBatchSubmissionError: () => {},
  };
  const api = vm.runInNewContext(extracted + "\n({factoryRejectedOutputId,dropFactoryRecoveryEntry,clearFactoryRecoveryFences})", context, {
    timeout: 1000,
  });
  return { api, store, state, get selectionWrites() { return selectionWrites; } };
}

test("exact server-identified stale output is removed without discarding other approvals", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  const { api, store, state } = fixture(row);
  const result = api.dropFactoryRecoveryEntry(recoveryKey, row, "Skipped expired output");
  assert.equal(result.dropped, true);
  assert.equal(result.skipped_output_id, B);
  assert.equal(result.remaining, 2);
  assert.equal(store.has(recoveryKey), false);
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort());
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
});

test("preflight past_review with exact rec ID removes only the already-approved member", () => {
  const row = saved(`Output #${B}: past_review. No new batch was accepted. You can submit other selections.`);
  const { api, store, state } = fixture(row);
  assert.equal(api.factoryRejectedOutputId(row), B,
    "The Worker reports an Airtable record ID, not always an output number");
  const result = api.clearFactoryRecoveryFences({ onlyUnrecoverable: true });
  assert.equal(result, 1);
  assert.equal(store.has(recoveryKey), false, "Terminal browser fence must not strand 8 outputs");
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort(),
    "Other members must remain eligible for a safe new request");
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
});

test("record-ID rejection refuses missing proof, different ID or multiple candidates", () => {
  for (const message of [
    `Output #${B}: past_review`,
    "Output #recZZZZ9999ZZZZ99: past_review. No new batch was accepted.",
    `Output #${B}: past_review. No new batch was accepted. Output #${C}: past_review. No new batch was accepted.`,
  ]) {
    const row = saved(message);
    const { api, store } = fixture(row);
    assert.equal(api.factoryRejectedOutputId(row), null);
    assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
    assert.equal(store.has(recoveryKey), true);
  }
});

test("releasing rejected saved request repaints the visible review list", () => {
  assert.match(source, /if \(droppedPoison\) \{[\s\S]{0,350}if \(state\.desk\) renderDesk\(state\.desk\)/);
  assert.match(source, /if \(result\?\.dropped\) \{[\s\S]{0,170}if \(state\.desk\) renderDesk\(state\.desk\)/);
});

test("generic missing-record 409 cannot silently discard or retry unknown output IDs", () => {
  const row = saved("At least one selected output could not be loaded for global batch approval");
  const { api, store, state } = fixture(row);
  const result = api.dropFactoryRecoveryEntry(recoveryKey, row, "Unverified missing output");
  assert.equal(result.dropped, false);
  assert.equal(result.resolved, false);
  assert.equal(store.has(recoveryKey), true);
  assert.deepEqual([...state.selectedOutputs], [A, B, C]);
  assert.equal(store.has(waitingKey), false);
});

test("timeout and generic 409 without server no-acceptance proof preserve all IDs", () => {
  for (const error of [
    "Output #102: output no longer ready",
    "Factory request timed out",
    "Selected outputs overlap another live Factory approval (factory_other_1234)",
  ]) {
    const row = saved(error);
    const { api, store } = fixture(row);
    assert.equal(api.factoryRejectedOutputId(row), null);
    assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
    assert.equal(store.has(recoveryKey), true);
  }
});

test("recovery startup retains valid selections after a single terminal preflight 409", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  const { api, store, state } = fixture(row);
  assert.equal(api.clearFactoryRecoveryFences({ onlyUnrecoverable: true }), 1);
  assert.equal(store.has(recoveryKey), false);
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort());
});

test("a preflight error without a unique numeric match cannot remove a record", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  row.batches[0].payload.items.push({ id: A, output_id: 102 });
  const { api, store } = fixture(row);
  assert.equal(api.factoryRejectedOutputId(row), null);
  assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
  assert.equal(store.has(recoveryKey), true);
});

test("verified no-acceptance native gallery rejection retires only the exact unrepaired member", () => {
  const row = saved("Output #102: Native gallery publication blocked: native_gallery_slide_count_mismatch (output #102). No new batch was accepted. Repair native gallery media before approval.");
  const { api, store, state } = fixture(row);
  const action = api.clearFactoryRecoveryFences({ onlyUnrecoverable: true });
  assert.equal(action, 1);
  assert.equal(store.has(recoveryKey), false);
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort());
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
  assert.ok(!state.selectedOutputs.has(B), "missing-gallery output is NOT approved or queued for automatic retry");
});

test("gallery mismatch without definitive preflight non-acceptance cannot be discarded", () => {
  const row = saved("Native gallery publication blocked: native_gallery_slide_count_mismatch (output #102)");
  const { api, store, state } = fixture(row);
  assert.equal(api.clearFactoryRecoveryFences({ onlyUnrecoverable: true }), 0);
  assert.equal(store.has(recoveryKey), true, "ambiguous historical response must retain idempotency fence");
  assert.deepEqual([...state.selectedOutputs], [A, B, C]);
});


// Regression #2371: a rejected archived request may be provably absent even
// when another historical terminal approval remains in Activity.
const fenceSource = block("  async function reconcileFactorySubmissionFence(", "\n  let factoryPolicyRequest");
function rejectedFenceFixture(response, { age = 120000, retryBlocked = true } = {}) {
  const request = "factory_rejected_2371";
  const snapshot = {
    profile_id: "global", ids: [A, B],
    saved_ms: Date.now() - age, auto_retry: true, retry_blocked: retryBlocked,
    last_error: "HTTP 409",
    batches: [{ request_id: request, ids: [A, B], payload: {
      action: "start_group", request_id: request, record_ids: [A, B],
    }}],
  };
  const store = new Map([[recoveryKey, JSON.stringify(snapshot)], [waitingKey, JSON.stringify([A,B,C])]]);
  const state = {selectedOutputs:new Set([A,B,C]), desk:null};
  const calls = { post:0, accepted:[], render:0 };
  const localStorage = {
    getItem:key => store.get(key) ?? null,
    setItem:(key,value) => store.set(key,value),
    removeItem:key => store.delete(key),
  };
  const api = vm.runInNewContext(fenceSource+"\nreconcileFactorySubmissionFence", {
    state, localStorage, FACTORY_PENDING_MISSING_GRACE_MS:90000,
    FACTORY_WAITING_SELECTION_KEY:waitingKey, FACTORY_PENDING_REQUEST_KEY:"pending",
    fetchJson:async (url,options) => {
      assert.match(url,/request_id=factory_rejected_2371$/);
      assert.equal(options.cache,"no-store");
      if (response instanceof Error) throw response;
      return response;
    },
    factoryActivityMatchesPlan:(status,plan) => (status.batches || []).find(row=>row.request_id===plan.request_id),
    factoryActivityProvesPlanMissing:(status,plan)=>status.ok===true && status.exact_request_id===plan.request_id && Array.isArray(status.batches) && status.batches.length===0,
    factorySavedPayloadMatchesPlan:()=>true,
    retrySavedFactoryPlan:async()=>{calls.post++;return null;},
    factoryTerminalEligibilityError:()=>false, factoryUnrecoverableSubmitError:()=>false,
    rememberFactoryAccepted:ids=>calls.accepted.push(...ids),
    waitingFactorySelection:()=>JSON.parse(store.get(waitingKey)||"[]"),
    saveFactorySelection:()=>{}, setStatus:()=>{}, setBatchSubmissionError:()=>{},
    factoryRecoveryEntries:()=>[], renderDesk:()=>{calls.render++;},
    updateFactoryBatchToolbar:()=>{},
  });
  return { run:()=>api(snapshot,recoveryKey), store,state,calls };
}
const missing2371 = {ok:true,exact_request_id:"factory_rejected_2371",batches:[]};
test("rejected saved request with exact absence after grace releases fence for fresh human click only", async ()=>{
  const f = rejectedFenceFixture(missing2371);
  const result = await f.run();
  assert.equal(result.resolved,true);
  assert.equal(f.store.has(recoveryKey),false);
  assert.equal(f.calls.post,0);
  assert.deepEqual(f.calls.accepted,[]);
  assert.deepEqual([...f.state.selectedOutputs],[C]);
  assert.deepEqual(JSON.parse(f.store.get(waitingKey)),[C]);
});
test("rejected saved request without exact proof, or within grace, stays fenced",async()=>{
  for(const [response,opts] of [[new Error("503"),{}],[{ok:true,batches:[]},{}],[missing2371,{age:1000}]]){
    const f = rejectedFenceFixture(response,opts);
    assert.equal((await f.run()).resolved,false);
    assert.equal(f.store.has(recoveryKey),true);
    assert.deepEqual([...f.state.selectedOutputs],[A,B,C]);
  }
});
test("an exact committed request retains history and never issues another POST",async()=>{
  const f=rejectedFenceFixture({ok:true,exact_request_id:"factory_rejected_2371",batches:[{
    request_id:"factory_rejected_2371",items:[{id:A,status:"failed"},{id:B,status:"approved"}]
  }]});
  assert.equal((await f.run()).resolved,true);
  assert.equal(f.store.has(recoveryKey),false);
  assert.equal(f.calls.post,0);
  assert.deepEqual(f.calls.accepted,[A,B]);
});
