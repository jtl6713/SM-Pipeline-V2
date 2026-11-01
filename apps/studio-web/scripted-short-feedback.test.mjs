import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
test("Script a Short exposes feedback and undo immediately on proposal, before acceptance", () => {
  assert.match(html, /id="scriptedShortFeedback" maxlength="3000"/);
  assert.match(html, /id="scriptedShortRevise"/);
  assert.match(html, /id="scriptedShortUndo"/);
  assert.match(html, /id="scriptedShortFeedbackHistory"/);
  assert.ok(html.indexOf('id="scriptedShortFeedback"') < html.indexOf('id="scriptedShortAccept"'));
  assert.match(app, /\/api\/scripted-short\/revise/);
  assert.match(app, /scriptedShortProposalVersions\.push/);
  assert.match(app, /scriptedShortProposalVersions\.pop/);
  assert.match(app, /scriptedShortProposal !== base/);
  assert.match(app, /proposal_feedback: scriptedShortProposalVersions\.slice\(1\)/);
  assert.match(app, /renderScriptedShortProposal\(result\)/);
});
