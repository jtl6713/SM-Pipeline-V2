import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { claimItem4PollResume, ITEM4_POLL_RESUME_COOLDOWN_MS } from "./item4-poll-resume.mjs";

function memoryBucket() {
  const objects = new Map();
  let revision = 0;
  return {
    async get(key) {
      const current = objects.get(key);
      return current ? { etag: current.etag, json: async () => JSON.parse(current.body) } : null;
    },
    async put(key, body, { onlyIf }) {
      const current = objects.get(key);
      if (onlyIf.etagDoesNotMatch === "*" && current) return null;
      if (onlyIf.etagMatches && current?.etag !== onlyIf.etagMatches) return null;
      const object = { body, etag: String(++revision) };
      objects.set(key, object);
      return object;
    },
  };
}

test("concurrent polling routes admit exactly one recovery per exact request per cooldown", async () => {
  const bucket = memoryBucket();
  const now = 1000;
  const claims = await Promise.all(Array.from({ length: 24 }, () =>
    claimItem4PollResume(bucket, "recA", { now })));
  assert.equal(claims.filter(Boolean).length, 1);
  assert.equal(await claimItem4PollResume(bucket, "recA", { now: now + 59_999 }), false);
  assert.equal(await claimItem4PollResume(bucket, "recB", { now }), true);
  const expired = await Promise.all(Array.from({ length: 12 }, () =>
    claimItem4PollResume(bucket, "recA", { now: now + ITEM4_POLL_RESUME_COOLDOWN_MS })));
  assert.equal(expired.filter(Boolean).length, 1);
});

test("optional polling fast path fails closed without valid R2 or exact identity", async () => {
  assert.equal(await claimItem4PollResume(null, "recA"), false);
  assert.equal(await claimItem4PollResume(memoryBucket(), "../other"), false);
  const broken = { async get() { throw new Error("R2 unavailable"); }, async put() { throw new Error("never"); } };
  assert.equal(await claimItem4PollResume(broken, "recA"), false);
  const malformed = { async get() { return { etag: "1", json: async () => ({}) }; }, async put() { throw new Error("never"); } };
  assert.equal(await claimItem4PollResume(malformed, "recA"), false);
});

test("both authorized status routes gate background recovery, but scheduled recovery stays independent", async () => {
  const source = await readFile(new URL("./worker-functions-02.mjs", import.meta.url), "utf8");
  for (const name of ["getItem4Variants", "getItem4WorkspaceStatus"]) {
    const start = source.indexOf("export async function " + name + "(");
    const end = source.indexOf("/*__STUDIO_WORKER_END:" + name + "__", start);
    assert.ok(start >= 0 && end > start);
    const route = source.slice(start, end);
    assert.ok(route.indexOf("loadAuthorizedProductionRequest(") < route.indexOf("claimItem4PollResume("));
    assert.match(route, /if \(!await claimItem4PollResume\(env\.STUDIO_MEDIA, recordId\)\) return;/);
  }
  const start = source.indexOf("export async function item4DrainAllPendingWork(");
  const end = source.indexOf("/*__STUDIO_WORKER_END:item4DrainAllPendingWork__", start);
  const cron = source.slice(start, end);
  assert.doesNotMatch(cron, /claimItem4PollResume/);
  assert.match(cron, /if \(executionIds\.length\) drained\.push\(result\)/);
  assert.match(cron, /reason: "drain_or_reconcile_error"/);
});
