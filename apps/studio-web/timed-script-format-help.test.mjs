import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import "./assets/timed-script.js";

test("Timed Script importer explains and accepts the exact sample", () => {
  const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
  assert.ok(html.includes('id="prTimedScriptFormatHelp"'));
  assert.ok(html.includes("See a valid timeline example"));
  assert.ok(html.includes('aria-describedby="prTimedScriptFormatHint"'));
  assert.ok(html.includes("tab-separated columns from a spreadsheet"));
  const example = html.split('<pre id="prTimedScriptFormatExample">')[1]?.split("</pre>")[0];
  assert.ok(example, "Inline timeline example must exist");
  const parsed = globalThis.StudioTimedScript.parseTimedScriptMarkdown(example);
  assert.equal(parsed.ok, true, JSON.stringify({ errors: parsed.errors, issues: parsed.issues }));
  assert.equal(parsed.timeline.segments.length, 2);
  assert.equal(parsed.timeline.duration_seconds, 10);
  assert.deepEqual(parsed.timeline.segments.map(scene => scene.suggested_visual), ["skyline.jpg", "riverwalk.jpg"]);
  const css = readFileSync(new URL("./assets/styles-phase7-0621.css", import.meta.url), "utf8");
  assert.ok(css.includes(".timed-script-format-help pre{"));
  assert.ok(css.includes("overflow-x:auto"));
});

test("Parser supports tab-delimited spreadsheet rows as described", () => {
  const data = "Time\tVoiceover\tSuggested still\n0:00-0:05\tFirst scene narration.\tskyline.jpg\n0:05-0:10\tSecond scene narration.\triverwalk.jpg";
  const parsed = globalThis.StudioTimedScript.parseTimedScriptMarkdown(data);
  assert.equal(parsed.ok, true, JSON.stringify(parsed.errors));
  assert.equal(parsed.timeline.segments.length, 2);
});
