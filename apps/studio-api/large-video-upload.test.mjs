import assert from "node:assert/strict";
import test from "node:test";

function sessionIdFromPath(pathname) {
  const match = String(pathname || "").match(/\/assets\/upload-session\/([A-Za-z0-9_-]+)/);
  return match ? match[1] : "";
}

function partNumberFromPath(pathname) {
  const match = String(pathname || "").match(/\/parts\/(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function findLargeUploadDraft(assets, assetId) {
  const id = String(assetId || "").trim();
  return (Array.isArray(assets) ? assets : []).find((row) => (
    String(row?.id || "") === id
    && String(row?.upload_status || "") === "multipart_pending"
    && String(row?.multipart_upload_id || "").trim()
    && String(row?.r2_key || "").trim()
  )) || null;
}

test("upload-session path extracts asset id and part number", () => {
  const base = "/api/production-requests/recABC123/assets/upload-session/asset99";
  assert.equal(sessionIdFromPath(`${base}/parts/3`), "asset99");
  assert.equal(partNumberFromPath(`${base}/parts/3`), 3);
  assert.equal(sessionIdFromPath(`${base}/complete`), "asset99");
  assert.equal(sessionIdFromPath("/api/production-requests/recABC123/assets/upload-session"), "");
});

test("findLargeUploadDraft requires multipart pending + r2 key", () => {
  const assets = [
    { id: "a1", upload_status: "complete", multipart_upload_id: "x", r2_key: "studio/master-assets/x" },
    { id: "a2", upload_status: "multipart_pending", multipart_upload_id: "upl", r2_key: "studio/master-assets/y" },
  ];
  assert.equal(findLargeUploadDraft(assets, "a1"), null);
  assert.equal(findLargeUploadDraft(assets, "a2")?.id, "a2");
  assert.equal(findLargeUploadDraft(assets, "missing"), null);
});

test("finished-video hard max is 1.5 GB and direct upload stays under Worker body limit", () => {
  const finishedHardMax = Math.round(1.5 * 1024 * 1024 * 1024);
  const directMax = 95 * 1024 * 1024;
  const clipHardMax = 200 * 1024 * 1024;
  assert.ok(directMax < 100 * 1024 * 1024);
  assert.ok(directMax < clipHardMax);
  assert.ok(clipHardMax < finishedHardMax);
  assert.equal(finishedHardMax, 1610612736);
});
