import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("media reconcile workflow waits for Worker 0.10.827 and pages until done", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/reconcile-studio-media-assets.yml",
    import.meta.url,
  ), "utf8");
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /deploy\/reconcile-studio-media-assets\.txt/);
  assert.match(workflow, /Trigger reconcile STUDIO_ASSETS media_only media_reconcile now/);
  assert.match(workflow, /media_reconcile_skipped=NO_TRIGGER/);
  assert.match(workflow, /media_only: true/);
  assert.match(workflow, /media_reconcile: true/);
  assert.match(workflow, /0\.10\.827-media-asset-reconcile/);
  assert.match(workflow, /studio_supabase_media_reconcile_v1/);
  assert.match(workflow, /\.sync\.media_assets\.done/);
  assert.match(workflow, /media_asset_reconcile=PASS/);
  const marker = readFileSync(new URL(
    "../../deploy/reconcile-studio-media-assets.txt",
    import.meta.url,
  ), "utf8");
  assert.match(marker, /Trigger reconcile STUDIO_ASSETS media_only media_reconcile now/);
  assert.match(marker, /Do not retire Airtable asset reads/);
  assert.match(marker, /Phase 7 retirement is not started/);
});
