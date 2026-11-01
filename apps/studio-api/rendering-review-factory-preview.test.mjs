import test from "node:test";
import assert from "node:assert/strict";
import {factorySelectedReviewAttempt} from "./rendering-review-factory-preview.mjs";

const id="recPnNYghmcJYivOA";
const profile="recT2rbKX3MF7cVFU";
const owner="rrsession_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb158a79a666";
const holdId="rrhold-f233e320-2b48-4443-a022-c31f60d90ca6";
const v1="1JWiW5ieE5vqDV_V6xAr5YLQnXyjOZcdF";
const v2="16osgGbNcyet_4WwDLiarSurkF3yXFOcq";
const attemptId="rrimport_9593_864436ce242983f69fceaa68f37ac4";
const clone=o=>JSON.parse(JSON.stringify(o));

function heldV2(){
  const session={
    id:owner,output_id:id,profile_id:profile,output_type:"Instagram Reel",
    state:"ready_for_review",version:8,approved_attempt_id:null,
    active_job:null,current_attempt_id:attemptId,factory_handoff:null,
    review_hold:{id:holdId,owner,active:true},
    attempts:[
      {id:"rroriginal_6a40a9aa1fc63d4d48d411bd3fa8ed923ed6fb15",number:1,status:"ready_for_review",artifact_id:v1},
      {id:attemptId,number:2,status:"ready_for_review",artifact_id:v2},
    ],
  };
  const row={id,fields:{
    Platform:"Instagram",Platform_Output_Type:"Instagram Reel",
    Final_File_ID:v2,Final_File_URL:"https://drive.google.com/file/d/"+v2+"/view",
    Output_Status:"Ready for Review",Review_Status:"Review Sent",
    Render_Status:"Rendered",Publish_Status:"Not Ready",
    Do_Not_Publish:true,Studio_Render_Review_Hold_Active:true,
    Studio_Render_Review_Hold_ID:holdId,Studio_Render_Review_Hold_Owner:owner,
    Auto_Publish_Enabled:false,
  }};
  return {session,row,profile,outputId:id};
}

test("Michigan 9593 current completed V2 is privately previewable while review hold is active",()=>{
  const x=heldV2();
  const selected=factorySelectedReviewAttempt(x);
  assert.equal(selected?.id,attemptId);
  assert.equal(selected?.artifact_id,v2);
  assert.equal(x.session.state,"ready_for_review");
  assert.equal(x.session.approved_attempt_id,null);
  assert.equal(x.row.fields.Do_Not_Publish,true);
  assert.equal(x.row.fields.Studio_Render_Review_Hold_Active,true);
});

test("approved current V2 stays privately previewable while its exact owned hold remains active",()=>{
  const x=heldV2();
  x.session.state="approved";
  x.session.approved_attempt_id=attemptId;
  assert.equal(factorySelectedReviewAttempt(x)?.id,attemptId);
  assert.equal(x.session.review_hold.active,true);
  assert.equal(x.row.fields.Do_Not_Publish,true);
  assert.equal(x.row.fields.Studio_Render_Review_Hold_Active,true);
});

test("approved-but-held preview cannot bypass source, identity, publication or handoff guards",()=>{
  const changes=[
    x=>{x.session.review_hold.active=false},
    x=>{x.row.fields.Studio_Render_Review_Hold_Active=false},
    x=>{x.row.fields.Studio_Render_Review_Hold_Owner="other"},
    x=>{x.row.fields.Do_Not_Publish=false},
    x=>{x.session.approved_attempt_id=null},
    x=>{x.session.active_job={id:"running"}},
    x=>{x.session.factory_handoff={status:"incomplete"}},
    x=>{x.row.fields.Output_Status="Approved for Publishing"},
    x=>{x.row.fields.Publish_Status="Ready to Schedule"},
    x=>{x.row.fields.Auto_Publish_Enabled=true},
    x=>{x.row.fields.Final_File_ID=v1},
    x=>{x.row.fields.Review_Status="Approved"},
    x=>{x.row.fields.Published_At="2026-11-01T00:00:00Z"},
    x=>{x.profile="recDifferentProfile1"},
  ];
  for(const change of changes){
    const x=clone(heldV2());
    x.session.state="approved";
    x.session.approved_attempt_id=attemptId;
    change(x);
    assert.equal(factorySelectedReviewAttempt(x),null,String(change));
  }
});

test("held V2 previews refuse hold loss, unrelated ownership, artifact drift or dispatch",()=>{
  const changes=[
    x=>{x.session.review_hold.active=false},
    x=>{x.row.fields.Do_Not_Publish=false},
    x=>{x.row.fields.Studio_Render_Review_Hold_Active=false},
    x=>{x.row.fields.Studio_Render_Review_Hold_Owner="other"},
    x=>{x.row.fields.Studio_Render_Review_Hold_ID="other"},
    x=>{x.row.fields.Final_File_ID=v1},
    x=>{x.row.fields.Final_File_URL="https://drive.google.com/file/d/"+v1+"/view"},
    x=>{x.row.fields.Published_At="2026-10-31T19:00:00Z"},
    x=>{x.row.fields.Publish_Started_At="2026-10-31T19:00:00Z"},
    x=>{x.row.fields.Platform_Post_ID="posted"},
    x=>{x.session.active_job={id:"job-active"}},
    x=>{x.session.approved_attempt_id=attemptId},
    x=>{x.session.state="discussing"},
    x=>{x.session.attempts[1].status="rendering"},
    x=>{x.session.factory_handoff={attempt_id:"different",artifact_id:v2}},
    x=>{x.row.fields.Publish_Status="Published"},
    x=>{x.profile="recUnrelatedProfile"},
  ];
  for(const change of changes){
    const x=clone(heldV2());change(x);
    assert.equal(factorySelectedReviewAttempt(x),null,String(change));
  }
});

test("never preview V1 or a mismatched cross-output session as held revision",()=>{
  const a=heldV2();
  a.session.current_attempt_id=a.session.attempts[0].id;
  assert.equal(factorySelectedReviewAttempt(a),null);
  const b=heldV2();
  b.session.output_id="recOtherOutputID0";
  assert.equal(factorySelectedReviewAttempt(b),null);
});
