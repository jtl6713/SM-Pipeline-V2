import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Execute the production implementation with an isolated in-memory cache.
// This catches the Cloudflare Worker lifecycle regression without live requests.
const source = readFileSync(new URL("./worker-functions-01.mjs", import.meta.url), "utf8");
const start = source.indexOf("export function studioReadCoalesce(");
const end = source.indexOf("/*__STUDIO_WORKER_END:studioReadCoalesce__*/", start);
assert.ok(start >= 0 && end > start, "Production coalesce source must be present");
const fnSource = source.slice(start, end).replace(/^export /, "");

function harness() {
  const cache = new Map();
  const read = new Function("studioHotReadCache", "studioReadCachePrune",
    fnSource + "\nreturn studioReadCoalesce;"
  )(cache, () => {});
  return { read, cache };
}
function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

test("unfinished loads do not share a cross-request Promise; newest read wins cache", async () => {
  const { read, cache } = harness();
  const one = deferred(), two = deferred();
  const first = read("outputs:miami:250:full", 25000, () => one.promise);
  const second = read("outputs:miami:250:full", 25000, () => two.promise);
  assert.notStrictEqual(first, second, "each HTTP request must own its Promise");
  assert.equal("promise" in cache.get("outputs:miami:250:full"), false);
  assert.equal(cache.get("outputs:miami:250:full").loadToken instanceof Promise, false);
  two.resolve({ records: ["newer"] });
  assert.deepEqual(await second, { records: ["newer"] });
  one.resolve({ records: ["older"] });
  assert.deepEqual(await first, { records: ["older"] });
  assert.deepEqual(cache.get("outputs:miami:250:full").value, { records: ["newer"] });
  assert.deepEqual(await read("outputs:miami:250:full", 25000, () => {
    throw new Error("settled cache was not reused");
  }), { records: ["newer"] });
});

test("invalidating an in-flight read never reintroduces stale content", async () => {
  const { read, cache } = harness();
  const old = deferred();
  const pending = read("outputs:miami:250:full", 25000, () => old.promise);
  cache.delete("outputs:miami:250:full");
  old.resolve({ records: ["deleted"] });
  await pending;
  assert.equal(cache.has("outputs:miami:250:full"), false);
});

test("429 cooling preserves an earlier settled result but other errors do not", async () => {
  const { read, cache } = harness();
  const original = { records: ["known-safe"] };
  assert.deepEqual(await read("pipeline-latest:miami", 10000, () => original), original);
  const rateLimit = Object.assign(new Error("Cooling down"), { status: 429 });
  assert.deepEqual(await read("pipeline-latest:miami", 0, () => Promise.reject(rateLimit)), original);
  assert.deepEqual(cache.get("pipeline-latest:miami").value, original);
  await assert.rejects(read("pipeline-latest:miami", 0, () =>
    Promise.reject(new Error("upstream unavailable"))), /upstream unavailable/);
});

test("Worker source never caches an unresolved Promise across requests", () => {
  assert.doesNotMatch(fnSource, /if \(hit\?\.promise\) return hit\.promise/);
  assert.doesNotMatch(fnSource, /studioHotReadCache\.set\([^;]*\bpromise\s*\}/);
  assert.match(fnSource, /current\?\.loadToken === loadToken/);
});
