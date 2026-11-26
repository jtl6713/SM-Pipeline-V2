import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import vm from "node:vm";

const app=readFileSync(new URL("./assets/app-item4-1008.js",import.meta.url),"utf8");
const html=readFileSync(new URL("./index.html",import.meta.url),"utf8");
const code=app.slice(app.indexOf("function ordinaryIdeaEditorAllowed("),app.indexOf("function updateIdeaDrawer("));
const active={ok:true,ordinary_editor_boundary_enabled:true};
const legacy={ok:true,ordinary_editor_boundary_enabled:false};

test("ordinary editor is manual-only under guard, legacy compatible while explicitly off, and fails closed on unknown capabilities",()=>{
  const ctx={};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  for(const idea of [null,{}, {production_mode:"automatic",production_source:"idea"},
    {production_mode:"manual",production_source:"script_a_short"},
    {production_mode:"automatic",production_source:"finished_video"}])
    assert.equal(ctx.ordinaryIdeaEditorAllowed(idea,active),false);
  const manual={production_mode:"manual",production_source:"idea"};
  assert.equal(ctx.ordinaryIdeaEditorAllowed(manual,active),true);
  assert.equal(ctx.ordinaryIdeaEditorAllowed({},legacy),true);
  for(const caps of [null,{}, {ok:true}, {ok:false,ordinary_editor_boundary_enabled:false}])
    assert.equal(ctx.ordinaryIdeaEditorAllowed(manual,caps),false);
});

test("automatic Idea drawer hides intermediate editor controls but retains direct upload",()=>{
  const controls=new Map();
  const ctx={ordinaryEditorGuardActive:true,$:id=>{
    if(!controls.has(id))controls.set(id,{hidden:false,disabled:false});
    return controls.get(id);
  }};
  vm.createContext(ctx);vm.runInContext(code,ctx);
  ctx.syncOrdinaryIdeaModeControls({production_mode:"automatic",production_source:"idea"});
  for(const id of ["configureProductionButton","openIdeaProductionButton","createIdeaTimelineButton","useExistingLibraryButton","ideaLibraryContinueButton"])
    assert.equal(controls.get(id).hidden,true);
  assert.match(controls.get("ideaProductionModeHint").textContent,/Approval Factory/);
  assert.equal(controls.has("ideaDirectUploadInput"),false);
  assert.match(html,/id="ideaDirectUploadInput"/);
  assert.match(html,/id="ideaProductionModeHint" role="status" hidden/);
});

test("editor, timeline and library entry paths verify fresh capability before performing work",()=>{
  const editor=app.slice(app.indexOf("async function openProductionRequestForIdea("),app.indexOf("window.StudioOpenProductionRequestById ="));
  const timeline=app.slice(app.indexOf("async function openOrCreateIdeaTimeline("),app.indexOf('$("createIdeaTimelineButton")?.addEventListener'));
  const library=app.slice(app.indexOf("async function openProductionRequestWithLibrary("),app.indexOf("async function openProductionRequestWithLibrary(")+1800);
  assert.ok(editor.indexOf("await requireOrdinaryIdeaEditor(idea)")>=0);
  assert.ok(editor.indexOf("await requireOrdinaryIdeaEditor(idea)")<editor.indexOf("loadEzAudioOptions()"));
  assert.ok(timeline.indexOf("await requireOrdinaryIdeaEditor(idea)")<timeline.indexOf("const entries"));
  assert.ok(timeline.includes("await requireOrdinaryIdeaEditor(idea)"));
  assert.ok(library.indexOf("await requireOrdinaryIdeaEditor(idea)")<library.indexOf("await Promise.all"));
  assert.ok(library.includes("await requireOrdinaryIdeaEditor(idea)"));
  assert.match(code,/api\("\/api\/production-mode\/capabilities", \{ timeoutMs: 8000, retries: 0 \}\)/);
  assert.match(code,/profile !== selectedProfileId/);
});
