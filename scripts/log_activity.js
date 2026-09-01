import { logEvent } from "ai-activity-logger";

const args = process.argv.slice(2);
const agent_id = Number(process.env.AI_ACTIVITY_AGENT_ID || 9);
const task_id = Number(process.env.AI_ACTIVITY_TASK_ID || 1);

function clip(value, max = 4000) {
  const text = typeof value === "string" ? value : JSON.stringify(value ?? "");
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

if (args[0] === "--diff") {
  const diff = clip(args.slice(1).join(" "));
  await logEvent({
    task_id: Number.isFinite(task_id) ? task_id : 1,
    agent_id: Number.isFinite(agent_id) ? agent_id : 9,
    type: "cursor_diff",
    payload: { diff }
  });
} else {
  const message = clip(args.join(" "));
  await logEvent({
    task_id: Number.isFinite(task_id) ? task_id : 1,
    agent_id: Number.isFinite(agent_id) ? agent_id : 9,
    type: "cursor_action",
    payload: { message }
  });
}
