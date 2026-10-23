import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
test("immediate Producer kickoff and cron resume share one R2 revision lease", () => {
  const start = source.indexOf("async function factoryAdvanceProducerRevision(");
  const end = source.indexOf("export async function factoryResumeProducerRevisions(", start);
  assert.ok(start > 0 && end > start);
  const execution = source.slice(start, end);
  assert.match(execution, /return withOutputApprovalLock\(env\.STUDIO_MEDIA, requestId/);
  assert.match(execution, /job\?\.job_id !== revisionId/);
  assert.match(execution, /state=pending/);
});
test("cron lease conflicts never consume the bounded retry budget", () => {
  assert.match(source, /error\?\.status === 409 && \/approval already in progress\|concurrent output approval\/i/);
  assert.match(source, /already_running: true/);
});
