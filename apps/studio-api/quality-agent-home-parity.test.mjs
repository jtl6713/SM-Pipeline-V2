import test from "node:test";
import assert from "node:assert/strict";
import {
  QA_HOME_FAILED_CANDIDATE_FORMULA,
  qaHomePastDueCandidateFormula,
  classifyQualityAgentHomeBuckets,
} from "./quality-agent-home-parity.mjs";

const NOW = Date.parse("2026-11-03T22:00:00Z");
const row = (id, fields = {}) => ({ id, fields: {
  Platform: "Instagram", Review_Status: "Approved",
  Output_Status: "Approved for Publishing", Publish_Status: "Ready to Publish",
  Scheduled_Post_Date: "2026-10-31T10:30:00Z", ...fields,
} });
// The production caller passes mapOutput, which derives Studio_State from ALL
// stage-specific errors. Simulate the mapped result, not a guessed raw status.
const map = (record) => {
  const f = record.fields;
  return {
    id: record.id, platform: f.Platform,
    review_status: f.Review_Status, output_status: f.Output_Status,
    publish_status: f.Publish_Status,
    studio_state: f.Derived_State_For_Test || "Scheduled",
    scheduled_post_date: f.Scheduled_Post_Date,
    do_not_publish: f.Do_Not_Publish === true,
    published_at: f.Published_At,
    platform_post_url: f.Platform_Post_URL,
    manual_published_url: f.Manual_Published_URL,
    tiktok_draft_status: f.TikTok_Draft_Status,
    tiktok_draft_email_sent_at: f.TikTok_Draft_Email_Sent_At,
  };
};

test("independent failed candidates include every status and message driving Home's derived failure state", () => {
  for (const key of ["Output_Status", "Render_Status", "Publish_Status",
    "Asset_Selection_Status", "IG_Carousel_Status", "TikTok_Draft_Status",
    "FB_Publish_Status", "FB_Slideshow_Status", "YouTube_Package_Status",
    "YouTube_Upload_Status", "YouTube_Processing_Status",
    "Publish_Error_Message", "Remotion_Error_Message", "Final_File_Error_Message",
    "IG_Carousel_Error_Message", "Music_Error_Message", "FB_Slideshow_Error_Message",
    "YouTube_Error_Message", "YouTube_Processing_Failure_Reason", "YouTube_Rejection_Reason"]) {
    assert.ok(QA_HOME_FAILED_CANDIDATE_FORMULA.includes("{" + key + "}"), key);
  }
  assert.match(QA_HOME_FAILED_CANDIDATE_FORMULA, /Test_Run_ID/);
});

test("past-due candidate scan includes the Home deadline without changing the 15m diagnostic alert", () => {
  const f = qaHomePastDueCandidateFormula(NOW);
  assert.match(f, /2026-11-03T22:00:00.001Z/);
  assert.doesNotMatch(f, /Publish_Status.*Failed/);
  assert.doesNotMatch(f, /IG_Carousel_Error_Message/);
  assert.match(f, /Review_Status/);
  assert.match(f, /Do_Not_Publish/);
});

test("nine AP1C/AP3C diagnostic Instagram failures are Failed, not Past Due", () => {
  const cases = [
    ["recH63czrufFtUMPt", "QA-IG-AP1C-DUPLICATE-SLIDE-SETS"],
    ["recSiZREAQuoicqm7", "QA-IG-AP3C-AMBIGUOUS-PARENT"],
    ["recHQwaHW6hO38tct", "QA-IG-AP3C-AMBIGUOUS-PARENT"],
    ["rec78FFp3A0JDqCts", "AP1C slide-set mismatch"],
    ["rec3BTOkHqDVLpoaH", "QA-IG-AP1C-DUPLICATE-SLIDE-SETS"],
    ["recv9QTdtuK3pjdeg", "QA-IG-AP1C-DUPLICATE-SLIDE-SETS"],
    ["recHS9wbhrIEiwNsM", "QA-IG-AP3C-AMBIGUOUS-PARENT"],
    ["recl1JDd3hoyCOQLM", "QA-IG-AP3C-AMBIGUOUS-PARENT"],
    ["recNl1yG0Nlvlrw1g", "QA-IG-AP1C-DUPLICATE-SLIDE-SETS"],
  ].map(([id, msg]) => row(id, {
    IG_Carousel_Error_Message: msg, Derived_State_For_Test: "Failed",
  }));
  const buckets = classifyQualityAgentHomeBuckets(cases, cases, map, NOW);
  assert.equal(buckets.failed.length, 9);
  assert.deepEqual(buckets.approved_past_due, []);
});

test("disputed Failed cases are determined from the mapped state, not QA's broad diagnostic trigger", () => {
  const sourceOnly = [
    row("rec6YjfEDasEvnfF4", {Platform:"Facebook",
      Scheduled_Post_Date:"2026-11-18T00:55:00Z",
      FB_Publish_Status:"Retry Pending", Derived_State_For_Test:"Failed"}),
    row("recOYtHNRakWOu8ZT", {Output_Status:"In Production",
      Final_File_Error_Message:"ConnectionResetError", Derived_State_For_Test:"Failed"}),
  ];
  const diagnosticOnly = [
    row("recA52Uk9eLyFOEdi", {Platform:"Facebook",
      Scheduled_Post_Date:"2026-11-05T13:40:00Z",
      Publish_Error_Stage:"FACEBOOK_STORY_RATE_LIMIT_368",
      Derived_State_For_Test:"Scheduled"}),
  ];
  const bucket = classifyQualityAgentHomeBuckets([...sourceOnly,...diagnosticOnly],
    [...sourceOnly,...diagnosticOnly],map,NOW);
  assert.deepEqual(bucket.failed.map(x=>x.id),sourceOnly.map(x=>x.id));
  assert.deepEqual(bucket.approved_past_due,[]);
});

test("due approved output, failed stage, published receipt and emailed TikTok handoff use shared predicates", () => {
  const due = row("recAAAAAAAAAAAAAA");
  const future = row("recBBBBBBBBBBBBBB",{Scheduled_Post_Date:"2026-11-05T13:00:00Z"});
  const published = row("recCCCCCCCCCCCCCC",{Platform_Post_URL:"https://www.instagram.com/p/existing"});
  const held = row("recDDDDDDDDDDDDDD",{Do_Not_Publish:true});
  const emailed = row("recEEEEEEEEEEEEEE",{
    Platform:"TikTok",TikTok_Draft_Status:"Draft Delivered — Manual Action Required",
    TikTok_Draft_Email_Sent_At:"2026-11-03T13:00:00Z",
  });
  const seen = [due,future,published,held,emailed];
  const bucket=classifyQualityAgentHomeBuckets([],seen,map,NOW);
  assert.deepEqual(bucket.approved_past_due.map(x=>x.id),[due.id]);
  assert.deepEqual(bucket.failed,[]);
});

test("duplicate, test-only, partial or inconsistent candidate scans fail closed", () => {
  const one=row("recAAAAAAAAAAAAAA");
  assert.throws(()=>classifyQualityAgentHomeBuckets(null,[],map,NOW),/complete_candidate_scan_required/);
  assert.throws(()=>classifyQualityAgentHomeBuckets([one,one],[],map,NOW),/invalid_or_repeated_record/);
  assert.throws(()=>classifyQualityAgentHomeBuckets([row("recBBBBBBBBBBBBBB",{Test_Run_ID:"test"})],[],map,NOW),/invalid_or_repeated_record/);
  assert.throws(()=>classifyQualityAgentHomeBuckets([one],[],()=>({id:"wrong"}),NOW),/mapping_incomplete/);
});
