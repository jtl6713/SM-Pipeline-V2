import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
const begin = source.indexOf("export function studioWritableTextMode(");
const end = source.indexOf("\n\nexport async function syncProductionRequestDirectivesToContentItem(", begin);
assert.ok(begin >= 0 && end > begin, "Airtable select compatibility guard must exist");
const functionSource = source.slice(begin, end).replace(/^export /, "");
const normalize = vm.runInNewContext(functionSource + "\nstudioWritableTextMode", { String });

test("Airtable Content Item and Platform Output text controls never get Leave blank", () => {
  assert.equal(normalize("Leave blank"), "AI decides");
  assert.equal(normalize("AI decides"), "AI decides");
  assert.equal(normalize("Force exact"), "Force exact");
  assert.equal(normalize("AI improve"), "AI improve");
  assert.equal(normalize(undefined), "AI decides");
  assert.equal(normalize("unexpected choice"), "AI decides");
});

test("all downstream text-mode select writes use the compatibility guard", () => {
  for (const field of ["Requested_Title_Mode", "Requested_Caption_Mode", "Requested_Script_Mode"]) {
    const assignments = [...source.matchAll(new RegExp(field + ":\\s*([^,\\n]+)", "g"))]
      .map(match => match[1].trim());
    // Two Content Item write sites: the parent directive bridge and child item fanout.
    assert.equal(assignments.length, 2, field + " must be guarded in both Content Item routes");
    assert.ok(assignments.every(value => value.startsWith("studioWritableTextMode(")), field + " must normalize all writes");
  }
  for (const field of ["Studio_Effective_Title_Mode", "Studio_Effective_Caption_Mode", "Studio_Effective_Script_Mode"]) {
    assert.match(source, new RegExp(field + ":\\s*studioWritableTextMode\\("));
  }
});

test("Vibe Cut retains no-voiceover directive and normalizes request Caption_Mode only", () => {
  assert.match(source, /Script_Mode: vibeCut \? "Leave blank" : input\.script_mode/);
  assert.match(source, /Voiceover_Mode: \(az \|\| vibeCut\) \? "No" : input\.voiceover_mode/);
  assert.match(source, /Caption_Mode: studioWritableTextMode\(input\.caption_mode\)/);
  // The original request directive remains authoritative in its JSON snapshot,
  // including when the downstream Airtable display select uses a safe equivalent.
  assert.match(source, /script_mode: f\(requestRecord, "Script_Mode"\)/);
});
