import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { productionOutputLinksFromJoinedRecords } from "./production-output-identity.mjs";
import { evaluateReviewPackage, formalFactoryApprovalReady } from "./review-package-readiness.mjs";

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rec = (n) => `rec${String(n).padStart(14, "0")}`;
const final = "https://drive.google.com/file/d/verified-render/view";
const preview = "https://media.chicagoshining.com/studio/previews/output/video.mp4";
const cover = "https://media.chicagoshining.com/studio/previews/thumbnails/cover.png";

test("Supabase joined outputs remain four linked records with nullable output numbers", () => {
  for (const title of ["South Beach Sunrise Moves", "Frost Science Oculus Look"]) {
    const outputs = [1, 2, 3, 4].map((n) => ({ id: rec(n), output_number: null, title }));
    assert.deepEqual(productionOutputLinksFromJoinedRecords(outputs), outputs.map(x => x.id));
  }
});
test("UUID-backed output identities do not depend on Output_ID", () => {
  assert.deepEqual(productionOutputLinksFromJoinedRecords([
    { id: uuid(1), output_number: null }, { id: uuid(1) },
    { id: uuid(2), output_number: null }, { id: "" }, {}, null,
  ]), [uuid(1), uuid(2)]);
});
test("empty or duplicate linked output rows cannot fabricate Production links", () => {
  assert.deepEqual(productionOutputLinksFromJoinedRecords([null, {}, { id: "invalid" }]), []);
  assert.deepEqual(productionOutputLinksFromJoinedRecords([{ id: rec(1) }, { id: rec(1) }]), [rec(1)]);
});
const fixture = (render, withFile = true) => ({
  id: rec(9),
  fields: {
    Output_Status: "Ready for Review", Review_Status: "Review Sent",
    Render_Status: render, Platform: "TikTok", Studio_Output_Type: "Video Draft",
    Output_Caption: "A finished review package", Thumbnail_URL: cover,
    Final_File_URL: withFile ? final : "", Studio_Preview_URL: withFile ? preview : "",
  },
});
test("Factory must refuse stale queue/ready statuses even with completed media", () => {
  for (const status of ["Waiting in Render Queue", "Ready for Render", "Rendering"]) {
    const record = fixture(status);
    assert.equal(evaluateReviewPackage(record).readiness, "IN_PROGRESS");
    assert.equal(formalFactoryApprovalReady(record), false);
  }
});
test("Factory accepts fully rendered packages only after authoritative render reconciliation", () => {
  const rendered = fixture("Rendered");
  assert.equal(evaluateReviewPackage(rendered).readiness, "READY");
  assert.equal(formalFactoryApprovalReady(rendered), true);
  assert.equal(formalFactoryApprovalReady(fixture("Rendered", false)), false);
});
test("Supabase content mapping reconciles exact output foreign-key associations", () => {
  const source = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const start = source.indexOf("export async function listContent(");
  const end = source.indexOf("export async function scheduleGridContentById(", start);
  assert.ok(start >= 0 && end > start);
  const method = source.slice(start, end);
  assert.match(method, /productionOutputLinksFromJoinedRecords\(linkedOutputs\)/);
  assert.match(method, /production_active_output_count:/);
  assert.match(method, /homeOutputInProduction\(mapped\)/);
  assert.match(method, /refusing Airtable fallback/);
});
