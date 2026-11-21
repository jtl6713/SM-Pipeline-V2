/**
 * Issue #2464: truthful, read-only disposition for stuck publisher sub-states.
 * Raw canonical stage/status, approved media and historical errors are untouched.
 * This is NEVER permission to re-create or publish a provider object.
 */
const value=(fields,name)=>String(fields?.[name]??"").trim();
const flag=v=>v===true||v===1||String(v??"").toLowerCase()==="true";
const absent=v=>v===false||v===0||String(v??"").toLowerCase()==="false";
const dueMs=v=>{const n=Date.parse(String(v??""));return Number.isFinite(n)?n:null;};

export function heldRetryPendingDisposition(record,{nowMs=Date.now()}={}){
  const fields=record?.fields??record??{};
  const fb=value(fields,"FB_Publish_Status")==="Retry Pending";
  const ig=value(fields,"IG_Carousel_Status")==="Retry Pending";
  const tt=value(fields,"TikTok_Draft_Status")==="Retry Pending";
  if(!fb&&!ig&&!tt)return null;
  if(value(fields,"Publish_Status")==="Published"||value(fields,"Published_At")||
    value(fields,"Platform_Post_URL")||value(fields,"Manual_Published_URL"))return null;
  if(value(fields,"Review_Status")==="Changes Requested"||value(fields,"Output_Status")==="Changes Requested"){
    return {label:"Changes Requested",reason:"Creative returned for corrections; no automatic retry",next_check:"Verify original gallery and obtain fresh Factory approval",retry_authorized:false,raw_retry_pending:true};
  }
  const held=flag(fields.Do_Not_Publish)||absent(fields.Auto_Publish_Enabled)||absent(fields.Publish_Retry_Eligible);
  const stage=value(fields,"Publish_Error_Stage");
  const err=[value(fields,"Publish_Error_Message"),value(fields,"IG_Carousel_Error_Message"),value(fields,"FB_Slideshow_Error_Message")].join(" ");
  const ambiguous=ig&&/QA-IG-AP3C-AMBIGUOUS-PARENT|AP3C.*HTTP\s*500/i.test(err);
  if(held&&ambiguous){
    return {label:"Needs Verification",reason:"Prior Instagram parent creation returned an ambiguous HTTP 500; provider receipt not proven",next_check:"Verify original child IDs and reconcile exact prior parent operation before any release",retry_authorized:false,raw_retry_pending:true};
  }
  if(held&&tt&&stage==="TTD0_ASSETS"){
    return {label:"Needs Asset Repair",reason:"Required TikTok 9:16 gallery is not public-ready",next_check:"Repair original 9:16 slides, verify geometry and request fresh review",retry_authorized:false,raw_retry_pending:true};
  }
  if(held&&ig){
    return {label:"Needs Asset Repair",reason:"Original Instagram gallery is held for creative or asset repair",next_check:"Reconcile ordered original 4:5 slide identities and require Factory review",retry_authorized:false,raw_retry_pending:true};
  }
  if(held&&fb){
    const credential=/403|401|permission|token|credential|expired/i.test(stage+" "+err);
    return {label:"Needs Verification",reason:credential?"Facebook owner or Page credential failure with previous provider attempt":"Facebook retry is intentionally held pending previous provider operation proof",next_check:"Authenticate exact Page and reconcile owned Reel/video operation before rearm",retry_authorized:false,raw_retry_pending:true};
  }
  // Future MAE bookings with a historical Meta throttle are not retries that
  // should run now. A prior upload may have committed without a receipt.
  const schedule=dueMs(fields.Scheduled_Post_Date??fields.Studio_Scheduled_At);
  const limit=fb&&/FBS3_RATE_LIMIT|FB_GRAPH_RATE_LIMIT|368|1390008|rate.?limit/i.test(stage+" "+err);
  const dispatched=Number(fields.Studio_Publish_Dispatch_Count??0)>0||!!value(fields,"Last_Publish_Attempt_At")||!!value(fields,"Studio_Publish_Dispatch_At");
  if(fb&&value(fields,"Review_Status")==="Approved"&&value(fields,"Output_Status")==="Approved for Publishing"&&
    value(fields,"Publish_Status")==="Ready to Schedule"&&flag(fields.Auto_Publish_Enabled)&&
    flag(fields.Publish_Retry_Eligible)&&!flag(fields.Do_Not_Publish)&&
    schedule!==null&&Number.isFinite(nowMs)&&schedule>nowMs&&dispatched){
    return {label:"Needs Verification",
      reason:limit?"Future-scheduled Facebook Reel has historical Meta throttling and a prior provider attempt":
        "Future-scheduled Facebook output has a historical provider dispatch or attempt without a confirmed original receipt",
      next_check:"Keep the existing future MAE slot; reconcile prior Page video operation before any replay",
      retry_authorized:false,raw_retry_pending:true};
  }
  return null; // genuine bounded retry, no invented permission or status
}
