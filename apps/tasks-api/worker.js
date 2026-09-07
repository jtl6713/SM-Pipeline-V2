const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET,POST,OPTIONS",
  "access-control-allow-headers": "content-type,cf-access-client-id,cf-access-client-secret",
};

const HTML_HEADERS = {
  "content-type": "text/html; charset=utf-8",
  "cache-control": "no-store",
};

const OPERATOR_EVENT_TYPES = ["desk_incident", "test_result", "github_actions"];
const TEST_EVENT_TYPES = new Set(["test_result", "github_actions", "regression"]);

function json(status, body) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

function html(status, body) {
  return new Response(body, { status, headers: HTML_HEADERS });
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

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseEventTypes(raw) {
  const value = String(raw || "").trim();
  if (value === "all") return [...OPERATOR_EVENT_TYPES];
  if (!value) return ["desk_incident"];
  const types = value.split(",").map((part) => part.trim()).filter(Boolean);
  return types.length ? types : ["desk_incident"];
}

function isTestEvent(row) {
  return TEST_EVENT_TYPES.has(String(row?.type || "").trim());
}

async function queryActivityEvents(url, env) {
  const cfg = supabaseConfig(env);
  if (cfg.error) {
    return { ok: false, status: 503, error: "tasks_worker_missing_supabase", events: [] };
  }
  const types = parseEventTypes(url.searchParams.get("type"));
  const invalid = types.find((type) => !/^[a-z0-9_]+$/i.test(type));
  if (invalid) {
    return { ok: false, status: 400, error: "invalid_type", events: [] };
  }
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get("limit")) || 50));
  const taskId = Number(url.searchParams.get("task_id") || 1);
  const params = new URLSearchParams();
  params.set("select", "id,task_id,agent_id,type,payload,created_at");
  if (types.length === 1) params.set("type", `eq.${types[0]}`);
  else params.set("type", `in.(${types.join(",")})`);
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
    return { ok: false, status: 502, error: "supabase_non_json", detail: text.slice(0, 300), events: [] };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, error: "supabase_list_failed", detail: parsed, events: [] };
  }
  return { ok: true, events: Array.isArray(parsed) ? parsed : [] };
}

async function listActivityEvents(url, env) {
  const result = await queryActivityEvents(url, env);
  if (!result.ok) {
    return json(result.status || 502, {
      ok: false,
      error: result.error,
      detail: result.detail,
    });
  }
  return json(200, { ok: true, events: result.events });
}

function eventHeadline(row) {
  const body = row?.payload && typeof row.payload === "object" ? row.payload : {};
  if (isTestEvent(row)) {
    return body.suite || body.workflow || body.message || row.type || "test";
  }
  return body.class || body.fingerprint || row.type || "desk_incident";
}

function eventSummary(row) {
  const body = row?.payload && typeof row.payload === "object" ? row.payload : {};
  if (isTestEvent(row)) {
    const bits = [body.conclusion, body.job, body.detail, body.message].filter(Boolean);
    return bits.join(" · ");
  }
  return String(body.diagnosis || body.status || body.fingerprint || "").trim();
}

function renderEventItems(events) {
  if (!events.length) {
    return '<li class="empty">None yet.</li>';
  }
  return events.map((row) => {
    const body = row?.payload && typeof row.payload === "object" ? row.payload : {};
    const when = row.created_at || body.at || "";
    const url = typeof body.run_url === "string" && /^https?:\/\//i.test(body.run_url) ? body.run_url : "";
    const summary = eventSummary(row);
    return `<li>
      <strong>${escapeHtml(eventHeadline(row))}</strong>
      <span>${escapeHtml(row.type || "")}${row.id != null ? ` · #${escapeHtml(row.id)}` : ""}</span>
      ${summary ? `<p>${escapeHtml(String(summary).slice(0, 500))}</p>` : ""}
      ${url ? `<p><a href="${escapeHtml(url)}">${escapeHtml(url)}</a></p>` : ""}
      ${when ? `<em>${escapeHtml(String(when))}</em>` : ""}
    </li>`;
  }).join("");
}

async function renderActivityLogPage(url, env) {
  const query = new URL(url);
  if (!query.searchParams.get("type")) query.searchParams.set("type", "all");
  if (!query.searchParams.get("limit")) query.searchParams.set("limit", "80");
  const result = await queryActivityEvents(query, env);
  const events = result.events || [];
  const desk = events.filter((row) => !isTestEvent(row));
  const tests = events.filter(isTestEvent);
  const notice = result.ok
    ? ""
    : `<p class="notice">Could not load events (${escapeHtml(result.error || "unavailable")}). Studio Operations still shows live inventory.</p>`;
  return html(result.ok ? 200 : (result.status || 503), `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Task activity log</title>
  <style>
    body{font:16px/1.45 system-ui,sans-serif;margin:0;background:#f4f7f7;color:#173333}
    main{max-width:52rem;margin:0 auto;padding:28px 20px 48px}
    h1{font-size:1.45rem;margin:0 0 8px}
    h2{font-size:1.05rem;margin:28px 0 10px}
    p{margin:0 0 12px;color:#4a5f5f}
    a{color:#0f6e64}
    .notice{background:#fff4e5;border:1px solid #ead8a0;padding:10px 12px;border-radius:10px}
    ol{list-style:none;margin:0;padding:0;display:grid;gap:10px}
    li{background:#fff;border:1px solid #d7e3e1;border-radius:12px;padding:12px 14px}
    li.empty{color:#6a7c7c;background:transparent;border-style:dashed}
    strong{display:block}
    span,em{display:block;font-size:.82rem;color:#6a7c7c;font-style:normal}
    em{margin-top:6px}
  </style>
</head>
<body>
  <main>
    <h1>Task activity log</h1>
    <p>Service-desk tickets and automated test results. API schema stays at <a href="/docs">/docs</a>.</p>
    ${notice}
    <h2>Service desk</h2>
    <ol>${renderEventItems(desk)}</ol>
    <h2>Automated tests</h2>
    <ol>${renderEventItems(tests)}</ol>
  </main>
</body>
</html>`);
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
    if (url.pathname === "/logs" || url.pathname === "/logs/") {
      if (request.method !== "GET" && request.method !== "HEAD") {
        return json(405, { ok: false, error: "method_not_allowed" });
      }
      return renderActivityLogPage(url, env);
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
