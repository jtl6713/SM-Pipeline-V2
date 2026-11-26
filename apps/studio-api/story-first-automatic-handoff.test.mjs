import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {queueApprovedStoryFirst,approvedStoryHandoffNotes,storyHandoffMatches,
  storyFirstAutomaticHandoffEnabled,hasStoryHandoffApproval} from "./story-first-automatic-handoff.mjs";
const id=n=>"rec"+String(n).padStart(14,"0");
const idea={id:id(1),fields:{Studio_Production_Mode:"automatic",Studio_Production_Source:"script_a_short",
 Candidate_Status:"Generated",Content_Profile:[id(2)]}};
const story={profile_id:id(2),target_seconds:20,scenes:[{assigned_asset_id:id(3),time:"0-10",voiceover:"First scene",visual:"Fountain",media:"video",on_screen_text:"Chicago"},
 {assigned_asset_id:id(4),time:"10-20",voiceover:"Second scene",visual:"Skyline",media:"photo",voiceover_instagram:"At night"}]};
const approved={story,ids:[id(3),id(4)]};
const exact={schema:"story-first-production.1",profile_id:story.profile_id,target_seconds:story.target_seconds,
 scenes:story.scenes.map(s=>({...s,asset_id:s.assigned_asset_id}))};
const notes="[story-first-production.1] "+JSON.stringify(exact);
const draft={id:id(5),fields:{Idea_Candidate:[idea.id],Request_Status:"Draft",Production_Notes:notes}};
const flags={STUDIO_PRODUCTION_MODE_CAPTURE:"true",STUDIO_PRODUCTION_MODE_ROUTING:"true",
 STUDIO_PRODUCTION_EDITOR_GUARD:"true",STUDIO_STORYBOARD_AUTO_HANDOFF:"true"};
function harness({source=idea,existing=[],job=null,verify=approved,loaded=draft,verified=draft}={}) {
  const calls=[];
  return {calls,args:{idea:source,verifyStory:async()=>{calls.push("verifyStory");return verify;},
    listRequests:async()=>{calls.push("listRequests");return existing;},
    loadRequest:async()=>{calls.push("loadRequest");return loaded;},
    readJob:async()=>{calls.push("readJob");return job;},
    createDraft:async()=>{calls.push("createDraft");return draft;},
    verifyDraft:async()=>{calls.push("verifyDraft");return verified;},
    commitRequestApproval:async(d,n)=>{calls.push("commitRequestApproval");return {...d,fields:{...d.fields,Production_Notes:n}};},
    commitIdeaAcceptance:async(i)=>{calls.push("commitIdeaAcceptance");return {...i,fields:{...i.fields,Candidate_Status:"Approved"}};},
    enqueue:async(i,p)=>{calls.push("enqueue");assert.equal(i,idea.id);assert.equal(p,story.profile_id);return {status:"queued"};}}};
}
test("handoff activation requires capture, routing, editor guard and dedicated flag",()=>{
  assert.equal(storyFirstAutomaticHandoffEnabled({}),false);
  assert.equal(storyFirstAutomaticHandoffEnabled(flags),true);
  for(const key of Object.keys(flags))assert.equal(storyFirstAutomaticHandoffEnabled({...flags,[key]:"false"}),false);
});
test("exact approved scenes and narration retained; routing metadata is idempotent and never truncated",()=>{
  const n=approvedStoryHandoffNotes(notes);
  assert.equal(approvedStoryHandoffNotes(n),n);
  assert.ok(n.includes(notes));
  assert.ok(n.includes("ez-photo-wait=off"));
  assert.ok(hasStoryHandoffApproval({fields:{Production_Notes:n}}));
  assert.throws(()=>approvedStoryHandoffNotes(""),/missing/);
  assert.throws(()=>approvedStoryHandoffNotes(notes+"\n"+notes),/ambiguous/);
  assert.throws(()=>approvedStoryHandoffNotes("x".repeat(10000)+"\n"+notes),/limit/);
  assert.equal(storyHandoffMatches(draft,approved),true);
  const altered={...exact,scenes:exact.scenes.map((s,i)=>i===0?{...s,voiceover:"Wrong script"}:s)};
  assert.equal(storyHandoffMatches({...draft,fields:{...draft.fields,Production_Notes:"[story-first-production.1] "+JSON.stringify(altered)}},approved),false);
});
test("explicit storyboard approval validates actual source before create, commits exact notes and acceptance before queue",async()=>{
  const {args,calls}=harness();
  const receipt=await queueApprovedStoryFirst(args);
  assert.deepEqual(calls,["verifyStory","listRequests","readJob","createDraft","verifyDraft","commitRequestApproval","commitIdeaAcceptance","enqueue"]);
  assert.deepEqual(receipt,{queued:true,idea_id:idea.id,production_request_id:draft.id,job_status:"queued",publishing:false,requires_factory_approval:true});
});
test("wrong source, incomplete scene, ambiguous request or changed creative directives cannot queue",async()=>{
  for(const options of [
    {source:{...idea,fields:{...idea.fields,Studio_Production_Source:"idea"}}},
    {source:{...idea,fields:{...idea.fields,Studio_Production_Mode:"manual"}}},
    {verify:null},{existing:null},{existing:[draft,{id:id(6)}]},
    {existing:[draft],loaded:{...draft,fields:{...draft.fields,Idea_Candidate:[id(6)]}}},
    {verified:{...draft,fields:{...draft.fields,Production_Notes:"bad"}}}
  ]) {
    const {args,calls}=harness(options);
    await assert.rejects(()=>queueApprovedStoryFirst(args));
    assert.ok(!calls.includes("commitRequestApproval")&&!calls.includes("enqueue"),JSON.stringify(options));
  }
});
test("retry of committed exact storyboard never recreates or replaces media",async()=>{
  const accepted={...idea,fields:{...idea.fields,Candidate_Status:"Approved"}};
  const saved={...draft,fields:{...draft.fields,Production_Notes:approvedStoryHandoffNotes(notes)}};
  const {args,calls}=harness({source:accepted,existing:[draft],loaded:saved,job:{status:"claimed"}});
  const receipt=await queueApprovedStoryFirst(args);
  assert.equal(receipt.already_accepted,true);
  assert.equal(receipt.job_status,"claimed");
  assert.deepEqual(calls,["verifyStory","listRequests","loadRequest","readJob"]);
});
test("partial acceptance recovers without changing exact committed storyboard",async()=>{
  const saved={...draft,fields:{...draft.fields,Production_Notes:approvedStoryHandoffNotes(notes)}};
  const {args,calls}=harness({existing:[draft],loaded:saved});
  const receipt=await queueApprovedStoryFirst(args);
  assert.equal(receipt.already_accepted,true);
  assert.deepEqual(calls,["verifyStory","listRequests","loadRequest","readJob","commitIdeaAcceptance","enqueue"]);
});
test("existing unowned durable job cannot be revived or duplicated",async()=>{
  const {args,calls}=harness({existing:[draft],job:{status:"claimed"}});
  await assert.rejects(()=>queueApprovedStoryFirst(args),/reconciled/);
  assert.ok(!calls.includes("verifyDraft")&&!calls.includes("enqueue"));
});
test("Worker dedicated route is authorized, locked and sends only to governed queue",()=>{
  const root=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const route=root.slice(root.indexOf("if (storyboardHandoffMatch)"),root.indexOf("if (isIdeaProductionRequestRoute) {"));
  assert.match(route,/requirePermission\(authorization,"ideas_promote"\)/);
  assert.match(route,/requirePermission\(authorization,"production_configure"\)/);
  assert.match(route,/withOutputApprovalLock/);
  const code=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const handler=code.slice(code.indexOf("export async function approveStoryFirstAutomaticHandoff("),code.indexOf("export async function getOrCreateProductionRequestForIdea("));
  assert.match(handler,/payload\.approve_storyboard!==true/);
  assert.match(handler,/verifiedStoryFirstProduction/);
  assert.match(handler,/ensureStoryFirstProductionMedia/);
  assert.match(handler,/readyProductionEnqueue/);
  assert.doesNotMatch(handler,/promoteProductionRequestViaI3I4|publishNow|scheduleReservation/);
});

test("browser capability requires the real storyboard flag and both route permissions",()=>{
  const root=readFileSync(new URL("./worker.js",import.meta.url),"utf8");
  const cap=root.slice(root.indexOf('if (url.pathname === "/api/production-mode/capabilities")'),root.indexOf("if (dedicatedRoute)",root.indexOf('if (url.pathname === "/api/production-mode/capabilities")')));
  assert.match(cap,/storyboard_auto_handoff_enabled: storyFirstAutomaticHandoffEnabled\(env\) &&\s*authorization\.permissions\?\.ideas_promote === true && authorization\.permissions\?\.production_configure === true/);
  assert.match(cap,/request\.method !== "GET"/);
});
