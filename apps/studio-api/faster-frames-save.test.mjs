import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const app = fs.readFileSync(
  path.join(here, "../studio-web/assets/app-item4-0625.js"),
  "utf8"
);

test("health advertises current worker build with faster-frames helpers", () => {
  assert.match(worker, /version: "0.10.428-ig-carousel-and-native-approve"/);
  assert.match(worker, /airtableBatchCreate/);
  assert.match(worker, /mapProductionRequestLight/);
});

test("variant queue upserts use Airtable batch helpers", () => {
  const upsert = worker.slice(
    worker.indexOf("async function item4UpsertVariantQueue"),
    worker.indexOf("function item4Smv1FormulaQuoted")
  );
  assert.match(upsert, /airtableBatchUpdate/);
  assert.match(upsert, /airtableBatchCreate/);
  assert.doesNotMatch(
    upsert,
    /await airtableFetch\(env, ITEM4_VARIANT_QUEUE_TABLE, current\.id/
  );
});

test("variant reconcile heals and sanitizes in parallel batches", () => {
  const reconcile = worker.slice(
    worker.indexOf("async function item4ReconcileVariants"),
    worker.indexOf("async function runItem4VariantPrepareCore")
  );
  assert.match(reconcile, /authorityHeals/);
  assert.match(reconcile, /previewBackfills/);
  assert.match(reconcile, /airtableBatchUpdate/);
  assert.match(reconcile, /mapPool\(mediaAssetIds, 8/);
});

test("prepare returns after a short sync pulse and defers preview cache", () => {
  const prepare = worker.slice(
    worker.indexOf("async function runItem4VariantPrepareCore"),
    worker.indexOf("async function ensureItem4VariantsReadyForPromotion")
  );
  assert.match(prepare, /Math\.min\(Number\(syncBudgetMs\) \|\| 0, 8000\)/);
  assert.match(prepare, /Preview CDN copies must not block Ready/);
  assert.match(prepare, /ctx\.waitUntil\(previewWork\(\)\)/);
});

test("promote skips re-prepare when variants are already Ready", () => {
  const ensure = worker.slice(
    worker.indexOf("async function ensureItem4VariantsReadyForPromotion"),
    worker.indexOf("async function prepareItem4Variants")
  );
  assert.match(ensure, /variantStatus === "Ready" \|\| variantStatus === "Not Needed"/);
});

test("output sync no longer refetches rows inside the destination loop", () => {
  const sync = worker.slice(
    worker.indexOf("async function syncProductionRequestOutputs"),
    worker.indexOf("function cleanProductionRequestOutputPatch")
  );
  assert.match(sync, /airtableBatchUpdate/);
  assert.match(sync, /airtableBatchCreate/);
  assert.match(sync, /destinationsChanged/);
  assert.doesNotMatch(
    sync,
    /for \(let i = 0; i < planItems\.length; i\+\+\) \{\s*const item = planItems\[i\];[\s\S]*existing = await outputRowsForProductionRequest/
  );
});

test("plan output sync batches writes without per-item refetch", () => {
  const sync = worker.slice(
    worker.indexOf("async function item4SyncPlanOutputs"),
    worker.indexOf("async function buildItem4OutputPlan")
  );
  assert.match(sync, /airtableBatchUpdate/);
  assert.match(sync, /airtableBatchCreate/);
  assert.doesNotMatch(
    sync,
    /for \(let i=0; i<uniqueItems\.length; i\+\+\) \{[\s\S]*existing = await outputRowsForProductionRequest/
  );
});

test("manual promote waits fewer I3/I4 polls and defers fanout", () => {
  const promote = worker.slice(
    worker.indexOf("async function promoteProductionRequestViaI3I4"),
    worker.indexOf("const STUDIO_PROMOTION_CONTENT_TYPES")
  );
  assert.match(promote, /autonomousSubmit \? 24 : 3/);
  assert.match(promote, /autonomous \? 24 : 3/);
  assert.match(promote, /finalizeProductionRequestPromotion\(env, requestRecordId, ideaRecord, ctx\)/);

  const finalize = worker.slice(
    worker.indexOf("async function finalizeProductionRequestPromotion"),
    worker.indexOf("function item4StaleMediaRunClears")
  );
  assert.match(finalize, /completeProductionRequestPromotionSideEffects/);
  assert.match(finalize, /routingOnly: true/);
  assert.match(finalize, /ctx\.waitUntil\(continuation\)/);
  assert.match(finalize, /Studio promote post-routing side-effects deferred/);
});

test("PATCH save can return a light production request payload", () => {
  assert.match(worker, /function mapProductionRequestLight/);
  const update = worker.slice(
    worker.indexOf("async function updateProductionRequest"),
    worker.indexOf("function productionRequestBridgeRecordIdFromPath")
  );
  assert.match(update, /payload\?\.light === true/);
  assert.match(update, /mapProductionRequestLight\(updated\)/);
});

test("UI polls GET /variants during Prepare and skips Save reload waterfall", () => {
  assert.match(app, /BUILD_ID = "item4-0.6.442-home-refresh-inflight"/);
  assert.match(app, /pollItem4Variants/);
  const poll = app.slice(
    app.indexOf("async function pollItem4Variants"),
    app.indexOf("function startItem4VariantPolling")
  );
  assert.match(poll, /\/variants/);
  assert.doesNotMatch(poll, /await loadItem4Workspace\(activeProductionRequest\);\s*const state/);

  const saveStart = app.indexOf("async function saveActiveProductionRequest");
  const save = app.slice(saveStart, saveStart + 2200);
  assert.match(save, /light: true/);
  assert.match(save, /mergeProductionRequestRecord/);
  assert.doesNotMatch(save, /await loadItem4Workspace\(activeProductionRequest\);/);
  assert.doesNotMatch(save, /await loadProductionRequests\(\);/);
});
