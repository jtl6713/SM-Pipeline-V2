import { logEvent } from "ai-activity-logger";

const args = process.argv.slice(2);
const agent_id = Number(process.env.AI_ACTIVITY_AGENT_ID || 7);
const task_id = Number(process.env.AI_ACTIVITY_TASK_ID || 1);

if (args[0] === "--diff") {
  const diff = args.slice(1).join(" ");
  logEvent({
    task_id,
    agent_id,
    type: "cursor_diff",
    payload: { diff }
  });
} else {
  const message = args.join(" ");
  logEvent({
    task_id,
    agent_id,
    type: "cursor_action",
    payload: { message }
  });
}
