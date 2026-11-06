/**
 * Issue #1495: read-only native-gallery slide-selection preflight.
 *
 * A correction is selected by exact server-authorized slide ID, not by
 * guessed order, client-provided asset URL, another profile, or output list.
 * This prepares a preview ONLY. It never persists a job, generates images,
 * removes a hold, grants creative approval, schedules or publishes.
 *
 * The Runner must later re-verify authoritative Airtable/Drive records under
 * an exact durable lease before treating any proposal as executable intent.
 */
const REC=/^rec[A-Za-z0-9]{14}$/;
const REQUEST=/^[A-Za-z0-9_-]{8,120}$/;
const text=value=>String(value??"").trim();
function deny(code,status=409){
  throw Object.assign(new Error(code),{code,status});
}
function safeInventory(inventory,outputId){
  if(!inventory||inventory.ok!==true||inventory.output_id!==outputId||
     inventory.source_kind!=="airtable_metadata_only"||
     inventory.can_generate!==false||inventory.publication_authorized!==false||
     inventory.review_hold_created!==false||
     !REC.test(text(inventory.profile_id))||
     !REC.test(text(inventory.content_item_id))||
     !Array.isArray(inventory.slides)||inventory.slides.length>80||
     !Number.isSafeInteger(inventory.slide_count)||
     inventory.slide_count!==inventory.slides.length)
    deny("GALLERY_SELECTION_SOURCE_UNVERIFIED",503);
  const source=new Map();
  for(const slide of inventory.slides){
    if(!REC.test(text(slide?.slide_id))||source.has(slide.slide_id)||
       !Number.isSafeInteger(slide.order)||slide.order<1||
       slide.order>inventory.slide_count||
       !Array.isArray(slide.blockers))
      deny("GALLERY_SELECTION_SLIDE_IDENTITY_INVALID",503);
    source.set(slide.slide_id,slide);
  }
  const ordered=[...source.values()].sort((a,b)=>a.order-b.order);
  if(ordered.some((x,index)=>x.order!==index+1))
    deny("GALLERY_SELECTION_SLIDE_ORDER_INVALID",503);
  return ordered;
}
const digest=async value=>Array.from(
  new Uint8Array(await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(JSON.stringify(value)))),
  byte=>byte.toString(16).padStart(2,"0")).join("");

/**
 * Validate selected slide IDs against a fresh, authenticated Airtable
 * inventory loaded on the server in the same HTTP request.
 *
 * Returns no original private Drive IDs and no executable generation token.
 */
export async function previewNativeGalleryCorrection({
  output_id,client_request_id,selected_slides,inventory,
}={}){
  if(!REC.test(text(output_id))||!REQUEST.test(text(client_request_id))||
     !Array.isArray(selected_slides)||selected_slides.length<1||
     selected_slides.length>80)
    deny("GALLERY_SELECTION_REQUEST_INVALID",400);
  const original=safeInventory(inventory,output_id);
  if(!original.length||selected_slides.length>original.length)
    deny("GALLERY_SELECTION_SOURCE_EMPTY");
  const owned=new Map(original.map(slide=>[slide.slide_id,slide]));
  const chosen=new Map();
  for(const entry of selected_slides){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||
       Object.keys(entry).some(key=>!["slide_id","instruction"].includes(key))||
       !REC.test(text(entry.slide_id))||!owned.has(entry.slide_id)||
       chosen.has(entry.slide_id)||typeof entry.instruction!=="string"||
       entry.instruction.trim().length<8||entry.instruction.trim().length>3000)
      deny("GALLERY_SELECTION_NOT_AUTHORIZED",403);
    chosen.set(entry.slide_id,entry.instruction.trim());
  }
  const selected=original.filter(s=>chosen.has(s.slide_id)).map(s=>({
    slide_id:s.slide_id,order:s.order,instruction:chosen.get(s.slide_id),
    source_status:s.status,blockers:[...s.blockers],
  }));
  const unchanged=original.filter(s=>!chosen.has(s.slide_id)).map(s=>({
    slide_id:s.slide_id,order:s.order,
  }));
  const blockers=[
    ...new Set([
      ...(inventory.blockers||[]).filter(x=>typeof x==="string"),
      ...selected.flatMap(s=>s.blockers),
      "GALLERY_GENERATION_ADAPTER_NOT_CERTIFIED",
      "GALLERY_DRIVE_BYTE_AND_BRANDING_VERIFICATION_REQUIRED",
      "GALLERY_DURABLE_LAUNCH_AND_HUMAN_APPROVAL_REQUIRED",
    ]),
  ];
  const proposal={
    schema:"studio.render-review.gallery-selection.1",
    output_id,content_item_id:inventory.content_item_id,
    profile_id:inventory.profile_id,platform:inventory.platform,
    output_type:inventory.output_type,aspect_ratio:inventory.aspect_ratio,
    client_request_id,selected,unchanged,
    source_kind:"airtable_metadata_only",
    media_generation_authorized:false,creative_approved:false,
    factory_approved:false,publication_authorized:false,
    can_generate:false,blockers,
  };
  return {
    ok:true,...proposal,
    proposal_sha256:await digest([
      proposal.schema,output_id,proposal.content_item_id,proposal.profile_id,
      proposal.aspect_ratio,client_request_id,
      selected.map(s=>[s.slide_id,s.order,s.instruction]),
      unchanged.map(s=>[s.slide_id,s.order]),
    ]),
  };
}
