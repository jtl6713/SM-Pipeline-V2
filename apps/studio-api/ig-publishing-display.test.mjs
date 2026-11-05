import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { staleInstagramPublishingDisplay } from "./ig-publishing-display.mjs";

const nowMs = Date.parse("2026-11-05T02:00:00.000Z");
const old = "2026-11-03T00:52:35.000Z";
const refused = "QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation (publication_lock_changed)";
const base = {
  Platform: "Instagram", Platform_Output_Type: "Instagram Reel",
  Output_Status: "Approved for Publishing", Publish_Status: "Publishing",
  Review_Status: "Approved", Last_Publish_Attempt_At: old,
  Publish_Locked_By: "", Publish_Locked_At: "", Publish_Started_At: "",
  Output_Notes: refused,
};
const record = (fields = {}) => ({id:"recAAAAAAAAAAAAAA",fields:{...base,...fields}});

test("released legacy no-ID Reel shows verification, not fake 85 percent", () => {
  const r = staleInstagramPublishingDisplay(record(),{nowMs});
  assert.equal(r.label,"Needs Verification");
  assert.equal(r.lock_state,"released_legacy");
  assert.equal(r.provider_progress_verified,false);
  assert.equal(r.remote_create_authorized,false);
});
test("stale held AP1-IG lock shows verification, never safe retry", () => {
  const r=staleInstagramPublishingDisplay(record({
    Publish_Locked_By:"AP1-IG",Publish_Locked_At:old,Publish_Started_At:old,
    Output_Notes:"not a false-lock refusal",
  }),{nowMs});
  assert.equal(r.lock_state,"ap1_ig_held");
  assert.equal(r.remote_create_authorized,false);
});
test("new attempt is still active, and released history without exact refusal does not qualify", () => {
  const recent=new Date(nowMs-120000).toISOString();
  assert.equal(staleInstagramPublishingDisplay(record({Last_Publish_Attempt_At:recent}),{nowMs}),null);
  assert.equal(staleInstagramPublishingDisplay(record({Output_Notes:"publisher retried normally"}),{nowMs}),null);
  assert.equal(staleInstagramPublishingDisplay(record({Publish_Locked_By:"different-runner"}),{nowMs}),null);
  assert.equal(staleInstagramPublishingDisplay(record({Publish_Started_At:old}),{nowMs}),null);
  assert.equal(staleInstagramPublishingDisplay(record({Last_Publish_Attempt_At:"bad"}),{nowMs}),null);
});
test("remote IDs, published receipts, non-IG rows, and holds are not masked",()=>{
  const cases=[
    {Platform_Post_ID:"18168690085479740"},{Platform_Media_ID:"18127559140783117"},
    {Platform_Post_URL:"https://www.instagram.com/reel/test/"},{Published_At:old},
    {Manual_Published_URL:"https://www.instagram.com/reel/test/"},
    {Platform:"YouTube"},{Platform_Output_Type:"Instagram Carousel"},
    {Publish_Status:"Published"},{Output_Status:"Published"},
    {Review_Status:"Changes Requested"},{Do_Not_Publish:true},
    {Studio_Render_Review_Hold_Active:true},{Studio_Render_Review_Hold_ID:"h1"},
    {Studio_Review_Hold_ID:"h2"},{Test_Run_ID:"test1"},
    {Replace_Transaction_ID:"rep1"},
  ];
  for(const patch of cases) assert.equal(staleInstagramPublishingDisplay(record(patch),{nowMs}),null,JSON.stringify(patch));
});
test("fresh held lock is not stale just because an older attempt exists",()=>{
  const r=record({Publish_Locked_By:"AP1-IG",
    Publish_Locked_At:new Date(nowMs-5000).toISOString(),Publish_Started_At:old});
  assert.equal(staleInstagramPublishingDisplay(r,{nowMs}),null);
});
test("Worker mapping is presentation-only and preserves canonical Airtable publishing",()=>{
  const src=fs.readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  assert.match(src,/staleInstagramPublishingDisplay\(record\)/);
  assert.match(src,/publish_status: f\(record, "Publish_Status"\)/);
  assert.match(src,/studio_progress_percent: stalePublishDisplay \? null : outputProgressPercent\(/);
  assert.match(src,/platform_publish_status: stalePublishDisplay\?\.label \|\| platformPublishStatus\(record\)/);
});
