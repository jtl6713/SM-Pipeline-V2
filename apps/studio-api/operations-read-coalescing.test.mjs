import assert from "node:assert/strict";
import test from "node:test";

import { readStudioWorkerSource } from "./worker-source-reader.mjs";

const source = readStudioWorkerSource();
const from = source.indexOf("async function getStudioOperations(request, env, authorization) {");
const to = source.indexOf("async function getStudioOperationsProfiles(", from);
assert.ok(from >= 0 && to > from, "Operations handler must exist");
const operations = source.slice(from, to);

test("Operations coalesces repeat dashboard loads in an organization-scoped 15s cache", () => {
  assert.match(operations, /authorization\?\.organization\?\.record_id/);
  assert.match(operations, /studioReadCoalesce\(`operations:overview:\$\{orgId\}`, 15000, async \(\) => \{/);
});

test("Operations never caches authorization-sensitive capability flags", () => {
  const loader = operations.slice(
    operations.indexOf("const data = await studioReadCoalesce("),
    operations.indexOf("\n  });", operations.indexOf("const data = await studioReadCoalesce("))
  );
  assert.doesNotMatch(loader, /can_edit_profiles|can_publish_queue/);
  const response = operations.slice(operations.indexOf("\n  return respond(request, env, {"));
  assert.match(response, /can_edit_profiles: Boolean\(authorization\?\.permissions\?\.tenant_admin\)/);
  assert.match(response, /can_publish_queue: Boolean\(authorization\?\.permissions\?\.publishing_control\)/);
});

test("Authoritative Airtable mutations drop Operations snapshot when relevant tables change", () => {
  const begin = source.indexOf("function studioInvalidateHotReads(");
  const end = source.indexOf("function studioReadCoalesce(", begin);
  assert.ok(begin >= 0 && end > begin);
  const fn = source.slice(begin, end);
  assert.match(fn, /studioReadCacheDropPrefix\("operations:"\)/);
  for (const relevant of [
    "AIRTABLE_OUTPUT_TABLE_ID",
    "AIRTABLE_MEDIA_TABLE_ID",
    "STUDIO_IDEA_PROFILE_TABLE_ID",
    "STUDIO_PIPELINE_SETTINGS_TABLE_ID"
  ]) assert.ok(fn.includes(relevant), "Expected invalidation of " + relevant);
});

test("Operations prefers Supabase Content Profiles and PUB queues with Airtable fallback", () => {
  assert.match(operations, /listContentProfileRecords\(env\)/);
  assert.match(operations, /listSupabaseOpsPublishOutputs\(env, \{ lane, limit \}/);
  assert.match(operations, /listRecords\(env, env\.AIRTABLE_OUTPUT_TABLE_ID/);
});
