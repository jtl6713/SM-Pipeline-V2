import assert from "node:assert/strict";
import test from "node:test";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const source = readStudioWorkerSource();
const fetchStart = source.indexOf("async fetch(request, env, ctx)");
const fetchEnd = source.indexOf("async scheduled(event, env, ctx)", fetchStart);
assert.ok(fetchStart >= 0 && fetchEnd > fetchStart, "Worker fetch boundary must exist");
const fetchSource = source.slice(fetchStart, fetchEnd);

test("Library GET awaits downstream Airtable errors inside Worker error response boundary", () => {
  assert.match(fetchSource, /if \(url\.pathname === "\/api\/library"\) \{[\s\S]*?return await listAssetLibrary\(request, env, url, authorization\);/);
});

test("Library upload POST awaits Drive or Airtable failures rather than leaking an unhandled rejection", () => {
  assert.match(fetchSource, /if \(url\.pathname === "\/api\/library"\) \{[\s\S]*?assertUploadWriteRequest\(request, env\);\s*return await uploadAssetLibraryItems\(request, env, authorization, ctx\);/);
});

test("AI API status and preference update await errors inside the same response boundary", () => {
  assert.match(fetchSource, /if \(isAiApiRoute\) \{[\s\S]*?if \(request\.method === "GET"\) return await getStudioAiApiStatus\(request, env\);/);
  assert.match(fetchSource, /return await patchStudioAiApiPreference\(request, env\);/);
});

test("Worker still preserves upstream HTTP status and returns structured JSON failures", () => {
  assert.match(fetchSource, /catch \(error\) \{\s*console\.error\(error\);\s*return respond\(request, env, \{\s*ok: false,\s*error: error instanceof Error \? error\.message : "Unexpected error",\s*\}, error\?\.status \|\| 500\);/);
});

test("Library POST retains origin and upload validation", () => {
  assert.match(fetchSource, /if \(request\.method === "POST"\) \{\s*assertUploadWriteRequest\(request, env\);/);
});
