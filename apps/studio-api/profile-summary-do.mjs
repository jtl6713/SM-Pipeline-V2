import { OUTPUT_LIST_FIELDS } from "./worker.js";
import { readProfileSummaryDirtyBatch } from "./supabase-pipeline-reads.mjs";
import { mapOutput, mapIdea } from "./worker-functions-01.mjs";
import { studioOverviewRowMatchesProfile } from "./worker-functions-04.mjs";
import { buildProfileSummaryV6Row, profileSummaryV6StaticParity } from "./profile-summary-v6.mjs";
import {
  emptyHomeContribution, homeOutputContribution, homeIdeaContribution,
  homeContributionDelta, combineHomeContributions, contributionEqual, homeOverdueDueAt,
  HOME_PLATFORMS, HOME_METRIC_KEYS, homeApprovedUpcomingAt,
} from "./profile-summary-classification.mjs";

const ZERO = () => emptyHomeContribution();
const json = (x, status = 200) => Response.json(x, { status });
const code = (value) => String(value || "").trim();
const records = (sql, ...args) => sql.exec(...args).toArray();
const validId = (id) => /^rec[A-Za-z0-9]{14}$/.test(code(id));
const validKind = (kind) => ["output", "idea"].includes(kind);
const EMPTY_AGE_MS = 3 * 60 * 60 * 1000;
const LAG_BUCKET_MS = [1000, 2500, 5000, 10000, 15000, 30000, 60000];

function counterPlus(before, delta) {
  const next = structuredClone(before || ZERO());
  for (const platform of HOME_PLATFORMS) {
    next.scheduled[platform] += delta.scheduled[platform] || 0;
    next.awaiting_final_by_platform[platform] += delta.awaiting_final_by_platform?.[platform] || 0;
  }
  for (const key of HOME_METRIC_KEYS) next[key] = (Number(next[key]) || 0) + (Number(delta[key]) || 0);
  if (HOME_PLATFORMS.some((p) => next.scheduled[p] < 0 || next.awaiting_final_by_platform[p] < 0)
    || HOME_METRIC_KEYS.some((key) => next[key] < 0)) {
    throw new Error("Counter underflow: requires authoritative reconciliation");
  }
  return next;
}
function eligibleRecord(kind, record) {
  const f = record?.fields || {};
  if (kind === "output") {
    return String(f.Output_Status || "").toLowerCase() !== "published"
      && String(f.Publish_Status || "").toLowerCase() !== "published";
  }
  return !f.Promoted_Content_Record_ID && !(Array.isArray(f["Content Items"]) && f["Content Items"].length);
}
function dueAtForRecord(kind, record) {
  return kind === "output" && record && eligibleRecord(kind, record)
    ? homeOverdueDueAt(mapOutput(record, null)) : 0;
}
function approvedFutureAtForRecord(kind, record) {
  return kind === "output" && record && eligibleRecord(kind, record)
    ? homeApprovedUpcomingAt(mapOutput(record, null)) : 0;
}
function contributionForRecord(kind, record) {
  if (!record || !eligibleRecord(kind, record)) return ZERO();
  return kind === "output"
    ? homeOutputContribution(mapOutput(record, null))
    : homeIdeaContribution(mapIdea(record));
}

export class StudioProfileSummary {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sql = state.storage.sql;
    this.state.blockConcurrencyWhile(async () => {
      this.sql.exec("CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS airtable_egress_hourly (hour_utc TEXT NOT NULL, source TEXT NOT NULL, method TEXT NOT NULL, status_class TEXT NOT NULL, attempts INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(hour_utc,source,method,status_class))");
      this.sql.exec("CREATE TABLE IF NOT EXISTS profiles (id TEXT PRIMARY KEY, name TEXT NOT NULL, city_label TEXT NOT NULL, counters TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 0, event_at INTEGER NOT NULL DEFAULT 0)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS ledger (kind TEXT NOT NULL, record_id TEXT NOT NULL, profile_id TEXT NOT NULL, contribution TEXT NOT NULL, overdue_due_at INTEGER NOT NULL DEFAULT 0, approved_future_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,record_id))");
      const ledgerColumns = records(this.sql, "PRAGMA table_info(ledger)").map((col) => col.name);
      if (!ledgerColumns.includes("approved_future_at")) {
        this.sql.exec("ALTER TABLE ledger ADD COLUMN approved_future_at INTEGER NOT NULL DEFAULT 0");
        this.putMeta("future_count_reconcile_required", "true");
      }
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_summary_ledger_future ON ledger(profile_id,approved_future_at)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_summary_ledger_profile ON ledger(profile_id)");
      this.sql.exec("CREATE INDEX IF NOT EXISTS idx_summary_ledger_due ON ledger(profile_id,overdue_due_at)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS pending (kind TEXT NOT NULL, record_id TEXT NOT NULL, touched_at INTEGER NOT NULL, PRIMARY KEY(kind,record_id))");
      this.sql.exec("CREATE TABLE IF NOT EXISTS stage (kind TEXT NOT NULL, record_id TEXT NOT NULL, profile_id TEXT NOT NULL, contribution TEXT NOT NULL, overdue_due_at INTEGER NOT NULL DEFAULT 0, approved_future_at INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(kind,record_id))");
      const stageColumns = records(this.sql, "PRAGMA table_info(stage)").map((col) => col.name);
      if (!stageColumns.includes("approved_future_at")) {
        this.sql.exec("ALTER TABLE stage ADD COLUMN approved_future_at INTEGER NOT NULL DEFAULT 0");
      }
      // Changing manual-handoff membership changes indexed SQLite calendar dates.
      // Force an authoritative rebuild before this DO is accepted as a Home read.
      // A stored snapshot from the previous contract is not enough.
      // A v1 tally counted only future scheduled outputs. Do not serve stale
      // counters as v2: force authoritative reconciliation before summary reads.
      if (this.getMeta("home_summary_contract") !== "v6_calendar_tiktok_email_handoff_v2") {
        this.putMeta("home_summary_contract", "v6_calendar_tiktok_email_handoff_v2");
        this.putMeta("future_count_reconcile_required", "true");
      }
      if (this.getMeta("approved_unpublished_definition") !== "all_final_approved_unpublished_v2") {
        this.putMeta("approved_unpublished_definition", "all_final_approved_unpublished_v2");
        this.putMeta("future_count_reconcile_required", "true");
      }
    });
  }
  incrementMetric(key, amount = 1) {
    this.putMeta(key, Number(this.getMeta(key) || 0) + amount);
  }
  getEvidence() {
    const n = (key) => Number(this.getMeta(key) || 0);
    const bins = LAG_BUCKET_MS.map((limit) => ({ le_ms: limit, count: n("dirty_lag_le_" + limit) }));
    return {
      definition: "dirty_notification_to_authoritative_reread_application; not Airtable_commit_to_UI",
      dirty_enqueued: n("dirty_enqueued"), dirty_applied: n("dirty_applied"),
      dirty_lag_sum_ms: n("dirty_lag_sum_ms"), dirty_lag_max_ms: n("dirty_lag_max_ms"),
      dirty_lag_le_buckets: bins, dirty_lag_over_60000: n("dirty_lag_over_60000"),
      airtable_dirty_batch_attempts: n("airtable_dirty_batch_attempts"),
      airtable_dirty_batch_successes: n("airtable_dirty_batch_successes"),
      airtable_dirty_batch_errors: n("airtable_dirty_batch_errors"),
      note: "Counts only shadow dirty-replay Airtable requests, not legacy Home/refill or full reconciliation requests.",
    };
  }
  getMeta(key) {
    return records(this.sql, "SELECT value FROM meta WHERE key=?", key)[0]?.value || "";
  }
  putMeta(key, value) {
    this.sql.exec("INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", key, String(value));
  }
  getProfiles() {
    return records(this.sql, "SELECT * FROM profiles ORDER BY city_label");
  }
  inferProfile(record) {
    const matches = this.getProfiles().filter((profile) => studioOverviewRowMatchesProfile(record, {
      id: profile.id,
      fields: { Profile_Name: profile.name },
    }));
    if (matches.length !== 1) return "";
    return matches[0].id;
  }
  modify(kind, recordId, profileId, contribution, at, dueAt = 0, futureAt = 0) {
    const previous = records(this.sql, "SELECT * FROM ledger WHERE kind=? AND record_id=?", kind, recordId)[0];
    const old = previous ? JSON.parse(previous.contribution) : ZERO();
    const next = contribution || ZERO();
    if (previous?.profile_id === profileId && contributionEqual(old, next)
      && Number(previous.overdue_due_at || 0) === Number(dueAt || 0)
      && Number(previous.approved_future_at || 0) === Number(futureAt || 0)) return false;
    if (previous) this.incrementProfile(previous.profile_id, homeContributionDelta(old, ZERO()), at);
    if (profileId) this.incrementProfile(profileId, homeContributionDelta(ZERO(), next), at);
    this.sql.exec("DELETE FROM ledger WHERE kind=? AND record_id=?", kind, recordId);
    if (profileId) {
      this.sql.exec("INSERT INTO ledger (kind,record_id,profile_id,contribution,overdue_due_at,approved_future_at) VALUES (?,?,?,?,?,?)",
        kind, recordId, profileId, JSON.stringify(next), dueAt, futureAt);
    }
    this.putMeta("last_authoritative_at", at);
    const global = Number(this.getMeta("version") || 0);
    this.putMeta("version", global + 1);
    return true;
  }
  incrementProfile(profileId, delta, at) {
    const profile = records(this.sql, "SELECT * FROM profiles WHERE id=?", profileId)[0];
    if (!profile) throw new Error("Unknown summary profile " + profileId);
    const next = counterPlus(JSON.parse(profile.counters), delta);
    this.sql.exec("UPDATE profiles SET counters=?, version=version+1, event_at=? WHERE id=?",
      JSON.stringify(next), at, profileId);
  }
  recordAirtableEgress(source, method, status, at = Date.now()) {
    const hour = new Date(at).toISOString().slice(0,13) + ":00:00Z";
    // Preserve exact Airtable 429 counts; older 4xx buckets remain ambiguous.
    const statusClass = status === 429 ? "429" : status === 0 ? "network" : String(Math.floor(status / 100)) + "xx";
    this.sql.exec("INSERT INTO airtable_egress_hourly (hour_utc,source,method,status_class,attempts) VALUES (?,?,?,?,1) ON CONFLICT(hour_utc,source,method,status_class) DO UPDATE SET attempts=attempts+1",
      hour, source, method, statusClass);
  }
  async fetch(request) {
    try {
      const url = new URL(request.url);
      if (request.method === "POST" && url.pathname === "/egress") {
        const input = await request.json();
        const source = code(input.source), method = code(input.method).toUpperCase();
        const status = Number(input.status), occurred = Number(input.at_ms);
        const allowedSources = ["studio_worker_gateway", "shadow_reconcile", "home_overview_refresh", "home_ideas_refresh", "autonomous_refill_scan", "pipeline_runner_http", "other_direct"];
        if (!allowedSources.includes(source) || !["GET","POST","PUT","PATCH","DELETE"].includes(method)
          || !Number.isInteger(status) || status < 0 || status > 599
          || !Number.isFinite(occurred) || Math.abs(Date.now()-occurred) > 300000) {
          return json({ok:false,error:"invalid_egress_event"},400);
        }
        this.recordAirtableEgress(source,method,status,occurred);
        return json({ok:true});
      }
      if (request.method === "GET" && url.pathname === "/egress") {
        const hours = Math.min(72,Math.max(1, Number(url.searchParams.get("hours")) || 48));
        const since = new Date(Date.now()-hours*3600000).toISOString().slice(0,13)+":00:00Z";
        return json({ok:true, source:"profile_summary_durable_object", hourly:records(this.sql,
          "SELECT hour_utc,source,method,status_class,attempts FROM airtable_egress_hourly WHERE hour_utc>=? ORDER BY hour_utc,source,method,status_class",since)});
      }
      if (request.method === "GET" && url.pathname === "/status") {
        return json({
          ok: true,
          complete: this.getMeta("complete") === "true",
          building_generation: this.getMeta("building_generation") || "",
          building_started_at: Number(this.getMeta("building_started_at") || 0),
          error: this.getMeta("error") || "",
          version: Number(this.getMeta("version") || 0),
          evidence: this.getEvidence(),
        });
      }
      if (request.method === "GET" && url.pathname === "/snapshot") {
        if (this.getMeta("complete") !== "true") return json({ ok: false, reason: "not_bootstrapped" }, 503);
        const profiles = this.getProfiles();
        // Indexed clock-sensitive overdue count: a deadline crossing must
        // become visible without a new Airtable write or entire-table scan.
        const overdueByProfile = new Map(records(this.sql,
          "SELECT profile_id,COUNT(*) AS amount FROM ledger WHERE overdue_due_at>0 AND overdue_due_at<=? GROUP BY profile_id",
          Date.now()).map((row) => [row.profile_id, Number(row.amount || 0)]));
        // Stable final-approved/unpublished membership is owned by the
        // authoritative per-record ledger contribution. Time must not cause
        // the parentheses to shrink without a publication or review change.
        const lastReconciled = Number(this.getMeta("last_reconciled_at") || 0);
        const pending = records(this.sql, "SELECT COUNT(*) AS n FROM pending")[0]?.n || 0;
        const approvedByProfile = new Map(profiles.map((p) => [p.id, []]));
        // One indexed SQLite pass reads the durable approved calendar, not Airtable.
        for (const entry of records(this.sql,
          "SELECT profile_id,approved_future_at,contribution FROM ledger WHERE approved_future_at>0 ORDER BY profile_id,approved_future_at")) {
          const list = approvedByProfile.get(entry.profile_id);
          if (!list) throw new Error("Calendar record references unknown profile");
          list.push(entry);
        }
        const now = Date.now();
        const resultRows = profiles.map((p) => {
          const counters = JSON.parse(p.counters);
          const overdue = overdueByProfile.get(p.id) || 0;
          const row = buildProfileSummaryV6Row(p, counters, approvedByProfile.get(p.id), now);
          row.overdue_unpublished = overdue;
          row.metrics = { ...counters, overdue_unpublished: overdue };
          return row;
        });
        return json({
          ok: true, source: "durable-profile-summary", version: Number(this.getMeta("version") || 0),
          last_authoritative_event_at: Number(this.getMeta("last_authoritative_at") || 0),
          last_reconciled_at: lastReconciled,
          degraded: Boolean(this.getMeta("future_count_reconcile_required")) || Boolean(this.getMeta("error"))
            || Date.now() - lastReconciled > EMPTY_AGE_MS || pending > 0,
          pending_changes: pending,
          records: resultRows,
        });
      }
      if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
      const body = await request.json();
      if (url.pathname === "/fail") {
        this.putMeta("error", String(body?.error || "reconciliation failed").slice(0, 300));
        return json({ ok: true, recorded: true });
      }
      if (url.pathname === "/dirty") {
        const kind = code(body.kind), ids = Array.isArray(body.ids) ? body.ids : [];
        if (!validKind(kind) || !ids.length || ids.length > 100 || ids.some((id) => !validId(id))) {
          return json({ ok: false, error: "invalid_dirty" }, 400);
        }
        const at = Date.now();
        this.state.storage.transactionSync(() => {
          for (const id of new Set(ids)) {
            this.sql.exec("INSERT INTO pending (kind,record_id,touched_at) VALUES (?,?,?) ON CONFLICT(kind,record_id) DO UPDATE SET touched_at=excluded.touched_at", kind, id, at);
            this.incrementMetric("dirty_enqueued");
          }
        });
        const alarm = await this.state.storage.getAlarm();
        if (alarm == null || alarm > at + 1500) await this.state.storage.setAlarm(at + 1500);
        return json({ ok: true, queued: ids.length });
      }
      if (url.pathname === "/begin") {
        const generation = code(body.generation), profiles = body.profiles;
        if (!generation || generation.length > 128 || !Array.isArray(profiles)
          || profiles.length !== 4 || new Set(profiles.map((p) => p.id)).size !== 4
          || profiles.some((p) => !validId(p.id) || !code(p.name) || !code(p.city_label))) {
          return json({ ok: false, error: "invalid_bootstrap" }, 400);
        }
        const active = this.getMeta("building_generation");
        const buildingAge = Date.now() - Number(this.getMeta("building_started_at") || 0);
        if (active && buildingAge < 25 * 60_000) {
          return json({ ok: false, error: "reconciliation_already_active" }, 409);
        }
        this.state.storage.transactionSync(() => {
          this.sql.exec("DELETE FROM stage");
          this.putMeta("building_generation", generation);
          this.putMeta("building_profiles", JSON.stringify(profiles));
          this.putMeta("building_started_at", Date.now());
        });
        await this.state.storage.setAlarm(Date.now() + 10_000);
        return json({ ok: true, generation });
      }
      if (url.pathname === "/stage") {
        const generation = code(body.generation), kind = code(body.kind), items = body.items;
        if (generation !== this.getMeta("building_generation") || !validKind(kind)
          || !Array.isArray(items) || items.length > 100) return json({ ok: false, error: "invalid_stage" }, 409);
        const profiles = JSON.parse(this.getMeta("building_profiles") || "[]");
        const allowed = new Set(profiles.map((p) => p.id));
        if (items.some((x) => !validId(x.record?.id) || !allowed.has(x.profile_id))) {
          return json({ ok: false, error: "invalid_stage_profile" }, 400);
        }
        this.state.storage.transactionSync(() => {
          for (const item of items) {
            const contribution = contributionForRecord(kind, item.record);
            this.sql.exec("INSERT INTO stage (kind,record_id,profile_id,contribution,overdue_due_at,approved_future_at) VALUES (?,?,?,?,?,?) ON CONFLICT(kind,record_id) DO UPDATE SET profile_id=excluded.profile_id,contribution=excluded.contribution,overdue_due_at=excluded.overdue_due_at,approved_future_at=excluded.approved_future_at",
              kind, item.record.id, item.profile_id, JSON.stringify(contribution),
              dueAtForRecord(kind, item.record), approvedFutureAtForRecord(kind, item.record));
          }
        });
        return json({ ok: true, count: items.length });
      }
      if (url.pathname === "/commit") {
        const generation = code(body.generation);
        if (generation !== this.getMeta("building_generation")) return json({ ok: false, error: "wrong_generation" }, 409);
        const profiles = JSON.parse(this.getMeta("building_profiles") || "[]");
        const staged = records(this.sql, "SELECT * FROM stage");
        if (staged.length !== Number(body.expected_count) || !staged.length) {
          return json({ ok: false, error: "incomplete_stage", received: staged.length }, 409);
        }
        const counts = new Map(profiles.map((p) => [p.id, ZERO()]));
        for (const row of staged) {
          counts.set(row.profile_id, combineHomeContributions([counts.get(row.profile_id), JSON.parse(row.contribution)]));
        }
        const compare = body.expected_rows || [];
        for (const p of profiles) {
          const expected = compare.find((v) => v.id === p.id);
          const counters = counts.get(p.id);
          const approvedEntries = staged.filter((entry) =>
            entry.profile_id === p.id && Number(entry.approved_future_at) > 0);
          const actual = buildProfileSummaryV6Row(p, counters, approvedEntries);
          if (!expected || !profileSummaryV6StaticParity(expected, actual)) {
            return json({ ok: false, error: "reconciliation_mismatch", profile_id: p.id }, 409);
          }
        }
        this.state.storage.transactionSync(() => {
          this.sql.exec("DELETE FROM ledger");
          this.sql.exec("DELETE FROM profiles");
          for (const p of profiles) {
            this.sql.exec("INSERT INTO profiles (id,name,city_label,counters,version,event_at) VALUES (?,?,?,?,?,?)",
              p.id, p.name, p.city_label, JSON.stringify(counts.get(p.id)), Number(this.getMeta("version") || 0) + 1, Date.now());
          }
          this.sql.exec("INSERT INTO ledger (kind,record_id,profile_id,contribution,overdue_due_at,approved_future_at) SELECT kind,record_id,profile_id,contribution,overdue_due_at,approved_future_at FROM stage");
          this.sql.exec("DELETE FROM stage");
          this.putMeta("version", Number(this.getMeta("version") || 0) + 1);
          this.putMeta("last_reconciled_at", Date.now());
          this.putMeta("future_count_reconcile_required", "");
          this.putMeta("complete", "true");
          this.putMeta("building_generation", "");
          this.putMeta("error", "");
        });
        if (records(this.sql, "SELECT COUNT(*) AS n FROM pending")[0]?.n) await this.state.storage.setAlarm(Date.now() + 1000);
        return json({ ok: true, generation, count: staged.length, version: Number(this.getMeta("version") || 0) });
      }
      return json({ ok: false, error: "not_found" }, 404);
    } catch (error) {
      this.putMeta("error", String(error?.message || error).slice(0, 300));
      return json({ ok: false, error: "profile_summary_error" }, 503);
    }
  }
  async alarm() {
    // Rebuilds stage outside the live ledger. Freeze dirty-event application
    // while a generation is being scanned so /commit cannot drop an already-
    // processed notification. Pending entries are replayed after commit.
    const generation = this.getMeta("building_generation");
    if (generation) {
      const age = Date.now() - Number(this.getMeta("building_started_at") || 0);
      if (age < 25 * 60 * 1000) {
        await this.state.storage.setAlarm(Date.now() + 10_000);
        return;
      }
      // Fail closed after an abandoned/over-budget generation. Its staged data
      // will never become visible, but the previous completed ledger survives.
      this.state.storage.transactionSync(() => {
        this.sql.exec("DELETE FROM stage");
        this.putMeta("building_generation", "");
        this.putMeta("building_profiles", "");
        this.putMeta("error", "Reconciliation expired before complete commit");
      });
    }
    if (this.getMeta("complete") !== "true") return;
    // Read a bounded set of dirty records with one filtered Airtable list call
    // per kind. Batched authoritative rereads avoid one request per approval,
    // allow 10–15s freshness during ordinary approval waves, and lower 429s.
    const pending = records(this.sql, "SELECT kind,record_id,touched_at FROM pending ORDER BY touched_at LIMIT 20");
    const grouped = new Map();
    for (const item of pending) {
      if (!grouped.has(item.kind)) grouped.set(item.kind, []);
      grouped.get(item.kind).push(item);
    }
    for (const [kind, items] of grouped) {
      try {
        const stored = await readProfileSummaryDirtyBatch(this.env, kind, items.map((item) => item.record_id)).catch(() => null);
        if (Array.isArray(stored)) {
          const readById = new Map(stored.map((row) => [row.id, row]));
          this.state.storage.transactionSync(() => {
            if (this.getMeta("building_generation")) return;
            for (const item of items) {
              const latest = records(this.sql,
                "SELECT touched_at FROM pending WHERE kind=? AND record_id=?",
                item.kind, item.record_id)[0];
              if (!latest || Number(latest.touched_at) !== Number(item.touched_at)) continue;
              const record = readById.get(item.record_id) || null;
              const profile = record && eligibleRecord(kind, record) ? this.inferProfile(record) : "";
              if (record && eligibleRecord(kind, record) && !profile) throw new Error("Cannot resolve profile for " + item.record_id);
              this.modify(kind, item.record_id, profile,
                profile ? contributionForRecord(kind, record) : ZERO(),
                Date.now(), profile ? dueAtForRecord(kind, record) : 0,
                profile ? approvedFutureAtForRecord(kind, record) : 0);
              const lag = Math.max(0, Date.now() - Number(item.touched_at));
              this.incrementMetric("dirty_applied");
              this.incrementMetric("dirty_lag_sum_ms", lag);
              this.putMeta("dirty_lag_max_ms", Math.max(Number(this.getMeta("dirty_lag_max_ms") || 0), lag));
              const bucket = LAG_BUCKET_MS.find((limit) => lag <= limit);
              this.incrementMetric(bucket ? "dirty_lag_le_" + bucket : "dirty_lag_over_60000");
              this.sql.exec("DELETE FROM pending WHERE kind=? AND record_id=?", kind, item.record_id);
            }
          });
          this.putMeta("error", "");
          continue;
        }
        const base = code(this.env.AIRTABLE_BASE_ID);
        const table = kind === "output" ? this.env.AIRTABLE_OUTPUT_TABLE_ID : this.env.AIRTABLE_IDEA_TABLE_ID;
        if (!base || !table || !this.env.AIRTABLE_PAT) throw new Error("Airtable binding unavailable");
        const url = new URL("https://api.airtable.com/v0/" + encodeURIComponent(base) + "/" + encodeURIComponent(table));
        url.searchParams.set("pageSize", "100");
        url.searchParams.set("filterByFormula", "OR(" + items.map((item) => 'RECORD_ID()="' + item.record_id + '"').join(",") + ")");
        const fields = kind === "output"
          ? OUTPUT_LIST_FIELDS
          : ["Content_Profile", "Promoted_Content_Record_ID", "Content Items"];
        for (const field of fields) url.searchParams.append("fields[]", field);
        this.incrementMetric("airtable_dirty_batch_attempts");
        let res;
        try {
          res = await fetch(url.toString(), { headers: { Authorization: "Bearer " + this.env.AIRTABLE_PAT } });
        } finally {
          this.recordAirtableEgress("shadow_dirty_replay", "GET", res?.status || 0);
        }
        if (!res.ok) throw new Error("Airtable batch reread returned " + res.status);
        const pack = await res.json();
        if (!Array.isArray(pack.records) || pack.offset) throw new Error("Incomplete Airtable batch reread");
        this.incrementMetric("airtable_dirty_batch_successes");
        const readById = new Map(pack.records.map((row) => [row.id, row]));
        this.state.storage.transactionSync(() => {
          // A rebuild may have started during the Airtable fetch. The dirty
          // queue remains intact and is replayed after the rebuild commits.
          if (this.getMeta("building_generation")) return;
          for (const item of items) {
            const latest = records(this.sql,
              "SELECT touched_at FROM pending WHERE kind=? AND record_id=?",
              item.kind, item.record_id)[0];
            if (!latest || Number(latest.touched_at) !== Number(item.touched_at)) continue;
            const record = readById.get(item.record_id) || null;
            const profile = record && eligibleRecord(kind, record) ? this.inferProfile(record) : "";
            if (record && eligibleRecord(kind, record) && !profile) throw new Error("Cannot resolve profile for " + item.record_id);
            this.modify(kind, item.record_id, profile,
              profile ? contributionForRecord(kind, record) : ZERO(),
              Date.now(), profile ? dueAtForRecord(kind, record) : 0,
              profile ? approvedFutureAtForRecord(kind, record) : 0);
            const lag = Math.max(0, Date.now() - Number(item.touched_at));
            this.incrementMetric("dirty_applied");
            this.incrementMetric("dirty_lag_sum_ms", lag);
            this.putMeta("dirty_lag_max_ms", Math.max(Number(this.getMeta("dirty_lag_max_ms") || 0), lag));
            const bucket = LAG_BUCKET_MS.find((limit) => lag <= limit);
            this.incrementMetric(bucket ? "dirty_lag_le_" + bucket : "dirty_lag_over_60000");
            this.sql.exec("DELETE FROM pending WHERE kind=? AND record_id=?", kind, item.record_id);
          }
        });
        this.putMeta("error", "");
      } catch (error) {
        this.incrementMetric("airtable_dirty_batch_errors");
        this.putMeta("error", String(error?.message || error).slice(0, 300));
        break;
      }
    }
    if (records(this.sql, "SELECT COUNT(*) AS n FROM pending")[0]?.n) {
      await this.state.storage.setAlarm(Date.now() + 2500);
    }
  }
}
