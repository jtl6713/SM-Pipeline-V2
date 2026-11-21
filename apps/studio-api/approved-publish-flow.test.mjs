import assert from "node:assert/strict";
import test from "node:test";
import { assessFreshSupabasePublish } from "./approved-publish-flow.mjs";

const nowMs = Date.parse("2026-11-20T19:00:00Z");
const fresh = () => ({
  id: "rec12345678901234",
  fields: {
    Platform: "Instagram", Platform_Output_Type: "Instagram Reel",
    Review_Status: "Approved", Output_Status: "Approved for Publishing",
    Publish_Status: "Ready to Publish", Auto_Publish_Enabled: true,
    Do_Not_Publish: false, Scheduled_Post_Date: "2026-11-20T18:30:00Z",
    Publish_Asset_URL: "https://example.com/post.mp4",
    Output_Caption: "A ready caption",
  },
});
const check = row => assessFreshSupabasePublish(row, { nowMs });

test("only a genuinely fresh, due, complete output enters publisher", () => {
  assert.deepEqual(check(fresh()), { eligible: true, reason: "fresh_approved_due_unattempted" });
});
test("an ambiguous prior dispatch is verification work, never another upload", () => {
  for (const key of ["Studio_Publish_Dispatch_Count", "Publish_Attempt_Count"]) {
    const row = fresh(); row.fields[key] = 1;
    assert.equal(check(row).reason, "previous_attempt_requires_provider_reconciliation");
  }
  for (const key of ["Last_Publish_Attempt_At", "Publish_Started_At", "Studio_Publish_Dispatch_At",
    "Platform_Media_ID", "IG_Story_Container_ID", "Platform_Post_ID", "YouTube_Video_ID"]) {
    const row = fresh(); row.fields[key] = "prior-identity-or-time";
    assert.equal(check(row).reason, "prior_provider_or_dispatch_identity");
  }
});
test("never override retry prohibition, cooldown or active lock", () => {
  let row = fresh(); row.fields.Publish_Retry_Eligible = false;
  assert.equal(check(row).reason, "retry_explicitly_prohibited");
  row = fresh(); row.fields.Publish_Next_Retry_At = "2099-01-01T00:00:00Z";
  assert.equal(check(row).reason, "retry_cooldown");
  row = fresh(); row.fields.Publish_Locked_By = "publisher";
  assert.equal(check(row).reason, "active_publish_lock");
});
test("failed, held, unapproved and incomplete records cannot move to dispatch", () => {
  for (const [key, value] of [
    ["Publish_Status", "Failed"], ["Do_Not_Publish", true], ["Review_Status", "Changes Requested"],
    ["FB_Publish_Status", "Manual Fallback Required"], ["Output_Caption", ""], ["Publish_Asset_URL", ""],
    ["Published_At", "2026-11-20T18:00:00Z"]
  ]) {
    const row = fresh(); row.fields[key] = value;
    assert.equal(check(row).eligible, false, key);
  }
});
test("TikTok's lead window is honored and only approved fresh media may enter", () => {
  let row = fresh();
  row.fields.Platform = "TikTok";
  row.fields.Scheduled_Post_Date = "2026-11-20T19:14:00Z";
  assert.equal(check(row).eligible, true);
  row.fields.Scheduled_Post_Date = "2026-11-20T19:16:00Z";
  assert.equal(check(row).reason, "future_schedule");
});
test("carousel children and TikTok drafts with existing stage work use continuation, not a fresh create", () => {
  let row = fresh(); row.fields.IG_Carousel_Status = "Children Ready";
  assert.equal(check(row).reason, "carousel_stage_requires_continuation");
  row = fresh(); row.fields.TikTok_Draft_Status = "Processing";
  assert.equal(check(row).reason, "tiktok_stage_requires_continuation");
});
