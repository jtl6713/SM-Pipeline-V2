import { logEvent } from "ai-activity-logger";

const args = process.argv.slice(2);

if (args[0] === "--diff") {
  const diff = args.slice(1).join(" ");
  logEvent({
    task_id: 1,
    agent_id: 7,
    type: "cursor_diff",
    payload: { diff }
  });
} else {
  const message = args.join(" ");
  logEvent({
    task_id: 1,
    agent_id: 7,
    type: "cursor_action",
    payload: { message }
  });
}
