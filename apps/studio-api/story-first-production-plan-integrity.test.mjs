import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { reconcileApprovedStoryFirstSourcePlan } from "./story-first-production-plan-integrity.mjs";
import { preserveApprovedStoryboardProductionNotes } from "./supabase-pipeline-reads.mjs";

const id = i => "rec" + ("AssetId" + i).padEnd(14, "x");
const assets = Array.from({ length: 6 }, (_, i) =>
  ({ id: String(i), order: i+1, media_asset_record_id:id(i+1),
     google_drive_file_id:"driveExample"+i, mime_type:i===3?"video/mp4":"image/jpeg" }));
const story = { schema:"story-first-production.1", profile_id:"recNYC0000000001",
  target_seconds:38,
  scenes:assets.map((a,i) => ({ time:`${i*5}-${(i+1)*5}`,
    asset_id:a.media_asset_record_id, voiceover:"Scene "+(i+1) })) };
const marker = "[story-first-production.1] ";
const directive = marker + JSON.stringify(story);
const plan = { schema_version:"item4.output-plan.1", source_asset_count:1,
  photo_count_kind:"single-photo",
  items:[{ platform:"Instagram",output_type:"Reel",aspect_ratio:"9:16",source_asset_count:1,companion:false },
         { platform:"Facebook",output_type:"Reel",aspect_ratio:"9:16",source_asset_count:1,companion:false }] };

test("six verified scenes repair one-source UI plan without changing output destinations", () => {
  const found = reconcileApprovedStoryFirstSourcePlan("operator settings\n"+directive,assets,plan);
  assert.equal(found.kind,"repair");
  assert.equal(found.count,6);
  assert.equal(found.plan.source_asset_count,6);
  assert.equal(found.plan.photo_count_kind,"multiple-photos");
  assert.deepEqual(found.plan.items.map(x=>x.source_asset_count),[6,6]);
  assert.deepEqual(found.plan.items.map(x=>[x.platform,x.output_type,x.aspect_ratio]),
                   plan.items.map(x=>[x.platform,x.output_type,x.aspect_ratio]));
  assert.equal(plan.source_asset_count,1,"do not mutate a stale plan in place");
  assert.equal(reconcileApprovedStoryFirstSourcePlan("operator settings\n"+directive,assets,found.plan).kind,"ready");
});

test("approved six-scene proof rejects missing, reordered or unrelated masters", () => {
  const swapped=assets.slice();[swapped[3],swapped[4]]=[swapped[4],swapped[3]];
  assert.equal(reconcileApprovedStoryFirstSourcePlan(directive,swapped,plan).kind,"invalid");
  assert.equal(reconcileApprovedStoryFirstSourcePlan(directive,assets.slice(0,5),plan).kind,"invalid");
  assert.equal(reconcileApprovedStoryFirstSourcePlan(directive,assets,{...plan,items:[]}).kind,"invalid");
  assert.equal(reconcileApprovedStoryFirstSourcePlan("generic settings",assets,plan).kind,"not_story");
  assert.equal(reconcileApprovedStoryFirstSourcePlan(marker+"broken",assets,plan).kind,"invalid");
});

test("general Production settings save preserves previously approved storyboard directive", () => {
  const oldNotes="Original editorial notes\n"+directive;
  const incoming="[render-settings] preset=auto; motion=auto\nez-photo-wait=off";
  const saved=preserveApprovedStoryboardProductionNotes(oldNotes,incoming);
  assert.equal(saved,incoming+"\n"+directive);
  assert.equal(saved.split(marker).length-1,1);
  assert.equal(preserveApprovedStoryboardProductionNotes(saved,saved),saved);
  assert.equal(preserveApprovedStoryboardProductionNotes("no directive",incoming),incoming);
  assert.throws(() => preserveApprovedStoryboardProductionNotes(
    "Original\n"+directive+"\n"+directive,incoming),/conflict/);
});

test("Prepare stage remains fail-closed: no direct publisher call and no user-supplied source count", () => {
  const worker=readFileSync(new URL("./worker-functions-02.mjs",import.meta.url),"utf8");
  const begin=worker.indexOf("export async function runItem4VariantPrepareCore(");
  const end=worker.indexOf("/*__STUDIO_WORKER_END:runItem4VariantPrepareCore__*/",begin);
  const body=worker.slice(begin,end);
  assert.match(body,/reconcileApprovedStoryFirstSourcePlan\(/);
  assert.match(body,/item4FramePrepareStage\("frame queue creation"/);
  assert.match(body,/item4FramePrepareStage\("frame queue readback"/);
  assert.match(body,/Studio_Output_Plan_JSON: JSON\.stringify\(integrity\.plan\)/);
  assert.ok(!/submitStoryVideo\(|publishOutput\(/.test(body));
});
