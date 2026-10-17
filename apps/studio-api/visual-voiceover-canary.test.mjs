import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("visual voiceover canary seed is tenant-admin only and nonpublishing", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const functions = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");

  assert.match(worker, /\/api\/admin\/visual-voiceover-canary/);
  assert.match(worker, /requirePermission\(authorization, "tenant_admin"\)/);
  assert.match(worker, /studioPrepareVisualVoiceoverCanary\(request, env\)/);

  assert.match(functions, /confirm=prepare-nonpublishing-canary/);
  assert.match(functions, /\{Test_Run_ID\}!=""|\{Test_Run_ID\}!=""/);
  assert.match(functions, /Published_At\}=BLANK\(\)/);
  assert.match(functions, /Platform_Post_ID\}=BLANK\(\)/);
  assert.match(functions, /Do_Not_Publish: true/);
  assert.match(functions, /Auto_Publish_Enabled: false/);
  assert.match(functions, /Publish_Status: "Not Ready"/);
  assert.match(functions, /"Carousel Slides"/);
  assert.match(functions, /if \(!linkedSlideIds\.length\) continue/);
  assert.match(functions, /No unpublished test output with a trimmable video scene/);
  assert.match(functions, /Canary inspection is limited to Do_Not_Publish test outputs/);
});


test("production rollout remains fail-closed to nonpublishing outputs", async () => {
  const functions = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  const rollout = JSON.parse(
    await readFile(path.join(here, "..", "..", "deploy", "visual-voiceover-production-rollout.json"), "utf8")
  );

  assert.equal(rollout.enabled, true);
  assert.equal(rollout.timeline_enabled, true);
  assert.equal(rollout.script_enabled, true);
  assert.equal(rollout.scope, "do_not_publish_only");
  assert.deepEqual(rollout.canary_output_ids, ["recL2zjZc7XGRJyRt"]);

  const gateStart = functions.indexOf("export function phase6VisualTimelineEnabledForOutput");
  const gateEnd = functions.indexOf("/*__STUDIO_WORKER_END:phase6VisualTimelineEnabledForOutput__*/", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gate = functions.slice(gateStart, gateEnd);
  assert.match(gate, /if \(!Boolean\(f\(outputRecord, "Do_Not_Publish"\)\)\) return false;/);
  assert.match(gate, /phase6VisualCanaryOutputIds\(env\)/);
});


test("canary inspection exposes revision parity evidence without publishing authority", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const functions = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(worker, /studio_visual_voiceover_canary_v1:\s*true/);
  assert.match(functions, /action === "inspect"/);
  assert.match(functions, /Canary inspection is limited to Do_Not_Publish test outputs/);
  assert.match(functions, /current_revision:/);
  assert.match(functions, /manifest_revision:/);
  assert.match(functions, /props_revision:/);
  assert.match(functions, /studio_preview_url:/);
  assert.match(functions, /final_file_url:/);
});


test("dedicated production rollout allowlist targets only the nonpublishing canary", async () => {
  const rollout = JSON.parse(await readFile(path.join(here, "../../deploy/visual-voiceover-production-rollout.json"), "utf8"));
  assert.equal(rollout.scope, "do_not_publish_only");
  assert.equal(rollout.enabled, true);
  assert.equal(rollout.timeline_enabled, true);
  assert.equal(rollout.script_enabled, true);
  assert.deepEqual(rollout.canary_output_ids, ["recL2zjZc7XGRJyRt"]);
});


test("deployment gate rejects a broad or malformed canary rollout", async () => {
  const workflow = await readFile(path.join(here, "../../.github/workflows/deploy-cloudflare-worker-production.yml"), "utf8");
  assert.match(workflow, /len\(canary_ids\)!=1/);
  assert.match(workflow, /re\.fullmatch\(r'rec\[A-Za-z0-9\]\{14\}'/);
  assert.match(workflow, /Enabled visual voiceover rollout requires exactly one Airtable canary record id/);
  assert.match(workflow, /STUDIO_VISUAL_CANARY_OUTPUT_IDS':','\.join\(canary_ids\)/);
});


test("production canary must already be Do_Not_Publish before preparation", async () => {
  const functions = await readFile(path.join(here, "worker-functions-03.mjs"), "utf8");
  assert.match(functions, /if \(!Boolean\(f\(row, "Do_Not_Publish"\)\)\) continue/);
});


test("production canary proves baseline TTS reuse before final rerender", async () => {
  const workflow = await readFile(path.join(here, "../../.github/workflows/visual-voiceover-production-canary.yml"), "utf8");
  assert.match(workflow, /Generate baseline TTS and capture reusable scene audio/);
  assert.match(workflow, /baseline_scene_tts=PASS/);
  assert.match(workflow, /changed scene retained stale TTS URL after narration acceptance/);
  assert.match(workflow, /did not retain its baseline TTS URL/);
  assert.match(workflow, /selective_tts_reuse=PASS/);
  assert.match(workflow, /canary-reuse\.json/);
});
