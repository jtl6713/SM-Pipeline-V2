import test from "node:test";
import assert from "node:assert/strict";
import {persistReadyReviewPlan} from "./rendering-review-plan-persist.mjs";
import {REVIEW_SCHEMA,CHICAGO_PROFILE_ID} from "./rendering-review-policy.mjs";

const O="rec0uVrVeiUM6shp9", C="recSkCY227R8iuoaJ";
const P="recEcxgIR0XFI1VVW",A="receHeCYd89YrEZrL";
const ORIGINAL="1XZ-_ARlXoP5mwILho13f81vmWQlpgTs4";
const SOURCE="1i6YqrXzr8a4D0DfC1QxMYdrkzUYdL976";
const ID="fb590a7e933d4eaea4";
const CROPPED="1DGV7Ql-1hyjrYKdhhCIPxg4JEdg8hZYn";
const PREVIEW="https://media.chicagoshining.com/studio/previews/item4/approved-9x16.jpg";
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
      Remotion_Props_JSON:JSON.stringify({compositionId:"ChicagoShiningPhotoSequence",
        clips:[{mediaAssetRecordId:A,googleDriveFileId:CROPPED,url:PREVIEW,src:PREVIEW}]}),
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
    ]),Studio_Variant_Manifest_JSON:JSON.stringify({
      complete:true,production_request_record_id:P,
      assets:[{id:ID,media_asset_record_id:A,google_drive_file_id:SOURCE,
        variants:{"9:16":{google_drive_file_id:CROPPED,
          preview_status:"Ready",preview_url:PREVIEW}}}]
    })}}],
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
  assert.equal(s.plan.immutable_manifest.asset_manifest[0].render_variant_drive_file_id,CROPPED);
  assert.equal(s.plan.immutable_manifest.asset_manifest[0].render_url,PREVIEW);
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

test("a separately validated V2 MP4 is the source for a V3 plan",async()=>{
  const f=fixture(),state=f.getSession();
  const previous=state.current_attempt_id;
  const revisedId="rrattempt_verified_second_12345678";
  const revisedFile="1AbCdEfGhIjKlMnOpQrStUvWxYz012345";
  const proof={sha256:"a".repeat(64),byte_count:840000,mime_type:"video/mp4",
    width:1080,height:1920,audio_verified:true,watermark_verified:true,
    google_drive_verified:true};
  state.attempts.push({id:revisedId,number:2,parent_id:previous,
    artifact_id:revisedFile,status:"ready_for_review"});
  state.current_attempt_id=revisedId;
  state.latest_attempt_number=2;
  state.producer_candidate.source_attempt_id=revisedId;
  f.argumentsToPass.loadCompletedAttempt=async id=>({
    id:"recBBBBBBBBBBBBBB",fields:{Attempt_ID:id,Session_ID:state.id,
      Output_Record_ID:O,Attempt_Number:2,Attempt_Status:"ready_for_review",
      Artifact_File_ID:revisedFile,
      Artifact_URL:"https://drive.google.com/file/d/"+revisedFile+"/view",
      Validation_Evidence_JSON:JSON.stringify(proof)},
  });
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,true);
  assert.equal(f.getSession().plan.immutable_manifest.source_drive_file_id,revisedFile);
  assert.equal(f.getSession().plan.immutable_manifest.source_attempt_id,revisedId);
  assert.equal(f.rows.get(O).fields.Final_File_ID,ORIGINAL);
});
test("V3 plan is blocked if independent V2 validation is unavailable",async()=>{
  const f=fixture(),state=f.getSession();
  const revisedId="rrattempt_unverified_second_123456";
  state.attempts.push({id:revisedId,number:2,
    artifact_id:"1AbCdEfGhIjKlMnOpQrStUvWxYz012345",status:"ready_for_review"});
  state.current_attempt_id=revisedId;
  state.producer_candidate.source_attempt_id=revisedId;
  f.argumentsToPass.loadCompletedAttempt=async()=>null;
  await assert.rejects(()=>persistReadyReviewPlan(f.argumentsToPass),
    e=>e.code==="REVIEW_SOURCE_NOT_VERIFIED");
});

test("approved 9:16 variant mismatch blocks plan before rendering",async()=>{
  const f=fixture();
  const render=JSON.parse(f.rows.get(O).fields.Remotion_Props_JSON);
  render.clips[0].googleDriveFileId="another-crop";
  f.rows.get(O).fields.Remotion_Props_JSON=JSON.stringify(render);
  const receipt=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(receipt.ready,false);
  assert.equal(receipt.persisted,false);
  assert.ok(receipt.blockers.some(b=>b.kind==="asset"));
});

test("variant preview swap cannot claim authority from an owned master",async()=>{
  const f=fixture();
  const variant=JSON.parse(f.rows.get(P).fields.Studio_Variant_Manifest_JSON);
  variant.assets[0].variants["9:16"].preview_url="https://media.chicagoshining.com/studio/previews/item4/other.jpg";
  f.rows.get(P).fields.Studio_Variant_Manifest_JSON=JSON.stringify(variant);
  const receipt=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(receipt.ready,false);
  assert.equal(receipt.persisted,false);
});

test("missing Request variant inventory cannot freeze a render plan",async()=>{
  const f=fixture();
  f.rows.get(P).fields.Studio_Variant_Manifest_JSON="{}";
  const receipt=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(receipt.ready,false);
  assert.equal(receipt.persisted,false);
});

test("conversation-only visual feedback is saved but cannot expose V2 render authorization",async()=>{
  const f=fixture(),session=f.getSession();
  session.producer_candidate.candidate.timeline=[];
  session.producer_candidate.candidate.requirements=[{
    kind:"asset",description:"Visually verify sunrise or daytime replacement",
    alternatives:["Inspect existing owned photos","Upload suitable photo"]}];
  const previousVersion=session.version;
  const receipt=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(receipt.ok,true);
  assert.equal(receipt.ready,false);
  assert.equal(receipt.persisted,false);
  assert.ok(receipt.blockers.some(b=>b.kind==="asset"));
  assert.equal(session.version,previousVersion);
  assert.equal(session.plan,null);
  assert.equal(session.state,"discussing");
  assert.equal(session.review_hold.active,true);
});


test("owned V1 MP4 passthrough is eligible without pretending it is an image crop",async()=>{
  const f=fixture(),VIDEO="recByWv7yDeVi2NPE";
  const VIDEO_ID="59a9b4d684904e5382";
  const FILE="1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr";
  const URL="https://drive.google.com/uc?export=download&id="+FILE;
  const original=f.rows.get(O),req=f.rows.get(P),candidate=f.getSession().producer_candidate.candidate;
  const props=JSON.parse(original.fields.Remotion_Props_JSON);
  props.clips.push({mediaAssetRecordId:VIDEO,googleDriveFileId:FILE,url:URL,src:URL});
  original.fields.Remotion_Props_JSON=JSON.stringify(props);
  const masters=JSON.parse(req.fields.Studio_Master_Assets_JSON);
  masters.push({id:VIDEO_ID,media_asset_record_id:VIDEO,google_drive_file_id:FILE,
    media_kind:"video",mime_type:"video/mp4"});
  req.fields.Studio_Master_Assets_JSON=JSON.stringify(masters);
  const variants=JSON.parse(req.fields.Studio_Variant_Manifest_JSON);
  variants.assets.push({id:VIDEO_ID,media_asset_record_id:VIDEO,
    google_drive_file_id:FILE,media_kind:"video",
    variants:{"9:16":{media_kind:"video",recipe_version:"video-passthrough",
      width:1080,height:1920,google_drive_file_id:FILE,
      preview_url:"/api/media-assets/"+VIDEO+"/stream",preview_status:"Ready"}}});
  req.fields.Studio_Variant_Manifest_JSON=JSON.stringify(variants);
  f.rows.set(VIDEO,{id:VIDEO,fields:{"Google Drive File ID":FILE,
    "Asset_Status":"Available","Rights_Status":"Owned",Active:true,
    "Content_Profile":[CHICAGO_PROFILE_ID],"Media_Class":"Video"}});
  candidate.reuse_asset_ids=[ID,VIDEO_ID];
  candidate.timeline=[{start_seconds:0,end_seconds:10,
    direction:"Original photo",asset_ids:[ID]},
    {start_seconds:10,end_seconds:12.5,
    direction:"Original fireworks footage, no replacement",asset_ids:[VIDEO_ID]}];
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,true);
  const manifest=f.getSession().plan.immutable_manifest.asset_manifest;
  const source=manifest.find(x=>x.asset_id===VIDEO_ID);
  assert.equal(source?.media_type,"video");
  assert.equal(source?.render_url,URL);
  assert.equal(source?.render_variant_drive_file_id,FILE);
  assert.equal(f.getSession().plan.immutable_manifest.allow_public_publish,false);
});
test("an MP4 variant cannot substitute another Drive file or HTML view URL",async()=>{
  const f=fixture(),file="1fFQhSOPlVy8PqnB7QTxNhXZueMCTI_zr";
  // Malicious substitution must not be accepted as a verified photo variant.
  const v=JSON.parse(f.rows.get(P).fields.Studio_Variant_Manifest_JSON);
  const current=v.assets[0].variants["9:16"];
  current.media_kind="video";current.recipe_version="video-passthrough";
  current.width=1080;current.height=1920;current.google_drive_file_id=file;
  current.preview_url="/api/media-assets/"+A+"/stream";
  f.rows.get(P).fields.Studio_Variant_Manifest_JSON=JSON.stringify(v);
  const result=await persistReadyReviewPlan(f.argumentsToPass);
  assert.equal(result.ready,false);
  assert.ok(result.blockers.some(x=>x.kind==="asset"));
});
