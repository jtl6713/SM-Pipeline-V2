import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { selectProfileFairIdeaPhotoCandidates } from "./idea-photo-wait.mjs";

test("automatic listener and actual matcher use the same global fair per-profile scheduler", () => {
  const listener = readFileSync(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const matcher = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const l = listener.slice(listener.indexOf("export async function autoListenOpenPhotoIdeas("),
    listener.indexOf("/*__STUDIO_WORKER_END:autoListenOpenPhotoIdeas__*/"));
  const m = matcher.slice(matcher.indexOf("export async function runWaitingIdeaPhotoMatches("),
    matcher.indexOf("/*__STUDIO_WORKER_END:runWaitingIdeaPhotoMatches__*/"));
  assert.match(l, /selectLegacyIdeaListenerCandidates\(candidates,/);
  assert.match(m, /selectProfileFairIdeaPhotoCandidates\(candidates,/);
  assert.match(l, /rotation: Math\.floor\(Date\.now\(\) \/ 60000\)/);
  assert.match(m, /rotation: Math\.floor\(Date\.now\(\) \/ 60000\)/);
  assert.match(l, /fields: \["Content_Profile", "Studio_Photo_Match_JSON", "Production_Config_Notes"\]/);
  assert.match(m, /fields: \["Content_Profile", "Studio_Photo_Match_JSON", "Production_Config_Notes"\]/);
  assert.match(l, /Candidate_Status.*'Generated'/);
  assert.match(m, /Studio_Photo_Wait_Status.*'Waiting'/);
  assert.match(l, /ideaManagePhotoPauseActive/);
  assert.match(m, /evaluateAndMaybeAttachWaitingIdeaPhotos/);
  assert.match(m, /readyProductionEnqueue|evaluateAndMaybeAttachWaitingIdeaPhotos/);
  assert.match(l, /error_stage: "initialize_listener"/);
});

test("profile fairness still advances on retries and never selects other profiles' media", () => {
  const profiles = ["recChicago", "recNewYork", "recLosAngeles", "recMiami"];
  const rows = profiles.flatMap((p, i) => [0, 1, 2].map((n) => ({
    id: p + "-" + n,
    createdTime: "2026-10-23T00:00:00Z",
    fields: { Content_Profile: [p], ...(n === 0 ? {
      Studio_Photo_Match_JSON: JSON.stringify({evaluated_at:"2026-10-24T11:00:00Z",action:"error"})
    } : {}) },
  })));
  const selectedProfiles = new Set();
  for (let minute = 0; minute < 8; minute++) {
    const selected = selectProfileFairIdeaPhotoCandidates(rows, {limit: 2, rotation: minute});
    for (const row of selected) {
      selectedProfiles.add(row.fields.Content_Profile[0]);
      assert.notEqual(row.id.slice(-1), "0", "failing older idea must not monopolize its city's slot");
    }
  }
  assert.deepEqual([...selectedProfiles].sort(), [...profiles].sort());
});
