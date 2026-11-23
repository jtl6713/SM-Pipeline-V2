import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const start = source.indexOf("  function factoryBatchActivityEnvelope(");
const finish = source.indexOf("  function renderFactoryBatchActivity(", start);
assert.ok(start > 0 && finish > start);

function fixture() {
  const state = { submissionPreview: null, batch: null, completedOpen: false };
  const renders = [];
  const helpers = new Function(
    "factoryProfileId", "newFactoryRequestId", "state", "renderFactoryBatchActivity",
    source.slice(start, finish) +
      "\nreturn {show: factoryShowSubmissionPreview, dismiss: factoryDismissSubmissionPreview," +
      "preview: factorySubmissionPreview, reconcile: factoryReconcileSubmissionPreview," +
      "unconfirmed: factoryMarkSubmissionUnconfirmed, merge: factoryBatchMergeAcceptedActivity," +
      "discovered: factoryBatchMergeDiscoveredActivity};"
  )(() => null, () => "local_20261123_123456", state, batch => renders.push(batch));
  return { state, renders, ...helpers };
}
const card = (n, city = "recNYC") => ({
  id: "recOutput" + n, output_id: 11000 + n, profile_id: city,
  title: "Selected output " + n, platform: "Instagram", studio_output_type: "Carousel",
});
const accepted = (request, items) => ({
  group: true, job_id: "fg_" + request, request_id: request, status: "running",
  total: items.length, done_count: 0, approved_count: 0,
  pending_count: items.length, failed_count: 0, profile_ids: ["recNYC"],
  items: items.map(item => ({ ...item, status: "pending", phase: "queued" })),
});

test("selected outputs paint immediately at zero without claiming server acceptance", () => {
  const f = fixture();
  f.show([card(1), card(2, "recChicago")]);
  const row = f.state.submissionPreview;
  assert.equal(f.renders.length, 1, "first paint happens synchronously on click");
  assert.equal(row.request_id, null, "never invent a server receipt");
  assert.equal(row.status, "submitting");
  assert.equal(row.total, 2);
  assert.equal(row.pending_count, 2);
  assert.equal(row.done_count, 0);
  assert.equal(row.children.length, 2);
  assert.ok(row.items.every(item => item.local_preview && item.phase === "submitting"));
  assert.equal(f.state.batch, null, "local preview never becomes canonical activity");
});

test("acknowledged chunks remove only their matching local preview items", () => {
  const f = fixture();
  f.show([card(1), card(2), card(3)]);
  let activity = f.merge(null, accepted("factory_original_20261123_a", [card(1),card(2)]));
  const waiting = f.reconcile(activity.batches);
  assert.equal(waiting.total, 1);
  assert.equal(waiting.items[0].id, card(3).id);
  assert.equal(activity.totals.pending + waiting.pending_count, 3);
  activity = f.merge(activity, accepted("factory_original_20261123_b", [card(3)]));
  assert.equal(f.reconcile(activity.batches), null);
  assert.equal(f.state.submissionPreview, null);
  assert.equal(activity.totals.pending, 3);
});

test("uncertain network receipt remains visibly unconfirmed, preflight failure clears it", () => {
  const f = fixture();
  f.show([card(1)]);
  f.unconfirmed();
  assert.equal(f.state.submissionPreview.status, "awaiting_acceptance");
  assert.equal(f.state.submissionPreview.items[0].phase, "checking_acceptance");
  f.dismiss();
  assert.equal(f.state.submissionPreview, null);
  assert.equal(f.renders.length, 3);
});

test("slow discovery never rolls back newer exact progress", () => {
  const f = fixture();
  const previous = f.merge(null, {
    ...accepted("factory_progress_20261123", [card(1)]),
    status: "completed", pending_count: 0, done_count: 1, approved_count: 1,
    items: [{ ...card(1), status: "approved" }],
  });
  const stale = accepted("factory_progress_20261123", [card(1)]);
  const result = f.discovered(previous, {
    view:"active", filter_profile_id:null, batches:[stale], totals:{},
  });
  assert.equal(result.batches[0].done_count,1);
  assert.equal(result.batches[0].approved_count,1);
});

test("status path isolates partial failures and never submits again", () => {
  const polling = source.slice(source.indexOf("async function refreshFactoryBatchActivity("),
    source.indexOf("async function refreshFactoryCompletedBatches("));
  assert.match(polling, /Promise\.allSettled\(fastGroups/);
  assert.match(polling, /outcomes\.filter\(row => row\.status === "fulfilled"\)/);
  assert.match(polling, /batchActivityPartialError/);
  assert.match(polling, /if \(state\.batchRefreshRequested\)/);
  assert.match(polling, /discoveryAge >= 60000/);
  assert.match(polling, /batchDiscoveryStartedMs = now/);
  assert.match(polling, /Math\.max\(\s*state\.lastBatchFullFetchMs/);
  assert.doesNotMatch(polling, /method:\s*["']POST["']/);
  assert.match(source, /factoryShowSubmissionPreview\(clickedCards\);/);
  assert.match(source, /renderFactoryBatchActivity\(state\.batch\);\s*syncFactoryFilterOptions\(\)/);
});


test("first original-ID status is shown despite a slow global discovery still loading", async () => {
  const begin = source.indexOf("  async function refreshFactoryAcceptedReceipt(");
  const end = source.indexOf("  async function refreshFactoryBatchActivity(", begin);
  assert.ok(begin > 0 && end > begin);
  const paths = [];
  const rendered = [];
  const events = [];
  const state = {
    batchActivityLoading: true, // a previous global history scan remains in flight
    batch: {ok:true,view:"active",filter_profile_id:null,batches:[]},
    lastBatchSuccessMs:0, lastBatchFetchMs:0, batchActivityError:"pending",
  };
  const make = new Function("state", "factoryProfileId", "fetchJson",
    "factoryBatchMergeExactActivity", "renderFactoryBatchActivity", "document",
    "CustomEvent", "updateFactoryBatchFreshness",
    source.slice(begin,end) + "\nreturn refreshFactoryAcceptedReceipt;");

  const exact = accepted("original_submitted_20261123", [card(1)]);
  const read = async (url, opts) => {
    paths.push({url,opts});
    return {ok:true,batches:[exact]};
  };
  const refresh = make(state, () => "", read,
    (prior,updates) => ({...prior,batches:updates}),
    snapshot => rendered.push(snapshot),
    {dispatchEvent: event => events.push(event)},
    class { constructor(name,args){this.type=name;this.detail=args.detail;} },
    () => {});
  const response = await refresh(exact);
  assert.equal(state.batchActivityLoading,true,
    "exact progress cannot wait for the ongoing full history scan");
  assert.equal(paths.length,1);
  assert.match(paths[0].url,/scope=all/);
  assert.match(paths[0].url,/request_id=original_submitted_20261123/);
  assert.equal(paths[0].opts.method,undefined,"status read is GET-only");
  assert.equal(rendered.length,1);
  assert.equal(response.batches[0].job_id,exact.job_id);
  assert.equal(events[0].type,"factory:batch-status");
  assert.equal(state.batchActivityError,"");

  const local = {...exact,group:false,profile_id:"recNYC",job_id:"fb_original_submitted_20261123"};
  let localPath = "";
  const localRead = make(state, () => "",
    async url => {localPath=url;return local;},
    (prior,updates) => ({...prior,batches:updates}),
    () => {},{dispatchEvent(){}},
    class { constructor(){} },()=>{});
  assert.equal((await localRead(local))?.batches[0]?.job_id,local.job_id);
  assert.match(localPath,/content_profile_id=recNYC/);
  assert.doesNotMatch(localPath,/scope=all/);

  // An earlier receipt can return after regular status polling has already
  // verified an approval. The late queued snapshot must not regress the bar.
  state.batch = {batches:[{...exact,done_count:1,pending_count:0,
    approved_count:1,status:"completed"}]};
  const paintsBefore = rendered.length;
  const staleRead = await refresh(exact);
  assert.equal(staleRead,state.batch);
  assert.equal(rendered.length,paintsBefore,
    "late first-receipt GET must not repaint 0% over a newer 100%");
});

test("mismatched first receipt never paints a different submission", async () => {
  const start = source.indexOf("  async function refreshFactoryAcceptedReceipt(");
  const stop = source.indexOf("  async function refreshFactoryBatchActivity(",start);
  const state = {batch:{batches:[]},batchActivityError:"",batchActivityPartialError:""};
  let paints=0;
  const fetch = new Function("state","factoryProfileId","fetchJson",
    "factoryBatchMergeExactActivity","renderFactoryBatchActivity","document",
    "CustomEvent","updateFactoryBatchFreshness",
    source.slice(start,stop)+"\nreturn refreshFactoryAcceptedReceipt;")(
      state,()=>"",async()=>({ok:true,batches:[{
        ...accepted("different_identity_20261123",[card(1)]),
      }]}),
      ()=>{throw Error("mismatched response should not merge");},
      ()=>{paints++;},{dispatchEvent(){}},class{},()=>{});
  assert.equal(await fetch(accepted("expected_identity_20261123",[card(1)])),null);
  assert.equal(paints,0);
  assert.match(state.batchActivityPartialError,/receipt delayed/);
});
