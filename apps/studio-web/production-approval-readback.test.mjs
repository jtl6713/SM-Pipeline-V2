import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const app = await readFile(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const start = app.indexOf("  function productionApprovalReadbackState(record, requestId) {");
const end = app.indexOf('  $("promoteProductionRequest")?.addEventListener', start);
assert.ok(start > 0 && end > start, "approval readback helpers must exist in the live app");
const helpers = app.slice(start, end);
const requestId = "recU3Yt5g7xflLYvV";
const contentId = "recdyPrTTg9YTNwX5";

function harness(getResponse) {
  const calls = [];
  const messages = [];
  const opened = [];
  const state = { record: { id: requestId, status: "Draft" } };
  const context = {
    state, calls, messages, opened,
    api: async (path, options) => {
      calls.push({ path, options });
      return getResponse(path, options);
    },
    encodeURIComponent,
    item4PromotionReadbackRequired: new Set([requestId]),
    item4PromotedRequestIds: new Set(),
    populateProductionRequestForm: record => { state.rendered = record.status; },
    setProductionRequestControlState: record => { state.controls = record.status; },
    setRequestMessage: (message, tone) => { messages.push({ message, tone }); },
    openPipelineAfterPromote: () => { opened.push("pipeline"); },
  };
  const script = `
    let activeProductionRequest = state.record;
    ${helpers}
    ({
      classify: productionApprovalReadbackState,
      read: readProductionApprovalAfterError,
      show: showProductionApprovalReadback,
      get active() { return activeProductionRequest; }
    });
  `;
  const api = vm.runInNewContext(script, context);
  return { api, context, calls, messages, opened, state };
}

test("status classification only proves success with correct request and a saved Content Item link", () => {
  const { api } = harness(async () => ({}));
  assert.equal(api.classify({ id: requestId, status: "Promoted", promoted_content_item_links: [contentId] }, requestId), "promoted");
  assert.equal(api.classify({ id: requestId, status: "Promoted", promoted_content_item_links: [] }, requestId), "incomplete");
  assert.equal(api.classify({ id: requestId, status: "Promoted" }, requestId), "incomplete");
  assert.equal(api.classify({ id: requestId, status: "Submitted" }, requestId), "processing");
  assert.equal(api.classify({ id: requestId, status: "Cancelled" }, requestId), "cancelled");
  assert.equal(api.classify({ id: requestId, status: "Draft" }, requestId), "not-confirmed");
  assert.equal(api.classify({ id: requestId, status: "Ready" }, requestId), "not-confirmed");
  assert.equal(api.classify({ id: "recABCDEFGHIJKLMN", status: "Promoted", promoted_content_item_links: [contentId] }, requestId), "unverified");
});

test("500 after persisted promotion readback shows success, navigates once, and never posts", async () => {
  const record = { id: requestId, status: "Promoted", promoted_content_item_links: [contentId] };
  const h = harness(async () => ({ record }));
  const result = await h.api.read(requestId);
  assert.equal(result.disposition, "promoted");
  assert.equal(h.api.show(result, requestId), "promoted");
  assert.deepEqual(h.opened, ["pipeline"]);
  assert.equal(h.context.item4PromotedRequestIds.has(requestId), true);
  assert.equal(h.context.item4PromotionReadbackRequired.has(requestId), false);
  assert.equal(h.state.rendered, "Promoted");
  assert.equal(h.messages.at(-1).tone, "success");
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.method, "GET");
  assert.equal(h.calls[0].options.retries, 0);
});

test("Submitted readback keeps verification fence and never promotes again", async () => {
  const h = harness(async () => ({ record: { id: requestId, status: "Submitted", promoted_content_item_links: [] } }));
  const outcome = await h.api.read(requestId);
  assert.equal(h.api.show(outcome, requestId), "processing");
  assert.equal(h.context.item4PromotionReadbackRequired.has(requestId), true);
  assert.deepEqual(h.opened, []);
  assert.match(h.messages.at(-1).message, /submitted/);
  assert.ok(h.calls.every(c => c.options.method === "GET"));
});

test("Draft/Ready readback does not imply success and does not send another approval", async () => {
  const h = harness(async () => ({ record: { id: requestId, status: "Draft" } }));
  const outcome = await h.api.read(requestId);
  assert.equal(h.api.show(outcome, requestId), "not-confirmed");
  assert.deepEqual(h.opened, []);
  assert.equal(h.context.item4PromotedRequestIds.size, 0);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.method, "GET");
});

test("unavailable readback remains fenced and is never interpreted as success", async () => {
  const h = harness(async () => { throw Object.assign(new Error("upstream unavailable"), { status: 503 }); });
  const outcome = await h.api.read(requestId);
  assert.equal(outcome.disposition, "unverified");
  assert.equal(h.api.show(outcome, requestId), "unverified");
  assert.equal(h.context.item4PromotionReadbackRequired.has(requestId), true);
  assert.deepEqual(h.opened, []);
  assert.match(h.messages.at(-1).message, /could not be verified/);
});

test("the real click path checks uncertain 5xx/timeouts, uses read-only check button, and disables POST retries", () => {
  const click = app.slice(app.indexOf('  $("promoteProductionRequest")?.addEventListener'), app.indexOf('  async function loadProductionRequests(', app.indexOf('  $("promoteProductionRequest")?.addEventListener')));
  assert.match(click, /item4PromotionReadbackRequired\.has\(approvalRequestId\)/);
  assert.match(click, /readProductionApprovalAfterError\(approvalRequestId\)/);
  assert.match(click, /Number\(e\?\.status\) >= 500/);
  assert.match(click, /item4PromotionReadbackRequired\.add\(requestId\)/);
  assert.match(click, /retries: 0, \/\/ Never repeat an ambiguous mutation/);
  assert.match(click, /body: JSON\.stringify\(\{ revision_approve: true \}\)/);
  assert.match(app, /promote\.textContent = "Check approval status"/);
  const checkGate = click.indexOf("if (item4PromotionReadbackRequired.has(approvalRequestId))");
  const post = click.indexOf('const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/promote`');
  assert.ok(checkGate >= 0 && post > checkGate, "readback gate must precede promote POST");
});

test("stale Submitted approval is explicitly identified as stalled rather than successful", async () => {
  const submitted_at = "2025-01-01T00:00:00.000Z";
  const record = {id:requestId,status:"Submitted",submitted_at};
  const h = harness(async () => ({record}));
  assert.equal(h.api.classify(record,requestId),"stalled");
  const outcome=await h.api.read(requestId);
  assert.equal(h.api.show(outcome,requestId),"stalled");
  assert.equal(h.messages.at(-1).tone,"error-text");
  assert.match(h.messages.at(-1).message,/stalled|exceeded/i);
  assert.equal(h.context.item4PromotionReadbackRequired.has(requestId),true);
  assert.ok(h.calls.every(c=>c.options.method==="GET"));
});

test("escalated or blocked job surfaces recovery-required, not still processing", async () => {
  for(const step of ["escalated","blocked"]) {
    const record={id:requestId,status:"Submitted",submitted_at:"2025-01-01T00:00:00.000Z",
      studio_production_job:{step,error:"No Platform Outputs found"}};
    const h=harness(async()=>({record}));
    assert.equal(h.api.classify(record,requestId),"recovery-required");
    const outcome=await h.api.read(requestId);
    assert.equal(h.api.show(outcome,requestId),"recovery-required");
    assert.match(h.messages.at(-1).message,/No Platform Outputs found/);
    assert.equal(h.messages.at(-1).tone,"error-text");
    assert.deepEqual(h.opened,[]);
    assert.ok(h.calls.every(c=>c.options.method==="GET"));
  }
});
