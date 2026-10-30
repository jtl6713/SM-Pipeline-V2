import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { submittedApprovalAge, verifySubmittedPromotionOwnership, SUBMITTED_RECOVERY_GRACE_MS } from "./submitted-approval-recovery.mjs";
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
