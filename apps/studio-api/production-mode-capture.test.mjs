import test from "node:test";
import assert from "node:assert/strict";
import { newIdeaProductionCapture, splitIdeaProductionCapture, projectIdeaProductionMode, ideaProductionModeSelect } from "./production-mode-capture.mjs";
import { studioSideTableCommit, airtableShapedIdeaFromSupabase } from "./supabase-pipeline-reads.mjs";

const enabled={STUDIO_PRODUCTION_MODE_CAPTURE:"true",SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"sb_secret_test"};
const id="rec12345678901234";
const sourceFields={Studio_Production_Mode:"automatic",Studio_Production_Source:"idea"};
const response=rows=>new Response(JSON.stringify(rows),{status:200,headers:{"content-type":"application/json"}});

test("capture is disabled by default and never authorizes a manual opt-in yet",()=>{
  assert.deepEqual(newIdeaProductionCapture({},"idea"),{});
  assert.equal(ideaProductionModeSelect({}),"");
  assert.equal(ideaProductionModeSelect(enabled),",production_mode,production_source");
  assert.deepEqual(newIdeaProductionCapture(enabled,"script_a_short"),{
    Studio_Production_Mode:"automatic",Studio_Production_Source:"script_a_short",
  });
  assert.throws(()=>splitIdeaProductionCapture(enabled,{...sourceFields,Studio_Production_Mode:"manual"},{creating:true}),/Invalid/);
});
test("ordinary edits and forged JSON markers cannot overwrite typed mode",()=>{
  const capture=splitIdeaProductionCapture(enabled,{...sourceFields,Candidate_Title:"Edited"},{creating:false});
  assert.deepEqual(capture,{fields:{Candidate_Title:"Edited"},typed:{}});
  assert.deepEqual(projectIdeaProductionMode({},sourceFields),{});
  assert.deepEqual(projectIdeaProductionMode({production_source:"script_a_short",production_mode:"manual"},sourceFields),{});
  assert.deepEqual(projectIdeaProductionMode({production_source:"idea",production_mode:"manual"},sourceFields),{
    Studio_Production_Source:"idea",Studio_Production_Mode:"manual",
  });
});
test("Supabase record projection uses only typed mode and source, not payload",()=>{
  const raw={airtable_record_id:id,payload:{...sourceFields,Candidate_Title:"Test"}};
  assert.equal(airtableShapedIdeaFromSupabase(raw).fields.Studio_Production_Mode,undefined);
  assert.equal(airtableShapedIdeaFromSupabase({...raw,production_mode:"manual",production_source:"idea"}).fields.Studio_Production_Mode,"manual");
});
test("new Idea capture writes typed mode once in the same insert and returns committed receipt",async()=>{
  const original=globalThis.fetch;
  const writes=[];
  try {
    globalThis.fetch=async(url,init)=>{
      const href=String(url),method=String(init?.method||"GET").toUpperCase();
      if(method==="POST"&&href.includes("/idea_candidates?")){
        const body=JSON.parse(init.body);
        writes.push({href,body});
        return response([{airtable_record_id:body[0].airtable_record_id,payload:{...body[0].payload,Candidate_ID:42},production_mode:body[0].production_mode,production_source:body[0].production_source}]);
      }
      return response([]);
    };
    const result=await studioSideTableCommit(enabled,"Idea Candidates","POST","",JSON.stringify({fields:{Candidate_Title:"Nighttime",...sourceFields}}));
    assert.equal(result.ok,true);
    assert.equal(writes.length,1);
    assert.equal(writes[0].href.includes("on_conflict"),false);
    assert.equal(writes[0].body[0].production_mode,"automatic");
    assert.equal(writes[0].body[0].production_source,"idea");
    assert.equal(writes[0].body[0].payload.Studio_Production_Mode,undefined);
    assert.equal(result.records[0].fields.Studio_Production_Mode,"automatic");
    assert.equal(result.records[0].fields.Candidate_ID,42);
  } finally {globalThis.fetch=original;}
});
test("ordinary PATCH strips a stale or forged mode and preserves canonical manual metadata",async()=>{
  const original=globalThis.fetch;
  const writes=[];
  try {
    globalThis.fetch=async(url,init)=>{
      const href=String(url),method=String(init?.method||"GET").toUpperCase();
      if(href.includes("/idea_candidates?")&&method==="GET") return response([{airtable_record_id:id,payload:{Candidate_Title:"Original",Candidate_ID:42},production_mode:"manual",production_source:"idea"}]);
      if(method==="PATCH"&&href.includes("/idea_candidates?")) writes.push(JSON.parse(init.body));
      return response([]);
    };
    const result=await studioSideTableCommit(enabled,"Idea Candidates","PATCH",id,JSON.stringify({fields:{Candidate_Title:"Edited",...sourceFields}}));
    assert.equal(result.ok,true);
    assert.equal(writes.length,1);
    assert.equal(writes[0].production_mode,undefined);
    assert.equal(writes[0].payload.Studio_Production_Mode,undefined);
    assert.equal(result.records[0].fields.Studio_Production_Mode,"manual");
  } finally {globalThis.fetch=original;}
});
test("existing row collision aborts before any capture write",async()=>{
  const original=globalThis.fetch;
  let writes=0;
  try {
    globalThis.fetch=async(url,init)=>{
      if(String(init?.method||"GET").toUpperCase()==="POST") writes++;
      return response([{payload:{},production_mode:"manual",production_source:"idea"}]);
    };
    await assert.rejects(()=>studioSideTableCommit(enabled,"Idea Candidates","POST","",JSON.stringify({fields:{...sourceFields}})),/not unique/);
    assert.equal(writes,0);
  } finally {globalThis.fetch=original;}
});

test("Vibe Cut typed capture round-trips without granting manual or AZ authority",()=>{
  const fields=newIdeaProductionCapture(enabled,"vibe_cut");
  assert.deepEqual(fields,{Studio_Production_Mode:"automatic",Studio_Production_Source:"vibe_cut"});
  assert.deepEqual(splitIdeaProductionCapture(enabled,fields,{creating:true}),{fields:{},typed:{production_mode:"automatic",production_source:"vibe_cut"}});
  assert.deepEqual(projectIdeaProductionMode({production_mode:"automatic",production_source:"vibe_cut"},{}),fields);
  assert.deepEqual(projectIdeaProductionMode({production_mode:"manual",production_source:"vibe_cut"},fields),{});
  assert.throws(()=>newIdeaProductionCapture({...enabled,STUDIO_PRODUCTION_MODE_ROUTING:"true",STUDIO_PRODUCTION_EDITOR_GUARD:"true",STUDIO_MANUAL_IDEA_CREATE:"true"},"vibe_cut",{requestedMode:"manual",humanChoice:true}),/human Idea/);
});
