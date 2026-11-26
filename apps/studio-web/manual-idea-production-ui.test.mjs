import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("Manual Production is distinct from manual Idea entry and defaults unchecked", () => {
  const form = html.slice(html.indexOf('id="ideaCreateForm"'), html.indexOf("</form>", html.indexOf('id="ideaCreateForm"')));
  assert.match(form, /name="ideaPathMode" value="manual"/);
  const checkbox = form.match(/<input[^>]*id="ideaManualProduction"[^>]*>/)?.[0];
  assert.ok(checkbox);
  assert.match(checkbox, /type="checkbox"/);
  assert.match(checkbox, /\bdisabled\b/);
  assert.doesNotMatch(checkbox, /\bchecked\b/);
  assert.match(form, /id="ideaProductionModeChoice" hidden/);
  assert.match(form, /Automatic is the default/);
  assert.match(form, /Final Factory approval is still required/);
});

test("capability must be explicitly granted and stale form responses are discarded", () => {
  const source = app.slice(app.indexOf("async function refreshManualIdeaChoice()"), app.indexOf("function ideaPathMode()"));
  assert.match(source, /manualIdeaChoiceAvailable = false/);
  assert.match(source, /checkbox\.checked = false/);
  assert.match(source, /api\("\/api\/production-mode\/capabilities"/);
  assert.match(source, /generation !== manualIdeaChoiceRequest/);
  assert.match(source, /caps\?\.manual_idea_choice_enabled === true/);
  assert.match(source, /checkbox\.disabled = !manualIdeaChoiceAvailable/);
});

test("only an explicit checked choice requests manual; never retry an uncertain create", () => {
  const source = app.slice(app.indexOf('$("ideaCreateForm").addEventListener("submit"'), app.indexOf("function ideaStatusLabel("));
  assert.match(source, /manualRequested = \$\("ideaManualProduction"\)\?\.checked === true/);
  assert.match(source, /if \(manualRequested && !manualIdeaChoiceAvailable\)/);
  assert.match(source, /production_mode: manualRequested \? "manual" : "automatic"/);
  assert.match(source, /retries: 0/);
  assert.match(source, /result\.production_mode_verified !== true/);
  assert.match(source, /result\.record\?\.production_mode !== "manual"/);
  assert.match(source, /result\.record\?\.production_source !== "idea"/);
  assert.match(source, /do not create it again/);
});
