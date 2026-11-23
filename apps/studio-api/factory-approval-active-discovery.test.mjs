import test from "node:test";
import assert from "node:assert/strict";
import {
  factoryBoundedActiveDiscovery, factoryActivityCursor,
} from "./factory-approval-active-discovery.mjs";
import { factoryBatchBuild, factoryBatchKey } from "./factory-approval-queue.mjs";
import { factoryApprovalGroupBuild, FACTORY_GROUP_PREFIX } from "./factory-approval-groups.mjs";

const profile = "recFactoryProfile01";
const output = "recFactoryOutput001";
const requestId = "factory_scan_fixture_20261123";
function bucketFixture({ child = [], parent = [], truncatedChild = false,
  truncatedGroup = false, missingGroup = false } = {}) {
  const requests = [], values = new Map();
  const bucket = {
    async list(options) {
      requests.push({ method: "list", ...options });
      if (options.prefix.endsWith("/jobs/")) return {
        objects: child, truncated: truncatedChild,
        cursor: truncatedChild ? "next_children_1" : undefined,
      };
      if (options.prefix.endsWith("/groups/")) return {
        objects: parent, truncated: truncatedGroup,
        cursor: truncatedGroup ? "next_groups_1" : undefined,
      };
      throw Error("unexpected R2 prefix");
    },
    async get(key) {
      requests.push({ method: "get", key });
      const v = values.get(key);
      return v ? { text: async () => JSON.stringify(v), etag: "test" } : null;
    },
    async put() { throw Error("Activity status GET cannot mutate R2"); },
    async delete() { throw Error("Activity status GET cannot delete R2"); },
  };
  return { bucket, requests, values };
}
function makeJob(group = null) {
  return factoryBatchBuild({
    profileId: profile, requestId: group?.request_id || requestId,
    groupRequestId: group?.parent_request_id || null,
    records: [{ id: output, output_id: 11129, title: "Fixture", platform: "Instagram", format: "Carousel" }],
  });
}

test("bounded child discovery reads a canonical active request in two R2 list calls", async () => {
  const job = makeJob();
  const key = factoryBatchKey(profile, job.request_id);
  const f = bucketFixture({ child: [{ key, customMetadata: { factory_active: "true", factory_group: "" } }] });
  f.values.set(key, job);
  const result = await factoryBoundedActiveDiscovery(f.bucket);
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].request_id, requestId);
  assert.deepEqual(result.discovery, {
    mode: "bounded-r2-cursor", child_cursor: null, group_cursor: null,
    complete: true, child_scanned: 1, group_scanned: 0,
  });
  assert.equal(f.requests.filter(x => x.method === "list").length, 2);
  assert.equal(f.requests.filter(x => x.method === "get").length, 1);
});

test("terminal metadata skips historical child GETs without fabricating active status", async () => {
  const job = makeJob();
  const f = bucketFixture({ child: [{
    key: factoryBatchKey(profile, job.request_id),
    customMetadata: { factory_active: "false" },
  }] });
  const result = await factoryBoundedActiveDiscovery(f.bucket);
  assert.equal(result.batches.length, 0);
  assert.equal(result.discovery.complete, true);
  assert.equal(f.requests.filter(x => x.method === "get").length, 0);
});

test("partial cursor cannot claim all-history completion or lose original cursor", async () => {
  const f = bucketFixture({ truncatedChild: true, truncatedGroup: true });
  const r = await factoryBoundedActiveDiscovery(f.bucket);
  assert.equal(r.batches.length, 0);
  assert.equal(r.discovery.complete, false);
  assert.equal(r.discovery.child_cursor, "next_children_1");
  assert.equal(r.discovery.group_cursor, "next_groups_1");
  assert.ok(f.requests.every(x => x.method === "list"), "no publishing/approval or DB mutations");
});

test("bounded parent discovery verifies a durable grouped approval and its child", async () => {
  const parent = await factoryApprovalGroupBuild({
    requestId: "factory_parent_scan_20261123",
    records: [{ id: output, profile_id: profile, output_id: 11129, platform: "Instagram", format: "Carousel" }],
  });
  const child = parent.children[0];
  const job = factoryBatchBuild({ profileId: profile, requestId: child.request_id,
    groupRequestId: parent.request_id, records: child.records });
  const key = FACTORY_GROUP_PREFIX + "/" + parent.request_id + ".json";
  const f = bucketFixture({ parent: [{key}] });
  f.values.set(key, parent);
  f.values.set(factoryBatchKey(profile, child.request_id), job);
  const result = await factoryBoundedActiveDiscovery(f.bucket);
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].group, true);
  assert.equal(result.batches[0].request_id, parent.request_id);
  assert.equal(result.batches[0].pending_count, 1);
});

test("invalid cursor and group read failure remain errors, never unverified zeros", async () => {
  assert.throws(() => factoryActivityCursor("../../invalid?"), /Invalid Factory activity/);
  const f = bucketFixture({ parent: [{key: FACTORY_GROUP_PREFIX + "/factory_unavailable_123.json"}] });
  // Missing group is safely ignored, but a storage exception must fail visibly.
  f.bucket.get = async () => { throw Error("R2 temporarily unavailable"); };
  await assert.rejects(factoryBoundedActiveDiscovery(f.bucket), /R2 temporarily unavailable/);
});
