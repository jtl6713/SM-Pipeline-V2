/**
 * Read-only, profile-scoped source inventory for image/Photo Set/carousel V1.
 * Airtable link checks are NOT Google Drive byte, watermark or rights receipts.
 * No generation, hold, approval, schedule or publish authority is granted here.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const FILE=/^[A-Za-z0-9_-]{20,}$/;
const RATIO=new Set(["1:1","4:5","9:16","16:9"]);
const text=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?text(x.name):text(x);
function links(value){
  return Array.isArray(value)?value.map(x=>typeof x==="object"&&x!==null?text(x.id):text(x)):[];
}
function deny(code,status=409){
  throw Object.assign(new Error(code),{code,status});
}
export function projectGallerySourceInventory({
  output,content,slides,authorized_profile_ids,output_id,
}={}){
  if(!REC.test(text(output_id))||output?.id!==output_id||
     !output?.fields||!content?.fields||!Array.isArray(authorized_profile_ids))
    deny("GALLERY_INVENTORY_AUTHORITY_INVALID",503);
  const fields=output.fields,cf=content.fields;
  const sourceContent=links(fields.Content_Item);
  const profiles=links(cf.Content_Profile);
  if(sourceContent.length!==1||content.id!==sourceContent[0]||
     profiles.length!==1||!REC.test(profiles[0])||
     !authorized_profile_ids.includes(profiles[0]))
    deny("GALLERY_INVENTORY_PROFILE_OR_CONTENT_DENIED",403);
  const profile_id=profiles[0],content_item_id=content.id;
  const imageType=[choice(fields.Platform_Output_Type),choice(fields.Format),
    choice(fields.Studio_Output_Type)].join(" ").toLowerCase();
  if(!/(?:image|photo|carousel|gallery|picture)/.test(imageType))
    deny("GALLERY_INVENTORY_NOT_IMAGE_OUTPUT");
  const linked=links(fields["Carousel Slides"]);
  if(linked.length>80||linked.some(id=>!REC.test(id))||
     new Set(linked).size!==linked.length)
    deny("GALLERY_INVENTORY_LINKS_INVALID");
  const platform=choice(fields.Platform);
  const output_type=choice(fields.Platform_Output_Type);
  const ratio=choice(fields.Aspect_Ratio);
  if(!platform||!output_type)deny("GALLERY_INVENTORY_FORMAT_IDENTITY_MISSING");
  const blockers=[];
  if(!linked.length)blockers.push("GALLERY_SOURCE_LINKS_MISSING");
  if(!RATIO.has(ratio))blockers.push("GALLERY_ASPECT_UNSUPPORTED");
  if(!Array.isArray(slides)||slides.length!==linked.length)
    deny("GALLERY_INVENTORY_READ_INCOMPLETE",503);
  const wanted=new Set(linked),seen=new Set();
  const items=slides.map(row=>{
    const sf=row?.fields;
    if(!REC.test(text(row?.id))||!wanted.has(row.id)||seen.has(row.id)||!sf)
      deny("GALLERY_INVENTORY_SLIDE_IDENTITY_INVALID",503);
    seen.add(row.id);
    if(links(sf["Content Item"]).length!==1||
       links(sf["Content Item"])[0]!==content_item_id||
       !links(sf["Platform Output"]).includes(output_id)||
       choice(sf.Platform)!==platform)
      deny("GALLERY_INVENTORY_SLIDE_SCOPE_INVALID",403);
    const number=sf["Slide Number"];
    if(!Number.isSafeInteger(number)||number<1||number>80)
      deny("GALLERY_INVENTORY_SLIDE_ORDER_INVALID");
    const slideRatio=choice(sf["Aspect Ratio"]);
    const idField=({"1:1":"Asset_1x1_File_ID","4:5":"Asset_4x5_File_ID",
      "9:16":"Asset_9x16_File_ID","16:9":"Final Google Drive File ID"})[ratio];
    const fileId=text(sf[idField]);
    const issues=[];
    if(slideRatio!==ratio)issues.push("SLIDE_ASPECT_MISMATCH");
    if(sf["Deleted From Carousel"]===true)issues.push("SLIDE_DELETED");
    if(sf["Approved For Final"]!==true||
       choice(sf["Review Status"])!=="Final Approved")
      issues.push("SLIDE_APPROVAL_INCOMPLETE");
    if(!FILE.test(fileId))issues.push("SLIDE_DRIVE_FILE_MISSING");
    return {
      slide_id:row.id,order:number,aspect_ratio:slideRatio,
      drive_file_id_present:FILE.test(fileId),
      authoritatively_final_approved:!issues.includes("SLIDE_APPROVAL_INCOMPLETE"),
      status:issues.length?"source_blocked":"source_metadata_present",
      blockers:issues,
    };
  }).sort((a,b)=>a.order-b.order);
  if(items.some((item,i)=>item.order!==i+1))
    deny("GALLERY_INVENTORY_SLIDE_ORDER_GAP");
  if(items.some(item=>item.blockers.length))
    blockers.push("GALLERY_SOURCE_SLIDES_NOT_READY");
  // Even a complete Airtable source is NOT an independently verified
  // original; Drive bytes, dimensions, rights and exact city watermark
  // must be checked by a protected Runner before a review may start.
  blockers.push("GALLERY_DRIVE_BYTE_AND_BRANDING_VERIFICATION_REQUIRED");
  return {
    ok:true,source_kind:"airtable_metadata_only",
    output_id,content_item_id,profile_id,platform,output_type,
    aspect_ratio:ratio,slide_count:items.length,slides:items,
    source_complete:linked.length>0&&items.every(x=>!x.blockers.length),
    google_drive_verified:false,rights_verified:false,
    watermark_verified:false,can_generate:false,
    publication_authorized:false,review_hold_created:false,
    blockers,
  };
}
