import test from "node:test";
import assert from "node:assert/strict";
import {planCreativeMasterAdoption,propagateApprovedCreativeMaster,
  OUTPUT_MASTER_FIELD} from "./creative-master-propagation.mjs";
import {MASTER_FIELD,MASTER_SCHEMA} from "./creative-master-registry.mjs";

const contentId="recYhIjy4BW0U3WaW",sourceId="recPnNYghmcJYivOA";
const fileId="16osgGbNcyet_4WwDLiarSurkF3yXFOcq";
const key="vertical short video|9:16";
const master={key,content_item_id:contentId,content_type:"Vertical Short Video",
  format:"Vertical Short Video",aspect_ratio:"9:16",
  source_output_id:sourceId,
  session_id:"rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666",
  approved_attempt_id:"rrimport_9593_864436ce242983f69fceaa68f37ac4",
  file_id:fileId,sha256:"864436ce242983f69fceaa68f37ac4002c2c382ab8c8189098bdc5cab2072d34",
  version:1,approved_at:"2026-10-31T22:45:00Z",
  creative_only:true,publishing_authorized:false,platform_media_replaced:false};
const c=x=>structuredClone(x);
const opt=name=>({name});
const url=x=>"https://drive.google.com/file/d/"+x+"/view";
function row(id,platform,format="Vertical Short Video",props={}){
  return {id,fields:{Content_Item:[contentId],
    Platform:opt(platform),Platform_Output_Type:opt(platform+" Reel"),
    Output_ID:Number(id.slice(-4).replace(/[^0-9]/g,""))||999,
    Format:opt(format),Aspect_Ratio:opt("9:16"),
    Output_Filename:"approved-"+platform.toLowerCase()+".mp4",
    Output_Status:opt("Ready for Review"),Render_Status:opt("Rendered"),
    Review_Status:opt("Review Sent"),Publish_Status:opt("Not Ready"),
    Final_File_ID:"1IGo6XG0bwiASF75VA6xS7qXS4UGmhuGW",
    Final_File_URL:url("1IGo6XG0bwiASF75VA6xS7qXS4UGmhuGW"),
    Output_URL:url("1IGo6XG0bwiASF75VA6xS7qXS4UGmhuGW"),
    Output_Caption:"Caption for "+platform,Hashtags:"#city",
    Studio_Preview_URL:"https://cdn.example/stale.mp4",
    Studio_Preview_R2_Key:"old_preview.mp4",
    Render_Server_URL:"https://render.chicagoshining.com/out/stale-original.mp4",
    Publish_Asset_URL:"https://cdn.example/stale-public.mp4",
    ...props}};
}
function fixture(){
  const rows=[
    row(sourceId,"Instagram"),
    row("recyYKgkfRksIZPun","Facebook","Vertical Short Video",{
      Scheduled_Post_Date:"2026-11-29T09:31:00.000Z"}),
    row("rec8JDQW2Jilnzc9u","TikTok","Vertical Short Video",{
      Scheduled_Post_Date:"2026-11-01T00:45:00.000Z"}),
    row("recgJR5bTcYfCCwAL","YouTube","Vertical Short Video",{
      Scheduled_Post_Date:"2026-11-01T09:31:00.000Z"}),
    row("recqw7DTgYsqYkl51","Instagram","Story"),
    row("recZ1X5QfeFZTot1F","Facebook","Story")];
  let content={id:contentId,fields:{Content_Type:opt("Vertical Short Video"),
    "Platform Outputs":rows.map(x=>x.id),
    [MASTER_FIELD]:JSON.stringify({schema:MASTER_SCHEMA,masters:{[key]:master}})}};
  const map=new Map(rows.map(x=>[x.id,x]));
  const original=c(rows),writes=[],locks=[],mirrors=[];
  let failId=null;
  const ops={
    readContent:async()=>c(content),
    readOutput:async id=>c(map.get(id)),
    withOutputLock:async(id,fn)=>{locks.push(id);return fn()},
    patchOutput:async(id,patch)=>{
      if(id===failId)throw Error("simulated Airtable write failed");
      const target=map.get(id);target.fields={...target.fields,...c(patch)};
      writes.push({id,patch:c(patch)});
    },
    syncOutput:async r=>{mirrors.push(r.id)}
  };
  return {map,original,writes,locks,mirrors,ops,master:c(master),content,
    get failId(){return failId},set failId(x){failId=x},
    run:()=>propagateApprovedCreativeMaster({source_output_id:sourceId,
      content_item_id:contentId,master,operations:ops})};
}
test("approved 9:16 video master adopts Reels, TikTok, Shorts and MP4 Stories without platform allowlist",async()=>{
 const f=fixture(),result=await f.run();
 assert.equal(result.associated_output_count,6);
 assert.equal(result.applied,5);
 assert.equal(result.incompatible,0);
 assert.equal(result.deferred,0);
 assert.equal(f.writes.length,5);
 assert.deepEqual(f.writes.map(x=>x.id),[
   "recyYKgkfRksIZPun","rec8JDQW2Jilnzc9u","recgJR5bTcYfCCwAL",
   "recqw7DTgYsqYkl51","recZ1X5QfeFZTot1F"]);
 for(const {id,patch} of f.writes){
   const before=f.original.find(x=>x.id===id).fields;
   const after=f.map.get(id).fields;
   assert.equal(after.Final_File_ID,fileId);
   assert.equal(after.Final_File_URL,url(fileId));
   assert.equal(after.Output_URL,url(fileId));
   assert.equal(after.Output_Caption,before.Output_Caption);
   assert.equal(after.Hashtags,before.Hashtags);
   assert.equal(after.Scheduled_Post_Date,before.Scheduled_Post_Date);
   assert.equal(after.Publish_Status.name,"Not Ready");
   assert.equal(after.Review_Status.name,"Review Sent");
   assert.equal(after.Output_Status.name,"Ready for Review");
   assert.equal(after.Studio_Preview_URL,null);
   assert.equal(after.Publish_Asset_URL,null);
   assert.equal(JSON.parse(after[OUTPUT_MASTER_FIELD]).sha256,master.sha256);
   for(const protectedField of ["Scheduled_Post_Date","Studio_Scheduled_At",
     "YouTube_Scheduled_Publish_At","Do_Not_Publish","Auto_Publish_Enabled",
     "Output_Caption","Hashtags","Publish_Status","Review_Status","Output_Status",
     "Thumbnail_URL","Remotion_Job_ID","Platform_Post_ID"])
     assert.equal(Object.hasOwn(patch,protectedField),false,protectedField);
 }
 assert.equal(f.map.get(sourceId).fields.Final_File_ID,f.original[0].fields.Final_File_ID);
 assert.equal(f.map.get("recqw7DTgYsqYkl51").fields.Final_File_ID,fileId);
});
test("retries are idempotent and do not duplicate Airtable writes",async()=>{
 const f=fixture();await f.run();const r=await f.run();
 assert.equal(r.applied,0);assert.equal(r.already_current,5);
 assert.equal(f.writes.length,5);
});
test("newly-linked future matching output inherits without a hardcoded count",async()=>{
 const f=fixture(),later=row("recFFFFFFFFFFFFFF","FutureVideo");
 f.content.fields["Platform Outputs"].push(later.id);f.map.set(later.id,later);
 const r=await f.run();assert.equal(r.applied,6);
 assert.equal(f.map.get(later.id).fields.Final_File_ID,fileId);
});
test("published, dispatching, approved, held, and already-armed siblings are never changed",async()=>{
 const f=fixture();
 f.map.get("recyYKgkfRksIZPun").fields.Published_At="2026-10-30T00:00:00Z";
 f.map.get("rec8JDQW2Jilnzc9u").fields.Review_Status=opt("Approved");
 f.map.get("recgJR5bTcYfCCwAL").fields.Studio_Render_Review_Hold_ID="other-review-hold";
 const r=await f.run();
 assert.equal(r.applied,2);assert.equal(r.deferred,3);
 assert.equal(f.writes.length,2);
});
test("publish lock, Do_Not_Publish and Auto_Publish_Enabled protect adoption",()=>{
 const f=fixture(),row=f.map.get("rec8JDQW2Jilnzc9u");
 for(const mutation of [
   {Publish_Locked_At:"2026-10-31T22:00:00Z"},
   {Do_Not_Publish:true},
   {Auto_Publish_Enabled:true},
   {Publish_Status:opt("Ready to Schedule")},
   {Output_Status:opt("Publishing")},
   {Output_Status:opt("In Production")}
 ]){
   const candidate=c(row);candidate.fields={...candidate.fields,...mutation};
   assert.equal(planCreativeMasterAdoption({content:f.content,output:candidate,
     master:f.master}).status,"deferred");
 }
});
test("partial write fails closed and resumed run only completes missing siblings",async()=>{
 const f=fixture();
 f.failId="rec8JDQW2Jilnzc9u";
 await assert.rejects(f.run(),/simulated Airtable write failed/);
 assert.equal(f.writes.length,1);
 f.failId=null;
 const r=await f.run();
 assert.equal(r.applied,4);assert.equal(r.already_current,1);
 assert.equal(f.writes.length,5);
});
test("content/registry drift cannot redirect media or silently apply stale master",async()=>{
 const f=fixture();
 f.map.get("recyYKgkfRksIZPun").fields.Content_Item=["recAAAAAAAAAAAAAA"];
 await assert.rejects(f.run(),e=>e.code==="CREATIVE_MASTER_OUTPUT_CONTENT_DRIFT");
 assert.equal(f.writes.length,0);
 f.map.get("recyYKgkfRksIZPun").fields.Content_Item=[contentId];
 const registry=JSON.parse(f.content.fields[MASTER_FIELD]);
 registry.masters[key].version=2;
 f.content.fields[MASTER_FIELD]=JSON.stringify(registry);
 await assert.rejects(f.run(),e=>e.code==="CREATIVE_MASTER_VERSION_CHANGED");
 assert.equal(f.writes.length,0);
});
test("source or registry must be explicit, verified, and creative-only",async()=>{
 const f=fixture();
 const corrupt={...f.master,publishing_authorized:true};
 await assert.rejects(propagateApprovedCreativeMaster({
   source_output_id:sourceId,content_item_id:contentId,
   master:corrupt,operations:f.ops
 }),e=>e.code==="CREATIVE_MASTER_PROOF_UNVERIFIED"||e.code==="CREATIVE_MASTER_VERSION_CHANGED");
});

test("same-ratio image Story and another video aspect stay completely unchanged",async()=>{
 const f=fixture();
 const story=f.map.get("recqw7DTgYsqYkl51");
 story.fields.Output_Filename="still-photo.jpg";
 const other=f.map.get("recZ1X5QfeFZTot1F");
 other.fields.Aspect_Ratio=opt("4:5");
 const result=await f.run();
 assert.equal(result.applied,3);
 assert.equal(result.incompatible,2);
 assert.equal(story.fields.Final_File_ID,f.original[4].fields.Final_File_ID);
 assert.equal(other.fields.Final_File_ID,f.original[5].fields.Final_File_ID);
});
