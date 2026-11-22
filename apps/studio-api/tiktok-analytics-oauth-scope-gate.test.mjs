import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import test from "node:test";

// The auth workers have no imports. Exercise their real HTTP handlers rather
// than testing a copied scope list or a synthetic helper implementation.
globalThis.crypto ||= webcrypto;

const WORKERS = ["la", "nyc", "miami"];
const POSTING = ["user.info.basic", "video.publish", "video.upload"];
const ANALYTICS = "video.list";

async function loadWorker(city) {
  const source = await readFile(new URL(`../tiktok-auth-${city}/worker.js`, import.meta.url), "utf8");
  return (await import("data:text/javascript;base64," + Buffer.from(source).toString("base64"))).default;
}

function envWithTokens(scopes = POSTING, approved = false) {
  const values = new Map([
    ["tiktok:tokens", JSON.stringify({
      access_token: "local-fixture-access-token",
      refresh_token: "local-fixture-refresh-token",
      scope: scopes.join(","),
    })],
    ["tiktok:creator", JSON.stringify({ creator_username: "local_test_only" })],
  ]);
  return {
    TIKTOK_CLIENT_KEY: "local-fixture-key",
    TIKTOK_CLIENT_SECRET: "local-fixture-client-secret",
    TIKTOK_MAKE_SHARED_SECRET: "local-fixture-pipeline-secret",
    TIKTOK_OAUTH_STATE_SECRET: "local-fixture-signing-secret",
    ...(approved ? { TIKTOK_ANALYTICS_SCOPE_APPROVED: "true" } : {}),
    TIKTOK_AUTH: {
      get: async (key) => values.get(key) ?? null,
      put: async (key, value) => { values.set(key, value); },
      delete: async (key) => { values.delete(key); },
    },
  };
}

for (const city of WORKERS) {
  test(`${city}: ordinary reconnect requests only approved publishing scopes`, async () => {
    const worker = await loadWorker(city);
    const env = envWithTokens();
    const response = await worker.fetch(new Request(`https://auth-${city}.chicagoshining.com/tiktok/connect`), env);
    assert.equal(response.status, 302);
    const redirect = new URL(response.headers.get("location"));
    assert.equal(redirect.origin, "https://www.tiktok.com");
    assert.deepEqual(redirect.searchParams.get("scope").split(","), POSTING);
    assert.equal(redirect.searchParams.get("scope").includes(ANALYTICS), false);
    assert.ok(redirect.searchParams.get("state"));
  });

  test(`${city}: video.list only requested after explicit operator approval flag`, async () => {
    const worker = await loadWorker(city);
    const env = envWithTokens(POSTING, true);
    const response = await worker.fetch(new Request(`https://auth-${city}.chicagoshining.com/tiktok/connect`), env);
    assert.equal(response.status, 302);
    const redirect = new URL(response.headers.get("location"));
    assert.deepEqual(redirect.searchParams.get("scope").split(","), [...POSTING, ANALYTICS]);
  });

  test(`${city}: publishing auth stays valid while analytics is missing`, async () => {
    const worker = await loadWorker(city);
    const response = await worker.fetch(new Request(`https://auth-${city}.chicagoshining.com/tiktok/status`), envWithTokens());
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.authorized, true);
    assert.equal(body.posting_scopes_granted, true);
    assert.equal(body.analytics_scope_granted, false);
    assert.equal(body.analytics_scope_request_enabled, false);
    assert.equal(body.required_scopes_granted, false);
    assert.equal(JSON.stringify(body).includes("local-fixture-access-token"), false);
  });

  test(`${city}: fully granted token is accurately reported as analytics connected`, async () => {
    const worker = await loadWorker(city);
    const response = await worker.fetch(new Request(`https://auth-${city}.chicagoshining.com/tiktok/status`), envWithTokens([...POSTING, ANALYTICS], true));
    const body = await response.json();
    assert.equal(body.posting_scopes_granted, true);
    assert.equal(body.analytics_scope_granted, true);
    assert.equal(body.required_scopes_granted, true);
  });
}

test("Insights distinguishes developer approval from endless reconnect", async () => {
  const api = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  const ui = await readFile(new URL("../studio-web/assets/insights-0622.js", import.meta.url), "utf8");
  assert.match(api, /needs_developer_approval/);
  assert.match(api, /analytics_scope_request_enabled === false/);
  assert.match(api, /result\.tiktok\.reconnect_url = null/);
  assert.match(ui, /Developer approval needed/);
  assert.match(ui, /item\.error \|\| item\.last_error/);
});
