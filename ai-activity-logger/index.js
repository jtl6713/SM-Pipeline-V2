import fetch from "node-fetch";

export async function logEvent({ task_id, agent_id, type, payload }) {
  const API = "https://tasks.chicagoshining.com/agent-activity/log-event";

  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task_id, agent_id, type, payload })
    });

    const json = await res.json();
    console.log("AI Activity Logged:", json);
    return json;
  } catch (err) {
    console.error("AI Activity Logging Error:", err);
  }
}
