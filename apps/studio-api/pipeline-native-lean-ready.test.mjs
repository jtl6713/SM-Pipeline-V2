import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const code = fs.readFileSync(path.join(here, "worker.js"), "utf8");
const prefix = "https://media.chicagoshining.com/";

test("Pipeline keeps lightweight native photo completeness evidence", () => {
  const found = code.match(/const OUTPUT_LIST_FIELDS = \[([\s\S]*?)\];/);
  assert.ok(found, "lean output field list");
  const fields = found[1];
  for (const name of ["Output_Status", "Render_Status", "Selected_Clip_Count", "Studio_Preview_URL", "Thumbnail_URL"]) {
    assert.ok(fields.includes('"' + name + '"'), name + " must be present");
  }
  assert.ok(!fields.includes('"Selected_Assets_JSON"'), "large clip manifest stays out of the list");
  assert.ok(!fields.includes('"Render_Clip_List_JSON"'), "large render manifest stays out of the list");
});

test("native photos are review-ready in both compact and full-record views", () => {
  const from = code.indexOf("function studioOutputHasReviewableDeliverable(record)");
  const to = code.indexOf("function studioClipPublicCdnUrl(", from);
  assert.ok(from > 0 && to > from, "state calculator available");
  const clips = row => row.fields.selected_clips || [];
  const cdn = x => {
    const url = typeof x === "string" ? x : x?.url;
    return url?.startsWith(prefix) ? url : "";
  };
  const ready = vm.runInNewContext(code.slice(from, to) + "\nstudioOutputHasReviewableDeliverable", {
    f: (row, key) => row.fields[key],
    studioOutputIsNativePhoto: () => true,
    selectedVisualClips: clips,
    studioNativeStillsNeedLettering: row => clips(row).some(clip => !clip.url.includes("/lettered/")),
    studioOutputHasReviewCover: row => Boolean(cdn(row.fields.Thumbnail_URL)),
    studioClipPublicCdnUrl: cdn,
    studioNativeClipsArePublicCdn: row => clips(row).length > 0 && clips(row).every(clip => Boolean(cdn(clip))),
  });
  const base = {
    Output_Status: "Ready for Review",
    Render_Status: "Native Photo Route",
    Selected_Clip_Count: 8,
    Studio_Preview_URL: prefix + "studio/previews/lettered/one.jpg",
    Thumbnail_URL: prefix + "studio/previews/thumbnails/one.png",
    Platform: "Instagram",
  };
  assert.equal(ready({ fields: base }), true, "lean Instagram row is not Preparing Assets");
  assert.equal(ready({ fields: { ...base, Selected_Clip_Count: 0 } }), false, "missing selection stays blocked");
  assert.equal(ready({ fields: { ...base, Output_Status: "In Production" } }), false, "incomplete work stays blocked");
  assert.equal(ready({ fields: { ...base, Studio_Preview_URL: "" } }), false, "no public preview stays blocked");
  assert.equal(ready({ fields: { ...base, Thumbnail_URL: "" } }), false, "missing cover stays blocked");
  const lettered = Array.from({ length: 8 }, (_, i) => ({ url: prefix + "studio/previews/lettered/" + i + ".jpg" }));
  assert.equal(ready({ fields: { ...base, selected_clips: lettered } }), true, "full Instagram still package");
  const variants = Array.from({ length: 8 }, (_, i) => ({ url: prefix + "studio/previews/item4/" + i + ".jpg" }));
  for (const platform of ["Facebook", "TikTok"]) {
    assert.equal(ready({ fields: { ...base, Platform: platform, selected_clips: variants } }), true, platform + " does not require Instagram lettering");
    assert.equal(ready({ fields: { ...base, Platform: platform, selected_clips: [{url:"https://drive.google.com/file/d/raw/view"}] } }), false, platform + " requires CDN assets");
  }
  assert.equal(ready({ fields: { ...base, Platform: "Instagram", selected_clips: variants } }), false, "Instagram still needs lettering");
});
