import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { readUiReleaseContract } from "./ui-release-contract.mjs";

const html = fs.readFileSync(new URL("./index.html", import.meta.url), "utf8");
const factory = fs.readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
const app = fs.readFileSync(new URL("./assets/app-item4-1008.js", import.meta.url), "utf8");
const helper = fs.readFileSync(new URL("./assets/factory-closeup-quality.js", import.meta.url), "utf8");

test("Factory preview has explicit, user-facing crop QA and no false approval claim", () => {
  for (const id of ["factoryCloseupInspector","factoryCloseupRatio","factoryCloseupSummary",
                    "factoryCloseupToggle","factoryCloseupCropFrame","factoryCloseupCropStill"]) {
    assert.match(html, new RegExp('id="' + id + '"'));
  }
  assert.match(html, /This panel never releases a hold/);
  assert.match(html, /Choose a ratio — no guessing/);
  assert.match(html, /may not match the real final render/);
});
test("Factory helper loads before Factory desk, and inspector follows actual gallery image changes", () => {
  assert.ok(html.indexOf("/assets/factory-closeup-quality.js?v=") <
            html.indexOf("/assets/factory-desk.js?v="));
  assert.match(factory, /image\.onload = update/);
  assert.match(factory, /select\.onchange = update/);
  assert.match(factory, /previewEpoch !== factoryGalleryPreviewEpoch/);
  assert.match(factory, /resetFactoryCloseupInspector\(\)/);
  assert.match(factory, /source_resolution_below_review_floor/);
});
test("Advisory QA never changes publishing authorization or automates approval", () => {
  assert.doesNotMatch(helper, /fetch\(|XMLHttpRequest|publish\s*\(|approve\s*\(/);
  assert.match(factory, /never approves, releases a hold/);
  assert.match(helper, /publicationAuthorized: false/);
});
test("Factory crop preview follows a strictly newer consistent Studio UI version", () => {
  const c = readUiReleaseContract(html, app);
  assert.equal(c.version, "0.6.1080");
  assert.equal(c.cacheKey, "0.6.1080-closeup-qa-2876");
  assert.ok(c.versionedAssetCount >= 20);
});
