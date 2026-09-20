import assert from "node:assert/strict";
import test from "node:test";
import {
  STUDIO_TIKTOK_INBOX_DUE_FORMULA,
  STUDIO_TIKTOK_INBOX_LEAD_MS,
  studioPublishScheduledMs,
  studioTikTokArmedDraftStatus,
  studioTikTokInboxIsDue,
} from "./tiktok-inbox-schedule.mjs";

const record = (fields) => ({ id: "recTEST", fields });

test("studioTikTokInboxIsDue treats blank schedule as immediate", () => {
  assert.equal(studioTikTokInboxIsDue(record({ Scheduled_Post_Date: "" })), true);
  assert.equal(studioTikTokInboxIsDue(record({})), true);
});

test("studioTikTokInboxIsDue opens the lead window 15 minutes before schedule", () => {
  const now = Date.parse("2026-09-20T16:00:00.000Z");
  const scheduled = "2026-09-20T16:16:00.000Z";
  assert.equal(studioTikTokInboxIsDue(record({ Scheduled_Post_Date: scheduled }), now), false);
  assert.equal(
    studioTikTokInboxIsDue(record({ Scheduled_Post_Date: "2026-09-20T16:14:00.000Z" }), now),
    true,
  );
  assert.equal(
    studioTikTokInboxIsDue(record({ Scheduled_Post_Date: "2026-09-20T15:30:00.000Z" }), now),
    true,
  );
});

test("studioTikTokArmedDraftStatus waits until the inbox lead window", () => {
  const now = Date.parse("2026-09-20T16:00:00.000Z");
  const far = record({ Scheduled_Post_Date: "2026-09-22T16:00:00.000Z" });
  assert.equal(studioTikTokArmedDraftStatus(far, null, now), "Waiting for Schedule");
  const soon = record({ Scheduled_Post_Date: "2026-09-20T16:10:00.000Z" });
  assert.equal(studioTikTokArmedDraftStatus(soon, null, now), "Ready for Assets");
});

test("studioPublishScheduledMs accepts explicit scheduledPostDate override", () => {
  assert.equal(
    studioPublishScheduledMs(record({ Scheduled_Post_Date: "2026-09-20T16:00:00.000Z" }), "2026-09-21T12:00:00.000Z"),
    Date.parse("2026-09-21T12:00:00.000Z"),
  );
});

test("Airtable due formula uses the 15-minute lead", () => {
  assert.match(STUDIO_TIKTOK_INBOX_DUE_FORMULA, /DATEADD\(NOW\(\),15,'minutes'\)/);
  assert.equal(STUDIO_TIKTOK_INBOX_LEAD_MS, 15 * 60 * 1000);
});
