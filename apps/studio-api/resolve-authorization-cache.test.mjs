import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { proveStudioAuthorizationSources } from "./worker-functions-01.mjs";

const workerFns = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const worker = readFileSync(new URL("./worker.js", import.meta.url), "utf8");

function authRow(overrides = {}) {
  return {
    authorized: true,
    role: "Owner",
    authorization_error: null,
    user: { record_id: "recUser1" },
    membership: { record_id: "recMem1" },
    organization: { record_id: "recOrg1" },
    brand: { record_id: "recBrand1" },
    allowed_brands: [{ record_id: "recBrand1" }],
    auth_org_brand_fallback: false,
    auth_mirror_extras: true,
    ...overrides,
  };
}

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
  assert.match(worker, /0\.10\.842-publish-queue-columns/);
  assert.match(worker, /studio_supabase_auth_mirror_v1: true/);
  assert.match(worker, /studio_auth_airtable_cache_v1: true/);
  assert.match(worker, /studio_supabase_auth_reads_v1: true/);
  assert.match(worker, /studio_supabase_auth_prove_v1: true/);
  assert.match(worker, /studio_supabase_assets_reads_v1: true/);
  assert.match(worker, /studio_auth_read_source: studioAuthReadSource\(env\)/);
  assert.match(worker, /studio_assets_read_source: studioAssetsReadSource\(env\)/);
  assert.match(worker, /\/api\/ops\/supabase\/auth-prove/);
  assert.match(worker, /getStudioSupabaseAuthProve/);
});

test("resolveAuthorization keeps Airtable default and can opt into Supabase loader", () => {
  assert.match(workerFns, /studioAuthReadSource\(env\) === "supabase"/);
  assert.match(workerFns, /loadAuthorizationFromSupabase/);
  assert.match(workerFns, /loadAuthorizationFromAirtable/);
  assert.match(workerFns, /rolePermissions: ROLE_PERMISSIONS/);
  assert.match(workerFns, /proveStudioAuthorizationSources/);
  // Default path must still call Airtable when the flag is unset.
  assert.match(
    workerFns,
    /studioAuthReadSource\(env\) === "supabase"\s*\?[\s\S]*loadAuthorizationFromSupabase[\s\S]*:[\s\S]*loadAuthorizationFromAirtable/,
  );
});

test("proveStudioAuthorizationSources accepts org-brand fallback when core ids match", async () => {
  const result = await proveStudioAuthorizationSources(
    {},
    "joseph.t.logan@gmail.com",
    { email: "joseph.t.logan@gmail.com", source: "auth-prove", jwt_present: true },
    {
      loadAuthorizationFromAirtable: async () => authRow(),
      loadAuthorizationFromSupabase: async () => authRow({
        brand: { record_id: "recBrand1" },
        allowed_brands: [{ record_id: "recBrand1" }, { record_id: "recBrand2" }],
        auth_org_brand_fallback: true,
        auth_mirror_extras: false,
      }),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.core_match, true);
  assert.equal(result.brand_match, false);
  assert.equal(result.brand_acceptable, true);
  assert.equal(result.auth_read_source, "airtable");
});

test("proveStudioAuthorizationSources fails closed when organization ids diverge", async () => {
  const result = await proveStudioAuthorizationSources(
    {},
    "joseph.t.logan@gmail.com",
    {},
    {
      loadAuthorizationFromAirtable: async () => authRow(),
      loadAuthorizationFromSupabase: async () => authRow({
        organization: { record_id: "recOrgOther" },
      }),
    },
  );
  assert.equal(result.ok, false);
  assert.equal(result.core_match, false);
});
