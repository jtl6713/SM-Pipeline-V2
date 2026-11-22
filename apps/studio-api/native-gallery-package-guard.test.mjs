import test from "node:test";
import assert from "node:assert/strict";
import { inspectNativeGalleryPublicationPackage } from "./native-gallery-package-guard.mjs";
import { readSupabaseFactoryGallerySlides } from "./supabase-pipeline-reads.mjs";

const cdn = "https://media.chicagoshining.com/studio/previews/";
const outputId = "rec1p9SOjrpxtpQkV";
const image = n => cdn + "lettered/" + outputId + "/" + (n - 1) + ".jpg";
const family = n => "rec" + String(n).padStart(14, "A");
const drive = n => "google_drive_variant_id_" + n + "_123456";
const selected = n => ({
  order: n, url: image(n),
  googleDriveFileId: drive(n), mediaAssetRecordId: family(n),
});
const row = () => ({
  airtable_record_id: outputId, output_number: 10992,
  platform_output_type: "Instagram Carousel", studio_output_type: "Carousel",
  output_status: "Ready for Review", review_status: null, render_status: "Native Photo Route",
  do_not_publish: true, auto_publish_enabled: false, publish_status: "Not Ready",
  selected_clip_count: 8, selected_assets: { selected_clips: Array.from({length: 8}, (_, i) => selected(i + 1)) },
  render_clip_list: Array.from({length: 8}, (_, i) => selected(i + 1)),
  error_messages: {},
});
const slides = () => Array.from({ length: 8 }, (_, i) => {
  const n = i + 1;
  return { current_order: n, deleted_from_carousel: false, fields: {
    "Platform Output": [outputId], PO_Output_ID: [10992],
    "Slide Number": n, "Final Image URL": image(n),
    "Asset_4x5_Public_URL": image(n), "Google Drive File ID": drive(n),
    "Asset_Family_Key": family(n), Shared_Asset_Approved: true,
    Asset_4x5_Public_Status: "Ready", "Approved For Final": true,
  } };
});

test("#2294: exact eight linked and explicitly final-approved native slides pass the non-publishing gate", () => {
  assert.deepEqual(inspectNativeGalleryPublicationPackage(row(), slides()), {
    applicable: true, eligible: true, reason: "complete_linked_native_gallery", slide_count: 8,
  });
});
test("#2294: missing and partial native slide packages fail even if 8 selected/render images exist", () => {
  assert.equal(inspectNativeGalleryPublicationPackage(row(), []).reason, "native_gallery_slide_count_mismatch");
  assert.equal(inspectNativeGalleryPublicationPackage(row(), slides().slice(0, 7)).eligible, false);
});
test("#2294: foreign owner, duplicate order, mismatched exact public image, missing provenance block", () => {
  const mutations = [
    (arr) => { arr[0].fields["Platform Output"] = ["recForeignOutput00"]; },
    (arr) => { arr[1].current_order = 1; },
    (arr) => { arr[2].fields["Final Image URL"] = image(4); },
    (arr) => { arr[3].fields["Google Drive File ID"] = ""; },
    (arr) => { arr[4].fields.PO_Output_ID = [99999]; },
  ];
  for (const mutate of mutations) {
    const testSlides = slides(); mutate(testSlides);
    assert.equal(inspectNativeGalleryPublicationPackage(row(), testSlides).eligible, false);
  }
});
test("#2294: visual previews and unapproved rows cannot authorize the publisher", () => {
  const incomplete = slides();
  incomplete[0].fields.Shared_Asset_Approved = false;
  assert.equal(inspectNativeGalleryPublicationPackage(row(), incomplete).reason,
    "native_gallery_images_not_final_approved");
  const noFinal = slides();
  noFinal[1].fields["Approved For Final"] = false;
  assert.equal(inspectNativeGalleryPublicationPackage(row(), noFinal).eligible, false);
});

async function mockedPreview(parent, assets, action) {
  const prior = globalThis.fetch;
  const calls = [];
  const env = { SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test" };
  globalThis.fetch = async (address, options = {}) => {
    const u = new URL(address);
    calls.push({ path: u.pathname, query: u.search, method: options.method || "GET" });
    assert.equal(u.origin, "https://fixture.supabase.co");
    if (u.pathname.endsWith("/platform_outputs")) return Response.json([parent]);
    if (u.pathname.endsWith("/carousel_slides")) return Response.json([]);
    if (u.pathname.endsWith("/media_assets")) return Response.json(assets);
    throw Error("Unexpected read " + u.pathname);
  };
  try { return await action(env, calls); }
  finally { globalThis.fetch = prior; }
}

test("#10992: exact held, eight-image source manifest is PREVIEW ONLY, with no fabricated slides", async () => {
  const p = row();
  const assets = Array.from({length: 8}, (_, i) => ({
    airtable_record_id: family(i + 1), active: true, do_not_use: false,
    asset_status: "Available", asset_name: "Owner source",
  }));
  await mockedPreview(p, assets, async (env, calls) => {
    const preview = await readSupabaseFactoryGallerySlides(env, outputId);
    assert.equal(preview.provisional, true);
    assert.equal(preview.publication_authorized, false);
    assert.equal(preview.source, "unverified-selected-source-images");
    assert.equal(preview.do_not_publish, true);
    assert.equal(preview.count, 8);
    assert.deepEqual(preview.slides.map(x => x.order), [1,2,3,4,5,6,7,8]);
    assert.equal(calls.filter(x => x.method !== "GET").length, 0);
    assert.equal(JSON.stringify(preview).includes("googleDriveFileId"), false);
  });
});
test("#10992: no draft preview when held source asset is disabled, foreign, or already scheduled", async () => {
  const p = row(), assets = Array.from({length: 8}, (_, i) => ({
    airtable_record_id: family(i + 1), active: true, do_not_use: false, asset_status: "Available",
  }));
  const badAssets = assets.map(x => ({...x}));
  badAssets[2].do_not_use = true;
  await mockedPreview(p, badAssets, async env => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /disabled/);
  });
  await mockedPreview({...p,scheduled_post_date: "2026-12-10T12:00:00Z"}, assets, async env => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /not authorized/);
  });
  const foreign = row();
  foreign.render_clip_list[0].url = cdn + "lettered/recForeignOwner01/0.jpg";
  await mockedPreview(foreign, assets, async env => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /ambiguous/);
  });
});
