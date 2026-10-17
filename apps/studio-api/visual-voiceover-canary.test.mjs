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
  assert.deepEqual(rollout.canary_output_ids, []);

  const gateStart = functions.indexOf("export function phase6VisualTimelineEnabledForOutput");
  const gateEnd = functions.indexOf("/*__STUDIO_WORKER_END:phase6VisualTimelineEnabledForOutput__*/", gateStart);
  assert.ok(gateStart >= 0 && gateEnd > gateStart);
  const gate = functions.slice(gateStart, gateEnd);
  assert.match(gate, /if \(!Boolean\(f\(outputRecord, "Do_Not_Publish"\)\)\) return false;/);
  assert.match(gate, /STUDIO_VISUAL_CANARY_OUTPUT_IDS/);
});
