import test from "node:test";
import assert from "node:assert/strict";
import { productionFormatSignature, matchingProductionRenderOutputs } from "./production-format-groups.mjs";

const make = (id, platform, output_type, family, format, ratio, enabled = true) => ({
  id, platform, output_type, enabled,
  render_format: { key: productionFormatSignature({
    pipeline_family: family, format, aspect_ratio: ratio,
  }) },
});

test("existing six routes split into their actual DB format families", () => {
  const outputs = [
    make("ig", "Instagram", "Reel", "Video", "Vertical Short Video", "9:16"),
    make("fb", "Facebook", "Reel", "Video", "Vertical Short Video", "9:16"),
    make("tt", "TikTok", "Video Draft", "Video", "Vertical Short Video", "9:16"),
    make("yt", "YouTube", "Short", "Video", "Vertical Short Video", "9:16"),
    make("igs", "Instagram", "Story", "Story", "Story", "9:16"),
    make("fbs", "Facebook", "Story", "Story", "Story", "9:16"),
  ];
  assert.deepEqual(matchingProductionRenderOutputs(outputs[0], outputs).map(x => x.id), ["ig","fb","tt","yt"]);
  assert.deepEqual(matchingProductionRenderOutputs(outputs[4], outputs).map(x => x.id), ["igs","fbs"]);
});

test("new platform joins same media group automatically with no code allowlist", () => {
  const existing = make("ig", "Instagram", "Reel", "Video", "Vertical Short Video", "9:16");
  const newPlatform = make("future", "Future Platform", "New Format Name", "Video", "Vertical Short Video", "9:16");
  const wrongRatio = make("wide", "Future Platform", "Wide", "Video", "Vertical Short Video", "16:9");
  const wrongFormat = make("slide", "Future Platform", "Photo", "Video", "Photo Set", "9:16");
  const wrongFamily = make("story", "Future Platform", "Story", "Story", "Vertical Short Video", "9:16");
  const disabled = make("off", "Future Platform", "Other", "Video", "Vertical Short Video", "9:16", false);
  assert.deepEqual(matchingProductionRenderOutputs(existing, [existing,newPlatform,wrongRatio,wrongFormat,wrongFamily,disabled]).map(x => x.id), ["ig","future"]);
});

test("unknown or partial format mappings are never assumed compatible", () => {
  for (const details of [
    { pipeline_family: "Video", format: "", aspect_ratio: "9:16" },
    { pipeline_family: "", format: "Vertical Short Video", aspect_ratio: "9:16" },
    { pipeline_family: "Video", format: "Vertical Short Video", aspect_ratio: "" },
    {},
  ]) assert.equal(productionFormatSignature(details), "");
  const first = make("ig", "Instagram", "Reel", "Video", "Vertical Short Video", "9:16");
  const incomplete = { ...first, id: "invalid", render_format: null };
  assert.deepEqual(matchingProductionRenderOutputs(incomplete, [first]), []);
  assert.equal(productionFormatSignature({ pipeline_family: "  VIDEO ", format: "vertical  short video", aspect_ratio: " 9:16 " }), first.render_format.key);
});
