/* #2876: read-only Factory close-up framing and crop inspection.
 * This does not classify semantic subjects or authorize approval/publishing.
 * Source/published assets are never edited by this preview calculator.
 */
(function (scope) {
  "use strict";
  const TARGETS = Object.freeze({
    "9:16": Object.freeze({ width: 720, height: 1280 }),
    "4:5": Object.freeze({ width: 720, height: 900 }),
    "1:1": Object.freeze({ width: 720, height: 720 }),
    "16:9": Object.freeze({ width: 1280, height: 720 }),
  });

  function normalizedRatio(raw) {
    const value = String(raw || "").trim().replace(/x/g, ":");
    return Object.prototype.hasOwnProperty.call(TARGETS, value) ? value : "";
  }

  function frameReport({ width, height, ratio, focalBox } = {}) {
    const w = Number(width), h = Number(height), target = normalizedRatio(ratio);
    if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0
        || !Number.isInteger(w) || !Number.isInteger(h)) {
      return { status: "unavailable", reason: "Image dimensions unavailable", ratio: target };
    }
    if (!target) {
      return { status: "unavailable", reason: "Platform aspect ratio is not verified",
        width: w, height: h, ratio: "" };
    }
    const dimensions = TARGETS[target], wanted = dimensions.width / dimensions.height;
    const croppedWidth = Math.min(w, h * wanted), croppedHeight = Math.min(h, w / wanted);
    const left = (w - croppedWidth) / 2, top = (h - croppedHeight) / 2;
    const cropLost = Math.max(0, 1 - croppedWidth * croppedHeight / (w * h));
    const issues = [];
    if (croppedWidth < dimensions.width || croppedHeight < dimensions.height) {
      issues.push("source_resolution_below_review_floor");
    }
    if (cropLost > 0.25) issues.push("center_crop_discards_over_25_percent");
    let focalCoverage = null;
    if (Array.isArray(focalBox) && focalBox.length === 4
        && focalBox.every(n => Number.isFinite(n) && n >= 0 && n <= 1)
        && focalBox[2] > focalBox[0] && focalBox[3] > focalBox[1]) {
      const x1 = focalBox[0] * w, y1 = focalBox[1] * h;
      const x2 = focalBox[2] * w, y2 = focalBox[3] * h;
      const overlapW = Math.max(0, Math.min(x2, left + croppedWidth) - Math.max(x1, left));
      const overlapH = Math.max(0, Math.min(y2, top + croppedHeight) - Math.max(y1, top));
      focalCoverage = overlapW * overlapH / ((x2 - x1) * (y2 - y1));
      if (focalCoverage < 0.98) issues.push("verified_focal_box_clipped");
    }
    return {
      status: issues.length ? "review" : "geometry_ok",
      issues,
      ratio: target, width: w, height: h,
      cropWidth: Math.round(croppedWidth), cropHeight: Math.round(croppedHeight),
      cropLeft: Math.round(left), cropTop: Math.round(top),
      cropLossPct: Math.round(cropLost * 1000) / 10,
      focalCoveragePct: focalCoverage === null ? null : Math.round(focalCoverage * 1000) / 10,
      safeZonePct: 9,
      subjectVerified: focalCoverage !== null,
      sourceReviewed: false,
      publicationAuthorized: false,
    };
  }

  const api = Object.freeze({ normalizedRatio, frameReport, targetSizes: TARGETS });
  scope.StudioFactoryCloseupQuality = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window === "undefined" ? globalThis : window);
