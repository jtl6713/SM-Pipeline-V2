// #3159: Supabase-authoritative status-only reconciliation. No create, upload,
// schedule, provider retry, or broad legacy mutation callback exists here.
import { recoveryBlock,receiptBlock,recoverySnapshot } from "./exception-recovery-autonomous.mjs";
import { overdueMaeExactSelector } from "./overdue-mae-recovery.mjs";
const prefix="studio/state/3159-public-receipts/v1/";
const FIVE=300000,HOUR=3600000;
const idOk=id=>/^rec[A-Za-z0-9]{14}$/.test(String(id||""));
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const ms=v=>Date.parse(String(v||""));
const str=(row,key)=>String(row?.fields?.[key]??"").trim();
const empty=v=>v==null||v==="";
export function stagedReceiptPatch(entry,source,receipt,now){
  const r=entry?.row,s=source?.row;
  const deny=reason=>({ok:false,reason});
  if(!r||!s||!idOk(r.airtable_record_id)||s.id!==r.airtable_record_id||
    entry.profileId!==source.profile_id||s.fields?.Content_Profile?.[0]!==entry.profileId||
    r.do_not_publish!==false||r.review_status!=="Approved"||r.test_run_id||
    !["Approved for Publishing","Published","Awaiting Public Release"].includes(r.output_status)||
    !["Instagram","YouTube"].includes(r.platform)||r.platform!==str(s,"Platform")||
    !r.error_messages||typeof r.error_messages!=="object"||Array.isArray(r.error_messages))
    return deny("canonical_approved_identity_required");
  if(r.output_status==="Published"&&r.publish_status==="Published"&&r.published_at&&r.platform_post_url)
    return deny("already_complete");
  const blocked=recoveryBlock(s,now)||receiptBlock(s,receipt,now);
  if(blocked)return deny(blocked);
  if(receipt.verified_public!==true||receipt.verified_delivery!==true||receipt.ownership_verified!==true||
    !receipt.remote_id||!receipt.permalink||!Number.isFinite(ms(receipt.published_at)))
    return deny("verified_public_receipt_required");
  if(str(s,"Platform_Media_ID")&&str(s,"Platform_Media_ID")!==receipt.remote_id)
    return deny("conflicting_media_identity");
  // Never replace a valid existing time or URL. Provider verifier has already
  // checked matching remote identity, account, timestamp and permalink.
  const published=r.published_at||receipt.published_at,url=r.platform_post_url||receipt.permalink;
  const evidence={version:"3159-public-receipt-v1",record_id:r.airtable_record_id,profile_id:source.profile_id,
    platform:r.platform,remote_id:receipt.remote_id,verified_public:true,verified_delivery:true,ownership_verified:true,
    provider_published_at:receipt.published_at,provider_permalink:receipt.permalink,checked_at:receipt.checked_at,
    evidence:receipt.evidence,recorded_at:new Date(now).toISOString(),provider_writes:0};
  const bag={...r.error_messages,Published_At:published,Platform_Post_URL:url,Output_Status:"Published",
    Publish_Status:"Published",Publish_Retry_Eligible:false,Platform_Post_ID:receipt.remote_id,
    Platform_Media_ID:receipt.remote_id,SM_3159_Verified_Public_Receipt:evidence};
  if(r.platform==="Instagram"&&r.platform_output_type==="Instagram Carousel"){
    bag.IG_Carousel_Status="Published";
    bag.IG_Carousel_Published_Media_ID=receipt.remote_id;
  }
  return {ok:true,body:{output_status:"Published",publish_status:"Published",published_at:published,
    platform_post_url:url,publish_retry_eligible:false,updated_at:new Date(now).toISOString(),
    ...(r.platform==="Instagram"&&r.platform_output_type==="Instagram Carousel"?{ig_carousel_status:"Published"}:{}),
    error_messages:bag}};
}
async function claim(bucket,key,data){
  const wrote=await bucket.put(key,JSON.stringify(data),{onlyIf:new Headers({"If-None-Match":"*"}),httpMetadata:{contentType:"application/json"}});
  if(!wrote)return false;
  const found=await bucket.get(key);
  return !!found&&same(JSON.parse(await found.text()),data);
}
export async function runStagedPublicReceiptRecovery({bucket,rest,read,readSource,verifyRemote,lock,now=Date.now}){
  if(!bucket||![rest,read,readSource,verifyRemote,lock].every(fn=>typeof fn==="function"))
    return {status:"unavailable",reason:"canonical_dependencies_required"};
  // Saved exact remote ID only. Never infer delivery from caption matches or
  // missing inventory. No date gate needed because this lane cannot publish.
  const query="platform_outputs?test_run_id=is.null&do_not_publish=eq.false&review_status=eq.Approved"+
    "&output_status=in.(Approved%20for%20Publishing,Published,Awaiting%20Public%20Release)"+
    "&and=(or(published_at.is.null,platform_post_url.is.null,platform_post_url.eq.,publish_status.neq.Published,output_status.neq.Published),"+
    "or(and(platform.eq.Instagram,or(error_messages->>Platform_Post_ID.not.is.null,error_messages->>IG_Carousel_Published_Media_ID.not.is.null)),and(platform.eq.YouTube,or(error_messages->>YouTube_Video_ID.not.is.null,error_messages->>Platform_Post_ID.not.is.null))))"+
    "&select=airtable_record_id&order=updated_at.asc,airtable_record_id.asc&limit=40";
  const rows=await rest(query);
  if(!Array.isArray(rows))throw Error("staged_receipt_inventory_unavailable");
  for(const item of rows){
    const id=item.airtable_record_id;
    if(!idOk(id))continue;
    const hour=Math.floor(now()/HOUR);
    if(await bucket.get(prefix+"checked/"+id+"/"+hour+".json"))continue;
    let result;
    try{
      result=await lock(id,async()=>{
        const entry=await read(id),source=await readSource(id);
        if(!entry?.row||source?.row?.id!==id||entry.profileId!==source.profile_id)return {status:"skipped"};
        const block=recoveryBlock(source.row,now());
        if(block)return {status:"skipped",reason:block};
        if(entry.row.output_status==="Published"&&entry.row.publish_status==="Published"&&entry.row.published_at&&entry.row.platform_post_url)
          return {status:"skipped"};
        const slot=Math.floor(now()/FIVE);
        if(!await claim(bucket,prefix+"tick/"+slot+".json",{id,slot}))return {status:"budget_used"};
        if(!await claim(bucket,prefix+"checked/"+id+"/"+hour+".json",{id,hour}))return {status:"budget_used"};
        const receipt=await verifyRemote(source.row);
        const latest=await read(id),after=await readSource(id);
        // Check exact raw snapshot and ownership again after provider GET.
        if(!latest?.row||!after?.row||!same(entry.row,latest.row)||
          entry.profileId!==latest.profileId||source.profile_id!==after.profile_id||
          !same(recoverySnapshot(source.row),recoverySnapshot(after.row)))
          return {status:"state_changed_no_write"};
        const patch=stagedReceiptPatch(latest,after,receipt,now());
        if(!patch.ok)return {status:"unverified_no_write",reason:patch.reason};
        // Existing full-bag/updated_at CAS protects concurrent provider stamps.
        // No provider operation can occur after the canonical write.
        const selector=overdueMaeExactSelector(latest.row);
        const written=await rest(selector,{method:"PATCH",body:patch.body,headers:{Prefer:"return=representation"}});
        if(!Array.isArray(written)||written.length!==1||written[0].id!==latest.row.id)
          return {status:"cas_unconfirmed_no_replay"};
        const verified=await read(id),v=verified?.row;
        if(!v||v.id!==latest.row.id||v.output_status!=="Published"||v.publish_status!=="Published"||
          ms(v.published_at)!==ms(patch.body.published_at)||v.platform_post_url!==patch.body.platform_post_url||
          !same(v.error_messages?.SM_3159_Verified_Public_Receipt,patch.body.error_messages.SM_3159_Verified_Public_Receipt)||
          v.do_not_publish!==latest.row.do_not_publish||v.auto_publish_enabled!==latest.row.auto_publish_enabled||
          v.review_status!==latest.row.review_status||v.scheduled_post_date!==latest.row.scheduled_post_date||
          v.studio_scheduled_at!==latest.row.studio_scheduled_at||v.youtube_scheduled_publish_at!==latest.row.youtube_scheduled_publish_at)
          return {status:"readback_unconfirmed_no_replay"};
        return {status:"verified_public_reconciled",output:v.output_number,provider_writes:0};
      });
    }catch{return {status:"reconciliation_unconfirmed_no_replay"};}
    if(result.status!=="skipped")return result;
  }
  return {status:"no_eligible_receipt",inspected:rows.length};
}
