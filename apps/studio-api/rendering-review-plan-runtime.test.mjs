import test from "node:test";
import assert from "node:assert/strict";
import {materializeReviewPlan} from "./rendering-review-plan-runtime.mjs";

const outputId="rec0uVrVeiUM6shp9";
const contentId="recSkCY227R8iuoaJ";
const requestId="recEcxgIR0XFI1VVW";
const mediaId="receHeCYd89YrEZrL";
const chicago="recT2rbKX3MF7cVFU";
const file="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const imageFile="1i6YqrXzr8a4D0DfC1QxMYdrkzUYdL976";
const assetId="fb590a7e933d4eaea4";
function scenario(override={}){
  const session={
    schema:"studio.render-review.1",id:"rrsession_test_001",output_id:outputId,
    profile_id:chicago,output_type:"Instagram Reel",state:"discussing",version:2,
    current_attempt_id:"rrattempt_original_001",latest_attempt_number:1,
    latest_plan_version:0,review_hold:{id:"rrhold_test_001",owner:"rrsession_test_001",active:true},
    plan:null,active_job:null,pending_authorization:null,
    attempts:[{id:"rrattempt_original_001",number:1,status:"ready_for_review",artifact_id:file}],
    producer_candidate:{
      hash:"a".repeat(64),evidence_hash:"b".repeat(64),source_attempt_id:"rrattempt_original_001",
      stale:false,candidate:{
        explanation:"Use the existing verified Chicago Riverwalk still in the opening.",
        narration:"Watch the soft light cross the river as the city begins to move.",
        changes:["Start on the reflected light, with a more definite finish."],
        preserve:[],reuse_asset_ids:[assetId],
        timeline:[{start_seconds:0,end_seconds:6,direction:"Begin with the original still",asset_ids:[assetId]}],
        requirements:[],claims:[],
        acceptance_checks:["Opening names what is visible; last frame feels conclusive."],
      },
    },
    processed:{},history:[],messages:[],
  };
  const records={
    output:{id:outputId,fields:{
      Platform:"Instagram",Platform_Output_Type:"Instagram Reel",Render_Status:"Rendered",
      Final_File_ID:file,Content_Item:[contentId],Do_Not_Publish:true,
      Studio_Render_Review_Hold_Active:true,Studio_Render_Review_Hold_ID:"rrhold_test_001",
      Studio_Render_Review_Hold_Owner:"rrsession_test_001",Studio_Render_Review_Session_ID:"rrsession_test_001",
    }},
    content:{id:contentId,fields:{Content_Profile:[chicago],Production_Request:[requestId]}},
    request:{id:requestId,fields:{Studio_Master_Assets_JSON:JSON.stringify([{
      id:assetId,media_asset_record_id:mediaId,google_drive_file_id:imageFile,
      authoritative_storage:"google_drive",
    }])}},
    media:{id:mediaId,fields:{
      "Google Drive File ID":imageFile,Content_Profile:[chicago],
      Rights_Status:"Owned",Capture_Source:"Self Filmed",
      Asset_Status:"Available",Active:true,Media_Class:"Image",
    }},
  };
  if(override.mediaRights) records.media.fields.Rights_Status=override.mediaRights;
  if(override.dispatched)records.output.fields.Platform_Media_ID="already-sent";
  let durable=structuredClone(session),reads=0,saved=0;
  const operations={
    authorizeReview:async id=>id===outputId,
    readHold:async()=>({verified:true,active:true,id:"rrhold_test_001",
      owner:"rrsession_test_001",output_id:outputId}),
    loadSession:async()=>structuredClone(durable),
    withOutputLock:async(_id,callback)=>callback(),
    authorizeEvent:async(_id,event)=>event.type==="PROPOSE_PLAN",
    saveSessionIfVersion:async({expected_version,next})=>{
      if(durable.version!==expected_version)return false;
      durable=structuredClone(next);saved++;return true;
    },
    readSession:async()=>structuredClone(durable),
  };
  return {session,records,operations,
    args:{output_id:outputId,expected_version:2,operations,
      readRaw:async()=>{reads++;return records.output;},
      readContent:async()=>records.content,readRequest:async()=>records.request,
      readMediaAsset:async()=>records.media,readField:(r,k)=>r.fields[k]},
    state:()=>({durable,reads,saved})};
}
test("owned Chicago still yields one persisted render-only plan, no output write",async()=>{
  const s=scenario();
  const result=await materializeReviewPlan(s.args);
  assert.equal(result.plan_ready,true);
  assert.equal(result.render_queued,false);
  assert.equal(result.publication_changed,false);
  assert.equal(s.state().durable.state,"plan_ready");
  assert.equal(s.state().durable.plan.immutable_manifest.session_id,s.session.id);
  assert.equal(s.state().durable.plan.immutable_manifest.asset_manifest.length,1);
  assert.equal(s.state().durable.plan.immutable_manifest.allow_platform_upload,false);
  assert.equal(s.state().saved,1);
  assert.equal(s.records.output.fields.Platform_Media_ID,undefined);
});
test("media ownership gap blocks button rather than fabricating rights",async()=>{
  const s=scenario({mediaRights:"Unknown"});
  const result=await materializeReviewPlan(s.args);
  assert.equal(result.plan_ready,false);
  assert.ok(result.blockers.some(x=>x.kind==="asset"));
  assert.notEqual(s.state().durable.state,"plan_ready");
});
test("remote Meta dispatch halts preflight and never persists a plan",async()=>{
  const s=scenario({dispatched:true});
  await assert.rejects(materializeReviewPlan(s.args),{code:"PLAN_OUTPUT_NOT_HELD"});
  assert.equal(s.state().saved,0);
});
