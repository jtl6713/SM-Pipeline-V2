import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "assets/factory-desk.js"), "utf8");
const start = source.indexOf("  async function retryFactoryBatchFailures()");
const end = source.indexOf("  function renderCard(", start);
assert.ok(start >= 0 && end > start, "retry function is present");
const code = source.slice(start, end);

function harness({ completedOpen, inspectedBatchKey, active, completed }) {
  const calls = [];
  const state = {
    batch: active, completedBatch: completed, completedOpen,
    inspectedBatchKey, submittingBatch: false,
  };
  const context = {
    state,
    fetchJson: async (url, options) => {
      calls.push({url, payload: JSON.parse(options.body)});
      return {job_id:"group-failed",message:"Retry started"};
    },
    setStatus: message => calls.push({message}),
    refreshFactoryBatchActivity: async () => {},
    updateFactoryBatchToolbar: () => {},
  };
  const retry = vm.runInNewContext(code + "\nretryFactoryBatchFailures", context);
  return {retry,state,calls};
}

const pending = {job_id:"group-pending",request_id:"pending",group:true,can_retry:false};
const failed = {job_id:"group-failed",request_id:"failed",group:true,can_retry:true,failed_count:1};
test("Retry Failed uses the displayed selected completed batch, not active first row", async () => {
  const h = harness({completedOpen:true,inspectedBatchKey:"group-failed",
    active:{batches:[pending]},completed:{batches:[failed]}});
  await h.retry();
  assert.equal(h.calls.filter(x=>x.payload).length,1);
  assert.equal(h.calls.find(x=>x.payload).payload.request_id,"failed");
  assert.equal(h.calls.find(x=>x.payload).payload.action,"retry_group");
});

test("Retry Failed does not accidentally resubmit another batch", async () => {
  const h = harness({completedOpen:false,inspectedBatchKey:"group-pending",
    active:{batches:[pending,failed]},completed:{batches:[]}});
  await h.retry();
  assert.equal(h.calls.filter(x=>x.payload).length,0);
  assert.match(h.calls.find(x=>x.message).message,/Select the batch/);
});

test("Retry Failed with no explicit selection uses the visible first row", async () => {
  const h = harness({completedOpen:false,inspectedBatchKey:"",
    active:{batches:[failed,pending]},completed:{batches:[]}});
  await h.retry();
  assert.equal(h.calls.find(x=>x.payload).payload.request_id,"failed");
});
