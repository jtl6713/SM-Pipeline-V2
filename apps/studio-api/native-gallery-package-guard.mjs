/**
 * #2294 — Authoritative Supabase-native photo package approval gate.
 * A selected/render manifest is candidate media, never a publish-ready
 * Carousel Slides inventory. No writes and no Airtable fallback.
 */
import { supabaseRest } from "./supabase-pipeline-reads.mjs";

const REC = /^rec[A-Za-z0-9]{14}$/;
const CDN = /^https:\/\/media\.chicagoshining\.com\/studio\/previews\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i;
const number = value => Number.isSafeInteger(Number(value)) ? Number(value) : null;
const url = clip => String(clip?.url || clip?.src || "").trim();
const oneLink = (ids, value) => Array.isArray(ids) && ids.length === 1 && ids[0] === value;
const gallery = row => /carousel|multi[\s-]?image|photo set/i.test(
  String(row?.studio_output_type || "") + " " + String(row?.platform_output_type || ""));

export function inspectNativeGalleryPublicationPackage(output, slides) {
  if (!gallery(output)) return { applicable: false, eligible: true, reason: "not_native_gallery" };
  const fail = reason => ({ applicable: true, eligible: false, reason, slide_count: Array.isArray(slides) ? slides.length : 0 });
  const id = String(output?.airtable_record_id || "");
  const outputNumber = number(output?.output_number);
  if (!REC.test(id) || !outputNumber || outputNumber < 1) return fail("native_gallery_output_identity_invalid");
  const source = output?.selected_assets?.selected_clips;
  const render = output?.render_clip_list;
  const expected = number(output?.selected_clip_count);
  if (!Array.isArray(source) || !Array.isArray(render) || !expected ||
      expected < 2 || expected > 10 || source.length !== expected || render.length !== expected) {
    return fail("native_gallery_selected_render_manifest_missing_or_inconsistent");
  }
  if (!Array.isArray(slides) || slides.length !== expected) {
    return fail("native_gallery_slide_count_mismatch");
  }
  const seenImages = new Set(), seenSources = new Set();
  for (let i = 0; i < expected; i += 1) {
    const candidate = source[i], rendered = render[i], row = slides[i];
    const fields = row?.fields || {};
    const index = i + 1;
    const image = url(candidate);
    const original = String(candidate?.googleDriveFileId || candidate?.google_drive_file_id || "");
    const family = String(candidate?.mediaAssetRecordId || candidate?.media_asset_record_id || "");
    const storedSource = String(fields["Google Drive File ID"] || "");
    const storedFamily = String(fields["Asset_Family_Key"] || "");
    if (row?.deleted_from_carousel !== false ||
        number(row?.current_order) !== index ||
        number(fields["Slide Number"]) !== index ||
        !oneLink(fields["Platform Output"], id) ||
        !oneLink(fields.PO_Output_ID, outputNumber)) {
      return fail("native_gallery_slide_ownership_or_order_invalid");
    }
    if (number(candidate?.order) !== index || number(rendered?.order) !== index ||
        !CDN.test(image) || !CDN.test(url(rendered)) ||
        image !== url(rendered) ||
        image !== String(fields["Final Image URL"] || "") ||
        image !== String(fields["Asset_4x5_Public_URL"] || "") ||
        seenImages.has(image)) {
      return fail("native_gallery_public_image_or_manifest_mismatch");
    }
    if (!REC.test(family) || !/^[A-Za-z0-9_-]{15,}$/.test(original) ||
        family !== storedFamily || original !== storedSource ||
        seenSources.has(original)) {
      return fail("native_gallery_source_provenance_unverified");
    }
    // Labels are evidence of an explicit approval, not a substitute for
    // public-byte, aspect-ratio or ownership verification. If either is
    // missing, fail closed before Factory touches approval or MAE.
    if (fields.Shared_Asset_Approved !== true ||
        String(fields.Asset_4x5_Public_Status || "") !== "Ready" ||
        (fields["Approved For Final"] !== true && fields["Review Status"] !== "Final Approved")) {
      return fail("native_gallery_images_not_final_approved");
    }
    seenImages.add(image);
    seenSources.add(original);
  }
  return { applicable: true, eligible: true, reason: "complete_linked_native_gallery",
    slide_count: expected };
}

export async function assertSupabaseNativeGalleryPublicationPackage(env, output) {
  if (!gallery(output)) return { applicable: false, eligible: true, reason: "not_native_gallery" };
  const outputNumber = number(output?.output_number);
  if (!outputNumber || !REC.test(String(output?.airtable_record_id || ""))) {
    throw Error("Native gallery publication blocked: exact output identity missing");
  }
  const slides = await supabaseRest(env,
    "carousel_slides?deleted_from_carousel=eq.false"
    + "&fields->PO_Output_ID=cs." + encodeURIComponent(JSON.stringify([outputNumber]))
    + "&select=airtable_record_id,current_order,deleted_from_carousel,fields"
    + "&order=current_order.asc,airtable_record_id.asc&limit=12");
  if (!Array.isArray(slides)) throw Error("Native gallery publication blocked: Supabase slide read unavailable");
  const state = inspectNativeGalleryPublicationPackage(output, slides);
  if (!state.eligible) {
    throw Error("Native gallery publication blocked: " + state.reason
      + " (output #" + outputNumber + ")");
  }
  return state;
}
