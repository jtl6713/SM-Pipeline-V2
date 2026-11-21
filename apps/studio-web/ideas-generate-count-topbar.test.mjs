import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/studio-clarity-0599.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("AI Idea Generation is a single always-visible card inside the top buttons", () => {
  const pageStart = html.indexOf('<section id="page-ideas"');
  const headingEnd = html.indexOf('id="ideasAutonomousMessage"', pageStart);
  const heading = html.slice(pageStart, headingEnd);
  assert.ok(pageStart >= 0 && headingEnd > pageStart);
  assert.match(heading, /class="heading-actions"[\s\S]*id="newIdeaButton"[\s\S]*id="ideaGeneratePanel"/);
  assert.match(heading, /id="ideaGeneratePanel"[^>]*aria-labelledby="ideaGenerateHeading"/);
  assert.match(heading, /id="ideaGenerateHeading">AI Idea Generation/);
  assert.doesNotMatch(heading, /id="ideaGeneratePanel"[^>]*hidden/);
  const start = heading.indexOf('<form id="ideaGenerateForm"');
  const end = heading.indexOf("</form>", start);
  assert.ok(start >= 0 && end > start);
  const form = heading.slice(start, end);
  assert.match(form, /id="ideaGenerateCount"[^>]*min="1" max="10" step="1"/);
  assert.match(form, /id="ideaGenerateQuality"/);
  assert.match(form, /id="ideaGenerateSubmit">Generate Ideas/);
  for (const id of ["ideaGeneratePanel", "ideaGenerateForm", "ideaGenerateCount", "ideaGenerateQuality", "ideaGenerateSubmit"]) {
    assert.equal((html.match(new RegExp('id="' + id + '"', "g")) || []).length, 1, id + " must be unique");
  }
  assert.doesNotMatch(html, /id="generateIdeasButton"/);
  assert.doesNotMatch(html, /id="ideaGenerateCancel"/);
});

test("quantity submission and quality selection still use the existing idea generation endpoint", () => {
  const submitStart = app.indexOf('$("ideaGenerateForm")?.addEventListener("submit"');
  assert.ok(submitStart >= 0);
  const submit = app.slice(submitStart, submitStart + 1900);
  assert.match(submit, /Number\(\$\("ideaGenerateCount"\)\?\.value \?\? ""\)/);
  assert.match(submit, /count < 1 \|\| count > 10/);
  assert.match(submit, /\$\("ideaGenerateQuality"\)\?\.value/);
  assert.match(submit, /api\("\/api\/ideas\/generate"/);
  const opener = app.slice(app.indexOf("function setIdeaGeneratorOpen("),app.indexOf("async function pollIdeaGenerationBatch("));
  assert.match(opener, /panel.hidden = false/);
  assert.doesNotMatch(opener, /panel.hidden = !open/);
  assert.doesNotMatch(app, /\$\("generateIdeasButton"\)\?\.addEventListener/);
});

test("next hourly CT pull countdown is displayed above Current ideas, refreshing without re-rendering the idea list", () => {
  assert.match(html, /id="ideasNextPullCountdown"[\s\S]*id="ideasList"/);
  const start = app.indexOf("function updateIdeasNextPullCountdown()");
  const end = app.indexOf("async function pollIdeaGenerationBatch()", start);
  assert.ok(start >= 0 && end > start);
  const timer = app.slice(start, end);
  assert.match(timer, /timeZone: "America\/Chicago"/);
  assert.match(timer, /3600000/);
  assert.match(timer, /Next Idea Pull will be at/);
  assert.match(timer, /window.setInterval\(updateIdeasNextPullCountdown, 1000\)/);
  assert.doesNotMatch(timer, /renderIdeasTable/);
});

test("generator card has a responsive layout beside the normal top actions", () => {
  assert.match(css, /#page-ideas \.heading-actions>\.idea-generate-top-action\{/);
  assert.match(css, /#page-ideas \.idea-generate-top-action \.idea-generate-fields\{/);
  assert.match(css, /#page-ideas \.idea-generate-top-action #ideaGenerateSubmit\{/);
  assert.match(css, /@media\(max-width:760px\)\{[\s\S]*#page-ideas \.idea-generate-top-action #ideaGenerateSubmit/);
  assert.match(css, /#page-ideas \.idea-next-pull\{/);
});
