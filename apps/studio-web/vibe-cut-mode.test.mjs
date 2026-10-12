import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const ez = fs.readFileSync(path.join(here, "assets/ez-plan.js"), "utf8");
const vibe = fs.readFileSync(path.join(here, "assets/vibe-cut.js"), "utf8");

test("Vibe Cut is a distinct Home creation path with style/energy controls", () => {
  assert.match(html, /vibe-cut\.js\?v=0.6.654-ops-phase-open/);
  assert.match(html, /id="prVibeCutBanner"/);
  assert.match(html, /id="ezVibeCutLaunch"/);
  assert.match(html, /ez-vibe-cut-launch/);
  assert.match(html, /Vibe Cut/);
  assert.match(ez, /VIBE_CUT:\s*"vibe-cut"/);
  assert.match(ez, /ezIsVibeCutInput/);
  assert.match(app, /startEzVibeCutWizard/);
  assert.match(app, /ezVibeCutLaunch/);
  assert.match(app, /Vibe Cut — long video → music montage/);
  assert.match(app, /vibeTarget/);
  assert.match(app, /vibeStyle/);
  assert.match(app, /vibeEnergy/);
  assert.match(app, /vibeChronology/);
  assert.match(app, /vibeVersions/);
  assert.match(app, /Find me the best 30 seconds/);
  assert.match(app, /Best moments \(recommended\)/);
  assert.match(app, /inputKind:\s*"vibe-cut"/);
  assert.match(app, /BUILD_ID = "item4-0.6.654-ops-phase-open"/);
});

test("Vibe Cut client helper stamps music-driven defaults", () => {
  assert.match(vibe, /ChicagoShiningVibeCut/);
  assert.match(vibe, /smooth-vibes/);
  assert.match(vibe, /beat-cut/);
  assert.match(vibe, /fast-cuts/);
  assert.match(vibe, /beat_sync/);
  assert.match(vibe, /voiceover:\s*"off"/);
  assert.match(vibe, /mergeIntoNotes/);
  assert.match(app, /mergeIntoNotes/);
  assert.match(app, /voiceover_mode: \(finished \|\| az \|\| vibeCut\) \? "No"/);
  assert.match(app, /vibeCut \? "Yes"/);
});
