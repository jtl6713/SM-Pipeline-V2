import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("./index.html", import.meta.url), "utf8");
const app = await readFile(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("Script a short accepts a detailed brief and exposes accessible browser dictation", () => {
  assert.match(html, /id="scriptedShortPrompt" maxlength="5000"/);
  assert.match(html, /id="scriptedShortDictate" aria-pressed="false"/);
  assert.match(html, /id="scriptedShortCharacterCount"/);
  assert.match(app, /window\.SpeechRecognition \|\| window\.webkitSpeechRecognition/);
  assert.match(app, /Dictation is not available in this browser/);
  assert.match(app, /Microphone access was unavailable/);
});

test("proposal review renders every durable Producer Plan category and sends the original brief on Accept", () => {
  assert.match(html, /id="scriptedShortPlan"/);
  assert.match(app, /Media requirement/);
  assert.match(app, /Required uploads/);
  assert.match(app, /Narration and order/);
  assert.match(app, /Target platforms/);
  assert.match(app, /creative_brief: scriptedShortProposal\.creative_brief/);
  assert.match(app, /Silent substitution is not allowed/);
});
