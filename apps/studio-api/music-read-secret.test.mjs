import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("Music read flag install is main-only, secret_text, and does not retarget writes", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/put-studio-api-music-read.yml",
    import.meta.url,
  ), "utf8");
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /0\.10\.806-supabase-music-reads/);
  assert.match(workflow, /\/content\/v2/);
  assert.doesNotMatch(workflow, /target \+ "\/content"/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /STUDIO_FACTORY_OPS_READ_SOURCE/);
  assert.match(workflow, /STUDIO_HOME_READ_SOURCE/);
  assert.match(workflow, /STUDIO_WRITE_SOURCE/);
  assert.match(workflow, /"name": "STUDIO_MUSIC_READ_SOURCE"/);
  assert.match(workflow, /"text": "supabase"/);
  assert.match(workflow, /"type": "secret_text"/);
  assert.match(workflow, /Pre-existing Worker binding changed during Music flag install/);
  assert.doesNotMatch(workflow, /STUDIO_READ_SOURCE/);
  assert.doesNotMatch(workflow, /STUDIO_HOME_PROFILE_SUMMARY_READS/);
  assert.doesNotMatch(workflow, /print\(secret|print\(result|print\(script/);
  const marker = readFileSync(new URL(
    "../../deploy/enable-studio-music-reads.txt",
    import.meta.url,
  ), "utf8");
  assert.match(marker, /0\.10\.806-supabase-music-reads/);
  assert.match(marker, /STUDIO_MUSIC_READ_SOURCE=supabase/);
  assert.match(marker, /Asset Manager/);
});
