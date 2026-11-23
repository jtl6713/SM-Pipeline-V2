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


/**
 * #2371 — two corrected NYC gallery outputs already have byte-verified owned
 * 4:5 media, but their original AI creative inspection was intentionally NOT
 * final Factory approval. This narrow bridge records a NEW authenticated
 * Factory approval of the exact gallery slides when the owner clicks Approve.
 * It never uses old approval receipts, release-only instructions, or AI QA as
 * an approver. Publication remains controlled by the existing output CAS,
 * MAE, and provider gates. Other galleries retain their independent gate.
 */
const NYC_FACTORY_FINAL_REVIEW = new Map([
  ["recO494MDnQ1Tk51b", { number: 10855, platform: "Instagram", type: "Instagram Carousel", slides: 4 }],
  ["recWIWOrdflmqyxKW", { number: 10856, platform: "Facebook", type: "Facebook Photo Set", slides: 4 }],
  // Exact six repaired NYC gallery outputs still in Factory after the first
  // two completed; public source/rights and SHA evidence verified per slide.
  ["recVoFLCOAGHNIkD3", { number: 10863, platform: "Instagram", type: "Instagram Carousel", slides: 8 }],
  ["rechOtaxHOwY18A8F", { number: 10864, platform: "Facebook", type: "Facebook Photo Set", slides: 8 }],
  ["rec61JeXiA6Aai1Kk", { number: 10867, platform: "Instagram", type: "Instagram Carousel", slides: 4 }],
  ["recttY0sPY2RGkcaq", { number: 10869, platform: "Instagram", type: "Instagram Carousel", slides: 4 }],
  ["recUIDBjcY6RgSy0n", { number: 10870, platform: "Facebook", type: "Facebook Photo Set", slides: 4 }],
  ["recWq5HIxBT8BCtme", { number: 10875, platform: "Instagram", type: "Instagram Carousel", slides: 4 }],
]);
const USER_RECORD = /^rec[A-Za-z0-9]{14}$/;
// #2371 recovered Supabase-native slides have rec + 16 hex (19 chars),
// unlike authenticated Factory user IDs which remain strict rec + 14 chars.
// These synthetic slide IDs are also fenced by UUID, exact output linkage,
// source media/rights QA, updated_at CAS and the original gallery guard.
const RECOVERED_SLIDE_RECORD = /^rec[a-f0-9]{16}$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i;
const SHA256 = /^[a-f0-9]{64}$/;

export function nycOwnerGalleryApprovalEligible(output) {
  const exact = NYC_FACTORY_FINAL_REVIEW.get(String(output?.airtable_record_id || ""));
  if (!exact) return false;
  const bag = output.error_messages || {};
  const qa = bag.SM_NYC_AI_Creative_QA_20261122 || {};
  return output.output_number === exact.number
    && output.selected_clip_count === exact.slides
    && qa.output_native_slides_checked === exact.slides
    && output.platform === exact.platform
    && output.platform_output_type === exact.type
    && output.output_status === "Ready for Review"
    && output.review_status === "Review Sent"
    && output.publish_status === "Not Ready"
    && output.render_status === "Native Photo Route"
    && output.do_not_publish === false
    && output.auto_publish_enabled === false
    && !output.test_run_id
    && !output.scheduled_post_date
    && !output.studio_scheduled_at
    && !output.published_at
    && !output.platform_post_url
    && !output.platform_publish_response
    && !bag.Platform_Post_ID && !bag.Platform_Media_ID
    && !bag.IG_Carousel_Parent_Container_ID
    && !bag.Studio_Publish_Dispatch_Count
    && !bag.Publish_Attempt_Count
    && qa.subject_verified === true
    && qa.caption_and_hashtag_review === "pass"
    && qa.factory_final_approval === false
    && qa.publishing_authorized === false
    && bag.SM_2618_Creative_QA_Hold?.publishing_permitted !== false;
}

async function readNycOwnerGallerySlides(env, output) {
  const rows = await supabaseRest(env,
    "carousel_slides?deleted_from_carousel=eq.false"
    + "&fields->PO_Output_ID=cs." + encodeURIComponent(JSON.stringify([output.output_number]))
    + "&select=id,airtable_record_id,current_order,deleted_from_carousel,fields,updated_at"
    + "&order=current_order.asc,airtable_record_id.asc&limit=12");
  if (!Array.isArray(rows)) throw Error("Native gallery final review: slide read unavailable");
  return rows;
}

export async function preflightNycOwnerGalleryApproval(env, output) {
  if (!nycOwnerGalleryApprovalEligible(output)) return null;
  const slides = await readNycOwnerGallerySlides(env, output);
  const asIfFinal = slides.map(slide => ({
    ...slide,
    fields: { ...slide.fields, Shared_Asset_Approved: true, "Approved For Final": true },
  }));
  // Verify ALL independent exact link, order, 4:5 CDN, selected/render
  // manifest, source lineage and READY guards without declaring human approval.
  const technical = inspectNativeGalleryPublicationPackage(output, asIfFinal);
  const expected = NYC_FACTORY_FINAL_REVIEW.get(String(output.airtable_record_id)).slides;
  if (!technical.eligible || technical.slide_count !== expected) {
    throw Error("Native gallery preapproval blocked: "
      + (technical.eligible ? "native_gallery_verified_slide_count_mismatch" : technical.reason)
      + " (output #" + output.output_number + ")");
  }
  for (const slide of slides) {
    const f = slide.fields || {};
    const qa = f.SM_NYC_AI_Creative_QA_20261122 || {};
    if (!UUID.test(String(slide.id || "")) || !slide.updated_at
        || !RECOVERED_SLIDE_RECORD.test(String(slide.airtable_record_id || ""))
        || qa.brand_verified !== true || qa.source_owner_rights_verified !== true
        || qa.publishing_authorized !== false
        || !SHA256.test(String(qa.verified_branded_sha256 || ""))
        || (f.Shared_Asset_Approved === true) !== (f["Approved For Final"] === true)
        || (![ "Review Sent", "Final Approved" ].includes(String(f["Review Status"] || "")))
        || (f["Review Status"] === "Final Approved" && f["Approved For Final"] !== true)) {
      throw Error("Native gallery preapproval blocked: independent slide evidence/decision invalid");
    }
  }
  return { slides, pending: slides.filter(slide => slide.fields["Approved For Final"] !== true).length };
}

/**
 * Only called by an authenticated NEW Factory Approve operation that carries
 * its real submitter ID. No background worker or historic receipt can mark
 * slides final. Partial same-output CAS writes are safe to retry: the parent
 * stays RFR and the unmodified publication gate still requires every expected slide.
 */
export async function finalizeNycOwnerGalleryOnFactoryClick(env, output, {
  requestId, approvedByUserRecordId, submittedAt,
} = {}) {
  const proof = await preflightNycOwnerGalleryApproval(env, output);
  if (!proof || !proof.pending) return proof;
  // A historic Failed/accepted batch must never silently consent to NEW
  // corrected slides. Require the Factory request itself to postdate the
  // explicit owner hold release recorded on the canonical output.
  if (!USER_RECORD.test(String(approvedByUserRecordId || ""))
      || !/^[A-Za-z0-9_-]{8,128}$/.test(String(requestId || ""))
      || !Number.isFinite(Date.parse(String(submittedAt || "")))
      || !Number.isFinite(Date.parse(String(output.publish_hold_released_at || "")))
      || Date.parse(submittedAt) < Date.parse(output.publish_hold_released_at)) {
    throw Error("Native gallery final approval requires a new authenticated Factory submitter and request AFTER the owner hold release");
  }
  const now = new Date().toISOString();
  for (const slide of proof.slides) {
    const f = slide.fields;
    if (f["Approved For Final"] === true && f.Shared_Asset_Approved === true) continue;
    const approvedFields = {
      ...f,
      "Approved For Final": true,
      Shared_Asset_Approved: true,
      "Review Status": "Final Approved",
      SM_Factory_NYC_Final_Slide_Approval_2371: {
        at: now,
        actor_record_id: approvedByUserRecordId,
        actor_provenance: "new_authenticated_factory_approve_click",
        request_id: requestId,
        output_number: output.output_number,
        slide_order: slide.current_order,
        exact_final_image_url: f["Final Image URL"],
        source_sha256: f.SM_NYC_AI_Creative_QA_20261122.verified_branded_sha256,
        provider_writes: 0,
      },
    };
    const selector = "carousel_slides?id=eq." + encodeURIComponent(slide.id)
      + "&airtable_record_id=eq." + encodeURIComponent(slide.airtable_record_id)
      + "&updated_at=eq." + encodeURIComponent(slide.updated_at)
      + "&deleted_from_carousel=eq.false";
    const patched = await supabaseRest(env, selector, {
      method: "PATCH",
      body: { fields: approvedFields, updated_at: now },
      headers: { Prefer: "return=representation" },
    });
    if (!Array.isArray(patched) || patched.length !== 1) {
      throw Error("Native gallery slide changed during authenticated final approval; output remains unapproved");
    }
  }
  // The ORIGINAL publisher guard verifies fresh persisted final decisions.
  return assertSupabaseNativeGalleryPublicationPackage(env, output);
}
