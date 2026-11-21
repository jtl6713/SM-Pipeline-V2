import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const html = readFileSync(new URL("./index.html", import.meta.url), "utf8");
const css = readFileSync(new URL("./assets/styles-phase7-0621.css", import.meta.url), "utf8");
const app = readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");

test("idea quantity is next to Generate AI ideas in the top action row, not in the expanded form", () => {
  const pageStart = html.indexOf('<section id="page-ideas"');
  const headingEnd = html.indexOf('id="ideasAutonomousMessage"', pageStart);
  const heading = html.slice(pageStart, headingEnd);
  assert.ok(pageStart >= 0 && headingEnd > pageStart);
  assert.match(heading, /class="heading-actions"[\s\S]*id="ideaGenerateCount"[\s\S]*id="generateIdeasButton"/);
  assert.match(heading, /class="idea-generate-top-count"[^>]*for="ideaGenerateCount"/);
  assert.equal((html.match(/id="ideaGenerateCount"/g) || []).length, 1);
  const formStart = html.indexOf('<form id="ideaGenerateForm"');
  const formEnd = html.indexOf("</form>", formStart);
  const form = html.slice(formStart, formEnd);
  assert.ok(formStart >= 0 && formEnd > formStart);
  assert.doesNotMatch(form, /id="ideaGenerateCount"/);
  assert.match(form, /id="ideaGenerateQuality"/);
  assert.match(form, /id="ideaGenerateSubmit"/);
  assert.match(heading, /id="ideaGenerateCount"[^>]*min="1" max="10" step="1"/);
});

test("opening generation preserves the selected top-bar count and submission validates it", () => {
  const openStart = app.indexOf("function setIdeaGeneratorOpen(");
  const openEnd = app.indexOf("async function pollIdeaGenerationBatch(", openStart);
  assert.ok(openStart >= 0 && openEnd > openStart);
  assert.doesNotMatch(app.slice(openStart, openEnd), /ideaGenerateCount"\)\.value = "5"/);
  const submitStart = app.indexOf('$(\"ideaGenerateForm\")?.addEventListener("submit"');
  assert.ok(submitStart >= 0);
  assert.match(app.slice(submitStart, submitStart + 800), /Number\(\$\("ideaGenerateCount"\)\?\.value \?\? ""\)/);
  assert.match(app.slice(submitStart, submitStart + 800), /count < 1 \|\| count > 10/);
});

test("quantity control has a compact responsive layout beside the top action", () => {
  assert.match(css, /#page-ideas \.heading-actions \.idea-generate-top-count/);
  assert.match(css, /@media\(max-width:760px\)[^\n]*\.idea-generate-top-count/);
});

const clarity = readFileSync(new URL("./assets/studio-clarity-0599.css", import.meta.url), "utf8");

test("Ideas heading groups quantity and compact Generate button after four normal actions", () => {
  const start = html.indexOf('<div class="heading-actions">', html.indexOf('<section id="page-ideas"'));
  const end = html.indexOf("</div>", start);
  const heading = html.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(heading, /id="newIdeaButton"[\s\S]*class="idea-generate-top-action"/);
  assert.match(heading, /class="idea-generate-top-action"[\s\S]*id="ideaGenerateCount"[\s\S]*id="generateIdeasButton"/);
  assert.equal((html.match(/id="ideaGenerateCount"/g) || []).length, 1);
  assert.equal((html.match(/id="generateIdeasButton"/g) || []).length, 1);
});

test("Ideas action grid remains two columns on phones and Generate button is compact", () => {
  assert.match(clarity, /#page-ideas \.page-heading \.heading-actions\{[^}]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(clarity, /@media\(max-width:760px\)\{[\s\S]*#page-ideas \.page-heading \.heading-actions\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)!important/);
  assert.match(clarity, /#page-ideas \.heading-actions>\.idea-generate-top-action\{grid-column:1\/-1/);
  assert.match(clarity, /#page-ideas \.heading-actions \.idea-generate-top-action #generateIdeasButton\{[^}]*width:auto!important/);
  assert.doesNotMatch(clarity, /#page-ideas \.heading-actions button:nth-child\(5\)/);
  assert.doesNotMatch(clarity, /#page-ideas \.page-heading \.heading-actions\{grid-template-columns:1fr/);
});

test("two-column Ideas buttons stretch to row height even when text wraps", () => {
  assert.match(clarity, /#page-ideas \.page-heading \.heading-actions\{[^}]*align-items:stretch!important/);
  assert.match(clarity, /#page-ideas \.heading-actions>button\{[^}]*align-self:stretch!important/);
});
