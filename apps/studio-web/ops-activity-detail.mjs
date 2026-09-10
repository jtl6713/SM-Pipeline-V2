// Keep these helpers aligned with apps/studio-web/assets/app-item4-0621.js
// (renderOperationsActivityItems / Operations activity log cards).

const DETAIL_KEYS = [
  ["fingerprint", "Fingerprint"],
  ["class", "Class"],
  ["kind", "Kind"],
  ["record_id", "Record"],
  ["status", "Status"],
  ["diagnosis", "Diagnosis"],
  ["suite", "Suite"],
  ["workflow", "Workflow"],
  ["job", "Job"],
  ["conclusion", "Result"],
  ["detail", "Detail"],
  ["message", "Message"],
];

const LINK_KEYS = [
  ["run_url", "Open Actions run"],
  ["html_url", "Open Actions run"],
  ["pr_url", "Open pull request"],
  ["pull_request_url", "Open pull request"],
  ["record_url", "Open record"],
  ["airtable_url", "Open record"],
];

export function opsActivityPayload(row = {}) {
  return row.payload && typeof row.payload === "object" && !Array.isArray(row.payload)
    ? row.payload
    : {};
}

export function opsActivityIsTest(row = {}) {
  const type = String(row.type || "").trim();
  return type === "test_result" || type === "github_actions" || type === "regression";
}

export function opsActivityEventKey(row = {}, index = 0) {
  if (row.id != null && String(row.id).trim()) return `id:${row.id}`;
  return `row:${index}`;
}

export function opsActivityHeadline(row = {}) {
  const body = opsActivityPayload(row);
  if (opsActivityIsTest(row)) {
    return body.conclusion || body.job || row.type || "test";
  }
  return body.class || row.type || "desk_incident";
}

export function opsActivitySubhead(row = {}) {
  const body = opsActivityPayload(row);
  if (opsActivityIsTest(row)) {
    return body.suite || body.workflow || body.message || row.type || "test";
  }
  if (body.fingerprint) return body.fingerprint;
  if (body.record_id) return body.record_id;
  if (row.id != null) return `${row.type || "desk_incident"} · #${row.id}`;
  return "—";
}

export function opsActivitySummary(row = {}) {
  const body = opsActivityPayload(row);
  if (opsActivityIsTest(row)) {
    return [body.job, body.detail, body.message].filter(Boolean).join(" · ");
  }
  return String(body.diagnosis || body.status || "").trim();
}

export function opsActivityWhen(row = {}) {
  const body = opsActivityPayload(row);
  return String(row.created_at || body.at || "").trim();
}

function pushField(fields, label, value, seen) {
  if (value == null || value === "") return;
  const text = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value).trim();
  if (!text) return;
  const key = `${label}:${text}`;
  if (seen.has(key)) return;
  seen.add(key);
  fields.push({
    label,
    value: text,
    json: typeof value === "object",
  });
}

export function opsActivityDetailFields(row = {}) {
  const body = opsActivityPayload(row);
  const fields = [];
  const seen = new Set();
  pushField(fields, "Type", row.type, seen);
  if (row.id != null) pushField(fields, "Event", `#${row.id}`, seen);
  pushField(fields, "Agent", row.agent_id, seen);
  pushField(fields, "Task", row.task_id, seen);
  pushField(fields, "When", opsActivityWhen(row), seen);
  for (const [key, label] of DETAIL_KEYS) {
    pushField(fields, label, body[key], seen);
  }
  for (const [key, value] of Object.entries(body)) {
    if (DETAIL_KEYS.some(([name]) => name === key)) continue;
    if (LINK_KEYS.some(([name]) => name === key) || key === "at") continue;
    if (["parts", "jobs", "checks", "steps"].includes(key)) continue;
    pushField(fields, key.replace(/_/g, " "), value, seen);
  }
  return fields;
}

function normalizeConclusion(value) {
  return String(value || "").trim().toLowerCase();
}

export function opsActivityNormalizePart(raw = {}, fallbackName = "result") {
  if (raw == null) return null;
  if (typeof raw !== "object") {
    return { name: String(raw), conclusion: "", detail: "" };
  }
  const name = raw.name || raw.job || raw.check || raw.suite || fallbackName;
  const status = normalizeConclusion(raw.status);
  const conclusion = normalizeConclusion(raw.conclusion || raw.result)
    || (["success", "failure", "failed", "cancelled", "skipped", "timed_out", "startup_failure", "passed", "neutral"].includes(status) ? status : "");
  return {
    name: String(name || fallbackName),
    conclusion,
    detail: String(raw.detail || raw.message || "").trim(),
  };
}

export function opsActivityPartsFromEvent(row = {}) {
  const body = opsActivityPayload(row);
  const lists = [body.parts, body.jobs, body.checks, body.steps].find(Array.isArray);
  const fromList = (lists || [])
    .map((item) => opsActivityNormalizePart(item, body.job || body.suite || "result"))
    .filter(Boolean);
  if (fromList.length) return fromList;
  if (body.job || body.conclusion || body.message) {
    const part = opsActivityNormalizePart({
      name: body.job || body.suite || body.workflow || body.message || "result",
      conclusion: body.conclusion,
      detail: body.detail || "",
    });
    return part ? [part] : [];
  }
  return [];
}

export function opsActivityPartTone(conclusion) {
  const value = normalizeConclusion(conclusion);
  if (["failure", "failed", "cancelled", "timed_out", "startup_failure"].includes(value)) return "fail";
  if (["success", "passed"].includes(value)) return "ok";
  if (["skipped", "neutral"].includes(value)) return "skip";
  return "";
}

export function opsActivityPartCounts(parts = []) {
  const counts = { passed: 0, failed: 0, skipped: 0, other: 0 };
  for (const part of parts) {
    const tone = opsActivityPartTone(part?.conclusion);
    if (tone === "ok") counts.passed += 1;
    else if (tone === "fail") counts.failed += 1;
    else if (tone === "skip") counts.skipped += 1;
    else counts.other += 1;
  }
  return counts;
}

export function opsActivityOverall(parts = []) {
  const counts = opsActivityPartCounts(parts);
  if (counts.failed) return "failure";
  if (counts.passed && !counts.other) return "success";
  return "";
}

export function opsActivityCountsLabel(parts = []) {
  const counts = opsActivityPartCounts(parts);
  const bits = [];
  if (counts.passed) bits.push(`${counts.passed} passed`);
  if (counts.failed) bits.push(`${counts.failed} failed`);
  if (counts.skipped) bits.push(`${counts.skipped} skipped`);
  return bits.join(" · ");
}

export function opsActivityGroupKey(row = {}, index = 0) {
  const body = opsActivityPayload(row);
  if (opsActivityIsTest(row)) {
    if (body.run_id) return `run:${body.run_id}`;
    if (body.sha) return `sha:${body.sha}`;
  }
  return opsActivityEventKey(row, index);
}

export function opsActivityGroupEvents(events = []) {
  const groups = [];
  const map = new Map();
  events.forEach((row, index) => {
    const key = opsActivityGroupKey(row, index);
    if (!map.has(key)) {
      const group = { key, events: [], parts: [] };
      map.set(key, group);
      groups.push(group);
    }
    const group = map.get(key);
    group.events.push(row);
    for (const part of opsActivityPartsFromEvent(row)) {
      const existing = group.parts.find((item) => item.name === part.name);
      if (!existing) group.parts.push(part);
      else if (opsActivityPartTone(part.conclusion) && !opsActivityPartTone(existing.conclusion)) {
        Object.assign(existing, part);
      }
    }
  });
  return groups.map((group) => {
    const primary = group.events[0];
    const body = opsActivityPayload(primary);
    const links = [];
    const seen = new Set();
    const suites = [];
    for (const row of group.events) {
      const payload = opsActivityPayload(row);
      const suite = payload.suite || payload.workflow || payload.message || "";
      if (suite && !suites.includes(suite)) suites.push(suite);
      for (const link of opsActivityLinks(row)) {
        if (seen.has(link.href)) continue;
        seen.add(link.href);
        links.push(link);
      }
    }
    const counts = opsActivityPartCounts(group.parts);
    const conclusion = opsActivityOverall(group.parts) || normalizeConclusion(body.conclusion);
    return {
      key: group.key,
      events: group.events,
      parts: group.parts,
      counts,
      primary,
      title: conclusion || opsActivityHeadline(primary),
      subhead: suites.join(" · ") || opsActivitySubhead(primary),
      conclusion,
      summary: opsActivityCountsLabel(group.parts) || opsActivitySummary(primary),
      when: group.events.map((row) => opsActivityWhen(row)).filter(Boolean).sort().reverse()[0] || "",
      links,
    };
  });
}

export function opsActivityLinks(row = {}) {
  const body = opsActivityPayload(row);
  const links = [];
  const seen = new Set();
  for (const [key, label] of LINK_KEYS) {
    try {
      const parsed = new URL(String(body[key] || ""));
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") continue;
      if (seen.has(parsed.href)) continue;
      seen.add(parsed.href);
      links.push({ label, href: parsed.href });
    } catch {
      // ignore invalid URLs
    }
  }
  return links;
}
