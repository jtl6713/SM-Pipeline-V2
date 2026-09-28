from pathlib import Path

worker_path = Path("apps/studio-api/worker.js")
worker = worker_path.read_text()

old = '''  const music = await productionRequestPreferredMusic(env, requestRecord);
  const appliedAt = new Date().toISOString();
  const snapshot = productionRequestDirectiveSnapshot(requestRecord, music);

  const fields = {
'''
new = '''  const music = await productionRequestPreferredMusic(env, requestRecord);
  const appliedAt = new Date().toISOString();
  const snapshot = productionRequestDirectiveSnapshot(requestRecord, music);
  const existingContentItem = await airtableFetch(env, env.AIRTABLE_CONTENT_TABLE_ID, contentItemId);
  const requestedScriptMode = String(f(requestRecord, "Script_Mode") || "AI decides").trim();
  const requestedScript = String(f(requestRecord, "Requested_Script") || "").trim();
  const previousRequestedScriptMode = String(f(existingContentItem, "Requested_Script_Mode") || "").trim();
  const previousRequestedScript = String(f(existingContentItem, "Requested_Script") || "").trim();
  const previousVoiceoverScript = String(f(existingContentItem, "Voiceover_Script") || "").trim();
  const exactScriptChanged = requestedScriptMode === "Force exact"
    && Boolean(requestedScript)
    && (
      previousRequestedScriptMode !== "Force exact"
      || previousRequestedScript !== requestedScript
      || previousVoiceoverScript !== requestedScript
    );

  const fields = {
'''
if worker.count(old) != 1:
    raise SystemExit(f"Expected one directive-sync anchor, found {worker.count(old)}")
worker = worker.replace(old, new)

anchor = '''    Production_Request_Applied_At: appliedAt,
  };

  const requestedVoice = requestedVoiceFromProductionRequest(requestRecord);
'''
replacement = '''    Production_Request_Applied_At: appliedAt,
  };

  // Force exact is execution authority, not merely descriptive metadata. If the
  // exact request changed after P2 already generated audio, discard that stale
  // audio so P2 must synthesize the saved exact script before any render can run.
  if (requestedScriptMode === "Force exact" && requestedScript) {
    fields.Voiceover_Script = requestedScript;
    fields.Script_Status = "Generated";
    if (item4StudioDirectiveYes(f(requestRecord, "Voiceover_Mode"))) {
      fields.Voiceover_Status = "Ready";
      fields.Content_Status = "Ready for Voiceover";
    }
    if (exactScriptChanged && String(f(existingContentItem, "Voiceover_URL") || "").trim()) {
      fields.Voiceover_URL = null;
      fields.Voiceover_Google_Drive_File_ID = null;
      fields.Voiceover_Normalization_Status = null;
      fields.Voiceover_Normalization_Details = null;
      fields.Voiceover_Normalized_At = null;
      fields.Voiceover_Duration_Seconds = null;
    }
  }

  const requestedVoice = requestedVoiceFromProductionRequest(requestRecord);
'''
if worker.count(anchor) != 1:
    raise SystemExit(f"Expected one field anchor, found {worker.count(anchor)}")
worker = worker.replace(anchor, replacement)

old_version = 'version: "0.10.422-unlimited-production-slides"'
new_version = 'version: "0.10.423-force-exact-voiceover-authority"'
if worker.count(old_version) != 1:
    raise SystemExit(f"Expected one Worker version marker, found {worker.count(old_version)}")
worker = worker.replace(old_version, new_version)
worker_path.write_text(worker)

for test_path in Path("apps/studio-api").glob("*.test.mjs"):
    text = test_path.read_text()
    text = text.replace(r'0\.10\.422-unlimited-production-slides', r'0\.10\.423-force-exact-voiceover-authority')
    text = text.replace('0.10.422-unlimited-production-slides', '0.10.423-force-exact-voiceover-authority')
    test_path.write_text(text)

test_path = Path("apps/studio-api/force-exact-voiceover-authority.test.mjs")
test_path.write_text(r'''import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Force exact Production script invalidates stale generated voiceover", async () => {
  const worker = await readFile(path.join(here, "worker.js"), "utf8");
  const start = worker.indexOf("async function syncProductionRequestDirectivesToContentItem");
  const end = worker.indexOf("async function syncProductionRequestDirectivesRoute", start);
  assert.ok(start >= 0 && end > start);
  const handler = worker.slice(start, end);
  assert.match(handler, /requestedScriptMode === "Force exact"/);
  assert.match(handler, /fields\.Voiceover_Script = requestedScript/);
  assert.match(handler, /fields\.Script_Status = "Generated"/);
  assert.match(handler, /fields\.Voiceover_URL = null/);
  assert.match(handler, /fields\.Voiceover_Google_Drive_File_ID = null/);
  assert.match(handler, /previousRequestedScript !== requestedScript/);
  assert.match(handler, /previousVoiceoverScript !== requestedScript/);
});
''')

deploy = Path("deploy/cloudflare-worker-production.txt")
marker = "Worker: 0.10.423-force-exact-voiceover-authority"
current = deploy.read_text()
if marker not in current:
    deploy.write_text(current + """

Deploy Studio API Worker production
Reason: Force exact narration is execution authority; invalidate stale P2 audio when saved exact script changes and make canonical Voiceover_Script match Production
Worker: 0.10.423-force-exact-voiceover-authority
Requested: 2026-09-28
""")
