import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const moduleSource = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const entrySource = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const start = moduleSource.indexOf("export async function finalizeProductionRequestPromotion(");
const end = moduleSource.indexOf("/*__STUDIO_WORKER_END:finalizeProductionRequestPromotion__*/", start);
assert.ok(start >= 0 && end > start, "production promotion finalizer should be extracted");
const finalizeSource = moduleSource.slice(start, end).replace(/^export /, "");

function harness({ writeFails = false, cleanupFails = false } = {}) {
  const requestId = "recREQUEST00000001";
  const contentId = "recCONTENT00000001";
  const events = [];
  const warnings = [];
  const waiters = [];
  let resolveCleanup;
  let rejectCleanup;
  const cleanup = new Promise((resolve, reject) => {
    resolveCleanup = resolve;
    rejectCleanup = reject;
  });
  const result = { enabled_output_count: 6, routed_count: 6, blocked_count: 0, remaining: 0 };
  const context = {
    Date, Number, Boolean,
    console: {
      info: (...args) => events.push(args),
      warn: (...args) => warnings.push(args),
    },
    linkedContentItemRecordId: () => contentId,
    promotedContentOwner: () => null,
    PRODUCTION_REQUEST_TABLE: "request_table",
    airtableFetch: async (_env, table, id) => ({
      id,
      fields: table === "content_table"
        ? { Production_Request: [requestId] }
        : { Request_Status: "Submitted", Production_Notes: "" },
    }),
    f: (record, field) => record?.fields?.[field],
    completeProductionRequestPromotionSideEffects: async (_env, _id, record, _contentId, options) => ({
      requestRecord: record,
      directiveBridge: {},
      outputFanout: options.routingOnly ? result : options.outputFanout,
    }),
    assertProductionRequestFanoutComplete: data => {
      assert.equal(data?.routed_count, 6);
    },
    productionRequestRevisionOpen: () => false,
    updateProductionRequestPromotionState: async (_env, id, fields) => {
      events.push(["airtable_write", fields.Request_Status]);
      if (writeFails) throw new Error("Airtable write failed");
      return { id, fields: { Request_Status: fields.Request_Status, Production_Notes: "" } };
    },
    cancelSiblingProductionRequestsForIdea: () => cleanupFails ? Promise.reject(new Error("sibling unavailable")) : cleanup,
  };
  const finalize = vm.runInNewContext(finalizeSource + "\nfinalizeProductionRequestPromotion", context);
  return {
    requestId,
    events,
    warnings,
    waiters,
    finalize,
    release: (ids = []) => resolveCleanup(ids),
    reject: error => rejectCleanup(error),
    env: { AIRTABLE_CONTENT_TABLE_ID: "content_table" },
    ctx: { waitUntil: promise => waiters.push(promise) },
  };
}

test("successful durable promotion returns before pending sibling cleanup; no additional fanout", async () => {
  const h = harness();
  const output = await h.finalize(h.env, h.requestId, { id: "recIDEA0000000001" }, h.ctx);
  assert.equal(output.requestRecord.fields.Request_Status, "Promoted");
  assert.equal(output.contentItemId, "recCONTENT00000001");
  assert.equal(output.sibling_cleanup_deferred, true);
  assert.equal(output.cancelled_sibling_request_ids.length, 0);
  assert.ok(h.events.find(args => args[0] === "airtable_write" && args[1] === "Promoted"));
  assert.ok(h.events.find(args => args[0] === "studio_production_promotion_stage" && args[1]?.stage === "response_ready"));
  assert.equal(h.waiters.length, 2, "media continuation and sibling cleanup run via waitUntil");
  h.release(["recSIBLING0000001"]);
  await Promise.all(h.waiters);
  assert.ok(h.events.find(args => args[0] === "studio_production_promotion_stage" && args[1]?.stage === "sibling_cleanup_complete"));
});

test("sibling cleanup rejection after Promoted does not fail HTTP finalization", async () => {
  const h = harness({ cleanupFails: true });
  const output = await h.finalize(h.env, h.requestId, {}, h.ctx);
  assert.equal(output.requestRecord.fields.Request_Status, "Promoted");
  await Promise.all(h.waiters);
  assert.ok(h.warnings.some(args => String(args[0]).includes("sibling sweep failed")));
});

test("without execution context the finalizer still awaits sibling cancellation", async () => {
  const h = harness();
  let finished = false;
  const operation = h.finalize(h.env, h.requestId, {}, null).then(result => {
    finished = true;
    return result;
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(finished, false);
  h.release(["recSIBLING0000001"]);
  const result = await operation;
  assert.equal(result.sibling_cleanup_deferred, false);
  assert.equal(result.cancelled_sibling_request_ids[0], "recSIBLING0000001");
});

test("a failed Airtable Promoted write remains an error; no success is fabricated", async () => {
  const h = harness({ writeFails: true });
  await assert.rejects(h.finalize(h.env, h.requestId, {}, h.ctx), /Airtable write failed/);
  assert.equal(h.waiters.length, 0);
  h.release();
});

test("HTTP handler protects persisted success from best-effort continuation registration failure", () => {
  assert.match(entrySource, /response = await promoteProductionRequestViaI3I4/);
  assert.match(entrySource, /studio_production_promotion_http_error/);
  assert.match(entrySource, /Studio production continuation registration failed after promotion/);
  assert.match(entrySource, /0\.10\.\d+(?:-[\w.-]+)?/);
  assert.match(moduleSource, /output_routing_verified/);
  assert.match(moduleSource, /promoted_write_complete/);
});
