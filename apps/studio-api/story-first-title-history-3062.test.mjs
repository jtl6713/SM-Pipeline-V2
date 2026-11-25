import test from "node:test";
import assert from "node:assert/strict";
import { studioSideTableRead, studioTitleHistoryPrefix } from "./supabase-pipeline-reads.mjs";
import { studioIdeaTitleYearFormula, studioFindRecentDuplicateTitle } from "./idea-title-uniqueness.mjs";

const title = "Zoo Miami Guide: Best Time, Must-Sees & Costs";
const env = { STUDIO_WRITE_SOURCE: "supabase", SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key" };
const ids = { idea: "tblTQapddqD47GOIG", content: "Content Items" };
const makeQuery = (formula, offset = 0, pageSize = 100) => "?" + new URLSearchParams({
  filterByFormula: formula, maxRecords: "1001", pageSize: String(pageSize), offset: String(offset),
});
test("only exact dedup formula is allowed for both title tables", () => {
  for (const [kind, field] of [["idea", "Candidate_Title"], ["content", "Content_Title"]]) {
    const formula = studioIdeaTitleYearFormula(title, field);
    assert.equal(studioTitleHistoryPrefix(kind, formula), "zoomiami");
    assert.equal(studioTitleHistoryPrefix(kind, formula.replace("-365", "-366")), null);
    assert.equal(studioTitleHistoryPrefix(kind, formula + "OR(1)"), null);
  }
  assert.equal(studioTitleHistoryPrefix("output", studioIdeaTitleYearFormula(title, "Candidate_Title")), null);
});
test("real compatibility dispatch checks both canonical tables and preserves duplicate detection", async () => {
  const oldFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    requests.push(parsed);
    const isIdea = parsed.pathname.endsWith("/idea_candidates");
    const key = isIdea ? "candidate_title" : "content_title";
    assert.equal(parsed.searchParams.get("select"), "airtable_record_id," + key);
    assert.equal(parsed.searchParams.get(key), "imatch.^[^a-z0-9]*z[^a-z0-9]*o[^a-z0-9]*o[^a-z0-9]*m[^a-z0-9]*i[^a-z0-9]*a[^a-z0-9]*m[^a-z0-9]*i");
    assert.ok(parsed.searchParams.get("created_at").startsWith("gt."));
    if (isIdea) assert.ok(parsed.searchParams.get("and").includes("Test_Run_ID.is.null"));
    return new Response(JSON.stringify(isIdea ? [] : [{airtable_record_id:"rec12345678901234",content_title:title}]));
  };
  try {
    const result = await studioFindRecentDuplicateTitle(title, async (kind, formula) => {
      const data = await studioSideTableRead(env, ids[kind], makeQuery(formula));
      return data.records;
    });
    assert.equal(result.source, "content");
    assert.equal(requests.length, 2);
  } finally { globalThis.fetch = oldFetch; }
});
test("title lookup returns next offset for a full page and fails closed on malformed DB responses", async () => {
  const oldFetch = globalThis.fetch;
  const formula = studioIdeaTitleYearFormula(title, "Candidate_Title");
  globalThis.fetch = async (url) => {
    const parsed = new URL(url);
    assert.equal(parsed.searchParams.get("offset"), "100");
    assert.equal(parsed.searchParams.get("limit"), "1");
    return new Response(JSON.stringify([{airtable_record_id:"rec12345678901234",candidate_title:title}]));
  };
  try {
    const page = await studioSideTableRead(env, ids.idea, makeQuery(formula, 100, 1));
    assert.equal(page.offset, "101");
    assert.equal(page.records.length, 1);
    globalThis.fetch = async () => new Response(JSON.stringify({error:"invalid"}));
    await assert.rejects(() => studioSideTableRead(env, ids.idea, makeQuery(formula)), /invalid rows/);
  } finally { globalThis.fetch = oldFetch; }
});
