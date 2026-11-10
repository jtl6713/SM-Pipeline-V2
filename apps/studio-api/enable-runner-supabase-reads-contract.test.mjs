import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Runner Supabase read enable is main-path guarded and does not retarget writes", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/enable-runner-supabase-reads.yml",
    import.meta.url,
  ), "utf8");
  const marker = readFileSync(new URL(
    "../../deploy/enable-runner-supabase-reads.txt",
    import.meta.url,
  ), "utf8");

  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /deploy\/enable-runner-supabase-reads\.txt/);
  assert.match(workflow, /2026-11-10-supabase-phase5-marker-backfill/);
  assert.match(workflow, /STUDIO_RUNNER_OUTPUT_READ_SOURCE=supabase/);
  assert.match(workflow, /STUDIO_RUNNER_CONTENT_READ_SOURCE=supabase/);
  assert.match(workflow, /studio_runner_output_read_source=="supabase"/);
  assert.match(workflow, /studio_runner_content_read_source=="supabase"/);
  assert.match(workflow, /studio_write_source \/\/ "airtable"\)=="airtable"/);
  assert.match(workflow, /write_source_changed=NO/);
  assert.match(workflow, /refusing_to_enable_reads_while_write_source_not_airtable/);
  assert.match(workflow, /runner_supabase_reads_environment_rollback=RESTORED/);
  assert.match(workflow, /"action":"restart-one"/);
  assert.match(workflow, /"service":"pipeline-runner"/);
  assert.doesNotMatch(workflow, /STUDIO_WRITE_SOURCE=supabase/);
  assert.doesNotMatch(workflow, /STUDIO_READ_SOURCE=/);
  assert.doesNotMatch(workflow, /workflow_dispatch/);

  assert.match(marker, /STUDIO_RUNNER_OUTPUT_READ_SOURCE=supabase/);
  assert.match(marker, /STUDIO_RUNNER_CONTENT_READ_SOURCE=supabase/);
  assert.match(marker, /Do not flip STUDIO_WRITE_SOURCE/);
  assert.match(marker, /Phase 7 is not started/);
});
