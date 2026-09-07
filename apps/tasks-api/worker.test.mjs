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

test("GET /logs is an HTML activity page, not Swagger", async () => {
  const res = await worker.fetch(new Request("https://tasks.chicagoshining.com/logs"), {});
  assert.equal(res.status, 503);
  assert.match(String(res.headers.get("content-type") || ""), /text\/html/);
  const body = await res.text();
  assert.match(body, /Task activity log/);
  assert.match(body, /Service desk/);
  assert.match(body, /Automated tests/);
  assert.doesNotMatch(body, /swagger/i);
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
