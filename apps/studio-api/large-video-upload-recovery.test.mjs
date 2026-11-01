import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const source = fs.readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const start = source.indexOf("export async function completeItem4LargeVideoUploadSession(");
const fn = source.slice(start, source.indexOf("/*__STUDIO_WORKER_END:completeItem4LargeVideoUploadSession__*/", start)).replace("export ", "");

function harness({ objectSize = 580, complete = false, missingAfter = false } = {}) {
  const calls = { complete: 0, write: 0, pulses: 0 };
  const asset = { id: "asset", r2_key: "original", size_bytes: 580, multipart_upload_id: "session",
    name: "source.mov", upload_status: complete ? "complete" : "multipart_pending",
    compression_status: complete ? "pending" : undefined, origin_kind: "vibe-cut" };
  const env = { STUDIO_MEDIA: {
    head: async () => objectSize == null ? null : { size: objectSize },
    resumeMultipartUpload: () => ({ complete: async () => {
      calls.complete++;
      if (!missingAfter) objectSize = 580;
    } }),
  } };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const context = vm.createContext({
    HttpError, console,
    item4RequestIdFromPath: () => "request", item4LargeUploadSessionIdFromPath: () => "asset",
    loadAuthorizedProductionRequest: async () => ({ assets: [asset] }),
    assertEditableProductionRequest() {},
    readJsonBody: async request => request,
    item4AssetManifest: record => record.assets,
    item4FindLargeUploadDraft: assets => assets.find(a => a.upload_status === "multipart_pending"),
    respond: (_req, _env, result) => result, mapProductionRequest: record => record,
    f: () => "Uploading", item4AssetCompressionPending: a => a.compression_status === "pending",
    ITEM4_COMPRESS_THRESHOLD_BYTES: 100,
    item4UpdateRequestState: async (_env, _id, fields) => {
      calls.write++; return { assets: JSON.parse(fields.Studio_Master_Assets_JSON) };
    },
    item4PulseStudioCompressJob: async () => { calls.pulses++; },
    studioIsAzFinishedVideo: () => false,
  });
  vm.runInContext(fn, context);
  return { calls, run: parts => context.completeItem4LargeVideoUploadSession(
    { parts: parts || [{ part_number: 1, etag: "etag" }] }, env, {}, {}, { waitUntil() {} }),
  };
}

test("completion retry returns canonical uploaded video without duplicate side effects", async () => {
  const h = harness({ complete: true });
  const result = await h.run();
  assert.equal(result.assets[0].id, "asset");
  assert.equal(result.compression_pending, true);
  assert.deepEqual(h.calls, { complete: 0, write: 0, pulses: 0 });
});

test("completed object with pending Airtable manifest is recovered without completing multipart twice", async () => {
  const h = harness();
  const result = await h.run();
  assert.equal(result.assets[0].upload_status, "complete");
  assert.equal(result.assets[0].origin_kind, "vibe-cut");
  assert.equal(h.calls.complete, 0);
  assert.equal(h.calls.write, 1);
});

test("missing or wrong-sized stored object cannot be reported as uploaded", async () => {
  for (const options of [{ objectSize: 579 }, { objectSize: null, missingAfter: true }]) {
    const h = harness(options);
    await assert.rejects(h.run(), /size does not match/);
    assert.equal(h.calls.write, 0);
  }
});

test("duplicate, missing, or fractional part numbers are rejected before completion", async () => {
  for (const numbers of [[1,1], [1,3], [1.5]]) {
    const h = harness({ objectSize: null });
    await assert.rejects(h.run(numbers.map(part_number => ({ part_number, etag: "etag" }))), /unique, and consecutive/);
    assert.equal(h.calls.complete, 0);
    assert.equal(h.calls.write, 0);
  }
});
