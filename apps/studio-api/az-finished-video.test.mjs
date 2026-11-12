import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  AZ_EXPECTED_OUTPUT_COUNT,
  AZ_EXTRAS,
  AZ_OUTPUT_LOCK_MS,
  AZ_OVERRIDES,
  FINISHED_DESTINATION_KEYS,
  FINISHED_STORY_TEASER_SECONDS,
  azDefaultPlanPayload,
  azOriginStamp,
  azOutputLockHeld,
  azOutputLockIsFresh,
  azOutputLockToken,
  azRequestDefaults,
  canonicalFinishedDestinationKey,
  capFinishedPlanItems,
  finishedCompanionStoryFields,
  finishedStoryTeaserClipFlags,
  isAzFinishedVideoOrigin,
  mergeAzOutputLock,
  mergeAzProductionNotes,
  pickDuplicateOutputKeepers,
  pickPlatformOutputSeedKeeper,
  shouldCreateFinishedOutput,
  uniquePlanItems,
  azExpectedOutputCount,
  isHorizontalFinishedAspect,
  FINISHED_HORIZONTAL_KEYS,
} from "./az-finished-video.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

test("AZ origin stamp keeps finished-video passthrough and auto-queue", () => {
  const stamp = azOriginStamp();
  assert.match(stamp, /origin=az-finished-video/);
  assert.match(stamp, /ez-input=finished-video/);
  assert.match(stamp, /az-auto-queue=1/);
  assert.equal(isAzFinishedVideoOrigin(stamp), true);
});

test("AZ defaults lock no VO, no music, thumbnail yes, four platforms plus stories", () => {
  const defaults = azRequestDefaults({ title: "Navy Pier" });
  assert.equal(defaults.voiceover_mode, "No");
  assert.equal(defaults.background_music_mode, "No");
  assert.equal(defaults.thumbnail_mode, "Yes");
  assert.deepEqual(defaults.platforms, ["Instagram", "Facebook", "TikTok", "YouTube"]);
  const plan = azDefaultPlanPayload();
  assert.equal(plan.overrides.YouTube, AZ_OVERRIDES.YouTube);
  assert.deepEqual(plan.extras, [...AZ_EXTRAS]);
  assert.equal(AZ_EXPECTED_OUTPUT_COUNT, 6);
  assert.equal(FINISHED_STORY_TEASER_SECONDS, 10);
  const story = finishedCompanionStoryFields();
  assert.equal(story.Background_Music_Mode_Override, "No");
  assert.equal(story.Video_Duration_Seconds_Override, 10);
  assert.deepEqual(finishedStoryTeaserClipFlags(), { keepSourceAudio: true, muted: false });
});

test("uniquePlanItems keeps one row per platform and output type", () => {
  const items = uniquePlanItems([
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Instagram", output_type: "Story" },
    { platform: "Facebook", output_type: "Reel" },
    { platform: "Facebook", output_type: "Story" },
    { platform: "TikTok", output_type: "Video Draft" },
    { platform: "YouTube", output_type: "Short" },
    { platform: "YouTube", output_type: "Short" },
  ]);
  assert.deepEqual(items.map((item) => `${item.platform}::${item.output_type}`), [
    "Instagram::Reel",
    "Instagram::Story",
    "Facebook::Reel",
    "Facebook::Story",
    "TikTok::Video Draft",
    "YouTube::Short",
  ]);
});

test("shouldCreateFinishedOutput normalizes scalar and object existing keys", () => {
  assert.equal(shouldCreateFinishedOutput("Instagram::Reel", "Instagram::Reel"), false);
  assert.equal(shouldCreateFinishedOutput("Instagram::Reel", "Facebook::Reel"), true);
  assert.equal(shouldCreateFinishedOutput({ first: "Instagram::Reel" }, "Instagram::Reel"), false);
  assert.equal(shouldCreateFinishedOutput(new Set(["Instagram::Reel"]), "Facebook::Reel"), true);
  assert.equal(shouldCreateFinishedOutput(null, "YouTube::Short"), true);
});

test("pickDuplicateOutputKeepers disables extra same-key rows", () => {
  const { keepers, extras } = pickDuplicateOutputKeepers([
    { id: "recIG2", platform: "Instagram", output_type: "Reel", has_platform_output: true, output_order: 1, created_at: "2026-09-20T15:23:47Z" },
    { id: "recIG1", platform: "Instagram", output_type: "Reel", has_platform_output: true, output_order: 1, created_at: "2026-09-20T15:23:44Z" },
    { id: "recIG3", platform: "Instagram", output_type: "Reel", has_platform_output: false, output_order: 1, created_at: "2026-09-20T15:23:48Z" },
    { id: "recFB", platform: "Facebook", output_type: "Reel", has_platform_output: true, output_order: 2, created_at: "2026-09-20T15:23:45Z" },
  ]);
  assert.deepEqual(keepers.map((row) => row.id).sort(), ["recFB", "recIG1"]);
  assert.deepEqual(extras.map((row) => row.id).sort(), ["recIG2", "recIG3"]);
});

test("platform output seed race keeps one deterministic canonical row", () => {
  const ordinary = pickPlatformOutputSeedKeeper([
    { id: "recLater", output_id: 751, created_at: "2026-09-21T13:04:19.900Z", published: false },
    { id: "recEarlier", output_id: 750, created_at: "2026-09-21T13:04:19.100Z", published: false },
  ]);
  assert.equal(ordinary.keeper.id, "recEarlier");
  assert.deepEqual(ordinary.extras.map((row) => row.id), ["recLater"]);

  const publishedWins = pickPlatformOutputSeedKeeper([
    { id: "recDraft", output_id: 800, created_at: "2026-09-21T13:00:00Z", published: false },
    { id: "recPublished", output_id: 801, created_at: "2026-09-21T13:00:01Z", published: true },
  ]);
  assert.equal(publishedWins.keeper.id, "recPublished");
  assert.deepEqual(publishedWins.extras.map((row) => row.id), ["recDraft"]);
});

test("merge keeps an existing AZ stamp", () => {
  const first = mergeAzProductionNotes("", { title: "A" });
  assert.equal(mergeAzProductionNotes(first, { title: "B" }), first);
});

test("canonical keys collapse reel-family types onto the six destinations", () => {
  assert.equal(canonicalFinishedDestinationKey("Instagram", "Reel"), "Instagram::Reel");
  assert.equal(canonicalFinishedDestinationKey("Instagram", "Slideshow Reel"), "Instagram::Reel");
  assert.equal(canonicalFinishedDestinationKey("Facebook", "Reel"), "Facebook::Reel");
  assert.equal(canonicalFinishedDestinationKey("TikTok", "Short"), "TikTok::Video Draft");
  assert.equal(canonicalFinishedDestinationKey("TikTok", "Video Draft"), "TikTok::Video Draft");
  assert.equal(canonicalFinishedDestinationKey("YouTube", "Standard Video"), "YouTube::Short");
  assert.equal(canonicalFinishedDestinationKey("YouTube", "Short"), "YouTube::Short");
  assert.equal(canonicalFinishedDestinationKey("Instagram", "Story"), "Instagram::Story");
  assert.equal(canonicalFinishedDestinationKey("Instagram", "Instagram Story"), "Instagram::Story");
  assert.equal(canonicalFinishedDestinationKey("Facebook", "Facebook Story"), "Facebook::Story");
  assert.equal(canonicalFinishedDestinationKey("Facebook", "Story"), "Facebook::Story");
  assert.deepEqual([...FINISHED_DESTINATION_KEYS], [
    "Instagram::Reel",
    "Facebook::Reel",
    "TikTok::Video Draft",
    "YouTube::Short",
    "Instagram::Story",
    "Facebook::Story",
  ]);
});

test("horizontal finished aspect caps to YouTube Standard Video only", () => {
  const notes = "origin=az-finished-video; ez-input=finished-video; source-aspect=horizontal; az-auto-queue=1";
  assert.equal(isHorizontalFinishedAspect(notes), true);
  assert.equal(azExpectedOutputCount(notes), 1);
  const capped = capFinishedPlanItems([
    { platform: "Instagram", output_type: "Reel" },
    { platform: "YouTube", output_type: "Standard Video" },
    { platform: "YouTube", output_type: "Short" },
  ], { notes });
  assert.deepEqual(capped.map((item) => `${item.platform}::${item.output_type}`), [...FINISHED_HORIZONTAL_KEYS]);
});

test("capFinishedPlanItems refuses a seventh destination and same-key aliases", () => {
  const capped = capFinishedPlanItems([
    { platform: "Instagram", output_type: "Reel" },
    { platform: "Instagram", output_type: "Slideshow Reel" },
    { platform: "Facebook", output_type: "Reel" },
    { platform: "TikTok", output_type: "Video Draft" },
    { platform: "TikTok", output_type: "Short" },
    { platform: "YouTube", output_type: "Short" },
    { platform: "Instagram", output_type: "Story" },
    { platform: "Facebook", output_type: "Story" },
    { platform: "LinkedIn", output_type: "Video" },
    { platform: "YouTube", output_type: "Standard Video" },
  ]);
  assert.deepEqual(capped.map((item) => `${item.platform}::${item.output_type}`), [...FINISHED_DESTINATION_KEYS]);
});

test("shouldCreateFinishedOutput hard-caps at six unique destinations", () => {
  const live = [];
  for (const key of FINISHED_DESTINATION_KEYS) {
    assert.equal(shouldCreateFinishedOutput(live, key), true);
    live.push(key);
    assert.equal(shouldCreateFinishedOutput(live, key), false);
  }
  assert.equal(live.length, AZ_EXPECTED_OUTPUT_COUNT);
  assert.equal(shouldCreateFinishedOutput(live, "Instagram::Reel"), false);
  assert.equal(shouldCreateFinishedOutput(live, "YouTube::Standard Video"), false);
  assert.equal(shouldCreateFinishedOutput(["Instagram::Reel"], "Instagram::Story"), true);
});

test("pickDuplicateOutputKeepers can collapse by canonical finished key", () => {
  const { keepers, extras } = pickDuplicateOutputKeepers([
    { id: "recReel", platform: "Instagram", output_type: "Reel", has_platform_output: true, output_order: 1, created_at: "2026-09-20T17:11:40Z" },
    { id: "recSlide", platform: "Instagram", output_type: "Slideshow Reel", has_platform_output: false, output_order: 2, created_at: "2026-09-20T17:11:41Z" },
    { id: "recStory2", platform: "Instagram", output_type: "Story", has_platform_output: false, output_order: 6, created_at: "2026-09-20T17:11:50Z" },
    { id: "recStory1", platform: "Instagram", output_type: "Story", has_platform_output: true, output_order: 5, created_at: "2026-09-20T17:11:45Z" },
  ], { keyOf: (row) => canonicalFinishedDestinationKey(row.platform, row.output_type) });
  assert.deepEqual(keepers.map((row) => row.id).sort(), ["recReel", "recStory1"]);
  assert.deepEqual(extras.map((row) => row.id).sort(), ["recSlide", "recStory2"]);
});

test("az output lock is last-writer token and expires", () => {
  const now = 1_779_000_000_000;
  const token = azOutputLockToken(now);
  const notes = mergeAzOutputLock("origin=az-finished-video; ez-input=finished-video", token);
  assert.equal(azOutputLockHeld(notes, token), true);
  assert.equal(azOutputLockIsFresh(notes, now + 1_000), true);
  assert.equal(azOutputLockIsFresh(notes, now + AZ_OUTPUT_LOCK_MS), false);
  const later = azOutputLockToken(now + 10);
  const overwritten = mergeAzOutputLock(notes, later);
  assert.equal(azOutputLockHeld(overwritten, token), false);
  assert.equal(azOutputLockHeld(overwritten, later), true);
});


test("promotion repairs missing Production Request Outputs from the saved plan", () => {
  const reconcile = worker.slice(
    worker.indexOf("async function item4ReconcileEnabledPlanOutputs"),
    worker.indexOf("async function acquireAzOutputLock"),
  );
  assert.match(reconcile, /if \(!enabledRows\.length\)/);
  assert.match(reconcile, /Studio_Output_Plan_JSON/);
  assert.match(reconcile, /await item4SyncPlanOutputs\(env, requestRecord, planItems\)/);
});

test("finished-video output sync preserves a fresh single-owner lock", () => {
  const sync = worker.slice(
    worker.indexOf("async function item4SyncPlanOutputs"),
    worker.indexOf("async function buildItem4OutputPlan"),
  );
  assert.match(sync, /if \(!azLock\.acquired\)/);
  assert.match(sync, /item4CollapseDuplicatePlanOutputs/);
  assert.match(sync, /return;/);
  assert.doesNotMatch(sync, /if \(!lockedRows\.length\)/);
});


test("finished-video destination sync skips the broad occupancy read while holding its output lock", () => {
  const sync = worker.slice(
    worker.indexOf("async function item4SyncPlanOutputs"),
    worker.indexOf("async function buildItem4OutputPlan"),
  );
  assert.match(sync, /const occupied = finishedVideo \? \{\} : await studioLoadPlanScheduleOccupancy\(env, \{/);
  assert.match(sync, /excludeRequestId: productionRequestId/);
  assert.match(sync, /profile: await item4ProductionProfileRecord\(env, requestRecord\)/);
});

test("finished-video plan rebuild keeps variants Not Needed", () => {
  const plan = worker.slice(
    worker.indexOf("async function buildItem4OutputPlan"),
    worker.indexOf("async function getItem4OutputPlan"),
  );
  assert.match(plan, /Studio_Variant_Status:finishedVideo\?"Not Needed":"None"/);
});



test("completed-video mode is explicit, with legacy fallback", async () => {
  const { finishedPublishMode } = await import("./az-finished-video.mjs");
  assert.equal(finishedPublishMode("origin=az-finished-video\naz-publish-mode=approval"), "approval");
  assert.equal(finishedPublishMode("origin=az-finished-video; az-publish-mode=immediate"), "immediate");
  assert.equal(finishedPublishMode("origin=az-finished-video; az-publish-mode=immediate."), "immediate");
  assert.equal(finishedPublishMode("origin=az-finished-video"), "legacy");
});
test("Publish Now refuses missing, duplicate, and unready destinations", async () => {
  const { finishedPublishPreflight } = await import("./az-finished-video.mjs");
  const full = FINISHED_DESTINATION_KEYS.map((key) => {
    const [platform, output_type] = key.split("::");
    return { platform, output_type, ready: true };
  });
  assert.equal(finishedPublishPreflight(full).ok, true);
  assert.deepEqual(finishedPublishPreflight(full.slice(1)).missing, ["Instagram::Reel"]);
  const blocked = finishedPublishPreflight(full.map((row, index) => index === 3 ? { ...row, ready: false } : row));
  assert.deepEqual(blocked.blocked, ["YouTube::Short"]);
  assert.equal(blocked.ok, false);
  assert.deepEqual(finishedPublishPreflight([...full, full[0]]).duplicates, ["Instagram::Reel"]);
  assert.deepEqual(finishedPublishPreflight([...full, { platform: "LinkedIn", output_type: "Video", ready: true }]).unsupported, ["LinkedIn::Video"]);
  assert.equal(finishedPublishPreflight([{ platform: "YouTube", output_type: "Standard Video", ready: true }], { notes: "source-aspect=horizontal" }).ok, true);
});
test("finished-video worker checks approval mode and complete family", () => {
  const start = worker.indexOf("async function azAutoApproveIfReady");
  assert.ok(start >= 0);
  const az = worker.slice(start, worker.indexOf("async function azEnsurePlatformOutputs", start));
  assert.ok(az.includes('publishMode === "approval"'));
  assert.ok(az.includes("finishedPublishPreflight(outputs.map"));
  assert.ok(az.includes("publish_now_preflight"));
  assert.ok(az.includes('scheduled_post_date: "immediate", publish_now: true'));
  const advanceStart = worker.indexOf("async function advanceAzFinishedVideo");
  assert.ok(advanceStart >= 0);
  const advance = worker.slice(advanceStart, worker.indexOf("async function opsForceAzNavyPierTitle", advanceStart));
  assert.ok(advance.includes('finishedPublishMode(studioRequestNotesText(record)) === "approval"'));
});

test("Publish Now uses staged approvals and releases the complete group together", () => {
  const start = worker.indexOf("async function azAutoApproveIfReady");
  const stop = worker.indexOf("async function azEnsurePlatformOutputs", start);
  assert.ok(start >= 0 && stop > start, "finished-video approval function is present");
  const approval = worker.slice(start, stop);
  assert.match(approval, /deferPublishUntilGroupRelease: true/);
  assert.match(approval, /armedCount === outputs\.length/);
  assert.match(approval, /partial_group_release/);
  assert.match(approval, /airtableBatchUpdate\(env, env\.AIRTABLE_OUTPUT_TABLE_ID/);
  assert.match(approval, /released\.length !== outputs\.length/);
  assert.match(approval, /group_release_readback_failed/);
  // Both the atomic reservation and legacy approval write path must defer.
  const approvalWriters = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
  const deferMatches = approvalWriters.match(/Auto_Publish_Enabled: options\.deferPublishUntilGroupRelease !== true/g) || [];
  assert.equal(deferMatches.length, 2, "both atomic and legacy approval paths must hold auto publish before group release");
});

test("Publish Now writes an explicit immediate timestamp rather than an MAE slot", () => {
  const fn = worker.slice(
    worker.indexOf("function studioPublishScheduleFields"),
    worker.indexOf("function studioStorySiblingStamp")
  );
  assert.match(fn, /String\(raw\)\.trim\(\)\.toLowerCase\(\) === "immediate"/);
  assert.match(fn, /requestedIso = new Date\(\)\.toISOString\(\)/);
  assert.match(fn, /if \(immediate && !bumped && !options\.forceWrite\) return \{\}/);
});

test("Staged Publish Now outputs cannot enter the guarded publisher before group release", () => {
  const start = worker.indexOf("function studioPublishCanDispatchNow");
  const end = worker.indexOf("function studioPromoteDuePublishStatus", start);
  assert.ok(start >= 0 && end > start);
  const guard = worker.slice(start, end);
  assert.match(guard, /az-publish-mode=immediate/);
  assert.match(guard, /Auto_Publish_Enabled/);
  assert.match(guard, /return false/);
  const dispatchStart = worker.indexOf("async function studioDispatchApprovedPublishNow");
  const dispatch = worker.slice(dispatchStart, worker.indexOf("async function studioDispatchApprovedPublishTail", dispatchStart));
  assert.ok(dispatch.includes("studioPublishCanDispatchNow(record)"));
});

test("Completed Video only records Publish Now success after a durable Airtable batch release", () => {
  const functionSource = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
  const fn = functionSource.slice(
    functionSource.indexOf("async function azAutoApproveIfReady"),
    functionSource.indexOf("async function azEnsurePlatformOutputs")
  );
  assert.match(fn, /const markGroupReleased = async/);
  assert.match(fn, /az-publish-now-released=/);
  assert.match(fn, /airtableBatchUpdate\(env, env\.AIRTABLE_OUTPUT_TABLE_ID/);
  const release = fn.indexOf("const released = await airtableBatchUpdate");
  const marker = fn.indexOf("await markGroupReleased()", release);
  assert.ok(release >= 0 && marker > release, "receipt must be written after verified release");
});

test("Completed Video Home progress does not confuse staged approval with published release", () => {
  const browser = fs.readFileSync(path.join(here, "../studio-web/assets/app-item4-1008.js"), "utf8");
  assert.match(browser, /azFinishedGroupReleased = \/az-publish-now-released=/);
  assert.match(browser, /azFinishedPublishMode\(\) === "immediate" && azFinishedGroupReleased/);
  assert.match(browser, /return azFinishedPublishMode\(\) === "immediate" \? "group-release" : "queued"/);
  assert.match(browser, /No output dispatches until the complete Publish Now group is released/);
});
