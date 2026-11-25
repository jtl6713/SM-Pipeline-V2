import test from "node:test";
import assert from "node:assert/strict";
import { studioSideTableRead, IDEA_CANDIDATES_TABLE_ID, CONTENT_ITEMS_TABLE_ID } from "./supabase-pipeline-reads.mjs";
import { studioFindRecentDuplicateTitle, studioIdeaTitleYearFormula } from "./idea-title-uniqueness.mjs";
const env = { SUPABASE_URL: "https://example.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "test-key", STUDIO_WRITE_SOURCE: "supabase" };
const params = (formula, pageSize = 100, offset = "") => "?" + new URLSearchParams({filterByFormula:formula,pageSize:String(pageSize), ...(offset ? {offset}: {})});
test("canonical title guard supports both Idea and Content history on first storyboard save", async () => {
  const original = globalThis.fetch;
  const urls = [];
  try {
    globalThis.fetch = async url => { urls.push(new URL(url)); return Response.json([]); };
    const result = await studioFindRecentDuplicateTitle("Zoo Miami 6", async (kind, formula) =>
      (await studioSideTableRead(env, kind === "idea" ? IDEA_CANDIDATES_TABLE_ID : CONTENT_ITEMS_TABLE_ID, params(formula))).records);
    assert.equal(result, null);
    assert.equal(urls.length, 2);
    assert.match(urls[0].pathname,/idea_candidates$/);
    assert.match(urls[1].pathname,/content_items$/);
    assert.match(urls[0].searchParams.get("candidate_title"),/^imatch\./);
    assert.match(urls[1].searchParams.get("content_title"),/^imatch\./);
    assert.match(urls[0].searchParams.get("or"),/Test_Run_ID/);
    assert.equal(urls[1].searchParams.has("or"),false);
    assert.match(urls[0].searchParams.get("created_at"),/^gt\./);
  } finally { globalThis.fetch = original; }
});
test("duplicate title history is paginated and shaped for existing guard", async () => {
  const original = globalThis.fetch;
  const formula = studioIdeaTitleYearFormula("Zoo Miami","Candidate_Title");
  try {
    globalThis.fetch = async url => {
      const offset = new URL(url).searchParams.get("offset");
      return Response.json(offset === "0" ? [{airtable_record_id:"recAAAAAAAAAAAAAA",candidate_title:"Zoo Miami 2"}] : []);
    };
    const page = await studioSideTableRead(env,IDEA_CANDIDATES_TABLE_ID,params(formula,1));
    assert.equal(page.offset,"1");
    assert.deepEqual(page.records,[{id:"recAAAAAAAAAAAAAA",fields:{Candidate_Title:"Zoo Miami 2"}}]);
    const last = await studioSideTableRead(env,IDEA_CANDIDATES_TABLE_ID,params(formula,1,page.offset));
    assert.deepEqual(last,{records:[]});
    assert.deepEqual(await studioFindRecentDuplicateTitle("Zoo Miami", async () => page.records),{source:"idea",record_id:"recAAAAAAAAAAAAAA"});
  } finally { globalThis.fetch = original; }
});
test("malformed canonical response and unavailable database fail closed", async () => {
  const original = globalThis.fetch;
  const path = params(studioIdeaTitleYearFormula("Zoo Miami","Candidate_Title"));
  try {
    globalThis.fetch = async () => Response.json({unexpected:true});
    await assert.rejects(()=>studioSideTableRead(env,IDEA_CANDIDATES_TABLE_ID,path),/Incomplete canonical title history/);
    globalThis.fetch = async () => Response.json({message:"unavailable"},{status:503});
    await assert.rejects(()=>studioSideTableRead(env,IDEA_CANDIDATES_TABLE_ID,path),/failed 503/);
    await assert.rejects(()=>studioSideTableRead(env,IDEA_CANDIDATES_TABLE_ID,params(studioIdeaTitleYearFormula("Zoo Miami","Candidate_Title"),100,"-1")),/pagination invalid/);
  } finally { globalThis.fetch = original; }
});
