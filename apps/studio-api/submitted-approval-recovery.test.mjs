import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { submittedApprovalAge, verifySubmittedPromotionOwnership, orderSubmittedRecoveryRequests, SUBMITTED_RECOVERY_GRACE_MS } from "./submitted-approval-recovery.mjs";
import { CHICAGO_PROFILE_ID, REVIEW_PILOT, reviewEligibility } from "./rendering-review-policy.mjs";

const requestId = "rec9xNB230bZy3I6K";
const ideaId = "recT6KYjDwCVTsP51";
const parentId = "recPFH9PAvFcFmk6k";
const submittedAt = "2026-10-30T04:37:30.453Z";
const nowMs = Date.parse("2026-10-30T05:08:00.000Z");
const approved = {
  requestId, requestStatus:"Submitted", requestIdeaIds:[ideaId],
  requestParentIds:[], submittedAt, ideaId, ideaContentIds:[parentId],
  ideaPromotedContentId:parentId, ideaRequestIds:[requestId],
  parentId, parentRequestIds:[requestId], nowMs,
};
const probe = change => verifySubmittedPromotionOwnership({ ...approved, ...change });

test("failure injection: I4 committed but PR backlink write was lost; exactly one repair is safe", () => {
  assert.deepEqual(probe({}), {safe:true,reason:"confirmed",parentId,repairLink:true});
  assert.equal(probe({requestParentIds:[parentId]}).repairLink,false);
});
test("failure injection: I4 Content Items update was lost but exact promoted ID survived", () => {
  assert.equal(probe({ideaContentIds:[]}).safe,true);
  assert.equal(probe({ideaContentIds:[],ideaPromotedContentId:""}).reason,"unconfirmed_or_ambiguous_i4_parent");
});
test("failure injection: no I4 result must never submit a second I3 approval", () => {
  assert.equal(probe({ideaContentIds:[],ideaPromotedContentId:""}).safe,false);
  assert.equal(probe({requestStatus:"Ready"}).reason,"not_submitted");
});
test("failure injection: conflicting or duplicate parent identity fails closed", () => {
  assert.equal(probe({ideaContentIds:[parentId,"rec0uVrVeiUM6shp9"]}).safe,false);
  assert.equal(probe({ideaPromotedContentId:"rec0uVrVeiUM6shp9"}).reason,"conflicting_i4_parent");
  assert.equal(probe({requestParentIds:["rec0uVrVeiUM6shp9"]}).reason,"conflicting_request_parent");
  assert.equal(probe({requestParentIds:[parentId,parentId]}).safe,false);
});
test("failure injection: conflicting owner or reverse idea link blocks duplicate output fanout", () => {
  assert.equal(probe({parentRequestIds:["rec0uVrVeiUM6shp9"]}).reason,"ambiguous_parent_owner");
  assert.equal(probe({parentRequestIds:[]}).safe,false);
  assert.equal(probe({parentRequestIds:[requestId,"rec0uVrVeiUM6shp9"]}).safe,false);
  assert.equal(probe({ideaRequestIds:["rec0uVrVeiUM6shp9"]}).reason,"idea_request_mismatch");
  assert.equal(probe({requestIdeaIds:[ideaId,"rec0uVrVeiUM6shp9"]}).safe,false);
});
test("failure injection: fresh submission, missing timestamp, clock skew do not recover", () => {
  assert.equal(probe({nowMs:Date.parse(submittedAt)+SUBMITTED_RECOVERY_GRACE_MS-1}).reason,"within_grace_period");
  assert.equal(probe({nowMs:Date.parse(submittedAt)-1}).reason,"missing_submission_timestamp");
  assert.equal(probe({submittedAt:null}).reason,"missing_submission_timestamp");
  assert.equal(submittedApprovalAge(submittedAt,nowMs)>SUBMITTED_RECOVERY_GRACE_MS,true);
});
test("cron scans Submitted regardless of absent Promoted_Content_Item and readbacks before mutate", () => {
  const source=readFileSync(new URL("./worker-functions-03.mjs",import.meta.url),"utf8");
  const start=source.indexOf("export async function studioHealPromotedMissingFanout");
  const end=source.indexOf("/*__STUDIO_WORKER_END:studioHealPromotedMissingFanout__*/",start);
  const body=source.slice(start,end);
  assert.match(body,/\{Request_Status\}="Submitted"\)/);
  assert.doesNotMatch(body,/\{Request_Status\}="Submitted",\{Promoted_Content_Item\}!=BLANK\(\)/);
  assert.match(body,/verifySubmittedPromotionOwnership\(/);
  assert.match(body,/if \(!proof\.safe\)/);
  assert.match(body,/if \(!latestProof\.safe\) continue/);
  assert.match(body,/Promoted_Content_Item: \[latestProof\.parentId\]/);
  assert.match(body,/Promoted_Content_Item repair failed readback/);
  assert.match(body,/finalizeProductionRequestPromotion\(env, latest\.id, idea, ctx\)/);
  assert.doesNotMatch(body,/promoteProductionRequestViaI3I4\(/);
});
test("reroute only missing records and preserve already rendered siblings on repeated finalization",()=>{
  const source=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const start=source.indexOf("export async function completeProductionRequestPromotionSideEffects");
  const end=source.indexOf("/*__STUDIO_WORKER_END:completeProductionRequestPromotionSideEffects__*/",start);
  const body=source.slice(start,end);
  assert.match(body,/onlyMissing: !productionRequestRevisionOpen\(current\)/);
  assert.match(body,/String\(existingJob\?\.step \|\| ""\) === "escalated"/);
});
test("Rendering Review remains Chicago Instagram Reel only, never LA or auto-admitted",()=>{
  const policy={...REVIEW_PILOT,enabled:true};
  const o={id:"rec0uVrVeiUM6shp9",profile_id:CHICAGO_PROFILE_ID,
    output_type:"Instagram Reel",platform:"Instagram",render_status:"Rendered",
    final_file_id:"drive-video",review_session_exists:false};
  assert.equal(reviewEligibility(o,policy,"manual").allowed,true);
  assert.equal(reviewEligibility({...o,profile_id:"recF7UAn0LkMZZrWZ"},policy,"manual").reason,"OUTSIDE_PILOT_SCOPE");
  assert.equal(reviewEligibility({...o,output_type:"Facebook Reel"},policy,"manual").reason,"OUTSIDE_PILOT_SCOPE");
  assert.equal(reviewEligibility(o,policy,"automatic").reason,"AUTOMATIC_ENROLLMENT_DISABLED");
});

test("Submitted approval recovery is fair; Michigan Avenue never starves behind repeatedly failed older requests", () => {
  const mk = (id, submitted, tried = null) => ({ id, fields: { Submitted_At: submitted, Studio_Approval_Recovery_Last_Attempt_At: tried } });
  const older = mk("older", "2026-10-31T04:34:56.293Z");
  const middle = mk("middle", "2026-10-31T06:11:33.411Z");
  const michigan = mk("michigan", "2026-10-31T15:59:36.831Z");
  const field = (r, key) => r.fields[key];
  assert.deepEqual(orderSubmittedRecoveryRequests([older, middle, michigan], field).map(r => r.id), ["michigan", "middle", "older"]);
  michigan.fields.Studio_Approval_Recovery_Last_Attempt_At = "2026-10-31T17:10:00.000Z";
  assert.deepEqual(orderSubmittedRecoveryRequests([older, middle, michigan], field).map(r => r.id), ["middle", "older", "michigan"]);
  middle.fields.Studio_Approval_Recovery_Last_Attempt_At = "2026-10-31T17:11:00.000Z";
  older.fields.Studio_Approval_Recovery_Last_Attempt_At = "2026-10-31T17:12:00.000Z";
  assert.deepEqual(orderSubmittedRecoveryRequests([older, middle, michigan], field).map(r => r.id), ["michigan", "middle", "older"]);
});

test("Submitted recovery persists failure diagnostics but never fabricates approved status", () => {
  const source = readFileSync(new URL("./worker-functions-03.mjs",import.meta.url), "utf8");
  const body = source.split("export async function studioHealPromotedMissingFanout(")[1].split("/*__STUDIO_WORKER_END:studioHealPromotedMissingFanout__*/")[0];
  assert.match(body, /for \(const pendingRequest of orderSubmittedRecoveryRequests\(pending, f\)\)/);
  assert.match(body, /Studio_Approval_Recovery_Error: String\(error\?\.message \|\| error\)/);
  assert.match(body, /Studio_Approval_Recovery_Last_Attempt_At: new Date\(\)\.toISOString\(\)/);
  assert.match(body, /if \(attemptedSubmitted\) break/);
  assert.doesNotMatch(body, /promoteProductionRequestViaI3I4\(/);
});

test("Submitted approval recovery owns an independent cron task, never two overlapping inline heal calls", () => {
  const entry = readFileSync(new URL("./worker.js", import.meta.url), "utf8");
  const calls = [...entry.matchAll(/studioHealPromotedMissingFanout\(env,/g)];
  assert.equal(calls.length, 1, "exactly one scheduled recovery invocation");
  const independent = entry.indexOf("ctx.waitUntil(studioHealPromotedMissingFanout(env,");
  const publish = entry.indexOf("await studioReconcileOverdueScheduledPublishes(env");
  assert.ok(independent >= 0 && independent < publish, "recovery begins before lengthy publish maintenance");
  assert.match(entry, /airtableCooldownWaitMs\(\) <= AIRTABLE_SLOT_FAIL_FAST_MS\) \{\s*ctx.waitUntil\(studioHealPromotedMissingFanout/);
});

test("atomic Production Output seed uses independent Story lane occupancy and preserves non-Story platform collisions", () => {
  const src = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const start = src.indexOf("export async function studioAtomicApplyPlatformOutputSeedSchedule(");
  const end = src.indexOf("/*__STUDIO_WORKER_END:studioAtomicApplyPlatformOutputSeedSchedule__*/", start);
  assert.ok(start >= 0 && end > start);
  const scheduler = src.slice(start,end);
  assert.match(scheduler, /const seedOccupiedMs = \/story\/i\.test\(outputType\) \? laneMs : platformMs;/);
  assert.match(scheduler, /maeScheduleConflicts\(candidateMs, seedOccupiedMs\)/);
  assert.match(scheduler, /platformOccupiedMs: seedOccupiedMs,/);
  assert.match(scheduler, /const laneOccupied = studioOccupiedForLane\(occupied, platform, outputType\)/);
  assert.match(scheduler, /const platformOccupied = studioOccupiedForPlatform\(occupied, platform\)/);
  // Preserve fail-closed behavior for genuine same-type conflicts.
  assert.match(scheduler, /Requested Platform Output seed schedule conflicts with another output/);
});
