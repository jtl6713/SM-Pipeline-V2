import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
// Include bounded Meta 368 autoscheduling QA contracts in the existing test job.
import "./meta-spam-autonomous-schedule.test.mjs";
import { FAILED_OUTPUT_FORMULA, scanOutstandingFailedOutputs, describeFailedOutput, failedOutputRetryGate, facebookRateLimitResetReason, facebookSpamHeldRescheduleReason } from "./failed-output-monitor.mjs";
import {maeScheduleNextSlot,maeScheduleConflicts,maeIsBlackoutLocalTime} from "./mae-schedule.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const worker = fs.readFileSync(path.join(here, "worker-functions-04.mjs"), "utf8");
const healing = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
const factory = fs.readFileSync(path.join(here, "../studio-web/assets/factory-batch-quality-0710.js"), "utf8");
const deployWorkflow = fs.readFileSync(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");
const record = (id, fields = {}) => ({ id, fields });

test("paginated failed-output scan returns every outstanding record, without the newest-12 cap", async () => {
  const rows = Array.from({ length: 235 }, (_, i) => record("rec" + i, {
    Output_ID: i + 1, Content_Profile: ["recCity" + (i % 4)],
  }));
  let calls = 0;
  const found = await scanOutstandingFailedOutputs(async ({ limit, offset }) => {
    calls += 1;
    assert.equal(limit, 100);
    const start = offset ? Number(offset) : 0;
    return { records: rows.slice(start, start + limit),
      offset: start + limit < rows.length ? String(start + limit) : null };
  });
  assert.equal(calls, 3);
  assert.equal(found.length, 235);
  assert.equal(new Set(found.map(row => row.fields.Content_Profile[0])).size, 4);
  assert.equal(found[0].id, "rec0");
  assert.equal(found[234].id, "rec234");
});

test("retired cancelled Stories never enter the active Failed census", () => {
  assert.match(FAILED_OUTPUT_FORMULA, /\\{Output_Status\\}!="Cancelled"/);
  assert.match(FAILED_OUTPUT_FORMULA, /\\{Test_Run_ID\\}=BLANK\\(\\)/);
  // Keep their original error and hold fields intact for the audit trail;
  // classification, not state rewriting, excludes terminally retired rows.
});

test("failed-output scan never transforms a partial/error response into a false zero", async () => {
  await assert.rejects(scanOutstandingFailedOutputs(async () => {
    throw new Error("Airtable unavailable");
  }), /Airtable unavailable/);
  await assert.rejects(scanOutstandingFailedOutputs(async () => ({ records: null })), /invalid page/);
  await assert.rejects(scanOutstandingFailedOutputs(async () => ({ records: [], offset: "repeat" })), /repeated/);
});

test("safe retries respect publication evidence, holds, retry limits, cooldowns and live locks", () => {
  const now = Date.parse("2026-10-20T18:00:00Z");
  assert.equal(failedOutputRetryGate(record("rec1", { Platform_Post_ID: "platform_123" }), { nowMs: now }), "publication_evidence");
  assert.equal(failedOutputRetryGate(record("rec1", { Published_At: "2026-10-19T12:00:00Z" }), { nowMs: now }), "publication_evidence");
  assert.equal(failedOutputRetryGate(record("rec1", { Do_Not_Publish: true }), { nowMs: now }), "publication_held");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Attempt_Count: 3 }), { nowMs: now }), "retry_limit");
  assert.equal(failedOutputRetryGate(record("rec1", { Studio_Publish_Dispatch_Count: 3 }), { nowMs: now }), "retry_limit");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Next_Retry_At: "2026-10-20T19:00:00Z" }), { nowMs: now }), "cooldown");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Locked_By: "runner", Publish_Locked_At: "2026-10-20T17:58:00Z" }), { nowMs: now }), "publish_locked");
  assert.equal(failedOutputRetryGate(record("rec1", { Publish_Status: "Failed" }), { nowMs: now }), null);
});

test("every raw failure has a visible identity, diagnostic and recommended action", () => {
  const item = describeFailedOutput(record("recLA", {
    Output_ID: 1703, Platform: "Instagram", Output_Status: "Failed",
    Remotion_Error_Message: "Download failed", Content_Profile: ["recLA"],
  }));
  assert.equal(item.output_id, "1703");
  assert.equal(item.profile_id, "recLA");
  assert.match(item.error, /Download failed/);
  assert.match(item.action, /inspect/i);
  assert.equal(item.recovery, "needs_attention");
});

test("known live failure signatures get safe root-cause actions instead of blind retries", () => {
  const cases = [
    ["AP1C slide-set mismatch", "needs_attention", /actual carousel slides/i],
    ["Only photo or video can be accepted as media type", "needs_attention", /unsupported carousel slide media/i],
    ["AP3P parent container terminal state", "healer_eligible", /parent-container recreation/i],
    ["Facebook rate limit 1390008", "cooldown", /later MAE Facebook slot/i],
  ];
  for (const [error, recovery, action] of cases) {
    const item = describeFailedOutput(record("recKnown", {
      Output_ID: 99, Platform: "Instagram", Publish_Status: "Failed",
      Publish_Error_Message: error,
    }));
    assert.equal(item.recovery, recovery, error);
    assert.match(item.action, action, error);
  }
});

test("Desk and Factory use the complete census and show scan failures as unavailable", () => {
  assert.match(worker, /loadStudioFailedOutputSnapshot/);
  assert.match(worker, /scanOutstandingFailedOutputs/);
  assert.match(worker, /status: "unavailable"/);
  assert.match(worker, /output_failures: outputFailures/);
  assert.match(worker, /output_failed_unclassified/);
  assert.match(factory, /Unresolved output failures across all profiles/);
  assert.match(factory, /profile_name \|\| item\.profile_id/);
  assert.match(factory, /output_failures\?\.status !== "ok"/);
  assert.match(factory, /Unresolved output count is unknown/);
  assert.match(healing, /failedOutputRetryGate\(row\)/);
  assert.match(healing, /scanOutstandingFailedOutputs/);
  assert.match(deployWorkflow, /failed-output-census/);
  assert.match(deployWorkflow, /\.output_failures\.status=="ok"/);
});

test("render recovery counts only eligible failed-render attempts and remains bounded", () => {
  const declaration = healing.indexOf("let failedRenderRetries = 0;");
  const loopEnd = healing.indexOf('console.log("Studio stuck-render heal"', declaration);
  assert.ok(declaration > 0 && loopEnd > declaration, "failed-render recovery loop must exist");
  assert.doesNotMatch(healing.slice(0, declaration), /failedRenderRetries\s*\+=\s*1/);
  const loop = healing.slice(declaration, loopEnd);
  assert.match(loop, /if \(failedRenderRetries >= 6\) break/);
  assert.match(loop, /if \(failedOutputRetryGate\(row\)\) continue/);
  assert.match(loop, /failedRenderRetries\s*\+=\s*1;[\s\S]*?airtableFetch/);
});

test("Facebook rate-limit failures can return to Approved only with safe publication and media evidence", () => {
  const safe = record("recFacebook", {
    Platform: "Facebook", Review_Status: "Approved", Publish_Status: "Failed",
    Publish_Error_Message: "Facebook rate limit (368/1390008): Try later",
    Final_File_ID: "fileReady", Render_Status: "Completed", Publish_Attempt_Count: 1,
  });
  assert.equal(facebookRateLimitResetReason(safe), null);
  assert.equal(describeFailedOutput(safe).can_return_to_approved, true);
  const blocked = (changes, reason) =>
    assert.equal(facebookRateLimitResetReason(record("recFacebook", { ...safe.fields, ...changes })), reason);
  blocked({ Platform: "Instagram" }, "not_facebook");
  blocked({ Publish_Error_Message: "OAuth token expired" }, "not_rate_limited");
  blocked({ Review_Status: "Needs Review" }, "approval_not_confirmed");
  blocked({ Platform_Post_ID: "remote_post" }, "publication_evidence");
  blocked({ FB_Post_ID: "remote_post" }, "publication_evidence");
  blocked({ FB_Publish_Status: "Published" }, "publication_evidence");
  blocked({ FB_Slideshow_Status: "Published" }, "publication_evidence");
  blocked({ Do_Not_Publish: true }, "publication_held");
  blocked({ Publish_Attempt_Count: 3 }, "retry_limit");
  blocked({ Studio_Publish_Dispatch_Count: 3 }, "retry_limit");
  blocked({ Render_Status: "Failed" }, "render_failed");
  blocked({ Final_File_ID: "", Final_File_URL: "" }, "finished_media_missing");
  blocked({ Publish_Locked_By: "runner", Publish_Locked_At: new Date().toISOString() }, "publish_locked");
});

test("Facebook QA reapproval uses original protected scheduling route and cooldown-aware MAE", () => {
  assert.match(worker, /quality_rate_limit_recovery === true/);
  assert.match(worker, /facebookRateLimitResetReason\(authoritative\)/);
  assert.match(worker, /qualityFacebookRecoverySlot\(/);
  assert.match(worker, /48 \* 60 \* 60 \* 1000/);
  assert.match(worker, /gapMs: heldOnly \? 90 \* 60 \* 1000 : 12 \* 60 \* 60 \* 1000/);
  assert.match(worker, /Output_Status: "Approved for Publishing"/);
  assert.match(worker, /Publish_Status: "Ready to Schedule"/);
  assert.match(worker, /runAtomicScheduleTransaction/);
  assert.match(worker, /fresh_output_failures/);
  assert.match(factory, /data-qa-open/);
  assert.match(factory, /data-qa-reapprove-all/);
  assert.match(factory, /window\.confirm/);
  assert.match(factory, /for \(let i = 0; i < allowed.length; i\+\+\)/);
});

test("Facebook QA preflight cannot mutate or publish and returns diagnostic stage", () => {
  const start = worker.indexOf("if (payload?.quality_rate_limit_preview === true)");
  const end = worker.indexOf("if (scheduleReservationLaneEnabled(env, reservationProfile?.id, platform))", start);
  assert.ok(start > 0 && end > start);
  const preview = worker.slice(start, end);
  assert.match(preview, /qualityFacebookRecoverySlot/);
  assert.match(preview, /studioOccupiedSchedulesOrEmpty/);
  assert.match(preview, /stage = "read_occupancy"/);
  assert.match(preview, /quality_rate_limit_preview: true/);
  assert.doesNotMatch(preview, /method: "PATCH"|runAtomicScheduleTransaction|studioDispatchApprovedPublishNow/);
  assert.match(factory, /quality_rate_limit_preview: true/);
  assert.match(factory, /if \(status === "uncertain"\)/);
  assert.match(factory, /error\.httpStatus >= 500/);
  const workflow = fs.readFileSync(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");
  assert.match(workflow, /quality_facebook_preflight_http/);
  assert.match(workflow, /quality-facebook-preview/);
});

test("Cross-module MAE occupancy resolves the authoritative schedule reader", () => {
  const source02 = fs.readFileSync(path.join(here, "worker-functions-02.mjs"), "utf8");
  const source01 = fs.readFileSync(path.join(here, "worker-functions-01.mjs"), "utf8");
  assert.ok(source02.includes("studioLoadOccupiedSchedules,"));
  assert.ok(source02.includes('} from "./worker-functions-01.mjs";'));
  assert.match(source01, /export async function studioLoadOccupiedSchedules\(/);
  assert.match(source02, /return studioLoadOccupiedSchedules\(env, options\)/);
});


test("Quality Agent recognizes doubled Instagram carousel links without guessing canonical slides", () => {
  const result = describeFailedOutput(record("recYjLdlux4hAvZts", {
    Output_ID: 7856, Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
    Output_Status: "Approved for Publishing", Render_Status: "Native Photo Route",
    IG_Carousel_Status: "Assets Ready", IG_Carousel_Retry_Count: 31,
    IG_Carousel_Error_Message: "AP1C slide-set mismatch: final view 8, public-ready 8, expected 4;",
    Image_Count: 4, "Carousel Slides": Array.from({ length: 8 }, (_, i) => "rec" + i),
  }));
  assert.equal(result.signature, "QA-IG-AP1C-DUPLICATE-SLIDE-SETS");
  assert.equal(result.recovery, "needs_attention");
  assert.match(result.action, /immutable ordered selected-asset manifest/);
  assert.match(result.action, /never delete source media/);
});

test("Quality Agent quarantines ambiguous Meta parent HTTP 500 rather than blind-recreating", () => {
  const result = describeFailedOutput(record("recAlU4bLFmWDBV4H", {
    Output_ID: 7894, Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
    IG_Carousel_Error_Stage: "AP3C Parent Creation",
    IG_Carousel_Error_Message: "AP3C parent creation failed. HTTP 500: An unexpected error has occurred.",
    IG_Carousel_Retry_Count: 62, Image_Count: 4,
  }));
  assert.equal(result.signature, "QA-IG-AP3C-AMBIGUOUS-PARENT");
  assert.equal(result.recovery, "needs_attention");
  assert.match(result.action, /reconcile any remotely created parent/);
  assert.doesNotMatch(result.action, /blind retry/i);
});

test("Quality Agent exposes expired media despite historical FINISHED child state", () => {
  const result = describeFailedOutput(record("recYgGHJOmSQMqrFH", {
    Output_ID: 6934, Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
    IG_Carousel_Status: "Children Processing", IG_Carousel_Children_Ready_Count: 0,
    IG_Carousel_Parent_Response_JSON: JSON.stringify({
      error: { error_subcode: 2207020, error_user_title: "Expired Media" },
    }),
  }));
  assert.equal(result.signature, "QA-IG-EXPIRED-CHILD-STATE-DRIFT");
  assert.equal(result.recovery, "needs_attention");
  assert.match(result.action, /Poll every saved child container ID/);
  assert.match(FAILED_OUTPUT_FORMULA, /IG_Carousel_Parent_Response_JSON/);
});

test("Published carousels are reconciled, never reprocessed from stale AP3C errors", () => {
  const result = describeFailedOutput(record("recPublished", {
    Output_ID: 99, Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
    Platform_Post_ID: "179020000", IG_Carousel_Error_Message: "AP3C parent creation failed. HTTP 500",
  }));
  assert.equal(result.signature, null);
  assert.equal(result.recovery, "reconcile");
});

test("Desk and Factory quality feed promotes exact Instagram classifications to first-class checks", () => {
  for (const kind of ["ig_duplicate_slide_sets", "ig_ambiguous_parent", "ig_expired_child_drift", "ig_retry_storm"]) {
    assert.match(worker, new RegExp('"' + kind + '"'));
  }
});


test("Quality Agent recognizes Facebook FB0 doubled source links without a generic publish error", () => {
  for (const [id, actual, expected] of [[6982,8,4],[7040,8,4],[7060,2,1]]) {
    const found = describeFailedOutput(record("recFb" + id, {
      Output_ID:id, Platform:"Facebook", Platform_Output_Type:"Facebook Photo Set",
      Output_Status:"Approved for Publishing", Publish_Status:"Ready to Publish",
      FB_Publish_Status:"Manual Fallback Required", Manual_Fallback_Required:true,
      Publish_Error_Stage:"FB0_ASSETS", Image_Count:expected,
      "Carousel Slides":Array.from({length:actual},(_,i)=>"rec"+i),
    }));
    assert.equal(found.signature, "QA-FB0-DOUBLE-SLIDE-SETS");
    assert.equal(found.recovery, "healer_eligible");
    assert.match(found.action,/FB0 can repair duplicates automatically/);
    assert.match(found.action,/Needs Eyes/);
  }
  assert.match(FAILED_OUTPUT_FORMULA,/Manual_Fallback_Required/);
  assert.match(worker,/fb_duplicate_slide_sets/);
});

test("FB0 cannot automatically repair an incomplete or published Facebook output", () => {
  const bad = describeFailedOutput(record("recFbIncomplete",{
    Platform:"Facebook", FB_Publish_Status:"Manual Fallback Required",
    Publish_Error_Stage:"FB0_ASSETS", Image_Count:4,
    "Carousel Slides":["recOnlyOne"], 
  }));
  assert.notEqual(bad.signature,"QA-FB0-DOUBLE-SLIDE-SETS");
  const published = describeFailedOutput(record("recFbPublished",{
    Platform:"Facebook", FB_Publish_Status:"Manual Fallback Required",
    Publish_Error_Stage:"FB0_ASSETS", Image_Count:1,
    "Carousel Slides":["rec1","rec2"],Platform_Post_ID:"known"
  }));
  assert.notEqual(published.signature,"QA-FB0-DOUBLE-SLIDE-SETS");
});


test("failed-output diagnostic uses actual title and safe stored fallback",()=>{
 const actual=describeFailedOutput(record("recExample",{
   Output_ID:3374,Output_Title:"Crandon Park Nature Frames",Publish_Status:"Failed",
 }));
 assert.equal(actual.title,"Crandon Park Nature Frames");
 const fallback=describeFailedOutput(record("recExample",{
   Output_Title:"",Title_Text:"Alternative stored title",Publish_Status:"Failed",
 }));
 assert.equal(fallback.title,"Alternative stored title");
});

test("Facebook Meta 368 protection can reserve a later slot without unholding or reapproval",()=>{
 const active={Platform:"Facebook",Platform_Output_Type:"Facebook Reel",Review_Status:"Approved",
  Output_Status:"Approved for Publishing",Publish_Status:"Failed",Render_Status:"Rendered",
  Publish_Error_Stage:"FBS3_RATE_LIMIT",
  Publish_Error_Message:"Facebook rate limit (368/1390008): We limit how often you can post.",
  Studio_Output_Notes:"QA-1050 HARD NO-GRAPH-CREATE HOLD | exact output",
  Final_File_URL:"https://drive.google.com/file/d/a/view",Publish_Attempt_Count:1,
  Studio_Publish_Dispatch_Count:1,Do_Not_Publish:true};
 const row=record("recAAAAAAAAAAAAAA",active);
 assert.equal(facebookSpamHeldRescheduleReason(row),null);
 assert.equal(describeFailedOutput(row).can_reschedule_spam_held,true);
 for(const [change,reason] of [
   [{Platform_Output_Type:"Facebook Story"},"not_active_facebook_reel"],
   [{Do_Not_Publish:false},"not_protective_hold"],
   [{Studio_Output_Notes:"operator other hold"},"unknown_hold_provenance"],
   [{Studio_Output_Notes:active.Studio_Output_Notes+" SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION"},"already_rescheduled_pending_verification"],
   [{Output_Status:"Cancelled",Review_Status:"Skipped"},"not_approved_failed"],
   [{Platform_Post_ID:"already_posted"},"publication_evidence"],
   [{Publish_Attempt_Count:3},"retry_limit"],
   [{Publish_Locked_By:"runner",Publish_Locked_At:new Date().toISOString()},"publish_locked"],
 ]) assert.equal(facebookSpamHeldRescheduleReason(record("recAAAAAAAAAAAAAA",{...active,...change})),reason);
});
test("reschedule-on-hold uses the atomic MAE route but never clears spam error, hold or publishes",()=>{
 assert.match(worker,/quality_rate_limit_hold_reschedule === true/);
 assert.match(worker,/facebookSpamHeldRescheduleReason\(authoritative\)/);
 assert.match(worker,/runAtomicScheduleTransaction/);
 assert.match(worker,/SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION/);
 assert.match(worker,/Do_Not_Publish: true, Publish_Retry_Eligible: false/);
 assert.match(worker,/if \(!holdReschedule && due/);
});

test("Meta spam held-only MAE picks available overflow instead of claiming 12-hour posting capacity", () => {
  const code=worker.slice(worker.indexOf("function qualityFacebookRecoverySlot("),
    worker.indexOf("export async function scheduleStudioPublishOutput("));
  assert.match(code,/heldOnly \? 90 \* 60 \* 1000 : 12 \* 60 \* 60 \* 1000/);
  assert.match(code,/Date\.now\(\) \+ 48 \* 60 \* 60 \* 1000/);
  const {now,occupied}=(()=> {
    const start=Date.parse("2026-10-28T00:00:00.000Z");
    // Model a routinely crowded LA Facebook calendar with 3 normal posts
    // each day, so no 12-hour gap exists even over several days.
    const occupied=[];
    for(let day=0;day<7;day++)for(const hour of [12,18,23])
      occupied.push(start+day*86400000+hour*3600000);
    return {now:new Date(start),occupied};
  })();
  assert.ok(occupied.length>0 && now instanceof Date);
  // Explicit model: 3 LA posts/day, all priority slots taken.
  // Twelve-hour spacing cannot fit, but a guarded future reservation at
  // the usual 90-minute platform distance has available overflow.
  const today=new Date("2026-06-03T11:55:00.000Z");
  const dense=[];
  for(let d=1;d<=7;d++){
    const start=Date.parse("2026-06-03T00:00:00.000Z")+(d-1)*86400000;
    for(const [h,m] of [[12,30],[18,30],[23,30]]) dense.push(start+h*3600000+m*60000);
  }
  const common={now:today,timeZone:"America/Los_Angeles",horizonDays:7,
    occupiedMs:dense,platformOccupiedMs:dense};
  const blocked=maeScheduleNextSlot({...common,gapMs:12*3600000});
  const held=maeScheduleNextSlot({...common,gapMs:90*60000});
  assert.equal(blocked.ok,false,"12-hour full-calendar gap should have no capacity");
  assert.equal(held.ok,true,"guarded held-only 90-minute clearance fits overflow");
  assert.ok(Date.parse(held.iso)>today.getTime());
  assert.equal(maeIsBlackoutLocalTime(Date.parse(held.iso),"America/Los_Angeles"),false);
  assert.equal(maeScheduleConflicts(Date.parse(held.iso),dense,90*60000),false);
  const codePreview=worker.slice(worker.indexOf("if (payload?.quality_rate_limit_preview === true)"),
    worker.indexOf("if (scheduleReservationLaneEnabled(env, reservationProfile?.id, platform))"));
  assert.match(codePreview,/heldOnly:holdReschedule/);
  assert.match(worker,/held_spam_rescheduled_pending_verification: holdReschedule/);
  assert.match(worker,/Do_Not_Publish: true, Publish_Retry_Eligible: false/);
  assert.match(worker,/if \(!holdReschedule && due && approved/);
});

test("Meta 368 scheduling uses existing legacy MAE only when the global atomic authority is off",()=>{
  const from=worker.indexOf("export async function scheduleStudioPublishOutput(");
  const to=worker.indexOf("/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/",from);
  const section=worker.slice(from,to);
  assert.ok(from>0&&to>from);
  assert.match(section,/holdReschedule && scheduleReservationAuthorityEnabled\(env\)/);
  assert.match(section,/!scheduleReservationLaneEnabled\(env, reservationProfile\?\.id, platform\)/);
  assert.match(section,/requireComplete: true/);
  assert.match(section,/qualityFacebookRecoverySlot\(existing,/);
  assert.match(section,/if \(holdReschedule\) \{[\s\S]*?const verified = await airtableFetch/);
  assert.match(section,/actual !== chosen/);
  assert.match(section,/f\(verified,"Do_Not_Publish"\) !== true/);
  assert.match(section,/f\(verified,"Publish_Status"\)\|\|""\) !== "Failed"/);
  assert.match(section,/f\(verified,"Publish_Error_Stage"\)\|\|""\) !== "FBS3_RATE_LIMIT"/);
  assert.match(section,/if \(!holdReschedule && due && approved/);
  assert.match(section,/else if \(due && !holdReschedule\)/);
});

test("Meta 368 held-only commit acknowledges verified Airtable without invoking general publish or output serialization",()=>{
 const start=worker.indexOf("export async function scheduleStudioPublishOutput(");
 const end=worker.indexOf("/*__STUDIO_WORKER_END:scheduleStudioPublishOutput__*/",start);
 const section=worker.slice(start,end);
 const ack=section.indexOf("held spam MAE schedule Supabase mirror failed");
 const dispatch=section.indexOf("const due = studioPublishIsDue(updated)");
 assert.ok(ack>0 && dispatch>ack);
 const scoped=section.slice(ack,dispatch);
 assert.match(scoped,/return respond\(request, env, \{/);
 assert.match(scoped,/held_spam_rescheduled_pending_verification: true/);
 assert.match(scoped,/scheduled_post_date: f\(updated, "Scheduled_Post_Date"\)/);
 assert.match(scoped,/do_not_publish: f\(updated, "Do_Not_Publish"\) === true/);
 assert.match(scoped,/publish_status: String\(f\(updated, "Publish_Status"\) \|\| ""\)/);
 assert.match(scoped,/dispatch: null/);
 assert.doesNotMatch(scoped,/studioDispatchApprovedPublishNow|mapOperationsOutput/);
});

test("held Meta 368 Reels with reserved slots remain blocked but show verification work",()=>{
 const fields={
   Output_ID:2762,Platform:"Facebook",Platform_Output_Type:"Facebook Reel",
   Output_Status:"Approved for Publishing",Review_Status:"Approved",Publish_Status:"Failed",
   Publish_Error_Stage:"FBS3_RATE_LIMIT",
   Publish_Error_Message:"Facebook rate limit (368/1390008)",
   Do_Not_Publish:true,Publish_Attempt_Count:1,Studio_Publish_Dispatch_Count:1,
   Scheduled_Post_Date:"2026-10-28T14:00:00Z",
   Studio_Output_Notes:"QA-1050 HARD NO-GRAPH-CREATE HOLD; SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION"
 };
 const item=describeFailedOutput(record("recQjUNjlxZnuODrE",fields),Date.parse("2026-10-26T18:00:00Z"));
 assert.equal(item.signature,"QA-FB-368-RESCHEDULED-HELD");
 assert.equal(item.recovery,"verification_pending");
 assert.equal(item.can_return_to_approved,false);
 assert.equal(item.return_to_approved_blocked,"publication_held");
 assert.match(item.error,/reserved future slot/);
 assert.match(item.action,/Preserve the hold/);
 for(const change of [
   {Studio_Output_Notes:"ordinary editorial hold"},
   {Platform_Post_ID:"already-published-id"},
   {Platform_Output_Type:"Facebook Story",Output_Status:"Cancelled"},
 ]){
   const altered=describeFailedOutput(record("recQjUNjlxZnuODrE",{...fields,...change}));
   assert.notEqual(altered.signature,"QA-FB-368-RESCHEDULED-HELD");
 }
});
