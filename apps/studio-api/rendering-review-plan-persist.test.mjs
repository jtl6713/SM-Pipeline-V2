import test from "node:test";
import assert from "node:assert/strict";
import {persistReadyReviewPlan} from "./rendering-review-plan-persist.mjs";
import {REVIEW_SCHEMA,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const O="rec0uVrVeiUM6shp9", C="recSkCY227R8iuoaJ";
const P="recEcxgIR0XFI1VVW",A="receHeCYd89YrEZrL";
const ORIGINAL="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const SOURCE="1i6YqrXzr8a4D0DfC1QxMYdrkzUYdL976";
const ID="fb590a7e933d4eaea4";
function fixture(){
  const attempt="rroriginal_abcdef0123456789";
  const sessionId="rrsession_abcdef0123456789";
  let session={
    schema:REVIEW_SCHEMA,id:sessionId,output_id:O,
    profile_id:CHICAGO_PROFILE_ID,output_type:"Instagram Reel",
    state:"discussing",version:2,
    review_hold:{id:"rrhold_abcdef0123456789",owner:sessionId,active:true},
    current_attempt_id:attempt,latest_attempt_number:1,
    latest_plan_version:0,
    plan:null,active_job:null,processed:{},messages:[],history:[],
    attempts:[{id:attempt,number:1,artifact_id:ORIGINAL,
      status:"ready_for_review"}],
    producer_candidate:{
      hash:"a".repeat(64),evidence_hash:"b".repeat(64),
      source_attempt_id:attempt,stale:false,
      candidate:{
        explanation:"Use the first owned photo as the stronger opening.",
        narration:"Chicago's morning river reflects the skyline.",
        preserve:[],changes:["Move the opening photo earlier."],
        reuse_asset_ids:[ID],
        timeline:[{start_seconds:0,end_seconds:10,
          direction:"Show the verified Riverwalk photo.",asset_ids:[ID]}],
        requirements:[],claims:[],
        acceptance_checks:["Video starts with the selected photo."],
      },
    },
  };
  const rows=new Map([
    [O,{id:O,fields:{
      Content_Item:[C],Platform:"Instagram",
      Platform_Output_Type:"Instagram Reel",
      Final_File_ID:ORIGINAL,
      Final_File_URL:"https://drive.google.com/file/d/"+ORIGINAL+"/view",
      Do_Not_Publish:true,
      Studio_Render_Review_Hold_Active:true,
      Studio_Render_Review_Hold_ID:session.review_hold.id,
      Studio_Render_Review_Hold_Owner:sessionId,
      Studio_Render_Review_Session_ID:sessionId,
    }}],
    [C,{id:C,fields:{Content_Profile:[CHICAGO_PROFILE_ID],
      Production_Request:[P]}}],
    [P,{id:P,fields:{Studio_Master_Assets_JSON:JSON.stringify([
      {id:ID,media_asset_record_id:A,google_drive_file_id:SOURCE},
    ])}}],
    [A,{id:A,fields:{
      "Google Drive File ID":SOURCE,"Asset_Status":"Available",
      Rights_Status:"Owned",Active:true,Do_Not_Use:false,
      Content_Profile:[CHICAGO_PROFILE_ID],Media_Class:"Image",
    }}],
  ]);
  const operations={
    authorizeReview:async id=>id===O,
    authorizeEvent:async (_,e)=>e.type==="PROPOSE_PLAN",
    withOutputLock:async (_,fn)=>fn(),
    loadSession:async()=>structuredClone(session),
    readSession:async()=>structuredClone(session),
    readHold:async()=>({verified:true,active:true,
      id:session.review_hold.id,owner:sessionId,output_id:O}),
    saveSessionIfVersion:async ({expected_version,next})=>{
      if(session.version!==expected_version)return false;
      session=structuredClone(next);return true;
    },
  };
  const argumentsToPass={
    env:{AIRTABLE_OUTPUT_TABLE_ID:"tblrlPeboBthkplH0",
      AIRTABLE_MEDIA_TABLE_ID:"tblSITCujCsJTNcDe"},
    output_id:O,operations,readRecord:async(_table,id)=>{
      const r=rows.get(id);
      return r?structuredClone(r):null;
    },
    readField:(row,k)=>row.fields[k],
  };
  return {rows,operations,argumentsToPass,getSession:()=>session};
}
test("real owned asset evidence promotes candidate to a held immutable render-only plan",async()=>{
  const f=fixture();
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,true);
  assert.equal(result.persisted,true);
  const s=f.getSession();
  assert.equal(s.state,"plan_ready");
  assert.equal(s.plan.frozen,true);
  assert.equal(s.plan.immutable_manifest.allow_platform_upload,false);
  assert.equal(s.plan.immutable_manifest.allow_public_publish,false);
  assert.equal(s.plan.immutable_manifest.auto_approve,false);
  assert.equal(s.plan.immutable_manifest.asset_manifest[0].drive_file_id,SOURCE);
  assert.equal(s.plan.immutable_manifest.session_id,s.id);
  assert.equal(s.plan.immutable_manifest.plan_hash,s.plan.hash);
});
test("missing owned rights leave a visible blocker instead of a ready render",async()=>{
  const f=fixture();
  f.rows.get(A).fields.Rights_Status="Unknown";
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,false);
  assert.equal(result.persisted,false);
  assert.ok(result.blockers.length>0);
  assert.equal(f.getSession().state,"discussing");
});
test("publication hold and source must match before preparing a Producer plan",async()=>{
  const f=fixture();
  f.rows.get(O).fields.Do_Not_Publish=false;
  await assert.rejects(()=>persistReadyReviewPlan(f.argumentsToPass),
    e=>e.code==="REVIEW_OUTPUT_INELIGIBLE");
  assert.equal(f.getSession().state,"discussing");
});
test("unsourced factual claims never become a frozen executable plan",async()=>{
  const f=fixture();
  const s=f.getSession();
  s.producer_candidate.candidate.claims.push({claim:"The river is 30 miles long",source_ids:[]});
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,false);
  assert.ok(result.blockers.some(b=>b.kind==="research"));
});
