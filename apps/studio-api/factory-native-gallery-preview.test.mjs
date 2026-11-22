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
