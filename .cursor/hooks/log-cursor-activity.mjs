#!/usr/bin/env node
/**
 * Cursor hook: POST activity to tasks.chicagoshining.com.
 * Always prints {} so the agent loop is never blocked or auto-continued.
 */
const API =
  process.env.AI_ACTIVITY_API_URL ||
  "https://tasks.chicagoshining.com/agent-activity/log-event";
const agentId = Number(
  process.env.AI_ACTIVITY_AGENT_ID ||
    (process.argv.includes("--agent-id")
      ? process.argv[process.argv.indexOf("--agent-id") + 1]
      : 7)
);
const taskId = Number(process.env.AI_ACTIVITY_TASK_ID || 1);

function clip(value, max = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function eventFromHook(raw) {
  const name = String(raw.hook_event_name || raw.event || "").toLowerCase();
  if (name.includes("fileedit") || raw.file_path) {
    const edits = Array.isArray(raw.edits) ? raw.edits : [];
    return {
      type: "cursor_diff",
      payload: {
        hook: raw.hook_event_name || "afterFileEdit",
        file_path: raw.file_path || "",
        edits: edits.slice(0, 8).map((edit) => ({
          old_string: clip(edit.old_string, 500),
          new_string: clip(edit.new_string, 500),
        })),
      },
    };
  }
  if (name.includes("agentresponse") || raw.text) {
    return {
      type: "cursor_action",
      payload: {
        hook: raw.hook_event_name || "afterAgentResponse",
        message: clip(raw.text || "", 4000),
      },
    };
  }
  return {
    type: "cursor_action",
    payload: {
      hook: raw.hook_event_name || "stop",
      status: raw.status || "completed",
      loop_count: raw.loop_count ?? 0,
    },
  };
}

async function main() {
  process.stdout.write("{}\n");
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8").trim();
  if (!text) return;
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return;
  }
  const event = eventFromHook(raw);
  const headers = { "Content-Type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }
  const res = await fetch(API, {
    method: "POST",
    headers,
    body: JSON.stringify({
      task_id: Number.isFinite(taskId) ? taskId : 1,
      agent_id: Number.isFinite(agentId) ? agentId : 7,
      type: event.type,
      payload: event.payload,
    }),
    redirect: "manual",
  });
  if (!res.ok) {
    const body = await res.text();
    console.error(`cursor activity log HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

main().catch((err) => {
  console.error("cursor activity log failed:", err?.message || err);
});
