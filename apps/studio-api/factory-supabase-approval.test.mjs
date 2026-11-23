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
    selected_assets: { selected_clips: [1, 2].map(n => ({
      order: n, url: CDN + "studio/previews/lettered/" + n + ".jpg",
      googleDriveFileId: "google_drive_variant_id_" + n + "_123456",
      mediaAssetRecordId: "rec" + String(n).padStart(14, "A"),
    })) },
    render_clip_list: [1, 2].map(n => ({
      order: n, url: CDN + "studio/previews/lettered/" + n + ".jpg",
      googleDriveFileId: "google_drive_variant_id_" + n + "_123456",
      mediaAssetRecordId: "rec" + String(n).padStart(14, "A"),
    })),
    error_messages: {}, auto_publish_enabled: false, scheduled_post_date: null,
    studio_scheduled_at: null, youtube_scheduled_publish_at: null, published_at: null,
    updated_at: ISO,
  };
}
function mockSupabase(t, seed, { timeZone = "America/Chicago", missingSlides = false } = {}) {
  const rows = seed.map(row => structuredClone(row)), calls = [];
  const savedFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = savedFetch; });
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(url);
    assert.equal(u.origin, BASE, "zero Airtable or external publishing egress");
    calls.push({ method: init.method || "GET", path: u.pathname, query: u.search, body: init.body });
    if (u.pathname.endsWith("/platform_outputs")) {
      if (u.searchParams.has("scheduled_post_date") && u.searchParams.has("content_profile_id")) {
        const id = String(u.searchParams.get("content_profile_id")).replace(/^eq\./, "");
        const platform = String(u.searchParams.get("platform")).replace(/^eq\./, "");
        const lower = Date.parse(String(u.searchParams.getAll("scheduled_post_date")[0] || "").replace(/^gt\./, ""));
        const upper = Date.parse(String(u.searchParams.getAll("scheduled_post_date")[1] || "").replace(/^lt\./, ""));
        const matches = rows.filter(x => x.content_profile_id === id && x.platform === platform
          && Date.parse(x.scheduled_post_date) > lower && Date.parse(x.scheduled_post_date) < upper);
        const offset = Number(u.searchParams.get("offset") || 0);
        const limit = Number(u.searchParams.get("limit") || 500);
        return Response.json(matches.slice(offset, offset + limit));
      }
      if ((init.method || "GET") === "PATCH") {
        const row = rows.find(x => x.id === u.searchParams.get("id").slice(3));
        assert.ok(row, "only exact output can be patched");
        assert.equal(u.searchParams.get("airtable_record_id"), "eq." + row.airtable_record_id);
        assert.equal(u.searchParams.get("output_status"), "eq.Ready for Review");
        assert.equal(u.searchParams.get("updated_at"), "eq." + row.updated_at);
        assert.match(String(init.headers.Prefer), /return=representation/);
        const body = JSON.parse(init.body);
        assert.equal(body.publish_method, "Automated");
        assert.equal(body.auto_publish_enabled, true);
        assert.ok(Date.parse(body.scheduled_post_date) > Date.now(), "must reserve a future time");
        assert.equal(body.studio_scheduled_at, body.scheduled_post_date);
        assert.equal(body.error_messages.SM_Factory_Supabase_Approval_Receipt.scheduled, true);
        assert.equal(body.publish_status, "Ready to Schedule");
        Object.assign(row, body);
        return Response.json([row]);
      }
      const ids = String(u.searchParams.get("airtable_record_id")).match(/^in\.\((.*)\)$/)?.[1].split(",") || [];
      return Response.json(rows.filter(x => ids.includes(x.airtable_record_id)));
    }
    if (u.pathname.endsWith("/carousel_slides")) {
      if (missingSlides) return Response.json([]);
      const selectedNumber = Number(
        String(u.searchParams.get("fields->PO_Output_ID") || "").match(/\[(\d+)\]/)?.[1] || 0);
      const row = rows.find(item => item.output_number === selectedNumber);
      return Response.json(row ? row.selected_assets.selected_clips.map((clip, i) => ({
        airtable_record_id: "native-test-slide-" + selectedNumber + "-" + i,
        current_order: i + 1, deleted_from_carousel: false,
        fields: {
          "Platform Output": [row.airtable_record_id],
          PO_Output_ID: [row.output_number],
          "Slide Number": i + 1,
          "Final Image URL": clip.url,
          "Asset_4x5_Public_URL": clip.url,
          "Asset_Family_Key": clip.mediaAssetRecordId,
          "Google Drive File ID": clip.googleDriveFileId,
          "Asset_4x5_Public_Status": "Ready",
          "Shared_Asset_Approved": true,
          "Approved For Final": true,
        },
      })) : []);
    }
    if (u.pathname.endsWith("/content_items")) {
      return Response.json([{ id: CONTENT_UUID, airtable_record_id: CONTENT_ID, content_profile_id: PROFILE_UUID }]);
    }
    if (u.pathname.endsWith("/content_profiles")) {
      return Response.json([{ id: PROFILE_UUID, airtable_record_id: PROFILE_ID,
        market_name: timeZone === "America/Los_Angeles" ? "Los Angeles" : "Chicago",
        platform_setup: { Timezone: timeZone } }]);
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
  assert.ok(Date.parse(mock.rows[1].scheduled_post_date) > Date.now());
  assert.equal(mock.rows[1].studio_scheduled_at, mock.rows[1].scheduled_post_date);
  assert.equal(mock.rows[1].auto_publish_enabled, true);
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

test("Supabase Factory reports only genuinely reached live stages", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const seen = [];
  const approved = await factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "factory_live_stages_20261120",
    verifyImages: async readiness => readiness,
    onStage: async phase => {
      seen.push({ phase, writes: mock.calls.filter(call => call.method === "PATCH").length });
    },
  });
  assert.match(approved.message, /Ready to Schedule/);
  assert.deepEqual(seen.map(row => row.phase), ["validating", "approving", "verifying"]);
  assert.deepEqual(seen.map(row => row.writes), [0, 0, 1]);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 1);
});

test("Supabase Factory never reports Approving or Verifying when creative validation fails", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)]);
  const stages = [];
  await assert.rejects(factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "factory_live_no_unsafe_write_20261120",
    verifyImages: async readiness => ({ ...readiness, readiness: "BLOCKED" }),
    onStage: async phase => stages.push(phase),
  }), /public review media could not be verified/);
  assert.deepEqual(stages, ["validating"]);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});


test("Factory cannot commit Approved without a publisher-capable platform", async t => {
  const row = output(IDS[0], 8946);
  row.platform = "X";
  const mock = mockSupabase(t, [row]);
  await assert.rejects(factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "unsupported-publisher", verifyImages: async readiness => readiness,
  }), /no supported automated publisher/);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});

test("Factory approval writes future profile-local MAE date in the SAME Supabase CAS", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)], { timeZone: "America/Los_Angeles" });
  const approved = await factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "factory-atomic-profile-local", verifyImages: async readiness => readiness,
  });
  const row = mock.rows[0];
  assert.ok(approved.scheduled_ms > Date.now());
  assert.equal(approved.scheduled_ms, Date.parse(row.scheduled_post_date));
  assert.equal(row.auto_publish_enabled, true);
  assert.equal(row.publish_status, "Ready to Schedule");
  assert.equal(row.error_messages.SM_Factory_Supabase_Approval_Receipt.scheduled_timezone,
    "America/Los_Angeles");
  assert.equal(row.error_messages.SM_Factory_Supabase_Approval_Receipt.scheduled_for,
    row.scheduled_post_date);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 1,
    "no intermediate Approved/no-date update may exist");
  assert.ok(mock.calls.some(call => call.path.endsWith("/platform_outputs")
    && call.query.includes("scheduled_post_date=gt.")), "must read actual Supabase occupancy");
});


test("explicit manual method cannot be silently converted to automatic publication", async t => {
  const row = output(IDS[0], 8946);
  row.publish_method = "Manual";
  const mock = mockSupabase(t, [row]);
  await assert.rejects(factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "manual-method-held", verifyImages: async readiness => readiness,
  }), /explicitly configured for manual publishing/);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});


test("issue #2294: Factory preflight and final approval both reject missing 8-image native slide packages", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946)], { missingSlides: true });
  await assert.rejects(
    factorySupabaseGroupPreflight(env, [IDS[0]], policy),
    /native_gallery_slide_count_mismatch/,
  );
  await assert.rejects(
    factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
      requestId: "issue2294-no-slides",
      verifyImages: async readiness => readiness,
    }),
    /native_gallery_slide_count_mismatch/,
  );
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});

test("#2618: unresolved media QA blocks exact Supabase Factory approval even without Do_Not_Publish", async t => {
  const row = output(IDS[0], 8946);
  row.do_not_publish = false;
  row.error_messages = { SM_2618_Creative_QA_Hold: {
    state: "unresolved_requires_creative_correction", publishing_permitted: false
  }};
  const mock = mockSupabase(t, [row]);
  const entries = await factorySupabaseApprovalRows(env, [IDS[0]]);
  const disposition = factorySupabaseApprovalDisposition(entries.get(IDS[0]), policy);
  assert.equal(disposition.eligible, false);
  assert.match(disposition.reason, /unresolved creative QA media correction/);
  await assert.rejects(factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId: "blocked-by-creative-review",
    verifyImages: async readiness => readiness,
  }), /unresolved creative QA media correction/);
  assert.equal(mock.calls.filter(call => call.method === "PATCH").length, 0);
});

test("#2618: future Factory receipt includes authenticated submission actor; legacy stays unverified", async t => {
  const mock = mockSupabase(t, [output(IDS[0], 8946),output(IDS[1],8948)]);
  await factorySupabaseApproveOutput(env, IDS[0], PROFILE_ID, {
    requestId:"factory_provenance_explicit", approvedByUserRecordId:"recAuthUser123456",
    verifyImages: async r => r,
  });
  const proven = mock.rows[0].error_messages.SM_Factory_Supabase_Approval_Receipt;
  assert.equal(proven.approval_actor_record_id,"recAuthUser123456");
  assert.equal(proven.actor_provenance,"authenticated_factory_submission");
  await factorySupabaseApproveOutput(env, IDS[1], PROFILE_ID, {
    requestId:"factory_provenance_legacy", verifyImages: async r => r,
  });
  const legacy = mock.rows[1].error_messages.SM_Factory_Supabase_Approval_Receipt;
  assert.equal(legacy.approval_actor_record_id,null);
  assert.equal(legacy.actor_provenance,"legacy_batch_actor_not_captured");
});
