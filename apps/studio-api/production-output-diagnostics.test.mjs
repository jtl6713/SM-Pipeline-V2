import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionOutputDiagnostic, productionDiagnosticsSummary } from "./production-output-diagnostics.mjs";
import { homeOutputInProduction } from "./profile-summary-classification.mjs";

const row = (output_id, patch = {}) => ({
  output_id, platform:"Instagram", studio_output_type:"Story", studio_state:"In Production",
  output_status:"In Production", render_status:"Waiting in Render Queue", ...patch,
});
test("exact Chicago cohort shows three queued and three blocked, no active-render claim", () => {
  const queued = [row(11306),row(11308),row(11353)];
  const blocked = [
    row(11352,{render_status:"Blocked",remotion_error_message:"Studio Story narration integrity guard: Story narration storage existence not safely resolved"}),
    row(11228,{render_status:"Blocked",remotion_error_message:"Studio Story narration integrity guard: Story narration preparation failed; reconcile its exact attempt"}),
    row(11229,{render_status:"Blocked",remotion_error_message:"Studio Story narration integrity guard: Story narration attempt already recorded on a sibling; reconcile before retrying paid generation"}),
  ];
  const outside = Array.from({length:12},(_,i)=>row(12000+i,{output_status:"Approved for Publishing",review_status:"Approved"}));
  const all = [...queued,...blocked,...outside];
  const diagnostics = productionDiagnosticsSummary(all.filter(homeOutputInProduction),all.length);
  assert.equal(diagnostics.total,18);
  assert.equal(diagnostics.remaining,6);
  assert.equal(diagnostics.outside_production,12);
  assert.deepEqual(diagnostics.counts,{queued:3,submitted:0,blocked:3,reconcile:0,preparing:0});
  assert.ok(diagnostics.outputs.every(o=>o.owner==="system"));
  assert.equal(diagnostics.outputs.find(o=>o.output_number===11352).reason,"Narration storage verification failed");
  assert.match(diagnostics.outputs.find(o=>o.output_number===11229).next_action,/Do not generate narration again/);
});
test("recorded job is not proof of live renderer; stale status needs reconciliation", () => {
  assert.equal(productionOutputDiagnostic(row(1,{render_status:"Rendering"})).state,"reconcile");
  assert.equal(productionOutputDiagnostic(row(2,{render_status:"Rendering",remotion_job_id:"internal-token"})).state,"submitted");
  assert.equal(productionOutputDiagnostic(row(3,{remotion_job_id:"internal-token"})).state,"reconcile");
  assert.equal(productionOutputDiagnostic(row(4,{final_file_url:"https://private.example/file"})).state,"reconcile");
});
test("only explicit revision evidence asks for user intervention", () => {
  assert.equal(productionOutputDiagnostic(row(5,{render_status:"Needs Changes"})).owner,"user");
  assert.equal(productionOutputDiagnostic(row(6,{render_status:"Blocked",remotion_error_message:"unknown"})).owner,"system");
});
test("raw provider errors and secret-bearing fields are not exposed", () => {
  const diagnostic = productionOutputDiagnostic(row(7,{render_status:"Blocked",remotion_error_message:"Bearer SECRET https://private.example/key",platform:"<img>",studio_output_type:"secret"}));
  assert.doesNotMatch(JSON.stringify(diagnostic),/SECRET|private\.example|<img>|secret/);
});
test("held, terminal, and test rows remain excluded from the Home-compatible Production count", () => {
  assert.equal([row(8,{do_not_publish:true}),row(9,{test_run_id:"x"}),row(10,{output_status:"Published"}),row(11,{output_status:"Failed"})].filter(homeOutputInProduction).length,0);
});
test("content endpoint and UI display exact same diagnostics without adding retry or publishing action", () => {
  const worker = readFileSync(new URL("./worker-functions-03.mjs",import.meta.url),"utf8");
  assert.match(worker,/production_diagnostics: productionDiagnosticsByContent/);
  assert.match(worker,/homeOutputInProduction\(mapped\)/);
  const ui = readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
  const markup=ui.slice(ui.indexOf("function productionDiagnosticMarkup("),ui.indexOf("function renderContentItemsTable("));
  assert.match(markup,/escapeHtml\(o\.reason/);
  assert.match(markup,/escapeHtml\(o\.next_action/);
  assert.match(markup,/System responsibility/);
  assert.doesNotMatch(markup,/method:\s*["']POST|publish-now|retry-render/);
  assert.match(ui,/r\.production_diagnostics,\s*r\.lifecycle_complete/);
});
