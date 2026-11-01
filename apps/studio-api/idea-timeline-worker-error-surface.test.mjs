import assert from "node:assert/strict";
import test from "node:test";

import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const worker = readStudioWorkerSource();

test("Create VO timeline awaits the async handler inside the fetch error boundary", () => {
  const route = worker.slice(
    worker.indexOf("if (isIdeaTimedScriptRoute) {"),
    worker.indexOf("if (isVibeCutPlanRoute) {")
  );
  assert.match(route, /return await createIdeaTimedScriptRoute\(request, env, url, authorization, ctx\);/);
  assert.match(worker, /version: "0\.10\.\d+(?:-[\w.-]+)?"/);

  const fetchEnd = worker.indexOf("async scheduled(event, env, ctx)");
  assert.match(worker.slice(0, fetchEnd), /catch \(error\) \{\s*console\.error\(error\);\s*return respond\(request, env,/);
});
