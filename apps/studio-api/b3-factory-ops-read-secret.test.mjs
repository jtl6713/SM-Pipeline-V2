import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

test("studioFactoryOpsReadSource uses Supabase and the obsolete Airtable-era installer remains retired", () => {
  const workflow = new URL("../../.github/workflows/put-studio-api-b3-factory-ops-read.yml", import.meta.url);
  assert.equal(existsSync(workflow), false);
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export function studioFactoryOpsReadSource(env)");
  assert.ok(start >= 0, "missing studioFactoryOpsReadSource");
  const fn = source.slice(start, source.indexOf("}", start) + 1);
  assert.match(fn, /studioOnlySupabaseSource\(env\)/);
});
