import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("./assets/story-first-workspace.js",import.meta.url),"utf8");
const handler=source.slice(source.indexOf('$("storyFirstProduction")?.addEventListener("click"'),source.indexOf("// Script a Short is the only user-facing idea-first entry point."));
const automatic=handler.slice(handler.indexOf("if (automatic) {"),handler.indexOf("// Legacy route only"));

test("storyboard handoff uses authenticated capabilities and rejects unavailable route under editor guard",()=>{
  assert.match(handler,/call\("\/api\/production-mode\/capabilities"/);
  assert.match(handler,/caps\.storyboard_auto_handoff_enabled === true/);
  assert.match(handler,/!automatic && caps\.ordinary_editor_boundary_enabled === true/);
  assert.ok(handler.indexOf("caps?.ok !== true")<handler.indexOf("await save()"));
});

test("automatic storyboard validates saved source, approved scene count and explicit confirmation",()=>{
  assert.match(automatic,/record\.production_mode !== "automatic"/);
  assert.match(automatic,/record\.production_source !== "script_a_short"/);
  assert.match(automatic,/selectedCount\(\) !== count/);
  assert.match(automatic,/if \(!confirm\(/);
  assert.match(automatic,/\/storyboard-handoff\?profile=/);
  assert.match(automatic,/JSON\.stringify\(\{ approve_storyboard: true \}\)/);
  assert.match(automatic,/receipt\.idea_id !== record\.id/);
  assert.match(automatic,/receipt\.publishing !== false/);
  assert.match(automatic,/receipt\.queued === true/);
  assert.doesNotMatch(automatic,/StudioOpenProductionRequestById|productionNav|\/production-request\?profile/);
  assert.match(automatic,/return;\s*\}\s*$/);
});

test("handoff click is serialized and never falls back after an ambiguous automatic response",()=>{
  assert.match(handler,/if \(storyboardHandoffBusy \|\| current\.busy\) return/);
  assert.match(handler,/storyboardHandoffBusy = true/);
  assert.match(handler,/finally \{\s*storyboardHandoffBusy = false/);
  assert.match(handler,/assertProfile\(\) !== targetProfile/);
  assert.match(automatic,/Check the saved Idea and Factory before retrying/);
  assert.match(handler,/catch \(error\) \{ report\(error\.message, true\); \}/);
  assert.match(source,/handoff\.disabled=selected!==scenes\.length\|\|storyboardHandoffBusy/);
});
