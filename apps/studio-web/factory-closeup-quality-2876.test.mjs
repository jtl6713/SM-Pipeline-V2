import test from "node:test";
import assert from "node:assert/strict";
import "./assets/factory-closeup-quality.js";
const { frameReport, normalizedRatio } = globalThis.StudioFactoryCloseupQuality;

test("vertical AI still retains adequate real pixels after center crop", () => {
  const result = frameReport({ width: 1024, height: 1536, ratio: "9:16" });
  assert.equal(result.status, "geometry_ok");
  assert.equal(result.cropWidth, 864);
  assert.equal(result.cropHeight, 1536);
  assert.equal(result.safeZonePct, 9);
  assert.equal(result.subjectVerified, false);
  assert.equal(result.publicationAuthorized, false);
});
test("horizontal landscape to vertical warns on extreme cropping and low resolution", () => {
  const result = frameReport({ width: 1920, height: 1080, ratio: "9x16" });
  assert.equal(result.status, "review");
  assert.ok(result.issues.includes("center_crop_discards_over_25_percent"));
  assert.ok(result.issues.includes("source_resolution_below_review_floor"));
  assert.ok(result.cropLossPct > 60);
});
test("known focal subject lost by center crop is flagged, not auto-reframed", () => {
  const result = frameReport({
    width: 1600, height: 1200, ratio: "4:5",
    focalBox: [0.02, 0.2, 0.25, 0.8],
  });
  assert.equal(result.status, "review");
  assert.ok(result.issues.includes("verified_focal_box_clipped"));
  assert.ok(result.focalCoveragePct < 98);
});
test("image with enough pixels and fully retained focal subject is geometry-ok only", () => {
  const result = frameReport({
    width: 1080, height: 1350, ratio: "4:5",
    focalBox: [0.3, 0.3, 0.7, 0.7],
  });
  assert.equal(result.status, "geometry_ok");
  assert.equal(result.focalCoveragePct, 100);
  assert.equal(result.publicationAuthorized, false);
});
test("missing dimensions or unrecognized aspect never looks approved", () => {
  assert.equal(frameReport({ width: 0, height: 1500, ratio: "9:16" }).status, "unavailable");
  assert.equal(frameReport({ width: 1080, height: 1920, ratio: "3:4" }).status, "unavailable");
  assert.equal(normalizedRatio("4x5"), "4:5");
  assert.equal(normalizedRatio("unknown"), "");
});
test("broken focal-box coordinates never produce fabricated verified-subject status", () => {
  const result = frameReport({ width: 1080, height: 1920, ratio: "9:16",
    focalBox: [-1, 0, 0.3, 0.2] });
  assert.equal(result.subjectVerified, false);
  assert.equal(result.focalCoveragePct, null);
});
