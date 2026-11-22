import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { outputContentListFilter } from "./supabase-pipeline-reads.mjs";
import { carouselCronCandidateAdmission } from "./carousel-cron-legacy-admission.mjs";

const now = Date.parse("2026-11-22T04:00:00Z");
const original = () => ({
  id: "recY7doKbEmEohN6g",
  fields: {
    Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
    Review_Status: "Approved", Output_Status: "Approved for Publishing",
    Publish_Status: "Ready to Publish", IG_Carousel_Status: "Ready for Asset Prep",
    Do_Not_Publish: false, Auto_Publish_Enabled: true,
    Scheduled_Post_Date: "2026-11-21T13:30:00Z",
    Issue_2340_AP0C_Gallery_Due_Promotion: {
      source_record_id: "recY7doKbEmEohN6g",
      original_publish_status: "Ready to Schedule",
      reason: "already approved overdue Getty Center carousel; restored exactly four original ordered slides",
    },
  },
});

test("#2340 typed Supabase IG_Carousel_Status drives both equal and empty predicates", () => {
  assert.match(outputContentListFilter("output", '{IG_Carousel_Status}="Ready for Asset Prep"'),
    /ig_carousel_status\.eq\.Ready%20for%20Asset%20Prep/);
  assert.doesNotMatch(outputContentListFilter("output", '{IG_Carousel_Status}="Assets Ready"'),
    /error_messages->>IG_Carousel_Status/);
  assert.match(outputContentListFilter("output", '{IG_Carousel_Status}=""'),
    /ig_carousel_status/);
});

test("#2340 whole AP0C cron formula translates from canonical typed fields", () => {
  const formula = 'AND({Test_Run_ID}=BLANK(),{Platform}="Instagram",{Platform_Output_Type}="Instagram Carousel",{Review_Status}="Approved",{Output_Status}="Approved for Publishing",{Publish_Status}="Ready to Publish",{Do_Not_Publish}=0,{Auto_Publish_Enabled}=1,{Platform_Post_ID}="",IS_BEFORE({Scheduled_Post_Date},NOW()),OR({IG_Carousel_Status}="Ready for Asset Prep",AND({IG_Carousel_Status}="Retry Pending",{Publish_Retry_Eligible}=1)))';
  const sql = outputContentListFilter("output", formula);
  assert.ok(sql, "all legacy formula leaves must be translatable; never silently select zero rows");
  assert.match(sql, /ig_carousel_status\.eq\.Ready%20for%20Asset%20Prep/);
  assert.match(sql, /publish_status\.eq\.Ready%20to%20Publish/);
  assert.match(sql, /scheduled_post_date\.lte\.now\(\)/);
  assert.doesNotMatch(sql, /error_messages->>IG_Carousel_Status/);
});

test("#2340 parent-operation identifiers stay on their real JSONB storage", () => {
  assert.match(
    outputContentListFilter("output", '{IG_Carousel_Parent_Container_ID}!=""'),
    /error_messages->>IG_Carousel_Parent_Container_ID\.not\.is\.null/,
  );
  assert.match(
    outputContentListFilter("output", '{IG_Carousel_Error_Stage}="AP4C Parent Publishing"'),
    /error_messages->>IG_Carousel_Error_Stage/,
  );
});

test("#2340 exact Getty original can continue but other legacy Graph creates stay held", () => {
  assert.deepEqual(carouselCronCandidateAdmission(original(), "ap0c", now), {
    eligible: true, reason: "approved_carousel_continuation",
  });
  assert.equal(carouselCronCandidateAdmission(original(), "ap3c", now).eligible, true);
  for (const mutation of [
    row => { delete row.fields.Issue_2340_AP0C_Gallery_Due_Promotion; },
    row => { row.id = "recAAAAAAAAAAAAAA"; },
    row => { row.fields.Do_Not_Publish = true; },
    row => { row.fields.Auto_Publish_Enabled = false; },
    row => { row.fields.Review_Status = "Changes Requested"; },
    row => { row.fields.Published_At = "2026-11-21T14:00:00Z"; },
    row => { row.fields.Platform_Post_URL = "https://www.instagram.com/p/existing/"; },
    row => { row.fields.Scheduled_Post_Date = "2026-11-23T13:30:00Z"; },
    row => { row.fields.Scheduled_Post_Date = ""; },
  ]) {
    const row = original(); mutation(row);
    assert.equal(carouselCronCandidateAdmission(row, "ap0c", now).eligible, false);
  }
  const olderUnaudited = original();
  olderUnaudited.id = "recAAAAAAAAAAAAAA";
  olderUnaudited.fields.Issue_2340_AP0C_Gallery_Due_Promotion = null;
  assert.equal(carouselCronCandidateAdmission(olderUnaudited, "ap3c", now).reason,
    "historical_provider_operations_need_audit");
});

test("#2340 new carousel may continue without old-archive proof but future slots cannot", () => {
  const newDue = original();
  delete newDue.fields.Issue_2340_AP0C_Gallery_Due_Promotion;
  newDue.fields.Scheduled_Post_Date = "2026-11-22T03:00:00Z";
  assert.equal(carouselCronCandidateAdmission(newDue, "ap0c", now).eligible, true);
  newDue.fields.Scheduled_Post_Date = "2026-11-23T03:00:00Z";
  assert.equal(carouselCronCandidateAdmission(newDue, "ap0c", now).eligible, false);
});

test("#2340 Cron source is Supabase-only and checks provenance before any runner pulse", () => {
  const s = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = s.indexOf("export async function studioReconcileInstagramCarousels(");
  const end = s.indexOf("/*__STUDIO_WORKER_END:studioReconcileInstagramCarousels__*/", start);
  const body = s.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(body, /studioWriteSource\(env\) !== "supabase"/);
  assert.match(body, /carouselCronCandidateAdmission\(row, scan\.stage\)/);
  assert.ok(body.indexOf("carouselCronCandidateAdmission(row, scan.stage)") <
    body.indexOf("await scan.pulse(env, row)"), "no Graph stage before source audit");
});
