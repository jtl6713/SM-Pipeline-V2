/**
 * A QA-approved creative master is materialized to eligible, unapproved
 * same-content, same-format/ratio output previews. It is NOT publishing approval.
 * All source media stays in Drive; output metadata/scheduling remains local.
 */
import {creativeMasterKey,readCreativeMasterRegistry,MASTER_FIELD} from "./creative-master-registry.mjs";

export const OUTPUT_MASTER_FIELD="Studio_Creative_Master_Ref_JSON";
const rec=/^rec[A-Za-z0-9]{14}$/;
const str=x=>String(x??"").trim();
const choice=x=>typeof x==="object"&&x!==null?str(x.name):str(x);
const linked=x=>Array.isArray(x)&&x.length===1?str(x[0]?.id||x[0]):"";
const fail=(code,message)=>{const e=new Error(message||code);e.code=code;e.status=409;throw e;};
const drive=fileId=>"https://drive.google.com/file/d/"+fileId+"/view";
const same=(a,b)=>str(a)===str(b);
function validMaster(master,content,key){
  if(master?.content_item_id!==content?.id||master?.key!==key||
     !rec.test(master.source_output_id||"")||
     !/^[A-Za-z0-9_-]{20,}$/.test(master.file_id||"")||
     !/^[a-f0-9]{64}$/.test(master.sha256||"")||
     !Number.isSafeInteger(master.version)||master.version<1||
     master.creative_only!==true||master.publishing_authorized!==false)
    fail("CREATIVE_MASTER_PROOF_UNVERIFIED","Approved master registry has invalid provenance");
}
export function masterAdoptionRef(master){
  return JSON.stringify({schema:"studio.creative-output-ref.1",
    content_item_id:master.content_item_id,format_key:master.key,
    version:master.version,source_output_id:master.source_output_id,
    approved_attempt_id:master.approved_attempt_id,
    file_id:master.file_id,sha256:master.sha256});
}
export function planCreativeMasterAdoption({content,output,master}){
  const cf=content?.fields||{},f=output?.fields||{};
  if(!rec.test(output?.id||"")||!rec.test(content?.id||"")||
     linked(f.Content_Item)!==content.id)
    fail("CREATIVE_MASTER_OUTPUT_CONTENT_DRIFT","Output is not owned by the approved content");
  const links=cf["Platform Outputs"];
  if(!Array.isArray(links)||!links.some(x=>str(x?.id||x)===output.id))
    fail("CREATIVE_MASTER_OUTPUT_LINK_MISSING","Content does not list the exact output");
  const key=creativeMasterKey(f.Format,f.Aspect_Ratio);
  if(!key)return {status:"incompatible",reason:"missing_format_or_ratio"};
  if(key!==master.key)return {status:"incompatible",reason:"different_format_or_ratio"};
  validMaster(master,content,key);
  if(output.id===master.source_output_id)return {status:"source",reason:"approved_source"};
  const existingRef=str(f[OUTPUT_MASTER_FIELD]);
  let old=null;
  if(existingRef){try{old=JSON.parse(existingRef)}catch{
    fail("CREATIVE_MASTER_ADOPTION_STAMP_INVALID","Previous master reference is malformed");
  }}
  if(old&&(old.schema!=="studio.creative-output-ref.1"||
    old.content_item_id!==content.id||old.format_key!==key))
    fail("CREATIVE_MASTER_ADOPTION_STAMP_INVALID","Output has conflicting master provenance");
  if(old?.version>master.version)
    fail("CREATIVE_MASTER_VERSION_REGRESSED","Refuse an older approved master");
  const locked=["Published_At","Publish_Started_At","Publish_Locked_At",
    "Publish_Locked_By","Platform_Post_ID","Platform_Post_URL","Platform_Media_ID"]
    .some(k=>Boolean(str(f[k])));
  const terminal=["Published","Publishing","Dispatched","Approved for Publishing",
    "Skipped","Cancelled","Canceled"].some(x=>
    [choice(f.Output_Status),choice(f.Publish_Status)].some(s=>s.toLowerCase()===x.toLowerCase()));
  const approved=choice(f.Review_Status)==="Approved"||
    choice(f.Publish_Status)!=="Not Ready"||
    f.Auto_Publish_Enabled===true;
  if(locked||terminal||approved)return {status:"deferred",reason:"published_approved_or_dispatch_owned"};
  if(f.Do_Not_Publish===true||f.Studio_Render_Review_Hold_Active===true||
     str(f.Studio_Render_Review_Hold_ID)||str(f.Studio_Review_Hold_ID))
    return {status:"deferred",reason:"independent_publication_hold"};
  if(choice(f.Output_Status)!=="Ready for Review"||
     choice(f.Render_Status)!=="Rendered"||
     !["Review Sent",""].includes(choice(f.Review_Status))||
     !/^[A-Za-z0-9_-]{20,}$/.test(str(f.Final_File_ID)))
    return {status:"deferred",reason:"not_unapproved_rendered_review"};
  const expectedRef=masterAdoptionRef(master);
  if(same(f.Final_File_ID,master.file_id)&&
     same(f.Final_File_URL,drive(master.file_id))&&
     old?.version===master.version&&old?.file_id===master.file_id&&
     old?.sha256===master.sha256)
    return {status:"unchanged",reason:"already_current"};
  // A current/future schedule remains byte-for-byte unchanged. Publishing remains
  // Not Ready, and the output still requires its own ordinary Factory approval.
  const fields={
    Final_File_ID:master.file_id,Final_File_URL:drive(master.file_id),
    Output_URL:drive(master.file_id),
    Studio_Preview_URL:null,Studio_Preview_R2_Key:"",
    Studio_Preview_Updated_At:null,Publish_Asset_URL:null,
    Publish_Asset_Host:null,Publish_Asset_Ready_At:null,
    Publish_Asset_File_Name:null,
    [OUTPUT_MASTER_FIELD]:expectedRef,
  };
  return {status:"apply",fields,expectedRef,previous_file_id:str(f.Final_File_ID)};
}
function verifyAdoption(row,master){
  const f=row?.fields||{};
  let ref;
  try{ref=JSON.parse(str(f[OUTPUT_MASTER_FIELD]));}catch{
    fail("CREATIVE_MASTER_ADOPTION_READBACK_FAILED","Missing persisted master reference");
  }
  if(ref.version!==master.version||ref.file_id!==master.file_id||
     ref.sha256!==master.sha256||
     !same(f.Final_File_ID,master.file_id)||
     !same(f.Final_File_URL,drive(master.file_id))||
     !same(f.Output_URL,drive(master.file_id)))
    fail("CREATIVE_MASTER_ADOPTION_READBACK_FAILED","Creative media and master receipt disagree");
}
export async function propagateApprovedCreativeMaster({source_output_id,content_item_id,
  master,operations}){
  const o=operations;
  for(const method of ["readContent","readOutput","withOutputLock","patchOutput"]){
    if(typeof o?.[method]!=="function")fail("CREATIVE_MASTER_ADAPTER_MISSING",method+" adapter required");
  }
  if(!rec.test(source_output_id||"")||!rec.test(content_item_id||"")||
     master?.source_output_id!==source_output_id||
     master?.content_item_id!==content_item_id)
    fail("CREATIVE_MASTER_SOURCE_IDENTITY_MISMATCH");
  // Reject caller-supplied incomplete/unauthorized master metadata before
  // reading siblings; the fresh Airtable registry is checked again per output.
  validMaster(master,{id:content_item_id},master?.key);
  const first=await o.readContent(content_item_id);
  const refs=first?.fields?.["Platform Outputs"];
  if(!Array.isArray(refs)||refs.some(x=>!rec.test(str(x?.id||x)))||
     new Set(refs.map(x=>str(x?.id||x))).size!==refs.length||
     !refs.some(x=>str(x?.id||x)===source_output_id))
    fail("CREATIVE_MASTER_CONTENT_MEMBERS_INCOMPLETE");
  const ids=refs.map(x=>str(x?.id||x));
  // No count-based platform allowlist. Content links determine all candidates.
  const results=[];
  for(const id of ids){
    if(id===source_output_id)continue;
    const outcome=await o.withOutputLock(id,async()=>{
      const content=await o.readContent(content_item_id);
      const latest=readCreativeMasterRegistry(content?.fields?.[MASTER_FIELD]).masters[master.key];
      if(!latest||latest.file_id!==master.file_id||
        latest.sha256!==master.sha256||latest.version!==master.version)
        fail("CREATIVE_MASTER_VERSION_CHANGED","Master changed during fanout; retry against current version");
      const row=await o.readOutput(id);
      const plan=planCreativeMasterAdoption({content,output:row,master:latest});
      if(plan.status!=="apply")return {output_id:id,status:plan.status,reason:plan.reason};
      await o.patchOutput(id,plan.fields);
      const after=await o.readOutput(id);
      verifyAdoption(after,latest);
      // Supabase is a best-effort mirror, never an alternate authority.
      if(typeof o.syncOutput==="function"){
        try{await o.syncOutput(after)}catch(error){
          console.warn("Creative master mirror deferred",id,String(error?.message||error));
        }
      }
      return {output_id:id,status:"applied",previous_file_id:plan.previous_file_id,
        current_file_id:latest.file_id,master_version:latest.version};
    });
    results.push(outcome);
  }
  return {master_key:master.key,content_item_id,source_output_id,
    associated_output_count:ids.length,
    applied:results.filter(x=>x.status==="applied").length,
    already_current:results.filter(x=>x.status==="unchanged").length,
    deferred:results.filter(x=>x.status==="deferred").length,
    incompatible:results.filter(x=>x.status==="incompatible").length,
    results};
}
