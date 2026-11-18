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
