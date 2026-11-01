/**
 * Factory approval catch-up for an output created AFTER its content's
 * QA-approved creative master was recorded.
 *
 * The first approval click may select a new master video, but MUST NOT approve
 * or publish that changed video. The reviewer must see it and click again.
 */
import {creativeMasterKey,readCreativeMasterRegistry,resolveCreativeMasterForOutput,MASTER_FIELD} from "./creative-master-registry.mjs";
import {planCreativeMasterAdoption} from "./creative-master-propagation.mjs";
const rec=/^rec[A-Za-z0-9]{14}$/;
const str=x=>String(x||"").trim();
const linked=x=>Array.isArray(x)&&x.length===1?str(x[0]?.id||x[0]):"";
const err=(code,message)=>{const e=new Error(message||code);e.code=code;e.status=409;throw e;};
export async function reconcileCreativeMasterAtFactoryApproval({output_id,operations}){
  const o=operations;
  for(const k of ["readOutput","readContent","withOutputLock","patchOutput"]){
    if(typeof o?.[k]!=="function")err("CREATIVE_MASTER_FACTORY_ADAPTER_MISSING",k);
  }
  if(!rec.test(output_id||""))err("CREATIVE_MASTER_FACTORY_OUTPUT_INVALID");
  return o.withOutputLock(output_id,async()=>{
    const row=await o.readOutput(output_id);
    if(row?.id!==output_id)err("CREATIVE_MASTER_FACTORY_OUTPUT_READBACK_FAILED");
    const f=row.fields||{},contentId=linked(f.Content_Item);
    if(!contentId||!rec.test(contentId))
      return {status:"unmapped",reason:"no_unique_content_owner"};
    const key=creativeMasterKey(f.Format,f.Aspect_Ratio);
    if(!key)return {status:"unmapped",reason:"missing_render_format"};
    const content=await o.readContent(contentId);
    if(content?.id!==contentId)err("CREATIVE_MASTER_FACTORY_CONTENT_DRIFT");
    const master=resolveCreativeMasterForOutput({content,output:row});
    if(!master)return {status:"no_master",key};
    const sourceKey=master.key;
    const plan=planCreativeMasterAdoption({content,output:row,master});
    if(plan.status!=="apply")
      return {status:plan.status,reason:plan.reason,key:sourceKey,version:master.version};
    // Only review media and cache fields are patched. Never mark this approval
    // successful. Ordinary Factory uses a fresh click and a fresh preview.
    await o.patchOutput(output_id,plan.fields);
    const after=await o.readOutput(output_id);
    if(after?.id!==output_id ||
       planCreativeMasterAdoption({content,output:after,master}).status!=="unchanged")
      err("CREATIVE_MASTER_FACTORY_ADOPTION_UNVERIFIED",
        "Master video adoption did not persist");
    // Check the content registry again to detect a racing source revision.
    const confirmed=await o.readContent(contentId);
    const same=readCreativeMasterRegistry(
      confirmed?.fields?.[MASTER_FIELD]).masters[sourceKey];
    if(!same||same.version!==master.version||same.file_id!==master.file_id||
      same.sha256!==master.sha256)
      err("CREATIVE_MASTER_FACTORY_CHANGED",
        "Master changed during approval; refresh review");
    if(typeof o.syncOutput==="function"){
      try{await o.syncOutput(after)}catch(error){
        console.warn("Factory creative master mirror deferred",output_id,
          String(error?.message||error));
      }
    }
    return {status:"updated_requires_rereview",key:sourceKey,
      version:master.version,output_id,file_id:master.file_id,
      publishing_approved:false,scheduled:false,public_post_created:false};
  });
}
