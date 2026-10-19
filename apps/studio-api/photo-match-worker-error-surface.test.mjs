import assert from "node:assert/strict";
import test from "node:test";

import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker = readStudioWorkerSource();

test("manual Find Images Now awaits the async handler inside fetch error boundary", () => {
  const route = worker.slice(
    worker.indexOf("if (isIdeaMatchPhotosRoute) {"),
    worker.indexOf("if (isIdeaTimedScriptRoute) {")
  );
  assert.match(route, /return await matchIdeaPhotosRoute\(request, env, url, authorization\);/);
  const fetchEnd = worker.indexOf("async scheduled(event, env, ctx)");
  assert.match(worker.slice(0, fetchEnd), /catch \(error\) \{\s*console\.error\(error\);\s*return respond\(request, env,/);
});

test("manual matching errors persist a bounded, useful diagnostic instead of only manual_match_failed", () => {
  const route = worker.slice(
    worker.indexOf("async function matchIdeaPhotosRoute("),
    worker.indexOf("/*__STUDIO_WORKER_END:matchIdeaPhotosRoute__*/") > 0
      ? worker.indexOf("/*__STUDIO_WORKER_END:matchIdeaPhotosRoute__*/")
      : worker.indexOf("function ideaTimedScriptCatalogRow(")
  );
  assert.match(route, /reason: "manual_match_failed"/);
  assert.match(route, /error_detail:/);
  assert.match(route, /slice\(0, 350\)/);
  assert.match(route, /http_status:/);
  assert.match(route, /throw error;/);
});
