/**
 * QA Graph-368 recovery stage: select later MAE dates for approved Facebook
 * Reels while retaining Do_Not_Publish=true and Publish_Status=Failed.
 * This module cannot publish, rearm or delete any output.
 *
 * The Worker passes its existing protected schedule endpoint as reserve().
 * That endpoint independently repeats the eligibility check and uses shared
 * MAE occupancy / reservation guards before every Airtable mutation.
 */
const f=(row,name)=>row?.fields?.[name]??row?.[name];
const str=(row,name)=>String(f(row,name)??"").trim();

export const META_SPAM_HELD_CANDIDATES=
 'AND({Test_Run_ID}=BLANK(),{Platform}="Facebook",{Platform_Output_Type}="Facebook Reel",'+
 '{Publish_Error_Stage}="FBS3_RATE_LIMIT",{Publish_Status}="Failed",'+
 '{Output_Status}="Approved for Publishing",{Review_Status}="Approved",'+
 '{Do_Not_Publish}=1,{Published_At}=BLANK(),{Platform_Post_ID}=BLANK(),'+
 'FIND("QA-1050 HARD NO-GRAPH-CREATE HOLD",{Studio_Output_Notes}&"")>0,'+
 'FIND("SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION",{Studio_Output_Notes}&"")=0)';

export const verifiedHeldReservation=(row,nowMs=Date.now())=>
 Boolean(row?.id
  && str(row,"Platform")==="Facebook"
  && /Facebook Reel/i.test(str(row,"Platform_Output_Type")||str(row,"Studio_Output_Type"))
  && str(row,"Output_Status")==="Approved for Publishing"
  && str(row,"Review_Status")==="Approved"
  && str(row,"Publish_Status")==="Failed"
  && f(row,"Do_Not_Publish")===true
  && f(row,"Publish_Retry_Eligible")!==true
  && str(row,"Publish_Error_Stage")==="FBS3_RATE_LIMIT"
  && !str(row,"Test_Run_ID")
  && !str(row,"Published_At")
  && !str(row,"Platform_Post_ID")
  && !str(row,"Platform_Post_URL")
  && !str(row,"Platform_Media_ID")
  && /SPAM_COOLDOWN_RESCHEDULE_PENDING_VERIFICATION/.test(str(row,"Studio_Output_Notes"))
  && Number.isFinite(Date.parse(str(row,"Scheduled_Post_Date")))
  && Date.parse(str(row,"Scheduled_Post_Date"))>=nowMs+47*60*60*1000);

/** Bounded one-sweep controller. On an ambiguous postcommit error, GET again,
 * never issue a second write in the same iteration to "fix" a 500 response.
 */
export async function runMetaSpamHeldSchedule({
  listCandidates,readOutput,eligibility,reserve,now=()=>Date.now(),limit=2,
}={}){
  if([listCandidates,readOutput,eligibility,reserve].some(fn=>typeof fn!=="function"))
    throw new Error("Autonomous Meta QA schedule dependencies unavailable");
  const max=Math.min(4,Math.max(1,Number(limit)||2));
  const candidates=await listCandidates(Math.max(8,max*4));
  if(!Array.isArray(candidates))throw new Error("Incomplete Meta spam-held candidate census");
  const results=[];
  let attempted=0,scheduled=0;
  for(const discovered of candidates){
    if(attempted>=max)break;
    const id=String(discovered?.id||"");
    if(!/^rec[A-Za-z0-9]{14}$/.test(id))continue;
    let latest;
    try{latest=await readOutput(id);}catch{
      results.push({id,result:"read_unavailable"});continue;
    }
    if(!latest||latest.id!==id)continue;
    const blocked=eligibility(latest);
    if(blocked){results.push({id,result:"blocked",reason:blocked});continue;}
    attempted++;
    let response=null,error=null;
    try{response=await reserve(id);}catch(e){error=String(e?.message||e);}
    // Also verifies a previously committed response whose transport failed.
    let after=null;
    try{after=await readOutput(id);}catch{}
    if(after&&verifiedHeldReservation(after,now())){
      scheduled++;
      results.push({id,result:"reserved_held",scheduled_at:str(after,"Scheduled_Post_Date"),
        post_created:false,hold_released:false});
    }else{
      results.push({id,result:!after?"uncertain_readback":"not_verified",
        reason:error||response?.error||"reservation_not_authoritatively_confirmed"});
    }
  }
  return {mode:"held_schedule_only",inspected:results.length,attempted,scheduled,items:results,
    provider_writes:0,hold_releases:0,publisher_dispatches:0};
}
