/** #2907: explicit human review of owned, independently verified gallery drafts.
 * Initial rollout is limited to six exact Chicago repair records. All data
 * reads/writes are canonical Supabase; no approval, schedule or provider call.
 */
import {factorySupabaseApprovalRows} from "./factory-supabase-approval.mjs";
import {supabaseRest} from "./supabase-pipeline-reads.mjs";
import {inspectNativeGalleryPublicationPackage} from "./native-gallery-package-guard.mjs";
import {withOutputApprovalLock} from "./output-approval-lease.mjs";

const EXACT=Object.freeze({
  recbzkRN1wyWoBjOn:[11129,4],recpycdsTXLBTD5s6:[11130,4],
  rec9hMlB2fBjbdHED:[11131,5],rec7ZBwpvup8CDp7x:[11132,5],
  recxl6v6xS9hJGuh3:[11136,10],recg1e2fiwy8wnPpG:[11137,10],
});
const REC=/^rec[A-Za-z0-9]{14}$/;
const SHA=/^[a-f0-9]{64}$/;
const UUID=/^[a-f0-9-]{36}$/i;
const REPAIR="SM_Chicago_Gallery_Repair_2890";
const HOLD="SM_Native_Gallery_Preflight_Hold_2294";
const DRAFT="SM_Native_Gallery_Draft_Repair_2294";
const RECEIPT="SM_Factory_Review_Resolve_2907";
const deny=(message,status=409)=>{throw Object.assign(Error(message),{status});};
const enc=encodeURIComponent;
export function reviewResolveCandidate(id,number,held,marker) {
  return held===true && EXACT[id]?.[0]===Number(number)
    && marker?.stage==="owned_branded_draft_materialized"
    && marker.visual_qa_pending===true && marker.publishing_authorized===false;
}
const hash=async bytes=>[...new Uint8Array(await crypto.subtle.digest("SHA-256",bytes))]
  .map(b=>b.toString(16).padStart(2,"0")).join("");
const fingerprint=values=>hash(new TextEncoder().encode(JSON.stringify(values)));
function actorFor(auth,profile){
  if(!auth?.authenticated||!auth?.authorized||auth?.permissions?.outputs_review!==true
    || !(auth.permissions.publishing_control===true||auth.permissions.tenant_admin===true)
    || !REC.test(String(auth.user?.record_id||""))
    || !Array.isArray(auth.authorized_profile_ids)||!auth.authorized_profile_ids.includes(profile))
    deny("Review & Resolve requires an authorized reviewer with publishing-hold control for this profile.",403);
  return auth.user.record_id;
}
export function inspectResolveOutput(row, id) {
  const exact=EXACT[id], bag=row?.error_messages||{}, repair=bag[REPAIR], hold=bag[HOLD];
  if(!exact||row?.airtable_record_id!==id||row.output_number!==exact[0]
    || row.selected_clip_count!==exact[1]||!reviewResolveCandidate(id,row.output_number,row.do_not_publish,repair)
    || repair.slide_count!==exact[1]||repair.factory_final_approval!==false
    || hold?.issue_number!==2294||hold.verification_status!=="not_yet_verified"||hold.publishing_authorized!==false
    || row.output_status!=="Ready for Review"||row.render_status!=="Native Photo Route"
    || !["","Review Sent","Pending Review","Pending"].includes(String(row.review_status||""))
    || row.publish_status!=="Not Ready"||row.auto_publish_enabled!==false
    || !row.updated_at||!row.output_caption?.trim()||row.test_run_id
    || row.scheduled_post_date||row.studio_scheduled_at||row.youtube_scheduled_publish_at
    || row.published_at||row.platform_post_url||row.platform_publish_response
    || Object.keys(bag).some(k=>!([HOLD,REPAIR].includes(k))&&
      /hold|creative.qa|publisher|publish.started|publish.lock|publish.attempt|publish.dispatch|platform.post.id|platform.media.id|container.id/i.test(k)&&!!bag[k]))
    deny("This output has a different or changed hold. Studio must inspect it; no approval or release is allowed.");
  return exact;
}
export function inspectResolveSlides(row,slides) {
  const exact=inspectResolveOutput(row,row.airtable_record_id);
  if(!Array.isArray(slides)||slides.length!==exact[1])deny("Studio must repair the missing or extra linked slides.");
  const asFinal=slides.map(s=>({...s,fields:{...s.fields,Shared_Asset_Approved:true,"Approved For Final":true}}));
  const checked=inspectNativeGalleryPublicationPackage(row,asFinal);
  if(!checked.eligible||checked.slide_count!==exact[1])deny("Studio must repair the gallery: "+checked.reason);
  return slides.map((s,i)=>{
    const f=s.fields||{},m=f[DRAFT],q=f[REPAIR],prior=f[RECEIPT];
    const pending=f["Approved For Final"]===false&&f.Shared_Asset_Approved===false
      &&f["Review Status"]==="Pending Review"&&m?.final_creative_approved===false&&q?.visual_qa_pending===true;
    const accepted=f["Approved For Final"]===true&&f.Shared_Asset_Approved===true
      &&f["Review Status"]==="Final Approved"&&m?.final_creative_approved===true
      &&q?.visual_qa_pending===false&&REC.test(String(prior?.actor_record_id||""))
      &&SHA.test(String(prior?.package_sha256||""))&&prior?.publishing_authorized===false
      &&prior?.slide_sha256===q?.verified_branded_sha256;
    if(!UUID.test(String(s.id||""))||!s.updated_at
      ||s.airtable_record_id!=="sb-native:2294:"+exact[0]+":"+String(i+1).padStart(2,"0")
      ||m?.output_number!==exact[0]||m?.slide_order!==i+1||m?.rights_status!=="Owned"
      ||m?.image_http_verified!==true||m?.image_geometry_verified!==true||m?.verified_dimensions!=="1080x1350"
      ||q?.brand_verified!==true||q?.source_owner_rights_verified!==true
      ||m?.publishing_authorized!==false||q?.publishing_authorized!==false
      ||!SHA.test(String(q?.verified_branded_sha256||""))||m.public_sha256!==q.verified_branded_sha256
      ||!(pending||accepted))deny("Studio must verify exact owned, branded 4:5 image evidence for slide "+(i+1)+".");
    return {order:i+1,image_url:f["Final Image URL"],sha256:q.verified_branded_sha256,
      family:f.Asset_Family_Key,source:f["Google Drive File ID"],id:s.airtable_record_id};
  });
}
async function readSlides(env,row){
  return supabaseRest(env,"carousel_slides?deleted_from_carousel=eq.false&fields->PO_Output_ID=cs."
    +enc(JSON.stringify([row.output_number]))+"&select=id,airtable_record_id,current_order,deleted_from_carousel,fields,updated_at"
    +"&order=current_order.asc,airtable_record_id.asc&limit=12");
}
async function readProof(env,id,auth){
  const entry=(await factorySupabaseApprovalRows(env,[id])).get(id);
  const row=entry?.row,actor=actorFor(auth,entry?.profileId);
  inspectResolveOutput(row,id);
  const slides=await readSlides(env,row);
  const images=inspectResolveSlides(row,slides);
  const families=[...new Set(images.map(s=>s.family))];
  const assets=await supabaseRest(env,"media_assets?airtable_record_id=in.("+families.map(enc).join(",")+")"
    +"&select=airtable_record_id,active,do_not_use,asset_status,metadata&limit=10");
  if(!Array.isArray(assets)||assets.length!==families.length
    ||new Set(assets.map(a=>a.airtable_record_id)).size!==families.length
    ||assets.some(a=>!families.includes(a.airtable_record_id)||a.active!==true||a.do_not_use!==false
      ||a.asset_status!=="Available"||a.metadata?.rights_status!=="Owned"))deny("Studio must verify current source ownership and availability.");
  const sha=await fingerprint([id,entry.profileId,row.output_caption,images]);
  if(slides.some(s=>s.fields?.[RECEIPT]&&s.fields[RECEIPT].package_sha256!==sha))
    deny("A prior partial review belongs to a changed package; Studio must reconcile.");
  return {row,slides,images,sha,actor};
}
export async function readFactoryReviewResolve(env,id,authorization){
  const p=await readProof(env,id,authorization);
  return {output_id:id,count:p.images.length,slides:p.images.map(({order,image_url})=>({order,image_url})),
    caption:p.row.output_caption,package_sha256:p.sha,review_resolve_available:true,do_not_publish:true,
    publication_authorized:false,source:"verified-held-gallery-review"};
}
async function verifyBytes(image,fetchImpl){
  const response=await fetchImpl(image.image_url,{method:"GET",redirect:"manual",signal:AbortSignal.timeout(12000)});
  const max=8*1024*1024;
  if(response.status!==200||!/^image\/jpeg(?:;|$)/i.test(response.headers.get("Content-Type")||"")
    ||Number(response.headers.get("Content-Length")||0)>max||!response.body){
    try{await response.body?.cancel();}catch{} deny("Studio must repair unavailable image "+image.order+".");
  }
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;
    total+=value.byteLength;if(total>max)deny("Image exceeds safe review limit.");chunks.push(value);}}
  finally{try{await reader.cancel();}catch{}}
  const bytes=new Uint8Array(total);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
  if(total<4||bytes[0]!==255||bytes[1]!==216||await hash(bytes)!==image.sha256)
    deny("Studio must repair changed image bytes for slide "+image.order+".");
}
export async function resolveFactoryGalleryReview(env,id,authorization,payload,{fetchImpl=fetch}={}){
  if(!SHA.test(String(payload?.package_sha256||""))||payload?.confirm_images!==true
    ||payload?.confirm_caption!==true||payload?.confirm_branding_rights!==true)
    deny("Confirm the reviewed images, caption, branding and rights.",400);
  if(!env.STUDIO_MEDIA)deny("Review lock unavailable.",503);
  return withOutputApprovalLock(env.STUDIO_MEDIA,id,async()=>{
    let p=await readProof(env,id,authorization);
    if(p.sha!==payload.package_sha256)deny("Gallery changed. Reopen Review & Resolve.");
    for(let i=0;i<p.images.length;i+=2)await Promise.all(p.images.slice(i,i+2).map(image=>verifyBytes(image,fetchImpl)));
    const fresh=await readProof(env,id,authorization);
    if(fresh.sha!==p.sha||fresh.row.updated_at!==p.row.updated_at)deny("Gallery changed during verification. Reopen review.");
    p=fresh;const now=new Date().toISOString();
    for(let i=0;i<p.slides.length;i++){
      const s=p.slides[i],f=s.fields;
      if(f["Approved For Final"]===true)continue;
      const fields={...f,"Approved For Final":true,Shared_Asset_Approved:true,"Review Status":"Final Approved",
        [DRAFT]:{...f[DRAFT],final_creative_approved:true},
        [REPAIR]:{...f[REPAIR],visual_qa_pending:false},
        [RECEIPT]:{actor_record_id:p.actor,at:now,package_sha256:p.sha,slide_sha256:p.images[i].sha256,
          human_images_caption_branding_rights_confirmed:true,publishing_authorized:false}};
      const changed=await supabaseRest(env,"carousel_slides?id=eq."+enc(s.id)
        +"&airtable_record_id=eq."+enc(s.airtable_record_id)+"&updated_at=eq."+enc(s.updated_at)
        +"&deleted_from_carousel=eq.false",{method:"PATCH",body:{fields,updated_at:now},headers:{Prefer:"return=representation"}});
      if(!Array.isArray(changed)||changed.length!==1)deny("Slide changed concurrently. Publishing remains held; reopen Review & Resolve.");
    }
    const final=await readProof(env,id,authorization);
    if(final.sha!==p.sha||final.row.updated_at!==p.row.updated_at
      ||!inspectNativeGalleryPublicationPackage(final.row,final.slides).eligible)
      deny("Final gallery readback failed. Publishing remains held; reopen Review & Resolve.");
    const row=final.row,bag=row.error_messages;
    const receipt={actor_record_id:p.actor,at:now,package_sha256:p.sha,slide_count:p.images.length,
      human_images_caption_branding_rights_confirmed:true,formal_approval_pending:true,publishing_authorized:false};
    const changed=await supabaseRest(env,"platform_outputs?id=eq."+enc(row.id)
      +"&airtable_record_id=eq."+enc(id)+"&updated_at=eq."+enc(row.updated_at)
      +"&do_not_publish=eq.true&auto_publish_enabled=eq.false&output_status=eq.Ready%20for%20Review"
      +"&publish_status=eq.Not%20Ready&scheduled_post_date=is.null&studio_scheduled_at=is.null"
      +"&youtube_scheduled_publish_at=is.null&published_at=is.null&platform_post_url=is.null",
      {method:"PATCH",headers:{Prefer:"return=representation"},body:{
        do_not_publish:false,auto_publish_enabled:false,review_status:"Review Sent",publish_hold_released_at:now,updated_at:now,
        error_messages:{...bag,[REPAIR]:{...bag[REPAIR],visual_qa_pending:false,stage:"human_review_verified"},
          [HOLD]:{...bag[HOLD],verification_status:"resolved_for_formal_factory_review",resolved_at:now},[RECEIPT]:receipt}}});
    if(!Array.isArray(changed)||changed.length!==1)deny("Hold release changed concurrently. Refresh Factory.");
    const check=(await factorySupabaseApprovalRows(env,[id])).get(id)?.row;
    if(check?.do_not_publish!==false||check.auto_publish_enabled!==false||check.output_status!=="Ready for Review"
      ||check.review_status!=="Review Sent"||check.publish_status!=="Not Ready"||check.scheduled_post_date
      ||check.studio_scheduled_at||check.published_at||check.error_messages?.[RECEIPT]?.package_sha256!==p.sha)
      deny("Review release readback unavailable. Refresh Factory; do not repeat blindly.",503);
    return {id,review_resolved:true,released:true,formal_approval_pending:true,scheduled:false,published:false,
      message:"Human gallery review recorded. Ready for your separate Factory Approve decision. Nothing scheduled or published."};
  });
}
