/**
 * #2294 — Authoritative Supabase-native photo package approval gate.
 * A selected/render manifest is candidate media, never a publish-ready
 * Carousel Slides inventory. No writes and no Airtable fallback.
 */
import { supabaseRest } from "./supabase-pipeline-reads.mjs";
import { originalIntentCoversGallery } from "./factory-original-intent.mjs";

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

// Generalized exact-sibling repair evidence, not an output-number allowlist.
// It only permits fresh human final review; every source/target link and
// current ownership must independently agree. Legacy #10868 certificate is
// retained for existing repairs; the versioned key is for future executors.
const siblingMarker = bag => bag?.SM_Quality_Exact_Sibling_Media_v1 ||
  bag?.SM_Quality_Exact_Sibling_Media_20261124;
const sourceQa = bag => bag?.SM_Quality_Gallery_Media_QA_v1 ||
  bag?.SM_NYC_AI_Creative_QA_20261122;
const geometryQa = bag => bag?.SM_Quality_Gallery_Geometry_v1 ||
  bag?.SM_NYC_Shared_Small_Watermark_20261122;
const slideSha = slide => sourceQa(slide.fields)?.verified_branded_sha256 ||
  siblingMarker(slide.fields)?.prior_verified_media_evidence?.verified_branded_sha256;

export function siblingGalleryReviewEligible(output) {
  const bag=output?.error_messages||{},m=siblingMarker(bag);
  const n=Number(output?.selected_clip_count);
  return !!m && m.human_approval_required===true && m.provider_writes===0 &&
    Number.isFinite(Date.parse(m.at||"")) && Number.isSafeInteger(Number(m.source_output)) &&
    Number(m.source_output)>0 && Number(m.source_output)!==Number(output.output_number) &&
    REC.test(String(output.airtable_record_id||"")) && UUID.test(String(output.id||"")) &&
    UUID.test(String(output.content_item_id||"")) && UUID.test(String(output.content_profile_id||"")) &&
    Number.isInteger(n)&&n>=2&&n<=10 && output.aspect_ratio==="4:5" &&
    ["Instagram Carousel","Facebook Photo Set"].includes(output.platform_output_type) &&
    ["Instagram","Facebook"].includes(output.platform) &&
    output.output_status==="Ready for Review" && output.review_status==="Review Sent" &&
    output.publish_status==="Not Ready" && output.render_status==="Native Photo Route" &&
    output.do_not_publish===false && output.auto_publish_enabled===false &&
    !output.test_run_id && !output.scheduled_post_date && !output.studio_scheduled_at &&
    !output.published_at && !output.platform_post_url && !output.platform_publish_response &&
    !bag.Platform_Post_ID && !bag.Platform_Media_ID && !bag.IG_Carousel_Parent_Container_ID &&
    !bag.Studio_Publish_Dispatch_Count && !bag.Publish_Attempt_Count &&
    !bag.Publish_Locked_At && !bag.Publish_Started_At &&
    bag.SM_2618_Creative_QA_Hold?.publishing_permitted!==false;
}

export function verifySiblingGalleryEvidence(output,source,slides,originalSlides,assets) {
  const m=siblingMarker(output.error_messages),qa=sourceQa(source?.error_messages);
  const expected=Number(output.selected_clip_count);
  if (!siblingGalleryReviewEligible(output) || !source ||
      Number(source.output_number)!==Number(m.source_output) ||
      source.content_item_id!==output.content_item_id || source.content_profile_id!==output.content_profile_id ||
      source.aspect_ratio!=="4:5" || source.platform===output.platform ||
      source.output_title!==output.output_title || source.output_caption!==output.output_caption ||
      source.selected_clip_count!==expected || !qa || qa.subject_verified!==true ||
      qa.caption_and_hashtag_review!=="pass" || qa.output_native_slides_checked!==expected ||
      qa.publishing_authorized!==false ||
      JSON.stringify(source.selected_assets?.selected_clips)!==JSON.stringify(output.selected_assets?.selected_clips) ||
      JSON.stringify(source.render_clip_list)!==JSON.stringify(output.render_clip_list)) return false;
  const asFinal=rows=>rows.map(s=>({...s,fields:{...s.fields,Shared_Asset_Approved:true,"Approved For Final":true}}));
  if (!Array.isArray(slides)||!Array.isArray(originalSlides)||slides.length!==expected||originalSlides.length!==expected ||
      !inspectNativeGalleryPublicationPackage(output,asFinal(slides)).eligible ||
      !inspectNativeGalleryPublicationPackage(source,asFinal(originalSlides)).eligible) return false;
  for(let i=0;i<expected;i++){
    const s=slides[i], f=s.fields||{}, original=originalSlides[i],of=original.fields||{};
    const p=siblingMarker(f),oq=sourceQa(of),g=geometryQa(of);
    if(!UUID.test(String(s.id||""))||!s.updated_at||!RECOVERED_SLIDE_RECORD.test(String(s.airtable_record_id||""))||
       p?.source_output!==Number(source.output_number)||p.source_slide_id!==original.airtable_record_id||
       p.requires_new_human_approval!==true||p.provider_writes!==0||
       oq?.brand_verified!==true||oq.source_owner_rights_verified!==true||oq.publishing_authorized!==false||
       !SHA256.test(String(oq.verified_branded_sha256||""))||
       p.prior_verified_media_evidence?.verified_branded_sha256!==oq.verified_branded_sha256||
       g?.geometry!=="1080x1350"||g.cdn_sha256_verified!==true||
       g.verified_branded_url!==f["Final Image URL"]||g.branded_sha256!==oq.verified_branded_sha256||
       p.prior_verified_geometry_and_hash?.branded_sha256!==oq.verified_branded_sha256||
       f["Final Image URL"]!==of["Final Image URL"]||f.Asset_Family_Key!==of.Asset_Family_Key||
       f["Google Drive File ID"]!==of["Google Drive File ID"]||
       (f.Shared_Asset_Approved===true)!==(f["Approved For Final"]===true)||
       !["Review Sent","Final Approved"].includes(f["Review Status"])||
       (f["Review Status"]==="Final Approved"&&f["Approved For Final"]!==true))return false;
  }
  const families=new Set(slides.map(s=>s.fields.Asset_Family_Key));
  return Array.isArray(assets)&&assets.length===families.size&&
    new Set(assets.map(a=>a.airtable_record_id)).size===families.size&&
    assets.every(a=>families.has(a.airtable_record_id)&&a.active===true&&a.do_not_use===false&&
      a.asset_status==="Available"&&a.metadata?.rights_status==="Owned");
}

async function preflightSiblingGallery(env,output) {
  const m=siblingMarker(output.error_messages);
  const sources=await supabaseRest(env,"platform_outputs?output_number=eq."+Number(m.source_output)
    +"&select=id,airtable_record_id,output_number,content_item_id,content_profile_id,platform,platform_output_type,studio_output_type,aspect_ratio,selected_clip_count,selected_assets,render_clip_list,output_title,output_caption,error_messages&limit=2");
  if(!Array.isArray(sources)||sources.length!==1)throw Error("Exact sibling gallery source unavailable");
  const source=sources[0];
  const slides=await readNycOwnerGallerySlides(env,output);
  const originalSlides=await readNycOwnerGallerySlides(env,source);
  const families=[...new Set(slides.map(s=>s.fields?.Asset_Family_Key))];
  if(!families.length||families.length>10||families.some(id=>!REC.test(String(id||""))))
    throw Error("Exact sibling gallery source family invalid");
  const assets=await supabaseRest(env,"media_assets?airtable_record_id=in.("+families.map(encodeURIComponent).join(",")+")"
    +"&select=airtable_record_id,active,do_not_use,asset_status,metadata&limit=10");
  if(!verifySiblingGalleryEvidence(output,source,slides,originalSlides,assets))
    throw Error("Exact sibling gallery ownership, media revision or rights evidence invalid");
  return {slides,pending:slides.filter(s=>s.fields["Approved For Final"]!==true).length,siblingRepair:true};
}

async function verifySiblingGalleryBytes(slide) {
  const url=slide.fields["Final Image URL"],expected=slideSha(slide),max=8*1024*1024;
  if(!CDN.test(String(url||""))||!SHA256.test(String(expected||"")))throw Error("Invalid sibling image proof");
  const response=await fetch(url,{redirect:"manual",signal:AbortSignal.timeout(12000)});
  if(response.status!==200||String(response.headers.get("Content-Type")||"").split(";")[0].trim().toLowerCase()!=="image/jpeg"||
      Number(response.headers.get("Content-Length")||0)>max||!response.body){
    try{await response.body?.cancel();}catch{}throw Error("Sibling image unavailable");
  }
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;if(total>max)throw Error("Sibling image exceeds review limit");chunks.push(value);}}
  finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(total);let at=0;for(const c of chunks){bytes.set(c,at);at+=c.length;}
  const hash=[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))].map(b=>b.toString(16).padStart(2,"0")).join("");
  if(total<4||bytes[0]!==255||bytes[1]!==216||hash!==expected)throw Error("Sibling image changed since QA; re-review required");
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
  if (siblingGalleryReviewEligible(output)) return preflightSiblingGallery(env,output);
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
  requestId, approvedByUserRecordId, submittedAt, originalIntentRecovery = false,
} = {}) {
  const proof = await preflightNycOwnerGalleryApproval(env, output);
  if (originalIntentRecovery && !originalIntentCoversGallery({requestId,approvedByUserRecordId,submittedAt},output,proof)) {
    throw Error("Original Factory intent recovery: gallery revision changed; fresh review required");
  }
  if (!proof || !proof.pending) return proof;
  // A historic Failed/accepted batch must never silently consent to NEW
  // corrected slides. Require the Factory request itself to postdate the
  // explicit owner hold release recorded on the canonical output.
  if (!USER_RECORD.test(String(approvedByUserRecordId || ""))
      || !/^[A-Za-z0-9_-]{8,128}$/.test(String(requestId || ""))
      || !Number.isFinite(Date.parse(String(submittedAt || "")))
      || !Number.isFinite(Date.parse(String(output.publish_hold_released_at || "")))
      || Date.parse(submittedAt) < Date.parse(output.publish_hold_released_at)
      || (proof.siblingRepair && Date.parse(submittedAt)<Date.parse(siblingMarker(output.error_messages).at))) {
    throw Error("Native gallery final approval requires a new authenticated Factory submitter and request AFTER the owner hold release");
  }
  if (proof.siblingRepair) {
    // Fresh public bytes, bounded to one image at a time; no provider calls.
    for(const slide of proof.slides) await verifySiblingGalleryBytes(slide);
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
        source_sha256: slideSha(slide),
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
