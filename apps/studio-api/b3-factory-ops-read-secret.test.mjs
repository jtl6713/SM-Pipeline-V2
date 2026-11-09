import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("B3 read flag install is main-only, secret_text, and does not retarget Home or writes", () => {
  const workflow = readFileSync(new URL(
    "../../.github/workflows/put-studio-api-b3-factory-ops-read.yml",
    import.meta.url,
  ), "utf8");
  assert.match(workflow, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(workflow, /0\.10\.782-supabase-b3-factory-ops-reads/);
  assert.match(workflow, /STUDIO_CONTENT_READ_SOURCE/);
  assert.match(workflow, /"name": "STUDIO_FACTORY_OPS_READ_SOURCE"/);
  assert.match(workflow, /"text": "supabase"/);
  assert.match(workflow, /"type": "secret_text"/);
  assert.match(workflow, /Pre-existing Worker binding changed during B3 flag install/);
  assert.doesNotMatch(workflow, /STUDIO_READ_SOURCE/);
  assert.doesNotMatch(workflow, /STUDIO_WRITE_SOURCE/);
  assert.doesNotMatch(workflow, /STUDIO_HOME_PROFILE_SUMMARY_READS/);
  assert.doesNotMatch(workflow, /print\(secret|print\(result|print\(script/);
});
