import test from "node:test";
import assert from "node:assert/strict";
import {
  mapOrganizationAuthRow,
  mapBrandAuthRow,
  mapUserAuthRow,
  mapMembershipAuthRow,
  syncAuthTablesToSupabase,
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
