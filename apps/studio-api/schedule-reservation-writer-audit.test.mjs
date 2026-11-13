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
  // Completed Video all-output release changes only Auto_Publish_Enabled after
  // six separate, reservation-authorized approvals. It reads schedule fields
  // but never creates, moves, or deletes any authoritative schedule timestamps.
  "worker-functions-01.mjs:azAutoApproveIfReady",
  "worker-functions-01.mjs:studioCompleteNativePhotoPublishArming",
  // Facebook rate-limit recovery preserves Scheduled_Post_Date until the next
  // approved atomic MAE move. It clears only the non-authoritative suggestion marker.
  "worker-functions-02.mjs:fanoutProductionRequestOutputsToContentItems",
  "worker-functions-02.mjs:studioAtomicApplyPlatformOutputSeedSchedule",
  "worker-functions-03.mjs:studioPrepareVisualVoiceoverCanary",
  "worker-functions-03.mjs:studioResetYoutubeUploadForRetry",
  "worker-functions-04.mjs:approveOutputRecordForPublishing",
  "worker-functions-04.mjs:factoryDeleteDeskItem",
  "worker-functions-04.mjs:resendStudioTiktokDraft",
  // Meta Manual Action Republish reads Scheduled_Post_Date only to decide
  // Ready to Publish vs Ready to Schedule; it never writes schedule timestamps.
  "worker-functions-04.mjs:republishStudioMeta",
  "worker-functions-04.mjs:scheduleStudioPublishOutput",
  "worker-functions-04.mjs:studioRecoverFencedIgStaleUpload",
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
    ["worker-functions-04.mjs", "studioRecoverFencedIgStaleUpload"],
  ];
  for (const [file, name] of atomic) {
    const body = topLevelFunctionBodies(sources[file]).get(name);
    assert.ok(body, `missing ${file}:${name}`);
    assert.match(body, /runAtomicScheduleTransaction\(env/, `${file}:${name} must use the shared authority`);
  }
});

test("only exact enabled scheduling lanes use atomic writers; others retain legacy paths", () => {
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
    const guard = name === "fanoutProductionRequestOutputsToContentItems"
      ? /scheduleReservationLaneEnabled\(env,/
      : /scheduleReservationLaneEnabled\(env,/;
    assert.match(
      body,
      guard,
      `${file}:${name} must explicitly check atomic authority for its exact lane`,
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
    missing.indexOf("scheduleReservationLaneEnabled(env")
      < missing.indexOf('method: "PATCH"'),
    "missing-schedule legacy PATCH must occur only after the lane-scoped dispatch",
  );

  const story = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("studioHealStoryCompanionDrift");
  assert.ok(
    story.indexOf("scheduleReservationLaneEnabled(env")
      < story.indexOf('method: "PATCH"'),
    "Story drift legacy PATCH must occur only after the lane-scoped dispatch",
  );

  const approval = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("approveOutputRecordForPublishing");
  assert.ok(
    approval.indexOf("scheduleReservationLaneEnabled(env")
      < approval.indexOf('method: "PATCH"'),
    "canonical legacy approval PATCH must occur only after the atomic branch",
  );

  const regen = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("studioProcessScheduleRegenJobSlice");
  assert.ok(
    regen.indexOf("scheduleReservationLaneEnabled(env")
      < regen.indexOf("airtableBatchUpdate("),
    "legacy regeneration batch write must remain below the lane-scoped atomic branch",
  );

  const factoryDelete = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("factoryDeleteDeskItem");
  assert.ok(
    factoryDelete.indexOf("scheduleReservationLaneEnabled(env")
      < factoryDelete.indexOf("airtableBatchUpdate("),
    "legacy Factory vacate batch write must remain below the lane-scoped atomic branch",
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

  const metaRepublish = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("republishStudioMeta");
  assert.ok(metaRepublish);
  assert.doesNotMatch(metaRepublish, /(^|[,{]\s*)Scheduled_Post_Date\s*:/m);
  assert.doesNotMatch(metaRepublish, /(^|[,{]\s*)YouTube_Scheduled_Publish_At\s*:/m);
  assert.doesNotMatch(metaRepublish, /(^|[,{]\s*)Studio_Scheduled_At\s*:/m);
});

test("visual voiceover canary may clear schedule fields only on isolated nonpublishing test outputs", () => {
  const canary = topLevelFunctionBodies(sources["worker-functions-03.mjs"])
    .get("studioPrepareVisualVoiceoverCanary");
  assert.ok(canary);
  assert.match(canary, /Test_Run_ID/);
  assert.match(canary, /Do_Not_Publish/);
  assert.match(canary, /Published_At/);
  assert.match(canary, /Platform_Post_ID/);
  assert.match(canary, /Platform_Post_URL/);
  assert.match(canary, /if \(!String\(f\(row, "Test_Run_ID"\) \|\| ""\)\.trim\(\)\) continue/);
  assert.match(canary, /if \(!Boolean\(f\(row, "Do_Not_Publish"\)\)\) continue/);
  assert.match(canary, /Do_Not_Publish:\s*true/);
  assert.match(canary, /Auto_Publish_Enabled:\s*false/);
  assert.match(canary, /Publish_Status:\s*"Not Ready"/);
  assert.match(canary, /Scheduled_Post_Date:\s*null/);
  assert.match(canary, /Studio_Scheduled_At:\s*null/);
  assert.match(canary, /YouTube_Scheduled_Publish_At:\s*null/);
  assert.doesNotMatch(
    canary,
    /Do_Not_Publish:\s*false|Auto_Publish_Enabled:\s*true/,
    "visual canary schedule reset must never arm publishing while bypassing production occupancy",
  );
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


function lineNumberAt(source, index) {
  return source.slice(0, index).split("\n").length;
}

function sourceRegion(source, startNeedle, endNeedle) {
  const start = source.indexOf(startNeedle);
  assert.ok(start >= 0, `missing audited region start: ${startNeedle}`);
  const end = source.indexOf(endNeedle, start);
  assert.ok(end > start, `missing audited region end: ${endNeedle}`);
  return { start, end };
}

test("direct schedule-field mutations are confined to audited constructors, atomic writers, and flag guards", () => {
  const worker01 = sources["worker-functions-01.mjs"];
  const worker02 = sources["worker-functions-02.mjs"];
  const worker03 = sources["worker-functions-03.mjs"];
  const worker04 = sources["worker-functions-04.mjs"];
  const assembledWorker = fs.readFileSync(path.join(here, "worker.js"), "utf8");

  const allowed = new Map([
    ["worker-functions-01.mjs", [
      sourceRegion(
        worker01,
        "export function studioPublishScheduleFields",
        "/*__STUDIO_WORKER_END:studioPublishScheduleFields__*/",
      ),
    ]],
    ["worker-functions-02.mjs", [
      sourceRegion(
        worker02,
        "export function platformOutputSeedFields",
        "/*__STUDIO_WORKER_END:platformOutputSeedFields__*/",
      ),
      sourceRegion(
        worker02,
        "async function studioAtomicApplyPlatformOutputSeedSchedule",
        "/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/",
      ),
      sourceRegion(
        worker02,
        "export async function fanoutProductionRequestOutputsToContentItems",
        "/*__STUDIO_WORKER_END:fanoutProductionRequestOutputsToContentItems__*/",
      ),
    ]],
    ["worker-functions-03.mjs", [
      sourceRegion(
        worker03,
        "export async function studioPrepareVisualVoiceoverCanary",
        "/*__STUDIO_WORKER_END:studioPrepareVisualVoiceoverCanary__*/",
      ),
      sourceRegion(
        worker03,
        "export async function studioResetYoutubeUploadForRetry",
        "/*__STUDIO_WORKER_END:studioResetYoutubeUploadForRetry__*/",
      ),
    ]],
    ["worker-functions-04.mjs", [
      sourceRegion(
        worker04,
        "async function studioAtomicVacateSkippedOutput",
        "/*__STUDIO_WORKER_END:studioAtomicVacateSkippedOutput__*/",
      ),
      sourceRegion(
        worker04,
        "export async function factoryDeleteDeskItem",
        "/*__STUDIO_WORKER_END:factoryDeleteDeskItem__*/",
      ),
      sourceRegion(
        worker04,
        "export async function scheduleStudioPublishOutput",
        "/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/",
      ),
      // This writer requires both a CAS-fenced pre-Graph lease and the shared
      // Durable Object scheduling lane. No direct/legacy date mutation exists.
      sourceRegion(
        worker04,
        "export async function studioRecoverFencedIgStaleUpload",
        "/*__STUDIO_WORKER_END:studioRecoverFencedIgStaleUpload__*/",
      ),
    ]],
  ]);

  const fieldNames = [
    "Scheduled_Post_Date",
    "YouTube_Scheduled_Publish_At",
    "Studio_Scheduled_At",
  ];
  const escaped = fieldNames.join("|");
  const mutationPattern = new RegExp(
    `(?:\\b(?:${escaped})\\s*:|["'](?:${escaped})["']\\s*:|\\.(?:${escaped})\\s*=(?!=)|\\[\\s*["'](?:${escaped})["']\\s*\\]\\s*=(?!=)|delete\\s+[^;\\n]*(?:${escaped}))`,
    "g",
  );

  for (const [file, source] of Object.entries(sources)) {
    const ranges = allowed.get(file) || [];
    let match;
    while ((match = mutationPattern.exec(source))) {
      const inside = ranges.some((range) => match.index >= range.start && match.index < range.end);
      assert.ok(
        inside,
        `${file}:${lineNumberAt(source, match.index)} has an unaudited direct schedule-field mutation: ${match[0]}`,
      );
    }
  }

  // worker.js is the reconstructed production entrypoint. It may reference
  // schedule fields for reads/formulas, but it must not acquire a new unsplit
  // direct mutation that bypasses the split-module audit above.
  assert.doesNotMatch(
    assembledWorker,
    mutationPattern,
    "assembled worker.js contains a direct schedule-field mutation outside the audited split modules",
  );
});

test("flag-on protective seed stripping and Factory vacate remain before legacy Airtable writes", () => {
  const fanout = topLevelFunctionBodies(sources["worker-functions-02.mjs"])
    .get("fanoutProductionRequestOutputsToContentItems");
  assert.ok(fanout);
  const flagAt = fanout.indexOf("scheduleReservationLaneEnabled(env,");
  const stripAt = fanout.indexOf("delete seed.Scheduled_Post_Date");
  const patchAt = fanout.indexOf("airtableFetch(env,STUDIO_PLATFORM_OUTPUT_TABLE");
  assert.ok(flagAt >= 0 && stripAt > flagAt, "allowlisted-lane fanout must strip seed schedule fields");
  assert.ok(
    patchAt < 0 || stripAt < patchAt,
    "seed schedule stripping must happen before Platform Output POST/PATCH",
  );
  assert.match(fanout, /studioAtomicApplyPlatformOutputSeedSchedule\(env/);

  const factoryDelete = topLevelFunctionBodies(sources["worker-functions-04.mjs"])
    .get("factoryDeleteDeskItem");
  assert.ok(factoryDelete);
  const vacateFlag = factoryDelete.indexOf("scheduleReservationAuthorityEnabled(env)");
  const atomicVacate = factoryDelete.indexOf("studioAtomicVacateSkippedOutput(");
  const legacyBatch = factoryDelete.indexOf("airtableBatchUpdate(");
  assert.ok(vacateFlag >= 0 && atomicVacate > vacateFlag);
  assert.ok(legacyBatch > atomicVacate, "legacy Factory batch vacate must stay below the atomic flag-on path");
});
