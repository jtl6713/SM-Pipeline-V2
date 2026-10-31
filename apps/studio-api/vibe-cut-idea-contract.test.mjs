import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";
import {
  vibeCutIdeaFields,
  validateVibeCutSourceAssets,
  VIBE_CUT_VERTICAL_KEYS,
  VIBE_CUT_HORIZONTAL_KEYS,
} from "./vibe-cut.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const worker = readStudioWorkerSource();

test("vertical Vibe Cut idea has no Photo Set, Carousel or photo listener", () => {
  const fields = vibeCutIdeaFields({ sourceAspect: "vertical", width: 1552, height: 2064, targetSeconds: 15 });
  assert.equal(fields.Production_Content_Type, "Vertical Short Video");
  assert.deepEqual(fields.Production_Target_Platforms, ["Instagram", "Facebook", "TikTok", "YouTube"]);
  assert.equal(VIBE_CUT_VERTICAL_KEYS.length, 6);
  assert.equal(fields.Production_Video_Duration, 15);
  assert.equal(fields.Production_Include_Voiceover, "No");
  assert.equal(fields.Production_Include_Background_Music, "Yes");
  assert.equal(fields.Production_Include_Thumbnail, "Yes");
  for (const name of [
    "Production_Carousel_Slide_Count", "Production_Carousel_Slide_Count_Mode",
    "Production_Carousel_Slide_Count_Min", "Production_Carousel_Slide_Count_Max",
    "Production_Carousel_Image_Mode", "Studio_Photo_Match_JSON",
  ]) assert.equal(fields[name], null, name);
  assert.equal(fields.Studio_Photo_Wait_Status, "Not Needed");
  assert.deepEqual(fields.Studio_Matched_Media_Assets, []);
});

test("horizontal Vibe Cut is Longform and retains YouTube Standard and Short", () => {
  const fields = vibeCutIdeaFields({ sourceAspect: "vertical", width: 1920, height: 1080, targetSeconds: 15 });
  assert.equal(fields.Production_Content_Type, "Longform Video");
  assert.deepEqual(fields.Production_Target_Platforms, ["YouTube"]);
  assert.deepEqual([...VIBE_CUT_HORIZONTAL_KEYS], ["YouTube::Standard Video", "YouTube::Short"]);
  assert.notEqual(fields.Production_Content_Type, "Carousel");
  assert.notEqual(fields.Production_Content_Type, "Photo Set");
});

test("normalizing a Vibe Cut twice is idempotent and does not change video identity", () => {
  const options = { sourceAspect: "vertical", width: 1552, height: 2064, targetSeconds: 15 };
  assert.deepEqual(vibeCutIdeaFields(options), vibeCutIdeaFields(options));
  assert.equal(vibeCutIdeaFields(options).Production_Video_Clip_Count, null);
});

test("one uploaded, compressed video is reusable without a second upload", () => {
  const manifest = [{
    name: "Michigan Avenue Stroll 1.mov", media_kind: "video", mime_type: "video/mp4",
    upload_status: "complete", compression_status: "ready",
    r2_key: "studio/master-assets/existing/uploaded-video.mov",
  }];
  assert.equal(validateVibeCutSourceAssets(manifest).ok, true);
  assert.equal(validateVibeCutSourceAssets([]).ok, false);
  assert.equal(validateVibeCutSourceAssets([{ ...manifest[0], media_kind: "photo", mime_type: "image/jpeg", name: "slide.jpg" }]).ok, false);
  assert.equal(validateVibeCutSourceAssets([{ ...manifest[0], compression_status: "pending" }]).ok, false);
});

test("both Idea creation and Idea updates normalize before Airtable writes", () => {
  const created = worker.slice(worker.indexOf("export async function createIdea("), worker.indexOf("/*__STUDIO_WORKER_END:createIdea__*/"));
  const updated = worker.slice(worker.indexOf("export async function updateIdea("), worker.indexOf("/*__STUDIO_WORKER_END:updateIdea__*/"));
  assert.match(created, /Object\.assign\(fields, vibeCutIdeaFields/);
  assert.match(created, /!vibeCut && ctx\?\.waitUntil/);
  assert.match(updated, /vibeCutIdeaFields\(/);
  assert.match(created, /requestedProfileId\(null, payload\)/);
});

test("request cleaner rejects Carousel defaults and clears narration for Vibe", () => {
  const begin = worker.indexOf("export async function cleanProductionRequestPayload(");
  const end = worker.indexOf("/*__STUDIO_WORKER_END:cleanProductionRequestPayload__*/", begin);
  const cleaner = worker.slice(begin, end);
  assert.match(cleaner, /contentTypeRaw = vibeCut \?/);
  assert.match(cleaner, /voiceoverMode = vibeCut \? "No"/);
  assert.match(cleaner, /carouselSlideCountMode = slideCountApplies/);
  assert.match(cleaner, /carouselImageMode = vibeCut \? null/);
  assert.match(cleaner, /scriptMode = vibeCut \? "Leave blank"/);
  const mapping = worker.slice(worker.indexOf("export function productionRequestFields("), worker.indexOf("/*__STUDIO_WORKER_END:productionRequestFields__*/"));
  assert.match(mapping, /Carousel_Slide_Count_Mode: vibeCut \? null/);
  assert.match(mapping, /Carousel_Image_Mode: vibeCut \? null/);
  assert.match(mapping, /Script_Mode: vibeCut \? "Leave blank"/);
  assert.match(mapping, /Master_Content_Type: vibeCut/);
});

test("asset callbacks never replay city/content identity; intentional edits stay explicit", () => {
  const state = worker.slice(worker.indexOf("export async function item4UpdateRequestState("), worker.indexOf("/*__STUDIO_WORKER_END:item4UpdateRequestState__*/"));
  assert.match(state, /protectedField of \["Primary_Location", "Master_Content_Type", "Idea_Candidate", "Brand", "Organization"\]/);
  const edit = worker.slice(worker.indexOf("export async function updateProductionRequest("), worker.indexOf("/*__STUDIO_WORKER_END:updateProductionRequest__*/"));
  assert.match(edit, /payload\?\.location_change_confirmed !== true/);
});

test("existing draft is reused instead of creating duplicate request/outputs", () => {
  const create = worker.slice(worker.indexOf("export async function createProductionRequestFromBody("), worker.indexOf("/*__STUDIO_WORKER_END:createProductionRequestFromBody__*/"));
  assert.match(create, /existingDraftForIdea/);
  assert.match(create, /if \(existing\)/);
  assert.match(create, /vibeCutIdeaFields/);
  assert.match(worker, /JSON\.stringify\(vibeCut \? \[draft\] : \[\.\.\.existing, draft\]\)/);
});

test("legitimate photo count and photo waiting logic remain unchanged", () => {
  const photo = readFileSync(path.join(dir, "idea-photo-wait.mjs"), "utf8");
  assert.match(photo, /IDEA_PHOTO_WAIT_TYPES = new Set\(\["Carousel", "Photo Set", "Feed Post"\]\)/);
  assert.match(photo, /mode === "Target range"/);
  assert.match(photo, /imageMode !== "Make AI Generated"/);
});
