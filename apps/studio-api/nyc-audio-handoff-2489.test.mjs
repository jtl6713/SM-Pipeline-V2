import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const worker = fs.readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const phase6 = fs.readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
const f = (row, key) => row?.fields?.[key];
function extract(source, name, context = {}) {
  const prefix = source.includes("export async function " + name + "(") ? "export async function "
    : source.includes("export function " + name + "(") ? "export function " : "function ";
  const start = source.indexOf(prefix + name + "(");
  assert.ok(start >= 0, "missing " + name);
  const after = source.slice(start).replace(/^export /, "");
  // Follow the function's balanced JavaScript braces; our excerpts contain
  // strings and templates, so use the explicit generated Worker boundary.
  const marker = "/*__STUDIO_WORKER_END:" + name + "__*/";
  if (source.includes(marker, start)) {
    const end = source.indexOf(marker, start);
    return vm.runInNewContext("(" + source.slice(start, end).replace(/^export /, "") + ")", context);
  }
  // Phase6 functions have no Worker marker; use their next named declaration.
  const next = after.search(/\n(?:export )?(?:async )?function [A-Za-z0-9_]+\(/);
  assert.ok(next > 0, "cannot find end of " + name);
  return vm.runInNewContext("(" + after.slice(0, next).trim() + ")", context);
}

test("#2489: request Yes survives missing Phase6 voiceover setting; explicit No survives", () => {
  const resolve = extract(worker, "resolvedOutputTriState", {f});
  const req = {fields:{}}, contentIntent = "Yes";
  assert.equal(resolve({fields:{}}, "Voiceover_Mode_Override", req, "Voiceover_Mode", false, contentIntent), "Yes");
  assert.equal(resolve({fields:{Voiceover_Mode_Override:"No"}}, "Voiceover_Mode_Override", req, "Voiceover_Mode", true, contentIntent), "No");
  assert.equal(resolve({fields:{}}, "Voiceover_Mode_Override",
    {fields:{Voiceover_Mode:"Use Profile Default"}}, "Voiceover_Mode", false, contentIntent), "No");
  assert.equal(resolve({fields:{}}, "Voiceover_Mode_Override",
    {fields:{Voiceover_Mode:"No"}}, "Voiceover_Mode", true, contentIntent), "No");
});

test("#2489: effective full video retains 39.66-second narration; Stories default to music-only", async () => {
  const resolve = extract(worker, "resolvedOutputTriState", {f});
  const effectiveFn = extract(worker, "buildOutputWorkItemEffective", {
    f, resolvedOutputTriState:resolve,
    studioOutputRouteSpec:()=>({pipeline_family:"Video",content_type:"Vertical Short Video"}),
    outputEffectiveChoice:(_row,_override,req,key,def)=>f(req,key) || def,
    outputEffectiveNumber:(row,key,req,master,def)=>f(row,key) ?? f(req,master) ?? def,
    outputEffectiveText:(row,key,req,master)=>f(row,key)||f(req,master)||"",
    item4ResolvedVideoDurationSeconds:()=>30,
    resolvedThumbnailMode:()=>"Yes",
    resolveStudioRenderMusic:async()=>({record_id:"recLicensedMusic",url:"https://example.test/verified-music.mp3"}),
    studioIsFinishedPassthrough:()=>false,
    outputWorkItemIssues:()=>[],
  });
  const req={fields:{Background_Music_Mode:"Yes",Video_Duration_Seconds:30}};
  const parent={fields:{Include_Voiceover:"Yes",Include_Background_Music:"Yes",
    Voiceover_Status:"Generated",Voiceover_URL:"https://example.test/existing-vo.mp3",
    Voiceover_Duration_Seconds:39.66}};
  const defaults={include_voiceover:false,include_background_music:false,include_thumbnail:true,
    default_duration:30,default_video_clip_count:6,default_carousel_slide_count:5,default_carousel_image_mode:"Make AI Generated"};
  const full=await effectiveFn({}, {fields:{Platform:"TikTok",Output_Type:"Video Draft"}}, req, parent, defaults);
  assert.equal(full.voiceover_mode,"Yes");
  assert.equal(full.background_music_mode,"Yes");
  assert.ok(full.video_duration_seconds >= 40);
  assert.ok(full.voiceover_duration_seconds >= 39.66);
  assert.equal(full.issues.length,0);
  const story=await effectiveFn({}, {fields:{Platform:"Instagram",Output_Type:"Story"}}, req, parent, defaults);
  assert.equal(story.voiceover_mode,"No");
  assert.equal(story.background_music_mode,"Yes");
  const explicit=await effectiveFn({}, {fields:{Platform:"Instagram",Output_Type:"Story",
    Voiceover_Mode_Override:"Yes",Background_Music_Mode_Override:"No"}},req,parent,defaults);
  assert.equal(explicit.voiceover_mode,"Yes");
  assert.equal(explicit.background_music_mode,"No");
});

test("#2489: R4 fails closed for missing VO, missing music, muted music and cut-off speech",()=>{
  const guard=extract(worker,"studioRenderAudioPreflight",{f});
  const fields={Studio_Effective_Voiceover_Mode:"Yes",Studio_Effective_Background_Music_Mode:"Yes",
    Voiceover_URL:"https://example.test/existing-vo.mp3",Voiceover_Duration_Seconds:39.66,
    Render_Total_Frames:1203,Music_URL:"https://example.test/verified-music.mp3",Music_Volume:0.13};
  const row={fields};
  assert.equal(guard(row),null);
  assert.equal(guard({fields:{...fields,Voiceover_URL:""}}),"voiceover_missing");
  assert.equal(guard({fields:{...fields,Render_Total_Frames:900}}),"voiceover_exceeds_video");
  assert.equal(guard({fields:{...fields,Music_URL:""}}),"background_music_missing");
  assert.equal(guard({fields:{...fields,Music_Volume:0}}),"background_music_muted");
  assert.equal(guard({fields:{...fields,Studio_Effective_Voiceover_Mode:"No", Voiceover_URL:"",
    Voiceover_Duration_Seconds:0,Render_Total_Frames:300}}),null);
});

test("#2489: Story music is not stripped at platform output seed",()=>{
  const start=worker.indexOf("export function platformOutputSeedFields(");
  const end=worker.indexOf("/*__STUDIO_WORKER_END:platformOutputSeedFields__*/",start);
  assert.ok(start>=0&&end>start);
  const seed=worker.slice(start,end);
  assert.match(seed,/Music_Volume: studioIsFinishedPassthrough\(requestRecord\)/);
  assert.match(seed,/Music_URL: studioIsFinishedPassthrough\(requestRecord\)/);
  assert.doesNotMatch(seed,/sourcePackage\?\.story_teaser \|\| studioIsFinishedPassthrough\(requestRecord\)/);
});

test("#2489: PRO sparse override projection preserves explicit Story audio directives",()=>{
  assert.match(phase6,/"effective_resolution",/);
  assert.match(phase6,/PRO_AUDIO_OVERRIDE_FIELDS/);
  assert.match(phase6,/PRO audio override readback unavailable/);
  const keys=["Voiceover_Mode_Override","Background_Music_Mode_Override",
    "Video_Duration_Seconds_Override","Voiceover_Duration_Seconds",
    "Music_Start_Seconds","Voiceover_Tail_Seconds_Override","Selected_Music_Asset_Override"];
  const map=extract(phase6,"mapPlanScheduleRow",{
    PRO_AUDIO_OVERRIDE_FIELDS:keys,checkboxOn:Boolean,recordLinkIds:values=>values||[],
  });
  const stored=map({id:"recExample1234567",fields:{
    Platform:"Instagram",Output_Type:"Story",Voiceover_Mode_Override:"No",
    Background_Music_Mode_Override:"Yes"}},{partial:true});
  assert.equal(stored.effective_resolution.Voiceover_Mode_Override,"No");
  assert.equal(stored.effective_resolution.Background_Music_Mode_Override,"Yes");
  const read=extract(phase6,"airtableShapedProOutputFromSupabase",{PRO_AUDIO_OVERRIDE_FIELDS:keys});
  const back=read({airtable_record_id:stored.airtable_record_id,platform:"Instagram",
    output_type:"Story",enabled:true,effective_resolution:stored.effective_resolution});
  assert.equal(back.fields.Voiceover_Mode_Override,"No");
  assert.equal(back.fields.Background_Music_Mode_Override,"Yes");
});

test("#2489: full request JSONB writer retains exact script and audio master intent",()=>{
  const map=extract(phase6,"mapAirtableProductionRequestToSupabase",{
    selectName:x=>x,firstLink:x=>Array.isArray(x)?x[0]:null,
    isPlainObject:x=>x!==null&&typeof x==="object"&&!Array.isArray(x),
  });
  const result=map({id:"rec0t4shEtd72MeD8",fields:{
    Request_Status:"Ready",Voiceover_Mode:"Yes",Background_Music_Mode:"Yes",
    Script_Mode:"Force exact",Requested_Script:"Do not replace exact script",
    Voiceover_Duration_Seconds:39.66,Video_Duration_Seconds:30}});
  assert.equal(result.publish_status.Voiceover_Mode,"Yes");
  assert.equal(result.publish_status.Background_Music_Mode,"Yes");
  assert.equal(result.publish_status.Script_Mode,"Force exact");
  assert.equal(result.publish_status.Requested_Script,"Do not replace exact script");
  assert.equal(result.publish_status.Voiceover_Duration_Seconds,39.66);
  assert.equal(result.publish_status.Video_Duration_Seconds,30);
});
