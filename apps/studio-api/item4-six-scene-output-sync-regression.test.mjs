import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { reconcileApprovedStoryFirstSourcePlan } from "./story-first-production-plan-integrity.mjs";

// Exercise three real extracted Worker functions with a Supabase Phase6 sparse
// PATCH echo. Never call live databases, media providers or publishers.
const sourceOne = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const sourceTwo = fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
function extract(source, name) {
  const start = source.indexOf("export async function " + name + "(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", start);
  assert.ok(start >= 0 && end > start, "missing extracted Worker function: " + name);
  return "(" + source.slice(start, end).trim().replace(/^export /, "") + ")";
}

const requestId = "rec0t4shEtd72MeD8";
const destinations = [
  ["Instagram", "Reel"], ["Instagram", "Story"],
  ["Facebook", "Reel"], ["Facebook", "Story"],
  ["TikTok", "Video Draft"], ["YouTube", "Short"],
];
const masters = Array.from({length: 6}, (_, index) => ({
  id: "asset-" + (index + 1), order: index + 1,
  media_asset_record_id: "rec" + String(index + 1).padStart(14, "0"),
  google_drive_file_id: "original-drive-" + (index + 1),
  mime_type: index === 3 ? "video/mp4" : "image/jpeg",
  media_kind: index === 3 ? "video" : "photo",
}));
const storyboard = {
  schema: "story-first-production.1",
  scenes: masters.map((master) => ({asset_id: master.media_asset_record_id})),
};
const notes = "[story-first-production.1] " + JSON.stringify(storyboard);
const planFor = (count) => ({
  schema_version: "item4.output-plan.1",
  production_request_record_id: requestId,
  source_asset_count: count,
  photo_count_kind: count <= 1 ? "single-photo" : "multiple-photos",
  items: destinations.map(([platform, output_type]) => ({
    platform, output_type, aspect_ratio: "9:16", source_asset_count: count,
    companion: output_type === "Story",
  })),
});
const ratioList = plan => [...new Set((plan?.items || []).map(x => x.aspect_ratio))];

function setup({persistedCount = 6, sourceMismatch = false, dropReadback = false} = {}) {
  const state = {
    masters: structuredClone(masters), plan: planFor(persistedCount),
    targetPlatforms: ["Instagram", "Facebook", "TikTok"],
    variantStatus: "Ready",
    manifest: {complete: true, plan_complete: true, ready_count: 7,
      target_count: 7, plan_ready_count: 6, plan_target_count: 6},
  };
  if (sourceMismatch) state.masters[3].media_asset_record_id = "recChangedSource1";
  const stats = {fullReads: 0, authorizedReads: 0, parentPatches: 0,
    planWrites: 0, queueWrites: 0, createdVariants: 0, publishCalls: 0};
  const outputRows = destinations.map(([platform, output_type], index) => ({
    id: "rec" + String(1000 + index).padStart(14, "0"),
    fields: {Platform: platform, Output_Type: output_type, Output_Order: index + 1,
      Enabled: true, Active: true, Output_Status: "Draft", Scheduled_At: ""},
  }));

  function record() {
    return {id: requestId, fields: {
      Studio_Master_Assets_JSON: JSON.stringify(state.masters),
      Studio_Output_Plan_JSON: JSON.stringify(state.plan),
      Studio_Output_Plan_Status: "Ready",
      Studio_Master_Asset_Status: "Ready",
      Studio_Variant_Status: state.variantStatus,
      Studio_Variant_Manifest_JSON: JSON.stringify(state.manifest),
      Production_Notes: notes,
      Request_Status: "Draft",
      Target_Platforms: state.targetPlatforms,
    }};
  }
  const parse = (value, fallback) => {
    try {return typeof value === "string" ? JSON.parse(value) : (value ?? fallback);}
    catch {return fallback;}
  };
  const f = (row, field) => row?.fields?.[field];
  class HttpError extends Error {
    constructor(status, message) {super(message); this.status = status;}
  }
  const context = {
    HttpError, f, ITEM4_DRAIN_POST_BUDGET_MS: 8000,
    studioPhase6WriteSource: () => "supabase",
    PRODUCTION_REQUEST_TABLE: "Production Requests",
    PRODUCTION_REQUEST_OUTPUT_TABLE: "Production Request Outputs",
    airtableFetch: async (_env, _table, _id, options = {}) => {
      if (options.method === "PATCH") {
        stats.parentPatches++;
        const fields = JSON.parse(options.body).fields;
        if (fields.Target_Platforms) state.targetPlatforms = fields.Target_Platforms;
        // Phase6 mutation echoes changed fields only.
        return {id: requestId, fields};
      }
      stats.fullReads++;
      return dropReadback ? {id: requestId, fields: {}} : record();
    },
    loadAuthorizedProductionRequest: async () => {
      stats.authorizedReads++;
      return dropReadback ? {id: requestId, fields: {}} : record();
    },
    assertEditableProductionRequest: () => {},
    item4AssetManifest: row => parse(f(row, "Studio_Master_Assets_JSON"), []),
    item4ParseJson: parse,
    item4EffectivePhotoCount: (_row, assets) => assets.length,
    item4PlanHasVideo: (_row, assets) => assets.some(x => x.mime_type === "video/mp4"),
    item4MappingIndex: async () => new Map(),
    item4CanonicalOutputType: (_platform, type) => type,
    item4DefaultOutputType: () => "Reel",
    item4IsUnsupportedCompanion: () => false,
    item4IsNativeStillOutput: () => false,
    item4IsCompanionOutputType: type => type === "Story",
    ITEM4_PLAN_SPECS: Object.fromEntries(
      [...new Set(destinations.map(x => x[0]))].map(platform =>
        [platform, {options: Object.fromEntries(
          destinations.filter(x => x[0] === platform).map(x => [x[1], {}]))}])),
    item4BridgePlanKey: (platform, type) => platform + "::" + type,
    item4PlanChoice: (_platform, type) => ({output_type: type, mapping_type: type, format: "Video"}),
    item4PlanItemFromChoice: (platform, chosen, count, _map, {companion} = {}) => ({
      platform, output_type: chosen.output_type, aspect_ratio: "9:16",
      source_asset_count: count, companion: Boolean(companion),
    }),
    item4RequiredRatios: ratioList,
    item4PhotoCountKind: count => count <= 1 ? "single-photo" : "multiple-photos",
    reconcileApprovedStoryFirstSourcePlan,
    item4UpdateRequestState: async (_env, _id, fields) => {
      if (fields.Studio_Output_Plan_JSON) {
        stats.planWrites++; state.plan = JSON.parse(fields.Studio_Output_Plan_JSON);
      }
      if (fields.Studio_Variant_Status) state.variantStatus = fields.Studio_Variant_Status;
      return {id: requestId, fields};
    },
    item4FramePrepareStage: async (_name, callback) => callback(),
    item4MergeAssetCrops: (assets) => assets,
    item4ReconcileMasterAuthority: async () => ({
      record: record(), assets: structuredClone(state.masters),
    }),
    item4LooksLikeVideoAsset: asset => asset.mime_type === "video/mp4",
    item4RequiredRatios: plan => [...ratioList(plan), "16:9"],
    outputRowsForProductionRequest: async () => outputRows,
    item4UpsertVariantQueue: async (_env, id, assets, ratios) => {
      assert.equal(id, requestId);
      assert.equal(assets.length, 6);
      assert.equal(assets.filter(x => x.mime_type === "video/mp4").length, 1);
      assert.deepEqual([...ratios], ["9:16", "16:9"]);
      stats.queueWrites++;
      return Array.from({length: 6}, (_, i) => ({transfer_id: "test-variant-" + i}));
    },
    item4VariantQueueRows: async () =>
      Array.from({length: 6}, (_, i) => ({fields: {Transfer_ID: "test-variant-" + i}})),
    item4ReconcileVariants: async () => {
      state.variantStatus = "Ready";
      return {status: "Ready", record: record(), manifest: state.manifest};
    },
    item4DrainPreviewCacheWorker: async () => {},
    item4DrainVariantWorker: async () => [],
    item4UpsertMasterQueue: async () => {
      throw Error("complete masters must never be restaged");
    },
    item4SyncPlanOutputs: async () => {},
    productionRequestIdFromOutputsPath: () => requestId,
    studioScheduleOverridesFromPayload: () => new Map(),
    normalizeOutputType: (platform, output_type) => ({platform, output_type}),
    studioFinishedOriginKind: () => "",
    uniquePlanItems: rows => rows,
    item4CollapseDuplicatePlanOutputs: async () => {},
    studioLoadPlanScheduleOccupancy: async () => ({}),
    item4ProductionProfileRecord: async () => null,
    studioScheduleTimeZoneForRecord: async () => "America/New_York",
    studioBuildSuggestedScheduleMap: () => new Map(),
    studioDestinationScheduleStamp: () => null,
    item4CompanionStoryFields: () => ({}),
    airtableBatchUpdate: async () => {},
    airtableBatchCreate: async () => {throw Error("all six destinations already exist");},
    studioMirrorPlanScheduleRows: async () => {},
    arrayOrEmpty: x => Array.isArray(x) ? x : [],
    mapProductionRequest: row => ({id: row.id, plan: parse(f(row, "Studio_Output_Plan_JSON"), null)}),
    mapProductionRequestOutput: row => ({id: row.id}),
    respond: (_req, _env, body) => body,
    item4RelinkVariantQueueOutputs: async (_env, row) => row,
  };
  const reconcile = vm.runInNewContext(extract(sourceOne, "item4ReconcilePlanWithEnabledOutputs"), context);
  context.item4ReconcilePlanWithEnabledOutputs = reconcile;
  const sync = vm.runInNewContext(extract(sourceOne, "syncProductionRequestOutputs"), context);
  const prepare = vm.runInNewContext(extract(sourceTwo, "runItem4VariantPrepareCore"), context);
  const selected = destinations.map(([platform, output_type]) => ({platform, output_type, enabled: true}));
  const auth = {organization: {record_id: "recOrg00000000001"}};
  return {state, stats, record, reconcile, sync: () =>
    sync({json: async () => ({outputs: selected})}, {}, new URL("https://studio.example/api/test"), auth),
    prepare: () => prepare({}, requestId, auth, {cropsPayload: {}, allowBackground: false}),
  };
}

test("six-scene save -> actual Prepare core -> reopen keeps all six sources and original Scene 4 video", async () => {
  const h = setup();
  const initialIds = h.state.masters.map(x => [x.media_asset_record_id, x.google_drive_file_id]);
  const saved = await h.sync(); // Platform change causes a sparse parent PATCH.
  assert.equal(saved.synchronized, true);
  assert.equal(h.stats.parentPatches, 1);
  assert.equal(h.stats.authorizedReads, 2, "re-read authorized request after partial PATCH");
  assert.equal(saved.production_request.plan.source_asset_count, 6);
  const prepared = await h.prepare(); // Hermetic: six 9:16/16:9 jobs mocked only.
  assert.equal(prepared.reconciled.status, "Ready");
  assert.equal(h.stats.queueWrites, 1);
  const reopened = h.record();
  const plan = JSON.parse(reopened.fields.Studio_Output_Plan_JSON);
  assert.equal(plan.source_asset_count, 6);
  assert.equal(plan.photo_count_kind, "multiple-photos");
  assert.deepEqual(plan.items.map(x => x.source_asset_count), [6,6,6,6,6,6]);
  assert.deepEqual(h.state.masters.map(x => [x.media_asset_record_id, x.google_drive_file_id]), initialIds);
  assert.equal(h.state.masters[3].mime_type, "video/mp4");
  assert.equal(h.state.variantStatus, "Ready");
  assert.equal(h.stats.publishCalls, 0);
});

test("sparse Phase6 parent echo cannot rebuild complete six-scene Ready plan as one source", async () => {
  const h = setup();
  const out = await h.reconcile({}, {id: requestId, fields: {
    Target_Platforms: ["Instagram", "Facebook", "TikTok", "YouTube"],
  }}, destinations.map(([platform, output_type]) => ({platform, output_type})));
  assert.equal(JSON.parse(out.fields.Studio_Output_Plan_JSON).source_asset_count, 6);
  assert.equal(h.stats.fullReads >= 1, true);
  assert.equal(h.stats.planWrites, 0, "already correct plan is not regenerated");
});

test("stale one-source metadata corrects without resetting Ready frames or selected destinations", async () => {
  const h = setup({persistedCount: 1});
  const out = await h.reconcile({}, h.record(),
    destinations.map(([platform, output_type]) => ({platform, output_type})));
  const plan = JSON.parse(out.fields.Studio_Output_Plan_JSON);
  assert.equal(plan.source_asset_count, 6);
  assert.deepEqual(plan.items.map(x => x.source_asset_count), [6,6,6,6,6,6]);
  assert.deepEqual(plan.items.map(x => [x.platform, x.output_type, x.aspect_ratio]),
    destinations.map(([p,t]) => [p,t,"9:16"]));
  assert.equal(h.stats.planWrites, 1);
  assert.equal(h.state.variantStatus, "Ready");
  assert.equal(h.state.manifest.ready_count, 7);
  assert.equal(h.stats.queueWrites, 0);
});

test("approved storyboard identity mismatch rejects output sync before modifying frames", async () => {
  const h = setup({sourceMismatch: true});
  await assert.rejects(h.reconcile({}, h.record(),
      destinations.map(([platform, output_type]) => ({platform, output_type}))),
    err => err.status === 409 && /master IDs or order changed/.test(err.message));
  assert.equal(h.stats.planWrites, 0);
  assert.equal(h.stats.queueWrites, 0);
});

test("unverifiable Supabase readback fails closed rather than treating zero sources as one", async () => {
  const h = setup({dropReadback: true});
  await assert.rejects(h.reconcile({}, {id: requestId, fields: {Target_Platforms: ["Instagram"]}},
      destinations.map(([platform, output_type]) => ({platform, output_type}))),
    err => err.status === 503 && /complete source inventory/.test(err.message));
  assert.equal(h.stats.planWrites, 0);
});

test("plan builders guard approved story inventory before any output-plan write", () => {
  const build = sourceOne.slice(sourceOne.indexOf("export async function buildItem4OutputPlan("),
    sourceOne.indexOf("/*__STUDIO_WORKER_END:buildItem4OutputPlan__*/"));
  assert.match(build, /reconcileApprovedStoryFirstSourcePlan\(/);
  assert.ok(build.indexOf("reconcileApprovedStoryFirstSourcePlan(") <
    build.indexOf("await item4SyncPlanOutputs("));
});
