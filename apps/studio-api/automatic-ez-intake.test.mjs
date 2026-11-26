import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { automaticEzIdeaFields, automaticEzIntakeEnabled, automaticEzCreateEnabled, automaticEzIdeaKind, verifiedAutomaticEzDraftInput } from "./automatic-ez-intake.mjs";
const env={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",STUDIO_PRODUCTION_EDITOR_GUARD:"true",STUDIO_AUTOMATIC_EZ_INTAKE:"true"};
const auth={permissions:{ideas_create:true,production_configure:true}};
const profile="recProfile0000001",id="recIdea0000000001";
const scope={source:"idea",mode:"automatic",profileId:profile};
const payload={automatic_ez_intake:true,production_mode:"automatic",input_kind:"single-photo",content_profile_id:profile};
const fields=automaticEzIdeaFields(env,auth,payload,scope);
const idea={id,fields:{...fields,Content_Profile:[profile],Studio_Production_Mode:"automatic",Studio_Production_Source:"idea",Candidate_Status:"Generated"}};
const body={idea_record_id:id,content_profile_id:profile,production_notes:"origin=ez-wizard; ez-input=single-photo"};
test("ordinary staged draft capture suppresses photo wait and grants no acceptance or publishing authority",()=>{
  assert.equal(fields.Studio_Photo_Wait_Status,"Not Needed");
  assert.deepEqual(Object.keys(fields).sort(),["Production_Config_Notes","Studio_Photo_Wait_Status"]);
  for(const input_kind of ["single-photo","multiple-photos","single-ai","multiple-ai","mixed","video-clips","photos-and-clips"])
    assert.equal(automaticEzIdeaKind({fields:automaticEzIdeaFields(env,auth,{...payload,input_kind},scope)}),input_kind);
  for(const key of Object.keys(env))assert.equal(automaticEzIntakeEnabled({...env,[key]:"false"}),false);
  assert.equal(automaticEzCreateEnabled(env,{permissions:{ideas_create:true}}),false);
  for(const patch of [{input_kind:"vibe-cut"},{input_kind:"finished-video"},{input_kind:"story-first"},{production_mode:"manual"},{automatic_photo_wait:{}},{content_profile_id:"recOther000000001"},{summary:"origin=az-finished-video"}])
    assert.throws(()=>automaticEzIdeaFields(env,auth,{...payload,...patch},scope));
});
test("future dedicated transport must verify typed marked owner, exact profile and ordinary origin",()=>{
  assert.equal(verifiedAutomaticEzDraftInput(idea,body),true);
  for(const patch of [{production_notes:"origin=az-finished-video; ez-input=single-photo"},{production_notes:"origin=ez-wizard; ez-input=multiple-photos"},{production_notes:body.production_notes+"; az-publish-mode=immediate"},{publish_now:true},{content_profile_id:"recOther000000001"}])
    assert.equal(verifiedAutomaticEzDraftInput(idea,{...body,...patch}),false);
  for(const patch of [{Studio_Production_Mode:"manual"},{Studio_Production_Source:"finished_video"},{Production_Config_Notes:""},{Candidate_Status:"Approved"},{Test_Run_ID:"test"}])
    assert.equal(verifiedAutomaticEzDraftInput({...idea,fields:{...idea.fields,...patch}},body),false);
});
test("create applies staged fields before initial canonical write and skips immediate photo matching",()=>{
  const worker=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  const create=worker.slice(worker.indexOf("export async function createIdea("),worker.indexOf("/*__STUDIO_WORKER_END:createIdea__*/"));
  assert.ok(create.indexOf("Object.assign(fields, atomicEzIntakeFields)")<create.indexOf("const created = await airtableFetch"));
  assert.match(create,/if \(!atomicPhotoWaitFields && !vibeCut && ctx\?\.waitUntil && !atomicEzIntakeFields/);
  assert.match(create,/automatic_ez_intake_saved:/);
  const router=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  assert.match(router,/automatic_ez_idea_create_enabled: automaticEzCreateEnabled\(env,authorization\)/);
});
