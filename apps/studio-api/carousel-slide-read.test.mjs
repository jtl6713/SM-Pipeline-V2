import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("authoritative Supabase slide reader must never fetch missing slide IDs from Airtable", async () => {
  const source=await readFile(new URL("./carousel-slide-read.mjs",import.meta.url),"utf8");
  assert.match(source,/studioWriteSource\(env\) === "supabase"/);
  assert.match(source,/Supabase carousel slide identity missing/);
  assert.doesNotMatch(source,/missing\.map\(\(id\) => airtableFetch/);
  assert.match(source,/return wanted\.map\(\(id\) => byId\.get\(id\)\)/);
});

test("legacy slide fetching is reachable only outside the Supabase branch", async () => {
  const source=await readFile(new URL("./carousel-slide-read.mjs",import.meta.url),"utf8");
  assert.ok(source.indexOf('if (studioWriteSource(env) === "supabase"') < source.indexOf("return Promise.all(wanted.map"));
});
