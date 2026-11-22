import test from "node:test";
import assert from "node:assert/strict";
import { readSupabaseFactoryGallerySlides } from "./supabase-pipeline-reads.mjs";

const env = {
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "unit-test-only",
};
const outputId = "recO494MDnQ1Tk51b";
const image = (number) =>
  `https://media.chicagoshining.com/studio/previews/repairs/issue2371/nyc-2221/shared-small-bottom-right/slide-0${number}-abcdef0123456789.jpg`;
const makeSlide = (order, patch = {}) => ({
  airtable_record_id: `recSlide0000000${order}`,
  current_order: order,
  deleted_from_carousel: false,
  fields: {
    "Platform Output": [outputId],
    PO_Output_ID: [10855],
    "Final Image URL": image(order),
    "Google Drive File ID": "PRIVATE_ID_MUST_NOT_LEAK",
    ...patch,
  },
});
async function withMockSupabase({ parent, slides }, fn) {
  const original = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => {
    urls.push(String(url));
    const rows = String(url).includes("/platform_outputs?") ? [parent] : slides;
    return { ok: true, text: async () => JSON.stringify(rows) };
  };
  try {
    return await fn(urls);
  } finally {
    globalThis.fetch = original;
  }
}
const parent = {
  airtable_record_id: outputId,
  output_number: 10855,
  platform_output_type: "Instagram Carousel",
  studio_output_type: "Carousel",
  do_not_publish: true,
};
test("Factory preview uses exact Supabase slide ownership, order and public URLs; never Airtable", async () => {
  await withMockSupabase({ parent, slides: [1, 2, 3, 4].map(makeSlide) }, async (urls) => {
    const result = await readSupabaseFactoryGallerySlides(env, outputId);
    assert.equal(result.count, 4);
    assert.equal(result.do_not_publish, true);
    assert.deepEqual(result.slides.map((s) => s.order), [1, 2, 3, 4]);
    assert.equal(result.slides[3].image_url, image(4));
    assert.equal(JSON.stringify(result).includes("PRIVATE_ID_MUST_NOT_LEAK"), false);
    assert.equal(urls.length, 2);
    assert.ok(urls.every((url) => url.startsWith("https://example.supabase.co/rest/v1/")));
    assert.equal(new URL(urls[1]).searchParams.get("fields->PO_Output_ID"), "cs.[10855]");
    assert.equal(new URL(urls[1]).searchParams.get("deleted_from_carousel"), "eq.false");
  });
});
test("Factory preview rejects a cross-output slide instead of displaying a cover-only success", async () => {
  await withMockSupabase({
    parent,
    slides: [makeSlide(1), makeSlide(2, { "Platform Output": ["recForeignOutput00"] })],
  }, async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /identity or CDN/);
  });
});
test("Factory preview refuses an unrelated public CDN or private Google Drive image", async () => {
  await withMockSupabase({
    parent,
    slides: [makeSlide(1), makeSlide(2, { "Final Image URL": "https://drive.google.com/file/d/private/view" })],
  }, async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /identity or CDN/);
  });
});
test("Factory preview refuses missing slide order instead of approving an incomplete native package", async () => {
  await withMockSupabase({
    parent,
    slides: [makeSlide(1), makeSlide(3)],
  }, async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env, outputId), /incomplete or noncontiguous/);
  });
});
test("Factory preview never uses native slides for a video", async () => {
  await withMockSupabase({
    parent: { ...parent, studio_output_type: "Reel", platform_output_type: "Instagram Reel" },
    slides: [makeSlide(1), makeSlide(2)],
  }, async (urls) => {
    const result = await readSupabaseFactoryGallerySlides(env, outputId);
    assert.deepEqual(result.slides, []);
    assert.equal(result.reason, "not_a_native_gallery");
    assert.equal(urls.length, 1);
  });
});


test("#2294: exact linked draft native images display as UNAPPROVED with publishing explicitly denied", async () => {
  const draftId = "rec1p9SOjrpxtpQkV";
  const url = n => "https://media.chicagoshining.com/studio/previews/lettered/" + draftId + "/" + (n - 1) + ".jpg";
  const clips = [1,2].map(n => ({
    order:n,url:url(n),googleDriveFileId:"draft_variant_drive_id_"+n+"_123456",
    mediaAssetRecordId:"recDraftFamily000"+n,
  }));
  const parent = {
    airtable_record_id:draftId,output_number:10992,
    platform_output_type:"Instagram Carousel",studio_output_type:"Carousel",
    output_status:"Ready for Review",do_not_publish:true,auto_publish_enabled:false,
    selected_clip_count:2,selected_assets:{selected_clips:clips.map(x => ({
      order:x.order,url:x.url,google_drive_file_id:x.googleDriveFileId,
      media_asset_record_id:x.mediaAssetRecordId,
    }))},render_clip_list:clips,
  };
  const slides = clips.map((clip,i) => ({
    airtable_record_id:"sb-native:2294:10992:"+String(i+1).padStart(2,"0"),
    current_order:i+1,deleted_from_carousel:false,
    fields:{
      "Platform Output":[draftId],PO_Output_ID:[10992],
      "Final Image URL":clip.url,"Asset_4x5_Public_URL":clip.url,
      "Google Drive File ID":clip.googleDriveFileId,
      Asset_Family_Key:clip.mediaAssetRecordId,
      "Approved For Final":false,Shared_Asset_Approved:false,
      "Review Status":"Pending Review",
      SM_Native_Gallery_Draft_Repair_2294:{
        output_number:10992,slide_order:i+1,
        public_sha256:"a".repeat(64),verified_dimensions:"1080x1350",
        image_http_verified:true,image_geometry_verified:true,
        final_creative_approved:false,publishing_authorized:false,
      },
    },
  }));
  await withMockSupabase({parent,slides},async () => {
    const result=await readSupabaseFactoryGallerySlides(env,draftId);
    assert.equal(result.source,"unverified-native-draft-slides");
    assert.equal(result.provisional,true);
    assert.equal(result.publication_authorized,false);
    assert.equal(result.do_not_publish,true);
    assert.equal(result.count,2);
  });
  await withMockSupabase({parent:{...parent,do_not_publish:false},slides},async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env,draftId),/hold drift/);
  });
  const corruptEvidence=slides.map(x=>structuredClone(x));
  corruptEvidence[0].fields.SM_Native_Gallery_Draft_Repair_2294.public_sha256="not-verified";
  await withMockSupabase({parent,slides:corruptEvidence},async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env,draftId),/pending approval changed/);
  });
  const mixed=slides.map(x=>structuredClone(x));
  delete mixed[1].fields.SM_Native_Gallery_Draft_Repair_2294;
  await withMockSupabase({parent,slides:mixed},async () => {
    await assert.rejects(readSupabaseFactoryGallerySlides(env,draftId),/Incomplete draft native gallery/);
  });
});


test("#2294: incomplete verification markers remain previewable only as held, unapproved candidates", async () => {
  const draftId = "rectw2pvgnBzK3wCN";
  const url = n => "https://media.chicagoshining.com/studio/previews/lettered/" + draftId + "/" + (n-1) + ".jpg";
  const clips = [1, 2].map(n => ({
    order:n,url:url(n),googleDriveFileId:"source_variant_"+n+"_123456",
    mediaAssetRecordId:"recSourceFamily000"+n,
  }));
  const parent = {
    airtable_record_id:draftId,output_number:10853,
    platform_output_type:"Facebook Photo Set",studio_output_type:"Multi-Image Post",
    output_status:"Ready for Review",do_not_publish:true,auto_publish_enabled:false,
    selected_clip_count:2,
    selected_assets:{selected_clips:clips.map(c => ({
      order:c.order,url:c.url,google_drive_file_id:c.googleDriveFileId,media_asset_record_id:c.mediaAssetRecordId
    }))},render_clip_list:clips,
  };
  const slides = clips.map((c,i) => ({
    airtable_record_id:"sb-native:2294:10853:"+String(i+1).padStart(2,"0"),
    current_order:i+1,deleted_from_carousel:false,
    fields:{
      "Platform Output":[draftId],PO_Output_ID:[10853],
      "Final Image URL":c.url,"Asset_4x5_Public_URL":c.url,
      "Google Drive File ID":c.googleDriveFileId,
      Asset_Family_Key:c.mediaAssetRecordId,
      "Approved For Final":false,Shared_Asset_Approved:false,"Review Status":"Pending Review",
      SM_Native_Gallery_Draft_Repair_2294:{
        output_number:10853,slide_order:i+1,rights_status:"Unverified",
        image_http_verified:false,image_geometry_verified:false,
        final_creative_approved:false,publishing_authorized:false,
      },
    },
  }));
  await withMockSupabase({parent,slides},async ()=>{
    const result=await readSupabaseFactoryGallerySlides(env,draftId);
    assert.equal(result.count,2);
    assert.equal(result.provisional,true);
    assert.equal(result.publication_authorized,false);
    assert.equal(result.candidate_bytes_verified,false);
    assert.match(result.warning,/Unverified source candidates/);
  });
  const corrupted=structuredClone(slides);
  corrupted[0].fields.SM_Native_Gallery_Draft_Repair_2294.image_http_verified=true;
  await withMockSupabase({parent,slides:corrupted},async ()=>{
    await assert.rejects(readSupabaseFactoryGallerySlides(env,draftId),/pending approval changed/);
  });
  await withMockSupabase({parent:{...parent,auto_publish_enabled:true},slides},async ()=>{
    await assert.rejects(readSupabaseFactoryGallerySlides(env,draftId),/hold drift/);
  });
});
