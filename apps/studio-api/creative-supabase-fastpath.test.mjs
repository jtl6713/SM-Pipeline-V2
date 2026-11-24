import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const source = fs.readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
function extract(name, endMarker) {
  const start = source.indexOf("export async function " + name + "(");
  assert.ok(start >= 0, "Missing " + name);
  const end = source.indexOf(endMarker, start);
  assert.ok(end > start, "Missing end of " + name);
  return source.slice(start, end);
}

test("Supabase creative output read never falls back to Airtable", () => {
  const body = extract("studioReadOutputRecord", "/*__STUDIO_WORKER_END:studioReadOutputRecord__*/");
  assert.match(body, /studioWriteSource\(env\) === "supabase" && studioSupabaseConfigured\(env\)/);
  assert.match(body, /return readSupabaseShapedOutput\(env, id\);/);
  assert.doesNotMatch(body, /try\s*\{/);
  assert.doesNotMatch(body, /falling back to Airtable/);
});

test("Supabase creative GET does not wait on Airtable narration or ElevenLabs catalog", () => {
  const body = extract("getOutputCreative", "/*__STUDIO_WORKER_END:getOutputCreative__*/");
  assert.match(body, /supabaseCreativeRead = studioWriteSource\(env\) === "supabase"/);
  assert.match(body, /supabaseCreativeRead\s*\?\s*phase6NarrationVoiceFallback\(/);
  assert.match(body, /: await phase6ResolveNarrationVoice\(env, record\)/);
  assert.match(body, /supabaseCreativeRead\s*\? Promise\.resolve\(\{/);
  assert.match(body, /: phase6VoiceCatalog\(env\)/);
  assert.match(body, /voices: knownVoices/);
  assert.match(body, /phase6SlidesForOutput\(env, record, narration\)/);
  assert.match(body, /publishing_changed_by_this_api: false/);
});

test("Pilsen typed Supabase selection reaches actual Creative GET and Factory viewer, not an invented fixture response", async () => {
  const { getOutputCreative } = await import("./worker-functions-03.mjs");
  const vm = await import("node:vm");
  const viewerSource = fs.readFileSync(new URL("../studio-web/assets/pipeline-photo-preview.js", import.meta.url), "utf8");
  const ctx = { URL };
  vm.runInNewContext(viewerSource, ctx);
  const id = "recaQyj12CzOHjIQp";
  const clips = Array.from({length:19}, (_,i)=>({
    id:"studio-source-"+(i+1), order:i+1, media_kind:"photo", aspect_ratio:"9:16",
    url:"https://media.chicagoshining.com/studio/previews/item4/example/photo-"+(i+1)+".jpg",
    durationFrames:240, asset_name:"Photo "+(i+1)
  }));
  const row = {airtable_record_id:id,output_number:11157,platform:"TikTok",
    studio_output_type:"Multi-Photo",platform_output_type:"TikTok Slideshow",aspect_ratio:"9:16",
    output_status:"Ready for Review",render_status:"Native Photo Route",selected_clip_count:19,
    selected_assets:{authority:"studio_owner_uploaded_exact_source",aspect_ratio:"9:16",selected_clips:clips},
    error_messages:{},do_not_publish:false};
  const oldFetch=globalThis.fetch;
  const calls=[];
  globalThis.fetch=async (input,opts)=>{
    const u=new URL(String(input));
    calls.push(u);
    assert.equal(opts.method,"GET");
    assert.equal(u.hostname,"example.supabase.co");
    assert.equal(u.pathname,"/rest/v1/platform_outputs");
    assert.equal(u.searchParams.get("airtable_record_id"),"eq."+id);
    assert.equal(u.searchParams.get("limit"),"1");
    const selected = u.searchParams.get("select").split(",");
    // Model PostgREST projection: a stored column omitted from SELECT is absent.
    return new Response(JSON.stringify([Object.fromEntries(Object.entries(row).filter(([key])=>selected.includes(key)))]));
  };
  try {
    const url=new URL("https://studio.chicagoshining.com/api/outputs/"+id+"/creative");
    const response=await getOutputCreative(new Request(url),{SUPABASE_URL:"https://example.supabase.co",SUPABASE_SERVICE_ROLE_KEY:"test-key"},url,{permissions:{outputs_review:true}});
    assert.equal(response.status,200);
    const data=await response.json();
    assert.equal(data.output.selected_clip_count,19);
    assert.equal(data.slides.length,19);
    const preview=ctx.StudioPipelineGallery.readSlides(data,id,{requireCompleteTikTok:true});
    assert.equal(preview.slides.length,19);
    assert.deepEqual(Array.from(preview.slides,s=>s.image),clips.map(c=>c.url));
    assert.equal(calls.length,1);
    assert.ok(calls[0].searchParams.get("select").split(",").includes("selected_assets"));
  } finally {globalThis.fetch=oldFetch;}
});
