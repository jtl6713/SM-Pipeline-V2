import assert from "node:assert/strict";
import test from "node:test";

import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker = readStudioWorkerSource();

function handlerFor(route) {
  const marker = `      if (${route}) {`;
  const start = worker.indexOf(marker);
  assert.ok(start >= 0, `Missing ${route} handler`);
  const end = worker.indexOf("\n      }", start);
  assert.ok(end > start, `Missing ${route} handler end`);
  return worker.slice(start, end);
}

test("manual AI idea generation awaits errors inside fetch's JSON response boundary", () => {
  assert.match(handlerFor("isIdeaGenerateRoute"),
    /return await startStudioIdeaGeneration\(request, env, authorization, ctx\);/);
});

test("AI idea generation status preserves Airtable 429 instead of uncaught HTTP 500", () => {
  assert.match(handlerFor("isIdeaGenerateStatusRoute"),
    /return await studioIdeaGenerationStatus\(request, env, url, authorization\);/);
});

test("Operations read preserves Airtable 429 instead of uncaught HTTP 500", () => {
  assert.match(handlerFor("isOperationsRoute"),
    /return await getStudioOperations\(request, env, authorization\);/);
});

test("Worker error boundary returns the original HttpError status as JSON", () => {
  const fetchPart = worker.slice(0, worker.indexOf("async scheduled(event, env, ctx)"));
  assert.match(fetchPart,
    /catch \(error\) \{\s*console\.error\(error\);\s*return respond\(request, env, \{[\s\S]*?\}, error\?\.status \|\| 500\);/);
});
