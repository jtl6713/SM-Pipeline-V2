import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {automaticPhotoWaitCreateEnabled,automaticPhotoWaitCreateFields,automaticPhotoWaitExistingEnabled,assertAutomaticPhotoWaitExisting} from "./automatic-photo-wait-create.mjs";

const env={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",STUDIO_PRODUCTION_EDITOR_GUARD:"true"};
const auth={permissions:{ideas_create:true,ideas_promote:true,production_configure:true}};
const config={approve_idea:true,content_type:"Carousel",platforms:["Instagram","Facebook"],
  include_voiceover:"No",include_background_music:"Yes",include_thumbnail:"Use Profile Default",
  carousel_slide_count_min:3,carousel_slide_count_max:6};
const scope={source:"idea",mode:"automatic",inputKind:"multiple-photos",now:"2026-11-25T00:00:00.000Z"};

test("atomic photo wait preserves actual range, settings and existing Idea-level acceptance",()=>{
  const f=automaticPhotoWaitCreateFields(env,auth,config,scope);
  assert.equal(f.Candidate_Status,"Approved");
  assert.equal(f.Approved_At,scope.now);
  assert.equal(f.Studio_Photo_Wait_Status,"Waiting");
  assert.deepEqual(f.Production_Target_Platforms,config.platforms);
  assert.equal(f.Production_Content_Type,"Carousel");
  assert.equal(f.Production_Carousel_Image_Mode,"Manual Upload");
  assert.equal(f.Production_Carousel_Slide_Count_Mode,"Target range");
  assert.equal(f.Production_Carousel_Slide_Count_Min,3);
  assert.equal(f.Production_Carousel_Slide_Count_Max,6);
  assert.equal(f.Production_Carousel_Slide_Count,6);
  assert.equal(f.Production_Include_Voiceover,"No");
  assert.equal(f.Production_Include_Background_Music,"Yes");
  assert.equal(f.Production_Include_Thumbnail,"Use Profile Default");
  assert.ok(Object.keys(f).every(k=>!/(publish|schedule|factory|hold)/i.test(k)));
});

test("all three runtime flags and permissions are necessary; no manual or dedicated source bypass",()=>{
  for(const key of Object.keys(env)){
    const blocked={...env,[key]:"false"};
    assert.equal(automaticPhotoWaitCreateEnabled(blocked,auth),false);
    assert.throws(()=>automaticPhotoWaitCreateFields(blocked,auth,config,scope));
  }
  for(const key of Object.keys(auth.permissions)){
    const blocked={permissions:{...auth.permissions,[key]:false}};
    assert.equal(automaticPhotoWaitCreateEnabled(env,blocked),false);
    assert.throws(()=>automaticPhotoWaitCreateFields(env,blocked,config,scope));
  }
  for(const bad of [{mode:"manual"},{source:"script_a_short"},{source:"finished_video"},{inputKind:"vibe-cut"}])
    assert.throws(()=>automaticPhotoWaitCreateFields(env,auth,config,{...scope,...bad}));
});

test("rejects unsupported or incomplete configuration, injected authority and invalid photo ranges",()=>{
  for(const bad of [{approve_idea:false},{platforms:[]},{platforms:["Unknown"]},
    {content_type:"Text Post"},{carousel_slide_count_min:7},{carousel_slide_count_max:21},
    {carousel_slide_count_min:1.5},{include_voiceover:"maybe"},{publish_now:true},{library_asset_ids:["rec1"]}])
    assert.throws(()=>automaticPhotoWaitCreateFields(env,auth,{...config,...bad},scope));
});

test("create route applies validated settings before the only initial write and defers matching",()=>{
  const worker=readFileSync(new URL("./worker-functions-01.mjs",import.meta.url),"utf8");
  const create=worker.slice(worker.indexOf("export async function createIdea("),worker.indexOf("/*__STUDIO_WORKER_END:createIdea__*/"));
  assert.match(create,/automaticPhotoWaitCreateFields\(env, authorization, payload\.automatic_photo_wait/);
  assert.ok(create.indexOf("Object.assign(fields, atomicPhotoWaitFields)")<create.indexOf("const created = await airtableFetch"));
  assert.match(create,/if \(!atomicPhotoWaitFields && !vibeCut && ctx\?\.waitUntil/);
  assert.match(create,/automatic_photo_wait_saved:/);
  assert.match(create,/f\(created,"Candidate_Status"\)==="Approved"/);
  const app=readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
  const wizard=app.slice(app.indexOf("async function finishEzWizard("),app.indexOf("function drainPendingMasterUploads("));
  const atomic=wizard.slice(wizard.indexOf("if (caps.automatic_photo_wait_create_enabled === true)"),wizard.indexOf("if (caps.ordinary_editor_boundary_enabled === true)"));
  assert.match(atomic,/automatic_photo_wait: config/);
  assert.match(atomic,/method: "POST", retries: 0/);
  assert.match(atomic,/automatic_photo_wait_saved !== true/);
  assert.match(atomic,/Approval Factory/);
  assert.doesNotMatch(atomic,/openIdeaDrawer|openProductionRequestForIdea|\/promote/);
});

test("existing automatic photo wait verifies exact typed owner, profile, permission and explicit settings",()=>{
  const profile="rec12345678901234", id="rec22345678901234";
  const existingAuth={permissions:{ideas_promote:true,production_configure:true}};
  const record={id,fields:{Content_Profile:[profile],Studio_Production_Mode:"automatic",
    Studio_Production_Source:"idea",Candidate_Status:"Generated"}};
  const marker={profile_id:profile};
  const payload={...config,photo_wait:true,carousel_slide_count_mode:"Target range",carousel_image_mode:"Wait for matching photos"};
  assert.equal(automaticPhotoWaitExistingEnabled(env,existingAuth),true);
  assert.doesNotThrow(()=>assertAutomaticPhotoWaitExisting(env,existingAuth,record,marker,payload));
  for(const fields of [{Studio_Production_Mode:"manual"},{Studio_Production_Source:"finished_video"},
    {Studio_Production_Source:"script_a_short"},{Content_Profile:[profile,"rec32345678901234"]},
    {Candidate_Status:"Promoted"},{Test_Run_ID:"test"},{Promoted_Content_Record_ID:"rec32345678901234"}])
    assert.throws(()=>assertAutomaticPhotoWaitExisting(env,existingAuth,{...record,fields:{...record.fields,...fields}},marker,payload));
  assert.throws(()=>assertAutomaticPhotoWaitExisting(env,existingAuth,record,{profile_id:"rec32345678901234"},payload));
  assert.throws(()=>assertAutomaticPhotoWaitExisting(env,{permissions:{ideas_promote:true}},record,marker,payload));
  assert.throws(()=>assertAutomaticPhotoWaitExisting(env,existingAuth,record,marker,{...payload,photo_wait:false}));
});

test("existing EZ automatic photo wait checks exact saved Idea and avoids opening the Manage drawer",()=>{
  const app=readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
  const wizard=app.slice(app.indexOf("async function finishEzWizard("),app.indexOf("function drainPendingMasterUploads("));
  const path=wizard.slice(wizard.indexOf("let automaticExisting = false;"));
  assert.match(path,/automatic_photo_wait_existing_enabled/);
  assert.match(path,/automatic_photo_wait_existing: \{ profile_id: profile \}/);
  const receipt=path.slice(path.indexOf("if (automaticExisting) {"),path.indexOf("updateIdeaDrawer(result.record || idea)"));
  assert.match(receipt,/result\.waiting !== true/);
  assert.match(receipt,/Approval Factory/);
  assert.match(receipt,/return;/);
  assert.doesNotMatch(receipt,/openIdeaDrawer/);
  const worker=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const promote=worker.slice(worker.indexOf("export async function promoteIdeaViaI3I4("),worker.indexOf("/*__STUDIO_WORKER_END:promoteIdeaViaI3I4__*/"));
  assert.ok(promote.indexOf("assertAutomaticPhotoWaitExisting(")>0);
  assert.ok(promote.indexOf("assertAutomaticPhotoWaitExisting(")<promote.indexOf("approveIdeaAndWaitForPhotos("));
});
