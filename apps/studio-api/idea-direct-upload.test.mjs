import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { allocateLibraryUploadNames } from "./asset-library.mjs";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
test("manual photo upload uses the profile numbering allocator", () => {
 assert.deepEqual(allocateLibraryUploadNames("Navy Pier",3,["Navy Pier 1","Navy Pier 8"]),["Navy Pier 9","Navy Pier 10","Navy Pier 11"]);
});
test("Studio Worker has guarded Idea-scoped direct upload and Ready handoff", () => {
 const worker=readStudioWorkerSource();
 assert.match(worker,/function linkIdeaUploadedAssets\(/);
 assert.match(worker,/function resumeIdeaDirectUploadedAssets\(/);
 assert.match(worker,/requirePermission\(authorization,"ideas_edit"\)/);
 assert.match(worker,/firstLinkedRecordId\(f\(photo, "Content_Profile"\)\) !== profile/);
 assert.match(worker,/readyProductionEnqueue\(env.STUDIO_MEDIA/);
 assert.match(worker,/Existing asset numbering could not be verified in Supabase/);
});
test("Manage Idea uploads with a batch name and finalizes linked receipts", () => {
 const html=fs.readFileSync(new URL("../studio-web/index.html",import.meta.url),"utf8");
 const js=fs.readFileSync(new URL("../studio-web/assets/app-item4-1008.js",import.meta.url),"utf8");
 assert.match(html,/id="ideaDirectAssetName"/);
 assert.match(html,/id="ideaDirectUploadInput"/);
 assert.match(js,/form\.append\("batch_name",name\)/);
 assert.match(js,/form\.append\("asset_name",reserved\[i\]\)/);
 assert.match(js,/complete:true/);
});
