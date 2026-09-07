import assert from "node:assert/strict";
import { test } from "node:test";
import worker from "./worker.js";

test("health is public JSON", async () => {
  const res = await worker.fetch(new Request("https://tasks.chicagoshining.com/health"), {});
  assert.equal(res.status, 200);
  const body = await res.json();
  assert.equal(body.ok, true);
});

test("GET log-event lists desk incidents when supabase is missing", async () => {
  const res = await worker.fetch(
    new Request("https://tasks.chicagoshining.com/agent-activity/log-event?type=desk_incident")
  );
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "tasks_worker_missing_supabase");
});

test("log-event requires supabase bindings when origin is the worker", async () => {
  const res = await worker.fetch(
    new Request("https://tasks.chicagoshining.com/agent-activity/log-event", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ task_id: 1, agent_id: 13, type: "test", payload: { ok: true } }),
    }),
    {}
  );
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.equal(body.error, "tasks_worker_missing_supabase");
});
