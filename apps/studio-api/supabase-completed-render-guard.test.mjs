import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const sql = readFileSync(new URL("../../docs/supabase-migration/phase7/008_guard_completed_shared_render_status.sql", import.meta.url), "utf8");

test("late queue stamps cannot regress an uploaded shared render without canonical job proof", () => {
  assert.match(sql, /NEW\.render_status IN \('Waiting in Render Queue', 'Ready for Render', 'Ready to Render'\)/);
  assert.match(sql, /NEW\.final_file_storage_status = 'Uploaded'/);
  assert.match(sql, /NEW\.output_status = 'Ready for Review'/);
  assert.match(sql, /canonical\.remotion_job_id IS NOT NULL/);
  assert.match(sql, /canonical\.content_item_id = NEW\.content_item_id/);
  for (const field of ["final_file_url", "studio_preview_url", "thumbnail_url"]) {
    assert.match(sql, new RegExp(`canonical\\.${field} = NEW\\.${field}`));
  }
  assert.match(sql, /NEW\.render_status := 'Rendered'/);
});
test("guard respects holds, synthetic tests and future revisions", () => {
  assert.match(sql, /NEW\.do_not_publish IS FALSE/);
  assert.match(sql, /NEW\.test_run_id IS NULL/);
  assert.doesNotMatch(sql, /NEW\.(?:review_status|publish_status|output_status)\s*:=/i);
  assert.doesNotMatch(sql, /output_number|Output_ID|airtable/i);
});
