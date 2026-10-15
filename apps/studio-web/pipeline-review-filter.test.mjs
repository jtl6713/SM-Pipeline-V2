import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { readStudioWorkerSource } from "../studio-api/worker-source-reader.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const app = fs.readFileSync(path.join(here, "assets/app-item4-1008.js"), "utf8");
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const worker = readStudioWorkerSource();

test("Pipeline always loads the full outputs list (not lean mode=review)", () => {
  const refresh = app.slice(
    app.indexOf("async function refreshPipelineOutputs"),
    app.indexOf("async function loadOutputs")
  );
  assert.match(refresh, /api\("\/api\/outputs\?limit=250"/);
  assert.doesNotMatch(refresh, /api\([^)]*mode=review/);
  assert.doesNotMatch(refresh, /pipelineViewFilter === "approval"/);
});

test("Awaiting Approval filter matches Ready for Review studio_state", () => {
  const matchFn = app.slice(
    app.indexOf("function pipelineRecordMatchesFilter"),
    app.indexOf("function pipelineQuickFilterCount")
  );
  assert.match(matchFn, /Ready for Review/);
  assert.match(matchFn, /Awaiting Approval/);
  assert.doesNotMatch(matchFn, /creativeCanApproveForPublishing\(record\) && !pipelineRecordIsAzAutoQueue/);
});

test("Worker mode=review targets Ready for Review / Review Sent", () => {
  // Review filter lives in the Airtable snapshot builder (listOutputs only toggles reviewOnly).
  // Prefer the Airtable builder name so we do not slice the Supabase twin first.
  const start = worker.indexOf("async function buildPipelineOutputsPayload(env, profile");
  const end = worker.indexOf("\nasync function ", start + 10);
  const list = worker.slice(start, end > start ? end : start + 8000);
  assert.match(list, /reviewOnly/);
  assert.match(list, /Output_Status\}="Ready for Review"/);
  assert.match(list, /Review_Status\}="Review Sent"/);
  assert.doesNotMatch(list, /Review_Status\}="Pending Review"/);

  const supabaseReads = fs.readFileSync(
    path.join(here, "../studio-api/supabase-pipeline-reads.mjs"),
    "utf8",
  );
  assert.match(supabaseReads, /output_status\.eq\.Ready%20for%20Review/);
  assert.match(supabaseReads, /review_status\.eq\.Review%20Sent/);
});

test("All Profiles awaiting-approval link uses studioOpenPipelineFilter", () => {
  assert.match(app, /window\.studioOpenPipelineFilter\s*=/);
  assert.match(overview, /studioOpenPipelineFilter/);
});

test("Pipeline tab switches re-filter locally when rows are already loaded", () => {
  assert.match(app, /Full list is already in memory/);
  assert.match(app, /updatePipelineQuickTabs\(pipelineOutputs\)/);
});
