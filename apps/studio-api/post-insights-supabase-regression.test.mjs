import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { studioSideTableRead, PLATFORM_OUTPUTS_TABLE_ID } from "./supabase-pipeline-reads.mjs";

const env = {
  STUDIO_WRITE_SOURCE: "supabase",
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "sb_secret_local_test_only",
  AIRTABLE_OUTPUT_TABLE_ID: PLATFORM_OUTPUTS_TABLE_ID,
};

const sample = {
  airtable_record_id: "recPublished00001",
  output_number: 9981,
  platform: "Instagram",
  published_at: "2026-11-17T20:00:00Z",
  do_not_publish: false,
  test_run_id: null,
  output_title: "Chicago published media",
  error_messages: {
    Insights_As_Of: "2026-11-18T18:00:00Z",
    Insights_Likes: 12,
  },
};

async function withPostgrestMock(run) {
  const originalFetch = globalThis.fetch;
  const urls = [];
  try {
    globalThis.fetch = async (url) => {
      const href = String(url);
      urls.push(href);
      assert.match(href, /\/rest\/v1\/platform_outputs\?/);
      return new Response(JSON.stringify([sample]), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    };
    await run(urls);
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("published Post Insights reads from Supabase without invalid timestamp-empty comparisons", async () => {
  await withPostgrestMock(async (urls) => {
    const filter = 'AND({Published_At}!="",{Do_Not_Publish}=0,{Test_Run_ID}=BLANK())';
    const params = new URLSearchParams();
    params.set("filterByFormula", filter);
    params.set("maxRecords", "25");
    params.set("sort[0][field]", "Published_At");
    params.set("sort[0][direction]", "desc");
    const response = await studioSideTableRead(env, PLATFORM_OUTPUTS_TABLE_ID, "?" + params);
    assert.equal(response.records.length, 1);
    assert.equal(response.records[0].fields.Insights_Likes, 12);
    const url = new URL(urls.at(-1));
    const and = url.searchParams.get("and");
    assert.match(and, /published_at\.not\.is\.null/);
    assert.doesNotMatch(and, /published_at\.(?:neq|eq)\./);
    assert.match(url.searchParams.get("order"), /^published_at\.desc\.nullslast/);
  });
});

test("analytics sweep's due-post predicate translates without a timestamp-empty comparison", async () => {
  await withPostgrestMock(async (urls) => {
    const filter = 'AND({Test_Run_ID}=BLANK(),{Published_At}!="",{Do_Not_Publish}=0,OR({Insights_Next_Sync_At}=BLANK(),IS_BEFORE({Insights_Next_Sync_At},NOW())))';
    const response = await studioSideTableRead(
      env, PLATFORM_OUTPUTS_TABLE_ID,
      "?filterByFormula=" + encodeURIComponent(filter) + "&maxRecords=8",
    );
    assert.equal(response.records.length, 1);
    const and = new URL(urls.at(-1)).searchParams.get("and");
    assert.match(and, /published_at\.not\.is\.null/);
    assert.match(and, /Insights_Next_Sync_At/);
    assert.doesNotMatch(and, /published_at\.(?:neq|eq)\./);
  });
});

test("blank published timestamps use null semantics, not equality with empty text", async () => {
  await withPostgrestMock(async (urls) => {
    await studioSideTableRead(
      env, PLATFORM_OUTPUTS_TABLE_ID,
      "?filterByFormula=" + encodeURIComponent("{Published_At}=BLANK()"),
    );
    const and = new URL(urls.at(-1)).searchParams.get("and");
    assert.match(and, /published_at\.is\.null/);
    assert.doesNotMatch(and, /published_at\.eq\./);
  });
});

test("analytics sweep samples enough due posts and allocates slots across platforms", async () => {
  const source = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function studioSweepPublishedInsights(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:studioSweepPublishedInsights__*/", start);
  assert.ok(start >= 0 && end > start);
  const sweep = source.slice(start, end);
  assert.match(sweep, /Math\.max\(perProfileLimit \* 12, 100\)/);
  assert.match(sweep, /sortField: "Published_At"/);
  assert.match(sweep, /const byPlatform = new Map\(/);
  assert.match(sweep, /for \(const platform of byPlatform\.keys\(\)\)/);
  assert.match(sweep, /selected\.push\(next\)/);
});
