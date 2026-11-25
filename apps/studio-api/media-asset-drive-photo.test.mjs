import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fetchAuthorizedDrivePhoto } from "./media-asset-drive-photo.mjs";

test("private Drive PNG uses the exact authenticated original and preserves Range", async () => {
  let calls = 0;
  const response = await fetchAuthorizedDrivePhoto({
    fileId: "private-id", headers: new Headers({ Range: "bytes=0-0", Accept: "image/png" }),
    getToken: async () => "test-token",
    fetchImpl: async (url, options) => {
      calls++;
      assert.equal(url, "https://www.googleapis.com/drive/v3/files/private-id?alt=media&supportsAllDrives=true");
      assert.equal(options.headers.get("Authorization"), "Bearer test-token");
      assert.equal(options.headers.get("Range"), "bytes=0-0");
      return new Response(Uint8Array.of(137), { status: 206, headers: { "Content-Type": "image/png", "Content-Range": "bytes 0-0/2000000" } });
    }
  });
  assert.equal(calls, 1);
  assert.equal(response.status, 206);
  assert.equal((await response.arrayBuffer()).byteLength, 1);
});

test("rejects HTML, JSON, SVG and failed authorization; public fallback remains possible", async () => {
  for (const [status, type] of [[200, "text/html"], [200, "application/json"], [200, "image/svg+xml"], [403, "image/png"], [429, "application/json"]]) {
    assert.equal(await fetchAuthorizedDrivePhoto({
      fileId: "id", getToken: async () => "token",
      fetchImpl: async () => new Response("not an accepted photo", { status, headers: { "Content-Type": type } })
    }), null);
  }
});

test("missing token or network failure does not prevent existing fallback", async () => {
  assert.equal(await fetchAuthorizedDrivePhoto({fileId: "id", getToken: async () => "", fetchImpl: async () => assert.fail("no request without token")}), null);
  assert.equal(await fetchAuthorizedDrivePhoto({fileId: "id", getToken: async () => { throw Error("unavailable"); }}), null);
  assert.equal(await fetchAuthorizedDrivePhoto({fileId: "id", getToken: async () => "token", fetchImpl: async () => { throw Error("network"); }}), null);
});

test("photo route passes environment for GET and HEAD and preserves existing authorization and DNU checks", async () => {
  const source = await readFile(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  const fn = source.slice(source.indexOf("export async function mediaAssetImagePreview("), source.indexOf("/*__STUDIO_WORKER_END:mediaAssetImagePreview__*/"));
  assert.match(fn, /authorization\?\.authenticated/);
  assert.match(fn, /f\(record, "Do_Not_Use"\)/);
  assert.match(fn, /fetchGoogleDriveInlineImage\(record, request, env\)/);
  assert.match(fn, /Range: "bytes=0-0"[^]*?\n\s*env\n/);
  assert.match(fn, /upstream\.status === 206\) headers\.delete\("Content-Length"\)/);
});
