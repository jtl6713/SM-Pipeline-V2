import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  protectedMediaReworkSourceRow,
  protectedMediaReworkShapedRecord,
  protectedMediaReworkSummary,
} from "./factory-protected-media-rework.mjs";
import {
  classifyFactoryLane,
  factoryCardFromRow,
  partitionFactoryLanes,
} from "./factory-desk.mjs";

const RECORD = "recAAAAAAAAAAAAAA"; // 14 chars after rec
const MARKER = {
  stage: "FB0 photo asset preparation",
  fresh_human_approval_required: true,
  provider_publication_unverified: true,
  publish_retry_authorized: false,
};

function typed(overrides = {}) {
  return {
    airtable_record_id: RECORD,
    error_messages: {
      Studio_Overdue_Preflight_Repair_20261120: MARKER,
      Studio_Recovery_Source_Gallery_Verified_20261121: { source_image_count: 4 },
    },
    review_status: "Changes Requested",
    output_status: "Changes Requested",
    publish_status: "Not Ready",
    do_not_publish: true,
    auto_publish_enabled: false,
    publish_retry_eligible: false,
    scheduled_post_date: null,
    studio_scheduled_at: null,
    youtube_scheduled_publish_at: null,
    published_at: null,
    platform_post_url: null,
    test_run_id: null,
    ...overrides,
  };
}

function shaped(overrides = {}) {
  return {
    id: RECORD,
    fields: {
      Studio_Overdue_Preflight_Repair_20261120: MARKER,
      Studio_Recovery_Source_Gallery_Verified_20261121: { source_image_count: 4 },
      Review_Status: "Changes Requested",
      Output_Status: "Changes Requested",
      Publish_Status: "Not Ready",
      Do_Not_Publish: true,
      Auto_Publish_Enabled: false,
      Publish_Retry_Eligible: false,
      Scheduled_Post_Date: null,
      Studio_Scheduled_At: null,
      YouTube_Scheduled_Publish_At: null,
      Published_At: null,
      Platform_Post_URL: null,
      Test_Run_ID: null,
    },
    ...overrides,
  };
}

test("only the exact held, unpublished Supabase recovery source qualifies", () => {
  assert.equal(protectedMediaReworkSourceRow(typed()), true);
  const denial = [
    { review_status: "Approved" },
    { output_status: "Approved for Publishing" },
    { publish_status: "Ready to Publish" },
    { do_not_publish: false },
    { auto_publish_enabled: true },
    { publish_retry_eligible: true },
    { scheduled_post_date: "2026-11-19T00:00:00Z" },
    { studio_scheduled_at: "2026-11-19T00:00:00Z" },
    { youtube_scheduled_publish_at: "2026-11-19T00:00:00Z" },
    { published_at: "2026-11-21T08:04:44Z" },
    { platform_post_url: "https://facebook.com/p/123" },
    { test_run_id: "test-123" },
    { airtable_record_id: "recShort" },
    { error_messages: {} },
  ];
  for (const item of denial) {
    assert.equal(protectedMediaReworkSourceRow(typed(item)), false, JSON.stringify(item));
  }
});

test("after shaping, only the same exact DNP/Changes Requested record is retained", () => {
  assert.equal(protectedMediaReworkShapedRecord(shaped()), true);
  const base = shaped();
  assert.equal(protectedMediaReworkShapedRecord({
    ...base, fields: { ...base.fields, Publish_Retry_Eligible: true },
  }), false);
  assert.equal(protectedMediaReworkShapedRecord({
    ...base, fields: { ...base.fields, Published_At: "2026-11-21T08:04:44Z" },
  }), false);
  assert.equal(protectedMediaReworkShapedRecord({
    ...base, fields: { ...base.fields, Studio_Overdue_Preflight_Repair_20261120: "forged" },
  }), false);
  const summary = protectedMediaReworkSummary(base);
  assert.equal(summary.media_rework, true);
  assert.equal(summary.source_inventory_verified, true);
  assert.equal(summary.stage, MARKER.stage);
  assert.equal(summary.can_approve, false);
  assert.equal(summary.can_retry, false);
  assert.equal(summary.can_publish, false);
  assert.match(summary.next_step, /Factory approval/);
});

test("six original-image candidate galleries remain repair-only, never Final Approved", () => {
  const standard = shaped();
  const source = {
    ...standard,
    fields: {
      ...standard.fields,
      Studio_Recovery_Source_Gallery_Verified_20261121: null,
      Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121: {
        verified_4x5_image_count: 4,
        original_factory_approved_slide_identity_proven: false,
      },
    },
  };
  const ready = protectedMediaReworkSummary(source);
  assert.equal(ready.media_rework, true);
  assert.equal(ready.source_inventory_verified, true);
  assert.equal(ready.can_approve, false);
  assert.equal(ready.can_publish, false);
  assert.match(ready.next_step, /no Final Approved slide records/);
  const missing = {
    ...standard,
    fields: {
      ...standard.fields,
      Studio_Recovery_Source_Gallery_Verified_20261121: null,
      Studio_Recovery_IG_Original_Preview_Gallery_Needs_Rebuild_20261121: {
        verified_original_index0_width: 1080,
        verified_original_index0_height: 1920,
        verified_complete_gallery: false,
      },
    },
  };
  const rebuild = protectedMediaReworkSummary(missing);
  assert.equal(rebuild.source_inventory_verified, false);
  assert.match(rebuild.next_step, /wrong aspect/);
  assert.equal(rebuild.can_approve, false);
  assert.equal(rebuild.can_retry, false);
});

test("protected media goes to Factory Manual, never Approve/Needs Eyes or publish", () => {
  const row = {
    id: RECORD, kind: "output", title: "Original creative gallery",
    profile_name: "New York City", output_status: "Changes Requested",
    review_status: "Changes Requested", publish_status: "Not Ready",
    do_not_publish: true, auto_publish_enabled: false,
    protected_media_rework: true,
    recovery_source_inventory_verified: true,
    recovery_stage: MARKER.stage,
    recovery_next_step: "Verify preview and request new Factory approval",
    review_package_ready: false, platform: "Facebook",
    studio_output_type: "Multi-Image Post",
    thumbnail_url: "https://media.chicagoshining.com/studio/previews/lettered/recAAAAAAAAAAAAAA/0.jpg",
  };
  assert.equal(classifyFactoryLane(row), "manual");
  const card = factoryCardFromRow(row);
  assert.equal(card.lane, "manual");
  assert.equal(card.review_package_ready, false);
  assert.equal(card.can_approve, false);
  assert.equal(card.can_retry, false);
  assert.equal(card.can_publish, false);
  assert.equal(card.protected_media_rework, true);
  assert.equal(card.recovery_source_inventory_verified, true);
  assert.match(card.studio_state, /Media sources verified/);
  const lanes = partitionFactoryLanes([row]);
  assert.deepEqual(lanes.lanes.needs_eyes, []);
  assert.equal(lanes.lanes.manual.length, 1);
  assert.equal(lanes.summary.manual, 1);
  assert.equal(classifyFactoryLane({ ...row, do_not_publish: false }), null);
  assert.equal(classifyFactoryLane({ ...row, output_status: "Published", published_at: "2026-11-21T08:04:44Z" }), null);
});

test("Factory source always uses independent exact Supabase rework query and no Airtable fallback", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(path.join(dir, "supabase-pipeline-reads.mjs"), "utf8");
  const worker = readFileSync(path.join(dir, "worker-functions-04.mjs"), "utf8");
  const client = readFileSync(path.join(dir, "../studio-web/assets/factory-desk.js"), "utf8");
  assert.match(source, /error_messages->>Studio_Overdue_Preflight_Repair_20261120=not\.is\.null/);
  assert.match(source, /protectedReworkRows = \(heldReworkRows \|\| \[\]\)\.filter\(protectedMediaReworkSourceRow\)/);
  assert.match(source, /mediaReworkScanWarning/);
  assert.match(source, /matchesOpsQueueReviewFormula\(row\.fields\) \|\| protectedMediaReworkShapedRecord\(row\)/);
  assert.match(worker, /const mediaRework = protectedMediaReworkSummary\(record\)/);
  assert.match(worker, /protected_media_rework: Boolean\(mediaRework\)/);
  assert.match(worker, /review_package_ready: mediaRework \? false : reviewVisibility\.visible/);
  assert.match(client, /if \(card\?\.protected_media_rework === true\) return false;/);
  assert.match(client, /Creative repair:/);
});
