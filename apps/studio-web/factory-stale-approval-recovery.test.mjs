import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const source = readFileSync(new URL("./assets/factory-desk.js", import.meta.url), "utf8");
function block(startText, endText) {
  const start = source.indexOf(startText);
  const end = source.indexOf(endText, start);
  assert.ok(start >= 0 && end > start, "Factory recovery helpers must remain testable");
  return source.slice(start, end);
}
const extracted = [
  block("  function clearFactoryRecoveryFences(", "\n  function pruneFactorySelectionToNeedsEyes("),
  block("  function factoryRejectedOutputId(", "\n  async function fetchJson("),
].join("\n");

const A = "recAAAA1111AAAA11";
const B = "recBBBB2222BBBB22";
const C = "recCCCC3333CCCC33";
const recoveryKey = "studio.factory.recovery.v2.demo";
const waitingKey = "studio.factory.waiting-selection.v1";
function saved(error, ids = [A, B, C]) {
  return {
    profile_id: "global",
    ids,
    terminal_eligibility: true,
    last_error: error,
    batches: [{
      request_id: "factory_test_1234",
      ids,
      payload: {
        action: "start_group",
        request_id: "factory_test_1234",
        record_ids: ids,
        items: [
          { id: A, output_id: 101 },
          { id: B, output_id: 102 },
          { id: C, output_id: 103 },
        ],
      },
    }],
  };
}
function fixture(snapshot) {
  const store = new Map([[recoveryKey, JSON.stringify(snapshot)]]);
  const state = { selectedOutputs: new Set([A, B, C]) };
  let selectionWrites = 0;
  const localStorage = {
    removeItem(key) { store.delete(key); },
    getItem(key) { return store.get(key) ?? null; },
    setItem(key, value) { store.set(key, value); },
  };
  const context = {
    state, localStorage, FACTORY_WAITING_SELECTION_KEY: waitingKey,
    waitingFactorySelection: () => JSON.parse(store.get(waitingKey) || "[]"),
    factoryRecoveryEntries: () => store.has(recoveryKey)
      ? [{ key: recoveryKey, saved: JSON.parse(store.get(recoveryKey)) }] : [],
    factoryUnrecoverableSubmitError: message => /could not be loaded/i.test(String(message)),
    pendingFactoryApproval: () => null,
    saveFactorySelection: () => { selectionWrites++; },
    setBatchSubmissionError: () => {},
  };
  const api = vm.runInNewContext(extracted + "\n({factoryRejectedOutputId,dropFactoryRecoveryEntry,clearFactoryRecoveryFences})", context, {
    timeout: 1000,
  });
  return { api, store, state, get selectionWrites() { return selectionWrites; } };
}

test("exact server-identified stale output is removed without discarding other approvals", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  const { api, store, state } = fixture(row);
  const result = api.dropFactoryRecoveryEntry(recoveryKey, row, "Skipped expired output");
  assert.equal(result.dropped, true);
  assert.equal(result.skipped_output_id, B);
  assert.equal(result.remaining, 2);
  assert.equal(store.has(recoveryKey), false);
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort());
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
});

test("preflight past_review with exact rec ID removes only the already-approved member", () => {
  const row = saved(`Output #${B}: past_review. No new batch was accepted. You can submit other selections.`);
  const { api, store, state } = fixture(row);
  assert.equal(api.factoryRejectedOutputId(row), B,
    "The Worker reports an Airtable record ID, not always an output number");
  const result = api.clearFactoryRecoveryFences({ onlyUnrecoverable: true });
  assert.equal(result, 1);
  assert.equal(store.has(recoveryKey), false, "Terminal browser fence must not strand 8 outputs");
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort(),
    "Other members must remain eligible for a safe new request");
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
});

test("record-ID rejection refuses missing proof, different ID or multiple candidates", () => {
  for (const message of [
    `Output #${B}: past_review`,
    "Output #recZZZZ9999ZZZZ99: past_review. No new batch was accepted.",
    `Output #${B}: past_review. No new batch was accepted. Output #${C}: past_review. No new batch was accepted.`,
  ]) {
    const row = saved(message);
    const { api, store } = fixture(row);
    assert.equal(api.factoryRejectedOutputId(row), null);
    assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
    assert.equal(store.has(recoveryKey), true);
  }
});

test("releasing rejected saved request repaints the visible review list", () => {
  assert.match(source, /if \(droppedPoison\) \{[\s\S]{0,350}if \(state\.desk\) renderDesk\(state\.desk\)/);
  assert.match(source, /if \(result\?\.dropped\) \{[\s\S]{0,170}if \(state\.desk\) renderDesk\(state\.desk\)/);
});

test("generic missing-record 409 cannot silently discard or retry unknown output IDs", () => {
  const row = saved("At least one selected output could not be loaded for global batch approval");
  const { api, store, state } = fixture(row);
  const result = api.dropFactoryRecoveryEntry(recoveryKey, row, "Unverified missing output");
  assert.equal(result.dropped, false);
  assert.equal(result.resolved, false);
  assert.equal(store.has(recoveryKey), true);
  assert.deepEqual([...state.selectedOutputs], [A, B, C]);
  assert.equal(store.has(waitingKey), false);
});

test("timeout and generic 409 without server no-acceptance proof preserve all IDs", () => {
  for (const error of [
    "Output #102: output no longer ready",
    "Factory request timed out",
    "Selected outputs overlap another live Factory approval (factory_other_1234)",
  ]) {
    const row = saved(error);
    const { api, store } = fixture(row);
    assert.equal(api.factoryRejectedOutputId(row), null);
    assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
    assert.equal(store.has(recoveryKey), true);
  }
});

test("recovery startup retains valid selections after a single terminal preflight 409", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  const { api, store, state } = fixture(row);
  assert.equal(api.clearFactoryRecoveryFences({ onlyUnrecoverable: true }), 1);
  assert.equal(store.has(recoveryKey), false);
  assert.deepEqual(JSON.parse(store.get(waitingKey)), [A, C]);
  assert.deepEqual([...state.selectedOutputs].sort(), [A, C].sort());
});

test("a preflight error without a unique numeric match cannot remove a record", () => {
  const row = saved("Output #102: output is no longer ready for approval. No new batch was accepted.");
  row.batches[0].payload.items.push({ id: A, output_id: 102 });
  const { api, store } = fixture(row);
  assert.equal(api.factoryRejectedOutputId(row), null);
  assert.equal(api.dropFactoryRecoveryEntry(recoveryKey, row).dropped, false);
  assert.equal(store.has(recoveryKey), true);
});
