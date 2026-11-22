import test, { afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isSupabasePoolOrTimeoutError,
  noteSupabaseCircuitFailure,
  resetSupabaseCircuitForTests,
  supabaseCircuitOpen,
} from "./supabase-pipeline-reads.mjs";

afterEach(() => resetSupabaseCircuitForTests());

test("Supabase 429, 5xx, and 522 overload errors open circuit after threshold", () => {
  for (const code of [429, 500, 502, 503, 504, 522]) {
    resetSupabaseCircuitForTests();
    const error = new Error(
      `Supabase POST https://example.supabase.co/rest/v1/studio_media_transfer_queue failed ${code}: overloaded`,
    );
    assert.equal(isSupabasePoolOrTimeoutError(error), true, `status ${code}`);
    assert.equal(noteSupabaseCircuitFailure(error), true);
    assert.equal(supabaseCircuitOpen(), false, `circuit should not trip after one ${code}`);
    assert.equal(noteSupabaseCircuitFailure(error), true);
    assert.equal(supabaseCircuitOpen(), true, `circuit should trip after two ${code}`);
  }
});

test("optional outbox 404 and ordinary client/validation errors do not open the circuit", () => {
  for (const code of [400, 404, 409, 422]) {
    const error = new Error(
      `Supabase POST https://example.supabase.co/rest/v1/studio_side_effect_outbox failed ${code}: not found`,
    );
    assert.equal(isSupabasePoolOrTimeoutError(error), false, `status ${code}`);
    assert.equal(noteSupabaseCircuitFailure(error), false);
  }
  assert.equal(supabaseCircuitOpen(), false);
});

test("connection timeout and aborted request signals count as overload", () => {
  for (const message of [
    "connection terminated due to connection timeout",
    "signal timed out",
    "Supabase request timed out",
    "PGRST003: connection pool timed out",
  ]) {
    assert.equal(isSupabasePoolOrTimeoutError(new Error(message)), true, message);
  }
  const timeout = new Error("The operation was aborted by a timeout");
  timeout.name = "TimeoutError";
  assert.equal(isSupabasePoolOrTimeoutError(timeout), true);
  const cancelled = new Error("Caller cancelled an in-flight request");
  cancelled.name = "AbortError";
  assert.equal(isSupabasePoolOrTimeoutError(cancelled), false);
});
