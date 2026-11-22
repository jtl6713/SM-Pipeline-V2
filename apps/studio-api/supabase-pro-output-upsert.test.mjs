import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { homogeneousDensifiedOutputUpsertGroups } from "./supabase-pipeline-reads.mjs";

test("#2574 mixed Story overrides must not create NOT NULL effective_resolution errors", () => {
  const reel = {
    airtable_record_id: "recReelNYC00000001",
    production_request_airtable_id: "recNYCProduction01",
    production_request_airtable_ids: ["recNYCProduction01"],
    brand_airtable_ids: ["recNYCBrand0000001"],
    platform: "Instagram", output_type: "Reel", enabled: true,
  };
  const story = {
    ...reel, airtable_record_id: "recStoryNYC0000001",
    platform: "Facebook", output_type: "Story",
    effective_resolution: {
      Voiceover_Mode_Override: "No",
      Background_Music_Mode_Override: "Yes",
      Video_Duration_Seconds_Override: 10,
    },
  };
  const short = { ...reel, airtable_record_id: "recYTShort00000001", platform: "YouTube", output_type: "Short" };
  const groups = homogeneousDensifiedOutputUpsertGroups([reel, story, short]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups.flat(), [reel, short, story]);
  for (const group of groups) {
    const columnSets = group.map((row) => Object.keys(row).sort().join("|"));
    assert.equal(new Set(columnSets).size, 1, "each upsert group must have identical columns");
    for (const row of group) {
      if (row.output_type !== "Story") {
        assert.equal(Object.hasOwn(row, "effective_resolution"), false,
          "omitted JSONB must use database default, not explicit null");
      } else {
        assert.deepEqual(row.effective_resolution.Voiceover_Mode_Override, "No");
      }
    }
  }
});

test("#2574 mixed sparse production-output patches are not null-padded together", () => {
  const patch = { airtable_record_id: "recPatch000000001", scheduled_at: "2026-12-01T10:00:00Z" };
  const full = { airtable_record_id: "recFull0000000001", platform: "Instagram",
    output_type: "Reel", effective_resolution: {}, enabled: true,
    brand_airtable_ids: [], production_request_airtable_ids: [] };
  const groups = homogeneousDensifiedOutputUpsertGroups([patch,full]);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0],[patch]);
  assert.deepEqual(groups[1],[full]);
  assert.deepEqual(homogeneousDensifiedOutputUpsertGroups([]), []);
});

test("#2574 source applies grouped rows before PostgREST upsert", async () => {
  const src = await readFile(new URL("./supabase-pipeline-reads.mjs",import.meta.url),"utf8");
  const fn = src.slice(src.indexOf("async function upsertChunk("),
    src.indexOf("function profileLinkIds(", src.indexOf("async function upsertChunk(")));
  assert.match(fn,/table === "production_request_outputs"/);
  assert.match(fn,/homogeneousDensifiedOutputUpsertGroups\(rows\)/);
  assert.match(fn,/homogenizeUpsertRows\(group\)/);
});
