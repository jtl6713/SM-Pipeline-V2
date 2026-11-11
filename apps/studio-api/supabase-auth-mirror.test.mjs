import test from "node:test";
import assert from "node:assert/strict";
import {
  mapOrganizationAuthRow,
  mapBrandAuthRow,
  mapUserAuthRow,
  mapMembershipAuthRow,
  syncAuthTablesToSupabase,
  loadAuthorizationFromSupabase,
} from "./supabase-auth-mirror.mjs";

test("auth mappers densify Airtable ids into extras without dropping scalars", () => {
  const org = mapOrganizationAuthRow({
    id: "recOrg1",
    fields: { Organization_ID: "ORG-1", Organization_Name: "Chicago Shining" },
  });
  assert.equal(org.name, "Chicago Shining");
  assert.equal(org.organization_key, "ORG-1");

  const brand = mapBrandAuthRow({
    id: "recBrand1",
    fields: {
      Brand_ID: "BRD-1",
      Brand_Name: "Chicago",
      Organization: ["recOrg1"],
      Brand_Voice: "Warm",
    },
  }, "uuid-org");
  assert.equal(brand.organization_id, "uuid-org");
  assert.equal(brand.brand_key, "BRD-1");
  assert.equal(mapBrandAuthRow({ id: "recBrand2", fields: { Brand_Name: "X" } }, null), null);

  const user = mapUserAuthRow({
    id: "recUser1",
    fields: {
      User_ID: "USR-JLOGAN",
      Email: "Joseph.T.Logan@gmail.com",
      Display_Name: "Joseph",
      User_Status: "Active",
      Active: true,
    },
  });
  assert.equal(user.email, "joseph.t.logan@gmail.com");
  assert.equal(user.user_key, "USR-JLOGAN");

  const membership = mapMembershipAuthRow({
    id: "recMem1",
    fields: {
      Membership_ID: "MEM-1",
      User: ["recUser1"],
      Organization: ["recOrg1"],
      Role: "Owner",
      Active: true,
      Membership_Status: "Active",
      Is_Default: true,
      Allowed_Brands: ["recBrand1"],
      Default_Brand: ["recBrand1"],
    },
  }, { userUuid: "uuid-user", organizationUuid: "uuid-org" });
  assert.equal(membership.role, "Owner");
  assert.equal(membership.is_default, true);
  assert.deepEqual(membership.extras.Allowed_Brands, ["recBrand1"]);
  assert.equal(
    mapMembershipAuthRow({ id: "recMem2", fields: { Role: "Admin" } }, { userUuid: null, organizationUuid: "uuid-org" }),
    null,
  );
});

test("syncAuthTablesToSupabase upserts orgs→brands→users→memberships and soft-skips missing tables", async () => {
  const posts = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    const href = String(url);
    const method = init?.method || "GET";
    if (method === "POST") {
      posts.push({ href, body: JSON.parse(init.body) });
      if (href.includes("organizations")) {
        return { ok: true, async text() { return ""; } };
      }
      // Simulate missing extras columns on first studio_users POST, then accept.
      if (href.includes("studio_users") && posts.filter((row) => row.href.includes("studio_users")).length === 1) {
        return {
          ok: false,
          status: 400,
          async text() {
            return JSON.stringify({ code: "PGRST204", message: "Could not find the 'user_key' column of 'studio_users' in the schema cache" });
          },
        };
      }
      return { ok: true, async text() { return ""; } };
    }
    if (href.includes("organizations?") && href.includes("select=id")) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{ id: "uuid-org", airtable_record_id: "recOrg1" }]);
        },
      };
    }
    if (href.includes("studio_users?") && href.includes("select=id")) {
      return {
        ok: true,
        async text() {
          return JSON.stringify([{ id: "uuid-user", airtable_record_id: "recUser1" }]);
        },
      };
    }
    return { ok: true, async text() { return "[]"; } };
  };
  try {
    const result = await syncAuthTablesToSupabase({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    }, {
      listRecords: async (_env, table) => {
        if (table === "Organizations") {
          return [{ id: "recOrg1", fields: { Organization_ID: "ORG-1", Organization_Name: "Chicago Shining" } }];
        }
        if (table === "Brands") {
          return [{
            id: "recBrand1",
            fields: { Brand_ID: "BRD-1", Brand_Name: "Chicago", Organization: ["recOrg1"] },
          }];
        }
        if (table === "Studio Users") {
          return [{
            id: "recUser1",
            fields: { User_ID: "USR-1", Email: "a@example.com", Active: true, User_Status: "Active" },
          }];
        }
        if (table === "Studio Memberships") {
          return [{
            id: "recMem1",
            fields: {
              Membership_ID: "MEM-1",
              User: ["recUser1"],
              Organization: ["recOrg1"],
              Role: "Admin",
              Active: true,
              Membership_Status: "Active",
              Is_Default: true,
              Allowed_Brands: ["recBrand1"],
            },
          }];
        }
        return [];
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.organizations, 1);
    assert.equal(result.brands, 1);
    assert.equal(result.studio_users, 1);
    assert.equal(result.studio_memberships, 1);
    assert.equal(result.extras, false);
    assert.ok(posts.some((row) => row.href.includes("organizations")));
    assert.ok(posts.some((row) => row.href.includes("brands")));
    assert.ok(posts.some((row) => row.href.includes("studio_memberships")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("loadAuthorizationFromSupabase rebuilds Airtable-shaped authorization from mirror rows", async () => {
  const calls = [];
  const rolePermissions = {
    Owner: { tenant_admin: true, ideas_create: true },
    Viewer: { tenant_admin: false, ideas_create: false },
  };
  const result = await loadAuthorizationFromSupabase(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    "joseph.t.logan@gmail.com",
    { email: "Joseph.T.Logan@gmail.com", source: "access", jwt_present: true },
    {
      rolePermissions,
      supabaseRest: async (_env, path) => {
        calls.push(path);
        if (path.startsWith("studio_users?")) {
          return [{
            id: "uuid-user",
            airtable_record_id: "recUser1",
            email: "joseph.t.logan@gmail.com",
            display_name: "Joseph",
            user_status: "Active",
            active: true,
            user_key: "USR-JLOGAN",
            extras: { User_ID: "USR-JLOGAN" },
          }];
        }
        if (path.startsWith("studio_memberships?")) {
          return [{
            id: "uuid-mem",
            airtable_record_id: "recMem1",
            user_id: "uuid-user",
            organization_id: "uuid-org",
            role: "Owner",
            active: true,
            membership_status: "Active",
            membership_key: "MEM-1",
            is_default: true,
            extras: {
              Allowed_Brands: ["recBrand1"],
              Default_Brand: ["recBrand1"],
              Organization: ["recOrg1"],
            },
          }];
        }
        if (path.startsWith("organizations?")) {
          return [{
            id: "uuid-org",
            airtable_record_id: "recOrg1",
            name: "Chicago Shining",
            organization_key: "ORG-1",
            extras: { Organization_ID: "ORG-1" },
          }];
        }
        if (path.startsWith("brands?")) {
          return [{
            id: "uuid-brand",
            airtable_record_id: "recBrand1",
            name: "Chicago",
            brand_key: "BRD-1",
            extras: { Brand_ID: "BRD-1" },
          }];
        }
        return [];
      },
    },
  );
  assert.equal(result.authorized, true);
  assert.equal(result.user.record_id, "recUser1");
  assert.equal(result.user.user_id, "USR-JLOGAN");
  assert.equal(result.membership.record_id, "recMem1");
  assert.equal(result.organization.record_id, "recOrg1");
  assert.equal(result.brand.record_id, "recBrand1");
  assert.equal(result.role, "Owner");
  assert.equal(result.permissions.tenant_admin, true);
  assert.deepEqual(result.allowed_brands.map((row) => row.record_id), ["recBrand1"]);
  assert.ok(calls.some((path) => path.includes("studio_users?email=eq.")));
  assert.ok(calls.some((path) => path.includes("studio_memberships?user_id=eq.")));
});

test("loadAuthorizationFromSupabase returns the same unregistered error as Airtable", async () => {
  const result = await loadAuthorizationFromSupabase(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    },
    "missing@example.com",
    { email: "missing@example.com", source: "access", jwt_present: true },
    {
      rolePermissions: { Viewer: { tenant_admin: false } },
      supabaseRest: async () => [],
    },
  );
  assert.equal(result.authorized, false);
  assert.equal(result.authorization_error, "Authenticated user is not registered in Studio Users");
});

test("syncAuthTablesToSupabase skips when auth tables are absent", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 404,
    async text() {
      return JSON.stringify({ code: "PGRST205", message: "Could not find the table 'public.organizations' in the schema cache" });
    },
  });
  try {
    const result = await syncAuthTablesToSupabase({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "service-role",
    }, {
      listRecords: async () => [{ id: "recOrg1", fields: { Organization_Name: "X" } }],
    });
    assert.equal(result.ok, true);
    assert.equal(result.skipped, true);
    assert.equal(result.reason, "auth_tables_missing");
  } finally {
    globalThis.fetch = originalFetch;
  }
});
