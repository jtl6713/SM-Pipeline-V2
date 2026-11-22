import test from "node:test";
import assert from "node:assert/strict";
import {
  isSupabasePoolOrTimeoutError,
  noteSupabaseCircuitFailure,
  resetSupabaseCircuitForTests,
  supabaseCircuitOpen,
} from "./supabase-pipeline-reads.mjs";

test("HTTP 522 and 5xx overload errors count toward the Worker circuit", () => {
  for (const code of [429, 500, 502, 503, 504, 522]) {
    resetSupabaseCircuitForTests();
    const error = new Error(`Supabase POST https://example.supabase.co/rest/v1/studio_media_transfer_queue failed ${code}: overloaded`);
    assert.equal(isSupabasePoolOrTimeoutError(error), true, `status ${code}`);
    assert.equal(noteSupabaseCircuitFailure(error), true);
    assert.equal(supabaseCircuitOpen(), false);
    assert.equal(noteSupabaseCircuitFailure(error), true);
    assert.equal(supabaseCircuitOpen(), true);
  }
  resetSupabaseCircuitForTests();
});

test("ordinary missing optional outbox and validation errors do not open circuit", () => {
  resetSupabaseCircuitForTests();
  for (const code of [400, 404, 409, 422]) {
    const error = new Error(`Supabase POST https://example.supabase.co/rest/v1/studio_side_effect_outbox failed ${code}: missing table`);
    assert.equal(isSupabasePoolOrTimeoutError(error), false);
    noteSupabaseCircuitFailure(error);
  }
  assert.equal(supabaseCircuitOpen(), false);
  resetSupabaseCircuitForTests();
});

test("timed-out connections and failed network signals trigger protection", () => {
  assert.equal(isSupabasePoolOrTimeoutError(new Error("connection terminated due to connection timeout")), true);
  assert.equal(isSupabasePoolOrTimeoutError(new Error("signal timed out")), true);
});
