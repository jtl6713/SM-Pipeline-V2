import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import {
  AUTOVERIFY_RECOVERED_FORMULA, assessAutonomousVerification,
  recoveredAtFromNote, summarizeAutonomousVerification,
} from "./autonomous-verification-recovery.mjs";
import {
  QUALITY_RECOVERY_OUTCOME, appendVerifiedRecoveryEvent,
  qualityRecoveryEventKey, recoveredOutcomesFromLedger, verifiedRecoveryLedgerFields,
} from "./qa-recovery-ledger.mjs";
import { facebookStoryRateLimitRearmReason, describeFailedOutput } from "./failed-output-monitor.mjs";
import { verifyFacebookStoryByMediaId } from "./facebook-story-remote-verification.mjs";

const nowMs = Date.parse("2026-10-27T20:00:00Z");
const record = (id, patch = {}) => ({ id, fields: {
  Output_ID: Number(id.replace(/\\D/g, "")) || 4112,
  Platform: "Facebook", Platform_Output_Type: "Facebook Story",
  Review_Status: "Approved", Output_Status: "Approved for Publishing",
  Publish_Status: "Ready to Schedule",
  Publish_Error_Stage: "FACEBOOK_STORY_RATE_LIMIT_368",
  Studio_Publish_Dispatch_Count: 8,
  Publish_Next_Retry_At: "2026-10-25T00:00:00.000Z",
  Scheduled_Post_Date: "2026-10-29T18:00:00.000Z",
  Publish_Asset_URL: "https://media.chicagoshining.com/studio/previews/story.mp4",
  Content_Profile: ["recLA"], ...patch,
} });
const rid = (num) => "rec" + String(num).padStart(14, "0");
const ledgerEvent = (num, fields = {}) => ({
  id: rid(num + 500),
  fields: {
    Event_Key: qualityRecoveryEventKey(rid(num)),
    Output_Record_ID: rid(num),
    Output_ID: num,
    Profile_ID: "recLA",
    Platform: "Facebook", Output_Type: "Facebook Story",
    Outcome: QUALITY_RECOVERY_OUTCOME,
    Post_ID: "232344455566677", Media_ID: "117822233344455",
    Evidence_Source: "meta_page_stories_exact_media_id",
    Reconciled_At: "2026-10-26T20:00:00.000Z",
    ...fields,
  },
});

test("ALL twelve live eight-dispatch Stories are pending verification even before cooldown", () => {
  for (const id of [2036,4112,4106,4064,1133,2116,4058,4004,1151,4022,4034,4094]) {
    const r = record(rid(id), { Publish_Next_Retry_At: "2026-10-29T00:00:00Z" });
    const result = assessAutonomousVerification(r, { nowMs });
    assert.equal(result.outcome, "pending_verification", String(id));
    assert.equal(result.safety_blocked, true);
    assert.ok(Date.parse(result.next_check_at) > nowMs);
    assert.equal(result.cooldown_until, "2026-10-29T00:00:00.000Z");
    assert.equal(facebookStoryRateLimitRearmReason(r, { nowMs }), "retry_limit");
    const display = describeFailedOutput(r, nowMs);
    assert.equal(display.recovery, "verification_pending", String(id));
    assert.match(display.action, /Do not repost or reset counters/i);
  }
});
test("low-attempt approved Story cooldown can only rearm through the original safe route", () => {
  const r = record(rid(4112), { Studio_Publish_Dispatch_Count: 1 });
  assert.equal(assessAutonomousVerification(r, { nowMs }).outcome, "guarded_rearm");
  assert.equal(facebookStoryRateLimitRearmReason(r, { nowMs }), null);
  assert.equal(assessAutonomousVerification(record(rid(4112), {
    Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-29T00:00:00Z",
  }), { nowMs }).outcome, "cooldown_waiting");
});
test("absence of a post ID is not proof of nonpublication and cannot unblock", () => {
  const pending = assessAutonomousVerification(record(rid(22)), { nowMs });
  assert.equal(pending.outcome, "pending_verification");
  assert.notEqual(pending.outcome, "verified_not_published");
  assert.equal(assessAutonomousVerification(record(rid(23), {
    Platform_Post_URL: "https://www.facebook.com/stories/123",
  }), { nowMs }).outcome, "publication_evidence");
});
test("only Meta account security checkpoint counts as a human-required challenge", () => {
  const challenge = assessAutonomousVerification(record(rid(24), {
    Publish_Error_Stage: "META_SECURITY_CHALLENGE",
  }), { nowMs });
  assert.equal(challenge.outcome, "human_action_required");
  assert.match(challenge.action_required, /Meta account security checkpoint/);
  assert.equal(assessAutonomousVerification(record(rid(25), {
    Studio_Publish_Dispatch_Note: "We limit how often you can post",
  }), { nowMs }).outcome, "pending_verification");
});

test("durable ledger is unique per output, excludes scans, bad events and old notes", () => {
  const blocked = [
    record(rid(1)), record(rid(1)),
    record(rid(2), { Studio_Publish_Dispatch_Count: 1, Publish_Next_Retry_At: "2026-10-29T00:00:00Z" }),
    record(rid(3), { Publish_Error_Stage: "FACEBOOK_CHECKPOINT_REQUIRED" }),
    record(rid(4), { Do_Not_Publish: true }),
  ];
  const events = [
    ledgerEvent(5), ledgerEvent(5),
    ledgerEvent(6, { Reconciled_At: "2026-09-26T20:00:00Z" }),
    ledgerEvent(1), // still blocked: never count as recovered
    ledgerEvent(7, { Outcome: "scanned" }),
    ledgerEvent(8, { Post_ID: "" }),
  ];
  const reported = summarizeAutonomousVerification(blocked, events, { nowMs });
  assert.deepEqual(reported.counts, {
    recovered_automatically: 1, human_action_required: 1,
    pending_verification: 1, cooldown_waiting: 1, safety_blocked: 2,
  });
  assert.equal(reported.metrics_source, "airtable_quality_agent_recovery_ledger");
  assert.equal(reported.per_profile.recLA.recovered_automatically, 1);
  assert.equal(reported.recovered_items[0].record_id, rid(5));
  assert.equal(recoveredOutcomesFromLedger(events, { nowMs }).length, 2);
  const unavailable = summarizeAutonomousVerification(blocked, [], { nowMs, ledgerScanStatus: "unavailable" });
  assert.equal(unavailable.status, "partial");
  assert.equal(unavailable.counts.recovered_automatically, null);
  assert.equal(recoveredAtFromNote("not-recovered"), null);
  assert.match(AUTOVERIFY_RECOVERED_FORMULA, /Studio_Publish_Dispatch_Note/);
});

test("autonomous exact-Meta positive recovery is GET-only and ledger writes once", async () => {
  const requests = [];
  const media = "117822233344455";
  const post = "232344455566677";
  const result = await verifyFacebookStoryByMediaId({
    pageId: "102445566778899", token: "test-token", mediaId: media,
    fetcher: async (url, options) => {
      requests.push({ url, method: options.method });
      return { ok: true, json: async () => ({
        data: [{ media_id: media, post_id: post, status: "PUBLISHED",
          url: "https://facebook.com/stories/123" }],
      }) };
    },
  });
  assert.equal(result.verdict, "verified_published");
  assert.deepEqual(requests.map((q) => q.method), ["GET"]);
  const output = record(rid(10), {
    Output_Status: "Published", Publish_Status: "Published",
    Platform_Post_ID: post, Platform_Media_ID: media,
  });
  const created = [];
  const readExisting = async () => created;
  const createEvent = async (fields) => { created.push({ fields }); return rid(900); };
  const a = await appendVerifiedRecoveryEvent(output, result.evidence,
    { readExisting, createEvent, at: "2026-10-26T20:00:00.000Z" });
  const b = await appendVerifiedRecoveryEvent(output, result.evidence,
    { readExisting, createEvent, at: "2026-10-26T20:00:00.000Z" });
  assert.equal(a.recorded, true);
  assert.equal(a.already_present, false);
  assert.equal(b.already_present, true);
  assert.equal(created.length, 1);
  assert.equal(created[0].fields.Post_ID, post);
  assert.throws(() => verifiedRecoveryLedgerFields(record(rid(11)), result.evidence),
    /authoritative Published read-back/);
  assert.throws(() => verifiedRecoveryLedgerFields({
    ...output, fields: { ...output.fields, Platform_Media_ID: "999999999999" },
  }, result.evidence), /does not match/);
});

test("Worker and Factory wire durable events while preserving the Story attempt ceiling", () => {
  const worker = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
  const publisher = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const factory = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const ui = fs.readFileSync(new URL("../studio-web/assets/factory-batch-quality-0710.js", import.meta.url), "utf8");
  assert.match(worker, /persistVerifiedRecoveryInAirtable/);
  assert.match(publisher, /persistVerifiedRecoveryInAirtable/);
  assert.match(factory, /QUALITY_RECOVERY_LEDGER_TABLE/);
  assert.match(factory, /summarizeAutonomousVerification/);
  assert.match(factory, /verification_recovery: snapshot\\.verification_recovery/);
  assert.match(ui, /recovered_automatically/);
  assert.match(worker, /facebookPreapprovalRecoveryReason\\(latest\\)/);
});
