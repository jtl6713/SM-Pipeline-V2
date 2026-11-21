import test from "node:test";
import assert from "node:assert/strict";
import { resolveOwnerOrganizationForProfile, loadOwnerGenerationForProfile } from "./owner-generation-supabase.mjs";

const profile = (fields) => ({ id: "rec12345678901234", fields });
const env = {};
const org = "rec00000000000001";
test("explicit linked organization is used without any ambiguous brand query", async () => {
  const actual = await resolveOwnerOrganizationForProfile(env, "rec12345678901234", {
    readProfile: async () => profile({ Organization: [org], Brand_Name: "Chicago" }),
    rest: async () => { throw new Error("Unexpected brand lookup"); },
  });
  assert.equal(actual, org);
});
test("brand link resolves Supabase organization; global prompt is owner-scoped", async () => {
  const requests = [];
  const deps = {
    readProfile: async () => profile({ Brand: ["rec12345678901234"], Brand_Name: "Chicago" }),
    rest: async (_, query) => {
      requests.push(query);
      return query.startsWith("brands?")
        ? [{ organization_id: "11111111-2222-3333-4444-555555555555" }]
        : [{ airtable_record_id: org }];
    },
    readSetting: async (_, name) => {
      assert.equal(name, `Studio_Owner_Generation_${org}`);
      return { fields: { Setting_Value: JSON.stringify({ prompt: "Owner tone", revision: "revision" }) } };
    },
  };
  const found = await loadOwnerGenerationForProfile(env, "rec12345678901234", deps);
  assert.equal(found.prompt, "Owner tone");
  assert.equal(found.organization_id, org);
  assert.equal(requests.length, 2);
});
test("ambiguous duplicate brand names never leak owner prompts across organizations", async () => {
  let settingReads = 0;
  const found = await loadOwnerGenerationForProfile(env, "rec12345678901234", {
    readProfile: async () => profile({ Brand_Name: "CommonBrand" }),
    rest: async () => [{ organization_id: "11111111-2222-3333-4444-555555555555" }, { organization_id: "99999999-2222-3333-4444-555555555555" }],
    readSetting: async () => { settingReads += 1; return null; },
  });
  assert.equal(found.prompt, "");
  assert.equal(found.organization_id, null);
  assert.equal(settingReads, 0);
});
test("missing brand and organization return empty rather than unrelated global guidance", async () => {
  assert.equal(await resolveOwnerOrganizationForProfile(env, "rec12345678901234", {
    readProfile: async () => profile({}),
  }), null);
});
