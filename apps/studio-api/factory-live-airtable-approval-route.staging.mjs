/**
 * Write-enabled Factory approval-route staging acceptance.
 *
 * The real factoryBatchSubmitRoute -> factoryBatchProcess -> factoryApproveOutput
 * -> approveOutputRecordForPublishing code is extracted from the current Worker
 * source. Airtable fetch/PATCH/DELETE operations hit ONLY a token-scoped,
 * independently created STAGING base. External publishing/Supabase transports
 * are replaced with counters, with no credentials/bindings provided for them.
 *
 * Run only in the restricted trusted release-branch staging GitHub workflow.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import { randomUUID } from "node:crypto";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import {
  factoryBatchEnqueue, factoryBatchDrain, factoryBatchRead, factoryBatchList,
  factoryBatchSummary, factoryBatchRetry, factoryBatchQualitySignals,
} from "./factory-approval-queue.mjs";
import { withOutputApprovalLock } from "./output-approval-lease.mjs";
import {
  maeNormalizeTimeZone, maeScheduleNextSlot, maeScheduleLaneKey,
  maeScheduleConflicts, maeIsBlackoutLocalTime, maeIsPriorityLocalTime,
  maeAdvancePastBlackout, maePickBalancedSuggestedIso, maeNextOpenScheduleIso,
  MAE_SUGGEST_HORIZON_DAYS, MAE_PRIORITY_SCHEDULE_WINDOWS, MAE_SCHEDULE_GAP_MS,
} from "./mae-schedule.mjs";

const BASE = "appJ0ox62OMfZuE1v";
const PROFILE = "rect1wQB9BeUSEimn";
const CONTENT = "recd6FckgjjFxMQTo";
const OUTPUTS = "tbl5sA6Mwiz9pGNOi";
const CONTENTS = "tblszaHkgn51wajDV";
const PROFILES = "tbllz6Y0mvMTgPYup";
const TIMEZONE = "America/Los_Angeles";
const TOKEN = process.env.STAGING_AIRTABLE_API_TOKEN;
assert.ok(TOKEN && TOKEN.startsWith("pat"), "STAGING_AIRTABLE_API_TOKEN missing; test must fail closed");
assert.equal(BASE, "appJ0ox62OMfZuE1v");
for (const key of Object.keys(process.env)) {
  assert.ok(!/^(AIRTABLE_API_KEY|META_ACCESS_TOKEN|TIKTOK_ACCESS_TOKEN|YOUTUBE_REFRESH_TOKEN|SUPABASE_SERVICE_ROLE_KEY)$/.test(key),
    "Production transport credential visible to staging test: " + key);
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
let stageWrites = 0;
async function airtable(method, tableId, recordId = "", body = null) {
  assert.ok([OUTPUTS, CONTENTS, PROFILES].includes(tableId), "unexpected staging table");
  assert.ok(!recordId || /^rec[A-Za-z0-9]+$/.test(recordId), "invalid staging record");
  const url = "https://api.airtable.com/v0/" + BASE + "/" + tableId + (recordId ? "/" + recordId : "");
  for (let attempt = 0; attempt < 8; attempt++) {
    const response = await fetch(url, {
      method, headers: {
        Authorization: "Bearer " + TOKEN,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (response.status === 429 || response.status >= 500) {
      if (attempt === 7) throw Error("staging Airtable unavailable HTTP " + response.status);
      await delay(Math.min(8000, 450 * 2 ** attempt));
      continue;
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw Error("staging Airtable " + method + " HTTP " + response.status + ": " + JSON.stringify(result).slice(0, 420));
    if (method === "PATCH") stageWrites++;
    return result;
  }
  throw Error("staging Airtable retry exhausted");
}
const airtableFetch = async (env, table, id, options = {}) => {
  assert.equal(env.AIRTABLE_BASE_ID, BASE, "never use production Airtable base");
  assert.ok([OUTPUTS, CONTENTS, PROFILES].includes(table));
  const method = options.method || "GET";
  return airtable(method, table, id, options.body ? JSON.parse(options.body) : null);
};
const f = (record, name) => record?.fields?.[name];
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
class MemoryR2 {
  constructor() { this.rows = new Map(); this.version = 0; }
  async get(key) {
    const row = this.rows.get(key);
    return row ? { etag: row.etag, text: async () => JSON.stringify(row.value) } : null;
  }
  async put(key, raw, options = {}) {
    const old = this.rows.get(key);
    if (options.onlyIf instanceof Headers && options.onlyIf.get("If-None-Match") === "*" && old) return null;
    if (options.onlyIf?.etagMatches && old?.etag !== options.onlyIf.etagMatches) return null;
    if (options.onlyIf?.etagMatches && !old) return null;
    const row = { value: JSON.parse(raw), etag: String(++this.version) };
    this.rows.set(key, row);
    return { etag: row.etag };
  }
  async list({ prefix = "", limit = 1000 }) {
    return { objects: [...this.rows.keys()].filter(key => key.startsWith(prefix)).slice(0, limit).map(key => ({ key })), truncated: false };
  }
  async delete(keys) {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.rows.delete(key);
  }
}
// Validate the split Worker reconstruction, then extract function bodies from
// the actual compiled-in source modules with their unambiguous end markers.
readStudioWorkerSource();
const modules = ["01", "02", "03", "04"].map(n =>
  fs.readFileSync(new URL("./worker-functions-" + n + ".mjs", import.meta.url), "utf8"));
function extract(name) {
  for (const moduleText of modules) {
    const pattern = new RegExp("(?:^|\\n)export (?:async )?function " + name + "\\(");
    const match = pattern.exec(moduleText);
    if (!match) continue;
    const start = match.index + (match[0].startsWith("\n") ? 1 : 0) + 7;
    const end = moduleText.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", start);
    assert.ok(end > start, "Missing Worker extraction boundary: " + name);
    return moduleText.slice(start, end);
  }
  throw new Error("Missing real Worker handler: " + name);
}
function compile(name, dependencies) {
  return new Function(...Object.keys(dependencies),
    extract(name) + "\nreturn " + name + ";")(...Object.values(dependencies));
}
const nativePhoto = () => false;
const eligible = compile("studioOutputReadyForPublishApproval", {
  f, studioIsFinishedPassthrough: () => false,
  studioFinishedOriginKind: () => "", studioOutputIsNativePhoto: nativePhoto,
});
const publishFields = compile("studioPublishScheduleFields", {
  f, HttpError, maeNormalizeTimeZone, maeIsBlackoutLocalTime,
  maeIsPriorityLocalTime, maeScheduleConflicts, maeAdvancePastBlackout,
  studioNextOpenScheduleIso: maeNextOpenScheduleIso,
  STUDIO_SCHEDULE_GAP_MS: MAE_SCHEDULE_GAP_MS,
  maePickBalancedSuggestedIso, MAE_PRIORITY_SCHEDULE_WINDOWS,
  studioTikTokArmedDraftStatus: () => "Waiting for Schedule",
});
let dispatchCalls = 0, writeThroughCalls = 0;
const approved = compile("approveOutputRecordForPublishing", {
  withOutputApprovalLock, airtableFetch, f, HttpError,
  studioOutputReadyForPublishApproval: eligible,
  studioOutputIsNativePhoto: nativePhoto,
  item4PulseLetterPython: async () => { throw Error("native photo transport forbidden"); },
  maeScheduleLaneKey,
  item4ProductionProfileRecord: async () => ({ id: PROFILE, fields: { Timezone: TIMEZONE } }),
  studioScheduleHorizonDays: async () => MAE_SUGGEST_HORIZON_DAYS,
  MAE_SUGGEST_HORIZON_DAYS,
  studioOccupiedSchedulesOrEmpty: async () => [],
  studioOccupiedForLane: () => [],
  studioScheduleTimeZoneForRecord: async () => TIMEZONE,
  studioResolveStoryPublishIso: async () => { throw Error("story integration unsupported by this canary"); },
  maeScheduleNextSlot, maeScheduleConflicts,
  studioInvalidateOccupiedScheduleCache: () => {},
  studioPublishScheduleFields: publishFields,
  studioPublishHandoffFields: () => ({}),
  studioEnsureNativePublishSlides: async (_env, record) => record,
  studioSupabaseWriteThroughOutput: async () => { writeThroughCalls++; },
});
const approveSingle = compile("factoryApproveOutput", {
  airtableFetch, f, HttpError, studioOutputReadyForPublishApproval: eligible,
  approveOutputRecordForPublishing: approved,
  studioPublishCanDispatchNow: () => false,
  studioDispatchApprovedPublishAndSchedule: async () => { dispatchCalls++; return { blocked: true }; },
});
const firstLink = value => Array.isArray(value) ? value[0] : null;
const profileForOutput = compile("studioContentProfileRecordIdForOutput", {
  f, studioFirstLinkedId: firstLink, airtableFetch,
});
const processBatch = compile("factoryBatchProcess", {
  factoryBatchDrain, airtableFetch, studioContentProfileRecordIdForOutput: profileForOutput,
  HttpError, factoryApproveOutput: approveSingle,
});
const resolveProfile = async (_env, _auth, requested) => {
  if (requested !== PROFILE) throw new HttpError(403, "Staging profile only");
  return { id: PROFILE, fields: { Timezone: TIMEZONE } };
};
const requestedProfileId = (url, body) => body?.profile_id || url?.searchParams?.get("profile_id");
const respond = (_req, _env, json) => new Response(JSON.stringify(json), {
  headers: { "content-type": "application/json", "cache-control": "no-store" },
});
const submit = compile("factoryBatchSubmitRoute", {
  HttpError, resolveWorkingContentProfile: resolveProfile, requestedProfileId,
  factoryBatchRetry, factoryBatchEnqueue, factoryBatchProcess: processBatch,
  factoryBatchSummary, respond,
});
const getStatus = compile("factoryBatchStatusRoute", {
  HttpError, resolveWorkingContentProfile: resolveProfile, requestedProfileId,
  factoryBatchRead, factoryBatchList, factoryBatchSummary,
  factoryBatchQualitySignals, respond,
});
const bucket = new MemoryR2();
const env = {
  AIRTABLE_BASE_ID: BASE, AIRTABLE_OUTPUT_TABLE_ID: OUTPUTS,
  AIRTABLE_CONTENT_TABLE_ID: CONTENTS,
  STUDIO_MEDIA: bucket, FACTORY_BATCH_APPROVALS_ENABLED: "true",
};
const requestId = "factory_staging_real_" + Date.now().toString(36) + randomUUID().replace(/-/g, "").slice(0, 8);
const platforms = [
  ["Instagram", "Reel"], ["Facebook", "Reel"], ["YouTube", "Short"],
  ["TikTok", "Video Draft"], ["Instagram", "Reel"],
];
let fixtureIds = [];
try {
  const profile = await airtable("GET", PROFILES, PROFILE);
  assert.match(profile.fields.Profile_Name, /^STAGING ONLY/);
  assert.equal(profile.fields.Timezone, TIMEZONE);
  const content = await airtable("GET", CONTENTS, CONTENT);
  assert.deepEqual(content.fields.Content_Profile, [PROFILE]);

  const created = await airtable("POST", OUTPUTS, "", {
    records: platforms.map(([platform, format], i) => ({
      fields: {
        Output_Title: "STAGING ONLY / approval-route / " + requestId + "/" + i,
        Content_Item: [CONTENT], Platform: platform, Format: format,
        Studio_Output_Type: format, Output_Status: "Ready for Review",
        Review_Status: "Review Sent", Render_Status: "Rendered",
        Final_File_URL: "https://staging.invalid/" + requestId + "/" + i + ".mp4",
        Publish_Status: "Not Ready", Do_Not_Publish: i === 4,
      },
    })),
    typecast: true,
  });
  fixtureIds = created.records.map(row => row.id);
  assert.equal(fixtureIds.length, 5);
  const payload = {
    profile_id: PROFILE, request_id: requestId, action: "start",
    record_ids: [...fixtureIds, fixtureIds[0]],
    items: fixtureIds.map((id, i) => ({ id, platform: platforms[i][0], format: platforms[i][1] })),
    notes: "Staging-only route acceptance; external publish transport disabled",
  };
  const request = () => new Request("https://staging.invalid/api/factory/approval-batches", {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload),
  });
  await assert.rejects(() => submit(request(), { ...env, FACTORY_BATCH_APPROVALS_ENABLED: "false" }, null), error => error.status === 503);
  assert.equal((await bucket.list({ prefix: "studio/state/factory-approvals/" })).objects.length, 0);
  const waiting = [];
  const ctx = { waitUntil: promise => waiting.push(Promise.resolve(promise)) };
  const accepted = await (await submit(request(), env, null, ctx)).json();
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.total, 5, "duplicate content/output selection deduped");
  await Promise.all(waiting);
  const readOnly = { ...env, FACTORY_BATCH_APPROVALS_ENABLED: "false" };
  const statusReq = new Request("https://staging.invalid/api/factory/approval-batches?profile_id=" + PROFILE + "&request_id=" + requestId);
  const finalStatus = await (await getStatus(statusReq, readOnly, null)).json();
  assert.equal(finalStatus.approvals_enabled, false);
  assert.equal(finalStatus.total, 5);
  assert.equal(finalStatus.approved_count, 4);
  assert.equal(finalStatus.failed_count, 1);
  assert.equal(finalStatus.pending_count, 0);
  assert.match(finalStatus.items.find(row => row.id === fixtureIds[4]).error, /Do_Not_Publish|Cannot approve/i);
  assert.equal(stageWrites, 4);
  for (const id of fixtureIds.slice(0, 4)) {
    const row = await airtable("GET", OUTPUTS, id);
    assert.equal(row.fields.Review_Status, "Approved");
    assert.equal(row.fields.Output_Status, "Approved for Publishing");
    assert.equal(row.fields.Auto_Publish_Enabled, true);
    const stamp = Date.parse(row.fields.Scheduled_Post_Date);
    assert.ok(Number.isFinite(stamp));
    assert.equal(maeIsBlackoutLocalTime(stamp, TIMEZONE), false);
    assert.equal(maeIsPriorityLocalTime(stamp, TIMEZONE), true);
  }
  const denied = await airtable("GET", OUTPUTS, fixtureIds[4]);
  assert.equal(denied.fields.Do_Not_Publish, true);
  assert.equal(denied.fields.Review_Status, "Review Sent");
  const again = await (await submit(request(), env, null, ctx)).json();
  assert.equal(again.already_submitted, true);
  assert.equal(stageWrites, 4);
  const retryReq = new Request("https://staging.invalid/api/factory/approval-batches", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ profile_id: PROFILE, action: "retry", request_id: requestId }),
  });
  const pendingBeforeRetry = waiting.length;
  await submit(retryReq, env, null, ctx);
  await Promise.all(waiting.slice(pendingBeforeRetry));
  const afterRetry = await (await getStatus(statusReq, readOnly, null)).json();
  assert.equal(afterRetry.approved_count, 4);
  assert.equal(afterRetry.failed_count, 1);
  assert.equal(stageWrites, 4, "failed-only retry never reapproved successful outputs");
  assert.equal(dispatchCalls, 4, "all 4 publishing kickoffs intercepted in memory");
  assert.equal(writeThroughCalls, 4, "all 4 Supabase write-throughs intercepted in memory");
  console.log("FACTORY_ACTUAL_STAGING_AIRTABLE_ROUTE=PASS; 4 real Airtable approval writes; 1 Do_Not_Publish fail-closed; 0 social calls; 0 production Airtable calls; retry idempotent; read-only flag GET passed.");
} finally {
  // Delete strictly the newly created synthetic test records, never user data.
  if (fixtureIds.length) {
    for (const id of fixtureIds) {
      try { await airtable("DELETE", OUTPUTS, id); }
      catch (error) { console.error("STAGING_ONLY_CLEANUP_FAILED id=" + id, String(error.message)); process.exitCode = 1; }
    }
  }
}
