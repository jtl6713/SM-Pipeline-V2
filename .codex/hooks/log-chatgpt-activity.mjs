#!/usr/bin/env node
/**
 * Codex project hook: POST ChatGPT/Codex activity to tasks.chicagoshining.com.
 * This hook is telemetry only: it always exits 0 and never blocks a Codex turn.
 */
const API =
  process.env.AI_ACTIVITY_API_URL ||
  "https://tasks.chicagoshining.com/agent-activity/log-event";
const agentId = Number(process.env.AI_ACTIVITY_AGENT_ID || 9);
const taskId = Number(process.env.AI_ACTIVITY_TASK_ID || 1);

function clip(value, max = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function isSensitivePath(value) {
  const path = String(value || "").toLowerCase();
  return (
    /(^|[\\/])\.env([.\\/]|$)/.test(path) ||
    /(^|[\\/])(secrets?|credentials?|tokens?)([.\\/]|$)/.test(path) ||
    /(^|[\\/])auth\.json$/.test(path)
  );
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && value !== "");
}

function eventFromHook(raw) {
  const hook = String(
    firstValue(raw.hook_event_name, raw.hookEventName, raw.event, raw.type, "unknown")
  );
  const toolName = String(
    firstValue(raw.tool_name, raw.toolName, raw.tool?.name, raw.tool, "")
  );
  const toolInput = raw.tool_input || raw.toolInput || raw.input || {};
  const filePath = firstValue(
    raw.file_path,
    raw.filePath,
    toolInput?.file_path,
    toolInput?.filePath,
    toolInput?.path,
    ""
  );
  const lowerHook = hook.toLowerCase();
  const lowerTool = toolName.toLowerCase();
  const isEdit =
    lowerHook.includes("posttooluse") &&
    (/(edit|write|apply[_-]?patch)/.test(lowerTool) || Boolean(filePath));

  if (isEdit) {
    const payload = {
      hook: hook || "PostToolUse",
      tool_name: toolName,
      file_path: clip(filePath, 800),
    };

    if (!isSensitivePath(filePath)) {
      const change = firstValue(
        toolInput?.diff,
        toolInput?.patch,
        toolInput?.old_string && toolInput?.new_string
          ? { old_string: toolInput.old_string, new_string: toolInput.new_string }
          : undefined
      );
      if (change !== undefined) payload.change = clip(change, 2000);
    } else {
      payload.change = "[redacted sensitive path]";
    }

    return { type: "cursor_diff", payload };
  }

  const message = firstValue(
    raw.last_assistant_message,
    raw.lastAssistantMessage,
    raw.response,
    raw.text,
    raw.message,
    raw.summary,
    ""
  );

  return {
    type: "cursor_action",
    payload: {
      hook,
      status: firstValue(raw.status, raw.reason, "completed"),
      message: clip(message, 4000),
    },
  };
}

async function main() {
  // Valid no-op hook output; do not influence the Codex agent loop.
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
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      task_id: Number.isFinite(taskId) ? taskId : 1,
      agent_id: Number.isFinite(agentId) ? agentId : 9,
      type: event.type,
      payload: event.payload,
    }),
    redirect: "manual",
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`chatgpt activity log HTTP ${res.status}: ${body.slice(0, 200)}`);
  }
}

main().catch((err) => {
  console.error("chatgpt activity log failed:", err?.message || err);
}).finally(() => {
  process.exitCode = 0;
});
