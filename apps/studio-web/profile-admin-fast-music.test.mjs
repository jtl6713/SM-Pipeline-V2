import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const api = readFileSync(new URL("../studio-api/worker-functions-04.mjs", import.meta.url), "utf8");
const music = readFileSync(new URL("../studio-api/worker-functions-03.mjs", import.meta.url), "utf8");
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");

test("Profile Admin loads selected profile without blocking on the operations desk", () => {
  const profileFn = app.slice(app.indexOf("function loadOperationsProfilesPanel()"), app.indexOf("async function loadOperations()", app.indexOf("function loadOperationsProfilesPanel()")));
  assert.match(profileFn, /selected_only=1/);
  assert.match(profileFn, /await api\("\/api\/operations\/profiles\?selected_only=1"/);
  assert.match(app, /if \(operationsControlTab === "profiles"\) \{\s*return loadOperationsProfilesPanel\(\);\s*\}/);
  assert.match(api, /const selectedOnly = url\.searchParams\.get\("selected_only"\) === "1"/);
  assert.match(api, /await airtableFetch\(env, STUDIO_IDEA_PROFILE_TABLE_ID, selectedId\)/);
  assert.match(html, /id="operationsProfilesRefresh"/);
});
test("Selected music track names are retrieved by exact IDs, not first catalog page", () => {
  assert.match(app, /const selectedMusicTask = linkedIds\.length/);
  assert.match(app, /\/api\/music\?ids=/);
  assert.match(music, /url\.searchParams\.get\("ids"\)/);
  assert.match(music, /RECORD_ID\(\)/);
  assert.match(app, /Track details unavailable/);
  assert.match(app, /track\.unresolved \? "disabled/);
});
test("Selected music controls and voice are ready before optional global music catalog", () => {
  const fn = app.slice(app.indexOf("function loadOperationsProfilesPanel()"), app.indexOf("async function loadOperations()", app.indexOf("function loadOperationsProfilesPanel()")));
  assert.match(fn, /await Promise\.allSettled\(\[selectedMusicTask, voiceTask\]\)/);
  assert.match(fn, /api\("\/api\/music\?limit=100"/);
  const portion = fn.split("await Promise.allSettled([selectedMusicTask, voiceTask])")[1];
  assert.match(portion, /api\("\/api\/music\?limit=100"/);
  assert.doesNotMatch(portion, /await api\("\/api\/music\?limit=100"/);
});
test("Music preview uses existing authenticated Drive access before public links", () => {
  const begin = music.indexOf("export async function fetchGoogleDriveAudio(record, request, env = null)");
  const end = music.indexOf("/*__STUDIO_WORKER_END:fetchGoogleDriveAudio__*/", begin);
  assert.ok(begin >= 0 && end > begin);
  const fn = music.slice(begin,end);
  assert.match(fn, /item4GoogleAccessToken\(env\)/);
  assert.match(fn, /Authorization/);
  assert.match(fn, /alt=media/);
  assert.ok(fn.indexOf("item4GoogleAccessToken(env)") < fn.indexOf("googleDriveDownloadUrl(fileId)"));
  assert.match(music, /fetchGoogleDriveAudio\(record, request, env\)/);
  assert.match(music, /fetchGoogleDriveAudio\(record, probeRequest, env\)/);
});
