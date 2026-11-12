import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Phase 6 write source enable waits for Worker 0.10.824 and flips only STUDIO_PHASE6_WRITE_SOURCE", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/enable-studio-phase6-write-source.yml",
    import.meta.url,
  ), "utf8");
  const marker = readFileSync(new URL(
    "../../deploy/enable-studio-phase6-write-source.txt",
    import.meta.url,
  ), "utf8");

  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /deploy\/enable-studio-phase6-write-source\.txt/);
  assert.match(workflow, /0\.10\.824-overview-awaiting-approval/);
  assert.match(workflow, /2026-11-11-supabase-phase6-update-sor/);
  assert.match(workflow, /"name": "STUDIO_PHASE6_WRITE_SOURCE"/);
  assert.match(workflow, /"text": "supabase"/);
  assert.match(workflow, /STUDIO_PHASE6_WRITE_SOURCE=supabase/);
  assert.match(workflow, /studio_phase6_write_source=="supabase"/);
  assert.match(workflow, /studio_write_source=="supabase"/);
  assert.match(workflow, /studio_runner_output_read_source=="supabase"/);
  assert.match(workflow, /STUDIO_WRITE_SOURCE/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /STUDIO_FACTORY_OPS_READ_SOURCE/);
  assert.match(workflow, /STUDIO_HOME_READ_SOURCE/);
  assert.match(workflow, /write_source_secret_preserved=PASS/);
  assert.match(workflow, /phase6_write_source_environment_rollback=RESTORED/);
  assert.match(workflow, /phase7_started=NO/);
  assert.doesNotMatch(workflow, /STUDIO_WRITE_SOURCE=supabase/);
  assert.doesNotMatch(workflow, /STUDIO_WRITE_SOURCE=airtable/);
  assert.doesNotMatch(workflow, /STUDIO_RUNNER_OUTPUT_READ_SOURCE=airtable/);

  assert.match(marker, /STUDIO_PHASE6_WRITE_SOURCE=supabase/);
  assert.match(marker, /Phase 7 is not started/);
  assert.match(marker, /Creates stay Airtable-first/);
  assert.match(marker, /half-hour job still copies Airtable into Supabase/);
});
