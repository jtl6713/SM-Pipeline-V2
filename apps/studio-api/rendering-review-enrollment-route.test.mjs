import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {reviewEnrollmentWriteEnabled} from "./rendering-review-enrollment-http.mjs";

const worker=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
const begin=worker.indexOf('const enrollmentMatch = ');
const end=worker.indexOf('const feedbackMatch = ',begin);
assert.ok(begin>=0&&end>begin,"Missing mounted protected enrollment boundary");
const route=worker.slice(begin,end);

test("Worker refuses enrollment with any missing protected deployment gate",()=>{
  assert.equal(reviewEnrollmentWriteEnabled({}),false);
  const keys=[
    "RENDERING_REVIEW_ENROLL_WRITES_ENABLED",
    "RENDERING_REVIEW_MANUAL_ADMISSION_ENABLED",
    "RENDERING_REVIEW_INTEGRATION_VERIFIED",
    "RENDERING_REVIEW_DISPATCH_FENCE_VERIFIED",
    "RENDERING_REVIEW_SCHEDULER_VACATE_VERIFIED",
  ];
  const env=Object.fromEntries(keys.map(x=>[x,"true"]));
  for(const key of keys){
    const one={...env};delete one[key];
    assert.equal(reviewEnrollmentWriteEnabled(one),false);
    one[key]=true;assert.equal(reviewEnrollmentWriteEnabled(one),false);
  }
  assert.equal(reviewEnrollmentWriteEnabled(env),true);
  assert.ok(route.indexOf("if (!reviewEnrollmentWriteEnabled(env))")<
    route.indexOf("composeRenderingReviewEnrollmentOperations"));
});
test("authenticated Chicago membership and original Studio write gate are passed to handler",()=>{
  assert.match(route,/reviewAuthorizedProfiles\(env, authorization\)/);
  assert.match(worker.slice(worker.indexOf('if (url.pathname.startsWith("/api/rendering-review/"))'),begin),
    /requirePermission\(authorization, "outputs_review"\)/);
  assert.match(route,/handleRenderingReviewEnrollRequest\(/);
  assert.match(route,/assertWriteRequest,/);
  assert.match(route,/authorizeChicagoMembership: async \(\) => chicagoMembership/);
});
test("schedule vacate occurs under shared output lease and original MAE lane adapter",()=>{
  assert.match(route,/withOutputApprovalLock,/);
  assert.match(route,/composeRenderingReviewEnrollmentOperations/);
  assert.match(route,/writeVacateUnderLane: async/);
  assert.match(route,/method: "PATCH"/);
  assert.match(route,/Studio_Render_Review_Hold_ID/);
  assert.match(route,/Studio_Render_Review_Hold_Owner/);
  assert.match(route,/Publish_Locked_By/);
  assert.match(route,/Platform_Media_ID/);
  assert.match(route,/signal\?\.aborted/);
});
test("enrollment route cannot trigger producer impersonation or public posting",()=>{
  assert.match(route,/authorizeEvent: async \(\) => false/);
  assert.doesNotMatch(route,/graph\.publish\(|studioDispatchApprovedPublishNow|studioPulseAp1IgReel/);
  assert.doesNotMatch(route,/RENDERING_REVIEW_SAMPLE_PERCENT|sample_percent/);
});
test("non-authoritative mirror issues are logged without changing verified Airtable vacate",()=>{
  assert.match(route,/syncAirtableOutputRowToSupabase/);
  assert.match(route,/catch \(error\)/);
  assert.doesNotMatch(route,/clearReviewHold|releaseReviewHold|APPROVE_ATTEMPT/);
});

test("only Factory submission with comments can mount the enrollment operation",()=>{
  assert.match(route,/rendering-review\\/factory\\/outputs/);
  assert.doesNotMatch(route,/\\/enroll\\$/);
  assert.doesNotMatch(worker,/const enrollmentMatch = \/\\^\\\\\\/api\\\\\\/rendering-review\\\\\\/outputs/);
  assert.match(worker,/request-changes\\$\\/\\.test\\(url\\.pathname\\)/);
});
