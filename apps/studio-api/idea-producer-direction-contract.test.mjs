import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = file => readFileSync(new URL(file, import.meta.url), "utf8");
const worker = read("./worker-functions-02.mjs");
const html = read("../studio-web/index.html");

test("every new Production Request carries Idea creative direction without publishing", () => {
  const defaults = worker.slice(worker.indexOf("export function productionRequestDefaultsFromIdea"),
                                worker.indexOf("/*__STUDIO_WORKER_END:productionRequestDefaultsFromIdea__*/"));
  assert.match(defaults, /production_notes:\s*ideaProducerDirection\(f\(idea,\s*"Idea_Summary"\)\)/);
  assert.match(worker, /import \{ ideaProducerDirection \}/);
});

test("manual Idea, EZ intake and Script a Short explicitly invite conversational direction", () => {
  assert.match(html, /id="ideaSummary"[^>]+/);
  assert.match(html, /Creative direction — tell the Producer/);
  assert.match(html, /id="ezIdeaSummary"/);
  assert.match(html, /Creative direction for the Producer/);
  assert.match(html, /id="scriptedShortPrompt"/);
  assert.match(html, /Tell the Producer what to make/);
  assert.match(html, /id="factoryFeedbackNotes"/);
});
