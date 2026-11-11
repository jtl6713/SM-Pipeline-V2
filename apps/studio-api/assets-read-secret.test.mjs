import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Assets read flag install is main-only, secret_text, and does not retarget writes", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/put-studio-api-assets-read.yml",
    import.meta.url,
  ), "utf8");
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /deploy\/enable-studio-assets-reads\.txt/);
  assert.match(workflow, /actions\/checkout@v4/);
  assert.match(workflow, /Trigger STUDIO_ASSETS_READ_SOURCE=supabase now/);
  assert.match(workflow, /Rollback STUDIO_ASSETS_READ_SOURCE=airtable now/);
  assert.match(workflow, /assets_read_secret_skipped=NO_TRIGGER_OR_ROLLBACK/);
  assert.match(workflow, /studio_supabase_assets_reads_v1: true/);
  assert.match(workflow, /\/content\/v2/);
  assert.doesNotMatch(workflow, /target \+ "\/content"/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /STUDIO_FACTORY_OPS_READ_SOURCE/);
  assert.match(workflow, /STUDIO_HOME_READ_SOURCE/);
  assert.match(workflow, /STUDIO_MUSIC_READ_SOURCE/);
  assert.match(workflow, /STUDIO_AUTH_READ_SOURCE/);
  assert.match(workflow, /STUDIO_WRITE_SOURCE/);
  assert.match(workflow, /"name": "STUDIO_ASSETS_READ_SOURCE"/);
  assert.match(workflow, /"type": "secret_text"/);
  assert.match(workflow, /secret_text = "supabase" if want_supabase else "airtable"/);
  assert.match(workflow, /Pre-existing Worker binding changed during Assets flag put/);
  assert.doesNotMatch(workflow, /STUDIO_READ_SOURCE/);
  assert.doesNotMatch(workflow, /print\(secret|print\(result|print\(script/);
  const marker = readFileSync(new URL(
    "../../deploy/enable-studio-assets-reads.txt",
    import.meta.url,
  ), "utf8");
  assert.match(marker, /0\.10\.819-assets-densify-null-sanitize|0\.10\.818-assets-densify-media-only|0\.10\.817-assets-densify-oneshot|0\.10\.816-assets-densify-catchup|0\.10\.815-supabase-assets-reads/);
  assert.match(marker, /STUDIO_ASSETS_READ_SOURCE=supabase/);
  assert.match(marker, /media_assets\.metadata/);
  assert.match(marker, /densify-studio-assets-media\.txt|densify oneshot PASS/);
  assert.match(marker, /Trigger STUDIO_ASSETS_READ_SOURCE=supabase now/);
  assert.doesNotMatch(marker, /Rollback STUDIO_ASSETS_READ_SOURCE=airtable now/);
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
