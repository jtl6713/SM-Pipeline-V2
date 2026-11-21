import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("studioAssetsReadSource uses Supabase and the obsolete Airtable-era installer remains retired", () => {
  const workflow = new URL("../../.github/workflows/put-studio-api-assets-read.yml", import.meta.url);
  assert.equal(existsSync(workflow), false);
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export function studioAssetsReadSource(env)");
  assert.ok(start >= 0, "missing studioAssetsReadSource");
  const fn = source.slice(start, source.indexOf("}", start) + 1);
  assert.match(fn, /studioOnlySupabaseSource\(env\)/);
});

test("Assets densify oneshot workflow waits for 819 then POSTs media_only densify", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/densify-studio-assets-media.yml",
    import.meta.url,
  ), "utf8");
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /deploy\/densify-studio-assets-media\.txt/);
  assert.match(workflow, /Trigger densify STUDIO_ASSETS media_only media_limit=600 now/);
  assert.match(workflow, /assets_densify_skipped=NO_TRIGGER/);
  assert.match(workflow, /media_only: true/);
  assert.match(workflow, /media_limit: 600/);
  assert.match(workflow, /method: "POST"/);
  assert.match(workflow, /819-assets-densify-null-sanitize/);
  assert.match(workflow, /studio_supabase_assets_densify_null_sanitize_v1/);
  assert.match(workflow, /\/api\/ops\/supabase\/sync/);
  assert.match(workflow, /\.sync\.media_assets\.ok==true/);
  const marker = readFileSync(new URL(
    "../../deploy/densify-studio-assets-media.txt",
    import.meta.url,
  ), "utf8");
  assert.match(marker, /0\.10\.819-assets-densify-null-sanitize/);
  assert.match(marker, /Trigger densify STUDIO_ASSETS media_only media_limit=600 now/);
});
