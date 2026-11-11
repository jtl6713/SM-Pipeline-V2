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
  assert.match(workflow, /0\.10\.815-supabase-assets-reads/);
  assert.match(workflow, /\/content\/v2/);
  assert.doesNotMatch(workflow, /target \+ "\/content"/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /STUDIO_FACTORY_OPS_READ_SOURCE/);
  assert.match(workflow, /STUDIO_HOME_READ_SOURCE/);
  assert.match(workflow, /STUDIO_MUSIC_READ_SOURCE/);
  assert.match(workflow, /STUDIO_AUTH_READ_SOURCE/);
  assert.match(workflow, /STUDIO_WRITE_SOURCE/);
  assert.match(workflow, /"name": "STUDIO_ASSETS_READ_SOURCE"/);
  assert.match(workflow, /"text": "supabase"/);
  assert.match(workflow, /"type": "secret_text"/);
  assert.match(workflow, /Pre-existing Worker binding changed during Assets flag install/);
  assert.doesNotMatch(workflow, /STUDIO_READ_SOURCE/);
  assert.doesNotMatch(workflow, /print\(secret|print\(result|print\(script/);
  const marker = readFileSync(new URL(
    "../../deploy/enable-studio-assets-reads.txt",
    import.meta.url,
  ), "utf8");
  assert.match(marker, /0\.10\.815-supabase-assets-reads/);
  assert.match(marker, /STUDIO_ASSETS_READ_SOURCE=supabase/);
  assert.match(marker, /media_assets\.metadata/);
  assert.match(marker, /Do not trigger until densify is confirmed/);
  assert.doesNotMatch(marker, /Trigger STUDIO_ASSETS_READ_SOURCE=supabase now/);
});
