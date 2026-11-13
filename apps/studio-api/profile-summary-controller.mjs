import {
  listContentProfileRecords, listRecords, mapOutput, mapIdea,
  mapStudioContentProfile, contentProfileFilterFormula,
} from "./worker-functions-01.mjs";
import {
  studioOverviewOperationalMetrics, studioOverviewScheduledCounts,
  studioOverviewRowMatchesProfile, validateStudioProfilesOverviewRows,
} from "./worker-functions-04.mjs";
import { OUTPUT_LIST_FIELDS } from "./worker.js";
import { homeApprovedCalendarCounts } from "./home-approved-calendar-counts.mjs";
import { validProfileSummaryV6Rows } from "./profile-summary-v6.mjs";
import { listProfileSummaryRecords } from "./supabase-pipeline-reads.mjs";

export const PROFILE_SUMMARY_BINDING = "STUDIO_PROFILE_SUMMARIES";
const NAME = "all-profiles-v1";
const PLATFORMS = ["Facebook", "Instagram", "TikTok", "YouTube"];

export function profileSummaryStub(env) {
  if (!env?.[PROFILE_SUMMARY_BINDING]?.get) return null;
  const ns = env[PROFILE_SUMMARY_BINDING];
  return ns.get(ns.idFromName(NAME));
}

async function summaryRequest(env, path, data) {
  const stub = profileSummaryStub(env);
  if (!stub) throw new Error("Profile summary namespace is not configured");
  const res = await stub.fetch("https://profile-summary.internal" + path, data === undefined
    ? { method: "GET" }
    : { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(data) });
  const body = await res.json();
  if (!res.ok || body?.ok !== true) {
    throw new Error("Profile summary " + path + " failed: " + String(body?.error || body?.reason || res.status));
  }
  return body;
}

export function readStudioProfileSummary(env) {
  return summaryRequest(env, "/snapshot");
}

export function studioProfileSummaryStatus(env) {
  return summaryRequest(env, "/status");
}

// Non-authoritative metrics only: a telemetry fault never blocks a live Airtable call.
export async function recordStudioAirtableEgress(env, event) {
  if (!profileSummaryStub(env)) return { skipped: true };
  return summaryRequest(env, "/egress", {
    source: event.source,
    method: event.method,
    status: event.status,
    at_ms: event.at_ms,
  });
}

const AIRTABLE_WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export function summarizeStudioAirtableActivity(hourly, windowHours = 48) {
  let readAttempts = 0;
  let writeAttempts = 0;
  for (const row of Array.isArray(hourly) ? hourly : []) {
    const attempts = Number(row?.attempts) || 0;
    const method = String(row?.method || "").toUpperCase();
    if (method === "GET") readAttempts += attempts;
    else if (AIRTABLE_WRITE_METHODS.has(method)) writeAttempts += attempts;
  }
  return {
    ok: true,
    window_hours: windowHours,
    read_attempts: readAttempts,
    write_attempts: writeAttempts,
    any_read: readAttempts > 0,
    any_write: writeAttempts > 0,
    any_activity: readAttempts + writeAttempts > 0,
  };
}

export function studioAirtableEgressWindow(env, hours = 48) {
  const stub = profileSummaryStub(env);
  if (!stub) throw new Error("Airtable egress collector unavailable");
  const windowHours = Math.max(1, Math.min(72, Number(hours) || 48));
  return stub.fetch("https://profile-summary.internal/egress?hours="+
    encodeURIComponent(String(windowHours))).then(async res => {
      const data = await res.json();
      if (!res.ok || data?.ok !== true) throw new Error("Airtable egress metrics unavailable");
      return { ...data, activity: summarizeStudioAirtableActivity(data.hourly, windowHours) };
    });
}


export async function notifyStudioProfileSummary(env, tableId, method, body) {
  if (env?.STUDIO_PROFILE_SUMMARY_CAPTURE_ENABLED !== "true") {
    return { skipped: true, reason: "capture_not_enabled" };
  }
  if (!profileSummaryStub(env)) return { skipped: true, reason: "not_configured" };
  const verb = String(method || "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(verb)) return { skipped: true, reason: "read" };
  const kind = String(tableId) === String(env.AIRTABLE_OUTPUT_TABLE_ID)
    ? "output" : String(tableId) === String(env.AIRTABLE_IDEA_TABLE_ID) ? "idea" : "";
  if (!kind) return { skipped: true, reason: "untracked_table" };
  const ids = [...new Set([
    ...(Array.isArray(body?.records) ? body.records : []),
    ...(!Array.isArray(body?.records) && body?.id ? [body] : []),
  ].map((r) => String(r?.id || "")).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  if (!ids.length) return { skipped: true, reason: "no_records" };
  return summaryRequest(env, "/dirty", { kind, ids });
}

function buildProfileInfo(profiles) {
  return profiles.map((profile) => {
    const mapped = mapStudioContentProfile(profile);
    return { id: profile.id, name: String(profile.fields?.Profile_Name || ""),
      city_label: mapped.city_label || mapped.name || "" };
  });
}

/**
 * Operator-initiated, fail-closed rebuild from all eligible Airtable records.
 * Staged rows are never visible to Home. /commit verifies all four profiles'
 * authoritative totals before atomically switching the read model.
 * Failed/interrupted runs leave the prior completed ledger intact.
 */
async function listRecordsWithCoolingRetry(env, tableId, options) {
  const stored = await listProfileSummaryRecords(env, tableId, options).catch(() => null);
  if (Array.isArray(stored)) return stored;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await listRecords(env, tableId, { ...options, airtableEgressSource: "shadow_reconcile" });
    } catch (error) {
      lastError = error;
      const cooling = Number(error?.status) === 429
        || /cooling down|rate.?limit|too many requests/i.test(String(error?.message || error || ""));
      if (!cooling || attempt === 3) throw error;
      await new Promise((resolve) => setTimeout(resolve, 8000 * attempt));
    }
  }
  throw lastError;
}

export async function reconcileStudioProfileSummary(env) {
  try {
    return await runStudioProfileSummaryReconcile(env);
  } catch (error) {
    await summaryRequest(env, "/fail", { error: String(error?.message || error) }).catch(() => null);
    throw error;
  }
}

async function runStudioProfileSummaryReconcile(env) {
  const rawProfiles = await listContentProfileRecords(env, { airtableEgressSource: "shadow_reconcile" });
  const profiles = rawProfiles.filter((p) => {
    const label = String(p.fields?.Profile_Name || "").toLowerCase();
    return ["chicago", "new york", "los angeles", "miami"].some((city) => label.includes(city));
  });
  if (profiles.length !== 4) throw new Error("Expected exactly four Content Profiles for summary bootstrap");
  const info = buildProfileInfo(profiles);
  // Fence concurrent dirty notifications BEFORE the first Airtable page:
  // changes occurring during scan remain in the pending queue until commit,
  // then are reread from Airtable. An interrupted scan never replaces Home.
  const generation = "reconcile-" + Date.now() + "-" + crypto.randomUUID();
  await summaryRequest(env, "/begin", { generation, profiles: info });
  const seen = new Set();
  const staged = [];
  const expectedRows = [];

  // Filter and paginate by profile, exactly as the existing Home rebuild does.
  // Never publish incomplete rows (listRecords throws on timeout/429).
  for (const profile of profiles) {
    const profileFormula = contentProfileFilterFormula(profile);
    if (!profileFormula) throw new Error("Missing profile filter");
    const outputs = (await listRecordsWithCoolingRetry(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      filterFormula: "AND(" + profileFormula + ',{Output_Status}!="Published",{Publish_Status}!="Published")',
      limit: 50000, fields: OUTPUT_LIST_FIELDS,
    })).filter((row) => studioOverviewRowMatchesProfile(row, profile));
    const ideas = (await listRecordsWithCoolingRetry(env, env.AIRTABLE_IDEA_TABLE_ID, {
      filterFormula: "AND(" + profileFormula + ",{Promoted_Content_Record_ID}=BLANK(),{Content Items}=BLANK())",
      limit: 50000,
      fields: ["Content_Profile", "Promoted_Content_Record_ID", "Content Items"],
    })).filter((row) => studioOverviewRowMatchesProfile(row, profile));
    if (outputs.length >= 50000 || ideas.length >= 50000) {
      throw new Error("Summary scan reached an incomplete-result safety ceiling");
    }
    for (const [kind, rows] of [["output", outputs], ["idea", ideas]]) {
      for (const record of rows) {
        const key = kind + ":" + record.id;
        if (seen.has(key)) throw new Error("Record matched multiple content profiles: " + key);
        seen.add(key);
        staged.push({ kind, record, profile_id: profile.id });
      }
    }
    const mapped = outputs.map((row) => mapOutput(row, null));
    const ideaRows = ideas.map(mapIdea);
    const metrics = studioOverviewOperationalMetrics(mapped, ideaRows);
    const scheduled = studioOverviewScheduledCounts(mapped);
    const calendar = homeApprovedCalendarCounts(mapped);
    expectedRows.push({
      id: profile.id,
      name: info.find((p) => p.id === profile.id)?.city_label,
      city_label: info.find((p) => p.id === profile.id)?.city_label,
      scheduled, manual: metrics.manual_action_required,
      failed: metrics.failed_outputs, approval: calendar.awaiting,
      awaiting_final_by_platform: calendar.awaiting_by_platform,
      pipeline_by_platform: calendar.pipeline_by_platform,
      pipeline_total: calendar.pipeline_total,
      approved_unpublished: metrics.approved_unpublished,
      overdue_unpublished: metrics.overdue_unpublished,
      approved_future_by_platform: calendar.future_by_platform,
      approved_future: calendar.future,
      approved_past_due: calendar.past_due,
      approved_missing_date: calendar.missing_date,
      approved_calendar_slots: calendar.slots,
      ideas: metrics.ideas_not_in_production, metrics,
    });
  }
  validateStudioProfilesOverviewRows(expectedRows, profiles);

  for (const kind of ["output", "idea"]) {
    const items = staged.filter((p) => p.kind === kind).map(({ record, profile_id }) => ({ record, profile_id }));
    for (let i = 0; i < items.length; i += 20) {
      await summaryRequest(env, "/stage", { generation, kind, items: items.slice(i, i + 20) });
    }
  }
  return summaryRequest(env, "/commit", {
    generation, expected_count: staged.length, expected_rows: expectedRows,
  });
}

export function validVerifiedStudioSummary(summary, profileIds, maxAgeMs = 60 * 60 * 1000) {
  if (!summary?.ok || summary.degraded || !Number.isInteger(Number(summary.version))) return false;
  if (!Array.isArray(summary.records) || summary.records.length !== 4) return false;
  if (Date.now() - Number(summary.last_reconciled_at || 0) > maxAgeMs) return false;
  const required = new Set((profileIds || []).map((id) => String(id)));
  const ids = new Set(summary.records.map((record) => String(record.id || "")));
  if (ids.size !== 4 || required.size > ids.size || [...required].some((id) => !ids.has(id))) return false;
  return validProfileSummaryV6Rows(summary.records);
}
