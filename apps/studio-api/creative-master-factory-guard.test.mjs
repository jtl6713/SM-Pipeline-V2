import test from "node:test";
import assert from "node:assert/strict";
import {reconcileCreativeMasterAtFactoryApproval} from "./creative-master-factory-guard.mjs";
import {MASTER_SCHEMA,MASTER_FIELD} from "./creative-master-registry.mjs";

const contentId="recYhIjy4BW0U3WaW",id="recFFFFFFFFFFFFFF",source="recPnNYghmcJYivOA";
const fileId="16osgGbNcyet_4WwDLiarSurkF3yXFOcq";
const key="vertical short video|9:16";
const master={key,content_item_id:contentId,format:"Vertical Short Video",
  aspect_ratio:"9:16",version:2,source_output_id:source,
  approved_attempt_id:"rrattempt_abcdefghi123456789",
  file_id:fileId,sha256:"864436ce242983f69fceaa68f37ac4002c2c382ab8c8189098bdc5cab2072d34",
  creative_only:true,publishing_authorized:false};
const c=x=>structuredClone(x);
function fixture(){
 const row={id,fields:{Content_Item:[contentId],Format:"Vertical Short Video",
  Aspect_Ratio:"9:16",Final_File_ID:"1IGo6XG0bwiASF75VA6xS7qXS4UGmhuGW",
  Final_File_URL:"https://drive.google.com/file/d/1IGo6XG0bwiASF75VA6xS7qXS4UGmhuGW/view",
  Output_Status:"Ready for Review",Render_Status:"Rendered",
  Review_Status:"Review Sent",Publish_Status:"Not Ready",
  Scheduled_Post_Date:"2026-11-15T11:30:00Z",
  Output_Caption:"Per-platform copy",YouTube_Privacy_Status:"private",
  Thumbnail_URL:"https://cdn.example.com/yt-cover.jpg",
  Auto_Publish_Enabled:false}};
 const content={id:contentId,fields:{
  "Platform Outputs":[source,id],
  Content_Type:"Vertical Short Video",
  [MASTER_FIELD]:JSON.stringify({schema:MASTER_SCHEMA,masters:{[key]:master}})}};
 let writes=0,locks=0,readbacks=0,mode="",mirror=0;
 const ops={
  withOutputLock:async(_id,fn)=>{assert.equal(_id,id);locks++;return fn()},
  readOutput:async()=>{readbacks++;return c(row)},
  readContent:async()=>c(content),
  patchOutput:async(_id,fields)=>{
    if(mode==="lost_write"){writes++;return}
    row.fields={...row.fields,...c(fields)};writes++;
    if(mode==="racing_master"){
      const reg=JSON.parse(content.fields[MASTER_FIELD]);
      reg.masters[key].version++;
      content.fields[MASTER_FIELD]=JSON.stringify(reg);
    }
  },
  syncOutput:async()=>{mirror++},
 };
 return {row,content,ops,run:()=>reconcileCreativeMasterAtFactoryApproval({
   output_id:id,operations:ops}),
   get writes(){return writes},get mirror(){return mirror},
   get locks(){return locks},get readbacks(){return readbacks},
   set mode(v){mode=v}};
}
test("Factory first approval intent selects newer master but refuses to approve or publish",async()=>{
 const f=fixture();
 const out=await f.run();
 assert.equal(out.status,"updated_requires_rereview");
 assert.equal(out.publishing_approved,false);assert.equal(out.scheduled,false);
 assert.equal(out.public_post_created,false);
 assert.equal(f.writes,1);assert.equal(f.mirror,1);assert.equal(f.locks,1);
 assert.equal(f.row.fields.Final_File_ID,fileId);
 assert.equal(f.row.fields.Scheduled_Post_Date,"2026-11-15T11:30:00Z");
 assert.equal(f.row.fields.Output_Caption,"Per-platform copy");
 assert.equal(f.row.fields.Thumbnail_URL,"https://cdn.example.com/yt-cover.jpg");
 assert.equal(f.row.fields.Publish_Status,"Not Ready");
 assert.equal(f.row.fields.Auto_Publish_Enabled,false);
 assert.equal(f.row.fields.Output_Status,"Ready for Review");
 assert.equal(f.row.fields.Review_Status,"Review Sent");
 assert.equal((await f.run()).status,"unchanged");
 assert.equal(f.writes,1);
});
test("no approved master or different aspect/format leaves output unchanged",async()=>{
 const f=fixture();
 delete f.content.fields[MASTER_FIELD];
 assert.equal((await f.run()).status,"no_master");
 f.content.fields[MASTER_FIELD]=JSON.stringify({schema:MASTER_SCHEMA,masters:{[key]:master}});
 f.row.fields.Format="Story";
 assert.equal((await f.run()).status,"no_master");
 f.row.fields.Format="Vertical Short Video";
 f.row.fields.Aspect_Ratio="4:5";
 await assert.rejects(f.run(),e=>e.code==="CREATIVE_MASTER_FACTORY_CONTENT_DRIFT");
 assert.equal(f.writes,0);
});
test("published, dispatching, already approved, held outputs cannot be mutated",async()=>{
 for(const fields of [
   {Published_At:"2026-10-31T12:00:00Z"},
   {Publish_Started_At:"2026-10-31T12:00:00Z"},
   {Review_Status:"Approved"},
   {Do_Not_Publish:true},
   {Studio_Render_Review_Hold_Active:true},
   {Auto_Publish_Enabled:true}
 ]){
   const f=fixture();Object.assign(f.row.fields,fields);
   assert.equal((await f.run()).status,"deferred");
   assert.equal(f.writes,0);
 }
});
test("failed Airtable write/readback and racing master keep publication blocked",async()=>{
 const f=fixture();f.mode="lost_write";
 await assert.rejects(f.run(),e=>e.code==="CREATIVE_MASTER_FACTORY_ADOPTION_UNVERIFIED");
 assert.equal(f.mirror,0);
 const g=fixture();g.mode="racing_master";
 await assert.rejects(g.run(),e=>e.code==="CREATIVE_MASTER_FACTORY_CHANGED");
 assert.equal(g.row.fields.Publish_Status,"Not Ready");
 assert.equal(g.mirror,0);
});
test("cross-content linkage is never adopted",async()=>{
 const f=fixture();f.row.fields.Content_Item=["recAAAAAAAAAAAAAA"];
 assert.equal((await f.run()).status,"no_master");
 assert.equal(f.writes,0);
});
