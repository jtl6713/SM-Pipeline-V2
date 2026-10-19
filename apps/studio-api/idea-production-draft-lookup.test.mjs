import test from "node:test";
import assert from "node:assert/strict";
import { readStudioWorkerSource } from "./worker-source-reader.mjs";

function harness({ idea, requests = {}, denied = false } = {}) {
  const source = readStudioWorkerSource();
  const start = source.indexOf("async function existingDraftForIdea(");
  const end = source.indexOf("async function loadContentProfileRecord(", start);
  assert.ok(start >= 0 && end > start, "expected extracted Worker draft lookup");
  const code = source.slice(start, end);
  const calls = [];
  const env = { AIRTABLE_IDEA_TABLE_ID: "Idea Candidates" };
  const authorization = { organization: { record_id: "recOurOrg" } };
  const airtableFetch = async (_env, table, id) => {
    calls.push([table, id]);
    if (table === "Idea Candidates" && id === idea?.id) return idea;
    if (table === "Production Requests" && requests[id]) return requests[id];
    throw new Error("linked record lookup failed");
  };
  const f = (record, field) => record.fields?.[field];
  const arrayOrEmpty = (value) => Array.isArray(value) ? value : [];
  const membershipAllowsBrand = () => !denied;
  const preferAuthoritativeProductionRequest = rows =>
    rows.slice().sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0] || null;
  const lookup = new Function(
    "airtableFetch", "f", "arrayOrEmpty", "PRODUCTION_REQUEST_TABLE",
    "membershipAllowsBrand", "preferAuthoritativeProductionRequest",
    code + "\nreturn existingDraftForIdea;"
  )(airtableFetch, f, arrayOrEmpty, "Production Requests",
    membershipAllowsBrand, preferAuthoritativeProductionRequest);
  return { lookup, calls, env, authorization };
}

function draft(id, { status = "Draft", active = true, org = "recOurOrg" } = {}) {
  return { id, createdTime: "2026-10-19T00:00:00Z", fields: {
    Idea_Candidate: ["recIdea"], Organization: [org],
    Brand: ["recBrand"], Request_Status: status, Active: active,
  } };
}

test("opening an idea without a draft does not scan every Production Request", async () => {
  const idea = { id: "recIdea", fields: { "Production Requests": [] } };
  const h = harness({ idea });
  assert.equal(await h.lookup(h.env, idea.id, h.authorization, idea), null);
  assert.deepEqual(h.calls, []);
});

test("linked draft returns in one direct read with no global list", async () => {
  const idea = { id: "recIdea", fields: { "Production Requests": ["recDraft"] } };
  const record = draft("recDraft");
  const h = harness({ idea, requests: { recDraft: record } });
  assert.equal(await h.lookup(h.env, idea.id, h.authorization, idea), record);
  assert.deepEqual(h.calls, [["Production Requests", "recDraft"]]);
});

test("repeat entries and already-promoted requests do not duplicate draft selection", async () => {
  const idea = { id: "recIdea", fields: { "Production Requests": ["recOld", "recNew", "recNew"] } };
  const h = harness({ idea, requests: {
    recOld: draft("recOld", { status: "Completed" }),
    recNew: draft("recNew"),
  } });
  assert.equal((await h.lookup(h.env, idea.id, h.authorization, idea)).id, "recNew");
  assert.equal(h.calls.length, 2);
});

test("failed linked-request reads fail closed rather than creating a duplicate", async () => {
  const idea = { id: "recIdea", fields: { "Production Requests": ["recMissing"] } };
  const h = harness({ idea });
  await assert.rejects(h.lookup(h.env, idea.id, h.authorization, idea), /linked record lookup failed/);
});

test("legacy caller can load the Idea and still enforce organization and brand", async () => {
  const idea = { id: "recIdea", fields: { "Production Requests": ["recDraft"] } };
  const h = harness({ idea, requests: { recDraft: draft("recDraft", { org: "recOtherOrg" }) } });
  assert.equal(await h.lookup(h.env, idea.id, h.authorization), null);
  assert.deepEqual(h.calls, [
    ["Idea Candidates", "recIdea"], ["Production Requests", "recDraft"]
  ]);
});
