import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { missingLinkedOutputIdsForContentRows } from "./supabase-pipeline-reads.mjs";

const id = (digits) => "rec" + String(digits).padStart(14, "0");

test("published outputs omitted by the 200-recent/1000-open windows are hydrated", () => {
  const contentRows = [
    { airtable_record_id: id(1), extras: { "Platform Outputs": [id(101), id(102), id(103)] } },
    { airtable_record_id: id(2), extras: { "Platform Outputs": [id(201), id(202)] } },
  ];
  const packed = [
    { airtable_record_id: id(101) },
    { airtable_record_id: id(201) },
  ];
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows(contentRows, packed),
    [id(102), id(103), id(202)],
  );
});

test("mixed-status content only fetches missing siblings and deduplicates requests", () => {
  const contentRows = [
    { extras: { "Platform Outputs": [id(3), id(4), id(4)] } },
    { extras: { "Platform Outputs": [id(4), id(5)] } },
    { extras: { "Platform Outputs": [] } },
  ];
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows(contentRows, [{ airtable_record_id: id(3) }]),
    [id(4), id(5)],
  );
});

test("incomplete or corrupt link bags cannot trigger unscoped Supabase reads", () => {
  assert.deepEqual(
    missingLinkedOutputIdsForContentRows([
      null, {}, { extras: {} },
      { extras: { "Platform Outputs": [null, {}, "", "bad", id(7), { id: id(8) }] } },
    ], [{ airtable_record_id: id(7) }]),
    [id(8)],
  );
  const source = readFileSync(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  assert.match(source, /missingLinkedOutputIdsForContentRows\(\[\.\.\.byId\.values\(\)\], \[\.\.\.outputById\.values\(\)\]\)/);
  assert.match(source, /platform_outputs\?content_profile_id=eq\.\$\{profileId\}&airtable_record_id=in\./);
});
