import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

const splitFiles = [
  "worker-functions-01.mjs",
  "worker-functions-02.mjs",
  "worker-functions-03.mjs",
  "worker-functions-04.mjs",
];

const sources = Object.fromEntries(
  splitFiles.map((name) => [name, fs.readFileSync(path.join(here, name), "utf8")]),
);

function topLevelFunctionBodies(source) {
  const re = /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)\s*\([^)]*\)\s*\{/g;
  const starts = [];
  let match;
  while ((match = re.exec(source))) starts.push({ name: match[1], index: match.index });
  const result = new Map();
  for (let i = 0; i < starts.length; i += 1) {
    const start = starts[i];
    const end = i + 1 < starts.length ? starts[i + 1].index : source.length;
    result.set(start.name, source.slice(start.index, end));
  }
  return result;
}

function scheduleReferencingAirtableWriters() {
  const found = [];
  for (const [file, source] of Object.entries(sources)) {
    for (const [name, body] of topLevelFunctionBodies(source)) {
      const referencesSchedule = [
        "Scheduled_Post_Date",
        "YouTube_Scheduled_Publish_At",
        "Studio_Scheduled_At",
      ].some((field) => body.includes(field));
      const mutatesAirtable = /method:\s*"PATCH"/.test(body)
        || /method:\s*"POST"/.test(body)
        || /method:\s*"DELETE"/.test(body)
        || /airtableBatchUpdate\s*\(/.test(body);
      if (referencesSchedule && mutatesAirtable) found.push(`${file}:${name}`);
    }
  }
  return found.sort();
}

const EXPECTED_WRITER_SURFACE = [
  "worker-functions-01.mjs:studioCompleteNativePhotoPublishArming",
  "worker-functions-02.mjs:fanoutProductionRequestOutputsToContentItems",
  "worker-functions-02.mjs:studioAtomicApplyPlatformOutputSeedSchedule",
  "worker-functions-03.mjs:studioResetYoutubeUploadForRetry",
  "worker-functions-04.mjs:approveOutputRecordForPublishing",
  "worker-functions-04.mjs:factoryDeleteDeskItem",
  "worker-functions-04.mjs:resendStudioTiktokDraft",
  "worker-functions-04.mjs:scheduleStudioPublishOutput",
  "worker-functions-04.mjs:studioApproveOutputRecordAtomic",
  "worker-functions-04.mjs:studioAtomicApplyScheduleRegenEntry",
  "worker-functions-04.mjs:studioAtomicVacateSkippedOutput",
  "worker-functions-04.mjs:studioHealApprovedMissingSchedule",
  "worker-functions-04.mjs:studioHealApprovedMissingScheduleAtomic",
  "worker-functions-04.mjs:studioHealStoryCompanionDrift",
  "worker-functions-04.mjs:studioHealStoryCompanionDriftAtomic",
  "worker-functions-04.mjs:studioProcessScheduleRegenJobSlice",
].sort();

test("schedule-referencing Airtable writer surface is fully classified", () => {
  assert.deepEqual(
    scheduleReferencingAirtableWriters(),
    EXPECTED_WRITER_SURFACE,
    "A new schedule-referencing Airtable writer appeared. Route it through the reservation authority or explicitly classify it as read/preserve-only.",
  );
});

test("every true flag-on schedule mutation uses the shared transaction authority", () => {
  const atomic = [
    ["worker-functions-02.mjs", "studioAtomicApplyPlatformOutputSeedSchedule"],
    ["worker-functions-04.mjs", "studioHealApprovedMissingScheduleAtomic"],
    ["worker-functions-04.mjs", "studioHealStoryCompanionDriftAtomic"],
    ["worker-functions-04.mjs", "studioApproveOutputRecordAtomic"],
    ["worker-functions-04.mjs", "studioAtomicApplyScheduleRegenEntry"],
    ["worker-functions-04.mjs", "studioAtomicVacateSkippedOutput"],
    ["worker-functions-04.mjs", "scheduleStudioPublishOutput"],
  ];
  for (const [file, name] of atomic) {
    const body = topLevelFunctionBodies(sources[file]).get(name);
    assert.ok(body, `missing ${file}:${name}`);
    assert.match(body, /runAtomicScheduleTransaction\(env/, `${file}:${name} must use the shared authority`);
  }
});

test("legacy schedule writers are unreachable when the authority flag is enabled", () => {
  const guarded = [
    ["worker-functions-02.mjs", "fanoutProductionRequestOutputsToContentItems"],
    ["worker-functions-04.mjs", "studioHealApprovedMissingSchedule"],
    ["worker-functions-04.mjs", "studioHealStoryCompanionDrift"],
    ["worker-functions-04.mjs", "approveOutputRecordForPublishing"],
    ["worker-functions-04.mjs", "studioProcessScheduleRegenJobSlice"],
    ["worker-functions-04.mjs", "factoryDeleteDeskItem"],
    ["worker-functions-04.mjs", "scheduleStudioPublishOutput"],
  ];
  for (const [file, name] of guarded) {
    const body = topLevelFunctionBodies(sources[file]).get(name);
    assert.ok(body, `missing ${file}:${name}`);
    assert.match(
      body,
      /scheduleReservationAuthorityEnabled\(env\)/,
      `${file}:${name} must explicitly gate legacy scheduling behind the authority flag`,
    );
  }

  const fanout = topLevelFunctionBodies(sources["worker-functions-02.mjs"])
    .get("fanoutProductionRequestOutputsToContentItems");
  assert.match(fanout, /delete seed\.Scheduled_Post_Date/);
  assert.match(fanout, /delete seed\.YouTube_Scheduled_Publish_At/);
  assert.match(fanout, /delete seed\.Studio_Scheduled_At/);
  assert.match(fanout, /studioAtomicApplyPlatformOutputSeedSchedule\(env/);

  const missing = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("studioHealApprovedMissingSchedule");
  assert.ok(
    missing.indexOf("scheduleReservationAuthorityEnabled(env)")
      < missing.indexOf('method: "PATCH"'),
    "missing-schedule legacy PATCH must occur only after the flag-on early return",
  );

  const story = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("studioHealStoryCompanionDrift");
  assert.ok(
    story.indexOf("scheduleReservationAuthorityEnabled(env)")
      < story.indexOf('method: "PATCH"'),
    "Story drift legacy PATCH must occur only after the flag-on early return",
  );

  const approval = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("approveOutputRecordForPublishing");
  assert.ok(
    approval.indexOf("scheduleReservationAuthorityEnabled(env)")
      < approval.indexOf('method: "PATCH"'),
    "canonical legacy approval PATCH must occur only after the atomic branch",
  );

  const regen = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("studioProcessScheduleRegenJobSlice");
  assert.ok(
    regen.indexOf("scheduleReservationAuthorityEnabled(env)")
      < regen.indexOf("airtableBatchUpdate("),
    "legacy regeneration batch write must remain below the flag-on atomic branch",
  );

  const factoryDelete = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("factoryDeleteDeskItem");
  assert.ok(
    factoryDelete.indexOf("scheduleReservationAuthorityEnabled(env)")
      < factoryDelete.indexOf("airtableBatchUpdate("),
    "legacy Factory vacate batch write must remain below the flag-on atomic branch",
  );
});

test("status-only writers cannot accidentally mutate authoritative schedule capacity", () => {
  const native = topLevelFunctionBodies(sources["worker-functions-01.mjs"])
    .get("studioCompleteNativePhotoPublishArming");
  assert.ok(native);
  assert.doesNotMatch(native, /(^|[,{]\s*)Scheduled_Post_Date\s*:/m);
  assert.doesNotMatch(native, /(^|[,{]\s*)YouTube_Scheduled_Publish_At\s*:/m);
  assert.doesNotMatch(native, /(^|[,{]\s*)Studio_Scheduled_At\s*:/m);

  const resend = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("resendStudioTiktokDraft");
  assert.ok(resend);
  assert.doesNotMatch(resend, /(^|[,{]\s*)Scheduled_Post_Date\s*:/m);
  assert.doesNotMatch(resend, /(^|[,{]\s*)YouTube_Scheduled_Publish_At\s*:/m);
  assert.doesNotMatch(resend, /(^|[,{]\s*)Studio_Scheduled_At\s*:/m);
});

test("YouTube retry reset never frees canonical platform occupancy", () => {
  const reset = topLevelFunctionBodies(sources["worker-functions-03.mjs"])
    .get("studioResetYoutubeUploadForRetry");
  assert.ok(reset);
  assert.match(reset, /YouTube_Scheduled_Publish_At:\s*null/);
  assert.doesNotMatch(
    reset,
    /(^|[,{]\s*)Scheduled_Post_Date\s*:\s*(?:null|""|undefined)/m,
    "YouTube retry may clear the upload mirror but must not vacate the canonical Scheduled_Post_Date",
  );
});

test("standalone runtime modules do not hide direct Airtable schedule writers", () => {
  const ignored = new Set([
    "worker.js",
    "worker-functions-01.mjs",
    "worker-functions-02.mjs",
    "worker-functions-03.mjs",
    "worker-functions-04.mjs",
  ]);
  const offenders = [];
  for (const name of fs.readdirSync(here)) {
    if (!name.endsWith(".mjs")) continue;
    if (ignored.has(name) || name.includes(".test.") || name.includes(".staging.") || name.includes(".template.")) continue;
    const source = fs.readFileSync(path.join(here, name), "utf8");
    const referencesSchedule = [
      "Scheduled_Post_Date",
      "YouTube_Scheduled_Publish_At",
      "Studio_Scheduled_At",
    ].some((field) => source.includes(field));
    const directAirtableMutation = /airtableFetch\s*\(/.test(source)
      || /airtableBatchUpdate\s*\(/.test(source);
    if (referencesSchedule && directAirtableMutation) offenders.push(name);
  }
  assert.deepEqual(
    offenders,
    [],
    "Standalone runtime module gained a direct Airtable schedule writer; route it through the canonical reservation authority.",
  );
});
