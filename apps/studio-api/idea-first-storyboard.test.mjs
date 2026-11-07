import assert from "node:assert/strict";
import test from "node:test";
import {
  parseStoryFirstNotes, normalizeStoryFirst, upsertStoryFirstNotes,
  storyFirstShotChecklist, storyFirstReadiness, validateStoryFirstSelectedMedia,
} from "./idea-first-storyboard.mjs";

const CHICAGO = "recT2rbKX3MF7cVFU";
const MIAMI = "recpNlNn6U6eq0M9r";
const ASSET1 = "recj3n81pxXnx9Y1w";
const ASSET2 = "recABCDE1234567";
const scene = (time, visual, extra={}) => ({time,visual,voiceover:"The city wakes.",media:"still",...extra});
const idea = {schema:"story-first.1",profile_id:CHICAGO,target_seconds:30,scenes:[
  scene("0-10","Blue-hour Chicago skyline before sunrise",{decision:"ai",ai_prompt:"Dawn on the skyline"}),
  scene("10-20","Empty Riverwalk before dawn",{candidate_asset_id:ASSET1,
    candidate_assets:[{id:ASSET1,reason:"Possible location match"},{id:ASSET2,reason:"Review timing"}]}),
  scene("20-30","CTA train passing through downtown",{media:"clip",decision:"capture",capture_note:"Film real morning footage"}),
]};
const asset = (id,profile=CHICAGO, overrides={}) => ({id,fields:{
  Content_Profile:[profile], Rights_Status:"Owned",Do_Not_Use:false,
  Asset_Status:"Available","Google Drive File ID":"file-123456",
  Media_Class:"Image",MIME_Type:"image/jpeg",...overrides,
}});
test("creative scene and editable script survive an Airtable Idea save and reopen",()=>{
  const normalized=normalizeStoryFirst(idea,CHICAGO);
  assert.equal(normalized.scenes.length,3);
  assert.equal(normalized.scenes[0].visual,"Blue-hour Chicago skyline before sunrise");
  assert.equal(normalized.scenes[0].voiceover,"The city wakes.");
  assert.equal(normalized.scenes[2].state,"awaiting_operator_upload");
  assert.equal(normalized.status,"awaiting_shots");
  assert.equal(normalized.publications_blocked,true);
  const notes=upsertStoryFirstNotes("operator_note=preserve",normalized,CHICAGO);
  assert.match(notes,/operator_note=preserve/);
  assert.match(notes,/ez-photo-wait=off/);
  assert.deepEqual(parseStoryFirstNotes(notes),normalized);
  assert.deepEqual(storyFirstReadiness(normalized).unresolved,[1,2,3]);
  assert.match(storyFirstShotChecklist(normalized),/Review matching library media/);
});
test("three initial recommendations maximum and none are approved by suggestion alone",()=>{
  const all={...idea,scenes:[scene("0-30","Sunrise over the Chicago Riverwalk",{
    candidate_assets:[1,2,3,4,5].map(n=>({id:"recCandidate"+n,reason:"Candidate "+n})),
  })]};
  const normalized=normalizeStoryFirst(all,CHICAGO);
  assert.equal(normalized.scenes[0].candidate_assets.length,3);
  assert.equal(normalized.scenes[0].state,"candidate_unverified");
  assert.equal(storyFirstReadiness(normalized).ready,false);
});
test("AI image only becomes approved after explicit acceptance into a verified Media Asset",()=>{
  const pending=normalizeStoryFirst({...idea,scenes:[scene("0-30","Sunrise on the Riverwalk",{
    decision:"ai",generated_master_id:"aipreabc123",ai_prompt:"Genuine Chicago Riverwalk sunrise",
  })]},CHICAGO);
  assert.equal(pending.scenes[0].state,"awaiting_image_review");
  assert.equal(storyFirstReadiness(pending).ready,false);
  const rejected=normalizeStoryFirst({...pending,scenes:[{
    ...pending.scenes[0],generated_master_id:"aipreabc123",rejected_ai_ids:["aipreabc123"],
    assigned_asset_id:null,selected_approved:false,
  }]},CHICAGO);
  assert.equal(rejected.scenes[0].generated_master_id,null);
  assert.equal(storyFirstReadiness(rejected).ready,false);
});
test("selected media is revalidated for profile ownership, Drive, rights and required footage",()=>{
  const selected=normalizeStoryFirst({...idea,scenes:[scene("0-30","CTA elevated train moving in the Loop",{
    decision:"library",media:"clip",assigned_asset_id:ASSET1,selected_approved:true,
  })]},CHICAGO);
  assert.equal(storyFirstReadiness(selected).ready,true);
  assert.equal(selected.status,"media_complete");
  const good=new Map([[ASSET1,asset(ASSET1,CHICAGO,{Media_Class:"Video",MIME_Type:"video/mp4"})]]);
  assert.deepEqual(validateStoryFirstSelectedMedia(selected,good),{ok:true,problems:[]});
  const wrongProfile=new Map([[ASSET1,asset(ASSET1,MIAMI,{Media_Class:"Video"})]]);
  assert.match(validateStoryFirstSelectedMedia(selected,wrongProfile).problems.join(" "),/different profile/i);
  const badRights=new Map([[ASSET1,asset(ASSET1,CHICAGO,{Rights_Status:"Unknown",Media_Class:"Video"})]]);
  assert.match(validateStoryFirstSelectedMedia(selected,badRights).problems.join(" "),/rights/i);
  const noDrive=new Map([[ASSET1,asset(ASSET1,CHICAGO,{"Google Drive File ID":"",Media_Class:"Video"})]]);
  assert.match(validateStoryFirstSelectedMedia(selected,noDrive).problems.join(" "),/Drive/i);
  const still=new Map([[ASSET1,asset(ASSET1)]]);
  assert.match(validateStoryFirstSelectedMedia(selected,still).problems.join(" "),/video clip/i);
  const overridden=normalizeStoryFirst({...selected,scenes:[{...selected.scenes[0],media_override:true}]},CHICAGO);
  assert.equal(validateStoryFirstSelectedMedia(overridden,still).ok,true);
});
test("cross-profile storyboards and invalid or broken timelines fail closed",()=>{
  assert.throws(()=>normalizeStoryFirst(idea,MIAMI),/profile/i);
  assert.throws(()=>normalizeStoryFirst({...idea,scenes:[]},CHICAGO),/scene/i);
  assert.throws(()=>normalizeStoryFirst({...idea,scenes:[scene("0-30","tiny")]},CHICAGO),/specific visual/i);
  assert.throws(()=>normalizeStoryFirst({...idea,scenes:[scene("0-30","Riverwalk sunrise",{
    assigned_asset_id:"random.png"})]},CHICAGO),/asset/i);
  assert.throws(()=>normalizeStoryFirst({...idea,scenes:[
    scene("0-20","Riverwalk sunrise"),scene("19-30","Chicago bridge sunrise"),
  ]},CHICAGO),/contiguous/i);
  assert.throws(()=>normalizeStoryFirst({...idea,scenes:[scene("0-20","Riverwalk sunrise")]},CHICAGO),/Last scene/i);
  assert.equal(parseStoryFirstNotes("[story-first.1] {broken"),null);
});
test("repeated partial saves replace the story directive instead of duplicating it",()=>{
  const once=upsertStoryFirstNotes("ez-photo-wait=off",idea,CHICAGO);
  const twice=upsertStoryFirstNotes(once,normalizeStoryFirst(idea,CHICAGO),CHICAGO);
  assert.equal(twice.match(/\[story-first\.1\]/g)?.length,1);
  assert.equal(parseStoryFirstNotes(twice).scenes.length,3);
});
