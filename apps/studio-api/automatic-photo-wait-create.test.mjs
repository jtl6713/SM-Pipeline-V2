import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {automaticPhotoWaitCreateEnabled,automaticPhotoWaitCreateFields} from "./automatic-photo-wait-create.mjs";

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
