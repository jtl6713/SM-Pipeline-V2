import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  protectedMediaReworkSourceRow,
  protectedMediaReworkShapedRecord,
  protectedMediaReworkOriginalPreviewGallery,
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
  assert.match(client, /if \(card\.protected_media_rework === true\) \{/);
  assert.match(client, /Original held source image/);
  assert.match(client, /Original media needs reconstruction/);
  assert.match(client, /never send a video request or a stale Airtable GET/);

});

test("exact six original held gallery previews are display-only and bound to their own output", () => {
  const urls = [0,1,2,3].map(i =>
    `https://media.chicagoshining.com/studio/previews/lettered/${RECORD}/${i}.jpg`);
  const source = {
    source_class: "original_output_preview_folder",
    verification_type: "read_only_cdn_http_decoded_image_header",
    expected_image_count: 4,
    verified_4x5_image_count: 4,
    candidate_original_image_urls: urls,
    original_slide_records_present: false,
    original_factory_approved_slide_identity_proven: false,
    fresh_factory_creative_review_required: true,
    ap0c_instagram_public_asset_staging_done: false,
    owner_original_provider_publication_proven: false,
    new_publish_retry_authorized: false,
    parent_count_mismatch_requires_manual_review: true,
  };
  const row = shaped({fields: {
    ...shaped().fields,
    Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121: source,
  }});
  const gallery = protectedMediaReworkOriginalPreviewGallery(row);
  assert.deepEqual(gallery, {urls, count_mismatch: true});
  const summary = protectedMediaReworkSummary(row);
  assert.deepEqual(summary.original_image_previews, urls);
  assert.equal(summary.source_count_mismatch, true);
  assert.equal(summary.can_approve, false);
  assert.equal(summary.can_retry, false);
  assert.equal(summary.can_publish, false);

  // No inferred sibling Facebook gallery, no deleted slide, no unverified
  // image, no 9:16 or other count unless independent image evidence matches.
  const badVariants = [
    {candidate_original_image_urls: [...urls.slice(0,3)]},
    {candidate_original_image_urls: [...urls.slice(0,3), urls[2]]},
    {candidate_original_image_urls: [urls[1],...urls.slice(1)]},
    {candidate_original_image_urls: [...urls.slice(0,3), urls[3].replace(RECORD,"recBBBBBBBBBBBBBB")]},
    {verified_4x5_image_count: 3},
    {expected_image_count: 8},
    {ap0c_instagram_public_asset_staging_done: true},
    {original_factory_approved_slide_identity_proven: true},
    {fresh_factory_creative_review_required: false},
    {owner_original_provider_publication_proven: true},
    {new_publish_retry_authorized: true},
    {original_slide_records_present: true},
  ];
  for (const overrides of badVariants) {
    const bad = {...row,fields:{...row.fields,
      Studio_Recovery_IG_Original_Preview_Gallery_Verified_20261121: {...source,...overrides},
    }};
    assert.equal(protectedMediaReworkOriginalPreviewGallery(bad),null,JSON.stringify(overrides));
    assert.deepEqual(protectedMediaReworkSummary(bad)?.original_image_previews,[]);
  }
  assert.equal(protectedMediaReworkOriginalPreviewGallery({...row,fields:{...row.fields,Do_Not_Publish:false}}),null);
  const card = factoryCardFromRow({kind:"output",id:RECORD,output_status:"Changes Requested",
    review_status:"Changes Requested",publish_status:"Not Ready",do_not_publish:true,auto_publish_enabled:false,
    protected_media_rework:true,recovery_original_image_previews:urls,recovery_source_count_mismatch:true});
  assert.deepEqual(card.recovery_original_image_previews,urls);
  assert.equal(card.recovery_source_count_mismatch,true);
  assert.equal(card.can_approve,false);
  assert.equal(card.can_retry,false);
  assert.equal(card.can_publish,false);
});

test("Factory client renders only output-scoped, read-only source carousel with no legacy backend lookup", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const worker = readFileSync(path.join(dir,"worker-functions-04.mjs"),"utf8");
  const client = readFileSync(path.join(dir,"../studio-web/assets/factory-desk.js"),"utf8");
  assert.ok(worker.includes("recovery_original_image_previews: mediaRework?.original_image_previews"));
  assert.match(client,/function showFactoryRecoverySourceGallery/);
  assert.match(client,/if \(showFactoryRecoverySourceGallery\(card, image, dialog\)\)/);
  assert.match(client,/Verified original preview image/);
  assert.match(client,/fresh approval and staging still required/);
  assert.match(client,/clearFactoryRecoveryGalleryControls\(\)/);
});

test("new proven same-day gallery holds require the same full rework safety gates", () => {
  const evidence = {
    issue: 2374, output_number: 10802,
    reason: "fb0_assets_zero_of_four_ready_prior_failed_attempt_no_original_slide_package",
    source_slide_count: 0,
    provider_calls_performed: 0, no_provider_retry_authorized: true,
    reconstruction_and_fresh_approval_required: true,
    original_approval_and_errors_preserved: true,
    historical_schedule_preserved: true,
  };
  const oldMarker = "Studio_Overdue_Preflight_Repair_20261120";
  const newMarker = "Studio_Overdue_UnsafeGallery_Hold_20261121";
  const source = typed({
    airtable_record_id: "recr4kD97CT3X2JLX",
    output_number: 10802,
    error_messages: { [newMarker]: evidence },
  });
  const out = shaped({
    id: "recr4kD97CT3X2JLX",
    fields: {...shaped().fields, Output_ID: 10802,
      Studio_Recovery_Source_Gallery_Verified_20261121: null,
      [oldMarker]: undefined, [newMarker]: evidence},
  });
  assert.equal(protectedMediaReworkSourceRow(source), true);
  assert.equal(protectedMediaReworkShapedRecord(out), true);
  assert.equal(protectedMediaReworkSummary(out).can_approve, false);
  assert.equal(protectedMediaReworkSummary(out).can_publish, false);
  assert.equal(protectedMediaReworkSummary(out).can_retry, false);
  assert.match(protectedMediaReworkSummary(out).next_step,/original missing media\/slide package/);
  for (const mismatch of [
    {do_not_publish:false},{auto_publish_enabled:true},{publish_retry_eligible:true},
    {output_status:"Approved for Publishing"},{review_status:"Approved"},
    {publish_status:"Failed"},{scheduled_post_date:"2026-11-21T19:30:00Z"},
    {published_at:"2026-11-21T19:31:00Z"},
  ]) {
    assert.equal(protectedMediaReworkSourceRow({...source,...mismatch}),false,JSON.stringify(mismatch));
  }
  for (const mismatch of [
    {Do_Not_Publish:false},{Auto_Publish_Enabled:true},{Publish_Retry_Eligible:true},
    {Output_Status:"Approved for Publishing"},{Review_Status:"Approved"},
    {Publish_Status:"Failed"},{Scheduled_Post_Date:"2026-11-21T19:30:00Z"},
  ]) {
    assert.equal(protectedMediaReworkShapedRecord({...out,fields:{...out.fields,...mismatch}}),false,JSON.stringify(mismatch));
  }
  assert.equal(protectedMediaReworkSourceRow({...source,output_number:9999}),false);
  assert.equal(protectedMediaReworkSourceRow({...source,airtable_record_id:RECORD}),false);
  assert.equal(protectedMediaReworkShapedRecord({...out,fields:{...out.fields,Output_ID:9999}}),false);
  assert.equal(protectedMediaReworkSourceRow({...source,error_messages:{[newMarker]:{...evidence,source_slide_count:4}}}),false);
  assert.equal(protectedMediaReworkSourceRow({...source,error_messages:{[newMarker]:{...evidence,provider_calls_performed:1}}}),false);
  assert.equal(protectedMediaReworkSourceRow({...source,error_messages:{[newMarker]:"forged"}}),false);
  assert.equal(protectedMediaReworkShapedRecord({...out,fields:{...out.fields,[newMarker]:"forged"}}),false);
});

test("new held cases are scanned independently with no Airtable fallback and no manual approval", () => {
  const dir = path.dirname(fileURLToPath(import.meta.url));
  const read = readFileSync(path.join(dir,"supabase-pipeline-reads.mjs"),"utf8");
  assert.match(read,/error_messages->>Studio_Overdue_UnsafeGallery_Hold_20261121=not\.is\.null/);
  assert.match(read,/const heldReworkRows = \[\.\.\.\(originalHeldReworkRows \|\| \[\]\), \.\.\.\(newHeldReworkRows \|\| \[\]\)\]/);
  const row = {
    id: RECORD,kind:"output",title:"FB0 original source needs rebuilding",
    output_status:"Changes Requested",review_status:"Changes Requested",publish_status:"Not Ready",
    do_not_publish:true,auto_publish_enabled:false,protected_media_rework:true,review_package_ready:false,
  };
  const card = factoryCardFromRow(row);
  assert.equal(card.lane,"manual");
  assert.equal(card.can_approve,false);
  assert.equal(card.can_retry,false);
  assert.equal(card.can_publish,false);
});

test("protected Factory cards distinguish original 82 from newly fenced gallery repairs", () => {
  const oldMarker = "Studio_Overdue_Preflight_Repair_20261120";
  const newMarker = "Studio_Overdue_UnsafeGallery_Hold_20261121";
  assert.equal(protectedMediaReworkSummary(shaped()).marker, oldMarker);
  const fresh = shaped({
    id:"recYnHtxkSljy762z",
    fields:{
      ...shaped().fields,
      Output_ID:10793,
      [oldMarker]:null,
      [newMarker]:{
        output_number:10793,reason:"missing original slide package",
        source_slide_count:0,no_provider_retry_authorized:true,
        reconstruction_and_fresh_approval_required:true,
        original_approval_and_errors_preserved:true,
        historical_schedule_preserved:true,
        provider_calls_performed:0,
      },
    },
  });
  assert.equal(protectedMediaReworkSummary(fresh).marker,newMarker);
  const card = factoryCardFromRow({
    kind:"output",id:RECORD,protected_media_rework:true,
    recovery_hold_marker:newMarker,output_status:"Changes Requested",
    review_status:"Changes Requested",publish_status:"Not Ready",
    do_not_publish:true,auto_publish_enabled:false,review_package_ready:false,
  });
  assert.equal(card.recovery_hold_marker,newMarker);
  assert.equal(card.can_publish,false);
  assert.equal(card.can_retry,false);
  assert.equal(card.can_approve,false);
});

test("all ten original 4:5 sources are display-only, original-owner and audit run bound", () => {
  const recordId = "recYnHtxkSljy762z";
  const hold = {
    issue:2374,output_number:10793,source_slide_count:0,
    no_provider_retry_authorized:true, reconstruction_and_fresh_approval_required:true,
    original_approval_and_errors_preserved:true,historical_schedule_preserved:true,
    provider_calls_performed:0,
  };
  const urls = [0,1,2,3].map(i =>
    `https://media.chicagoshining.com/studio/previews/lettered/${recordId}/${i}.jpg`);
  const proof = {
    source_class:"original_output_preview_folder",
    verification_type:"read_only_cdn_http_decoded_image_header",
    provider_read_only_audit_run_id:44943264131,
    output_number:10793,
    expected_image_count:4,
    verified_4x5_image_count:4,
    candidate_original_image_urls:urls,
    original_slide_records_present:false,
    original_factory_approved_slide_identity_proven:false,
    fresh_factory_creative_review_required:true,
    ap0c_instagram_public_asset_staging_done:false,
    owner_original_provider_publication_proven:false,
    new_publish_retry_authorized:false,
    facebook_remote_photo_ids_present:false,
    ig_remote_child_ids_present:false,
    source_image_approval_is_not_proven:true,
    reconstruction_and_fresh_factory_approval_required:true,
  };
  const newProof = "Studio_Recovery_NewMedia_Original_Preview_Gallery_Verified_20261121";
  const row = shaped({
    id: recordId,
    fields: {
      ...shaped().fields,Output_ID:10793,
      Studio_Overdue_Preflight_Repair_20261120:null,
      Studio_Overdue_UnsafeGallery_Hold_20261121:hold,
      [newProof]:proof,
      Studio_Recovery_Source_Gallery_Verified_20261121:null,
    },
  });
  assert.equal(protectedMediaReworkShapedRecord(row),true);
  assert.deepEqual(protectedMediaReworkOriginalPreviewGallery(row),{urls,count_mismatch:false});
  const summary = protectedMediaReworkSummary(row);
  assert.deepEqual(summary.original_image_previews,urls);
  assert.equal(summary.media_rework,true);
  assert.equal(summary.source_inventory_verified,true);
  assert.match(summary.next_step,/fresh Factory review required/);
  assert.equal(summary.can_approve,false);
  assert.equal(summary.can_retry,false);
  assert.equal(summary.can_publish,false);
  for(const override of [
    {provider_read_only_audit_run_id:1234},
    {output_number:10802},
    {verified_4x5_image_count:3},
    {candidate_original_image_urls:urls.slice(1)},
    {candidate_original_image_urls:[...urls.slice(0,3),urls[1]]},
    {candidate_original_image_urls:[...urls.slice(0,3),urls[3].replace(recordId,"recAAAAAAAAAAAAAA")]},
    {original_slide_records_present:true},
    {facebook_remote_photo_ids_present:true},
    {ig_remote_child_ids_present:true},
    {source_image_approval_is_not_proven:false},
    {reconstruction_and_fresh_factory_approval_required:false},
    {new_publish_retry_authorized:true},
    {original_factory_approved_slide_identity_proven:true},
  ]){
    const bad={...row,fields:{...row.fields,[newProof]:{...proof,...override}}};
    assert.equal(protectedMediaReworkOriginalPreviewGallery(bad),null,JSON.stringify(override));
  }
  // The one FB output #10802 got four C9 rows from another writer, but
  // those are explicitly NOT a new Factory approval or remote FB photos.
  const fbId="recr4kD97CT3X2JLX";
  const fbRow={...row,id:fbId,fields:{
    ...row.fields,Output_ID:10802,
    Studio_Overdue_UnsafeGallery_Hold_20261121:{...hold,output_number:10802},
    [newProof]:{...proof,output_number:10802,original_slide_records_present:true,
      candidate_original_image_urls:urls.map(url=>url.replace(recordId,fbId))},
  }};
  const fbGallery=protectedMediaReworkOriginalPreviewGallery(fbRow);
  assert.equal(fbGallery?.urls?.length,4);
  assert.equal(protectedMediaReworkSummary(fbRow)?.can_publish,false);
  assert.equal(protectedMediaReworkOriginalPreviewGallery({...fbRow,fields:{...fbRow.fields,
    [newProof]:{...fbRow.fields[newProof],original_slide_records_present:false}}),null);
});
