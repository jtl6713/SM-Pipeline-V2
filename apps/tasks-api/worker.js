const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-client-id,cf-access-client-secret",
};

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function supabaseConfig(env) {
  const bindings = env || {};
  const supabaseUrl = String(bindings.SUPABASE_URL || "").replace(/\/$/, "");
  const supabaseKey = String(bindings.SUPABASE_SERVICE_ROLE_KEY || bindings.SUPABASE_ANON_KEY || "");
  if (!supabaseUrl || !supabaseKey) {
    return {
      error: json(503, {
        ok: false,
        error: "tasks_worker_missing_supabase",
        detail: "Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY on chicagoshining-tasks.",
      }),
    };
  }
  return { supabaseUrl, supabaseKey };
}

async function listActivityEvents(url, env) {
  const cfg = supabaseConfig(env);
  if (cfg.error) return cfg.error;
  const type = String(url.searchParams.get("type") || "desk_incident").trim() || "desk_incident";
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const taskId = Number(url.searchParams.get("task_id") || 1);
  const params = new URLSearchParams();
  params.set("select", "id,task_id,agent_id,type,payload,created_at");
  params.set("type", `eq.${type}`);
  params.set("order", "id.desc");
  params.set("limit", String(limit));
  if (Number.isInteger(taskId) && taskId >= 1) params.set("task_id", `eq.${taskId}`);
  const response = await fetch(`${cfg.supabaseUrl}/rest/v1/events?${params}`, {
    headers: {
      apikey: cfg.supabaseKey,
      Authorization: `Bearer ${cfg.supabaseKey}`,
      Accept: "application/json",
    },
  });
  const text = await response.text();
  let parsed;
  try {
    parsed = text ? JSON.parse(text) : [];
  } catch {
    return json(502, { ok: false, error: "supabase_non_json", detail: text.slice(0, 300) });
  }
  if (!response.ok) {
    return json(response.status, { ok: false, error: "supabase_list_failed", detail: parsed });
  }
  return json(200, { ok: true, events: Array.isArray(parsed) ? parsed : [] });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: JSON_HEADERS });
    }
    if (url.pathname === "/health" || url.pathname === "/health/") {
      return json(200, { ok: true, service: "chicagoshining-tasks", via: "worker" });
    }
    if (url.pathname !== "/agent-activity/log-event") {
      return json(404, { ok: false, error: "not_found" });
    }
    if (request.method === "GET") {
      return listActivityEvents(url, env);
    }
    if (request.method !== "POST") {
      return json(405, { ok: false, error: "method_not_allowed" });
    }

    let event;
    try {
      event = await request.json();
    } catch {
      return json(400, { ok: false, error: "invalid_json" });
    }

    const taskId = Number(event.task_id);
    const type = String(event.type || "").trim();
    if (!Number.isInteger(taskId) || taskId < 1 || !type) {
      return json(400, { ok: false, error: "task_id and type are required" });
    }

    const row = {
      task_id: taskId,
      agent_id: event.agent_id == null || event.agent_id === "" ? null : Number(event.agent_id),
      type,
      payload: event.payload ?? null,
    };
    if (row.agent_id != null && !Number.isInteger(row.agent_id)) {
      return json(400, { ok: false, error: "agent_id must be an integer" });
    }

    const cfg = supabaseConfig(env);
    if (cfg.error) return cfg.error;
    const { supabaseUrl, supabaseKey } = cfg;

    const response = await fetch(`${supabaseUrl}/rest/v1/events`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify(row),
    });
    const text = await response.text();
    let parsed;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      return json(502, { ok: false, error: "supabase_non_json", detail: text.slice(0, 300) });
    }
    if (!response.ok) {
      return json(response.status, { ok: false, error: "supabase_insert_failed", detail: parsed });
    }
    const created = Array.isArray(parsed) ? parsed[0] : parsed;
    return json(200, created);
  },
};
