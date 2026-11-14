import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)));

test("mapOpsQueueProfileName resolves Airtable lookup display names", () => {
  const source = readFileSync(join(root, "worker-functions-04.mjs"), "utf8");
  const start = source.indexOf("export function mapOpsQueueProfileName");
  const end = source.indexOf("/*__STUDIO_WORKER_END:mapOpsQueueProfileName__*/", start);
  assert.ok(start >= 0 && end > start);
  const body = source.slice(start, end);
  assert.match(body, /Platform Outputs\.Content_Profile is a lookup/);
  assert.match(body, /profileName\.toLowerCase\(\) === needle/);
  assert.match(body, /firstOpsLinkedId\(linked\)/);
});

test("Factory desk pack stamps Content_Profile from linked content items", () => {
  const pack = readFileSync(join(root, "supabase-pipeline-reads.mjs"), "utf8");
  assert.match(pack, /stampProfileFromContent/);
  assert.match(pack, /export async function resolveOutputProfileForSupabaseSync/);
  assert.match(pack, /content_profiles\(airtable_record_id\)/);
  assert.match(pack, /inheritedUuid/);
});

test("Factory submit keeps Global Factory policy when activity omits global_rollout", () => {
  const desk = readFileSync(join(root, "../studio-web/assets/factory-desk.js"), "utf8");
  assert.match(desk, /if \("global_rollout" in batch\)/);
  assert.match(desk, /withResolvedFactoryProfile/);
  assert.match(desk, /resolveFactoryCardProfileId/);
  assert.match(desk, /Global multi-profile approvals are not enabled for this selection/);
  assert.match(desk, /missing a Content Profile id/);
});
