/**
 * Build a V1 gallery manifest from authoritative Airtable Carousel Slides.
 *
 * This read-only preflight NEVER edits the original slide, Production Request,
 * Platform Output or sibling's image. A signed-in reviewer's exact Content
 * Profile must already have been resolved from the Content Item.
 */
import {REVIEW_GALLERY_SCHEMA} from "./rendering-review-gallery-artifacts.mjs";
const rec=/^rec[A-Za-z0-9]{14}$/;
const file=/^[A-Za-z0-9_-]{20,}$/;
const sha=/^[a-f0-9]{64}$/;
const text=x=>String(x??"").trim();
const label=x=>typeof x==="string"?x:text(x?.name);
const links=x=>Array.isArray(x)?x.map(v=>typeof v==="string"?v:text(v?.id)):[];
const size={"4:5":[4,5],"1:1":[1,1],"9:16":[9,16],"16:9":[16,9]};
const key={"4:5":"Asset_4x5_File_ID","9:16":"Asset_9x16_File_ID","1:1":"Asset_1x1_File_ID","16:9":"Final Google Drive File ID"};
const fail=(code)=>{const e=new Error(code);e.code=code;e.status=409;throw e;};
const ratioOk=(w,h,r)=>Math.abs(w/h-size[r][0]/size[r][1])<=.015;
const digest=async x=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",
 new TextEncoder().encode(JSON.stringify(x)))),v=>v.toString(16).padStart(2,"0")).join("");
/**
 * verifyDriveImage({file_id,output_id,content_item_id,profile_id,
 *   slide_record_id,aspect_ratio}) is an independent SERVER implementation
 * that downloads the exact file from Google Drive and verifies watermarks,
 * rights, active profile, dimensions, SHA256 and MIME. It must NEVER accept
 * client-supplied receipts as authoritative.
 */
export async function buildOriginalGalleryManifest({
 output_id,content_item_id,profile_id,platform,aspect_ratio,
 slides,verifyDriveImage,
}={}){
 if(!rec.test(text(output_id))||!rec.test(text(content_item_id))||
    !rec.test(text(profile_id))||!text(platform)||!size[aspect_ratio]||
    !Array.isArray(slides)||!slides.length||slides.length>80||
    typeof verifyDriveImage!=="function")
   fail("GALLERY_SOURCE_INPUT_INVALID");
 const ordered=[...slides].sort((a,b)=>(a?.fields?.["Slide Number"]||0)-
   (b?.fields?.["Slide Number"]||0));
 const seen=new Set(),files=new Set(),artifacts=[];
 for(let i=0;i<ordered.length;i++){
   const row=ordered[i],f=row?.fields||{},order=f["Slide Number"];
   if(!rec.test(text(row?.id))||seen.has(row.id)||
      links(f["Content Item"]).length!==1||
      links(f["Content Item"])[0]!==content_item_id||
      !links(f["Platform Output"]).includes(output_id)||
      !links(f["Platform Output"]).every(id=>rec.test(id))||
      label(f.Platform)!==platform||
      label(f["Aspect Ratio"])!==aspect_ratio||
      !Number.isSafeInteger(order)||order!==i+1||
      f["Deleted From Carousel"]===true||
      f["Approved For Final"]!==true||
      label(f["Review Status"])!=="Final Approved")
     fail("GALLERY_SOURCE_SLIDE_OWNERSHIP_INVALID");
   seen.add(row.id);
   const driveId=text(f[key[aspect_ratio]]);
   if(!file.test(driveId)||files.has(driveId))
     fail("GALLERY_SOURCE_DRIVE_ID_INVALID");
   files.add(driveId);
   const receipt=await verifyDriveImage({
     file_id:driveId,slide_record_id:row.id,output_id,
     content_item_id,profile_id,aspect_ratio,
   });
   if(receipt?.verified!==true||receipt?.authority!=="server"||
      receipt?.canonical_media_authority!=="google_drive"||
      receipt?.google_drive_verified!==true||
      receipt?.rights_verified!==true||
      receipt?.watermark_verified!==true||
      receipt?.file_id!==driveId||
      receipt?.output_id!==output_id||receipt?.profile_id!==profile_id||
      receipt?.slide_record_id!==row.id||
      !["image/png","image/jpeg","image/webp"].includes(receipt?.mime_type)||
      !Number.isSafeInteger(receipt?.byte_count)||receipt.byte_count<1024||
      !Number.isSafeInteger(receipt?.width)||!Number.isSafeInteger(receipt?.height)||
      receipt.width<128||receipt.height<128||
      !ratioOk(receipt.width,receipt.height,aspect_ratio)||
      !sha.test(text(receipt.sha256)))
     fail("GALLERY_SOURCE_DRIVE_EVIDENCE_INVALID");
   artifacts.push({
     slot_id:row.id,order,drive_file_id:driveId,
     mime_type:receipt.mime_type,byte_count:receipt.byte_count,
     width:receipt.width,height:receipt.height,sha256:receipt.sha256,
     canonical_media_authority:"google_drive",
     authority:"server",verified:true,google_drive_verified:true,
     rights_verified:true,watermark_verified:true,
     profile_id,output_id,
   });
 }
 const manifest={
   schema:REVIEW_GALLERY_SCHEMA,media_kind:"image-set",source_kind:"original",
   output_id,content_item_id,profile_id,platform,aspect_ratio,
   authority:"server",verified:true,artifacts,
 };
 return {...manifest,manifest_sha256:await digest(manifest)};
}
