import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  listSupabasePipelineGlobalSearch,
  pipelineSearchNumericId,
  pipelineTitleSearchLike,
} from "./supabase-pipeline-reads.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const reads = fs.readFileSync(path.join(dir, "supabase-pipeline-reads.mjs"), "utf8");
const worker = fs.readFileSync(path.join(dir, "worker-functions-03.mjs"), "utf8");
const app = fs.readFileSync(path.join(dir, "../studio-web/assets/app-item4-1008.js"), "utf8");

test("pipeline search accepts content and output ID forms", () => {
  assert.equal(pipelineSearchNumericId("1074"), 1074);
  assert.equal(pipelineSearchNumericId("#1074"), 1074);
  assert.equal(pipelineSearchNumericId("content 1074"), 1074);
  assert.equal(pipelineSearchNumericId("Content ID 1074"), 1074);
  assert.equal(pipelineSearchNumericId("output 5963"), 5963);
  assert.equal(pipelineSearchNumericId("po 5963"), 5963);
  assert.equal(pipelineSearchNumericId("platform output 5963"), 5963);
  assert.equal(pipelineSearchNumericId("Domino park soundscape"), null);
  assert.equal(pipelineSearchNumericId("  "), null);
});

test("pipeline search keeps title token matching for non-ID queries", () => {
  assert.equal(pipelineTitleSearchLike("Domino park soundscape"), "*domino*park*soundscape*");
});

test("authorized route exposes profile-wide pipeline_search", () => {
  assert.ok(worker.includes('mode") === "pipeline_search"'));
  assert.ok(worker.includes("listSupabasePipelineGlobalSearch(env"));
  assert.ok(worker.includes('mode: "pipeline_search"'));
  assert.ok(reads.includes("export async function listSupabasePipelineGlobalSearch"));
  assert.ok(reads.includes('matched_by: matchedBy'));
});

test("Pipeline UI asks the server for global search and expands content packages", () => {
  assert.match(app, /mode=pipeline_search/);
  assert.match(app, /pipelineGlobalSearchActive/);
  assert.match(app, /Searching the pipeline database/);
  assert.match(app, /content ID, output ID, or title/);
});

test("global search hydrates every sibling output for a content or output ID hit", async () => {
  const originalFetch = globalThis.fetch;
  const observed = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const type = parsed.pathname.split("/").at(-1);
    observed.push({ type, parsed });
    let data;
    if (type === "content_profiles" && parsed.searchParams.has("airtable_record_id")) {
      data = [{ id: "profile-uuid", airtable_record_id: "recProfileA" }];
    } else if (type === "content_items" && parsed.searchParams.has("content_number")) {
      data = parsed.searchParams.get("content_number") === "eq.1074" ? [{
        id: "item-uuid-1074",
        airtable_record_id: "recItem1074",
        content_number: 1074,
        content_title: "Domino Park Soundscape",
        created_at: "2026-10-18T10:00:01Z",
        production_request_id: null,
        platform_output_count: 6,
      }] : [];
    } else if (type === "content_items" && parsed.searchParams.get("id")?.startsWith("in.(")) {
      data = [{
        id: "item-uuid-1074",
        airtable_record_id: "recItem1074",
        content_number: 1074,
        content_title: "Domino Park Soundscape",
        created_at: "2026-10-18T10:00:01Z",
        production_request_id: null,
        platform_output_count: 6,
      }];
    } else if (type === "platform_outputs" && parsed.searchParams.get("output_number") === "eq.5963") {
      data = [{ content_item_id: "item-uuid-1074" }];
    } else if (type === "platform_outputs" && parsed.searchParams.get("content_item_id")?.startsWith("in.(")) {
      data = [5963, 5964, 5965].map((n, i) => ({
        id: `output-uuid-${n}`,
        airtable_record_id: `recOutput${n}`,
        output_number: n,
        platform: ["instagram", "facebook", "tiktok"][i],
        output_title: "Domino Park Soundscape",
        content_item_id: "item-uuid-1074",
        content_profile_id: "profile-uuid",
        content_items: {
          airtable_record_id: "recItem1074",
          content_number: 1074,
          content_title: "Domino Park Soundscape",
        },
        content_profiles: { airtable_record_id: "recProfileA" },
        created_at: "2026-10-18T10:01:33Z",
      }));
    } else {
      throw new Error("Unexpected Supabase resource: " + type + " " + parsed.search);
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const byContent = await listSupabasePipelineGlobalSearch({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    }, { profileAirtableId: "recProfileA", query: "1074" });
    assert.equal(byContent.matched_by, "content_id");
    assert.equal(byContent.content_ids[0], 1074);
    assert.equal(byContent.content_groups[0].title, "Domino Park Soundscape");
    assert.equal(byContent.records.length, 3);

    const byOutput = await listSupabasePipelineGlobalSearch({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    }, { profileAirtableId: "recProfileA", query: "output 5963" });
    assert.equal(byOutput.matched_by, "output_id");
    assert.equal(byOutput.records.length, 3);
    assert.ok(observed.some((row) => row.type === "platform_outputs"
      && row.parsed.searchParams.get("content_item_id")?.includes("item-uuid-1074")));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("global title search expands matched content packages", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const parsed = new URL(String(url));
    const type = parsed.pathname.split("/").at(-1);
    let data = [];
    if (type === "content_profiles" && parsed.searchParams.has("airtable_record_id")) {
      data = [{ id: "profile-uuid", airtable_record_id: "recProfileA" }];
    } else if (type === "content_items" && parsed.searchParams.get("content_title")?.includes("ilike.")) {
      data = [{
        id: "item-uuid-1074",
        airtable_record_id: "recItem1074",
        content_number: 1074,
        content_title: "Domino Park Soundscape",
        created_at: "2026-10-18T10:00:01Z",
        production_request_id: null,
        platform_output_count: 2,
      }];
    } else if (type === "platform_outputs" && parsed.search.includes("ilike.")) {
      data = [{ content_item_id: "item-uuid-1074" }];
    } else if (type === "platform_outputs" && parsed.searchParams.get("content_item_id")?.startsWith("in.(")) {
      data = [1, 2].map((n) => ({
        id: `output-uuid-${n}`,
        airtable_record_id: `recOutput${n}`,
        output_number: 5900 + n,
        platform: n === 1 ? "instagram" : "facebook",
        output_title: "Domino Park Soundscape",
        content_item_id: "item-uuid-1074",
        content_profile_id: "profile-uuid",
        content_items: {
          airtable_record_id: "recItem1074",
          content_number: 1074,
          content_title: "Domino Park Soundscape",
        },
        content_profiles: { airtable_record_id: "recProfileA" },
      }));
    } else if (type === "content_items") {
      data = [];
    } else {
      throw new Error("Unexpected: " + type + " " + parsed.search);
    }
    return new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json" } });
  };
  try {
    const result = await listSupabasePipelineGlobalSearch({
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_SERVICE_ROLE_KEY: "test",
    }, { profileAirtableId: "recProfileA", query: "Domino park soundscape" });
    assert.equal(result.matched_by, "title");
    assert.equal(result.content_groups.length, 1);
    assert.equal(result.records.length, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
