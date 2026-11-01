/**
 * Pure, fail-closed artifact contract for a future single-image or gallery
 * Rendering Review adapter. No model proposal, browser field or R2 preview
 * can assert that Drive media, rights, or watermark validation succeeded.
 *
 * The caller MUST load and independently verify both media manifests from
 * authoritative Airtable/Drive/producer receipts under the review output
 * approval lease. This function only compares validated server-owned facts.
 * In particular, it does NOT authorize a render, replacement upload,
 * publication, schedule change, or existing hold release.
 */
export const REVIEW_GALLERY_SCHEMA = "studio.render-review.gallery.1";
const record = /^rec[A-Za-z0-9]{14}$/;
const file = /^[A-Za-z0-9_-]{20,}$/;
const sha = /^[0-9a-f]{64}$/;
const id = /^[A-Za-z0-9_-]{8,120}$/;
const kind = new Set(["image/jpeg","image/png","image/webp"]);
const allowed = new Set(["4:5","1:1","9:16","16:9"]);
const text = v => String(v ?? "").trim();
const fail = reason => Object.assign(new Error(reason),{
  code:"REVIEW_GALLERY_EVIDENCE_REJECTED",status:409,
});
function ratioMatches(width,height,ratio){
  const [w,h]=ratio.split(":").map(Number);
  return Math.abs(width/height-w/h)<=0.015;
}
function checkMedia(row,{ratio,profileId,outputId,original=false}={}){
  if(!row||typeof row!=="object"||Array.isArray(row)||
     !id.test(text(row.slot_id))||
     !Number.isSafeInteger(row.order)||row.order<1||
     !file.test(text(row.drive_file_id))||
     !kind.has(row.mime_type)||
     !Number.isSafeInteger(row.byte_count)||row.byte_count<1024||
     !Number.isSafeInteger(row.width)||row.width<128||row.width>12000||
     !Number.isSafeInteger(row.height)||row.height<128||row.height>12000||
     !ratioMatches(row.width,row.height,ratio)||
     !sha.test(text(row.sha256))||
     row.canonical_media_authority!=="google_drive"||
     row.authority!=="server"||row.verified!==true||
     row.google_drive_verified!==true||
     row.rights_verified!==true||
     row.profile_id!==profileId||row.output_id!==outputId||
     (!original&&row.watermark_verified!==true))
    throw fail("Exact owned, rights-cleared, ratio-safe Drive image evidence is required");
}
function validateHeader(manifest,outputId,profileId,ratio,original){
  if(!manifest||typeof manifest!=="object"||Array.isArray(manifest)||
     manifest.schema!==REVIEW_GALLERY_SCHEMA||
     manifest.output_id!==outputId||manifest.profile_id!==profileId||
     manifest.aspect_ratio!==ratio||
     manifest.media_kind!=="image-set"||
     manifest.authority!=="server"||manifest.verified!==true||
     !Array.isArray(manifest.artifacts)||manifest.artifacts.length<1||
     manifest.artifacts.length>80||
     !sha.test(text(manifest.manifest_sha256))||
     (original&&manifest.source_kind!=="original")||
     (!original&&manifest.source_kind!=="revision"))
    throw fail("Authoritative gallery manifest identity is missing");
}
export function validateReviewGalleryAttempt({
  output_id,profile_id,aspect_ratio,original,revision,
}={}) {
  if(!record.test(text(output_id))||!record.test(text(profile_id))||
     !allowed.has(text(aspect_ratio)))
    throw fail("Exact output, profile and image aspect ratio required");
  const opts={ratio:aspect_ratio,profileId:profile_id,outputId:output_id};
  validateHeader(original,output_id,profile_id,aspect_ratio,true);
  validateHeader(revision,output_id,profile_id,aspect_ratio,false);
  if(original.artifacts.length!==revision.artifacts.length)
    throw fail("Image count changed without a separately approved production request");
  const seenOriginal=new Set(),seenRevision=new Set(),files=new Set();
  let replacements=0;
  for(let i=0;i<original.artifacts.length;i++){
    const old=original.artifacts[i],next=revision.artifacts[i];
    checkMedia(old,{...opts,original:true});
    checkMedia(next,opts);
    if(old.order!==i+1||next.order!==i+1||
       old.slot_id!==next.slot_id||
       seenOriginal.has(old.slot_id)||seenRevision.has(next.slot_id)||
       files.has(next.drive_file_id))
      throw fail("Slide order, identity, or uniqueness changed");
    seenOriginal.add(old.slot_id);
    seenRevision.add(next.slot_id);
    files.add(next.drive_file_id);
    if(old.drive_file_id!==next.drive_file_id)replacements++;
    else if(old.sha256!==next.sha256)
      throw fail("Identical Drive file ID cannot change media hash");
  }
  if(!replacements)
    throw fail("A new gallery attempt must change at least one verified image");
  if(revision.original_manifest_sha256!==original.manifest_sha256)
    throw fail("Revision is not bound to the immutable source manifest");
  return Object.freeze({
    schema:REVIEW_GALLERY_SCHEMA,
    output_id,profile_id,aspect_ratio,
    media_kind:"image-set",
    slide_count:original.artifacts.length,
    changed_count:replacements,
    original_manifest_sha256:original.manifest_sha256,
    revision_manifest_sha256:revision.manifest_sha256,
    all_drive_verified:true,
    all_watermarks_verified:true,
    approval_granted:false,publishing_granted:false,
  });
}
