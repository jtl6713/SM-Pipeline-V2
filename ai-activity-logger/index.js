import fetch from "node-fetch";

export async function logEvent({ task_id, agent_id, type, payload }) {
  const API = process.env.AI_ACTIVITY_API_URL || "https://tasks.chicagoshining.com/agent-activity/log-event";
  const headers = { "Content-Type": "application/json" };
  if (process.env.CF_ACCESS_CLIENT_ID && process.env.CF_ACCESS_CLIENT_SECRET) {
    headers["CF-Access-Client-Id"] = process.env.CF_ACCESS_CLIENT_ID;
    headers["CF-Access-Client-Secret"] = process.env.CF_ACCESS_CLIENT_SECRET;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      headers,
      body: JSON.stringify({ task_id, agent_id, type, payload }),
      redirect: "manual",
    });
    const text = await res.text();
    let json;
    try {
      json = JSON.parse(text);
    } catch {
      console.error(
        "AI Activity Logging Error:",
        `HTTP ${res.status} non-JSON from ${API}: ${text.slice(0, 200)}`
      );
      return;
    }
    if (!res.ok) {
      console.error("AI Activity Logging Error:", json);
      return json;
    }
    console.log("AI Activity Logged:", json);
    return json;
  } catch (err) {
    console.error("AI Activity Logging Error:", err);
  }
}
