import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { mapAirtableOutputToSupabase, studioTypedRenderColumns } from "./supabase-pipeline-reads.mjs";

test("#2618 R3 render package fields populate typed Supabase columns without losing the legacy bag", () => {
  const record = {
    id: "recNYC2618test001",
    fields: {
      Output_ID: 2618,
      Platform: "YouTube",
      Format: "Short",
      Render_Status: "Ready for Render",
      Output_Filename: "studio-nyc-2618.mp4",
      Render_Total_Frames: 450,
      Composition_ID: "ChicagoShiningPhotoSequence",
    },
  };
  const mapped = mapAirtableOutputToSupabase(record, {
    profileUuid: "00000000-0000-0000-0000-000000000001",
    contentUuidByAirtableId: new Map(),
    fullRecord: true,
  });
  assert.equal(mapped.output_filename, "studio-nyc-2618.mp4");
  assert.equal(mapped.render_total_frames, 450);
  assert.equal(mapped.error_messages.Output_Filename, record.fields.Output_Filename);
  assert.equal(mapped.error_messages.Render_Total_Frames, 450);
  assert.equal(mapped.error_messages.Composition_ID, record.fields.Composition_ID);
});

test("#2618 sparse R3 patch writes only explicitly present typed fields", () => {
  assert.deepEqual(studioTypedRenderColumns({ Output_Filename: " studio-miami.mp4 ", Render_Total_Frames: "360" }),
    { output_filename: "studio-miami.mp4", render_total_frames: 360 });
  assert.deepEqual(studioTypedRenderColumns({ Render_Status: "Ready for Render" }), {});
  assert.deepEqual(studioTypedRenderColumns({ Output_Filename: "" }), { output_filename: null });
  assert.deepEqual(studioTypedRenderColumns({ Render_Total_Frames: 0 }), { render_total_frames: null });
  assert.deepEqual(studioTypedRenderColumns({ Render_Total_Frames: "not-a-number" }), { render_total_frames: null });
  assert.deepEqual(studioTypedRenderColumns({ Render_Total_Frames: 5.7 }), { render_total_frames: null });
});

test("#2618 full and sparse output writers both persist R4 filter columns", async () => {
  const source = await readFile(new URL("./supabase-pipeline-reads.mjs", import.meta.url), "utf8");
  const full = source.slice(source.indexOf("export function mapAirtableOutputToSupabase("),
    source.indexOf("export function mapAirtableIdeaToSupabase("));
  const sparse = source.slice(source.indexOf("function buildPresentOutputColumnPatch("),
    source.indexOf("export function outputRecordHasDensifiedIdentity("));
  assert.match(full, /\.\.\.studioTypedRenderColumns\(fields\)/);
  assert.match(sparse, /Object\.assign\(body, studioTypedRenderColumns\(fields\)\)/);
  assert.match(source, /render_status=in\.\(/);
  assert.match(source, /output_filename=not\.is\.null&render_total_frames=gt\.0/);
});
