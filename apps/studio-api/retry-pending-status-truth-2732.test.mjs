import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizedOutputState,
  platformPublishStatus,
  mapOutput,
} from "./worker-functions-01.mjs";

const isActualPublishRetryPending = (record) => mapOutput(record).publish_retry_pending_confirmed;

const future = "2099-12-15T13:35:00Z";
const scheduled = (number, platform, type) => ({
  id: "recTEST" + number,
  fields: {
    Output_ID: number, Platform: platform, Studio_Output_Type: type,
    Output_Status: "Approved for Publishing", Render_Status: "Rendered",
    Review_Status: "Approved", Publish_Status: "Ready to Publish",
    Final_File_URL: "https://drive.google.com/file/d/verified/view",
    Scheduled_Post_Date: future, Auto_Publish_Enabled: true,
    Do_Not_Publish: false, Publish_Retry_Eligible: true,
    Publish_Next_Retry_At: null, Studio_Publish_Dispatch_Count: 0,
    Publish_Error_Stage: "", Publish_Error_Message: "",
  },
});

test("11125 YouTube, 11126 Instagram Story, 11127 Facebook Story do not retry merely because eligible", () => {
  for (const [id, platform, format] of [
    [11125, "YouTube", "Short"],
    [11126, "Instagram", "Story"],
    [11127, "Facebook", "Story"],
  ]) {
    const record = scheduled(id, platform, format);
    assert.equal(isActualPublishRetryPending(record), false, id);
    assert.equal(normalizedOutputState(record), "Scheduled", id);
    assert.equal(platformPublishStatus(record), "Ready to Publish", id);
    const mapped = mapOutput(record);
    assert.equal(mapped.studio_state, "Scheduled", id);
    assert.equal(mapped.publish_retry_pending_confirmed, false, id);
    assert.notEqual(mapped.platform_publish_status, "Retry Pending", id);
  }
});

test("even an explicit stale FB Retry Pending status is NOT displayed without scheduled retry", () => {
  const row=scheduled(11127,"Facebook","Story");
  row.fields.FB_Publish_Status="Retry Pending";
  assert.equal(isActualPublishRetryPending(row), false);
  assert.equal(normalizedOutputState(row), "Scheduled");
  assert.equal(platformPublishStatus(row), "Scheduled");
});

test("future timestamp plus retry eligibility is not proof of a failed attempt", () => {
  const row=scheduled(11125,"YouTube","Short");
  row.fields.Publish_Next_Retry_At=future;
  assert.equal(isActualPublishRetryPending(row), false);
  assert.equal(normalizedOutputState(row), "Scheduled");
});

test("prior failure without a next retry time is NOT pending", () => {
  const row=scheduled(11127,"Facebook","Story");
  row.fields.Publish_Status="Failed";
  row.fields.FB_Publish_Status="Retry Pending";
  row.fields.Publish_Error_Stage="FBS3_RATE_LIMIT";
  row.fields.Publish_Error_Message="Meta 368 throttled";
  row.fields.Studio_Publish_Dispatch_Count=1;
  assert.equal(isActualPublishRetryPending(row), false);
  assert.notEqual(normalizedOutputState(row), "Retry Pending");
  assert.equal(platformPublishStatus(row), "Failed");
});

test("real bounded failure with a retry timestamp still receives Retry Pending", () => {
  const row=scheduled(11127,"Facebook","Story");
  row.fields.Publish_Status="Failed";
  row.fields.FB_Publish_Status="Retry Pending";
  row.fields.Publish_Error_Stage="FBS3_RATE_LIMIT";
  row.fields.Publish_Error_Message="Graph 368 rate limited";
  row.fields.Studio_Publish_Dispatch_Count=1;
  row.fields.Publish_Next_Retry_At=future;
  assert.equal(isActualPublishRetryPending(row), true);
  assert.equal(normalizedOutputState(row), "Retry Pending");
  assert.equal(platformPublishStatus(row), "Retry Pending");
  assert.equal(mapOutput(row).publish_retry_pending_confirmed, true);
});

test("Instagram uses carousel-specific retry timestamp when it is a real queued retry", () => {
  const row=scheduled(11126,"Instagram","Carousel");
  row.fields.IG_Carousel_Status="Retry Pending";
  row.fields.IG_Carousel_Error_Message="Graph rate limit";
  row.fields.IG_Carousel_Next_Retry_At=future;
  assert.equal(isActualPublishRetryPending(row), true);
  assert.equal(normalizedOutputState(row), "Retry Pending");
});

test("no label may imply a retry on an intentionally held or disabled output", () => {
  for (const [field, value] of [["Do_Not_Publish",true],["Auto_Publish_Enabled",false],["Publish_Retry_Eligible",false]]) {
    const row=scheduled(11127,"Facebook","Story");
    row.fields.Publish_Status="Failed";
    row.fields.FB_Publish_Status="Retry Pending";
    row.fields.Publish_Error_Stage="FBS3_RATE_LIMIT";
    row.fields.Publish_Error_Message="Graph rate limit";
    row.fields.Publish_Next_Retry_At=future;
    row.fields[field]=value;
    assert.equal(isActualPublishRetryPending(row), false, field);
    assert.notEqual(normalizedOutputState(row), "Retry Pending", field);
    assert.notEqual(platformPublishStatus(row), "Retry Pending", field);
  }
});
