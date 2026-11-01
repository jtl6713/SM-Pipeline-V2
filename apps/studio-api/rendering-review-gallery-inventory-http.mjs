/**
 * Authenticated Gallery source inventory reads. Never generates, reviews,
 * uploads or changes Airtable; does not trust client supplied slide IDs.
 */
import {projectGallerySourceInventory} from "./rendering-review-gallery-inventory.mjs";
const REC=/^rec[A-Za-z0-9]{14}$/;
const text=x=>String(x??"").trim();
const ids=x=>Array.isArray(x)?x.map(v=>typeof v==="object"&&v!==null?text(v.id):text(v)):[];
function deny(code,status=409){
 throw Object.assign(new Error(code),{code,status});
}
export async function readAuthoritativeGalleryInventory({
 output_id,authorized_profile_ids,readOutput,readContent,readSlides,
}={}){
 if(!REC.test(text(output_id))||!Array.isArray(authorized_profile_ids)||
    typeof readOutput!=="function"||typeof readContent!=="function"||
    typeof readSlides!=="function")
   deny("GALLERY_INVENTORY_READER_UNAVAILABLE",503);
 const output=await readOutput(output_id);
 if(output?.id!==output_id||!output.fields)
   deny("GALLERY_INVENTORY_OUTPUT_READ_INVALID",503);
 const contentIds=ids(output.fields.Content_Item);
 if(contentIds.length!==1||!REC.test(contentIds[0]))
   deny("GALLERY_INVENTORY_CONTENT_LINK_INVALID");
 const content=await readContent(contentIds[0]);
 const profiles=ids(content?.fields?.Content_Profile);
 if(content?.id!==contentIds[0]||profiles.length!==1||
    !authorized_profile_ids.includes(profiles[0]))
   deny("GALLERY_INVENTORY_PROFILE_DENIED",403);
 const slideIds=ids(output.fields["Carousel Slides"]);
 if(slideIds.length>80||slideIds.some(id=>!REC.test(id))||
    new Set(slideIds).size!==slideIds.length)
   deny("GALLERY_INVENTORY_SLIDE_LINKS_INVALID");
 const slides=slideIds.length?await readSlides([...slideIds]):[];
 // Catch truncated Airtable reads, additional/foreign IDs and duplicate rows.
 if(!Array.isArray(slides)||slides.length!==slideIds.length||
    new Set(slides.map(row=>row?.id)).size!==slides.length||
    slides.some(row=>!slideIds.includes(row?.id)))
   deny("GALLERY_INVENTORY_SLIDES_UNVERIFIED",503);
 return projectGallerySourceInventory({
   output,content,slides,authorized_profile_ids,output_id,
 });
}
