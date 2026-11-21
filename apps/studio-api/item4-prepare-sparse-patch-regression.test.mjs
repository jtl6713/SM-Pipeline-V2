import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

// Exercise the actual Worker core with Phase6-style partial PATCH echoes.
// The live NYC six-source request reached this route but failed the plan guard
// after its crop PATCH even though Supabase had a Ready output plan.
const source = fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const begin = source.indexOf("export async function runItem4VariantPrepareCore(");
const end = source.indexOf("/*__STUDIO_WORKER_END:runItem4VariantPrepareCore__*/", begin);
assert.ok(begin >= 0 && end > begin, "real frame preparation core must be extractable");

const requestId = "rec0t4shEtd72MeD8";
const savedMasters = Array.from({length: 6}, (_, i) => ({
  id: "master-" + (i + 1),
  order: i + 1,
  media_asset_record_id: "rec" + String(i + 1).padStart(14, "0"),
  google_drive_file_id: "drive-" + (i + 1),
  mime_type: i === 3 ? "video/mp4" : "image/jpeg",
  media_kind: i === 3 ? "video" : "photo",
  crops: {},
}));
const destinations = [
  ["Instagram", "Reel"], ["Instagram", "Story"],
  ["Facebook", "Reel"], ["Facebook", "Story"],
  ["TikTok", "Video Draft"], ["YouTube", "Short"],
];
const savedPlan = {
  schema_version: "item4.output-plan.1", source_asset_count: 6,
  photo_count_kind: "multiple-photos",
  items: destinations.map(([platform, output_type]) => ({
    platform, output_type, aspect_ratio: "9:16", source_asset_count: 6,
  })),
};

function buildHarness({withCrops = true, stalePlan = false, mutateMaster = false, ignorePlanSave = false} = {}) {
  const state = {
    masters: structuredClone(savedMasters),
    plan: structuredClone(savedPlan),
    variantStatus: "None",
  };
  if (stalePlan) {
    state.plan.source_asset_count = 1;
    state.plan.photo_count_kind = "single-photo";
    state.plan.items.forEach(item => item.source_asset_count = 1);
  }
  const stats = {reads: 0, cropWrites: 0, planWrites: 0, checkpointWrites: 0,
    queueWrites: 0, reconciledFullRecord: false};
  function fullRecord() {
    return {id: requestId, fields: {
      Studio_Master_Assets_JSON: JSON.stringify(state.masters),
      Studio_Output_Plan_JSON: JSON.stringify(state.plan),
      Studio_Output_Plan_Status: "Ready",
      Studio_Master_Asset_Status: "Ready",
      Studio_Variant_Status: state.variantStatus,
      Production_Notes: "[story-first-production.1] accepted",
    }};
  }
  const HttpError = class HttpError extends Error {
    constructor(status, message) {super(message);this.status = status;}
  };
  const ctx = {
    ITEM4_DRAIN_POST_BUDGET_MS: 8000,
    HttpError,
    f: (record, field) => record?.fields?.[field],
    item4ParseJson: (value, fallback) => {
      try {return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);}
      catch {return fallback;}
    },
    item4AssetManifest: record => JSON.parse(record?.fields?.Studio_Master_Assets_JSON || "[]"),
    item4MergeAssetCrops: (assets, crops) => assets.map(asset =>
      crops?.[asset.id] ? {...asset, crops: {...asset.crops, ...crops[asset.id]}} : asset),
    loadAuthorizedProductionRequest: async () => {stats.reads++;return fullRecord();},
    item4UpdateRequestState: async (_env, _id, fields) => {
      if (fields.Studio_Master_Assets_JSON) {
        stats.cropWrites++;
        state.masters = JSON.parse(fields.Studio_Master_Assets_JSON);
        if (mutateMaster) state.masters[3].media_asset_record_id = "recChangedIdentity0";
      }
      if (fields.Studio_Output_Plan_JSON) {
        stats.planWrites++;
        if (!ignorePlanSave) state.plan = JSON.parse(fields.Studio_Output_Plan_JSON);
      }
      if (fields.Studio_Variant_Status) {
        stats.checkpointWrites++;
        state.variantStatus = fields.Studio_Variant_Status;
      }
      // This is intentionally sparse, reproducing Phase6 patch return semantics.
      return {id: requestId, fields};
    },
    item4FramePrepareStage: async (_stage, task) => task(),
    reconcileApprovedStoryFirstSourcePlan: (_notes, assets, plan) => {
      if (Number(plan?.source_asset_count) === assets.length &&
          plan.items.every(item => Number(item.source_asset_count) === assets.length)) {
        return {kind: "ready", plan, count: assets.length};
      }
      const count = assets.length;
      return {kind: "repair", plan: {...plan, source_asset_count: count,
        photo_count_kind: "multiple-photos",
        items: plan.items.map(item => ({...item, source_asset_count: count}))}, count};
    },
    item4RequiredRatios: () => ["9:16"],
    item4ReconcileMasterAuthority: async () => ({
      record: fullRecord(), assets: structuredClone(state.masters),
    }),
    item4LooksLikeVideoAsset: asset => asset.mime_type === "video/mp4",
    outputRowsForProductionRequest: async () => destinations.map(([platform, type], i) => ({
      id: "pro-" + i, fields: {Platform: platform, Output_Type: type,
        Aspect_Ratio: "9:16", Active: true},
    })),
    item4UpsertVariantQueue: async (_env, _requestId, assets) => {
      stats.queueWrites++;
      assert.equal(assets.length, 6);
      assert.equal(assets.filter(x => x.mime_type === "video/mp4").length, 1);
      return [{transfer_id:"test-frame-1"}];
    },
    item4VariantQueueRows: async () => [{fields: {Transfer_ID: "test-frame-1"}}],
    item4ReconcileVariants: async (_env, _id, record) => {
      stats.reconciledFullRecord = Boolean(
        record?.fields?.Studio_Output_Plan_JSON &&
        record?.fields?.Studio_Master_Assets_JSON &&
        record?.fields?.Studio_Output_Plan_Status === "Ready");
      return {status: "Error", record, manifest: {target_count: 5, ready_count: 0}};
    },
  };
  const fn = vm.runInNewContext(
    "(" + source.slice(begin, end).trim().replace(/^export /, "") + ")", ctx);
  const cropsPayload = withCrops ? {
    "master-1": {"9:16": {x: 0.7, y: 0.4}},
  } : {};
  return {run: () => fn({}, requestId, {}, {cropsPayload, allowBackground: false}),
    stats, state};
}

test("NYC six-scene crop PATCH echo cannot erase the plan used by Prepare", async () => {
  const x = buildHarness();
  const result = await x.run();
  assert.equal(result.expected.length, 1);
  assert.equal(x.stats.cropWrites, 1);
  assert.equal(x.stats.reads >= 3, true, "initial + crop reload + checkpoint reload");
  assert.equal(x.stats.queueWrites, 1);
  assert.equal(x.stats.reconciledFullRecord, true);
  assert.equal(x.state.plan.items.length, 6);
  assert.equal(x.state.masters[3].mime_type, "video/mp4");
});
test("no-crop Prepare does not need a crop PATCH or false plan rebuild", async () => {
  const x = buildHarness({withCrops:false});
  await x.run();
  assert.equal(x.stats.cropWrites, 0);
  assert.equal(x.stats.queueWrites, 1);
  assert.equal(x.stats.reconciledFullRecord, true);
});
test("full reload fails closed if crop save changes a source identity", async () => {
  const x = buildHarness({mutateMaster:true});
  await assert.rejects(() => x.run(), err =>
    err.status === 409 && /Master source identities changed/.test(err.message));
  assert.equal(x.stats.queueWrites, 0);
  assert.equal(x.stats.checkpointWrites, 0);
});
test("stale six-scene plan repair reloads the complete request, not PATCH echo", async () => {
  const x = buildHarness({stalePlan:true});
  await x.run();
  assert.equal(x.stats.planWrites, 1);
  assert.equal(x.state.plan.source_asset_count, 6);
  assert.equal(x.stats.reconciledFullRecord, true);
  assert.equal(x.stats.queueWrites, 1);
});
test("unpersisted approved plan repair blocks queue creation", async () => {
  const x = buildHarness({stalePlan:true, ignorePlanSave:true});
  await assert.rejects(() => x.run(), err =>
    err.status === 409 && /could not be verified after saving/.test(err.message));
  assert.equal(x.stats.queueWrites, 0);
});
