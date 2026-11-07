import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const app = fs.readFileSync(new URL("./assets/story-first-workspace.js", import.meta.url), "utf8");
const lib = fs.readFileSync(new URL("../studio-api/worker-functions-03.mjs", import.meta.url), "utf8");
const start = app.indexOf("  function savedIdeaMatches(");
const end = app.indexOf("  async function openAssetManager() {");
assert.ok(start >= 0 && end > start, "Real production save functions are available");
const saveFunctions = app.slice(start, end);
const profile = "recChicago123", id = "recIdea123";
function scene() {
  return { time:"0-30", visual:"Chicago skyline at sunrise", voiceover:"Good morning Chicago",
    media:"still", decision:"library", candidate_asset_id:null, assigned_asset_id:"recAsset123",
    selected_approved:true, media_override:false, ai_prompt:"Chicago skyline portrait",
    capture_note:"", generated_master_id:null, accepted_generated_master_id:null, rejected_ai_ids:[] };
}
function storyboard() {
  return {schema:"story-first.1",profile_id:profile,target_seconds:30,scenes:[scene()]};
}
function savedRecord() {
  return {id,candidate_id:"4268",title:"Chicago Sunrise",summary:"Chicago sunrise video",
    story_first:storyboard()};
}
function harness(handler, refreshHandler = async () => {}) {
  const status = [], logs = [], button = {disabled:false};
  const current = {record:{id},story:storyboard(),profile,title:"Chicago Sunrise",summary:"Chicago sunrise video",busy:false};
  const report = (message,error=false) => status.push({message,error});
  const locals = {};
  const context = new Function("$","current","readForm","assertProfile","report","call",
    "storyNotesFromRecord","localStorage","refresh","console",
    saveFunctions+";return {save,savedIdeaMatches};");
  const api = context(key => key==="storyFirstSave"?button:null,current,()=>current.story,
    ()=>profile,report,handler,record=>record?.story_first,{setItem:(key,value)=>locals[key]=value},
    refreshHandler,{warn:(...args)=>logs.push(args)});
  return { ...api,current,status,button,logs,locals };
}

test("confirmed Airtable save remains success when secondary saved-Ideas refresh is aborted",async()=>{
  const h=harness(async (path,options) => {
    assert.equal(options?.method,"PATCH");
    return {record:savedRecord()};
  },async()=>{throw new Error("Fetch is aborted");});
  const saved=await h.save();
  await Promise.resolve();
  assert.equal(saved.id,id);
  assert.equal(h.status.at(-1).error,false);
  assert.match(h.status.at(-1).message,/Saved to Airtable/);
  assert.equal(h.button.disabled,false);
  assert.equal(h.locals["studio.story_first_resume."+profile],id);
});

test("aborted PATCH is reconciled read-only and counted as saved only with full storyboard match",async()=>{
  const calls=[];
  const h=harness(async (path,options)=>{
    calls.push(options?.method||"GET");
    if(options?.method==="PATCH")throw new Error("Fetch is aborted");
    return {record:savedRecord()};
  });
  const saved=await h.save();
  assert.equal(saved.id,id);
  assert.deepEqual(calls,["PATCH","GET"]);
  assert.match(h.status.at(-1).message,/Verified after connection interruption/);
  assert.equal(h.status.at(-1).error,false);
});

test("aborted PATCH with changed or unavailable Airtable read-back is not falsely declared saved",async()=>{
  const h=harness(async (_path,options)=>{
    if(options?.method==="PATCH")throw new Error("Fetch is aborted");
    const old=savedRecord();
    old.story_first.scenes[0].voiceover="Old voiceover";
    return {record:old};
  });
  await assert.rejects(h.save(),/Save was not confirmed/);
  assert.equal(h.current.record.id,id);
  assert.equal(h.button.disabled,false);
  assert.equal(h.status.some(entry=>/Saved to Airtable/.test(entry.message)),false);
});

test("asset label rehydrates exact Airtable asset names on reopen instead of showing IDs",()=>{
  assert.match(app,/void loadSelectedAssetNames\(\)/);
  assert.match(app,/&ids=/);
  assert.match(app,/asset\.content_profile_id !== profile/);
  assert.match(app,/current\.selectedAssetNames\[chosen\.id\]/);
  assert.doesNotMatch(app,/Selected Media Asset: "\+chosen\.id/);
  assert.match(lib,/const requestedIds = parseLibraryRecordIdsParam\(url\.searchParams\.get\("ids"\)\)/);
});
