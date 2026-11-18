import test from "node:test";
import assert from "node:assert/strict";
import {
  factorySupabaseApprovalRows, factorySupabaseGroupPreflight,
  factorySupabaseApprovalDisposition, factorySupabaseApproveOutput,
} from "./factory-supabase-approval.mjs";
import { factoryGlobalPolicy } from "./factory-batch-global-policy.mjs";

const BASE = "https://example.supabase.co";
const CDN = "https://media.chicagoshining.com/";
const PROFILE_UUID = "3d0d5221-9e53-4513-972c-67b70963a97d";
const PROFILE_ID = "recProfile1234567";
const CONTENT_UUID = "91cb9fd0-7c20-434c-b5ef-03af2832c940";
const CONTENT_ID = "recContent1234567";
const IDS = ["rec227PMjt8S8GPUh", "recmf5weGRf9qpsRS"];
const ISO = "2026-11-18T03:25:04.123456+00:00";
const env = {
  SUPABASE_URL: BASE,
  SUPABASE_SERVICE_ROLE_KEY: "fixture",
};
const policy = factoryGlobalPolicy({
  AIRTABLE_BASE_ID: "appe33zkZn35yirTL",
  FACTORY_BATCH_GLOBAL_APPROVALS_ENABLED: "true",
  FACTORY_BATCH_GLOBAL_MODE: "global_all_platforms_v2",
  FACTORY_BATCH_GLOBAL_MAX_TOTAL: "20",
  FACTORY_BATCH_GLOBAL_MAX_PER_PROFILE: "10",
  FACTORY_BATCH_GLOBAL_PRODUCTION_SIGNOFF: "explicit-review",
});
function output(id, number, state = "Ready for Review") {
  return {
    id: number === 8946 ? "04c0ce14-c783-40b5-9c9e-05503fc823fb" : "19fb3c87-53dc-44ae-bedd-a2c05767b594",
    airtable_record_id: id, output_number: number,
    content_item_id: CONTENT_UUID, content_item_airtable_id: CONTENT_ID,
    content_profile_id: PROFILE_UUID,
    platform: number === 8946 ? "Instagram" : "Facebook",
    studio_output_type: number === 8946 ? "Carousel" : "Multi-Image Post",
    output_title: "Weekend CTA Transfer Hack",
    output_status: state, review_status: state === "Ready for Review" ? "Review Sent" : "Approved",
    publish_status: state === "Ready for Review" ? "Not Ready" : "Ready to Schedule",
    render_status: "Native Photo Route", do_not_publish: false, test_run_id: null,
    output_caption: "Chicago CTA transfer advice",
    studio_preview_url: CDN + "studio/previews/lettered/1.jpg",
    thumbnail_url: CDN + "studio/previews/thumbnails/1.jpg",
    selected_clip_count: 2,
    selected_assets: { selected_clips: [
      { url: CDN + "studio/previews/lettered/1.jpg" },
      { url: CDN + "studio/previews/lettered/2.jpg" },
    ] },
    error_messages: {}, auto_publish_enabled: false, scheduled_post_date: null,
    studio_scheduled_at: null, youtube_scheduled_publish_at: null, published_at: null,
    updated_at: ISO,
  };
}
function mockSupabase(t, seed) {
  const rows = seed.map(row => structuredClone(row)), calls = [];
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, BASE, "zero Airtable or external publishing egress");
    calls.push({ method: init.method || "GET", path: u.pathname, query: u.search, body: init.body });
    if (u.pathname.endsWith("/platform_outputs")) {
      if ((init.method || "GET") === "PATCH") {
        const row = rows.find(x => x.id === u.searchParams.get("id").slice(3));
        assert.ok(row, "only exact output can be patched");
        assert.equal(u.searchParams.get("airtable_record_id"), "eq." + row.airtable_record_id);
        assert.equal(u.searchParams.get("output_status"), "eq.Ready for Review");
        assert.equal(u.searchParams.get("updated_at"), "eq." + row.updated_at);
        assert.match(String(init.headers.Prefer), /return=representation/);
        const body = JSON.parse(init.body);
        assert.equal(body.auto_publish_enabled, false);
        assert.equal(body.scheduled_post_date, null);
        assert.equal(body.publish_status, "Ready to Schedule");
        Object.assign(row, body);
        return Response.json([row]);
      }
      const ids = String(u.searchParams.get("airtable_record_id")).match(/^in\.\((.*)\)$/)?.[1].split(",") || [];
      return Response.json(rows.filter(x => ids.includes(x.airtable_record_id)));
    }
    if (u.pathname.endsWith("/content_items")) {
      return Response.json([{ id: CONTENT_UUID, airtable_record_id: CONTENT_ID, content_profile_id: PROFILE_UUID }]);
    }
    if (u.pathname.endsWith("/content_profiles")) {
      return Response.json([{ id: PROFILE_UUID, airtable_record_id: PROFILE_ID }]);
    }
    throw Error("Unexpected Supabase endpoint: " + u.pathname);
  };
  return { rows, calls };
}

test("Supabase preflight accepts visible RFR outputs even if Airtable is unavailable", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const records = await factorySupabaseGroupPreflight(env, [IDS[0]], policy);
  assert.equal(records.length, 1);
  assert.equal(records[0].profile_id, PROFILE_ID);
  assert.equal(records[0].output_id, 8946);
  assert.ok(mock.calls.every(call => call.method === "GET"));
  assert.equal(mock.calls.filter(call => /platform_outputs/.test(call.path)).length, 1);
});

test("mixed already-approved and Ready-for-Review selection accepts and does not reapprove", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946, "Approved for Publishing"), output(IDS[1], 8948)]);
  const batch = await factorySupabaseGroupPreflight(env, IDS, policy);
  assert.deepEqual(batch.map(item => item.output_id), [8946, 8948]);
  const already = await factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "factory_test_mixed",
  });
  assert.equal(already.already_approved, true);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
  const fresh = await factorySupabaseApproveOutput(env, IDS[1], PROFILE_ID, {
    requestId: "factory_test_mixed",
    policy,
    verifyImages: async readiness => readiness,
  });
  assert.match(fresh.message, /Ready to Schedule/);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 1);
  assert.equal(mock.rows[1].output_status, "Approved for Publishing");
  assert.equal(mock.rows[1].review_status, "Approved");
  assert.equal(mock.rows[1].publish_status, "Ready to Schedule");
  assert.equal(mock.rows[1].scheduled_post_date, null);
  assert.equal(mock.rows[1].auto_publish_enabled, false);
  assert.equal(mock.rows[1].error_messages.SM_Factory_Supabase_Approval_Receipt.request_id,
    "factory_test_mixed");
});

test("hold or wrong profile fails closed without PATCH", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const wrong = await factorySupabaseApprovalRows(env, [IDS[0]]);
  assert.equal(factorySupabaseApprovalDisposition(wrong.get(IDS[0]), policy).eligible, true);
  await assert.rejects(
    factorySupabaseApproveOutput(env, IDS[0], "recWrongProfile01",
      { requestId: "factory_test_wrong", verifyImages: async readiness => readiness }),
    /ownership changed/,
  );
  mock.rows[0].do_not_publish = true;
  await assert.rejects(factorySupabaseGroupPreflight(env, [IDS[0]], policy), /publishing hold/);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});

test("approval requires positive public media verification before any write", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  await assert.rejects(
    factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
      requestId: "factory_test_unverified",
      verifyImages: async readiness => ({ ...readiness, readiness: "BLOCKED" }),
    }),
    /public review media could not be verified/,
  );
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});

test("conditional update rejects concurrent status/version change and never retries blind", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const prior = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === "PATCH") {
      mock.rows[0].output_status = "Changes Requested";
      mock.rows[0].updated_at = "2026-11-18T03:25:09.000000+00:00";
      return Response.json([]);
    }
    return prior(url, init);
  };
  await assert.rejects(
    factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
      requestId: "factory_test_cas",
      verifyImages: async readiness => readiness,
    }),
    /Output changed during Supabase approval/,
  );
  assert.equal(mock.rows[0].output_status, "Changes Requested");
  assert.equal(mock.rows[0].review_status, "Review Sent");
});

test("single-profile Factory pilot cannot approve a Carousel after preflight", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const pilotRollout = {
    enabled: true, mode: "chicago_ig_reel_v1", profile_id: PROFILE_ID,
    platform: "Instagram", output_type: "Reel", max_items: 1,
  };
  await assert.rejects(
    factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
      requestId: "factory_test_pilot_scope", pilotRollout,
      verifyImages: async readiness => readiness,
    }),
    /outside the authorized Factory pilot/,
  );
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});
