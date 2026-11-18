import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const start = app.indexOf("  function item4SavedPlanMatchesCurrentSelection(");
const end = app.indexOf("  async function prepareItem4Variants(", start);
assert.ok(start >= 0 && end > start, "saved plan readback helper exists");
const helperSource = app.slice(start, end);
const requestId = "recRFZDxZ1vx8Mkvn";
const plan = {items: [
  {platform:"Instagram",output_type:"Reel",aspect_ratio:"9:16"},
  {platform:"Facebook",output_type:"Reel",aspect_ratio:"9:16"},
  {platform:"TikTok",output_type:"Video Draft",aspect_ratio:"9:16"},
  {platform:"YouTube",output_type:"Short",aspect_ratio:"9:16"},
  {platform:"Instagram",output_type:"Story",aspect_ratio:"9:16"},
  {platform:"Facebook",output_type:"Story",aspect_ratio:"9:16"},
]};
const keys = plan.items.map(i => `${i.platform}::${i.output_type}`);

function harness(reply) {
  const requests = [];
  const state = {workspace: {plan_status:"Needs Plan"}, renders:0, syncs:0};
  const ctx = {
    state, requests, console, encodeURIComponent,
    api: async (url, options) => { requests.push({url,options}); return reply; },
    renderItem4Plan: () => state.renders++,
    syncEzPlanChrome: () => state.syncs++,
  };
  const use = vm.runInNewContext(`
    const activeProductionRequest = {id:"${requestId}"};
    let item4Workspace = state.workspace;
    ${helperSource}
    ({
      adopt: item4AdoptReadyPlanFromReadback,
      get workspace() { return item4Workspace; }
    });
  `, ctx);
  return {use,state,requests};
}

test("a Ready plan with all six formats restores stale Needs Plan without writes", async () => {
  const h = harness({status:"Ready",plan});
  assert.equal(await h.use.adopt(requestId, keys), true);
  assert.equal(h.use.workspace.plan_status,"Ready");
  assert.equal(h.use.workspace.plan.items.length,6);
  assert.equal(h.state.renders,1);
  assert.equal(h.requests.length,1);
  assert.equal(h.requests[0].url,`/api/production-requests/${requestId}/plan`);
  assert.equal(h.requests[0].options.method,undefined);
  assert.equal(h.requests[0].options.retries,0);
});

test("a saved plan with different formats or missing ratios is not approved", async () => {
  const mismatch = harness({status:"Ready",plan});
  assert.equal(await mismatch.use.adopt(requestId, ["TikTok::Video Draft"]),false);
  assert.equal(mismatch.use.workspace.plan_status,"Needs Plan");
  const incomplete = harness({status:"Ready",plan:{items:[{platform:"YouTube",output_type:"Short",aspect_ratio:""}]}});
  assert.equal(await incomplete.use.adopt(requestId, ["YouTube::Short"]),false);
  assert.equal(incomplete.use.workspace.plan_status,"Needs Plan");
});

test("Approve consults verified persisted plan before rebuilding and does not bypass other gates", () => {
  const startClick = app.indexOf('  $("promoteProductionRequest")?.addEventListener');
  const endClick = app.indexOf('  async function loadProductionRequests(', startClick);
  assert.ok(startClick>=0 && endClick>startClick);
  const click = app.slice(startClick,endClick);
  const check = click.indexOf("planConfirmed = await item4AdoptReadyPlanFromReadback(approvalRecordId, requestedKeys)");
  const build = click.indexOf("await buildItem4Plan({ throwOnError: true })");
  const postBuild = click.indexOf("planConfirmed = await item4AdoptReadyPlanFromReadback(", build);
  const promote = click.indexOf('/promote`, {');
  assert.ok(check>=0 && build>check && postBuild>build && promote>postBuild);
  assert.match(click,/item4OutputSelectionDirty/);
  assert.match(click,/item4SavedPlanMatchesCurrentSelection/);
  assert.match(click,/item4Workspace\?\.variant_status !== "Ready"/);
  assert.match(click,/retries: 0, \/\/ Never repeat an ambiguous mutation/);
});
