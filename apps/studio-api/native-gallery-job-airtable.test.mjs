import test from "node:test";
import assert from "node:assert/strict";
import {createNativeGalleryJobIntent,nativeGalleryJobsEnabled,
  NATIVE_GALLERY_JOBS_TABLE} from "./native-gallery-job-airtable.mjs";

const OUTPUT="rec00000000000001",PROFILE="rec00000000000002";
const CONTENT="rec00000000000003",ACTOR="rec00000000000004";
const HOLD="gallery_hold_1234567",OWNER="gallery_owner_123456";
const REQUEST="native_request_1234567890";
const ENV={NATIVE_GALLERY_JOB_WRITE_ENABLED:"true",
  NATIVE_GALLERY_DISPATCH_FENCE_VERIFIED:"true",
  NATIVE_GALLERY_SCHEDULE_VACATE_VERIFIED:"true",
  NATIVE_GALLERY_SOURCE_PREFLIGHT_ENABLED:"true",
 NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
  NATIVE_GALLERY_SOURCE_MANIFEST_ENABLED:"true",
  NATIVE_GALLERY_MEDIA_RENDER_VERIFIED:"true",
  AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0"};
const proposal={ok:true,output_id:OUTPUT,content_item_id:CONTENT,
  profile_id:PROFILE,client_request_id:REQUEST,
  proposal_sha256:"a".repeat(64),
  selected:[{slide_id:"rec00000000000005",order:1,
    instruction:"Brighten the original sky without adding objects",blockers:[]}],
  unchanged:[]};
function fixture(){
  const rows=[];
  const output={id:OUTPUT,fields:{Content_Item:[CONTENT],
    Do_Not_Publish:true,Studio_Render_Review_Hold_Active:true,
    Studio_Render_Review_Hold_ID:HOLD,
    Studio_Render_Review_Hold_Owner:OWNER,
    Studio_Render_Review_Session_ID:OWNER,
    Publish_Status:"Not Ready",Platform_Output_Type:"Instagram Carousel"}};
  const content={id:CONTENT,fields:{Content_Profile:[PROFILE]}};
  let created=0,locks=0,verified=0;
  const adapter={
    async withOutputLock(id,fn){assert.equal(id,OUTPUT);locks++;return fn();},
    async airtableFetch(env,table,id,opts){
      if(table===env.AIRTABLE_OUTPUT_TABLE_ID)return output;
      if(table==="tblwzN9AXWvmKVKPs")return content;
      assert.equal(table,NATIVE_GALLERY_JOBS_TABLE);
      assert.equal(id,"");
      assert.equal(opts.method,"POST");
      const fields=JSON.parse(opts.body).fields;
      rows.push({id:"rec00000000000006",fields});created++;
    },
    async listRecords(_env,table,params){
      assert.equal(table,NATIVE_GALLERY_JOBS_TABLE);
      assert.equal(params.limit,31);
      assert.match(params.filterFormula,/Output_Record_ID/);
      return rows;
    },
    async verifySource({output_id,profile_id,content_item_id}){
      verified++;
      return {output_id,profile_id,content_item_id,
        sources_byte_verified:true,source_rights_verified:true,
        original_artifact_watermark_verified:true,
        shared_watermark_asset_verified:true,
        publication_hold_verified:true,hold_id:HOLD,
        original_manifest_sha256:"b".repeat(64),
        original_artifacts:[{slot_id:"rec00000000000005"}]};
    },
  };
  return {adapter,rows,output,content,
    stats:()=>({created,locks,verified})};
}
const args=f=>({env:ENV,actor_id:ACTOR,output_id:OUTPUT,
  client_request_id:REQUEST,proposal,adapter:f.adapter,
  now:()=>"2026-11-02T12:00:00.000Z"});
test("idempotent and readback-verified gallery Airtable intent",async()=>{
  const f=fixture();
  assert.equal(nativeGalleryJobsEnabled(ENV),true);
  const first=await createNativeGalleryJobIntent(args(f));
  assert.equal(first.ok,true);
  assert.equal(first.replay,false);
  assert.equal(first.publication_authorized,false);
  assert.equal(f.rows[0].fields.Job_State,"held_queued");
  assert.equal(f.rows[0].fields.Lease_Fence,0);
  assert.equal(JSON.parse(f.rows[0].fields.Plan_JSON).allow_public_publish,false);
  const again=await createNativeGalleryJobIntent(args(f));
  assert.equal(again.job_id,first.job_id);
  assert.equal(again.replay,true);
  assert.equal(f.stats().created,1);
  assert.equal(f.stats().locks,2);
});
test("disabled gate does not inspect Airtable or write",async()=>{
  const f=fixture();
  await assert.rejects(createNativeGalleryJobIntent({...args(f),
    env:{...ENV,NATIVE_GALLERY_JOB_WRITE_ENABLED:"false"}}),
    /NATIVE_GALLERY_JOB_WRITES_DISABLED/);
  assert.equal(f.stats().locks,0);
  assert.equal(f.stats().created,0);
});
test("without source watermark placement verification no job created",async()=>{
  const f=fixture();
  const original=f.adapter.verifySource;
  f.adapter.verifySource=async args=>({...await original(args),
    original_artifact_watermark_verified:false});
  await assert.rejects(createNativeGalleryJobIntent(args(f)),
    /NATIVE_GALLERY_ORIGINAL_MEDIA_NOT_CERTIFIED/);
  assert.equal(f.stats().created,0);
});
test("no owned publication hold and output dispatch fail before write",async()=>{
  for(const change of [
    f=>{f.output.fields.Studio_Render_Review_Hold_Active=false;},
    f=>{f.output.fields.Do_Not_Publish=false;},
    f=>{f.output.fields.Publish_Started_At="2026-11-02T00:00:00Z";},
    f=>{f.output.fields.Scheduled_Post_Date="2026-11-03";},
    f=>{f.content.fields.Content_Profile=["rec99999999999999"];},
  ]){
    const f=fixture();change(f);
    await assert.rejects(createNativeGalleryJobIntent(args(f)));
    assert.equal(f.stats().created,0);
  }
});
test("different request cannot displace another durable attempt",async()=>{
  const f=fixture();
  await createNativeGalleryJobIntent(args(f));
  const other={...args(f),client_request_id:"request_987654321",
    proposal:{...proposal,client_request_id:"request_987654321"}};
  await assert.rejects(createNativeGalleryJobIntent(other),
    /NATIVE_GALLERY_OUTPUT_ALREADY_HAS_JOB/);
  assert.equal(f.stats().created,1);
});
test("replay with changed proposal is a conflict",async()=>{
  const f=fixture();
  await createNativeGalleryJobIntent(args(f));
  const changed={...args(f),proposal:{...proposal,selected:[
    {...proposal.selected[0],instruction:"A different direction that must not overwrite original"},
  ]}};
  await assert.rejects(createNativeGalleryJobIntent(changed),
    /NATIVE_GALLERY_JOB_READBACK_CONFLICT/);
  assert.equal(f.stats().created,1);
});
test("ambiguous POST cannot be reported as saved without readback",async()=>{
  const f=fixture();
  f.adapter.airtableFetch=async (env,table,id,opts)=>{
    if(table===env.AIRTABLE_OUTPUT_TABLE_ID)return f.output;
    if(table==="tblwzN9AXWvmKVKPs")return f.content;
    // acknowledge an HTTP POST without actually storing a row
    assert.equal(opts.method,"POST");
  };
  await assert.rejects(createNativeGalleryJobIntent(args(f)),
    /NATIVE_GALLERY_JOB_READBACK_MISSING/);
});
