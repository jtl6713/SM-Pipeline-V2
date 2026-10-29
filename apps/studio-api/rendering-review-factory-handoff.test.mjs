import test from "node:test";
import assert from "node:assert/strict";
import {promoteAcceptedReviewToFactory} from "./rendering-review-factory-handoff.mjs";
import {classifyFactoryLane} from "./factory-desk.mjs";

const outputId="rec0uVrVeiUM6shp9";
const original="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const corrected="1Qm8H_s1QJRQgsVFG7eexlwtE0xvDn7up";
const sessionId="rrsession_5db47c3f652bf0f80162c4e933cb8b7a913c92c888fec796";
const attemptId="rrattempt_26054929500b8abe981e3f6131b5c668209bf9c765edb06c";
const clone=x=>JSON.parse(JSON.stringify(x));
function fixture(){
  const s={
    schema:"studio.render-review.1",id:sessionId,output_id:outputId,
    profile_id:"recT2rbKX3MF7cVFU",output_type:"Instagram Reel",
    state:"approved",version:12,original_do_not_publish:false,
    review_hold:{id:"rrhold-64201956-6207-464a-8e9c-616974479c1c",owner:sessionId,active:true},
    current_attempt_id:attemptId,approved_attempt_id:attemptId,latest_attempt_number:2,
    active_job:null,processed:{},history:[],
    attempts:[
      {id:"rroriginal_5db47c3f652bf0f80162c4e933cb8b7a913c92c8",
        number:1,artifact_id:original,status:"ready_for_review"},
      {id:attemptId,number:2,artifact_id:corrected,status:"ready_for_review"}
    ]
  };
  const row={id:outputId,fields:{
    Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Final_File_ID:original,Final_File_URL:"https://drive.google.com/file/d/"+original+"/view",
    Final_File_Name:"riverwalk-reel.mp4",Review_Status:"Review Sent",
    Output_Status:"Ready for Review",Publish_Status:"Not Ready",Render_Status:"Rendered",
    Do_Not_Publish:true,Auto_Publish_Enabled:true,
    Studio_Render_Review_Hold_Active:true,
    Studio_Render_Review_Hold_ID:s.review_hold.id,
    Studio_Render_Review_Hold_Owner:sessionId,
    Studio_Render_Review_Session_ID:sessionId
  }};
  const attempt={session_id:sessionId,output_id:outputId,attempt_id:attemptId,
    artifact_file_id:corrected,status:"ready_for_review",
    validation_evidence_json:JSON.stringify({mime_type:"video/mp4",
      google_drive_verified:true,audio_verified:true,watermark_verified:true,
      sha256:"8ee06c1f0234959c5ff4610b020d6bb72a005200ffa5d6590d920754b3c0f77e",
      byte_count:21961807})
  };
  let patches=0,saves=0,locks=0,failAfterPatch=0,failAfterSave=false;
  const ops={
    withOutputLock:async(id,fn)=>{assert.equal(id,outputId);locks++;return fn()},
    readSession:async()=>clone(s),
    readOutputRaw:async()=>clone(row),
    readAttempt:async()=>clone(attempt),
    patchOutput:async(id,fields)=>{
      assert.equal(id,outputId);patches++;Object.assign(row.fields,fields);
      if(failAfterPatch===patches)throw Error("interrupted Airtable response");
    },
    saveSessionIfVersion:async({expected_version,next})=>{
      assert.equal(expected_version,s.version);
      saves++;Object.assign(s,clone(next));
      if(failAfterSave)throw Error("interrupted session acknowledgement");
      return true;
    }
  };
  return {ops,s,row,attempt,get counts(){return{patches,saves,locks}},
    set failAfterPatch(value){failAfterPatch=value},
    set failAfterSave(value){failAfterSave=value}};
}
test("accepted Chicago #8447 V2 reaches Factory Needs Eyes, unscheduled and unpublished",async()=>{
  const f=fixture();
  const receipt=await promoteAcceptedReviewToFactory({outputId,operations:f.ops});
  assert.equal(receipt.ok,true);
  assert.equal(receipt.ready_for_factory,true);
  assert.equal(receipt.artifact_id,corrected);
  assert.equal(receipt.preserved_v1_file_id,original);
  assert.equal(receipt.scheduled,false);
  assert.equal(receipt.published,false);
  assert.equal(receipt.publication_approved,false);
  assert.equal(receipt.session_version,13);
  assert.equal(f.row.fields.Final_File_ID,corrected);
  assert.match(f.row.fields.Final_File_URL,new RegExp(corrected));
  assert.equal(f.row.fields.Review_Status,"Review Sent");
  assert.equal(f.row.fields.Publish_Status,"Not Ready");
  assert.equal(f.row.fields.Output_Status,"Ready for Review");
  assert.equal(f.row.fields.Do_Not_Publish,false);
  assert.equal(f.row.fields.Auto_Publish_Enabled,false);
  assert.equal(f.row.fields.Scheduled_Post_Date,null);
  assert.equal(f.row.fields.Studio_Render_Review_Hold_Active,false);
  assert.equal(f.s.review_hold.active,false);
  assert.deepEqual(f.counts,{patches:2,saves:1,locks:1});
  assert.equal(classifyFactoryLane({id:outputId,kind:"output",
    output_status:f.row.fields.Output_Status,review_status:f.row.fields.Review_Status,
    publish_status:f.row.fields.Publish_Status,render_status:"Rendered"}),"needs_eyes");
});
test("replay is idempotent and does not rerun approval, render, scheduler or publication",async()=>{
  const f=fixture();
  await promoteAcceptedReviewToFactory({outputId,operations:f.ops});
  const receipt=await promoteAcceptedReviewToFactory({outputId,operations:f.ops});
  assert.equal(receipt.ready_for_factory,true);
  assert.deepEqual(f.counts,{patches:2,saves:1,locks:2});
});
test("interrupted V2 output write stays held, then converges on safe retry",async()=>{
  const f=fixture();f.failAfterPatch=1;
  await assert.rejects(()=>promoteAcceptedReviewToFactory({outputId,operations:f.ops}),
    /interrupted Airtable/);
  assert.equal(f.row.fields.Final_File_ID,corrected);
  assert.equal(f.row.fields.Do_Not_Publish,true);
  assert.equal(f.row.fields.Studio_Render_Review_Hold_Active,true);
  const receipt=await promoteAcceptedReviewToFactory({outputId,operations:f.ops});
  assert.equal(receipt.ready_for_factory,true);
  assert.equal(f.counts.saves,1);
});
test("uncertain final hold release can be verified and replayed",async()=>{
  const f=fixture();f.failAfterPatch=2;
  await assert.rejects(()=>promoteAcceptedReviewToFactory({outputId,operations:f.ops}),
    /interrupted Airtable/);
  assert.equal(f.s.review_hold.active,false);
  assert.equal(f.row.fields.Final_File_ID,corrected);
  const receipt=await promoteAcceptedReviewToFactory({outputId,operations:f.ops});
  assert.equal(receipt.ready_for_factory,true);
  assert.equal(f.counts.saves,1);
});
test("unverified MP4 or foreign V1 blocks handoff without mutating data",async()=>{
  const f=fixture();f.attempt.validation_evidence_json="{}";
  await assert.rejects(()=>promoteAcceptedReviewToFactory({outputId,operations:f.ops}),
    e=>e.code==="FACTORY_HANDOFF_MEDIA_UNVERIFIED");
  assert.equal(f.counts.patches,0);
  const g=fixture();g.row.fields.Final_File_ID="different-live-drive-file";
  await assert.rejects(()=>promoteAcceptedReviewToFactory({outputId,operations:g.ops}),
    e=>e.code==="FACTORY_HANDOFF_OUTPUT_CHANGED");
  assert.equal(g.counts.patches,0);
});
test("scheduled, published, other held and stale accepted sessions fail closed",async()=>{
  for(const change of [
    f=>f.row.fields.Scheduled_Post_Date="2026-11-01T12:00:00.000Z",
    f=>f.row.fields.Platform_Post_ID="179000000000000",
    f=>f.row.fields.Studio_Render_Review_Hold_Owner="another-user",
    f=>f.s.approved_attempt_id=null,
    f=>f.s.original_do_not_publish=true,
  ]){
    const f=fixture();change(f);
    await assert.rejects(()=>promoteAcceptedReviewToFactory({outputId,operations:f.ops}));
    assert.equal(f.counts.patches,0);
    assert.equal(f.counts.saves,0);
  }
});
