import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const workerFns = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

test("resolveAuthorization uses short-TTL coalesce and targeted Airtable filters", () => {
  assert.match(workerFns, /export async function resolveAuthorization/);
  assert.match(workerFns, /studioReadCoalesce\(cacheKey, ttlMs/);
  assert.match(workerFns, /const cacheKey = `auth:\$\{email\}`/);
  assert.match(workerFns, /studioAuthCacheTtlMs/);
  assert.match(workerFns, /LOWER\(\{Email\}\)="/);
  assert.match(workerFns, /ARRAYJOIN\(\{User\}\)&""/);
  assert.match(workerFns, /User_ID/);
  assert.match(workerFns, /RECORD_ID\(\)="/);
  assert.doesNotMatch(
    workerFns.slice(
      workerFns.indexOf("async function loadAuthorizationFromAirtable"),
      workerFns.indexOf("export async function resolveAuthorization"),
    ),
    /FIND\("\$\{studioAuthFormulaLiteral\(userRecord\.id\)\}"/,
  );
  assert.doesNotMatch(
    workerFns.slice(
      workerFns.indexOf("async function loadAuthorizationFromAirtable"),
      workerFns.indexOf("export async function resolveAuthorization"),
    ),
    /listRecords\(env, STUDIO_TABLES\.users, \{ limit: 100 \}\)/,
  );
  assert.doesNotMatch(
    workerFns.slice(
      workerFns.indexOf("async function loadAuthorizationFromAirtable"),
      workerFns.indexOf("export async function resolveAuthorization"),
    ),
    /listRecords\(env, STUDIO_TABLES\.memberships, \{ limit: 100 \}\)/,
  );
  assert.doesNotMatch(
    workerFns.slice(
      workerFns.indexOf("async function loadAuthorizationFromAirtable"),
      workerFns.indexOf("export async function resolveAuthorization"),
    ),
    /listRecords\(env, STUDIO_TABLES\.brands, \{ limit: 100 \}\)/,
  );
});

test("auth table writes invalidate the auth cache prefix", () => {
  assert.match(workerFns, /studioReadCacheDropPrefix\("auth:"\)/);
  assert.match(workerFns, /STUDIO_TABLES\.users/);
  assert.match(workerFns, /STUDIO_TABLES\.memberships/);
  assert.match(workerFns, /STUDIO_TABLES\.organizations/);
  assert.match(workerFns, /STUDIO_TABLES\.brands/);
});

test("Worker health advertises auth Airtable cache build", () => {
  assert.match(worker, /0\.10\.812-supabase-auth-reads/);
  assert.match(worker, /studio_supabase_auth_mirror_v1: true/);
  assert.match(worker, /studio_auth_airtable_cache_v1: true/);
  assert.match(worker, /studio_supabase_auth_reads_v1: true/);
  assert.match(worker, /studio_auth_read_source: studioAuthReadSource\(env\)/);
});

test("resolveAuthorization keeps Airtable default and can opt into Supabase loader", () => {
  assert.match(workerFns, /studioAuthReadSource\(env\) === "supabase"/);
  assert.match(workerFns, /loadAuthorizationFromSupabase/);
  assert.match(workerFns, /loadAuthorizationFromAirtable/);
  assert.match(workerFns, /rolePermissions: ROLE_PERMISSIONS/);
  // Default path must still call Airtable when the flag is unset.
  assert.match(
    workerFns,
    /studioAuthReadSource\(env\) === "supabase"\s*\?[\s\S]*loadAuthorizationFromSupabase[\s\S]*:[\s\S]*loadAuthorizationFromAirtable/,
  );
});
