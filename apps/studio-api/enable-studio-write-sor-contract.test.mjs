import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Studio write SoR enable waits for Worker 0.10.801 and flips only STUDIO_WRITE_SOURCE", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/enable-studio-write-sor.yml",
    import.meta.url,
  ), "utf8");
  const marker = readFileSync(new URL(
    "../../deploy/enable-studio-write-sor.txt",
    import.meta.url,
  ), "utf8");

  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /deploy\/enable-studio-write-sor\.txt/);
  assert.match(workflow, /0\.10\.801-supabase-phase5-write-sor/);
  assert.match(workflow, /2026-11-10-supabase-phase5-marker-backfill/);
  assert.match(workflow, /"name": "STUDIO_WRITE_SOURCE"/);
  assert.match(workflow, /"text": "supabase"/);
  assert.match(workflow, /STUDIO_WRITE_SOURCE=supabase/);
  assert.match(workflow, /studio_write_source=="supabase"/);
  assert.match(workflow, /studio_runner_output_read_source=="supabase"/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /STUDIO_FACTORY_OPS_READ_SOURCE/);
  assert.match(workflow, /STUDIO_HOME_READ_SOURCE/);
  assert.match(workflow, /content_read_secret_preserved=PASS/);
  assert.match(workflow, /runner_write_sor_environment_rollback=RESTORED/);
  assert.match(workflow, /phase7_started=NO/);
  assert.doesNotMatch(workflow, /STUDIO_RUNNER_OUTPUT_READ_SOURCE=airtable/);
  assert.doesNotMatch(workflow, /STUDIO_HOME_PROFILE_SUMMARY_READS/);

  assert.match(marker, /STUDIO_WRITE_SOURCE=supabase/);
  assert.match(marker, /Phase 7 is not started/);
  assert.match(marker, /Creates still mint Airtable rec ids/);
});
