import fs from "node:fs/promises";
import {verifyAuthenticatedYouTubeReceipt} from "../../apps/studio-api/exception-recovery-authenticated-receipt.mjs";
import {recoveryBlock,receiptBlock,recoverySnapshot} from "../../apps/studio-api/exception-recovery-autonomous.mjs";
import {contentIdForRecoveryOutput,verifyRecoveryProfileChain,withVerifiedRecoveryProfile} from "../../apps/studio-api/exception-recovery-profile-chain.mjs";
const report={read_only:true,output_id:4092,inspected:0,verified:0,corrected:0,blocked:0,
  mutations_attempted:0,started_at:new Date().toISOString()};
const get=async(url,headers)=>{
  const res=await fetch(url,{method:"GET",headers,redirect:"error",signal:AbortSignal.timeout(25000)});
  if(!res.ok) throw new Error("read_only_http_"+res.status);
  return res.json();
};
try {
  const account=process.env.CLOUDFLARE_ACCOUNT_ID;
  const token=process.env.CLOUDFLARE_API_TOKEN;
  const api="https://api.cloudflare.com/client/v4/accounts/"+account+"/workers/scripts/chicagoshining-studio-api";
  const headers={Authorization:"Bearer "+token};
  const deployments=await get(api+"/deployments",headers);
  const version=deployments.result.deployments[0].versions.sort((a,b)=>b.percentage-a.percentage)[0].version_id;
  const live=await get(api+"/versions/"+version,headers);
  const bindings=live.result?.resources?.bindings||[];
  const plain=Object.fromEntries(bindings.filter(b=>b.type==="plain_text").map(b=>[b.name,b.text]));
  report.worker_version_id=version;
  report.flags=Object.fromEntries(["EXCEPTION_RECOVERY_ACTIONS_ENABLED","PUBLICATION_RECONCILIATION_SCAN_ENABLED",
    "PUBLICATION_RECONCILIATION_ENABLED","PUBLICATION_RECONCILIATION_BOUNDED_ENABLED",
    "PUBLICATION_RECONCILIATION_CANARY_RECORD"].map(k=>[k,plain[k]||"absent"]));
  if(!plain.AIRTABLE_BASE_ID||!plain.AIRTABLE_OUTPUT_TABLE_ID)throw new Error("production_airtable_bindings_missing");
  const pat=(await fs.readFile(process.env.RECOVERY_PAT_FILE,"utf8")).trim();
  const airtableHeaders={Authorization:"Bearer "+pat};
  const base="https://api.airtable.com/v0/"+plain.AIRTABLE_BASE_ID+"/";
  const query=new URLSearchParams({filterByFormula:"{Output_ID}=4092",maxRecords:"2"});
  const found=await get(base+plain.AIRTABLE_OUTPUT_TABLE_ID+"?"+query,airtableHeaders);
  if(found.records?.length!==1)throw new Error("canary_output_identity_ambiguous");
  const row=found.records[0];report.inspected=1;report.record_id=row.id;report.before=recoverySnapshot(row);
  if(row.fields.YouTube_Video_ID!=="hc1heQnfn6k" && row.fields.Platform_Post_ID!=="hc1heQnfn6k")
    throw new Error("reference_video_identity_changed");
  // Platform Output.Content_Profile is a display-only LOOKUP. The canonical
  // ownership chain is Output.Content_Item -> Content Item.Content_Profile.
  const contentId=contentIdForRecoveryOutput(row);
  if(!contentId)throw new Error("canary_content_item_identity_missing_or_ambiguous");
  if(!plain.AIRTABLE_CONTENT_TABLE_ID)throw new Error("production_content_table_binding_missing");
  const content=await get(base+plain.AIRTABLE_CONTENT_TABLE_ID+"/"+contentId,airtableHeaders);
  const links=content.fields?.Content_Profile;
  if(!Array.isArray(links)||links.length!==1||!/^rec[A-Za-z0-9]{14}$/.test(String(links[0]||"")))
    throw new Error("canary_content_profile_link_missing_or_ambiguous");
  const profile=await get(base+"tblNYg2QB0BmmVACy/"+links[0],airtableHeaders);
  const chain=verifyRecoveryProfileChain(row,content,profile);
  if(!chain.ok)throw new Error("canary_"+chain.reason);
  const authenticatedRow=withVerifiedRecoveryProfile(row,chain);
  report.profile_identity_verified=true;
  report.content_record_id=chain.content_id;
  report.profile_record_id=chain.profile_id;
  const theme=String(profile.fields.Profile_Key||"").toLowerCase();
  const name=String(profile.fields.Profile_Name||"");
  if(theme!=="la"&&!/los angeles/i.test(name))throw new Error("canary_not_los_angeles");
  report.profile_name=name;report.expected_channel_id=profile.fields.YouTube_Channel_ID;
  const names=["YOUTUBE_UPLOAD_SERVICE_URL","YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET"];
  const all=names.flatMap(n=>["LA_"+n,"PROFILE_"+profile.id+"_"+n]);
  const settingsQuery=new URLSearchParams({filterByFormula:
    "AND({Active}=1,OR("+all.map(n=>"{Setting_Name}='"+n+"'").join(",")+"))",pageSize:"100"});
  const settingsRows=await get(base+"tblpHPWeEkyJaF7ql?"+settingsQuery,airtableHeaders);
  if(settingsRows.offset)throw new Error("settings_scan_incomplete");
  const values=Object.fromEntries(settingsRows.records.map(r=>[r.fields.Setting_Name,r.fields.Setting_Value]));
  const settings=Object.fromEntries(names.map(n=>[n,
    values["PROFILE_"+profile.id+"_"+n]||values["LA_"+n]||""]));
  report.receipt=await verifyAuthenticatedYouTubeReceipt(authenticatedRow,{settings,expectedChannelId:profile.fields.YouTube_Channel_ID});
  const after=await get(base+plain.AIRTABLE_OUTPUT_TABLE_ID+"/"+row.id,airtableHeaders);
  report.authoritative_state_unchanged=JSON.stringify(recoverySnapshot(after))===JSON.stringify(report.before);
  report.blocked_reason=recoveryBlock(after,Date.now())||receiptBlock(after,report.receipt,Date.now())||
    (!report.authoritative_state_unchanged?"authoritative_state_changed":null);
  report.delivery_verified=report.receipt.verified_delivery===true
    && report.receipt.ownership_verified===true ? 1 : 0;
  report.public_visibility_verified=report.receipt.verified_public===true ? 1 : 0;
  report.verified=report.delivery_verified; // Studio completion is delivery, not necessarily public visibility.
  report.blocked=report.blocked_reason?1:0;
  report.canary_status=report.blocked_reason?"blocked":"verified_eligible_pending_explicit_approval";
} catch(error) {
  report.canary_status="unavailable";
  report.error=String(error.message).replace(/Bearer\s+\S+/g,"[redacted]").slice(0,120);
  report.blocked=1;
}
report.completed_at=new Date().toISOString();
await fs.writeFile("/tmp/publication-recovery-canary.json",JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
if(report.canary_status==="unavailable")process.exitCode=1;
