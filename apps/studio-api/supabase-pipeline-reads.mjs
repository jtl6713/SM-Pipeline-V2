/**
 * Phase 3–4: Studio list reads from Supabase.
 * Airtable remains write SoR. Default source is airtable until
 * STUDIO_READ_SOURCE=supabase and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *
 * Phase 3 routes:
 * - GET /api/outputs (full Pipeline list + mode=review)
 * - GET /api/outputs?mode=latest
 * - GET /api/outputs/schedule-grid
 *
 * Phase 4 routes:
 * - GET /api/content
 * - GET /api/profiles/overview
 * - GET /api/factory/desk (via operations-queue + idea candidates)
 * - GET /api/operations/queue (same output/request pack as Factory)
 *
 * Phase 5 write-through (Airtable remains write SoR):
 * - After a successful Airtable PATCH/POST on Platform Outputs or Content Items,
 *   upsert the returned row into Supabase.
 * - studio_side_effect_outbox inserts are best-effort and no-op when the table
 *   is not created yet. Make and pipeline-runner still read Airtable.
 *
 * Sync: heavy cron Airtable→Supabase upsert (studioSyncSupabasePipelineReads)
 * and POST/GET /api/ops/supabase/sync.
 *
 * Extra Airtable list fields ride in jsonb bags (no schema migrate required):
 * - platform_outputs.error_messages → lean OUTPUT_LIST_FIELDS projection
 * - content_items.extras → Content list fields
 * - idea_candidates.payload → overview / Factory idea fields
 * - production_requests.publish_status → request link bag for Factory
 */

export const STUDIO_SUPABASE_PIPELINE_READ_ROUTES = Object.freeze([
  "GET /api/outputs",
  "GET /api/outputs?mode=latest",
  "GET /api/outputs?mode=review",
  "GET /api/outputs/schedule-grid",
]);

export const STUDIO_SUPABASE_PHASE4_READ_ROUTES = Object.freeze([
  "GET /api/content",
  "GET /api/profiles/overview",
  "GET /api/factory/desk",
  "GET /api/operations/queue",
]);

/** Library music list — GET /api/music only. Independent of Pipeline/Content/Home. */
export const STUDIO_SUPABASE_MUSIC_READ_ROUTES = Object.freeze([
  "/api/music",
]);

/** Asset Manager library list — GET /api/library only (not published). */
export const STUDIO_SUPABASE_ASSETS_READ_ROUTES = Object.freeze([
  "/api/library",
]);

export const STUDIO_SUPABASE_READ_ROUTES = Object.freeze([
  ...STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
  ...STUDIO_SUPABASE_PHASE4_READ_ROUTES,
  ...STUDIO_SUPABASE_MUSIC_READ_ROUTES,
  ...STUDIO_SUPABASE_ASSETS_READ_ROUTES,
]);

/** Large / unused-on-list Airtable columns — never pack into jsonb projection. */
export const SUPABASE_OUTPUT_LIST_EXCLUDE = Object.freeze([
  "Selected_Assets_JSON",
  "Creative_Render_Manifest_JSON",
  "Render_Clip_List_JSON",
  "Remotion_Props_JSON",
  "Platform_Publish_Response_JSON",
  "Insights_Platform_Metrics_JSON",
]);

const OUTPUT_JSON_COLUMNS = Object.freeze({
  Selected_Assets_JSON: "selected_assets",
  Creative_Render_Manifest_JSON: "creative_render_manifest",
  Render_Clip_List_JSON: "render_clip_list",
  Remotion_Props_JSON: "remotion_props",
  Platform_Publish_Response_JSON: "platform_publish_response",
  Insights_Platform_Metrics_JSON: "insights_metrics",
});

export const RUNNER_RECORD_PROJECTION = "v1";

export const CONTENT_LIST_SYNC_FIELDS = Object.freeze([
  "Content_ID",
  "Content_Title",
  "Content_Status",
  "Content_Profile",
  "Content_Type",
  "Primary_Location",
  "Neighborhood_or_Area",
  "Voiceover_Status",
  "Thumbnail_URL",
  "Created_At",
  "Asset_Match_Status",
  "Script_Status",
  "Thumbnail_Status",
  "Render_Status",
  "Review_Status",
  "Carousel_Review_Status",
  "Content_Duration",
  "Content_Themes",
  "Include_Voiceover",
  "Include_Background_Music",
  "Include_Thumbnail",
  "Video_Clip_Count",
  "Music_URL",
  "Voiceover_URL",
  "Platform Outputs",
  "Production Requests",
  "Production_Request",
  "Brand_Name",
  "Market_Name",
]);

export const IDEA_LIST_SYNC_FIELDS = Object.freeze([
  "Candidate_ID",
  "Candidate_Title",
  "Idea_Summary",
  "Candidate_Status",
  "Content_Profile",
  "Content Items",
  "Promoted_Content_Record_ID",
  "Create_Date",
  "Studio_Photo_Wait_Status",
  "Production_Notes",
  "Production_Config_Notes",
]);

export const PRODUCTION_REQUEST_SYNC_FIELDS = Object.freeze([
  "Production_Request_ID",
  "Request_Status",
  "Production_Notes",
  "Studio_Production_Job_JSON",
  "Studio_Variant_Status",
  "Studio_Output_Plan_Status",
  "Master_Content_Type",
  "Target_Platforms",
  "Requested_Title",
  "Idea_Candidate",
  "Promoted_Content_Item",
  "Created_At",
  "Updated_At",
  "Test_Run_ID",
]);

/** Phase 6 half-hour media backfill — scalar metadata only; Drive stays DAM. */
export const MEDIA_ASSET_SYNC_FIELDS = Object.freeze([
  "Asset Name",
  "Media_Class",
  "Asset_Role",
  "Asset_Status",
  "Active",
  "Do_Not_Use",
  "Studio_Favorite",
  "Google Drive File ID",
  "Google Drive URL",
  "MIME_Type",
  "File_Extension",
  "File_Size_Bytes",
  "Added_At",
  // Library extras densified into media_assets.metadata (no DDL).
  "Rights_Status",
  "Asset_Description",
  "Studio_Transfer_ID",
  // Asset Manager list densify (profile / classification / search).
  "Content_Profile",
  "Classification_Status",
  "Manual_Classification_JSON",
  "Manual_Classification_Audit",
  "Search_Keywords",
  "AI_Tags",
  "Location",
  "Topic",
  "Subtopic",
  "Shot_Type",
  "Time_Of_Day",
  "Weather",
  "Visible_Subjects",
  "Duration_Seconds",
  "Intake_Date",
]);

/** Phase 6 half-hour queue backfill — status + Drive id payload; no file bytes. */
export const TRANSFER_QUEUE_SYNC_FIELDS = Object.freeze([
  "Transfer_ID",
  "Transfer_Status",
  "Error_Message",
  "Preview_Error",
  "Production_Request_Record_ID",
  "Asset_Kind",
  "Source_Asset_ID",
  "Source_Name",
  "Source_Drive_File_ID",
  "Source_Media_Asset",
  "Generated_Media_Asset",
  "Aspect_Ratio",
  "Preview_Status",
  "Test_Run_ID",
  "Target_Production_Request_Outputs",
]);

export const PHASE6_TRANSFER_QUEUE_TABLE_ID = "tblBZLXPd1p2NRWRK";

export function studioSupabaseConfigured(env) {
  return Boolean(String(env?.SUPABASE_URL || "").trim() && String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}

export function studioReadSource(env) {
  // Global/default reads stay on Airtable. Home, Content, and Factory/Ops
  // each use their own flag and must not follow STUDIO_READ_SOURCE.
  void env;
  return "airtable";
}

/**
 * Workstream B1 — Phase 3 Pipeline + schedule-grid only.
 * Does not enable Content, Factory, Ops, or Home.
 * Opt-in: STUDIO_PIPELINE_READ_SOURCE=supabase, or legacy STUDIO_READ_SOURCE=supabase
 * when the narrower flag is unset. Roll back with STUDIO_PIPELINE_READ_SOURCE=airtable.
 */
export function studioPipelineReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  const pipeline = String(env?.STUDIO_PIPELINE_READ_SOURCE || "").trim().toLowerCase();
  if (pipeline === "airtable") return "airtable";
  if (pipeline === "supabase") return "supabase";
  return String(env?.STUDIO_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Workstream B2 — GET /api/content only.
 * Does not follow STUDIO_READ_SOURCE or the Pipeline flag, so a deploy does
 * not turn Content on by itself. Factory, Ops, and Home stay on their own gates.
 * Opt-in: STUDIO_CONTENT_READ_SOURCE=supabase. Roll back with airtable or unset.
 */
export function studioContentReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_CONTENT_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Workstream B3 — GET /api/factory/desk and GET /api/operations/queue only.
 * Does not follow STUDIO_READ_SOURCE, the Pipeline flag, or the Content flag.
 * Home uses studioHomeReadSource and does not follow this flag.
 * Opt-in: STUDIO_FACTORY_OPS_READ_SOURCE=supabase. Roll back with airtable or unset.
 */
export function studioFactoryOpsReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_FACTORY_OPS_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Home — GET /api/profiles/overview only.
 * Does not follow STUDIO_READ_SOURCE, the Pipeline flag, the Content flag,
 * or the Factory/Ops flag. A deploy leaves Home on Airtable until this secret
 * is set. Opt-in: STUDIO_HOME_READ_SOURCE=supabase. Roll back with airtable or unset.
 */
export function studioHomeReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_HOME_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Library music — GET /api/music only.
 * Does not follow STUDIO_READ_SOURCE, Pipeline, Content, Factory/Ops, or Home.
 * A deploy leaves music on Airtable until this secret is set.
 * Opt-in: STUDIO_MUSIC_READ_SOURCE=supabase. Roll back with airtable or unset.
 */
export function studioMusicReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_MUSIC_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Asset Manager — GET /api/library only (not published files).
 * Does not follow STUDIO_READ_SOURCE, Pipeline, Content, Factory/Ops, Home, Music, or Auth.
 * A deploy leaves Asset Manager on Airtable until this secret is set.
 * Opt-in: STUDIO_ASSETS_READ_SOURCE=supabase. Roll back with airtable or unset.
 * Requires library densify in media_assets.metadata (profile/classification/search).
 */
export function studioAssetsReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_ASSETS_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Auth — resolveAuthorization only.
 * Does not follow STUDIO_READ_SOURCE, Pipeline, Content, Factory/Ops, Home, or Music.
 * A deploy leaves auth on Airtable until this secret is set.
 * Opt-in: STUDIO_AUTH_READ_SOURCE=supabase. Roll back with airtable or unset.
 * Mirror tables must be populated (half-hour auth mirror + extras densify) before enable.
 */
export function studioAuthReadSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_AUTH_READ_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

/**
 * Phase 5 remainder write switch for Platform Outputs and Content Items.
 * Default remains Airtable-first write-through. When STUDIO_WRITE_SOURCE=supabase,
 * Output/Content updates and creates commit to Supabase first. Airtable is a
 * frozen archive: a successful Supabase commit is not exported. Callers keep
 * the minted rec id. Production Requests, media, and the transfer queue are
 * not part of this flag. Record deletion is not started.
 */
export function studioWriteSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_WRITE_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

export function studioPhase5WritesMode(env) {
  return studioWriteSource(env) === "supabase"
    ? "supabase_sor_airtable_archived"
    : "airtable_sor_write_through";
}

export function studioLegacyExportEnabled(env, tableId) {
  if (studioWriteSource(env) !== "supabase") return false;
  const table = String(tableId || "");
  return Boolean(
    (env?.AIRTABLE_OUTPUT_TABLE_ID && table === env.AIRTABLE_OUTPUT_TABLE_ID)
    || (env?.AIRTABLE_CONTENT_TABLE_ID && table === env.AIRTABLE_CONTENT_TABLE_ID),
  );
}

/**
 * Phase 6 switch for Production Requests, Media Assets, and the transfer
 * queue. Default stays Airtable-first. STUDIO_WRITE_SOURCE does not turn this
 * on. Updates and creates commit to Supabase first only when
 * STUDIO_PHASE6_WRITE_SOURCE=supabase. A create uses the minted Supabase id
 * when Airtable identity fields are absent. Held-reschedule note readback uses the Supabase
 * row when STUDIO_WRITE_SOURCE=supabase. A successful Supabase commit is not
 * exported to Airtable. The half-hour Airtable copy is stopped while
 * STUDIO_WRITE_SOURCE=supabase. Record deletion is not started.
 */
export function studioPhase6WriteSource(env) {
  if (!studioSupabaseConfigured(env)) return "airtable";
  return String(env?.STUDIO_PHASE6_WRITE_SOURCE || "").trim().toLowerCase() === "supabase"
    ? "supabase"
    : "airtable";
}

export function studioPhase6WritesMode(env) {
  return studioPhase6WriteSource(env) === "supabase"
    ? "supabase_sor_airtable_archived"
    : "airtable_sor_write_through";
}

export function phase6TableKind(env, tableId) {
  const table = String(tableId || "");
  const requestTable = String(env?.AIRTABLE_PRODUCTION_REQUEST_TABLE_ID || "");
  const mediaTable = String(env?.AIRTABLE_MEDIA_TABLE_ID || "");
  if (table === "Production Requests" || (requestTable && table === requestTable)) return "request";
  if (table === "Media Assets" || (mediaTable && table === mediaTable)) return "media";
  if (table === "Studio Media Transfer Queue" || table === "tblBZLXPd1p2NRWRK") return "queue";
  return "";
}

export function studioPhase6LegacyExportEnabled(env, tableId) {
  return studioPhase6WriteSource(env) === "supabase" && Boolean(phase6TableKind(env, tableId));
}

export function parseAirtableMutationRecords(pathOrParams, rawBody) {
  let parsed = rawBody;
  if (typeof rawBody === "string") {
    try { parsed = JSON.parse(rawBody); } catch { return []; }
  }
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed.records)) {
    return parsed.records.filter((row) => row?.id && row?.fields && typeof row.fields === "object");
  }
  if (parsed.fields && typeof parsed.fields === "object") {
    const id = String(pathOrParams || "").replace(/^\//, "").split("?")[0].trim();
    if (id.startsWith("rec")) return [{ id, fields: parsed.fields }];
  }
  return [];
}

export function parseAirtableCreateFields(rawBody) {
  let parsed = rawBody;
  if (typeof rawBody === "string") {
    try { parsed = JSON.parse(rawBody); } catch { return []; }
  }
  if (!parsed || typeof parsed !== "object") return [];
  if (Array.isArray(parsed.records)) {
    return parsed.records
      .filter((row) => row?.fields && typeof row.fields === "object" && !row.id)
      .map((row) => row.fields);
  }
  if (parsed.fields && typeof parsed.fields === "object" && !parsed.id) return [parsed.fields];
  return [];
}

export function mintAirtableRecordId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(14));
  let id = "rec";
  for (const byte of bytes) id += alphabet[byte % alphabet.length];
  return id;
}

export async function releaseMintedAirtableIds(env, tableId, ids) {
  const clean = (Array.isArray(ids) ? ids : [])
    .map((id) => String(id || ""))
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
  if (!clean.length || !studioSupabaseConfigured(env)) return { skipped: true, reason: "empty" };
  const table = String(tableId || "");
  const phase6Kind = phase6TableKind(env, tableId);
  const supabaseTable = env?.AIRTABLE_OUTPUT_TABLE_ID && table === env.AIRTABLE_OUTPUT_TABLE_ID
    ? "platform_outputs"
    : env?.AIRTABLE_CONTENT_TABLE_ID && table === env.AIRTABLE_CONTENT_TABLE_ID
      ? "content_items"
      : phase6Kind === "request"
        ? "production_requests"
        : phase6Kind === "media"
          ? "media_assets"
          : phase6Kind === "queue"
            ? "studio_media_transfer_queue"
            : "";
  if (!supabaseTable) return { skipped: true, reason: "table" };
  await supabaseRest(env, `${supabaseTable}?airtable_record_id=in.(${clean.map(encodeURIComponent).join(",")})`, {
    method: "DELETE",
  });
  return { ok: true, count: clean.length };
}


/**
 * Phase 6 Media Asset creates first reserve a provisional Supabase record ID,
 * then Airtable returns the canonical ID. Re-key the *same* media_assets row
 * before upserting the authoritative response. A second INSERT cannot work:
 * media_assets_drive_file_uidx uniquely owns the Drive file already.
 *
 * Fail closed if any immutable identity (Drive file, transfer ID, profile,
 * asset name) differs. Never delete provisional media before adoption.
 */
export async function adoptMintedPhase6MediaIds(env, tableId, provisional, canonical) {
  if (phase6TableKind(env, tableId) !== "media") return { skipped: true, reason: "not_media" };
  const minted = Array.isArray(provisional) ? provisional : [];
  const saved = Array.isArray(canonical) ? canonical : [];
  if (!minted.length || minted.length !== saved.length) return { ok: false, reason: "record_count_mismatch" };
  let adopted = 0, already = 0;
  for (let index = 0; index < minted.length; index++) {
    const from = minted[index], to = saved[index];
    const source = from?.fields || {}, target = to?.fields || {};
    const drive = String(source["Google Drive File ID"] || "").trim();
    const transfer = String(source.Studio_Transfer_ID || "").trim();
    const profile = firstLink(source.Content_Profile);
    const name = String(source["Asset Name"] || "").trim();
    if (!/^rec[A-Za-z0-9]{14}$/.test(String(from?.id || ""))
      || !/^rec[A-Za-z0-9]{14}$/.test(String(to?.id || ""))
      || from.id === to.id || !drive || !transfer || !profile || !name
      || drive !== String(target["Google Drive File ID"] || "").trim()
      || transfer !== String(target.Studio_Transfer_ID || "").trim()
      || profile !== firstLink(target.Content_Profile)
      || name !== String(target["Asset Name"] || "").trim()) {
      return { ok: false, reason: "immutable_media_identity_mismatch", index };
    }

    const selector = "select=id,airtable_record_id,asset_name,google_drive_file_id,metadata&limit=1";
    const existing = await supabaseRest(env,
      "media_assets?airtable_record_id=eq." + encodeURIComponent(from.id) + "&" + selector);
    const matches = row => row?.google_drive_file_id === drive
      && row?.asset_name === name
      && row?.metadata?.studio_transfer_id === transfer
      && row?.metadata?.content_profile_airtable_id === profile;
    if (!Array.isArray(existing) || existing.length > 1) {
      return { ok: false, reason: "provisional_ambiguous", index };
    }
    if (!existing.length) {
      // Read-back after a successful prior adoption: no repeated mutation.
      const current = await supabaseRest(env,
        "media_assets?airtable_record_id=eq." + encodeURIComponent(to.id) + "&" + selector);
      if (current?.length !== 1 || !matches(current[0])) {
        return { ok: false, reason: "provisional_missing", index };
      }
      already++;
      continue;
    }
    if (!matches(existing[0])) return { ok: false, reason: "provisional_metadata_mismatch", index };
    const updated = await supabaseRest(env,
      "media_assets?id=eq." + encodeURIComponent(existing[0].id)
      + "&airtable_record_id=eq." + encodeURIComponent(from.id)
      + "&google_drive_file_id=eq." + encodeURIComponent(drive), {
        method: "PATCH",
        body: { airtable_record_id: to.id },
        headers: { Prefer: "return=representation" },
      });
    if (!Array.isArray(updated) || updated.length !== 1
      || updated[0]?.airtable_record_id !== to.id || !matches(updated[0])) {
      return { ok: false, reason: "adoption_unconfirmed", index };
    }
    adopted++;
  }
  return { ok: true, count: saved.length, adopted, already };
}

export async function studioSupabaseCommitOutputContentFirst(env, tableId, records, options = {}) {
  const rows = Array.isArray(records) ? records.filter((row) => row?.id && row?.fields) : [];
  if (!rows.length) return { skipped: true, reason: "no_records" };
  const table = String(tableId || "");
  const kind = env?.AIRTABLE_OUTPUT_TABLE_ID && table === env.AIRTABLE_OUTPUT_TABLE_ID
    ? "output"
    : env?.AIRTABLE_CONTENT_TABLE_ID && table === env.AIRTABLE_CONTENT_TABLE_ID
      ? "content"
      : "";
  if (!kind) return { skipped: true, reason: "table" };
  const results = [];
  for (const record of rows) {
    const synced = kind === "output"
      ? await syncAirtableOutputRowToSupabase(env, record, { fullRecord: false, create: options.create === true })
      : await syncAirtableContentRowToSupabase(env, record, { fullRecord: false, create: options.create === true });
    if (synced?.ok) results.push({ id: record.id, synced });
  }
  return { ok: results.length === rows.length, kind, count: results.length, results };
}

export function studioSupabaseBaseUrl(env) {
  return String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

const SUPABASE_CIRCUIT_OPEN_MS = 15 * 60 * 1000;
const SUPABASE_CIRCUIT_FAIL_THRESHOLD = 2;
const supabaseCircuitState = {
  openUntil: 0,
  failures: 0,
  lastError: "",
};

export function supabasePoolErrorMessage(error) {
  return String(error?.message || error || "");
}

export function isSupabasePoolOrTimeoutError(error) {
  return /PGRST003|57014|statement timeout|connection pool|Timed out acquiring|circuit open/i
    .test(supabasePoolErrorMessage(error));
}

export function supabaseCircuitSnapshot(now = Date.now()) {
  const openUntil = Number(supabaseCircuitState.openUntil || 0);
  return {
    open: openUntil > Number(now),
    open_until: openUntil || 0,
    failures: Number(supabaseCircuitState.failures || 0),
    last_error: String(supabaseCircuitState.lastError || ""),
  };
}

export function supabaseCircuitOpen(now = Date.now()) {
  return Boolean(supabaseCircuitSnapshot(now).open);
}

export function noteSupabaseCircuitFailure(error, now = Date.now()) {
  if (!isSupabasePoolOrTimeoutError(error)) return false;
  supabaseCircuitState.failures = Number(supabaseCircuitState.failures || 0) + 1;
  supabaseCircuitState.lastError = supabasePoolErrorMessage(error).slice(0, 240);
  if (supabaseCircuitState.failures >= SUPABASE_CIRCUIT_FAIL_THRESHOLD) {
    supabaseCircuitState.openUntil = Math.max(
      Number(supabaseCircuitState.openUntil || 0),
      Number(now) + SUPABASE_CIRCUIT_OPEN_MS,
    );
  }
  return true;
}

export function noteSupabaseCircuitSuccess() {
  supabaseCircuitState.failures = 0;
}

export function resetSupabaseCircuitForTests() {
  supabaseCircuitState.openUntil = 0;
  supabaseCircuitState.failures = 0;
  supabaseCircuitState.lastError = "";
}

export function assertSupabaseCircuitAllowsTraffic() {
  if (!supabaseCircuitOpen()) return;
  const snap = supabaseCircuitSnapshot();
  throw new Error(`Supabase circuit open (${snap.last_error || "pool/timeout"}); try again later`);
}

export async function supabaseRest(env, pathAndQuery, { method = "GET", body = null, headers = {}, signal = null } = {}) {
  const base = studioSupabaseBaseUrl(env);
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key) throw new Error("Supabase is not configured");
  // Unit tests use example.supabase.co and bypass the production circuit.
  if (!base.includes("example.supabase.co")) {
    assertSupabaseCircuitAllowsTraffic();
  }
  const url = pathAndQuery.startsWith("http") ? pathAndQuery : `${base}/rest/v1/${pathAndQuery.replace(/^\//, "")}`;
  let res;
  try {
    res = await fetch(url, {
      method,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: method === "GET" ? "count=exact" : "resolution=merge-duplicates,return=minimal",
        ...headers,
      },
      body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
      signal: signal || undefined,
    });
  } catch (error) {
    noteSupabaseCircuitFailure(error);
    throw error;
  }
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const detail = typeof parsed === "string" ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400);
    const error = new Error(`Supabase ${method} ${url} failed ${res.status}: ${detail}`);
    noteSupabaseCircuitFailure(error);
    throw error;
  }
  if (!base.includes("example.supabase.co")) noteSupabaseCircuitSuccess();
  return parsed;
}

/**
 * PostgREST/Supabase caps a single response (often 1000 rows) even when limit=10000.
 * Page with offset until exhausted or maxRows is reached.
 */
export async function supabaseRestAll(env, pathAndQuery, { pageSize = 1000, maxRows = 10000, headers = {}, signal = null } = {}) {
  const size = Math.max(1, Math.min(1000, Number(pageSize) || 1000));
  const ceiling = Math.max(1, Math.min(50000, Number(maxRows) || 10000));
  const stripped = String(pathAndQuery || "")
    .replace(/([?&])(limit|offset)=\d+/gi, "$1")
    .replace(/[?&]$/, "")
    .replace(/\?&/, "?")
    .replace(/&&+/g, "&");
  const joiner = stripped.includes("?") ? "&" : "?";
  const rows = [];
  let offset = 0;
  while (rows.length < ceiling) {
    const take = Math.min(size, ceiling - rows.length);
    const page = await supabaseRest(env, `${stripped}${joiner}limit=${take}&offset=${offset}`, { headers, signal });
    const batch = Array.isArray(page) ? page : [];
    rows.push(...batch);
    if (batch.length < take) break;
    offset += batch.length;
  }
  return rows;
}

function firstLink(value) {
  if (Array.isArray(value) && value.length) {
    const row = value[0];
    return typeof row === "string" ? row : (row?.id || null);
  }
  return null;
}

function selectName(value) {
  if (value == null || value === "") return null;
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "object" && value.name != null) return value.name;
  return null;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

const TYPED_OUTPUT_FIELD_KEYS = new Set([
  "Output_ID", "Platform", "Format", "Platform_Output_Type", "Studio_Output_Type", "Aspect_Ratio",
  "Output_Status", "Render_Status", "Review_Status", "Publish_Status", "Publish_Method",
  "Do_Not_Publish", "Test_Run_ID", "Output_Title", "Output_Caption", "Output_Hashtags",
  "Thumbnail_URL", "Final_File_URL", "Publish_Asset_URL", "Studio_Preview_URL", "Platform_Post_URL",
  "Scheduled_Post_Date", "Studio_Scheduled_At", "YouTube_Scheduled_Publish_At", "Published_At",
  "Remotion_Job_ID", "Selected_Clip_Count", "Content_Item", "Content_Profile",
  "Publish_Next_Retry_At", "YouTube_Stage", "TikTok_Draft_Status", "Auto_Publish_Enabled",
  "TikTok_Draft_Type", "Asset_Aspect_Family", "Image_Count", "Image_Output_Selected",
  "FB_Publish_Status", "FB_Image_Publish_Mode", "Studio_Effective_Voiceover_Mode",
  "Studio_Effective_Background_Music_Mode", "Publish_Retry_Eligible", "IG_Carousel_Status",
  "IG_Carousel_Next_Retry_At", "IG_Carousel_Child_Count", "IG_Carousel_Children_Ready_Count",
  "Assets_Ready_Count", "Asset_Set_Revision", "TikTok_9x16_Ready_Count", "FB_Resolved_Publish_Mode",
]);

const TYPED_CONTENT_FIELD_KEYS = new Set([
  "Content_ID", "Content_Title", "Content_Status", "Primary_Location",
  "Voiceover_Status", "Thumbnail_URL", "Created_At", "Content_Profile",
]);

const OUTPUT_EXCLUDE = new Set(SUPABASE_OUTPUT_LIST_EXCLUDE);

/** Pack non-typed list fields into jsonb (platform_outputs.error_messages). */
export function packOutputListFields(fields = {}) {
  const bag = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!key || TYPED_OUTPUT_FIELD_KEYS.has(key) || OUTPUT_EXCLUDE.has(key)) continue;
    if (value == null || value === "") continue;
    bag[key] = value;
  }
  return bag;
}

export function packContentExtras(fields = {}) {
  const bag = {};
  for (const [key, value] of Object.entries(fields || {})) {
    if (!key || TYPED_CONTENT_FIELD_KEYS.has(key)) continue;
    if (value == null || value === "") continue;
    bag[key] = value;
  }
  return bag;
}

function jsonColumn(value) {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    const text = value.trim();
    if (text.startsWith("{") || text.startsWith("[")) {
      try {
        const parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object") return parsed;
      } catch {
        return null;
      }
    }
  }
  return null;
}

function publicProjectionBag(bag) {
  const out = {};
  for (const [key, value] of Object.entries(bag || {})) {
    if (!key || key.startsWith("_")) continue;
    out[key] = value;
  }
  return out;
}

function stampRunnerProjection(bag, links, complete) {
  if (!complete) return bag;
  return {
    ...bag,
    _runner_record_projection: RUNNER_RECORD_PROJECTION,
    _airtable_links: links,
  };
}

export function retainProjectionKeys(existing, next, options = {}) {
  const incoming = isPlainObject(next) ? next : {};
  if (!isPlainObject(existing)) return { ...incoming };
  const marked = existing._runner_record_projection === RUNNER_RECORD_PROJECTION;
  // Partial Output stamps (TTD1 publish_id) must merge even when unmarked.
  // Replacing unmarked bags wiped siblings and left Processing rows with
  // bag_keys=1 so TTD2 fell back to frozen Airtable. Lean half-hour upserts
  // keep the replace-unmarked path (options.merge !== true).
  const merge = options.merge === true || marked;
  const bag = merge ? { ...existing } : { ...incoming };
  if (merge) {
    for (const [key, value] of Object.entries(incoming)) {
      if (!key || key.startsWith("_") || value == null || value === "") continue;
      bag[key] = value;
    }
    return bag;
  }
  for (const [key, value] of Object.entries(existing)) {
    if (String(key).startsWith("_") && value != null) bag[key] = value;
  }
  // The half-hour content copy never sends this registry. Keep the separate
  // copy so a lean upsert does not wipe it or mark the row complete.
  if (existing.Studio_Creative_Masters_JSON != null && incoming.Studio_Creative_Masters_JSON == null) {
    bag.Studio_Creative_Masters_JSON = existing.Studio_Creative_Masters_JSON;
  }
  return bag;
}

async function applyStoredProjection(env, table, rows, column) {
  const ids = [...new Set(rows.map((row) => row?.airtable_record_id).filter(Boolean))];
  if (!ids.length) return rows;
  const existing = new Map();
  try {
    for (let index = 0; index < ids.length; index += 100) {
      const quoted = ids.slice(index, index + 100).map((id) => encodeURIComponent(id)).join(",");
      const found = await supabaseRest(
        env,
        `${table}?airtable_record_id=in.(${quoted})&select=airtable_record_id,${column}&limit=100`,
      );
      for (const row of found || []) {
        if (row?.airtable_record_id) existing.set(row.airtable_record_id, row[column]);
      }
    }
  } catch (error) {
    console.warn("supabase projection marker read failed", table, error);
    return rows.map((row) => {
      const copy = { ...row };
      delete copy[column];
      return copy;
    });
  }
  return rows.map((row) => ({
    ...row,
    [column]: retainProjectionKeys(existing.get(row.airtable_record_id), row[column]),
  }));
}

/** Build an Airtable-shaped record so existing mapOutput / f() keep working. */
export function airtableShapedOutputFromSupabase(row) {
  const contentAirtableId = row.content_item_airtable_id || null;
  const bag = publicProjectionBag(isPlainObject(row.error_messages) ? row.error_messages : {});
  const shaped = {
    id: row.airtable_record_id,
    createdTime: row.created_at || undefined,
    fields: {
      ...bag,
      Output_ID: row.output_number,
      Platform: row.platform,
      Format: row.format,
      Platform_Output_Type: row.platform_output_type || null,
      Studio_Output_Type: row.studio_output_type,
      Aspect_Ratio: row.aspect_ratio,
      Output_Status: row.output_status,
      Render_Status: row.render_status,
      Review_Status: row.review_status,
      Publish_Status: row.publish_status,
      Publish_Method: row.publish_method || null,
      Do_Not_Publish: Boolean(row.do_not_publish),
      Test_Run_ID: row.test_run_id || null,
      Output_Title: row.output_title,
      Output_Caption: row.output_caption,
      Output_Hashtags: row.output_hashtags,
      Thumbnail_URL: row.thumbnail_url,
      Final_File_URL: row.final_file_url,
      Publish_Asset_URL: row.publish_asset_url,
      Studio_Preview_URL: row.studio_preview_url,
      Platform_Post_URL: row.platform_post_url,
      Scheduled_Post_Date: row.scheduled_post_date,
      Studio_Scheduled_At: row.studio_scheduled_at,
      YouTube_Scheduled_Publish_At: row.youtube_scheduled_publish_at,
      Published_At: row.published_at,
      Remotion_Job_ID: row.remotion_job_id,
      Selected_Clip_Count: row.selected_clip_count,
      Content_Item: contentAirtableId ? [contentAirtableId] : (Array.isArray(bag.Content_Item) ? bag.Content_Item : []),
      Content_Profile: row.content_profile_airtable_id
        ? [row.content_profile_airtable_id]
        : (Array.isArray(bag.Content_Profile) ? bag.Content_Profile : []),
    },
  };
  const queueColumns = [
    ["publish_next_retry_at", "Publish_Next_Retry_At", "value"],
    ["youtube_stage", "YouTube_Stage", "value"],
    ["tiktok_draft_status", "TikTok_Draft_Status", "value"],
    ["auto_publish_enabled", "Auto_Publish_Enabled", "bool"],
    ["tiktok_draft_type", "TikTok_Draft_Type", "value"],
    ["asset_aspect_family", "Asset_Aspect_Family", "value"],
    ["image_count", "Image_Count", "value"],
    ["image_output_selected", "Image_Output_Selected", "bool"],
    ["fb_publish_status", "FB_Publish_Status", "value"],
    ["fb_image_publish_mode", "FB_Image_Publish_Mode", "value"],
    ["studio_effective_voiceover_mode", "Studio_Effective_Voiceover_Mode", "value"],
    ["studio_effective_background_music_mode", "Studio_Effective_Background_Music_Mode", "value"],
    ["publish_retry_eligible", "Publish_Retry_Eligible", "bool"],
    ["ig_carousel_status", "IG_Carousel_Status", "value"],
    ["ig_carousel_next_retry_at", "IG_Carousel_Next_Retry_At", "value"],
    ["ig_carousel_child_count", "IG_Carousel_Child_Count", "value"],
    ["ig_carousel_children_ready_count", "IG_Carousel_Children_Ready_Count", "value"],
    ["assets_ready_count", "Assets_Ready_Count", "value"],
    ["asset_set_revision", "Asset_Set_Revision", "value"],
    ["tiktok_9x16_ready_count", "TikTok_9x16_Ready_Count", "value"],
    ["fb_resolved_publish_mode", "FB_Resolved_Publish_Mode", "value"],
  ];
  for (const [column, key, kind] of queueColumns) {
    if (row[column] == null || row[column] === "") continue;
    shaped.fields[key] = kind === "bool" ? row[column] === true : row[column];
  }
  return shaped;
}

export function airtableShapedContentFromSupabase(row) {
  const bag = publicProjectionBag(isPlainObject(row.extras) ? row.extras : {});
  const profileId = row.content_profile_airtable_id || null;
  return {
    id: row.airtable_record_id,
    createdTime: row.created_at || undefined,
    fields: {
      ...bag,
      Content_ID: row.content_number,
      Content_Title: row.content_title,
      Content_Status: row.content_status,
      Primary_Location: row.primary_location,
      Voiceover_Status: row.voiceover_status,
      Thumbnail_URL: row.thumbnail_url,
      Created_At: row.created_at,
      Content_Profile: profileId
        ? [profileId]
        : (Array.isArray(bag.Content_Profile) ? bag.Content_Profile : []),
    },
  };
}

/**
 * Shape a media_assets row for mapMusic / music helpers.
 * Drive ids stay on columns; library extras and studio CDN URLs live in metadata
 * because google_drive_url intentionally drops media.chicagoshining.com values.
 */
export function airtableShapedMusicFromSupabase(row) {
  const meta = isPlainObject(row?.metadata) ? row.metadata : {};
  const bytes = row?.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
    ? Number(row.file_size_bytes)
    : null;
  const sizeMb = bytes != null
    ? bytes / (1024 * 1024)
    : (meta.file_size_mb != null && Number.isFinite(Number(meta.file_size_mb))
      ? Number(meta.file_size_mb)
      : null);
  const driveUrl = row?.google_drive_url || meta.google_drive_url || null;
  return {
    id: row.airtable_record_id,
    createdTime: row.created_at || meta.added_at || undefined,
    fields: {
      "Asset Name": row.asset_name || null,
      Media_Class: row.media_class || null,
      Asset_Role: row.asset_role || "Music",
      Asset_Status: row.asset_status || null,
      Active: row.active !== false,
      Do_Not_Use: Boolean(row.do_not_use),
      Studio_Favorite: Boolean(row.studio_favorite),
      "Google Drive File ID": row.google_drive_file_id || null,
      "Google Drive URL": driveUrl,
      MIME_Type: row.mime_type || null,
      File_Extension: row.file_extension || null,
      File_Size_Bytes: bytes,
      File_Size_MB: sizeMb,
      Rights_Status: meta.rights_status || null,
      Asset_Description: meta.asset_description || null,
      Studio_Transfer_ID: meta.studio_transfer_id || null,
      Added_At: meta.added_at || row.created_at || null,
    },
  };
}

const MEDIA_MUSIC_SELECT = [
  "airtable_record_id",
  "asset_name",
  "media_class",
  "asset_role",
  "asset_status",
  "active",
  "do_not_use",
  "studio_favorite",
  "google_drive_file_id",
  "google_drive_url",
  "mime_type",
  "file_extension",
  "file_size_bytes",
  "metadata",
  "created_at",
  "updated_at",
].join(",");

const MEDIA_LIBRARY_SELECT = MEDIA_MUSIC_SELECT;

/**
 * Shape a media_assets row for mapLibraryAsset / Asset Manager helpers.
 * Profile, classification, and search fields live in metadata (no DDL).
 */
export function airtableShapedLibraryAssetFromSupabase(row) {
  const meta = isPlainObject(row?.metadata) ? row.metadata : {};
  const bytes = row?.file_size_bytes != null && Number.isFinite(Number(row.file_size_bytes))
    ? Number(row.file_size_bytes)
    : null;
  const driveUrl = row?.google_drive_url || meta.google_drive_url || null;
  const profileId = meta.content_profile_airtable_id || null;
  return {
    id: row.airtable_record_id,
    createdTime: row.created_at || meta.added_at || undefined,
    fields: {
      "Asset Name": row.asset_name || null,
      Media_Class: row.media_class || null,
      Asset_Role: row.asset_role || null,
      Asset_Status: row.asset_status || null,
      Active: row.active !== false,
      Do_Not_Use: Boolean(row.do_not_use),
      Studio_Favorite: Boolean(row.studio_favorite),
      "Google Drive File ID": row.google_drive_file_id || null,
      "Google Drive URL": driveUrl,
      MIME_Type: row.mime_type || null,
      File_Extension: row.file_extension || null,
      File_Size_Bytes: bytes,
      File_Size_MB: bytes != null ? bytes / (1024 * 1024) : (meta.file_size_mb != null ? Number(meta.file_size_mb) : null),
      Rights_Status: meta.rights_status || null,
      Asset_Description: meta.asset_description || null,
      Studio_Transfer_ID: meta.studio_transfer_id || null,
      Added_At: meta.added_at || row.created_at || null,
      Content_Profile: profileId ? [profileId] : [],
      Classification_Status: meta.classification_status || null,
      Intake_Status: meta.intake_status || null,
      Manual_Classification_JSON: meta.manual_classification_json || null,
      Manual_Classification_Audit: meta.manual_classification_audit || null,
      Search_Keywords: meta.search_keywords || null,
      AI_Tags: meta.ai_tags || null,
      Location: meta.location || null,
      Topic: meta.topic || null,
      Subtopic: meta.subtopic || null,
      Shot_Type: meta.shot_type || null,
      Time_Of_Day: meta.time_of_day || null,
      Weather: meta.weather || null,
      Visible_Subjects: meta.visible_subjects || null,
      Duration_Seconds: meta.duration_seconds ?? null,
      Intake_Date: meta.intake_date || null,
    },
  };
}

function encodePostgrestValue(value) {
  return encodeURIComponent(String(value ?? ""));
}

function libraryAssetSearchOrFilter(query) {
  const raw = String(query || "").trim().toLowerCase();
  if (!raw) return null;
  const quoted = raw.match(/^"([^"]+)"$/);
  const tokens = quoted
    ? [quoted[1].trim()].filter(Boolean)
    : raw.split(/[\s,]+/).map((part) => part.trim()).filter(Boolean).slice(0, 10);
  if (!tokens.length) return null;
  const columns = [
    "asset_name",
    "metadata->>search_keywords",
    "metadata->>ai_tags",
    "metadata->>manual_classification_json",
    "metadata->>location",
    "metadata->>topic",
    "metadata->>subtopic",
    "metadata->>asset_description",
  ];
  const clauses = [];
  for (const token of tokens) {
    const pattern = `*${token.replace(/[*]/g, "")}*`;
    if (pattern === "**") continue;
    for (const column of columns) {
      clauses.push(`${column}.ilike.${encodePostgrestValue(pattern)}`);
    }
  }
  if (!clauses.length) return null;
  return `or=(${clauses.join(",")})`;
}

/**
 * GET /api/library Supabase path. Returns Airtable-shaped Media Asset rows
 * for mapLibraryAsset. Mirrors ASSET_LIBRARY_LIST_FORMULA (non-music image/
 * graphic/video, no fill-crop) plus optional profile/kind/search filters.
 * Offset is a numeric skip token (string), not an Airtable opaque cursor.
 */
export async function listSupabaseAssetLibraryRecords(env, {
  limit = 50,
  offset = null,
  ids = null,
  query = "",
  kind = "",
  needsProfile = false,
  profileId = "",
  addedFrom = null,
  addedTo = null,
  sortField = "Added_At",
  sortDirection = "desc",
} = {}) {
  const capped = Math.max(1, Math.min(200, Number(limit) || 50));
  if (Array.isArray(ids) && ids.length) {
    const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
    const records = [];
    for (let i = 0; i < unique.length; i += 40) {
      const batch = unique.slice(i, i + 40);
      const orParts = batch.map((id) => `airtable_record_id.eq.${id}`).join(",");
      const rows = await supabaseRest(
        env,
        `media_assets?or=(${orParts})&select=${MEDIA_LIBRARY_SELECT}&limit=${batch.length}`,
      );
      for (const row of rows || []) {
        if (!row?.airtable_record_id) continue;
        const shaped = airtableShapedLibraryAssetFromSupabase(row);
        const mediaClass = String(shaped.fields.Media_Class || "");
        const role = String(shaped.fields.Asset_Role || "");
        const name = String(shaped.fields["Asset Name"] || "");
        if (!["Image", "Graphic", "Video"].includes(mediaClass)) continue;
        if (role === "Music") continue;
        if (/fill-crop/i.test(name)) continue;
        records.push(shaped);
      }
    }
    return {
      records,
      offset: null,
      has_more: false,
      read_source: "supabase",
    };
  }

  const filters = [
    "media_class=in.(Image,Graphic,Video)",
    "or=(asset_role.is.null,asset_role.eq.,asset_role.neq.Music)",
    "asset_name=not.ilike.*fill-crop*",
  ];
  const normalizedKind = String(kind || "").trim().toLowerCase();
  if (normalizedKind === "video") filters.push("media_class=eq.Video");
  if (normalizedKind === "photo" || normalizedKind === "image") {
    filters.push("media_class=in.(Image,Graphic)");
  }
  const needsProfileFlag = needsProfile || normalizedKind === "needs_profile";
  if (needsProfileFlag) {
    filters.push("or=(metadata->>content_profile_airtable_id.is.null,metadata->>content_profile_airtable_id.eq.)");
    filters.push(
      "or=(metadata->>classification_status.eq.Needs%20Classification,"
      + "metadata->>classification_status.eq.Classification%20Error)",
    );
  }
  const scopedProfile = String(profileId || "").trim();
  if (scopedProfile && !needsProfileFlag) {
    filters.push(`metadata->>content_profile_airtable_id=eq.${encodePostgrestValue(scopedProfile)}`);
  }
  if (addedFrom) {
    filters.push(`metadata->>added_at=gte.${encodePostgrestValue(addedFrom)}`);
  }
  if (addedTo) {
    filters.push(`metadata->>added_at=lte.${encodePostgrestValue(`${addedTo}T23:59:59.999Z`)}`);
  }
  const searchFilter = libraryAssetSearchOrFilter(query);
  if (searchFilter) filters.push(searchFilter);

  const sortKey = String(sortField || "Added_At");
  const direction = String(sortDirection || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  let order = `created_at.${direction}.nullslast`;
  if (sortKey === "Asset Name") {
    order = `asset_name.${direction}.nullslast`;
  } else if (sortKey === "Added_At") {
    order = `created_at.${direction}.nullslast`;
  }

  const skipRaw = String(offset || "").trim();
  const skip = /^\d+$/.test(skipRaw) ? Number(skipRaw) : 0;
  const fetchLimit = capped + 1;
  const path = `media_assets?${filters.join("&")}&select=${MEDIA_LIBRARY_SELECT}`
    + `&order=${order}&limit=${fetchLimit}&offset=${skip}`;
  const rows = await supabaseRest(env, path);
  const page = (rows || []).filter((row) => row?.airtable_record_id).slice(0, capped);
  const hasMore = (rows || []).length > capped;
  const records = page.map(airtableShapedLibraryAssetFromSupabase);
  return {
    records,
    offset: hasMore ? String(skip + page.length) : null,
    has_more: hasMore,
    read_source: "supabase",
  };
}

/** Ops / intake A3 classify view — Needs Classification or Classification Error. */
export async function listSupabaseA3ClassifyMedia(env, { limit = 25 } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const cap = Math.max(1, Math.min(100, Number(limit) || 25));
  const rows = await supabaseRest(
    env,
    `media_assets?or=(metadata->>classification_status.eq.Needs%20Classification,`
      + `metadata->>classification_status.eq.Classification%20Error)`
      + `&select=${MEDIA_LIBRARY_SELECT}&order=created_at.desc.nullslast&limit=${cap}`,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows.map(airtableShapedLibraryAssetFromSupabase).filter((row) => row?.id);
}

/** Ops oversized video lane — Active video > ~95.36 MB with a Drive file id. */
export async function listSupabaseOversizedMedia(env, { limit = 50 } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const cap = Math.max(1, Math.min(100, Number(limit) || 50));
  const minBytes = Math.ceil(95.36 * 1024 * 1024);
  const rows = await supabaseRest(
    env,
    `media_assets?active=eq.true&file_size_bytes=gt.${minBytes}`
      + `&google_drive_file_id=neq.&or=(media_class.eq.Video,mime_type.like.video/*)`
      + `&select=${MEDIA_LIBRARY_SELECT}&order=file_size_bytes.desc.nullslast&limit=${cap}`,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows.map(airtableShapedLibraryAssetFromSupabase).filter((row) => row?.id);
}

/**
 * Idea Candidates lanes used by autonomous/ready-production discovery.
 * Fields live in payload; status/title are top-level columns.
 */
export async function listSupabaseIdeaLane(env, { lane, limit = 100 } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const cap = Math.max(1, Math.min(200, Number(limit) || 100));
  const select = "airtable_record_id,content_profile_id,candidate_title,idea_summary,status,payload,created_at,content_profiles(airtable_record_id)";
  let filter = "or=(payload->>Test_Run_ID.is.null,payload->>Test_Run_ID.eq.)";
  if (lane === "ready_production" || lane === "photo_ready") {
    filter += `&payload->>Studio_Photo_Wait_Status=eq.${encodeDeskFilterValue("Ready")}`;
    filter += "&or=(payload->>Promoted_Content_Record_ID.is.null,payload->>Promoted_Content_Record_ID.eq.)";
    filter += "&status=neq.On Hold&status=neq.Rejected";
    if (lane === "ready_production") filter += "&status=neq.Promoted";
  } else if (lane === "photo_waiting") {
    filter += `&payload->>Studio_Photo_Wait_Status=eq.${encodeDeskFilterValue("Waiting")}`;
    filter += "&or=(payload->>Promoted_Content_Record_ID.is.null,payload->>Promoted_Content_Record_ID.eq.)";
    filter += "&status=neq.On Hold";
  } else {
    throw new Error("Unknown idea lane");
  }
  const rows = await supabaseRest(
    env,
    `idea_candidates?${filter}&select=${select}&order=created_at.asc.nullslast&limit=${cap}`,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows
    .map((row) => airtableShapedIdeaFromSupabase(flattenIdeaRow(row)))
    .filter((row) => {
      if (!row?.id) return false;
      const items = row.fields?.["Content Items"];
      if (Array.isArray(items) && items.length) return false;
      return true;
    });
}

/**
 * GET /api/music Supabase path. Returns Airtable-shaped Music role rows.
 * Prefer favorites then name; caller applies sortMusicRecords + mapMusic.
 */
export async function listSupabaseMusicRecords(env, { limit = 100, ids = null } = {}) {
  if (Array.isArray(ids) && ids.length) {
    const unique = [...new Set(ids.map((id) => String(id || "").trim()).filter(Boolean))];
    const records = [];
    for (let i = 0; i < unique.length; i += 40) {
      const batch = unique.slice(i, i + 40);
      const orParts = batch.map((id) => `airtable_record_id.eq.${id}`).join(",");
      const rows = await supabaseRest(
        env,
        `media_assets?or=(${orParts})&asset_role=eq.Music&select=${MEDIA_MUSIC_SELECT}&limit=${batch.length}`,
      );
      for (const row of rows || []) {
        if (row?.airtable_record_id) records.push(airtableShapedMusicFromSupabase(row));
      }
    }
    return { records, read_source: "supabase" };
  }

  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  // Airtable merges view + uploaded slices (up to 2× limit). Pull a wider
  // Music-role page so studio-library uploads missing from the view still appear.
  const fetchLimit = Math.min(500, Math.max(capped, capped * 2));
  const rows = await supabaseRest(
    env,
    `media_assets?asset_role=eq.Music&select=${MEDIA_MUSIC_SELECT}`
      + `&order=studio_favorite.desc,asset_name.asc.nullslast&limit=${fetchLimit}`,
  );
  const records = (rows || [])
    .filter((row) => row?.airtable_record_id)
    .map(airtableShapedMusicFromSupabase);
  return { records, read_source: "supabase" };
}

export function airtableShapedIdeaFromSupabase(row) {
  const bag = isPlainObject(row.payload) ? row.payload : {};
  const profileId = row.content_profile_airtable_id || bag.content_profile_airtable_id || null;
  const fields = { ...bag };
  delete fields.content_profile_airtable_id;
  fields.Candidate_ID = bag.Candidate_ID ?? null;
  fields.Candidate_Title = row.candidate_title || bag.Candidate_Title || null;
  fields.Idea_Summary = row.idea_summary || bag.Idea_Summary || null;
  fields.Candidate_Status = row.status || bag.Candidate_Status || null;
  fields.Content_Profile = profileId ? [profileId] : (Array.isArray(bag.Content_Profile) ? bag.Content_Profile : []);
  fields["Content Items"] = Array.isArray(bag["Content Items"]) ? bag["Content Items"] : [];
  fields.Promoted_Content_Record_ID = bag.Promoted_Content_Record_ID || null;
  fields.Create_Date = bag.Create_Date || row.created_at || null;
  fields.Studio_Photo_Wait_Status = bag.Studio_Photo_Wait_Status || null;
  fields.Production_Notes = bag.Production_Notes || null;
  fields.Production_Config_Notes = bag.Production_Config_Notes || null;
  return {
    id: row.airtable_record_id,
    createdTime: bag.Create_Date || row.created_at || undefined,
    fields,
  };
}

export function airtableShapedProductionRequestFromSupabase(row) {
  const bag = isPlainObject(row.publish_status) ? row.publish_status : {};
  const ideaId = bag.idea_candidate_airtable_id || null;
  const contentId = bag.promoted_content_airtable_id || null;
  const profileId = bag.content_profile_airtable_id || row.content_profile_airtable_id || null;
  let jobJson = row.production_job;
  if (jobJson && typeof jobJson === "object") {
    try { jobJson = JSON.stringify(jobJson); } catch { jobJson = ""; }
  }
  return {
    id: row.airtable_record_id,
    createdTime: bag.Created_At || row.created_at || undefined,
    fields: {
      Production_Request_ID: row.production_request_id || bag.Production_Request_ID || null,
      Request_Status: row.request_status || null,
      Production_Notes: row.production_notes || null,
      Studio_Production_Job_JSON: typeof jobJson === "string" ? jobJson : (bag.Studio_Production_Job_JSON || ""),
      Studio_Variant_Status: row.variant_status || bag.Studio_Variant_Status || null,
      Studio_Output_Plan_Status: row.output_plan_status || bag.Studio_Output_Plan_Status || null,
      Master_Content_Type: bag.Master_Content_Type || null,
      Target_Platforms: Array.isArray(bag.Target_Platforms) ? bag.Target_Platforms : [],
      Requested_Title: row.requested_title || bag.Requested_Title || null,
      Idea_Candidate: ideaId ? [ideaId] : [],
      Promoted_Content_Item: contentId ? [contentId] : [],
      Content_Profile: profileId ? [profileId] : [],
      Created_At: bag.Created_At || row.created_at || null,
      Updated_At: bag.Updated_At || row.updated_at || null,
      Test_Run_ID: bag.Test_Run_ID || null,
    },
  };
}

export async function resolveSupabaseProfileId(env, airtableProfileId, options = {}) {
  const id = String(airtableProfileId || "").trim();
  if (!id) return null;
  const rows = await supabaseRest(
    env,
    `content_profiles?airtable_record_id=eq.${encodeURIComponent(id)}&select=id,airtable_record_id&limit=1`,
    {
      signal: options?.signal || null,
      headers: options?.headers || {},
    },
  );
  return Array.isArray(rows) && rows[0]?.id ? rows[0].id : null;
}

const OUTPUT_SELECT = [
  "id",
  "airtable_record_id",
  "output_number",
  "content_item_id",
  "content_profile_id",
  "platform",
  "format",
  "platform_output_type",
  "studio_output_type",
  "aspect_ratio",
  "output_status",
  "render_status",
  "review_status",
  "publish_status",
  "publish_method",
  "do_not_publish",
  "test_run_id",
  "output_title",
  "output_caption",
  "output_hashtags",
  "thumbnail_url",
  "final_file_url",
  "publish_asset_url",
  "studio_preview_url",
  "platform_post_url",
  "scheduled_post_date",
  "studio_scheduled_at",
  "youtube_scheduled_publish_at",
  "published_at",
  "remotion_job_id",
  "selected_clip_count",
  "publish_next_retry_at",
  "youtube_stage",
  "tiktok_draft_status",
  "auto_publish_enabled",
  "tiktok_draft_type",
  "asset_aspect_family",
  "image_count",
  "image_output_selected",
  "fb_publish_status",
  "fb_image_publish_mode",
  "studio_effective_voiceover_mode",
  "studio_effective_background_music_mode",
  "publish_retry_eligible",
  "ig_carousel_status",
  "ig_carousel_next_retry_at",
  "ig_carousel_child_count",
  "ig_carousel_children_ready_count",
  "assets_ready_count",
  "asset_set_revision",
  "tiktok_9x16_ready_count",
  "fb_resolved_publish_mode",
  "error_messages",
  "created_at",
  "updated_at",
  "content_items(airtable_record_id,content_number,content_title)",
  "content_profiles(airtable_record_id)",
].join(",");

// Home counts do not need captions, hashtags, or content-item joins. Those
// columns made every overview page too large to finish inside the 26s budget.
const OVERVIEW_OUTPUT_SELECT = [
  "airtable_record_id",
  "output_number",
  "content_profile_id",
  "platform",
  "format",
  "platform_output_type",
  "studio_output_type",
  "aspect_ratio",
  "output_status",
  "render_status",
  "review_status",
  "publish_status",
  "publish_method",
  "do_not_publish",
  "test_run_id",
  "output_title",
  "platform_post_url",
  "scheduled_post_date",
  "studio_scheduled_at",
  "youtube_scheduled_publish_at",
  "published_at",
  "remotion_job_id",
  // Typed TikTok draft column — often absent from error_messages after lean stamps.
  // Home Manual Action needs it when Manual_Completion_Status is also missing.
  "tiktok_draft_status",
  "error_messages",
  "created_at",
].join(",");

const OVERVIEW_IDEA_SELECT = [
  "airtable_record_id",
  "content_profile_id",
  "status",
  "promoted:payload-%3E%3EPromoted_Content_Record_ID",
  "content_items:payload-%3EContent%20Items",
].join(",");

/** Home Ideas: exclude already-promoted candidates at the PostgREST source.
 * Filter on real columns / JSON paths — select aliases like `promoted:` are not
 * valid PostgREST filter targets.
 */
const OVERVIEW_OPEN_IDEA_FILTER = [
  "or=(status.is.null,status.neq.Promoted)",
  "or=(payload-%3E%3EPromoted_Content_Record_ID.is.null,payload-%3E%3EPromoted_Content_Record_ID.eq.)",
].join("&");

const CONTENT_SELECT = [
  "id",
  "airtable_record_id",
  "content_number",
  "content_title",
  "content_status",
  "content_profile_id",
  "primary_location",
  "voiceover_status",
  "thumbnail_url",
  "created_at",
  "extras",
  "content_profiles(airtable_record_id)",
].join(",");

const IDEA_SELECT = [
  "id",
  "airtable_record_id",
  "content_profile_id",
  "candidate_title",
  "idea_summary",
  "status",
  "payload",
  "created_at",
  "updated_at",
  "content_profiles(airtable_record_id)",
].join(",");

const REQUEST_SELECT = [
  "id",
  "airtable_record_id",
  "production_request_id",
  "request_status",
  "requested_title",
  "production_notes",
  "variant_status",
  "output_plan_status",
  "production_job",
  "publish_status",
  "created_at",
  "updated_at",
].join(",");

function flattenOutputRow(row) {
  return {
    ...row,
    content_item_airtable_id: row.content_items?.airtable_record_id || null,
    content_number: row.content_items?.content_number ?? null,
    content_title: row.content_items?.content_title || null,
    content_profile_airtable_id: row.content_profiles?.airtable_record_id || null,
  };
}

function flattenContentRow(row) {
  return {
    ...row,
    content_profile_airtable_id: row.content_profiles?.airtable_record_id || null,
  };
}

function flattenIdeaRow(row) {
  return {
    ...row,
    content_profile_airtable_id: row.content_profiles?.airtable_record_id || null,
  };
}


/**
 * Profile-scoped Manual Action candidates for Pipeline rescue + Home click-through.
 * Mirrors the Airtable loadManualActionPipelineOutputs formula against typed
 * columns + error_messages bag fields. Callers still run mapOutput /
 * studio_state === "Manual Action Required" for the final badge gate.
 */
export async function listSupabaseManualActionOutputs(env, { profileAirtableId, limit = 100 } = {}) {
  const profileId = await resolveSupabaseProfileId(env, profileAirtableId);
  if (!profileId) return [];
  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  const manualPublish = encodeDeskLogicValue("Manual Publish Required");
  const musicManual = encodeDeskLogicValue("Manual Action Required");
  const completionRequired = encodeDeskLogicValue("Required");
  const published = encodeDeskLogicValue("Published");
  const publishedPrivately = encodeDeskLogicValue("Published Privately");
  const skipped = encodeDeskLogicValue("Skipped");
  const manualFlags = [
    `publish_status.eq.${manualPublish}`,
    "tiktok_draft_status.ilike.*Manual Action*",
    "tiktok_draft_status.ilike.*Manual Fallback*",
    `error_messages->>Manual_Completion_Status.eq.${completionRequired}`,
    `error_messages->>Music_Status.eq.${musicManual}`,
    "error_messages->>Manual_Fallback_Required.eq.true",
    "error_messages->>Manual_Fallback_Required.eq.1",
  ].join(",");
  const openStatus = `or=(output_status.is.null,and(output_status.neq.${published},output_status.neq.${skipped}))`;
  const openPublish = `or=(publish_status.is.null,and(publish_status.neq.${published},publish_status.neq.${publishedPrivately}))`;
  const blankPost = "or=(platform_post_url.is.null,platform_post_url.eq.)";
  const blankManualUrl = blankErrorMessage("Manual_Published_URL");
  const path = `platform_outputs?content_profile_id=eq.${profileId}`
    + "&do_not_publish=eq.false&test_run_id=is.null"
    + `&${openStatus}&${openPublish}&${blankPost}&${blankManualUrl}`
    + `&or=(${manualFlags})`
    + `&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=${capped}`;
  const rows = await supabaseRest(env, path).catch((error) => {
    console.warn("supabase manual-action scan failed", error);
    return [];
  });
  return stripDeletedDuplicateOutputRecords(
    (rows || []).map((row) => airtableShapedOutputFromSupabase(flattenOutputRow(row))).filter((row) => row?.id),
  );
}

export async function listSupabasePipelineOutputs(env, { profileAirtableId, limit = 250, reviewOnly = false } = {}) {
  const profileId = await resolveSupabaseProfileId(env, profileAirtableId);
  if (!profileId) return { records: [], contentByAirtableId: new Map(), profileMissing: true };

  let filter = `content_profile_id=eq.${profileId}`;
  if (reviewOnly) {
    filter += `&do_not_publish=eq.false&or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)&review_status=neq.Approved&output_status=neq.Approved%20for%20Publishing&output_status=neq.Published`;
  }

  const newest = await supabaseRest(
    env,
    `platform_outputs?${filter}&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=${Math.max(1, Math.min(500, Number(limit) || 250))}`,
  );

  let open = [];
  if (!reviewOnly) {
    // PostgREST `neq` excludes nulls. Ready-for-Delivery TikToks often have a
    // blank Output_Status; dropping them left Home Manual counts with an empty
    // Pipeline click-through once they aged past newest-250.
    const openStatus = "or=(output_status.is.null,and(output_status.neq.Published,output_status.neq.Cancelled))";
    const openRaw = await supabaseRest(
      env,
      `platform_outputs?content_profile_id=eq.${profileId}&do_not_publish=eq.false&${openStatus}&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=1000`,
    ).catch(() => []);
    open = (openRaw || []).filter((row) => !String(row?.test_run_id || "").trim());
  }

  const byId = new Map();
  for (const row of [...(newest || []), ...(open || [])]) {
    if (!row?.airtable_record_id) continue;
    byId.set(row.airtable_record_id, flattenOutputRow(row));
  }
  const flat = [...byId.values()].sort((a, b) => Number(b.output_number || 0) - Number(a.output_number || 0));
  const contentByAirtableId = new Map();
  for (const row of flat) {
    if (row.content_item_airtable_id) {
      contentByAirtableId.set(row.content_item_airtable_id, {
        id: row.content_item_airtable_id,
        fields: {
          Content_ID: row.content_number,
          Content_Title: row.content_title,
        },
      });
    }
  }
  const records = stripDeletedDuplicateOutputRecords(flat.map(airtableShapedOutputFromSupabase));
  // Number-keyed DELETE only — never the heavy airtable-id purge from the read path.
  if (flat.some((row) => deletedDuplicateOutputNumberSet.has(Number(row?.output_number || 0)))) {
    purgeOrphanDuplicateOutputNumbers(env).catch((error) => {
      console.warn("orphan output number purge failed", error);
    });
  }
  return {
    records,
    contentByAirtableId,
    profileMissing: false,
  };
}

export async function listSupabaseScheduleGrid(env, { profileAirtableId, startIso, endIso } = {}) {
  const profileId = await resolveSupabaseProfileId(env, profileAirtableId);
  if (!profileId) return { records: [], profileMissing: true };
  const rows = await supabaseRest(
    env,
    `platform_outputs?content_profile_id=eq.${profileId}`
      + `&scheduled_post_date=gt.${encodeURIComponent(startIso)}`
      + `&scheduled_post_date=lt.${encodeURIComponent(endIso)}`
      + `&select=${OUTPUT_SELECT}`
      + `&order=scheduled_post_date.asc&limit=500`,
  );
  const flat = (rows || []).map(flattenOutputRow);
  return {
    profileMissing: false,
    records: stripDeletedDuplicateOutputRecords(flat.map((row) => ({
      id: row.airtable_record_id,
      output_id: row.output_number,
      platform: row.platform,
      output_title: row.output_title,
      content_item_id: row.content_item_airtable_id || null,
      content_id: row.content_number ?? null,
      content_title: row.content_title || row.output_title,
      scheduled_post_date: row.scheduled_post_date,
      publish_status: row.publish_status,
      output_status: row.output_status,
    }))),
  };
}

function maeScheduleFieldsFromSupabase(row, profileAirtableId) {
  return {
    id: row.airtable_record_id,
    fields: {
      Platform: row.platform || "",
      Scheduled_Post_Date: row.scheduled_post_date || "",
      YouTube_Scheduled_Publish_At: row.youtube_scheduled_publish_at || "",
      Studio_Scheduled_At: row.studio_scheduled_at || "",
      Publish_Status: row.publish_status || "",
      Output_Status: row.output_status || "",
      Review_Status: row.review_status || "",
      Studio_Output_Type: row.studio_output_type || "",
      Format: row.format || "",
      Do_Not_Publish: row.do_not_publish === true,
      Studio_Output_Notes: bagText(row.error_messages, "Studio_Output_Notes"),
      Publish_Error_Stage: bagText(row.error_messages, "Publish_Error_Stage"),
      Content_Profile: profileAirtableId ? [profileAirtableId] : [],
    },
  };
}

function bagText(bag, key) {
  if (!bag || typeof bag !== "object") return "";
  return String(bag[key] || "");
}

/**
 * Complete MAE window from platform_outputs. Fail closed: a missing profile
 * or a short page must not look like an empty calendar.
 */
export async function listSupabaseOccupiedScheduleRows(env, { profileAirtableId, platform = "", startIso, endIso } = {}) {
  const profileId = await resolveSupabaseProfileId(env, profileAirtableId);
  if (!profileId) throw new Error("Supabase profile missing for MAE occupancy");
  const start = encodeURIComponent(startIso);
  const end = encodeURIComponent(endIso);
  const platformClause = String(platform || "").trim()
    ? `&platform=eq.${encodeURIComponent(String(platform).trim())}`
    : "";
  const window = `or=(and(scheduled_post_date.gte.${start},scheduled_post_date.lte.${end}),and(youtube_scheduled_publish_at.gte.${start},youtube_scheduled_publish_at.lte.${end}),and(studio_scheduled_at.gte.${start},studio_scheduled_at.lte.${end}))`;
  const select = "airtable_record_id,platform,scheduled_post_date,youtube_scheduled_publish_at,studio_scheduled_at,publish_status,output_status,review_status,studio_output_type,format";
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; offset < 6000; offset += pageSize) {
    const page = await supabaseRest(
      env,
      `platform_outputs?content_profile_id=eq.${profileId}&do_not_publish=eq.false&test_run_id=is.null${platformClause}&${window}&select=${select}&order=scheduled_post_date.asc.nullslast&limit=${pageSize}&offset=${offset}`,
    );
    const batch = Array.isArray(page) ? page : [];
    if (!batch.length) break;
    rows.push(...batch.filter((row) => row?.airtable_record_id));
    if (rows.length > 6000) throw new Error("Supabase MAE occupancy scan exceeded safety ceiling");
    if (batch.length < pageSize) break;
  }
  return rows.map((row) => maeScheduleFieldsFromSupabase(row, profileAirtableId));
}

export const CAROUSEL_SLIDE_COPY_FIELDS = Object.freeze([
  "Current Order",
  "Slide Number",
  "Deleted From Carousel",
  "IG_Child_Container_ID",
  "IG_Child_Container_Status",
  "IG_Child_Container_Status",
  "Slide_Voiceover_Status",
  "Slide_Voiceover_Text",
  "Slide_Voiceover_URL",
  "Slide_Voiceover_Duration_Seconds",
  "Slide_Voice_ID",
  "Slide_Voice_Name",
  "Slide_Voice",
  "Studio_Voice_Prep_Request_ID",
  "Creative_Directives_JSON",
  "Slide Name",
  "Is Cover",
  "Review Status",
  "Platform Output",
  "PO_Output_ID",
  "Shared_Asset_Approved",
  "Shared_Asset_Revision",
  "Asset_4x5_Public_URL",
  "Asset_4x5_Public_Status",
  "Asset_4x5_File_URL",
  "Asset_9x16_Public_URL",
  "Asset_9x16_File_URL",
  "Asset_1x1_Public_URL",
  "Asset_1x1_File_URL",
  "FB_Photo_ID",
  "FB_Photo_Status",
  "FB_Photo_Package_Revision",
  "Current Image URL",
  "Final Image URL",
  "Watermarked Image URL",
  "AI Image URL",
  "TikTok_9x16_Safe_Zone_Status",
  "TikTok_9x16_Safe_Zone_Notes",
]);

export const PLAN_SCHEDULE_COPY_FIELDS = Object.freeze([
  "Platform",
  "Output_Type",
  "Scheduled_At",
  "Enabled",
  "Brand",
  "Production_Request",
]);

function recordLinkIds(value) {
  const ids = [];
  for (const item of Array.isArray(value) ? value : []) {
    const id = String(item?.id || item || "").trim();
    if (/^rec[A-Za-z0-9]{14}$/.test(id)) ids.push(id);
  }
  return ids;
}

function checkboxOn(value) {
  if (value === true || value === 1) return true;
  const text = String(value ?? "").trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes";
}

function parseCreativeDirectives(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) return value;
  const text = String(value || "").trim();
  if (!text) return {};
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function mapAirtableCarouselSlideToSupabase(record) {
  if (!record?.id) return null;
  const fields = record.fields || {};
  const order = Number(fields["Current Order"]);
  const copied = {};
  for (const key of CAROUSEL_SLIDE_COPY_FIELDS) {
    if (fields[key] !== undefined) copied[key] = fields[key];
  }
  return {
    airtable_record_id: record.id,
    current_order: Number.isFinite(order) ? order : null,
    deleted_from_carousel: checkboxOn(fields["Deleted From Carousel"]),
    ig_child_container_id: String(fields.IG_Child_Container_ID || "").trim() || null,
    voiceover: {
      status: fields.Slide_Voiceover_Status ?? null,
      text: fields.Slide_Voiceover_Text ?? null,
      url: fields.Slide_Voiceover_URL ?? null,
      duration_seconds: fields.Slide_Voiceover_Duration_Seconds ?? null,
      voice_id: fields.Slide_Voice_ID ?? null,
      voice_name: fields.Slide_Voice_Name ?? null,
      voice: fields.Slide_Voice ?? null,
      prep_request_id: fields.Studio_Voice_Prep_Request_ID ?? null,
    },
    creative_directives: parseCreativeDirectives(fields.Creative_Directives_JSON),
    fields: copied,
    updated_at: new Date().toISOString(),
  };
}

export function airtableShapedCarouselSlide(row) {
  const fields = { ...(row?.fields || {}) };
  if (row?.current_order != null) fields["Current Order"] = row.current_order;
  fields["Deleted From Carousel"] = row?.deleted_from_carousel === true;
  if (row?.ig_child_container_id) fields.IG_Child_Container_ID = row.ig_child_container_id;
  const voice = row?.voiceover || {};
  if (voice.status != null) fields.Slide_Voiceover_Status = voice.status;
  if (voice.text != null) fields.Slide_Voiceover_Text = voice.text;
  if (voice.url != null) fields.Slide_Voiceover_URL = voice.url;
  if (voice.duration_seconds != null) fields.Slide_Voiceover_Duration_Seconds = voice.duration_seconds;
  if (voice.voice_id != null) fields.Slide_Voice_ID = voice.voice_id;
  if (voice.voice_name != null) fields.Slide_Voice_Name = voice.voice_name;
  if (voice.voice != null) fields.Slide_Voice = voice.voice;
  if (voice.prep_request_id != null) fields.Studio_Voice_Prep_Request_ID = voice.prep_request_id;
  if (row?.creative_directives && Object.keys(row.creative_directives).length) {
    fields.Creative_Directives_JSON = JSON.stringify(row.creative_directives);
  }
  return { id: row.airtable_record_id, fields };
}

export async function syncCarouselSlideRecordsToSupabase(env, records) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true, updated: 0 };
  const rows = (records || []).map(mapAirtableCarouselSlideToSupabase).filter(Boolean);
  for (let index = 0; index < rows.length; index += 40) {
    await upsertChunk(env, "carousel_slides", rows.slice(index, index + 40));
  }
  return { ok: true, updated: rows.length };
}

export async function listSupabaseCarouselSlidesByIds(env, ids) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase carousel slide read is not configured");
  const wanted = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  const select = "airtable_record_id,current_order,deleted_from_carousel,ig_child_container_id,voiceover,creative_directives,fields";
  const rows = [];
  for (let index = 0; index < wanted.length; index += 40) {
    const chunk = wanted.slice(index, index + 40);
    const page = await supabaseRest(
      env,
      `carousel_slides?airtable_record_id=in.(${chunk.map(encodeURIComponent).join(",")})&select=${select}&limit=40`,
    );
    rows.push(...(Array.isArray(page) ? page : []).filter((row) => row?.airtable_record_id));
  }
  return rows.map(airtableShapedCarouselSlide);
}

export function mapPlanScheduleRow(record, { partial = false } = {}) {
  const fields = record?.fields || {};
  if (!record?.id) return null;
  const row = { airtable_record_id: record.id };
  const present = (name) => !partial || Object.prototype.hasOwnProperty.call(fields, name);
  if (present("Platform")) row.platform = String(fields.Platform || "").trim() || null;
  if (present("Output_Type")) row.output_type = String(fields.Output_Type || "").trim() || null;
  if (present("Scheduled_At")) {
    const ms = Date.parse(String(fields.Scheduled_At || ""));
    row.scheduled_at = Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  if (present("Enabled")) row.enabled = checkboxOn(fields.Enabled);
  if (present("Brand")) {
    const brands = recordLinkIds(fields.Brand);
    row.brand_airtable_id = brands[0] || null;
    row.brand_airtable_ids = brands;
  }
  if (present("Production_Request")) {
    const requests = recordLinkIds(fields.Production_Request);
    row.production_request_airtable_id = requests[0] || null;
    row.production_request_airtable_ids = requests;
  }
  if (Object.keys(row).length < 2) return null;
  return row;
}

export function airtableShapedPlanScheduleRow(row) {
  const requests = Array.isArray(row?.production_request_airtable_ids) ? row.production_request_airtable_ids : [];
  const brands = Array.isArray(row?.brand_airtable_ids) ? row.brand_airtable_ids : [];
  return {
    id: row.airtable_record_id,
    fields: {
      Platform: row.platform || "",
      Output_Type: row.output_type || "",
      Scheduled_At: row.scheduled_at || "",
      Enabled: row.enabled === true,
      Brand: brands.length ? brands : (row.brand_airtable_id ? [row.brand_airtable_id] : []),
      Production_Request: requests.length ? requests : (row.production_request_airtable_id ? [row.production_request_airtable_id] : []),
    },
  };
}

export async function syncPlanScheduleRowsToSupabase(env, records, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true, updated: 0 };
  const rows = (records || []).map((record) => mapPlanScheduleRow(record, options)).filter(Boolean);
  const size = options.partial === true ? 1 : 40;
  for (let index = 0; index < rows.length; index += size) {
    await upsertChunk(env, "production_request_outputs", rows.slice(index, index + size));
  }
  return { ok: true, updated: rows.length };
}

export async function listSupabasePlanScheduleRows(env, { brandAirtableId = "", startIso, endIso } = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase plan occupancy read is not configured");
  const start = encodeURIComponent(startIso);
  const end = encodeURIComponent(endIso);
  const brand = /^rec[A-Za-z0-9]{14}$/.test(String(brandAirtableId || ""))
    ? `&brand_airtable_ids=cs.${encodeURIComponent(JSON.stringify([brandAirtableId]))}`
    : "";
  const select = "airtable_record_id,platform,output_type,scheduled_at,enabled,brand_airtable_id,brand_airtable_ids,production_request_airtable_id,production_request_airtable_ids";
  const rows = [];
  const pageSize = 500;
  for (let offset = 0; offset < 6000; offset += pageSize) {
    const page = await supabaseRest(
      env,
      `production_request_outputs?enabled=eq.true&scheduled_at=gte.${start}&scheduled_at=lt.${end}${brand}&select=${select}&order=scheduled_at.asc.nullslast&limit=${pageSize}&offset=${offset}`,
    );
    const batch = Array.isArray(page) ? page : [];
    if (!batch.length) break;
    rows.push(...batch.filter((row) => row?.airtable_record_id));
    if (rows.length > 6000) throw new Error("Supabase plan occupancy scan exceeded safety ceiling");
    if (batch.length < pageSize) break;
  }
  return rows.map(airtableShapedPlanScheduleRow);
}

async function syncAirtableCatalog(env, deps, table, fields, onRecords, maxPages) {
  const listRecordsPage = deps.listRecordsPage;
  if (typeof listRecordsPage !== "function") {
    return { skipped: true, reason: "listRecordsPage_missing", ok: true, updated: 0 };
  }
  let offset = null;
  let updated = 0;
  let pages = 0;
  while (pages < maxPages) {
    await deps.assertLease?.();
    const page = await listRecordsPage(env, table, { limit: 100, offset, fields: [...fields] });
    if (!page?.valid) throw new Error(`${table} catalog page was not valid`);
    const records = page.records || [];
    if (records.length) updated += await onRecords(records);
    pages += 1;
    offset = page.offset || null;
    if (!offset || !records.length) return { ok: true, updated, pages, done: true };
  }
  console.warn("Supabase catalog copy stopped at the page cap", table, maxPages);
  return { ok: true, updated, pages, done: false };
}

export async function syncCarouselSlideCatalogToSupabase(env, deps = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true };
  const result = await syncAirtableCatalog(env, deps, "Carousel Slides", CAROUSEL_SLIDE_COPY_FIELDS, async (records) => {
    const saved = await syncCarouselSlideRecordsToSupabase(env, records);
    return saved.updated || 0;
  }, 80);
  return result;
}

export async function syncPlanScheduleCatalogToSupabase(env, deps = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true };
  return syncAirtableCatalog(env, deps, "Production Request Outputs", PLAN_SCHEDULE_COPY_FIELDS, async (records) => {
    const saved = await syncPlanScheduleRowsToSupabase(env, records);
    return saved.updated || 0;
  }, 120);
}

const RENDER_HEAL_COPY_FIELDS = [
  "Render_Clip_List_JSON",
  "Remotion_Props_JSON",
  "Output_Filename",
  "Render_Total_Frames",
  "Final_File_Storage_Status",
  "Timing_Status",
  "Timing_Timeline_JSON",
  "Voiceover_URL",
  "Studio_Effective_Voiceover_Mode",
];
const RENDER_HEAL_COPY_FORMULA = 'AND({Test_Run_ID}=BLANK(),OR({Render_Status}="Blocked",{Render_Status}="Failed",{Render_Status}="Ready for Render",{Render_Status}="Ready to Render",{Render_Status}="Waiting in Render Queue",{Render_Status}="Rendering"))';
const RENDER_HEAL_FIELD_KEYS = [
  "Timing_Status",
  "Timing_Timeline_JSON",
  "Voiceover_URL",
  "Studio_Effective_Voiceover_Mode",
];

/** Columns only. Does not write error_messages, so the lean projection marker stays unset. */
export function mapRenderHealColumns(record) {
  const id = String(record?.id || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const fields = record?.fields || {};
  const row = { airtable_record_id: id };
  const clips = jsonColumn(fields.Render_Clip_List_JSON);
  const props = jsonColumn(fields.Remotion_Props_JSON);
  if (clips != null) row.render_clip_list = clips;
  if (props != null) row.remotion_props = props;
  const filename = String(fields.Output_Filename || "").trim();
  if (filename) row.output_filename = filename;
  const frames = Number(fields.Render_Total_Frames);
  if (Number.isFinite(frames) && frames > 0) row.render_total_frames = Math.round(frames);
  const storage = String(fields.Final_File_Storage_Status || "").trim();
  if (storage) row.final_file_storage_status = storage;
  const healFields = {};
  for (const key of RENDER_HEAL_FIELD_KEYS) {
    const value = fields[key];
    if (value != null && value !== "") healFields[key] = value;
  }
  if (Object.keys(healFields).length) row.render_heal_fields = healFields;
  return Object.keys(row).length > 1 ? row : null;
}

async function patchRenderHealColumns(env, record) {
  if (!studioSupabaseConfigured(env)) return { updated: 0 };
  const row = mapRenderHealColumns(record);
  if (!row) return { updated: 0 };
  const { airtable_record_id: id, ...body } = row;
  await supabaseRest(env, `platform_outputs?airtable_record_id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    body,
    headers: { Prefer: "return=minimal" },
  });
  return { updated: 1 };
}

export async function syncRenderHealColumnRecords(env, records) {
  let updated = 0;
  for (const record of records || []) {
    updated += (await patchRenderHealColumns(env, record)).updated || 0;
  }
  return { ok: true, updated };
}

export function creativeMasterExtraValue(fields = {}) {
  if (!Object.prototype.hasOwnProperty.call(fields, "Studio_Creative_Masters_JSON")) return undefined;
  const raw = fields.Studio_Creative_Masters_JSON;
  if (raw == null || raw === "") return "";
  return typeof raw === "string" ? raw : JSON.stringify(raw);
}

/** Merge the registry into extras. Does not stamp the lean projection marker. */
export async function mergeCreativeMasterExtras(env, records, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true, updated: 0 };
  const rows = (records || []).filter((record) => /^rec[A-Za-z0-9]{14}$/.test(String(record?.id || "")));
  let updated = 0;
  for (let index = 0; index < rows.length; index += 40) {
    const chunk = rows.slice(index, index + 40);
    const ids = chunk.map((record) => encodeURIComponent(record.id)).join(",");
    const existing = await supabaseRest(
      env,
      `content_items?airtable_record_id=in.(${ids})&select=airtable_record_id,extras`,
    );
    const byId = new Map((existing || []).map((row) => [row.airtable_record_id, row.extras]));
    for (const record of chunk) {
      const value = options.blankWhenMissing === true
        ? (creativeMasterExtraValue(record.fields || {}) ?? "")
        : creativeMasterExtraValue(record.fields || {});
      if (value === undefined) continue;
      const extras = isPlainObject(byId.get(record.id)) ? { ...byId.get(record.id) } : {};
      if (extras.Studio_Creative_Masters_JSON === value) continue;
      extras.Studio_Creative_Masters_JSON = value;
      await supabaseRest(env, `content_items?airtable_record_id=eq.${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        body: { extras },
        headers: { Prefer: "return=minimal" },
      });
      updated += 1;
    }
  }
  return { ok: true, updated };
}

export async function readSupabaseCreativeMasterContent(env, airtableId) {
  const id = String(airtableId || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const rows = await supabaseRest(
    env,
    `content_items?airtable_record_id=eq.${encodeURIComponent(id)}&select=airtable_record_id,content_number,content_title,content_status,primary_location,voiceover_status,thumbnail_url,created_at,content_profile_airtable_id,extras&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row || !Object.prototype.hasOwnProperty.call(row.extras || {}, "Studio_Creative_Masters_JSON")) return null;
  return airtableShapedContentFromSupabase(row);
}

async function syncFilteredCatalog(env, deps, table, fields, filterFormula, onRecords, maxPages, sortField) {
  const listRecordsPage = deps.listRecordsPage;
  if (typeof listRecordsPage !== "function") {
    return { skipped: true, reason: "listRecordsPage_missing", ok: true, updated: 0 };
  }
  let offset = null;
  let updated = 0;
  let pages = 0;
  while (pages < maxPages) {
    await deps.assertLease?.();
    const page = await listRecordsPage(env, table, {
      limit: 100,
      offset,
      fields: [...fields],
      ...(filterFormula ? { filterFormula } : {}),
      ...(sortField ? { sortField, sortDirection: "desc" } : {}),
    });
    if (!page?.valid) throw new Error(`${table} catalog page was not valid`);
    const records = page.records || [];
    if (records.length) updated += await onRecords(records);
    pages += 1;
    offset = page.offset || null;
    if (!offset || !records.length) return { ok: true, updated, pages, done: true };
  }
  console.warn("Supabase catalog copy stopped at the page cap", table, maxPages);
  return { ok: true, updated, pages, done: false };
}

const RECOVERY_LEDGER_COPY_FIELDS = [
  "Event_Key", "Outcome", "Output_Record_ID", "Output_ID", "Reconciled_At",
  "Profile_ID", "Platform", "Output_Type", "Evidence_Source", "Post_ID",
  "Verified_At", "Actor", "Media_ID", "Details_JSON",
];

export async function syncQualityRecoveryCatalogToSupabase(env, deps = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true };
  return syncFilteredCatalog(
    env,
    deps,
    "Quality Agent Recovery Ledger",
    RECOVERY_LEDGER_COPY_FIELDS,
    'AND({Outcome}="reconciled_published",{Reconciled_At}!="")',
    async (records) => {
      let updated = 0;
      for (const record of records) {
        await mirrorQualityRecoveryEvent(env, record);
        updated += 1;
      }
      return updated;
    },
    8,
    "",
  );
}

export async function syncRenderHealCatalogToSupabase(env, deps = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true };
  const table = deps.outputTable || "Platform Outputs";
  return syncFilteredCatalog(env, deps, table, RENDER_HEAL_COPY_FIELDS, RENDER_HEAL_COPY_FORMULA, async (records) => {
    const saved = await syncRenderHealColumnRecords(env, records);
    return saved.updated || 0;
  }, 4, "Output_ID");
}

export async function syncCreativeMasterCatalogToSupabase(env, deps = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured", ok: true };
  const table = deps.contentTable || "Content Items";
  return syncFilteredCatalog(env, deps, table, ["Studio_Creative_Masters_JSON"], "", async (records) => {
    const saved = await mergeCreativeMasterExtras(env, records, { blankWhenMissing: true });
    return saved.updated || 0;
  }, 25, "");
}

function encodeDeskFilterValue(value) {
  return encodeURIComponent(String(value));
}

/**
 * PostgREST values used inside or=(...) / and=(...) must be double-quoted when
 * they contain spaces, or the logic-tree parser splits on the space (PGRST100).
 */
function encodeDeskLogicValue(value) {
  return encodeURIComponent(`"${String(value)}"`);
}

/** Blank jsonb bag field (missing or empty string). */
function blankErrorMessage(field) {
  return `or=(error_messages->>${field}.is.null,error_messages->>${field}.eq.)`;
}

/** Present jsonb bag field (not null and not empty). Top-level needs and=. */
function presentErrorMessage(field) {
  return `and=(error_messages->>${field}.not.is.null,error_messages->>${field}.neq.)`;
}

/**
 * TikTok draft reconcile clocks that used to be Airtable NOW()/DATEADD formulas.
 * Inbox drafts become due 15 minutes before Scheduled_Post_Date.
 */
function tiktokReconcileClockFilters(options = {}) {
  const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
  const inboxDueIso = encodeDeskFilterValue(new Date(nowMs + 15 * 60 * 1000).toISOString());
  const retryDueIso = encodeDeskFilterValue(new Date(nowMs).toISOString());
  const checkedBeforeIso = encodeDeskFilterValue(new Date(nowMs - 2 * 60 * 1000).toISOString());
  return {
    inboxDue: `or=(scheduled_post_date.is.null,scheduled_post_date.lte.${inboxDueIso})`,
    retryDue: `or=(publish_next_retry_at.is.null,publish_next_retry_at.lte.${retryDueIso})`,
    // Flatten blank + stale checks; nested or= inside or= is invalid PostgREST.
    lastCheckedDue: "or=(error_messages->>TikTok_Draft_Last_Checked_At.is.null,"
      + "error_messages->>TikTok_Draft_Last_Checked_At.eq.,"
      + `error_messages->>TikTok_Draft_Last_Checked_At.lt.${checkedBeforeIso})`,
  };
}

function tiktokReconcileOutputFilter(kind, options = {}) {
  const quiet = "test_run_id=is.null&do_not_publish=eq.false&platform=eq.TikTok";
  const armed = "auto_publish_enabled=eq.true";
  const blankPublishId = blankErrorMessage("TikTok_Draft_Publish_ID");
  const hasPublishId = presentErrorMessage("TikTok_Draft_Publish_ID");
  const clocks = tiktokReconcileClockFilters(options);
  const readyAssets = encodeDeskLogicValue("Ready for Assets");
  const readyDelivery = encodeDeskLogicValue("Ready for Delivery");
  const waitingSchedule = encodeDeskLogicValue("Waiting for Schedule");
  const processing = encodeDeskLogicValue("Processing");
  const retryPending = encodeDeskLogicValue("Retry Pending");
  const delivered = encodeDeskLogicValue("Draft Delivered — Manual Action Required");
  const completionReceived = encodeDeskLogicValue("Manual Completion Received");
  const ttd0 = encodeDeskLogicValue("*TTD0*");
  const ttd1 = encodeDeskLogicValue("*TTD1*");
  const ttd2 = encodeDeskLogicValue("*TTD2*");
  const ttd3 = encodeDeskLogicValue("*TTD3*");
  if (kind === "ttd0_ready") {
    // Due Waiting for Schedule promotes to Ready for Assets inside TTD0 reconcile.
    const status = `or=(tiktok_draft_status.eq.${readyAssets},tiktok_draft_status.eq.${waitingSchedule},`
      + `and(tiktok_draft_status.eq.${retryPending},error_messages->>Publish_Error_Stage.ilike.${ttd0}))`;
    return `${quiet}&${armed}&${blankPublishId}&${clocks.inboxDue}&${status}`;
  }
  if (kind === "ttd1_ready") {
    // Nested operators inside or= must be or(...)/and(...), not or= / and=.
    // Waiting for Schedule belongs on TTD0 (promote → assets), not TTD1 init.
    const status = `or=(tiktok_draft_status.eq.${readyDelivery},`
      + `and(tiktok_draft_status.eq.${retryPending},or(error_messages->>Publish_Error_Stage.ilike.${ttd1},`
      + "error_messages->>Publish_Error_Stage.eq.TTD_CAPACITY)))";
    return `${quiet}&${armed}&${blankPublishId}&${clocks.inboxDue}&${clocks.retryDue}&${status}`;
  }
  if (kind === "ttd2_processing") {
    const status = `or=(tiktok_draft_status.eq.${processing},`
      + `and(tiktok_draft_status.eq.${retryPending},error_messages->>Publish_Error_Stage.ilike.${ttd2}))`;
    const base = `${quiet}&${hasPublishId}&${clocks.inboxDue}&${clocks.retryDue}&${status}`;
    if (options.requireAutoPublish !== false) {
      return `${base}&${armed}&published_at=is.null&${clocks.lastCheckedDue}`;
    }
    return base;
  }
  if (kind === "ttd3_email") {
    const status = `or=(tiktok_draft_status.eq.${delivered},tiktok_draft_status.eq.${completionReceived},`
      + `and(tiktok_draft_status.eq.${retryPending},error_messages->>Publish_Error_Stage.ilike.${ttd3}))`;
    return `${quiet}&${presentErrorMessage("TikTok_Draft_Delivered_At")}&${blankErrorMessage("TikTok_Draft_Email_Sent_At")}`
      + `&error_messages->>Manual_Completion_Status.eq.${encodeDeskFilterValue("Required")}&${status}`;
  }
  throw new Error("Unknown TikTok reconcile candidate list");
}

function igOpenCarouselFilter() {
  return "test_run_id=is.null&do_not_publish=eq.false&published_at=is.null&platform=eq.Instagram"
    + `&or=(studio_output_type.eq.Carousel,platform_output_type.eq.${encodeDeskFilterValue("Instagram Carousel")})`;
}

/**
 * Candidate pages for desk heals that used to list Platform Outputs from Airtable.
 * Typed columns and the error-message bag are filtered here. The classifier still
 * decides whether a row is healed. The patch stays on the existing Airtable export.
 * Render heals read the clip-list columns. Those columns are not part of the lean row.
 */
export function deskHealOutputFilter(kind, options = {}) {
  const quiet = "test_run_id=is.null&do_not_publish=eq.false";
  if (kind === "native_photo") {
    const statuses = ["Ready for Review", "Approved for Publishing", "Published"]
      .map(encodeDeskFilterValue)
      .join(",");
    return `${quiet}&published_at=is.null&render_status=eq.${encodeDeskFilterValue("Native Photo Route")}`
      + `&output_status=in.(${statuses})`;
  }
  if (kind === "ig_too_many") {
    const error = `error_messages->>IG_Carousel_Error_Message.ilike.${encodeDeskFilterValue("*too little or too many attachments*")}`;
    const overflow = `and(error_messages->>IG_Carousel_Status.eq.${encodeDeskFilterValue("Children Ready")},error_messages->IG_Carousel_Child_Count.gt.10)`;
    const parentBlank = "or=(error_messages->>IG_Carousel_Parent_Container_ID.is.null,error_messages->>IG_Carousel_Parent_Container_ID.eq.)";
    return `${igOpenCarouselFilter()}&${parentBlank}&or=(${error},${overflow})`;
  }
  if (kind === "ig_verify_race") {
    return `${igOpenCarouselFilter()}&error_messages->>IG_Carousel_Error_Message.ilike.${encodeDeskFilterValue("*AP1C child-ID verification mismatch*")}`;
  }
  if (kind === "ig_poll_failure") {
    const terminal = `error_messages->>IG_Carousel_Error_Message.ilike.${encodeDeskFilterValue("*AP2C verified terminal child failure or poll timeout*")}`;
    const mismatch = `error_messages->>IG_Carousel_Error_Message.ilike.${encodeDeskFilterValue("*AP2C verified child-count mismatch*")}`;
    return `${igOpenCarouselFilter()}&or=(${terminal},${mismatch})`;
  }
  if (kind === "ig_rate_limit") {
    return `${igOpenCarouselFilter()}&error_messages->>IG_Carousel_Error_Message.ilike.${encodeDeskFilterValue("*User is performing too many actions*")}`;
  }
  if (kind === "stale_rfr") {
    const armed = ["Ready to Schedule", "Ready to Publish", "Scheduled", "Publishing"]
      .map(encodeDeskFilterValue)
      .join(",");
    return `${quiet}&published_at=is.null&output_status=eq.${encodeDeskFilterValue("Ready for Review")}`
      + `&review_status=eq.Approved&publish_status=in.(${armed})`;
  }
  if (kind === "phantom_rerender") {
    const nativeOrFile = `or=(render_status.eq.${encodeDeskFilterValue("Native Photo Route")},`
      + "and(final_file_url.not.is.null,final_file_url.neq.))";
    return `${quiet}&published_at=is.null&output_status=eq.${encodeDeskFilterValue("In Production")}`
      + `&review_status=eq.${encodeDeskFilterValue("Changes Requested")}&${nativeOrFile}`;
  }
  if (kind === "live_failed") {
    const live = [
      "published_at.not.is.null",
      "and(platform_post_url.not.is.null,platform_post_url.neq.)",
      "error_messages->>Platform_Post_ID.not.is.null",
      "error_messages->>YouTube_Video_ID.not.is.null",
    ].join(",");
    return `${quiet}&publish_status=eq.Failed&or=(${live})`;
  }
  if (kind === "ttd0_blank_draft") {
    const route = "or=(error_messages->>Publish_Error_Stage.eq.TTD0_ROUTE,"
      + `error_messages->>Publish_Error_Message.ilike.${encodeDeskFilterValue("*TTD0 found neither*")})`;
    return `${quiet}&platform=eq.TikTok&publish_status=eq.Failed&${route}`;
  }
  if (kind === "ttd_processing_missing_id") {
    const blankPublishId = "or=(error_messages->>TikTok_Draft_Publish_ID.is.null,error_messages->>TikTok_Draft_Publish_ID.eq.)";
    return `${quiet}&platform=eq.TikTok&auto_publish_enabled=eq.true&published_at=is.null`
      + `&tiktok_draft_status=eq.Processing&${blankPublishId}`;
  }
  if (kind === "tiktok_wiped_approval") {
    const blankApproval = "or=(output_status.is.null,review_status.is.null)";
    return `${quiet}&platform=eq.TikTok&auto_publish_enabled=eq.true&published_at=is.null`
      + `&publish_status=eq.${encodeDeskFilterValue("Ready to Schedule")}`
      + `&tiktok_draft_status=eq.${encodeDeskFilterValue("Waiting for Schedule")}`
      + `&${blankApproval}`;
  }
  if (kind === "ttd0_ready" || kind === "ttd1_ready" || kind === "ttd2_processing" || kind === "ttd3_email") {
    return tiktokReconcileOutputFilter(kind, options);
  }
  if (kind === "overdue_scheduled") {
    const nowMs = Number.isFinite(Number(options.nowMs)) ? Number(options.nowMs) : Date.now();
    const dueIso = encodeDeskFilterValue(new Date(nowMs).toISOString());
    // Top-level eq filters use plain URL encoding; quoted logic values are for or=/and= only.
    return `${quiet}&auto_publish_enabled=eq.true&published_at=is.null`
      + `&output_status=eq.${encodeDeskFilterValue("Approved for Publishing")}`
      + `&review_status=eq.Approved`
      + `&publish_status=eq.${encodeDeskFilterValue("Ready to Schedule")}`
      + `&scheduled_post_date=not.is.null&scheduled_post_date=lt.${dueIso}`;
  }
  if (kind === "fb_story_remote") {
    const stage = "or=(error_messages->>Publish_Error_Stage.eq.FACEBOOK_STORY_RATE_LIMIT_368,"
      + "error_messages->>Publish_Error_Stage.eq.FACEBOOK_STORY_REMOTE_VERIFICATION_PENDING)";
    const postBlank = "or=(error_messages->>Platform_Post_ID.is.null,error_messages->>Platform_Post_ID.eq.)";
    const mediaPresent = "and(error_messages->>Platform_Media_ID.not.is.null,error_messages->>Platform_Media_ID.neq.)";
    return `test_run_id=is.null&platform=eq.Facebook&platform_output_type=eq.${encodeDeskFilterValue("Facebook Story")}`
      + `&published_at=is.null&${stage}&${postBlank}&${mediaPresent}`;
  }
  if (kind === "fb_story_evidenced") {
    const stale = "or=(publish_status.neq.Published,output_status.neq.Published,"
      + "and(error_messages->>Publish_Error_Stage.not.is.null,error_messages->>Publish_Error_Stage.neq.))";
    return `test_run_id=is.null&platform=eq.Facebook&platform_output_type=eq.${encodeDeskFilterValue("Facebook Story")}`
      + `&published_at=not.is.null&and(error_messages->>Platform_Post_ID.not.is.null,error_messages->>Platform_Post_ID.neq.)&${stale}`;
  }
  if (kind === "fb_preapproval") {
    const stage = "or=(error_messages->>Publish_Error_Stage.eq.FACEBOOK_STORY_RATE_LIMIT_368,"
      + "error_messages->>Publish_Error_Stage.eq.FBS3_RATE_LIMIT,"
      + "error_messages->>Publish_Error_Stage.eq.FB_GRAPH_RATE_LIMIT)";
    return `${quiet}&platform=eq.Facebook&${stage}`;
  }
  if (kind === "fb_note_recovery") {
    return `test_run_id=is.null&platform=eq.Facebook&platform_output_type=eq.${encodeDeskFilterValue("Facebook Story")}`
      + "&publish_status=eq.Published&output_status=eq.Published"
      + "&and(error_messages->>Platform_Post_ID.not.is.null,error_messages->>Platform_Post_ID.neq.)"
      + `&error_messages->>Studio_Publish_Dispatch_Note.ilike.${encodeDeskFilterValue("*QA-AUTOVERIFY-RECOVERED:*")}`;
  }
  if (kind === "ig_stale_reel") {
    const cutoff = String(options.cutoffIso || "").trim();
    if (!/^\d{4}-\d{2}-\d{2}T/.test(cutoff)) throw new Error("Instagram stale reel scan needs a cutoff");
    const before = encodeDeskFilterValue(cutoff);
    const reel = `platform=eq.Instagram&platform_output_type=eq.${encodeDeskFilterValue("Instagram Reel")}&publish_status=eq.Publishing`;
    const locked = `and(error_messages->>Publish_Locked_By.eq.AP1-IG,error_messages->>Publish_Locked_At.lt.${before})`;
    const blankLock = "or=(error_messages->>Publish_Locked_By.is.null,error_messages->>Publish_Locked_By.eq.)";
    const blankLockAt = "or=(error_messages->>Publish_Locked_At.is.null,error_messages->>Publish_Locked_At.eq.)";
    const blankStarted = "or=(error_messages->>Publish_Started_At.is.null,error_messages->>Publish_Started_At.eq.)";
    const proof = "or=("
      + `error_messages->>Output_Notes.ilike.${encodeDeskFilterValue("*QA-IG-STALE-UPLOAD: AP1-IG review guard refused continuation*")},`
      + "and(error_messages->>Platform_Post_ID.not.is.null,error_messages->>Platform_Post_ID.neq.),"
      + "and(error_messages->>Platform_Media_ID.not.is.null,error_messages->>Platform_Media_ID.neq.))";
    const unlocked = `and(${blankLock},${blankLockAt},${blankStarted},error_messages->>Last_Publish_Attempt_At.lt.${before},${proof})`;
    return `${reel}&or=(${locked},${unlocked})`;
  }
  if (kind === "failed_status") {
    const message = "and(error_messages->>Publish_Error_Message.not.is.null,error_messages->>Publish_Error_Message.neq.,"
      + `or=(publish_status.eq.${encodeDeskFilterValue("Ready to Publish")},publish_status.eq.Publishing))`;
    return `${quiet}&published_at=is.null&or=(publish_status.eq.Failed,${message})`;
  }
  if (kind === "render_vo") {
    return "test_run_id=is.null&render_status=eq.Blocked&render_clip_list=not.is.null"
      + `&error_messages->>Remotion_Error_Message.ilike.${encodeDeskFilterValue("*Spoken audio must never run past the video end*")}`;
  }
  if (kind === "render_private_drive") {
    const msg = `or=(error_messages->>Remotion_Error_Message.ilike.${encodeDeskFilterValue("*PRIVATE_DRIVE_WATERMARK*")},`
      + `error_messages->>Final_File_Error_Message.ilike.${encodeDeskFilterValue("*PRIVATE_DRIVE_WATERMARK*")},`
      + `error_messages->>Remotion_Error_Message.ilike.${encodeDeskFilterValue("*watermark*")})`;
    return "test_run_id=is.null&render_status=in.(Blocked,Failed)"
      + `&or=(remotion_job_id.is.null,remotion_job_id.eq.)&or=(final_file_url.is.null,final_file_url.eq.)&${msg}`;
  }
  if (kind === "render_unfetchable") {
    return `test_run_id=is.null&render_status=in.(${encodeDeskFilterValue("Ready for Render")},Failed)`
      + "&or=(remotion_job_id.is.null,remotion_job_id.eq.)&or=(final_file_url.is.null,final_file_url.eq.)"
      + "&render_clip_list=not.is.null";
  }
  if (kind === "render_ready_typo") {
    return `test_run_id=is.null&render_status=eq.${encodeDeskFilterValue("Ready to Render")}`
      + "&or=(remotion_job_id.is.null,remotion_job_id.eq.)&render_clip_list=not.is.null"
      + "&output_filename=not.is.null&render_total_frames=gt.0"
      + `&format=neq.Story&studio_output_type=neq.Story`
      + "&and(error_messages->>Composition_ID.not.is.null,error_messages->>Composition_ID.neq.)";
  }
  if (kind === "render_queue") {
    return `test_run_id=is.null&render_status=in.(${encodeDeskFilterValue("Ready for Render")},${encodeDeskFilterValue("Waiting in Render Queue")})`
      + "&or=(remotion_job_id.is.null,remotion_job_id.eq.)&render_clip_list=not.is.null"
      + "&output_filename=not.is.null&render_total_frames=gt.0&or=(final_file_url.is.null,final_file_url.eq.)"
      + "&and(error_messages->>Composition_ID.not.is.null,error_messages->>Composition_ID.neq.)";
  }
  if (kind === "render_stale_final") {
    return "test_run_id=is.null&published_at=is.null&do_not_publish=eq.false"
      + `&render_status=in.(Rendering,${encodeDeskFilterValue("Ready for Render")},${encodeDeskFilterValue("Ready to Render")},${encodeDeskFilterValue("Waiting in Render Queue")})`
      + "&and(remotion_job_id.not.is.null,remotion_job_id.neq.)"
      + "&and(final_file_url.not.is.null,final_file_url.neq.)"
      + "&final_file_storage_status=eq.Uploaded"
      + `&output_status=in.(${encodeDeskFilterValue("In Production")},Rendering)`;
  }
  if (kind === "render_failed") {
    return "test_run_id=is.null&render_status=eq.Failed"
      + "&or=(remotion_job_id.is.null,remotion_job_id.eq.)&or=(final_file_url.is.null,final_file_url.eq.)";
  }
  if (kind === "render_active") {
    return "test_run_id=is.null&render_status=eq.Rendering"
      + "&and(remotion_job_id.not.is.null,remotion_job_id.neq.)&or=(final_file_url.is.null,final_file_url.eq.)";
  }
  if (kind === "render_long") {
    const cutoff = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    return "test_run_id=is.null&render_status=eq.Rendering"
      + "&and(remotion_job_id.not.is.null,remotion_job_id.neq.)&or=(final_file_url.is.null,final_file_url.eq.)"
      + `&updated_at=lt.${cutoff}`;
  }
  if (kind === "inventory_ready_no_job") {
    return `test_run_id=is.null&render_status=eq.${encodeDeskFilterValue("Ready for Render")}`
      + "&or=(remotion_job_id.is.null,remotion_job_id.eq.)";
  }
  if (kind === "inventory_unfetchable") {
    const statuses = [encodeDeskFilterValue("Ready for Render"), "Rendering", "Failed"].join(",");
    return `test_run_id=is.null&render_status=in.(${statuses})&render_clip_list=not.is.null`;
  }
  if (kind === "inventory_orphan") {
    return `test_run_id=is.null&output_status=eq.${encodeDeskFilterValue("In Production")}`
      + "&published_at=is.null&or=(remotion_job_id.is.null,remotion_job_id.eq.)";
  }
  if (kind === "inventory_continuation") {
    const cutoff = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    const closed = ["Published", encodeDeskFilterValue("Approved for Publishing"), encodeDeskFilterValue("Ready for Review")].join(",");
    return "test_run_id=is.null&published_at=is.null"
      + `&output_status=not.in.(${closed})`
      + "&error_messages->Production_Request_Output=not.is.null"
      + `&updated_at=lt.${cutoff}`;
  }
  if (kind === "inventory_az_ready") {
    return `test_run_id=is.null&output_status=eq.${encodeDeskFilterValue("Ready for Review")}`
      + "&and(final_file_url.not.is.null,final_file_url.neq.)"
      + "&and(output_caption.not.is.null,output_caption.neq.)"
      + "&and(thumbnail_url.not.is.null,thumbnail_url.neq.)"
      + `&or=(review_status.is.null,review_status.eq.,review_status.eq.${encodeDeskFilterValue("Review Sent")})`;
  }
  if (kind === "inventory_approved_dispatch") {
    const cutoff = encodeURIComponent(new Date(Date.now() - 15 * 60 * 1000).toISOString());
    return `test_run_id=is.null&output_status=eq.${encodeDeskFilterValue("Approved for Publishing")}`
      + `&published_at=is.null&platform=neq.TikTok&updated_at=lt.${cutoff}`;
  }
  if (kind === "inventory_published_cover") {
    const reel = ["Reel", "Short"].map(encodeDeskFilterValue).join(",");
    const named = ["Instagram Reel", "Facebook Reel", "YouTube Short"].map(encodeDeskFilterValue).join(",");
    return "test_run_id=is.null"
      + `&and=(or(output_status.eq.Published,publish_status.eq.Published),or(studio_output_type.in.(${reel}),platform_output_type.in.(${named})))`;
  }
  // Catalog scans in gatherStudioDeskInventory — same classifiers, Supabase pages.
  if (kind === "rfr_locked") {
    const statuses = ["Ready for Review"].map(encodeDeskFilterValue).join(",");
    const review = encodeDeskFilterValue("Review Sent");
    const rendered = encodeDeskFilterValue("Rendered");
    const native = encodeDeskFilterValue("Native Photo Route");
    return "test_run_id=is.null&published_at=is.null"
      + `&or=(output_status.in.(${statuses}),review_status.eq.${review},`
      + `render_status.eq.${rendered},render_status.eq.${native})`;
  }
  if (kind === "native_photo_unarmed") {
    return `${quiet}&published_at=is.null`
      + `&render_status.eq.${encodeDeskFilterValue("Native Photo Route")}`
      + `&output_status.eq.${encodeDeskFilterValue("Approved for Publishing")}`
      + `&or=(review_status.is.null,review_status.neq.Approved,publish_status.is.null,auto_publish_enabled.eq.false)`;
  }
  if (kind === "youtube_private_source") {
    const blankVideo = "or=(error_messages->>YouTube_Video_ID.is.null,error_messages->>YouTube_Video_ID.eq.)";
    const terminal = `youtube_stage.eq.${encodeDeskFilterValue("Terminal Error")}`;
    const yt1 = "youtube_stage.eq.YT1";
    const pub = ["Failed", "Manual Publish Required", "Ready to Publish"]
      .map(encodeDeskFilterValue).join(",");
    const uploadFailed = `error_messages->>YouTube_Upload_Status.eq.Failed`;
    return `${quiet}&platform.eq.YouTube&output_status.eq.${encodeDeskFilterValue("Approved for Publishing")}`
      + `&${blankVideo}&or=(${terminal},and(${yt1},or(publish_status.in.(${pub}),${uploadFailed})))`;
  }
  if (kind === "youtube_cover_quota") {
    const stages = [
      "error_messages->>Publish_Error_Stage.ilike.*YTS2_POLL*",
      "error_messages->>Publish_Error_Stage.ilike.*YTS2_THUMBNAIL*",
      "error_messages->>Publish_Error_Stage.ilike.*YTS2_QUOTA*",
      "error_messages->>Publish_Error_Stage.ilike.*YTS1*",
      "error_messages->>Publish_Error_Stage.ilike.*YTP1*",
    ].join(",");
    const quota = [
      "error_messages->>YouTube_Error_Message.ilike.*quota*",
      "error_messages->>YouTube_Error_Message.ilike.*failed 403*",
      "error_messages->>Publish_Error_Message.ilike.*quota*",
    ].join(",");
    return `${quiet}&platform.eq.YouTube&publish_status.neq.Published&or=(${stages})&or=(${quota})`;
  }
  throw new Error("Unknown desk heal candidate list");
}

function deskHealSelect(kind) {
  if (kind === "render_vo" || kind === "render_unfetchable" || kind === "inventory_unfetchable") {
    return `${OUTPUT_SELECT},render_clip_list,remotion_props`;
  }
  if (kind === "render_queue") return `${OUTPUT_SELECT},render_heal_fields`;
  if (kind === "render_stale_final") return `${OUTPUT_SELECT},final_file_storage_status`;
  return OUTPUT_SELECT;
}

function attachRenderHealFields(shaped, row) {
  if (row.render_clip_list != null) {
    shaped.fields.Render_Clip_List_JSON = typeof row.render_clip_list === "string"
      ? row.render_clip_list
      : JSON.stringify(row.render_clip_list);
  }
  if (row.remotion_props != null) {
    shaped.fields.Remotion_Props_JSON = typeof row.remotion_props === "string"
      ? row.remotion_props
      : JSON.stringify(row.remotion_props);
  }
  if (row.output_filename) shaped.fields.Output_Filename = row.output_filename;
  if (row.render_total_frames != null) shaped.fields.Render_Total_Frames = row.render_total_frames;
  if (row.final_file_storage_status) shaped.fields.Final_File_Storage_Status = row.final_file_storage_status;
  if (isPlainObject(row.render_heal_fields)) Object.assign(shaped.fields, row.render_heal_fields);
}

function shapeDeskHealRecord(row) {
  const shaped = airtableShapedOutputFromSupabase(flattenOutputRow(row));
  if (!shaped.fields.Last_Modified && !shaped.fields.Updated_At && row.updated_at) {
    shaped.fields.Updated_At = row.updated_at;
  }
  attachRenderHealFields(shaped, row);
  return shaped;
}

export async function listSupabaseDeskHealOutputs(env, {
  kind,
  limit = 30,
  sortDirection = "desc",
  nowMs = undefined,
  requireAutoPublish = undefined,
  cutoffIso = "",
} = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase desk heal read is not configured");
  const capped = Math.max(1, Math.min(80, Number(limit) || 30));
  const direction = String(sortDirection || "desc").toLowerCase() === "asc" ? "asc" : "desc";
  // TTD0/TTD1 must use nullslast. nullsfirst let blank Scheduled_Post_Date
  // rows monopolize the light limit=2 slots forever and starve due dated
  // Ready for Delivery drafts (4121/5602/3971 behind 4988/5031/10457).
  // TTD2 must fair-queue by Last_Checked (nulls first). output_number.desc
  // kept pulsing the same high-ID Processing rows and never reached 4121.
  const order = (kind === "ttd0_ready" || kind === "ttd1_ready")
    ? `order=scheduled_post_date.${direction}.nullslast`
    : kind === "overdue_scheduled"
      ? `order=scheduled_post_date.${direction}.nullsfirst`
      : kind === "ttd2_processing"
        ? `order=error_messages->>TikTok_Draft_Last_Checked_At.${direction}.nullsfirst`
        : `order=output_number.${direction}.nullslast`;
  const select = deskHealSelect(kind);
  const filterOptions = { nowMs, requireAutoPublish, cutoffIso };
  if (kind === "render_unfetchable" || kind === "inventory_unfetchable") {
    const matches = [];
    const pageSize = 40;
    for (let offset = 0; offset < 320 && matches.length < capped; offset += pageSize) {
      const page = await supabaseRest(
        env,
        `platform_outputs?${deskHealOutputFilter(kind, filterOptions)}&select=${select}&${order}&limit=${pageSize}&offset=${offset}`,
      );
      const batch = Array.isArray(page) ? page : [];
      for (const row of batch) {
        if (!JSON.stringify(row?.render_clip_list || "").includes("/api/media-assets/")) continue;
        matches.push(row);
        if (matches.length >= capped) break;
      }
      if (batch.length < pageSize) break;
    }
    return matches.filter((row) => row?.airtable_record_id).map(shapeDeskHealRecord);
  }
  const rows = await supabaseRest(
    env,
    `platform_outputs?${deskHealOutputFilter(kind, filterOptions)}&select=${select}&${order}&limit=${capped}`,
  );
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.airtable_record_id)
    .map(shapeDeskHealRecord);
}

export function deskRequestFilter(kind) {
  const quiet = "or=(publish_status->>Test_Run_ID.is.null,publish_status->>Test_Run_ID.eq.)";
  if (kind === "inventory_produce") return `${quiet}&production_job=not.is.null`;
  if (kind === "inventory_preparing") return `${quiet}&variant_status=in.(Preparing,Error)`;
  if (kind === "inventory_autonomous") {
    return `${quiet}&request_status=in.(Draft,Ready,Submitted)&production_notes=ilike.${encodeDeskFilterValue("*origin=autonomous*")}`;
  }
  if (kind === "inventory_az") {
    return `${quiet}&request_status=neq.Cancelled&production_notes=ilike.${encodeDeskFilterValue("*origin=az-finished-video*")}`;
  }
  if (kind === "inventory_promoted") return `${quiet}&request_status=eq.Promoted`;
  if (kind === "inventory_autonomous_promoted") {
    return `${quiet}&request_status=eq.Promoted&production_notes=ilike.${encodeDeskFilterValue("*origin=autonomous*")}`;
  }
  if (kind === "inventory_escalated") return `${quiet}&request_status=neq.Cancelled&production_job->>step=eq.escalated`;
  throw new Error("Unknown desk inventory request list");
}

export async function listSupabaseDeskInventoryRequests(env, { kind, limit = 8 } = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase desk inventory read is not configured");
  const capped = Math.max(1, Math.min(40, Number(limit) || 8));
  const order = kind === "inventory_produce" ? "created_at.desc.nullslast" : "updated_at.desc.nullslast";
  const rows = await supabaseRest(
    env,
    `production_requests?${deskRequestFilter(kind)}&select=${REQUEST_SELECT}&order=${order}&limit=${capped}`,
  );
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.airtable_record_id)
    .map(airtableShapedProductionRequestFromSupabase);
}

/** One page of a full heal census. Offset is a row count, not an Airtable cursor. */
export async function listSupabaseDeskHealPage(env, { kind, limit = 100, offset = 0, cutoffIso = "" } = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase desk heal read is not configured");
  const capped = Math.max(1, Math.min(100, Number(limit) || 100));
  const start = Math.max(0, Number(offset) || 0);
  if (start >= 2000) {
    console.warn("Supabase desk heal scan stopped at the safety ceiling", kind);
    return { records: [], offset: null };
  }
  const rows = await supabaseRest(
    env,
    `platform_outputs?${deskHealOutputFilter(kind, { cutoffIso })}&select=${deskHealSelect(kind)}&order=output_number.desc.nullslast&limit=${capped}&offset=${start}`,
  );
  const batch = Array.isArray(rows) ? rows : [];
  const records = batch.filter((row) => row?.airtable_record_id).map(shapeDeskHealRecord);
  const next = start + capped;
  return { records, offset: batch.length === capped && next < 2000 ? String(next) : null };
}

export async function readSupabaseMaeOutput(env, airtableId) {
  const id = String(airtableId || "").trim();
  if (!id) return null;
  const rows = await supabaseRest(
    env,
    `platform_outputs?airtable_record_id=eq.${encodeURIComponent(id)}&select=airtable_record_id,platform,scheduled_post_date,youtube_scheduled_publish_at,studio_scheduled_at,publish_status,output_status,review_status,studio_output_type,format,do_not_publish,error_messages&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.airtable_record_id) return null;
  return maeScheduleFieldsFromSupabase(row, "");
}

const HOME_FAILURE_STATUSES = [
  "Output_Status", "Render_Status", "Publish_Status", "Asset_Selection_Status",
  "IG_Carousel_Status", "TikTok_Draft_Status", "FB_Publish_Status",
  "FB_Slideshow_Status", "YouTube_Package_Status", "YouTube_Upload_Status",
  "YouTube_Processing_Status",
];
const HOME_FAILURE_ERRORS = [
  "Publish_Error_Message", "Remotion_Error_Message", "Final_File_Error_Message",
  "IG_Carousel_Error_Message", "Music_Error_Message", "FB_Slideshow_Error_Message",
  "YouTube_Error_Message", "YouTube_Processing_Failure_Reason", "YouTube_Rejection_Reason",
];

/** Same superset as the Quality Agent home failure formula, applied to a shaped row. */
export function supabaseOutputMatchesHomeFailure(fields = {}) {
  for (const key of HOME_FAILURE_STATUSES) {
    const text = String(fields?.[key] || "").toLowerCase();
    if (text.includes("failed") || text.includes("error")) return true;
  }
  for (const key of HOME_FAILURE_ERRORS) {
    if (String(fields?.[key] || "").trim()) return true;
  }
  return false;
}

export async function readSupabaseShapedOutput(env, airtableId) {
  const id = String(airtableId || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const rows = await supabaseRest(
    env,
    `platform_outputs?airtable_record_id=eq.${encodeURIComponent(id)}&select=${OUTPUT_SELECT}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.airtable_record_id) return null;
  return shapeDeskHealRecord(row);
}

/** One page of a Platform Output census. Offset is a raw row count. */
export async function listSupabaseOutputCensusPage(env, { limit = 100, offset = 0, filterFormula = "" } = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase output census is not configured");
  const capped = Math.max(1, Math.min(100, Number(limit) || 100));
  const start = Math.max(0, Number(offset) || 0);
  if (start >= 12000) return { records: [], offset: null };
  const formula = String(filterFormula || "");
  const pastDue = formula.includes("{Scheduled_Post_Date}");
  const failure = formula.includes("FIND(");
  let path = `platform_outputs?test_run_id=is.null&select=${OUTPUT_SELECT}&order=output_number.asc.nullslast&limit=${capped}&offset=${start}`;
  if (pastDue) {
    const iso = formula.match(/IS_BEFORE\(\{Scheduled_Post_Date\},"([^"]+)"\)/)?.[1];
    if (!iso) throw new Error("Supabase past-due census needs a clock");
    path = `platform_outputs?test_run_id=is.null&do_not_publish=eq.false&review_status=eq.Approved`
      + `&scheduled_post_date=lt.${encodeURIComponent(iso)}&scheduled_post_date=not.is.null`
      + `&select=${OUTPUT_SELECT}&order=output_number.asc.nullslast&limit=${capped}&offset=${start}`;
  }
  const rows = await supabaseRest(env, path);
  const batch = Array.isArray(rows) ? rows : [];
  let records = batch.filter((row) => row?.airtable_record_id).map(shapeDeskHealRecord);
  if (failure) records = records.filter((row) => supabaseOutputMatchesHomeFailure(row.fields));
  const next = start + capped;
  return { records, offset: batch.length === capped && next < 12000 ? String(next) : null };
}

export async function mirrorQualityRecoveryEvent(env, record) {
  if (!studioSupabaseConfigured(env) || !record?.id) return { skipped: true, reason: "missing_record" };
  const fields = record.fields || {};
  await supabaseRest(env, "quality_agent_recovery_events?on_conflict=airtable_record_id", {
    method: "POST",
    body: [{
      airtable_record_id: record.id,
      event_key: fields.Event_Key || null,
      outcome: fields.Outcome || null,
      output_record_id: fields.Output_Record_ID || null,
      output_number: fields.Output_ID ?? null,
      fields,
    }],
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
  return { ok: true };
}

/** One page of reconciled Quality Agent recovery events. Offset is a row count. */
export async function listSupabaseQualityRecoveryPage(env, { limit = 100, offset = 0, filterFormula = "" } = {}) {
  if (!studioSupabaseConfigured(env)) throw new Error("Supabase recovery ledger read is not configured");
  if (!String(filterFormula || "").includes("reconciled_published")) {
    throw new Error("Supabase recovery ledger scan needs the reconciled outcome");
  }
  const capped = Math.max(1, Math.min(100, Number(limit) || 100));
  const start = Math.max(0, Number(offset) || 0);
  if (start >= 4000) return { records: [], offset: null };
  const rows = await supabaseRest(
    env,
    "quality_agent_recovery_events?outcome=eq.reconciled_published"
      + "&fields->>Reconciled_At=not.is.null&fields->>Reconciled_At=neq."
      + `&select=airtable_record_id,fields&order=created_at.asc.nullslast&limit=${capped}&offset=${start}`,
  );
  const batch = Array.isArray(rows) ? rows : [];
  const records = batch.filter((row) => row?.airtable_record_id).map((row) => ({
    id: row.airtable_record_id,
    fields: isPlainObject(row.fields) ? row.fields : {},
  }));
  const next = start + capped;
  return { records, offset: batch.length === capped && next < 4000 ? String(next) : null };
}

export async function readSupabaseQualityRecoveryEvent(env, airtableId) {
  const id = String(airtableId || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return null;
  const rows = await supabaseRest(
    env,
    `quality_agent_recovery_events?airtable_record_id=eq.${encodeURIComponent(id)}&select=airtable_record_id,fields&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.airtable_record_id) return null;
  return { id: row.airtable_record_id, fields: isPlainObject(row.fields) ? row.fields : {} };
}

export function mergeMaeOccupancyRows(airtableRows, supabaseRows) {
  const byId = new Map();
  for (const row of airtableRows || []) {
    if (row?.id) byId.set(row.id, row);
  }
  for (const row of supabaseRows || []) {
    if (row?.id) byId.set(row.id, row);
  }
  return [...byId.values()];
}

export const OUTPUT_CRON_PRESERVE_COLUMNS = [
  "scheduled_post_date",
  "studio_scheduled_at",
  "youtube_scheduled_publish_at",
  "publish_status",
  "output_status",
  "review_status",
  "publish_method",
  "do_not_publish",
];

async function lookupExistingAirtableIds(env, table, ids) {
  const wanted = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const found = new Set();
  for (let i = 0; i < wanted.length; i += 80) {
    const chunk = wanted.slice(i, i + 80).map((id) => encodeURIComponent(id)).join(",");
    const rows = await supabaseRest(
      env,
      `${table}?airtable_record_id=in.(${chunk})&select=airtable_record_id&limit=80`,
    );
    for (const row of rows || []) {
      if (row?.airtable_record_id) found.add(row.airtable_record_id);
    }
  }
  return found;
}

async function lookupExistingDriveFileIds(env, ids) {
  const wanted = [...new Set((ids || []).map((id) => String(id || "").trim()).filter(Boolean))];
  const found = new Set();
  for (let i = 0; i < wanted.length; i += 80) {
    const chunk = wanted.slice(i, i + 80).map((id) => encodeURIComponent(id)).join(",");
    const rows = await supabaseRest(
      env,
      `media_assets?google_drive_file_id=in.(${chunk})&select=google_drive_file_id&limit=80`,
    );
    for (const row of rows || []) {
      const driveId = String(row?.google_drive_file_id || "").trim();
      if (driveId) found.add(driveId);
    }
  }
  return found;
}

/**
 * media_assets.google_drive_file_id is unique. Airtable has historical duplicates
 * of the same Drive file. Inserting the second record 409s and stops the page
 * walk, so a duplicate is skipped and the file already in Supabase stays.
 */
async function omitRowsWithExistingDriveFile(env, rows) {
  const list = Array.isArray(rows) ? rows : [];
  const existing = await lookupExistingDriveFileIds(
    env,
    list.map((row) => row?.google_drive_file_id),
  );
  const seen = new Set(existing);
  const kept = [];
  let skipped = 0;
  for (const row of list) {
    const driveId = String(row?.google_drive_file_id || "").trim();
    if (driveId && seen.has(driveId)) {
      skipped += 1;
      continue;
    }
    if (driveId) seen.add(driveId);
    kept.push(row);
  }
  return { rows: kept, skipped };
}

/** Keep Studio-owned schedule and approval columns when the half-hour copy hits an existing output. */
export async function splitOutputCronSorRows(env, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (studioWriteSource(env) !== "supabase" || !list.length) return { existing: [], fresh: list };
  const existingIds = await lookupExistingAirtableIds(env, "platform_outputs", list.map((row) => row?.airtable_record_id));
  const existing = [];
  const fresh = [];
  for (const row of list) {
    if (!row?.airtable_record_id || !existingIds.has(row.airtable_record_id)) {
      fresh.push(row);
      continue;
    }
    const copy = { ...row };
    for (const key of OUTPUT_CRON_PRESERVE_COLUMNS) delete copy[key];
    existing.push(copy);
  }
  return { existing, fresh };
}

/** Phase 6 updates are already Supabase-first. The half-hour copy may insert a missing create, not overwrite one. */
export async function omitExistingPhase6CronRows(env, table, rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (studioPhase6WriteSource(env) !== "supabase" || !list.length) return list;
  const existingIds = await lookupExistingAirtableIds(env, table, list.map((row) => row?.airtable_record_id));
  return list.filter((row) => row?.airtable_record_id && !existingIds.has(row.airtable_record_id));
}

export async function listSupabaseContentItems(env, { profileAirtableId, limit = 100 } = {}) {
  const profileId = await resolveSupabaseProfileId(env, profileAirtableId);
  if (!profileId) return { records: [], outputs: [], profileMissing: true };

  const capped = Math.max(1, Math.min(500, Number(limit) || 100));
  const [newest, openOutputs] = await Promise.all([
    supabaseRest(
      env,
      `content_items?content_profile_id=eq.${profileId}&select=${CONTENT_SELECT}`
        + `&order=created_at.desc.nullslast&limit=${capped}`,
    ),
    supabaseRest(
      env,
      `platform_outputs?content_profile_id=eq.${profileId}&do_not_publish=eq.false`
        + `&output_status=neq.Published&output_status=neq.Cancelled`
        + `&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=1000`,
    ).catch(() => []),
  ]);

  const openContentIds = new Set();
  for (const row of openOutputs || []) {
    const flat = flattenOutputRow(row);
    if (flat.content_item_airtable_id) openContentIds.add(flat.content_item_airtable_id);
  }

  const byId = new Map();
  for (const row of newest || []) {
    if (!row?.airtable_record_id) continue;
    byId.set(row.airtable_record_id, flattenContentRow(row));
  }

  const missing = [...openContentIds].filter((id) => !byId.has(id));
  if (missing.length) {
    for (let i = 0; i < missing.length; i += 40) {
      const batch = missing.slice(i, i + 40);
      const orParts = batch.map((id) => `airtable_record_id.eq.${id}`).join(",");
      const extra = await supabaseRest(
        env,
        `content_items?or=(${orParts})&select=${CONTENT_SELECT}&limit=${batch.length}`,
      ).catch(() => []);
      for (const row of extra || []) {
        if (row?.airtable_record_id) byId.set(row.airtable_record_id, flattenContentRow(row));
      }
    }
  }

  const recentOutputs = await supabaseRest(
    env,
    `platform_outputs?content_profile_id=eq.${profileId}&select=${OUTPUT_SELECT}`
      + `&order=output_number.desc.nullslast&limit=200`,
  ).catch(() => []);

  const outputById = new Map();
  for (const row of [...(recentOutputs || []), ...(openOutputs || [])]) {
    if (!row?.airtable_record_id) continue;
    outputById.set(row.airtable_record_id, flattenOutputRow(row));
  }

  return {
    profileMissing: false,
    records: [...byId.values()].map(airtableShapedContentFromSupabase),
    outputs: stripDeletedDuplicateOutputRecords([...outputById.values()].map(airtableShapedOutputFromSupabase)),
  };
}

export async function listSupabaseOverviewPack(env, { profileAirtableIds = [], outputLimit = 10000, ideaLimit = 10000, includeIdeas = true } = {}) {
  const ids = (profileAirtableIds || []).map((id) => String(id || "").trim()).filter(Boolean);
  if (!ids.length) return { outputs: [], ideas: [], profilesMissing: true };

  // Start the abort before profile lookup. A wedged pool makes the 1-row
  // content_profiles read wait until the outer 26s race, and the canary then
  // only sees the generic budget error.
  const controller = new AbortController();
  const abortTimer = setTimeout(() => controller.abort(), 18000);
  const signal = controller.signal;
  const pageHeaders = { Prefer: "count=none" };
  try {
    const resolved = await Promise.all(ids.map(async (airtableId) => [
      airtableId,
      await resolveSupabaseProfileId(env, airtableId, { signal, headers: pageHeaders }),
    ]));
    const profileUuidByAirtable = new Map(resolved.filter(([, uuid]) => uuid));
    if (!profileUuidByAirtable.size) return { outputs: [], ideas: [], profilesMissing: true };

    const airtableByUuid = new Map([...profileUuidByAirtable].map(([airtableId, uuid]) => [uuid, airtableId]));
    const uuids = [...profileUuidByAirtable.values()];
    const profileFilter = uuids.length === 1
      ? `content_profile_id=eq.${uuids[0]}`
      : `content_profile_id=in.(${uuids.join(",")})`;
    const outCeiling = Math.max(1, Math.min(10000, Number(outputLimit) || 10000));
    const ideaCeiling = Math.max(1, Math.min(10000, Number(ideaLimit) || 10000));

    // Known-valid PostgREST operators only. not.eq was not proven against this
    // project's PostgREST, and a rejected filter fell through to an Airtable scan
    // that cannot finish inside the refresh budget. Blank statuses still count.
    const openOutputFilter = [
      "do_not_publish=eq.false",
      "or=(output_status.is.null,and(output_status.neq.Published,output_status.neq.Cancelled))",
      "or=(publish_status.is.null,publish_status.neq.Published)",
    ].join("&");
    const outputPromise = Promise.all(uuids.map((uuid) => supabaseRestAll(
      env,
      `platform_outputs?content_profile_id=eq.${uuid}&${openOutputFilter}&select=${OVERVIEW_OUTPUT_SELECT}&order=output_number.desc.nullslast`,
      { pageSize: 1000, maxRows: outCeiling, headers: pageHeaders, signal },
    )));
    const ideaPromise = includeIdeas
      ? new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), 8000);
        // Filter promoted status + blank Promoted_Content_Record_ID at source so
        // Home does not page/count hundreds of historical idea_candidates.
        supabaseRestAll(
          env,
          `idea_candidates?${profileFilter}&${OVERVIEW_OPEN_IDEA_FILTER}&select=${OVERVIEW_IDEA_SELECT}&order=created_at.desc.nullslast`,
          { pageSize: 1000, maxRows: ideaCeiling, headers: pageHeaders, signal },
        ).then(
          (rows) => { clearTimeout(timer); resolve(rows); },
          () => { clearTimeout(timer); resolve(null); },
        );
      })
      : Promise.resolve([]);
    const [outputGroups, ideaResult] = await Promise.all([outputPromise, ideaPromise]);
    const outputRows = outputGroups.flat();
    let ideaRows = Array.isArray(ideaResult) ? ideaResult : [];
    const ideasIncomplete = includeIdeas && !Array.isArray(ideaResult);

    if (outputGroups.some((group) => group.length >= outCeiling)) {
      throw new Error("Profiles overview outputs exceeded complete-scan safety ceiling");
    }
    if (includeIdeas && !ideasIncomplete && ideaRows.length >= ideaCeiling) {
      throw new Error("Profiles overview ideas exceeded complete-scan safety ceiling");
    }

    const shapeOutput = (row) => {
      const flat = flattenOutputRow(row);
      if (!flat.content_profile_airtable_id) {
        flat.content_profile_airtable_id = airtableByUuid.get(row.content_profile_id) || null;
      }
      return airtableShapedOutputFromSupabase(flat);
    };
    const normalizeIdeaLinks = (linked) => {
      if (Array.isArray(linked)) return linked;
      if (typeof linked === "string" && linked.trim()) {
        try {
          const parsed = JSON.parse(linked);
          return Array.isArray(parsed) ? parsed : [];
        } catch {
          return [];
        }
      }
      return [];
    };
    const shapeIdea = (row) => {
      const promoted = row?.promoted ?? (isPlainObject(row?.payload) ? row.payload.Promoted_Content_Record_ID : null);
      const linked = row?.content_items ?? (isPlainObject(row?.payload) ? row.payload["Content Items"] : null);
      const status = row?.status
        ?? (isPlainObject(row?.payload) ? row.payload.Candidate_Status : null)
        ?? null;
      const flat = flattenIdeaRow({
        ...row,
        status,
        payload: {
          Candidate_Status: status,
          Promoted_Content_Record_ID: promoted || null,
          "Content Items": normalizeIdeaLinks(linked),
        },
      });
      if (!flat.content_profile_airtable_id) {
        flat.content_profile_airtable_id = airtableByUuid.get(row.content_profile_id) || null;
      }
      return airtableShapedIdeaFromSupabase(flat);
    };

    return {
      profilesMissing: false,
      outputs: stripDeletedDuplicateOutputRecords((outputRows || []).map(shapeOutput)),
      ideas: (ideaRows || []).map(shapeIdea),
      ideas_incomplete: ideasIncomplete,
      output_count: (outputRows || []).length,
      idea_count: ideasIncomplete ? 0 : (ideaRows || []).length,
    };
  } catch (error) {
    if (signal.aborted || error?.name === "AbortError") throw new Error("supabase overview pack timed out after 18s");
    throw error;
  } finally {
    clearTimeout(abortTimer);
  }
}

function matchesOpsQueueOutputFormula(fields = {}) {
  if (String(fields.Test_Run_ID || "").trim()) return false;
  if (fields.Do_Not_Publish) return false;
  const output = String(fields.Output_Status || "");
  const review = String(fields.Review_Status || "");
  const render = String(fields.Render_Status || "");
  const openOutput = [
    "In Production", "Ready for Render", "Rendering", "Rendered", "Ready for Review",
    "Approved", "Approved for Publishing", "Ready to Schedule", "Ready to Publish",
    "Scheduled", "Failed", "Blocked",
  ].includes(output);
  const openReview = review === "Review Sent";
  const openRender = [
    "Waiting in Render Queue", "Ready for Render", "Ready to Render", "Rendering", "Failed", "Blocked",
  ].includes(render);
  return openOutput || openReview || openRender;
}

function matchesOpsQueueRenderFormula(fields = {}) {
  if (String(fields.Test_Run_ID || "").trim()) return false;
  if (fields.Do_Not_Publish) return false;
  const render = String(fields.Render_Status || "");
  const output = String(fields.Output_Status || "");
  return [
    "Ready for Render", "Ready to Render", "Waiting in Render Queue", "Rendering", "Failed", "Blocked",
  ].includes(render) || ["Ready for Render", "Rendering"].includes(output);
}

function matchesOpsQueueReviewFormula(fields = {}) {
  if (String(fields.Test_Run_ID || "").trim()) return false;
  if (fields.Do_Not_Publish) return false;
  const output = String(fields.Output_Status || "");
  const review = String(fields.Review_Status || "");
  if (output === "Ready for Review") return true;
  if (review !== "Review Sent") return false;
  return !["Approved", "Approved for Publishing", "Scheduled", "Published"].includes(output);
}

function matchesRenderActiveHold(fields = {}) {
  if (String(fields.Test_Run_ID || "").trim()) return false;
  return String(fields.Render_Status || "") === "Rendering"
    && Boolean(String(fields.Remotion_Job_ID || "").trim())
    && !String(fields.Final_File_URL || "").trim();
}

function matchesOpsQueueRequestFormula(fields = {}) {
  if (String(fields.Test_Run_ID || "").trim()) return false;
  const status = String(fields.Request_Status || "");
  if (status === "Cancelled") return false;
  if (["Draft", "Ready", "Submitted"].includes(status)) return true;
  const job = String(fields.Studio_Production_Job_JSON || "");
  return Boolean(job) && !job.includes('"step":"done"');
}

/**
 * Factory desk / Ops Queue pack from Supabase (Airtable-shaped records).
 */
export async function listSupabaseFactoryDeskPack(env, { outputLimit = 800, requestLimit = 120 } = {}) {
  const outCap = Math.max(50, Math.min(2000, Number(outputLimit) || 800));
  const reqCap = Math.max(20, Math.min(300, Number(requestLimit) || 120));
  // The global newest-output sample is NOT authoritative for Needs eyes.
  // More than 800 scheduled posts can crowd every older Ready-for-Review output
  // out of that sample (NYC had 30 actionable records while Factory showed 0).
  // Fetch the review queue independently and paginate past Supabase's 1000-row
  // response cap; do not silently convert an incomplete review scan into zero.
  const [outputRows, reviewReadyRows, requestRows, ideaRows, profileRows] = await Promise.all([
    supabaseRest(
      env,
      `platform_outputs?do_not_publish=eq.false&output_status=neq.Published&output_status=neq.Cancelled`
        + `&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=${outCap}`,
    ).catch(() => []),
    supabaseRestAll(
      env,
      `platform_outputs?do_not_publish=eq.false`
        + `&or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)`
        + `&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast`,
      { pageSize: 500, maxRows: 10000 },
    ).then((rows) => {
      if (rows.length >= 10000) throw new Error("Factory review-ready output scan exceeded safety ceiling");
      return rows;
    }),
    supabaseRest(
      env,
      `production_requests?request_status=neq.Cancelled&select=${REQUEST_SELECT}`
        + `&order=updated_at.desc.nullslast&limit=${reqCap}`,
    ).catch(() => []),
    supabaseRest(
      env,
      `idea_candidates?select=${IDEA_SELECT}&order=created_at.desc.nullslast&limit=80`,
    ).catch(() => []),
    supabaseRest(
      env,
      `content_profiles?active=eq.true&select=id,airtable_record_id,profile_name,brand_name,market_name,active&limit=50`,
    ).catch(() => []),
  ]);

  // Merge by authoritative output identity, retaining the independent
  // review-ready scan even when its records predate the newest-output sample.
  const outputById = new Map();
  for (const row of [...(outputRows || []), ...(reviewReadyRows || [])]) {
    if (row?.airtable_record_id) outputById.set(row.airtable_record_id, row);
  }
  const rawShapedOutputs = [...outputById.values()]
    .map(flattenOutputRow)
    .filter((row) => !String(row.test_run_id || "").trim())
    .map(airtableShapedOutputFromSupabase);
  // Number-keyed DELETE when ban-listed ghosts appear in the Factory pack
  // (before strip removes them from the returned lanes).
  if (rawShapedOutputs.some((row) => deletedDuplicateOutputNumberSet.has(Number(row?.fields?.Output_ID || 0)))) {
    purgeOrphanDuplicateOutputNumbers(env).catch((error) => {
      console.warn("factory desk orphan output number purge failed", error);
    });
  }
  // Pipeline list already strips superseded twins. Factory desk must too —
  // otherwise Airtable-deleted In Production mirrors block Approve all
  // (Content 2094: 6 ready · 6 sibling awaiting).
  const shapedOutputs = stripDeletedDuplicateOutputRecords(rawShapedOutputs);

  const outputs = shapedOutputs.filter((row) => matchesOpsQueueOutputFormula(row.fields));
  const renderLaneOutputs = shapedOutputs.filter((row) => matchesOpsQueueRenderFormula(row.fields));
  const reviewOutputs = shapedOutputs.filter((row) => matchesOpsQueueReviewFormula(row.fields));
  const activeHolds = await listSupabaseDeskHealOutputs(env, { kind: "render_active", limit: 16 }).catch(() => []);

  const requests = (requestRows || [])
    .map(airtableShapedProductionRequestFromSupabase)
    .filter((row) => matchesOpsQueueRequestFormula(row.fields));

  const ideas = (ideaRows || []).map(flattenIdeaRow).map(airtableShapedIdeaFromSupabase);
  const photoWaitIdeas = ideas.filter((row) => {
    const wait = String(row.fields?.Studio_Photo_Wait_Status || "");
    const status = String(row.fields?.Candidate_Status || "");
    const promoted = String(row.fields?.Promoted_Content_Record_ID || "").trim();
    return wait === "Waiting" && !promoted && status !== "On Hold";
  }).slice(0, 40);

  const contentIds = [...new Set([
    ...shapedOutputs.map((row) => firstLink(row.fields?.Content_Item)),
    ...requests.map((row) => firstLink(row.fields?.Promoted_Content_Item)),
  ].filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id || ""))))];

  const contentById = new Map();
  for (let i = 0; i < contentIds.length; i += 40) {
    const batch = contentIds.slice(i, i + 40);
    const orParts = batch.map((id) => `airtable_record_id.eq.${id}`).join(",");
    const rows = await supabaseRest(
      env,
      `content_items?or=(${orParts})&select=${CONTENT_SELECT}&limit=${batch.length}`,
    ).catch(() => []);
    for (const row of rows || []) {
      if (!row?.airtable_record_id) continue;
      contentById.set(row.airtable_record_id, airtableShapedContentFromSupabase(flattenContentRow(row)));
    }
  }

  const profiles = (profileRows || []).map((row) => ({
    id: row.airtable_record_id,
    fields: {
      Profile_Name: row.profile_name,
      Brand_Name: row.brand_name,
      Market_Name: row.market_name,
      Active: Boolean(row.active),
    },
  })).filter((row) => row.id);

  return {
    profiles,
    outputs,
    renderLaneOutputs,
    reviewOutputs,
    activeHolds,
    requests,
    contentById,
    ideas,
    photoWaitIdeas,
  };
}

/**
 * PostgREST rejects batch POST bodies when objects omit different keys
 * (PGRST102 "All object keys must match"). Media backfill and full-record
 * marker densify naturally produce sparse rows; pad missing keys with null so
 * the half-hour sync can finish completed+ok instead of partial.
 */
export function homogenizeUpsertRows(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return rows || [];
  const keys = [];
  const seen = new Set();
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue;
      seen.add(key);
      keys.push(key);
    }
  }
  if (!keys.length) return rows;
  return rows.map((row) => {
    const out = {};
    for (const key of keys) {
      out[key] = row && Object.prototype.hasOwnProperty.call(row, key) ? row[key] : null;
    }
    return out;
  });
}

/**
 * Postgres/jsonb rejects U+0000 in text. Airtable long-text / JSON fields
 * occasionally carry null bytes; strip them before PostgREST upsert so media
 * densify cannot fail the whole chunk with 22P05.
 */
export function stripNullBytesDeep(value) {
  if (typeof value === "string") return value.replace(/\u0000/g, "");
  if (Array.isArray(value)) return value.map((item) => stripNullBytesDeep(item));
  if (isPlainObject(value)) {
    const out = {};
    for (const [key, nested] of Object.entries(value)) {
      out[key] = stripNullBytesDeep(nested);
    }
    return out;
  }
  return value;
}

function upsertChunk(env, table, rows) {
  if (!rows.length) return Promise.resolve();
  const body = homogenizeUpsertRows(rows).map((row) => stripNullBytesDeep(row));
  return supabaseRest(env, `${table}?on_conflict=airtable_record_id`, {
    method: "POST",
    body,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

function profileLinkIds(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => (typeof item === "string" ? item : item?.id))
    .map((id) => String(id || "").trim())
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
}

export function mapAirtableProfileToSupabase(record, { organizationId = null, brandId = null } = {}) {
  const f = (name) => record?.fields?.[name];
  const platformSetup = {
    Brand: profileLinkIds(f("Brand")),
    Organization: profileLinkIds(f("Organization")),
    Idea_Generation_Enabled: Boolean(f("Idea_Generation_Enabled")),
    Autonomous_Produce_Enabled: Boolean(f("Autonomous_Produce_Enabled")),
    Daily_Idea_Limit: f("Daily_Idea_Limit") ?? null,
    Default_Narration_Voice_ID: String(f("Default_Narration_Voice_ID") || ""),
    Default_Narration_Voice_Name: String(f("Default_Narration_Voice_Name") || ""),
    Autonomous_Music_Pool: profileLinkIds(f("Autonomous_Music_Pool")),
    Studio_Background_Color: String(f("Studio_Background_Color") || ""),
  };
  return {
    airtable_record_id: record.id,
    profile_name: String(f("Profile_Name") || ""),
    brand_name: String(f("Brand_Name") || "") || null,
    market_name: String(f("Market_Name") || "") || null,
    active: Boolean(f("Active")),
    organization_id: organizationId,
    brand_id: brandId,
    platform_setup: platformSetup,
  };
}

/** Airtable-shaped Content Profile from the lean content_profiles row + platform_setup bag. */
export function airtableShapedContentProfileFromSupabase(row) {
  if (!row?.airtable_record_id) return null;
  const setup = isPlainObject(row.platform_setup) ? row.platform_setup : {};
  const fields = {
    Profile_Name: row.profile_name || "",
    Brand_Name: row.brand_name || "",
    Market_Name: row.market_name || "",
    Active: row.active === true,
    Brand: Array.isArray(setup.Brand) ? setup.Brand : [],
    Organization: Array.isArray(setup.Organization) ? setup.Organization : [],
    Idea_Generation_Enabled: setup.Idea_Generation_Enabled === true,
    Autonomous_Produce_Enabled: setup.Autonomous_Produce_Enabled === true,
    Daily_Idea_Limit: setup.Daily_Idea_Limit ?? null,
    Default_Narration_Voice_ID: setup.Default_Narration_Voice_ID || "",
    Default_Narration_Voice_Name: setup.Default_Narration_Voice_Name || "",
    Autonomous_Music_Pool: Array.isArray(setup.Autonomous_Music_Pool) ? setup.Autonomous_Music_Pool : [],
    Studio_Background_Color: setup.Studio_Background_Color || "",
  };
  return { id: row.airtable_record_id, fields };
}

export async function listSupabaseContentProfiles(env, { limit = 100, activeOnly = false } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const cap = Math.max(1, Math.min(Number(limit) || 100, 100));
  const filter = activeOnly ? "&active=eq.true" : "";
  const rows = await supabaseRest(
    env,
    `content_profiles?select=airtable_record_id,profile_name,brand_name,market_name,active,platform_setup`
      + `${filter}&order=profile_name.asc&limit=${cap}`,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows.map(airtableShapedContentProfileFromSupabase).filter((row) => row?.id);
}

export async function readSupabaseContentProfile(env, recordId) {
  const id = String(recordId || "").trim();
  if (!/^rec[A-Za-z0-9]{14}$/.test(id) || !studioSupabaseConfigured(env)) return null;
  const rows = await supabaseRest(
    env,
    `content_profiles?airtable_record_id=eq.${encodeURIComponent(id)}`
      + `&select=airtable_record_id,profile_name,brand_name,market_name,active,platform_setup&limit=1`,
  ).catch(() => null);
  if (!Array.isArray(rows) || !rows[0]) return null;
  return airtableShapedContentProfileFromSupabase(rows[0]);
}

/**
 * Ops PUB1/PUB2/PUB3 queues — explicit publish_status filters so view=
 * cannot collapse to Test_Run_ID=BLANK under studioSideTableRead.
 */
export async function listSupabaseOpsPublishOutputs(env, { lane, limit = 50 } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const cap = Math.max(1, Math.min(Number(limit) || 50, 100));
  const quiet = "or(test_run_id.is.null,test_run_id.eq.)";
  let filter = quiet;
  if (lane === "ready_to_schedule") {
    filter += `&publish_status.eq.${encodeDeskFilterValue("Ready to Schedule")}`;
  } else if (lane === "ready_to_publish") {
    filter += `&publish_status.eq.${encodeDeskFilterValue("Ready to Publish")}`;
  } else if (lane === "published") {
    filter += `&or=(publish_status.eq.Published,output_status.eq.Published)`;
  } else {
    throw new Error("Unknown ops publish lane");
  }
  const rows = await supabaseRest(
    env,
    `platform_outputs?select=${OUTPUT_SELECT}&${filter}`
      + `&order=output_number.desc.nullslast&limit=${cap}`,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows.map((row) => shapeDeskHealRecord(row)).filter((row) => row?.id);
}

export function mapAirtableContentToSupabase(record, profileUuid, options = {}) {
  const fields = record?.fields || {};
  const profileAirtableId = firstLink(fields.Content_Profile);
  const links = {};
  let complete = Boolean(options.fullRecord);
  if (profileAirtableId) {
    if (profileUuid) links.Content_Profile = profileAirtableId;
    else complete = false;
  }
  return {
    airtable_record_id: record.id,
    content_number: fields.Content_ID ?? null,
    content_title: fields.Content_Title || null,
    content_status: selectName(fields.Content_Status),
    content_profile_id: profileUuid,
    primary_location: fields.Primary_Location || null,
    voiceover_status: selectName(fields.Voiceover_Status),
    thumbnail_url: fields.Thumbnail_URL || null,
    created_at: fields.Created_At || record.createdTime || null,
    extras: stampRunnerProjection(packContentExtras(fields), links, complete),
  };
}

export function mapAirtableOutputToSupabase(record, { profileUuid, contentUuidByAirtableId, fullRecord = false }) {
  const fields = record?.fields || {};
  const contentAirtableId = firstLink(fields.Content_Item);
  const profileAirtableId = firstLink(fields.Content_Profile);
  const bag = packOutputListFields(fields);
  const row = {
    airtable_record_id: record.id,
    output_number: fields.Output_ID ?? null,
    content_item_id: contentAirtableId ? (contentUuidByAirtableId.get(contentAirtableId) || null) : null,
    ...("Content_Item" in fields ? { content_item_airtable_id: contentAirtableId || null } : {}),
    content_profile_id: profileUuid,
    platform: selectName(fields.Platform) || "Unknown",
    format: selectName(fields.Format),
    platform_output_type: selectName(fields.Platform_Output_Type),
    studio_output_type: selectName(fields.Studio_Output_Type),
    aspect_ratio: selectName(fields.Aspect_Ratio),
    output_status: selectName(fields.Output_Status),
    render_status: selectName(fields.Render_Status),
    review_status: selectName(fields.Review_Status),
    publish_status: selectName(fields.Publish_Status),
    publish_method: selectName(fields.Publish_Method),
    do_not_publish: Boolean(fields.Do_Not_Publish),
    test_run_id: fields.Test_Run_ID || null,
    output_title: fields.Output_Title || null,
    output_caption: fields.Output_Caption || null,
    output_hashtags: fields.Output_Hashtags || null,
    thumbnail_url: fields.Thumbnail_URL || null,
    final_file_url: fields.Final_File_URL || null,
    publish_asset_url: fields.Publish_Asset_URL || null,
    studio_preview_url: fields.Studio_Preview_URL || null,
    platform_post_url: fields.Platform_Post_URL || null,
    scheduled_post_date: fields.Scheduled_Post_Date || null,
    studio_scheduled_at: fields.Studio_Scheduled_At || null,
    youtube_scheduled_publish_at: fields.YouTube_Scheduled_Publish_At || null,
    published_at: fields.Published_At || null,
    remotion_job_id: fields.Remotion_Job_ID || null,
    selected_clip_count: fields.Selected_Clip_Count ?? null,
    error_messages: bag,
  };
  const present = (key) => Object.prototype.hasOwnProperty.call(fields, key);
  if (present("Publish_Next_Retry_At")) row.publish_next_retry_at = fields.Publish_Next_Retry_At || null;
  if (present("YouTube_Stage")) row.youtube_stage = selectName(fields.YouTube_Stage);
  if (present("TikTok_Draft_Status")) row.tiktok_draft_status = selectName(fields.TikTok_Draft_Status);
  if (present("Auto_Publish_Enabled")) row.auto_publish_enabled = Boolean(fields.Auto_Publish_Enabled);
  if (present("TikTok_Draft_Type")) row.tiktok_draft_type = selectName(fields.TikTok_Draft_Type);
  if (present("Asset_Aspect_Family")) row.asset_aspect_family = selectName(fields.Asset_Aspect_Family);
  if (present("Image_Count")) row.image_count = fields.Image_Count ?? null;
  if (present("Image_Output_Selected")) row.image_output_selected = Boolean(fields.Image_Output_Selected);
  if (present("FB_Publish_Status")) row.fb_publish_status = selectName(fields.FB_Publish_Status);
  if (present("FB_Image_Publish_Mode")) row.fb_image_publish_mode = selectName(fields.FB_Image_Publish_Mode);
  if (present("Studio_Effective_Voiceover_Mode")) row.studio_effective_voiceover_mode = selectName(fields.Studio_Effective_Voiceover_Mode);
  if (present("Studio_Effective_Background_Music_Mode")) row.studio_effective_background_music_mode = selectName(fields.Studio_Effective_Background_Music_Mode);
  if (present("Publish_Retry_Eligible")) row.publish_retry_eligible = Boolean(fields.Publish_Retry_Eligible);
  if (present("IG_Carousel_Status")) row.ig_carousel_status = selectName(fields.IG_Carousel_Status);
  if (present("IG_Carousel_Next_Retry_At")) row.ig_carousel_next_retry_at = fields.IG_Carousel_Next_Retry_At || null;
  if (present("IG_Carousel_Child_Count")) row.ig_carousel_child_count = fields.IG_Carousel_Child_Count ?? null;
  if (present("IG_Carousel_Children_Ready_Count")) row.ig_carousel_children_ready_count = fields.IG_Carousel_Children_Ready_Count ?? null;
  if (present("Assets_Ready_Count")) row.assets_ready_count = fields.Assets_Ready_Count ?? null;
  if (present("Asset_Set_Revision")) row.asset_set_revision = fields.Asset_Set_Revision || null;
  if (present("TikTok_9x16_Ready_Count")) row.tiktok_9x16_ready_count = fields.TikTok_9x16_Ready_Count ?? null;
  if (present("FB_Resolved_Publish_Mode")) row.fb_resolved_publish_mode = selectName(fields.FB_Resolved_Publish_Mode);
  let complete = Boolean(fullRecord);
  const links = {};
  if (contentAirtableId) {
    if (contentUuidByAirtableId?.get(contentAirtableId)) links.Content_Item = contentAirtableId;
    else complete = false;
  }
  if (profileAirtableId) {
    if (profileUuid) links.Content_Profile = profileAirtableId;
    else complete = false;
  }
  if (fullRecord) {
    for (const [airtableKey, column] of Object.entries(OUTPUT_JSON_COLUMNS)) {
      if (!Object.prototype.hasOwnProperty.call(fields, airtableKey)) continue;
      const parsed = jsonColumn(fields[airtableKey]);
      if (parsed) row[column] = parsed;
      else if (fields[airtableKey] != null && fields[airtableKey] !== "") bag[airtableKey] = fields[airtableKey];
    }
    row.error_messages = stampRunnerProjection(bag, links, complete);
  }
  return row;
}

export function mapAirtableIdeaToSupabase(record, profileUuid) {
  const fields = record?.fields || {};
  return {
    airtable_record_id: record.id,
    content_profile_id: profileUuid,
    candidate_title: fields.Candidate_Title || null,
    idea_summary: fields.Idea_Summary || null,
    status: selectName(fields.Candidate_Status),
    payload: {
      Candidate_ID: fields.Candidate_ID ?? null,
      Candidate_Title: fields.Candidate_Title || null,
      Idea_Summary: fields.Idea_Summary || null,
      Candidate_Status: selectName(fields.Candidate_Status),
      Content_Profile: fields.Content_Profile || [],
      "Content Items": fields["Content Items"] || [],
      Promoted_Content_Record_ID: fields.Promoted_Content_Record_ID || null,
      Create_Date: fields.Create_Date || record.createdTime || null,
      Studio_Photo_Wait_Status: fields.Studio_Photo_Wait_Status || null,
      Production_Notes: fields.Production_Notes || null,
      Production_Config_Notes: fields.Production_Config_Notes || null,
      content_profile_airtable_id: firstLink(fields.Content_Profile),
    },
  };
}

export function mapAirtableProductionRequestToSupabase(record, profileUuid = null) {
  const fields = record?.fields || {};
  let productionJob = {};
  const rawJob = fields.Studio_Production_Job_JSON;
  if (typeof rawJob === "string" && rawJob.trim()) {
    try { productionJob = JSON.parse(rawJob); } catch { productionJob = { raw: rawJob.slice(0, 2000) }; }
  } else if (isPlainObject(rawJob)) {
    productionJob = rawJob;
  }
  const rawStatus = selectName(fields.Request_Status) || "Draft";
  const allowedStatus = new Set(["Draft", "Ready", "Submitted", "Promoted", "Cancelled"]);
  const requestStatus = allowedStatus.has(rawStatus) ? rawStatus : "Draft";
  return {
    airtable_record_id: record.id,
    production_request_id: fields.Production_Request_ID != null ? String(fields.Production_Request_ID) : null,
    request_status: requestStatus,
    requested_title: fields.Requested_Title || null,
    production_notes: fields.Production_Notes || null,
    variant_status: selectName(fields.Studio_Variant_Status),
    output_plan_status: selectName(fields.Studio_Output_Plan_Status),
    production_job: productionJob,
    origin: null,
    publish_status: {
      Production_Request_ID: fields.Production_Request_ID ?? null,
      Studio_Variant_Status: selectName(fields.Studio_Variant_Status),
      Studio_Output_Plan_Status: selectName(fields.Studio_Output_Plan_Status),
      Master_Content_Type: fields.Master_Content_Type || null,
      Target_Platforms: Array.isArray(fields.Target_Platforms) ? fields.Target_Platforms : [],
      Requested_Title: fields.Requested_Title || null,
      idea_candidate_airtable_id: firstLink(fields.Idea_Candidate),
      promoted_content_airtable_id: firstLink(fields.Promoted_Content_Item),
      content_profile_airtable_id: firstLink(fields.Content_Profile) || null,
      Created_At: fields.Created_At || record.createdTime || null,
      Updated_At: fields.Updated_At || null,
      Test_Run_ID: fields.Test_Run_ID || null,
      Studio_Production_Job_JSON: typeof rawJob === "string" ? rawJob : "",
      profile_uuid: profileUuid,
    },
  };
}

async function listAirtableOutputsByIds(env, listRecords, tableId, ids, fields) {
  const rows = [];
  const unique = [...new Set(ids.filter((id) => /^rec[A-Za-z0-9]{14}$/.test(String(id || ""))))];
  for (let index = 0; index < unique.length; index += 20) {
    const batch = unique.slice(index, index + 20);
    const formula = batch.map((id) => `RECORD_ID()='${String(id).replace(/'/g, "")}'`).join(",");
    const found = await listRecords(env, tableId, {
      limit: batch.length,
      fields,
      filterFormula: batch.length === 1 ? formula : `OR(${formula})`,
    });
    rows.push(...(found || []));
  }
  return rows;
}

/**
 * Supabase open reads keep any row with do_not_publish=false. Skipping a
 * package removes it from the Airtable open pack, so the cron never upserts
 * it again and the old row stays on Awaiting Approval. Pull those Airtable
 * records and write the skipped state through.
 */
export async function reconcileSupabaseDroppedOpenOutputs(env, {
  profileUuid,
  keptIds,
  listRecords,
  outputFields,
  contentUuidByAirtableId,
} = {}) {
  const tableId = env?.AIRTABLE_OUTPUT_TABLE_ID;
  if (!studioSupabaseConfigured(env) || !tableId || !profileUuid || !listRecords) return 0;
  const kept = keptIds instanceof Map ? new Set(keptIds.keys()) : new Set(keptIds || []);
  let remote = [];
  try {
    remote = await supabaseRest(
      env,
      `platform_outputs?content_profile_id=eq.${profileUuid}&do_not_publish=eq.false&output_status=neq.Published&select=airtable_record_id&limit=1000`,
    );
  } catch (error) {
    console.warn("supabase dropped-open reconcile list failed", error);
    throw error;
  }
  const missing = [];
  for (const row of remote || []) {
    const id = String(row?.airtable_record_id || "");
    if (/^rec[A-Za-z0-9]{14}$/.test(id) && !kept.has(id)) missing.push(id);
  }
  if (!missing.length) return 0;
  const fresh = await listAirtableOutputsByIds(
    env,
    listRecords,
    tableId,
    missing.slice(0, 200),
    outputFields,
  );
  if (!fresh.length) return 0;
  const needContent = [];
  for (const row of fresh) {
    const contentId = firstLink(row?.fields?.Content_Item);
    if (contentId && contentUuidByAirtableId && !contentUuidByAirtableId.has(contentId)) needContent.push(contentId);
  }
  if (needContent.length && contentUuidByAirtableId) {
    const quoted = [...new Set(needContent)].map((id) => encodeURIComponent(id)).join(",");
    const found = await supabaseRest(
      env,
      `content_items?airtable_record_id=in.(${quoted})&select=id,airtable_record_id&limit=200`,
    );
    for (const row of found || []) {
      if (row?.airtable_record_id && row.id) contentUuidByAirtableId.set(row.airtable_record_id, row.id);
    }
  }
  const outputRows = fresh.map((row) => {
    const mapped = mapAirtableOutputToSupabase(row, {
      profileUuid,
      contentUuidByAirtableId: contentUuidByAirtableId || new Map(),
    });
    if (!mapped.content_item_id) delete mapped.content_item_id;
    return mapped;
  });
  for (let index = 0; index < outputRows.length; index += 200) {
    await upsertChunk(env, "platform_outputs", outputRows.slice(index, index + 200));
  }
  return outputRows.length;
}

/**
 * Upsert one profile's content items + platform outputs (+ ideas / requests) into Supabase.
 * `deps.listRecords` / `deps.f` / `deps.contentProfileFilterFormula` come from worker.js.
 */
export async function syncProfilePipelineToSupabase(env, profile, deps = {}) {
  await deps.assertLease?.();
  const listRecords = deps.listRecords;
  const f = deps.f;
  const contentProfileFilterFormula = deps.contentProfileFilterFormula;
  const outputFields = deps.outputFields || [
    "Output_ID", "Platform", "Format", "Platform_Output_Type", "Studio_Output_Type", "Aspect_Ratio",
    "Output_Status", "Render_Status", "Review_Status", "Publish_Status", "Publish_Method",
    "Do_Not_Publish", "Test_Run_ID", "Final_File_URL", "Publish_Asset_URL", "Output_Title",
    "Output_Caption", "Output_Hashtags", "Thumbnail_URL", "Scheduled_Post_Date", "Studio_Scheduled_At",
    "YouTube_Scheduled_Publish_At", "Studio_Preview_URL", "Platform_Post_URL", "Published_At",
    "Content_Item", "Content_Profile", "Selected_Clip_Count", "Remotion_Job_ID",
  ];
  if (!listRecords || !f || !contentProfileFilterFormula) {
    throw new Error("syncProfilePipelineToSupabase requires listRecords, f, contentProfileFilterFormula");
  }
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured" };
  }

  const guardedUpsert = async (table, rows) => {
    await deps.assertLease?.();
    const started = Date.now();
    await upsertChunk(env, table, rows);
    deps.onUpsert?.(table, rows.length, Date.now() - started);
  };
  await guardedUpsert("content_profiles", [mapAirtableProfileToSupabase(profile)]);
  const profileUuid = await resolveSupabaseProfileId(env, profile.id);
  if (!profileUuid) throw new Error(`Supabase profile missing after upsert for ${profile.id}`);

  const profileFormula = contentProfileFilterFormula(profile);
  const outputLimit = Math.max(50, Math.min(2000, Number(deps.outputLimit) || 1000));
  const contentLimit = Math.max(50, Math.min(1000, Number(deps.contentLimit) || 400));
  // All Profiles Ideas column needs unpromoted inventory, not only the newest 200.
  const ideaLimit = Math.max(20, Math.min(5000, Number(deps.ideaLimit) || 2000));
  const ideaTableId = deps.ideaTableId || env.AIRTABLE_IDEA_TABLE_ID;

  const leanContentFields = [
    "Content_ID", "Content_Title", "Content_Status", "Content_Profile",
    "Primary_Location", "Voiceover_Status", "Thumbnail_URL", "Created_At",
  ];
  const [contents, newest, openExtra, ideas] = await Promise.all([
    listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: contentLimit,
      sortField: "Created_At",
      filterFormula: profileFormula,
      fields: [...CONTENT_LIST_SYNC_FIELDS],
    }).catch(() => listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: contentLimit,
      sortField: "Created_At",
      filterFormula: profileFormula,
      fields: leanContentFields,
    })),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: outputLimit,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: profileFormula,
      fields: outputFields,
    }),
    typeof deps.listOpenOutputs === "function"
      ? deps.listOpenOutputs(profile)
      : Promise.resolve([]),
    ideaTableId
      ? listRecords(env, ideaTableId, {
        limit: ideaLimit,
        sortField: "Create_Date",
        sortDirection: "desc",
        filterFormula: profileFormula,
        fields: [...IDEA_LIST_SYNC_FIELDS],
      }).catch(() => listRecords(env, ideaTableId, {
        limit: ideaLimit,
        sortField: "Create_Date",
        sortDirection: "desc",
        filterFormula: profileFormula,
        // Keep promotion keys even on the lean fallback. Dropping them made
        // Home Ideas count every historical idea_candidate as still open.
        fields: [
          "Candidate_ID",
          "Candidate_Title",
          "Candidate_Status",
          "Content_Profile",
          "Create_Date",
          "Promoted_Content_Record_ID",
          "Content Items",
        ],
      }))
      : Promise.resolve([]),
  ]);

  // Newest-N alone can drop older unfinished Pipeline rows. Merge the open pack
  // so Ready for Review / Scheduled stay warm in Supabase between full imports.
  const outputsById = new Map();
  for (const row of [...(newest || []), ...(openExtra || [])]) {
    if (row?.id) outputsById.set(row.id, row);
  }
  const outputs = [...outputsById.values()];

  // Lean list fields. A full-record marker here would make a later runner get
  // treat omitted JSON and extras as empty, so this copy stays unmarked.
  const contentRows = await applyStoredProjection(
    env,
    "content_items",
    (contents || []).map((row) => mapAirtableContentToSupabase(row, profileUuid)),
    "extras",
  );
  for (let i = 0; i < contentRows.length; i += 200) {
    await guardedUpsert("content_items", contentRows.slice(i, i + 200));
  }

  await deps.assertLease?.();
  const contentUuidRows = await supabaseRest(
    env,
    `content_items?content_profile_id=eq.${profileUuid}&select=id,airtable_record_id&limit=1000`,
  );
  const contentUuidByAirtableId = new Map(
    (contentUuidRows || []).map((row) => [row.airtable_record_id, row.id]),
  );

  // Same lean list as the field request above. Leave these rows unmarked.
  const outputRows = await applyStoredProjection(env, "platform_outputs", outputs.map((row) => mapAirtableOutputToSupabase(row, {
    profileUuid,
    contentUuidByAirtableId,
  })), "error_messages");
  const outputCron = await splitOutputCronSorRows(env, outputRows);
  for (const batch of [outputCron.fresh, outputCron.existing]) {
    for (let i = 0; i < batch.length; i += 200) {
      await guardedUpsert("platform_outputs", batch.slice(i, i + 200));
    }
  }

  // A Factory skip leaves the Airtable open pack, but an older Supabase row
  // can still say do_not_publish=false. Refresh those rows from Airtable so
  // Pipeline stops listing the duplicate.
  await deps.assertLease?.();
  const reconciledOutputs = await reconcileSupabaseDroppedOpenOutputs(env, {
    profileUuid,
    keptIds: outputsById,
    listRecords,
    outputFields,
    contentUuidByAirtableId,
  });

  const ideaRows = (ideas || []).map((row) => mapAirtableIdeaToSupabase(row, profileUuid));
  for (let i = 0; i < ideaRows.length; i += 200) {
    await guardedUpsert("idea_candidates", ideaRows.slice(i, i + 200));
  }

  return {
    ok: true,
    profile_id: profile.id,
    content_items: contentRows.length,
    platform_outputs: outputRows.length,
    reconciled_outputs: reconciledOutputs,
    newest_outputs: (newest || []).length,
    open_outputs: (openExtra || []).length,
    idea_candidates: ideaRows.length,
  };
}

/** Open Production Requests are cross-profile; sync once after profile packs. */
export async function syncOpenProductionRequestsToSupabase(env, deps = {}) {
  await deps.assertLease?.();
  const listRecords = deps.listRecords;
  if (!listRecords) throw new Error("syncOpenProductionRequestsToSupabase requires listRecords");
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured" };
  }
  const requestTableId = deps.requestTableId || deps.productionRequestTable || "Production Requests";
  const requestLimit = Math.max(20, Math.min(300, Number(deps.requestLimit) || 120));
  const filterFormula = deps.requestFilterFormula
    || 'AND({Test_Run_ID}=BLANK(),{Request_Status}!="Cancelled",OR({Request_Status}="Draft",{Request_Status}="Ready",{Request_Status}="Submitted",AND({Studio_Production_Job_JSON}!="",FIND(\'"step":"done"\',{Studio_Production_Job_JSON}&\'\')=0)))';
  const requests = await listRecords(env, requestTableId, {
    limit: requestLimit,
    sortField: "Updated_At",
    sortDirection: "desc",
    fields: [...PRODUCTION_REQUEST_SYNC_FIELDS],
    filterFormula,
  });
  const requestRows = await omitExistingPhase6CronRows(
    env,
    "production_requests",
    (requests || []).map((row) => mapAirtableProductionRequestToSupabase(row, null)),
  );
  for (let i = 0; i < requestRows.length; i += 200) {
    await deps.assertLease?.();
    const started = Date.now();
    const chunk = requestRows.slice(i, i + 200);
    await upsertChunk(env, "production_requests", chunk);
    deps.onUpsert?.("production_requests", chunk.length, Date.now() - started);
  }
  return { ok: true, production_requests: requestRows.length };
}

/**
 * Phase 6 half-hour media backfill: newest Media Assets → media_assets.
 * Airtable remains SoR; Drive remains the file store. Rows without Asset Name
 * cannot insert (NOT NULL) and are skipped. Never writes file bytes.
 */
export async function syncRecentMediaAssetsToSupabase(env, deps = {}) {
  await deps.assertLease?.();
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured", ok: true };
  }
  const mediaTableId = deps.mediaTableId
    || env.AIRTABLE_MEDIA_TABLE_ID
    || null;
  if (!mediaTableId) {
    return { skipped: true, reason: "media_table_not_configured", ok: true };
  }
  if (deps.mediaReconcile === true) {
    return syncMediaAssetReconcilePages(env, deps, mediaTableId);
  }
  const listRecords = deps.listRecords;
  if (!listRecords) throw new Error("syncRecentMediaAssetsToSupabase requires listRecords");
  const mediaLimit = Math.max(20, Math.min(800, Number(deps.mediaLimit) || 200));
  const filterFormula = deps.mediaFilterFormula || null;
  const records = await listRecords(env, mediaTableId, {
    limit: mediaLimit,
    sortField: deps.mediaSortField || "Added_At",
    sortDirection: deps.mediaSortDirection || "desc",
    fields: [...MEDIA_ASSET_SYNC_FIELDS],
    ...(filterFormula ? { filterFormula } : {}),
  });
  const namedMediaRows = (records || []).map((record) => mediaAssetBackfillRow(record)).filter(Boolean);
  const mediaRows = await omitExistingPhase6CronRows(env, "media_assets", namedMediaRows);
  for (let i = 0; i < mediaRows.length; i += 200) {
    await deps.assertLease?.();
    const started = Date.now();
    const chunk = mediaRows.slice(i, i + 200);
    await upsertChunk(env, "media_assets", chunk);
    deps.onUpsert?.("media_assets", chunk.length, Date.now() - started);
  }
  return {
    ok: true,
    media_assets: mediaRows.length,
    scanned: (records || []).length,
    skipped_unnamed: Math.max(0, (records || []).length - namedMediaRows.length),
  };
}

/**
 * One page-walk of Media Assets for the catalog reconcile. Inserts named rows
 * that Supabase does not already have. A Drive file id that is already stored,
 * or repeated on the same page, is skipped so the unique index cannot 409 the
 * walk. Does not overwrite an existing row and does not change the half-hour
 * newest-N copy. Airtable reads stay on.
 */
async function syncMediaAssetReconcilePages(env, deps, mediaTableId) {
  const listRecordsPage = deps.listRecordsPage;
  if (!listRecordsPage) throw new Error("syncMediaAssetReconcilePages requires listRecordsPage");
  const pages = Math.max(1, Math.min(8, Number(deps.mediaReconcilePages) || 8));
  let offset = String(deps.mediaOffset || "").trim() || null;
  let scanned = 0;
  let inserted = 0;
  let skippedUnnamed = 0;
  let skippedDuplicateDrive = 0;
  let done = false;
  for (let pageIndex = 0; pageIndex < pages; pageIndex += 1) {
    await deps.assertLease?.();
    const page = await listRecordsPage(env, mediaTableId, {
      limit: 100,
      sortField: "Added_At",
      sortDirection: "desc",
      fields: [...MEDIA_ASSET_SYNC_FIELDS],
      offset,
    });
    const records = Array.isArray(page?.records) ? page.records : [];
    scanned += records.length;
    const namedMediaRows = records.map((record) => mediaAssetBackfillRow(record)).filter(Boolean);
    skippedUnnamed += Math.max(0, records.length - namedMediaRows.length);
    const missingMediaRows = await omitExistingPhase6CronRows(env, "media_assets", namedMediaRows);
    const driveFilter = await omitRowsWithExistingDriveFile(env, missingMediaRows);
    skippedDuplicateDrive += driveFilter.skipped;
    const mediaRows = driveFilter.rows;
    for (let i = 0; i < mediaRows.length; i += 200) {
      await deps.assertLease?.();
      const started = Date.now();
      const chunk = mediaRows.slice(i, i + 200);
      await upsertChunk(env, "media_assets", chunk);
      deps.onUpsert?.("media_assets", chunk.length, Date.now() - started);
    }
    inserted += mediaRows.length;
    offset = page?.offset || null;
    if (!offset || !records.length) {
      done = true;
      offset = null;
      break;
    }
  }
  return {
    ok: true,
    mode: "reconcile",
    media_assets: inserted,
    scanned,
    skipped_unnamed: skippedUnnamed,
    skipped_duplicate_drive: skippedDuplicateDrive,
    offset,
    done,
  };
}

/**
 * Phase 6 half-hour queue backfill: open Studio Media Transfer Queue rows →
 * studio_media_transfer_queue. Linked media stays an Airtable id in payload so
 * a missing media_assets FK cannot fail. When Target_Production_Request_Outputs
 * is present, join rows are replaced in studio_media_transfer_targets.
 */
export async function syncRecentTransferQueueToSupabase(env, deps = {}) {
  await deps.assertLease?.();
  const listRecords = deps.listRecords;
  if (!listRecords) throw new Error("syncRecentTransferQueueToSupabase requires listRecords");
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured", ok: true };
  }
  const queueTableId = deps.queueTableId
    || env.AIRTABLE_MEDIA_TRANSFER_QUEUE_TABLE_ID
    || PHASE6_TRANSFER_QUEUE_TABLE_ID;
  const queueLimit = Math.max(20, Math.min(400, Number(deps.queueLimit) || 150));
  const filterFormula = deps.queueFilterFormula
    || 'AND({Test_Run_ID}=BLANK(),OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded",{Transfer_Status}="Processing",{Transfer_Status}="Ready",{Transfer_Status}="Error"))';
  const records = await listRecords(env, queueTableId, {
    limit: queueLimit,
    sortField: deps.queueSortField || "Transfer_ID",
    sortDirection: deps.queueSortDirection || "desc",
    fields: [...TRANSFER_QUEUE_SYNC_FIELDS],
    filterFormula,
  });
  const queueRows = await omitExistingPhase6CronRows(env, "studio_media_transfer_queue", (records || []).map((record) => {
    const body = transferQueueWriteThroughRow(record);
    if (!Object.keys(body).length) return null;
    return { airtable_record_id: record.id, ...body };
  }).filter(Boolean));
  for (let i = 0; i < queueRows.length; i += 200) {
    await deps.assertLease?.();
    const started = Date.now();
    const chunk = queueRows.slice(i, i + 200);
    await upsertChunk(env, "studio_media_transfer_queue", chunk);
    deps.onUpsert?.("studio_media_transfer_queue", chunk.length, Date.now() - started);
  }
  let targets = { skipped: true, reason: "target_field_absent", ok: true, linked: 0 };
  try {
    await deps.assertLease?.();
    targets = await syncTransferQueueTargetsToSupabase(env, records || []);
  } catch (error) {
    console.warn("studio_media_transfer_targets backfill failed", error);
    targets = { ok: false, error: error?.message || String(error), linked: 0 };
  }
  return {
    ok: true,
    studio_media_transfer_queue: queueRows.length,
    scanned: (records || []).length,
    studio_media_transfer_targets: targets,
  };
}

function projectionBagMarked(bag) {
  return isPlainObject(bag) && bag._runner_record_projection === RUNNER_RECORD_PROJECTION;
}

async function fetchAirtableRecordsByIds(env, tableId, ids, listRecords) {
  const unique = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  const out = [];
  for (let index = 0; index < unique.length; index += 20) {
    const batch = unique.slice(index, index + 20);
    const formula = `OR(${batch.map((id) => `RECORD_ID()="${id}"`).join(",")})`;
    // No fields filter — full Airtable bodies are required to stamp the marker.
    const rows = await listRecords(env, tableId, {
      limit: batch.length,
      filterFormula: formula,
    });
    out.push(...(rows || []));
  }
  return out;
}

/**
 * Phase 5 remainder: densify full-record markers for runner get/list reads.
 * Lean half-hour sync must not stamp markers. This bounded pass re-reads full
 * Airtable rows for unmarked open outputs / recent content and upserts with
 * fullRecord=true. Flags stay airtable until Joseph enables them.
 */
export async function backfillRunnerRecordProjections(env, deps = {}) {
  await deps.assertLease?.();
  const listRecords = deps.listRecords;
  if (!listRecords) throw new Error("backfillRunnerRecordProjections requires listRecords");
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured", ok: true };
  }
  const scanLimit = Math.max(20, Math.min(400, Number(deps.markerScanLimit) || 150));
  const backfillLimit = Math.max(5, Math.min(80, Number(deps.markerBackfillLimit) || 40));
  const outputTableId = deps.outputTableId || env.AIRTABLE_OUTPUT_TABLE_ID;
  const contentTableId = deps.contentTableId || env.AIRTABLE_CONTENT_TABLE_ID;
  if (!outputTableId || !contentTableId) {
    return { skipped: true, reason: "airtable_tables_not_configured", ok: true };
  }

  await deps.assertLease?.();
  const openOutputs = await supabaseRest(
    env,
    `platform_outputs?do_not_publish=eq.false&output_status=neq.Published&output_status=neq.Cancelled`
      + `&select=airtable_record_id,error_messages,content_item_id`
      + `&order=output_number.desc.nullslast&limit=${scanLimit}`,
  ).catch(() => []);
  const unmarkedOutputs = (openOutputs || [])
    .filter((row) => row?.airtable_record_id && !projectionBagMarked(row.error_messages))
    .slice(0, backfillLimit);

  await deps.assertLease?.();
  const recentContent = await supabaseRest(
    env,
    `content_items?select=airtable_record_id,extras,content_profile_id`
      + `&order=content_number.desc.nullslast&limit=${scanLimit}`,
  ).catch(() => []);
  const unmarkedContent = (recentContent || [])
    .filter((row) => row?.airtable_record_id && !projectionBagMarked(row.extras))
    .slice(0, backfillLimit);

  let outputsMarked = 0;
  let contentMarked = 0;
  let outputsUnresolved = 0;
  let contentUnresolved = 0;

  if (unmarkedOutputs.length) {
    await deps.assertLease?.();
    const airtableOutputs = await fetchAirtableRecordsByIds(
      env,
      outputTableId,
      unmarkedOutputs.map((row) => row.airtable_record_id),
      listRecords,
    );
    const contentAirtableIds = [...new Set(
      airtableOutputs.map((row) => firstLink(row?.fields?.Content_Item)).filter(Boolean),
    )];
    const contentUuidByAirtableId = new Map();
    for (let index = 0; index < contentAirtableIds.length; index += 50) {
      const batch = contentAirtableIds.slice(index, index + 50);
      const found = await supabaseRest(
        env,
        `content_items?airtable_record_id=in.(${batch.map((id) => encodeURIComponent(id)).join(",")})`
          + `&select=id,airtable_record_id&limit=50`,
      ).catch(() => []);
      for (const row of found || []) {
        if (row?.airtable_record_id && row?.id) contentUuidByAirtableId.set(row.airtable_record_id, row.id);
      }
    }
    const profileCache = new Map();
    const mapped = [];
    for (const record of airtableOutputs) {
      const profileAirtableId = firstLink(record?.fields?.Content_Profile);
      let profileUuid = profileAirtableId ? profileCache.get(profileAirtableId) : null;
      if (profileAirtableId && profileUuid === undefined) {
        profileUuid = await resolveSupabaseProfileId(env, profileAirtableId);
        profileCache.set(profileAirtableId, profileUuid || null);
      }
      if (!profileUuid) {
        outputsUnresolved += 1;
        continue;
      }
      const row = mapAirtableOutputToSupabase(record, {
        profileUuid,
        contentUuidByAirtableId,
        fullRecord: true,
      });
      if (!projectionBagMarked(row.error_messages)) {
        outputsUnresolved += 1;
        continue;
      }
      mapped.push(row);
    }
    for (let index = 0; index < mapped.length; index += 50) {
      await deps.assertLease?.();
      const started = Date.now();
      const chunk = mapped.slice(index, index + 50);
      await upsertChunk(env, "platform_outputs", chunk);
      deps.onUpsert?.("platform_outputs", chunk.length, Date.now() - started);
      outputsMarked += chunk.length;
    }
  }

  if (unmarkedContent.length) {
    await deps.assertLease?.();
    const airtableContent = await fetchAirtableRecordsByIds(
      env,
      contentTableId,
      unmarkedContent.map((row) => row.airtable_record_id),
      listRecords,
    );
    const profileCache = new Map();
    const mapped = [];
    for (const record of airtableContent) {
      const profileAirtableId = firstLink(record?.fields?.Content_Profile);
      let profileUuid = profileAirtableId ? profileCache.get(profileAirtableId) : null;
      if (profileAirtableId && profileUuid === undefined) {
        profileUuid = await resolveSupabaseProfileId(env, profileAirtableId);
        profileCache.set(profileAirtableId, profileUuid || null);
      }
      if (!profileUuid) {
        contentUnresolved += 1;
        continue;
      }
      const row = mapAirtableContentToSupabase(record, profileUuid, { fullRecord: true });
      if (!projectionBagMarked(row.extras)) {
        contentUnresolved += 1;
        continue;
      }
      mapped.push(row);
    }
    for (let index = 0; index < mapped.length; index += 50) {
      await deps.assertLease?.();
      const started = Date.now();
      const chunk = mapped.slice(index, index + 50);
      await upsertChunk(env, "content_items", chunk);
      deps.onUpsert?.("content_items", chunk.length, Date.now() - started);
      contentMarked += chunk.length;
    }
  }

  return {
    ok: true,
    platform_outputs_marked: outputsMarked,
    content_items_marked: contentMarked,
    platform_outputs_scanned: (openOutputs || []).length,
    content_items_scanned: (recentContent || []).length,
    platform_outputs_unresolved: outputsUnresolved,
    content_items_unresolved: contentUnresolved,
  };
}

export async function syncAllProfilesPipelineToSupabase(env, profiles, deps = {}) {
  const results = [];
  const assertLease = async () => {
    try { await deps.assertLease?.(); }
    catch (error) {
      if (error && typeof error === "object") error.phase5_sync_lease_lost = true;
      throw error;
    }
  };
  let abortedForCircuit = false;
  for (const profile of profiles || []) {
    if (!profile?.id) continue;
    if (deps.f && !deps.f(profile, "Active")) continue;
    if (supabaseCircuitOpen()) { abortedForCircuit = true; break; }
    try {
      await assertLease();
      results.push(await syncProfilePipelineToSupabase(env, profile, { ...deps, assertLease }));
    } catch (error) {
      results.push({ ok: false, profile_id: profile.id, error: error?.message || String(error) });
      if (supabaseCircuitOpen()) { abortedForCircuit = true; break; }
      // Lost lease is never a recoverable profile-local failure.
      if (error?.phase5_sync_lease_lost) throw error;
    }
  }
  let requests = null;
  let media = null;
  let queue = null;
  let runnerMarkers = null;
  const runPhaseBackfill = async (label, runner) => {
    try {
      await assertLease();
      return await runner();
    } catch (error) {
      const failed = { ok: false, error: error?.message || String(error) };
      if (/Phase 5 sync lost lease|renewal lost CAS/.test(String(error?.message || ""))) throw error;
      console.warn(`${label} backfill failed`, error);
      return failed;
    }
  };
  if (!abortedForCircuit && !supabaseCircuitOpen()) {
    requests = await runPhaseBackfill("production_requests", () => (
      syncOpenProductionRequestsToSupabase(env, { ...deps, assertLease })
    ));
    if (deps.skipMediaAssetsBackfill === true) {
      // Phase 6 write-through covers live media mutations; cron may defer the
      // newest-N catch-up to the top of the hour to cut Airtable RPS.
      media = { skipped: true, reason: "cron_catchup_deferred", ok: true };
    } else if (!supabaseCircuitOpen()) {
      media = await runPhaseBackfill("media_assets", () => (
        syncRecentMediaAssetsToSupabase(env, { ...deps, assertLease })
      ));
    } else {
      media = { skipped: true, reason: "supabase_circuit_open" };
    }
    if (deps.skipTransferQueueBackfill === true) {
      queue = { skipped: true, reason: "cron_catchup_deferred", ok: true };
    } else if (!supabaseCircuitOpen()) {
      queue = await runPhaseBackfill("studio_media_transfer_queue", () => (
        syncRecentTransferQueueToSupabase(env, { ...deps, assertLease })
      ));
    } else {
      queue = { skipped: true, reason: "supabase_circuit_open" };
    }
    if (!supabaseCircuitOpen()) {
      runnerMarkers = await runPhaseBackfill("runner_record_projections", () => (
        backfillRunnerRecordProjections(env, { ...deps, assertLease })
      ));
    } else {
      runnerMarkers = { skipped: true, reason: "supabase_circuit_open" };
    }
  } else {
    requests = { skipped: true, reason: "supabase_circuit_open" };
    media = { skipped: true, reason: "supabase_circuit_open" };
    queue = { skipped: true, reason: "supabase_circuit_open" };
    runnerMarkers = { skipped: true, reason: "supabase_circuit_open" };
  }
  // Auth mirror is best-effort until extras DDL is applied and tables proven.
  // A soft failure must not reopen half-hour partial after media/marker fixes.
  let authTables = null;
  if (!abortedForCircuit && !supabaseCircuitOpen()) {
    try {
      const { syncAuthTablesToSupabase } = await import("./supabase-auth-mirror.mjs");
      authTables = await runPhaseBackfill("auth_tables", () => (
        syncAuthTablesToSupabase(env, { ...deps, assertLease })
      ));
    } catch (error) {
      authTables = { ok: false, error: error?.message || String(error) };
    }
  } else {
    authTables = { skipped: true, reason: "supabase_circuit_open" };
  }
  let carouselSlides = null;
  let planSchedules = null;
  let renderHealColumns = null;
  let creativeMasters = null;
  let qualityRecovery = null;
  if (!abortedForCircuit && !supabaseCircuitOpen()) {
    carouselSlides = await runPhaseBackfill("carousel_slides", () => syncCarouselSlideCatalogToSupabase(env, deps));
    planSchedules = await runPhaseBackfill("plan_schedules", () => syncPlanScheduleCatalogToSupabase(env, deps));
    renderHealColumns = await runPhaseBackfill("render_heal_columns", () => syncRenderHealCatalogToSupabase(env, deps));
    creativeMasters = await runPhaseBackfill("creative_masters", () => syncCreativeMasterCatalogToSupabase(env, deps));
    qualityRecovery = await runPhaseBackfill("quality_recovery", () => syncQualityRecoveryCatalogToSupabase(env, deps));
  } else {
    carouselSlides = { skipped: true, reason: "supabase_circuit_open" };
    planSchedules = { skipped: true, reason: "supabase_circuit_open" };
    renderHealColumns = { skipped: true, reason: "supabase_circuit_open" };
    creativeMasters = { skipped: true, reason: "supabase_circuit_open" };
    qualityRecovery = { skipped: true, reason: "supabase_circuit_open" };
  }
  const phaseOk = (row) => row?.ok === true || row?.skipped === true;
  const ok = results.length > 0 && results.every((row) => row?.ok === true)
    && phaseOk(requests) && phaseOk(media) && phaseOk(queue) && phaseOk(runnerMarkers)
    && !abortedForCircuit && !supabaseCircuitOpen();
  return {
    ok,
    status: abortedForCircuit || supabaseCircuitOpen() ? "circuit_open"
      : ok ? "completed" : "partial",
    results,
    production_requests: requests,
    media_assets: media,
    studio_media_transfer_queue: queue,
    runner_record_projections: runnerMarkers,
    auth_tables: authTables,
    carousel_slides: carouselSlides,
    plan_schedules: planSchedules,
    render_heal_columns: renderHealColumns,
    creative_masters: creativeMasters,
    quality_recovery: qualityRecovery,
  };
}

/**
 * Write-through after an Airtable schedule (or similar) PATCH so Pipeline
 * schedule-grid reads do not snap the bubble back to a stale Supabase time.
 */
/**
 * Partial Output mutations must only write columns present on the Airtable
 * field patch. Upserting a lean map used to send scheduled_post_date=null /
 * publish_status=null for every dispatch stamp and wipe live schedule data.
 */
export function buildPresentOutputColumnPatch(record, {
  profileUuid = null,
  contentUuidByAirtableId = null,
} = {}) {
  const fields = record?.fields || {};
  const present = (key) => Object.prototype.hasOwnProperty.call(fields, key);
  const body = {};
  if (present("Output_ID")) body.output_number = fields.Output_ID ?? null;
  if (present("Platform")) body.platform = selectName(fields.Platform) || "Unknown";
  if (present("Format")) body.format = selectName(fields.Format);
  if (present("Platform_Output_Type")) body.platform_output_type = selectName(fields.Platform_Output_Type);
  if (present("Studio_Output_Type")) body.studio_output_type = selectName(fields.Studio_Output_Type);
  if (present("Aspect_Ratio")) body.aspect_ratio = selectName(fields.Aspect_Ratio);
  if (present("Output_Status")) body.output_status = selectName(fields.Output_Status);
  if (present("Render_Status")) body.render_status = selectName(fields.Render_Status);
  if (present("Review_Status")) body.review_status = selectName(fields.Review_Status);
  if (present("Publish_Status")) body.publish_status = selectName(fields.Publish_Status);
  if (present("Publish_Method")) body.publish_method = selectName(fields.Publish_Method);
  if (present("Do_Not_Publish")) body.do_not_publish = Boolean(fields.Do_Not_Publish);
  if (present("Test_Run_ID")) body.test_run_id = fields.Test_Run_ID || null;
  if (present("Output_Title")) body.output_title = fields.Output_Title || null;
  if (present("Output_Caption")) body.output_caption = fields.Output_Caption || null;
  if (present("Output_Hashtags")) body.output_hashtags = fields.Output_Hashtags || null;
  if (present("Thumbnail_URL")) body.thumbnail_url = fields.Thumbnail_URL || null;
  if (present("Final_File_URL")) body.final_file_url = fields.Final_File_URL || null;
  if (present("Publish_Asset_URL")) body.publish_asset_url = fields.Publish_Asset_URL || null;
  if (present("Studio_Preview_URL")) body.studio_preview_url = fields.Studio_Preview_URL || null;
  if (present("Platform_Post_URL")) body.platform_post_url = fields.Platform_Post_URL || null;
  if (present("Scheduled_Post_Date")) body.scheduled_post_date = fields.Scheduled_Post_Date || null;
  if (present("Studio_Scheduled_At")) body.studio_scheduled_at = fields.Studio_Scheduled_At || null;
  if (present("YouTube_Scheduled_Publish_At")) {
    body.youtube_scheduled_publish_at = fields.YouTube_Scheduled_Publish_At || null;
  }
  if (present("Published_At")) body.published_at = fields.Published_At || null;
  if (present("Remotion_Job_ID")) body.remotion_job_id = fields.Remotion_Job_ID || null;
  if (present("Selected_Clip_Count")) body.selected_clip_count = fields.Selected_Clip_Count ?? null;
  if (present("Publish_Next_Retry_At")) body.publish_next_retry_at = fields.Publish_Next_Retry_At || null;
  if (present("YouTube_Stage")) body.youtube_stage = selectName(fields.YouTube_Stage);
  if (present("TikTok_Draft_Status")) body.tiktok_draft_status = selectName(fields.TikTok_Draft_Status);
  if (present("Auto_Publish_Enabled")) body.auto_publish_enabled = Boolean(fields.Auto_Publish_Enabled);
  if (present("TikTok_Draft_Type")) body.tiktok_draft_type = selectName(fields.TikTok_Draft_Type);
  if (present("Asset_Aspect_Family")) body.asset_aspect_family = selectName(fields.Asset_Aspect_Family);
  if (present("Image_Count")) body.image_count = fields.Image_Count ?? null;
  if (present("Image_Output_Selected")) body.image_output_selected = Boolean(fields.Image_Output_Selected);
  if (present("FB_Publish_Status")) body.fb_publish_status = selectName(fields.FB_Publish_Status);
  if (present("FB_Image_Publish_Mode")) body.fb_image_publish_mode = selectName(fields.FB_Image_Publish_Mode);
  if (present("Studio_Effective_Voiceover_Mode")) {
    body.studio_effective_voiceover_mode = selectName(fields.Studio_Effective_Voiceover_Mode);
  }
  if (present("Studio_Effective_Background_Music_Mode")) {
    body.studio_effective_background_music_mode = selectName(fields.Studio_Effective_Background_Music_Mode);
  }
  if (present("Publish_Retry_Eligible")) body.publish_retry_eligible = Boolean(fields.Publish_Retry_Eligible);
  if (present("IG_Carousel_Status")) body.ig_carousel_status = selectName(fields.IG_Carousel_Status);
  if (present("IG_Carousel_Next_Retry_At")) {
    body.ig_carousel_next_retry_at = fields.IG_Carousel_Next_Retry_At || null;
  }
  if (present("IG_Carousel_Child_Count")) body.ig_carousel_child_count = fields.IG_Carousel_Child_Count ?? null;
  if (present("IG_Carousel_Children_Ready_Count")) {
    body.ig_carousel_children_ready_count = fields.IG_Carousel_Children_Ready_Count ?? null;
  }
  if (present("Assets_Ready_Count")) body.assets_ready_count = fields.Assets_Ready_Count ?? null;
  if (present("Asset_Set_Revision")) body.asset_set_revision = fields.Asset_Set_Revision || null;
  if (present("TikTok_9x16_Ready_Count")) body.tiktok_9x16_ready_count = fields.TikTok_9x16_Ready_Count ?? null;
  if (present("FB_Resolved_Publish_Mode")) {
    body.fb_resolved_publish_mode = selectName(fields.FB_Resolved_Publish_Mode);
  }
  if (present("Content_Profile") && profileUuid) body.content_profile_id = profileUuid;
  if (present("Content_Item") && contentUuidByAirtableId) {
    const contentAirtableId = firstLink(fields.Content_Item);
    const contentUuid = contentAirtableId ? contentUuidByAirtableId.get(contentAirtableId) : null;
    if (contentUuid) body.content_item_id = contentUuid;
  }
  return { body, bagPatch: packOutputListFields(fields) };
}

/**
 * True when the Airtable-shaped body carries densified list identity.
 * Factory approve / schedule under STUDIO_WRITE_SOURCE=supabase return the
 * archived PATCH body only (status + schedule). A fullRecord upsert of that
 * sparse body blanks output_number, platform, content_item_id, and media URLs
 * (proven NYC 2087/2088 on 2026-11-13).
 */
export function outputRecordHasDensifiedIdentity(record) {
  const fields = record?.fields || {};
  if (fields.Output_ID == null) return false;
  return Boolean(selectName(fields.Platform) || selectName(fields.Platform_Output_Type));
}

export async function syncAirtableOutputRowToSupabase(env, record, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };

  if (options.create === true) {
    const profileAirtableId = firstLink(record.fields?.Content_Profile);
    const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
    const contentAirtableId = firstLink(record.fields?.Content_Item);
    const contentUuidByAirtableId = new Map();
    if (contentAirtableId) {
      const contentRows = await supabaseRest(
        env,
        `content_items?airtable_record_id=eq.${encodeURIComponent(contentAirtableId)}&select=id,airtable_record_id&limit=1`,
      ).catch(() => []);
      if (Array.isArray(contentRows) && contentRows[0]?.id) {
        contentUuidByAirtableId.set(contentAirtableId, contentRows[0].id);
      }
    }
    const row = mapAirtableOutputToSupabase(record, {
      profileUuid: profileUuid || null,
      contentUuidByAirtableId,
      fullRecord: false,
    });
    row.updated_at = new Date().toISOString();
    await upsertChunk(env, "platform_outputs", [row]);
    await patchRenderHealColumns(env, record).catch((error) => {
      console.warn("render heal column copy failed", error);
    });
    return { ok: true, mode: "create" };
  }

  if (options.fullRecord === true && outputRecordHasDensifiedIdentity(record)) {
    const profileAirtableId = firstLink(record.fields?.Content_Profile);
    const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
    const contentAirtableId = firstLink(record.fields?.Content_Item);
    const contentUuidByAirtableId = new Map();
    if (contentAirtableId) {
      const contentRows = await supabaseRest(
        env,
        `content_items?airtable_record_id=eq.${encodeURIComponent(contentAirtableId)}&select=id,airtable_record_id&limit=1`,
      ).catch(() => []);
      if (Array.isArray(contentRows) && contentRows[0]?.id) {
        contentUuidByAirtableId.set(contentAirtableId, contentRows[0].id);
      }
    }
    let row = mapAirtableOutputToSupabase(record, {
      profileUuid,
      contentUuidByAirtableId,
      fullRecord: true,
    });
    row.updated_at = new Date().toISOString();
    await upsertChunk(env, "platform_outputs", [row]);
    await patchRenderHealColumns(env, record).catch((error) => {
      console.warn("render heal column copy failed", error);
    });
    return { ok: true, mode: "upsert" };
  }

  // Partial mutations (dispatch stamps, promote, caption backfill, and sparse
  // approve/schedule responses): PATCH only the columns present on the field
  // patch so densified identity and schedule/status stay intact.
  const profileAirtableId = firstLink(record.fields?.Content_Profile);
  const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
  const contentAirtableId = firstLink(record.fields?.Content_Item);
  const contentUuidByAirtableId = new Map();
  if (contentAirtableId) {
    const contentRows = await supabaseRest(
      env,
      `content_items?airtable_record_id=eq.${encodeURIComponent(contentAirtableId)}&select=id,airtable_record_id&limit=1`,
    ).catch(() => []);
    if (Array.isArray(contentRows) && contentRows[0]?.id) {
      contentUuidByAirtableId.set(contentAirtableId, contentRows[0].id);
    }
  }
  const { body, bagPatch } = buildPresentOutputColumnPatch(record, {
    profileUuid: profileUuid || null,
    contentUuidByAirtableId,
  });
  if (Object.keys(bagPatch).length) {
    const existing = await supabaseRest(
      env,
      `platform_outputs?airtable_record_id=eq.${encodeURIComponent(record.id)}&select=error_messages&limit=1`,
    ).catch(() => []);
    body.error_messages = retainProjectionKeys(existing?.[0]?.error_messages, bagPatch, { merge: true });
  }
  if (!Object.keys(body).length) return { skipped: true, reason: "no_present_fields" };
  body.updated_at = new Date().toISOString();
  await supabaseRest(
    env,
    `platform_outputs?airtable_record_id=eq.${encodeURIComponent(record.id)}`,
    {
      method: "PATCH",
      body,
      headers: { Prefer: "return=minimal" },
    },
  );
  await patchRenderHealColumns(env, record).catch((error) => {
    console.warn("render heal column copy failed", error);
  });
  return { ok: true, mode: "patch" };
}

/**
 * Write-through one Content Item. Airtable stays write SoR.
 * Without a resolved profile uuid, patch columns that are present on the
 * Airtable record so a partial body cannot blank content_profile_id.
 */
export async function syncAirtableContentRowToSupabase(env, record, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  if (options.create === true) {
    const fields = record.fields || {};
    const profileAirtableId = firstLink(fields.Content_Profile);
    const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
    const row = mapAirtableContentToSupabase(record, profileUuid || null, { fullRecord: false });
    await upsertChunk(env, "content_items", [row]);
    await mergeCreativeMasterExtras(env, [record]).catch((error) => {
      console.warn("creative master copy failed", error);
    });
    return { ok: true, mode: "create" };
  }
  const fields = record.fields || {};
  const profileAirtableId = firstLink(fields.Content_Profile);
  const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
  const canUpsert = Boolean(profileUuid) && (
    fields.Content_ID != null || fields.Content_Status != null || fields.Content_Title != null
  );
  if (canUpsert) {
    let row = mapAirtableContentToSupabase(record, profileUuid, { fullRecord: options.fullRecord === true });
    if (options.fullRecord !== true) {
      [row] = await applyStoredProjection(env, "content_items", [row], "extras");
    }
    await upsertChunk(env, "content_items", [row]);
    await mergeCreativeMasterExtras(env, [record]).catch((error) => {
      console.warn("creative master copy failed", error);
    });
    return { ok: true, mode: "upsert" };
  }

  const patch = {};
  if ("Content_ID" in fields) patch.content_number = fields.Content_ID ?? null;
  if ("Content_Title" in fields) patch.content_title = fields.Content_Title || null;
  if ("Content_Status" in fields) patch.content_status = selectName(fields.Content_Status);
  if ("Primary_Location" in fields) patch.primary_location = fields.Primary_Location || null;
  if ("Voiceover_Status" in fields) patch.voiceover_status = selectName(fields.Voiceover_Status);
  if ("Thumbnail_URL" in fields) patch.thumbnail_url = fields.Thumbnail_URL || null;
  if ("Created_At" in fields || record.createdTime) patch.created_at = fields.Created_At || record.createdTime || null;
  if ("Content_ID" in fields) {
    const [kept] = await applyStoredProjection(env, "content_items", [{
      airtable_record_id: record.id,
      extras: packContentExtras(fields),
    }], "extras");
    if (kept?.extras) patch.extras = kept.extras;
  }
  if (!Object.keys(patch).length) return { skipped: true, reason: "empty_patch" };
  await supabaseRest(
    env,
    `content_items?airtable_record_id=eq.${encodeURIComponent(record.id)}`,
    {
      method: "PATCH",
      body: patch,
      headers: { Prefer: "return=minimal" },
    },
  );
  await mergeCreativeMasterExtras(env, [record]).catch((error) => {
    console.warn("creative master copy failed", error);
  });
  return { ok: true, mode: "patch" };
}

/**
 * Phase 6 first slice: mirror one Production Request after Airtable commits.
 * Only columns present on the Airtable body are sent, so a partial response
 * cannot blank title, notes, or the production job. Identity for an insert
 * is Production_Request_ID plus Request_Status. Anything thinner patches an
 * existing row, or skips when there is nothing safe to write.
 */
function productionRequestWriteThroughRow(record) {
  const fields = record?.fields || {};
  const row = {};
  if ("Production_Request_ID" in fields && fields.Production_Request_ID != null) {
    row.production_request_id = String(fields.Production_Request_ID);
  }
  if ("Request_Status" in fields) {
    const rawStatus = selectName(fields.Request_Status) || "Draft";
    const allowedStatus = new Set(["Draft", "Ready", "Submitted", "Promoted", "Cancelled"]);
    row.request_status = allowedStatus.has(rawStatus) ? rawStatus : "Draft";
  }
  if ("Requested_Title" in fields) row.requested_title = fields.Requested_Title || null;
  if ("Production_Notes" in fields) row.production_notes = fields.Production_Notes || null;
  if ("Studio_Variant_Status" in fields) row.variant_status = selectName(fields.Studio_Variant_Status);
  if ("Studio_Output_Plan_Status" in fields) row.output_plan_status = selectName(fields.Studio_Output_Plan_Status);
  if ("Studio_Production_Job_JSON" in fields) {
    let productionJob = {};
    const rawJob = fields.Studio_Production_Job_JSON;
    if (typeof rawJob === "string" && rawJob.trim()) {
      try { productionJob = JSON.parse(rawJob); } catch { productionJob = { raw: rawJob.slice(0, 2000) }; }
    } else if (isPlainObject(rawJob)) {
      productionJob = rawJob;
    }
    row.production_job = productionJob;
  }
  return row;
}

export async function syncAirtableProductionRequestRowToSupabase(env, record, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const row = productionRequestWriteThroughRow(record);
  if (options.create === true) {
    if (row.production_request_id == null) row.production_request_id = record.id;
    if (row.request_status == null) row.request_status = "Draft";
  }
  if (!Object.keys(row).length) return { skipped: true, reason: "empty_patch" };
  const identity = row.production_request_id != null && row.request_status != null;
  if (options.create === true && !identity) return { ok: false, reason: "create_identity" };
  if (identity) {
    await upsertChunk(env, "production_requests", [{
      airtable_record_id: record.id,
      ...row,
    }]);
    return { ok: true, mode: "upsert" };
  }
  await supabaseRest(
    env,
    `production_requests?airtable_record_id=eq.${encodeURIComponent(record.id)}`,
    {
      method: "PATCH",
      body: row,
      headers: { Prefer: "return=minimal" },
    },
  );
  return { ok: true, mode: "patch" };
}

export async function studioSupabaseCommitPhase6First(env, tableId, records, options = {}) {
  if (!studioPhase6LegacyExportEnabled(env, tableId)) return { ok: false, reason: "disabled" };
  const kind = phase6TableKind(env, tableId);
  const rows = Array.isArray(records) ? records.filter((row) => row?.id && row?.fields) : [];
  if (!rows.length) return { ok: false, reason: "empty" };
  for (const record of rows) {
    const synced = kind === "request"
      ? await syncAirtableProductionRequestRowToSupabase(env, record, options)
      : kind === "media"
        ? await syncAirtableMediaAssetRowToSupabase(env, record, options)
        : await syncAirtableTransferQueueRowToSupabase(env, record, options);
    if (!synced?.ok) return { ok: false, reason: synced?.reason || "sync", id: record.id };
  }
  return { ok: true, kind, count: rows.length };
}

/**
 * Phase 6 media slice: mirror Media Asset metadata after Airtable commits.
 * Drive stays the file store. Only scalar metadata columns that are present
 * on the Airtable body are sent, and file bytes are never written. An insert
 * requires Asset Name because media_assets.asset_name is not null. A thinner
 * body patches an existing row.
 *
 * Library extras (rights, description, transfer id, added_at, profile,
 * classification, search) and studio CDN URLs densify into
 * media_assets.metadata so music + Asset Manager list reads can leave
 * Airtable without a DDL migration. google_drive_url still drops
 * media.chicagoshining.com values; the raw URL is kept under metadata.
 * Partial patches that omit library fields do not send metadata, so a
 * favorite-only PATCH cannot wipe densified keys.
 */
function mediaAssetWriteThroughRow(record) {
  const fields = record?.fields || {};
  const row = {};
  const text = (value) => {
    const trimmed = String(value || "").replace(/\u0000/g, "").trim();
    return trimmed || null;
  };
  if ("Asset Name" in fields) {
    const name = text(fields["Asset Name"]);
    if (name) row.asset_name = name;
  }
  if ("Media_Class" in fields) row.media_class = selectName(fields.Media_Class);
  if ("Asset_Role" in fields) row.asset_role = selectName(fields.Asset_Role);
  if ("Asset_Status" in fields) row.asset_status = selectName(fields.Asset_Status);
  if ("Active" in fields) row.active = Boolean(fields.Active);
  if ("Do_Not_Use" in fields) row.do_not_use = Boolean(fields.Do_Not_Use);
  if ("Studio_Favorite" in fields) row.studio_favorite = Boolean(fields.Studio_Favorite);
  if ("Google Drive File ID" in fields) {
    const driveId = text(fields["Google Drive File ID"]);
    if (driveId) row.google_drive_file_id = driveId;
  }
  if ("Google Drive URL" in fields) {
    const url = text(fields["Google Drive URL"]);
    if (url && !/^https:\/\/media\.chicagoshining\.com\//i.test(url)) row.google_drive_url = url;
  }
  if ("MIME_Type" in fields) {
    const mime = text(fields.MIME_Type);
    if (mime) row.mime_type = mime;
  }
  if ("File_Extension" in fields) {
    const extension = text(fields.File_Extension);
    if (extension) row.file_extension = extension;
  }
  if ("File_Size_Bytes" in fields && fields.File_Size_Bytes != null && fields.File_Size_Bytes !== "") {
    const size = Number(fields.File_Size_Bytes);
    if (Number.isFinite(size)) row.file_size_bytes = Math.trunc(size);
  }
  const meta = {};
  if ("Rights_Status" in fields) {
    meta.rights_status = selectName(fields.Rights_Status) || text(fields.Rights_Status);
  }
  if ("Asset_Description" in fields) {
    meta.asset_description = text(fields.Asset_Description);
  }
  if ("Studio_Transfer_ID" in fields) {
    meta.studio_transfer_id = text(fields.Studio_Transfer_ID);
  }
  if ("Added_At" in fields) {
    meta.added_at = text(fields.Added_At) || fields.Added_At || null;
  }
  if ("Google Drive URL" in fields) {
    const rawUrl = text(fields["Google Drive URL"]);
    if (rawUrl) meta.google_drive_url = rawUrl;
  }
  if ("Content_Profile" in fields) {
    meta.content_profile_airtable_id = firstLink(fields.Content_Profile);
  }
  if ("Classification_Status" in fields) {
    meta.classification_status = selectName(fields.Classification_Status)
      || text(fields.Classification_Status);
  }
  if ("Manual_Classification_JSON" in fields) {
    const raw = fields.Manual_Classification_JSON;
    if (raw == null || raw === "") meta.manual_classification_json = null;
    else if (typeof raw === "string") meta.manual_classification_json = stripNullBytesDeep(raw);
    else if (isPlainObject(raw)) meta.manual_classification_json = stripNullBytesDeep(raw);
    else meta.manual_classification_json = stripNullBytesDeep(String(raw));
  }
  if ("Manual_Classification_Audit" in fields) {
    const raw = fields.Manual_Classification_Audit;
    if (raw == null || raw === "") meta.manual_classification_audit = null;
    else if (typeof raw === "string") meta.manual_classification_audit = stripNullBytesDeep(raw);
    else if (Array.isArray(raw)) meta.manual_classification_audit = stripNullBytesDeep(raw);
    else meta.manual_classification_audit = stripNullBytesDeep(String(raw));
  }
  if ("Search_Keywords" in fields) meta.search_keywords = text(fields.Search_Keywords);
  if ("AI_Tags" in fields) meta.ai_tags = text(fields.AI_Tags);
  if ("Location" in fields) meta.location = text(fields.Location);
  if ("Topic" in fields) meta.topic = text(fields.Topic);
  if ("Subtopic" in fields) meta.subtopic = text(fields.Subtopic);
  if ("Shot_Type" in fields) meta.shot_type = text(fields.Shot_Type);
  if ("Time_Of_Day" in fields) meta.time_of_day = text(fields.Time_Of_Day);
  if ("Weather" in fields) meta.weather = text(fields.Weather);
  if ("Visible_Subjects" in fields) meta.visible_subjects = text(fields.Visible_Subjects);
  if ("Duration_Seconds" in fields && fields.Duration_Seconds != null && fields.Duration_Seconds !== "") {
    const duration = Number(fields.Duration_Seconds);
    if (Number.isFinite(duration)) meta.duration_seconds = duration;
  }
  if ("Intake_Date" in fields) {
    meta.intake_date = text(fields.Intake_Date) || fields.Intake_Date || null;
  }
  if (Object.keys(meta).length) row.metadata = meta;
  return row;
}

/**
 * Full media upsert body for half-hour backfill. Sparse write-through patches
 * omit booleans; homogenizeUpsertRows would pad those as null and trip
 * Postgres 23502 on NOT NULL do_not_use / studio_favorite / active. Always
 * emit the same key set with schema-safe defaults.
 */
export function mediaAssetBackfillRow(record) {
  const body = mediaAssetWriteThroughRow(record);
  if (!body.asset_name) return null;
  const fields = record?.fields || {};
  const text = (value) => {
    const trimmed = String(value || "").replace(/\u0000/g, "").trim();
    return trimmed || null;
  };
  // Half-hour / oneshot backfill always stamps Asset Manager densify keys.
  // Airtable omits blank fields from `fields[]` responses; without explicit
  // nulls those keys stay absent and coverage metrics never move past the
  // newest classified slice.
  const meta = { ...(body.metadata || {}) };
  meta.content_profile_airtable_id = firstLink(fields.Content_Profile) || null;
  meta.classification_status = selectName(fields.Classification_Status)
    || text(fields.Classification_Status);
  if ("Manual_Classification_JSON" in fields) {
    const raw = fields.Manual_Classification_JSON;
    if (raw == null || raw === "") meta.manual_classification_json = null;
    else if (typeof raw === "string") meta.manual_classification_json = stripNullBytesDeep(raw);
    else if (isPlainObject(raw)) meta.manual_classification_json = stripNullBytesDeep(raw);
    else meta.manual_classification_json = stripNullBytesDeep(String(raw));
  } else {
    meta.manual_classification_json = null;
  }
  if ("Manual_Classification_Audit" in fields) {
    const raw = fields.Manual_Classification_Audit;
    if (raw == null || raw === "") meta.manual_classification_audit = null;
    else if (typeof raw === "string") meta.manual_classification_audit = stripNullBytesDeep(raw);
    else if (Array.isArray(raw)) meta.manual_classification_audit = stripNullBytesDeep(raw);
    else meta.manual_classification_audit = stripNullBytesDeep(String(raw));
  } else {
    meta.manual_classification_audit = null;
  }
  meta.search_keywords = text(fields.Search_Keywords);
  meta.ai_tags = text(fields.AI_Tags);
  meta.location = text(fields.Location);
  meta.topic = text(fields.Topic);
  meta.subtopic = text(fields.Subtopic);
  meta.shot_type = text(fields.Shot_Type);
  meta.time_of_day = text(fields.Time_Of_Day);
  meta.weather = text(fields.Weather);
  meta.visible_subjects = text(fields.Visible_Subjects);
  if (fields.Duration_Seconds != null && fields.Duration_Seconds !== "") {
    const duration = Number(fields.Duration_Seconds);
    meta.duration_seconds = Number.isFinite(duration) ? duration : null;
  } else {
    meta.duration_seconds = null;
  }
  meta.intake_date = text(fields.Intake_Date) || fields.Intake_Date || null;
  return {
    airtable_record_id: record.id,
    asset_name: body.asset_name,
    media_class: body.media_class ?? null,
    asset_role: body.asset_role ?? null,
    asset_status: body.asset_status ?? null,
    active: body.active ?? true,
    do_not_use: body.do_not_use ?? false,
    studio_favorite: body.studio_favorite ?? false,
    google_drive_file_id: body.google_drive_file_id ?? null,
    google_drive_url: body.google_drive_url ?? null,
    mime_type: body.mime_type ?? null,
    file_extension: body.file_extension ?? null,
    file_size_bytes: body.file_size_bytes ?? null,
    metadata: meta,
  };
}

async function mergeMediaAssetMetadata(env, recordId, patchMeta) {
  if (!patchMeta || typeof patchMeta !== "object" || !Object.keys(patchMeta).length) return null;
  const existing = await supabaseRest(
    env,
    `media_assets?airtable_record_id=eq.${encodeURIComponent(recordId)}&select=metadata&limit=1`,
  ).catch(() => []);
  const prior = isPlainObject(existing?.[0]?.metadata) ? existing[0].metadata : {};
  return { ...prior, ...patchMeta };
}

export async function syncAirtableMediaAssetRowToSupabase(env, record, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const row = mediaAssetWriteThroughRow(record);
  if (options.create === true && !row.asset_name) {
    row.asset_name = `Untitled ${record.id}`;
    if (row.active == null) row.active = true;
    if (row.do_not_use == null) row.do_not_use = false;
    if (row.studio_favorite == null) row.studio_favorite = false;
  }
  if (!Object.keys(row).length) return { skipped: true, reason: "empty_patch" };
  if (options.create === true && !row.asset_name) return { ok: false, reason: "create_identity" };
  if (row.metadata) {
    row.metadata = await mergeMediaAssetMetadata(env, record.id, row.metadata) || row.metadata;
  }
  if (row.asset_name) {
    await upsertChunk(env, "media_assets", [{
      airtable_record_id: record.id,
      ...row,
    }]);
    return { ok: true, mode: "upsert" };
  }
  await supabaseRest(
    env,
    `media_assets?airtable_record_id=eq.${encodeURIComponent(record.id)}`,
    {
      method: "PATCH",
      body: row,
      headers: { Prefer: "return=minimal" },
    },
  );
  return { ok: true, mode: "patch" };
}

function transferQueueLinkId(value) {
  const item = Array.isArray(value) ? value[0] : value;
  if (item && typeof item === "object") {
    const id = String(item.id || "").trim();
    return id.startsWith("rec") ? id : null;
  }
  const text = String(item || "").trim();
  return text.startsWith("rec") ? text : null;
}

function transferQueueLinkIds(value) {
  const items = Array.isArray(value) ? value : (value == null || value === "" ? [] : [value]);
  const ids = [];
  for (const item of items) {
    const id = transferQueueLinkId(item);
    if (id && !ids.includes(id)) ids.push(id);
  }
  return ids;
}

function chunkAirtableIds(ids, size = 40) {
  const out = [];
  for (let index = 0; index < ids.length; index += size) out.push(ids.slice(index, index + size));
  return out;
}

function transferQueueText(value) {
  const text = String(value || "").trim();
  return text || null;
}

/**
 * Phase 6 queue slice: mirror one Studio Media Transfer Queue row after
 * Airtable commits. Scalar status and a Drive file id only. Source URLs,
 * R2 keys, and file bytes are omitted. Linked media stays an Airtable id in
 * payload so a missing media_assets row cannot fail the foreign key.
 */
function transferQueueWriteThroughRow(record) {
  const fields = record?.fields || {};
  const row = {};
  if ("Transfer_Status" in fields) row.status = selectName(fields.Transfer_Status);
  if ("Error_Message" in fields) row.error_message = transferQueueText(fields.Error_Message);
  if ("Preview_Error" in fields) row.preview_error = transferQueueText(fields.Preview_Error);
  if ("Attempt_Count" in fields && fields.Attempt_Count != null && fields.Attempt_Count !== "") {
    const attempts = Number(fields.Attempt_Count);
    if (Number.isFinite(attempts)) row.attempt_count = Math.trunc(attempts);
  }
  if ("Last_Attempt_At" in fields) {
    const stamp = transferQueueText(fields.Last_Attempt_At);
    if (stamp) row.last_attempt_at = stamp;
  }
  const payload = {};
  const copy = (key, column, value) => {
    if (!(key in fields) || !value) return;
    payload[column] = value;
  };
  copy("Transfer_ID", "transfer_id", transferQueueText(fields.Transfer_ID));
  copy("Production_Request_Record_ID", "production_request_record_id", transferQueueText(fields.Production_Request_Record_ID));
  copy("Asset_Kind", "asset_kind", transferQueueText(fields.Asset_Kind));
  copy("Source_Asset_ID", "source_asset_id", transferQueueText(fields.Source_Asset_ID));
  copy("Source_Name", "source_name", transferQueueText(fields.Source_Name));
  copy("Source_Drive_File_ID", "source_drive_file_id", transferQueueText(fields.Source_Drive_File_ID));
  copy("Source_Media_Asset", "source_media_asset_id", transferQueueLinkId(fields.Source_Media_Asset));
  copy("Generated_Media_Asset", "generated_media_asset_id", transferQueueLinkId(fields.Generated_Media_Asset));
  copy("Aspect_Ratio", "aspect_ratio", transferQueueText(fields.Aspect_Ratio));
  copy("Preview_Status", "preview_status", transferQueueText(selectName(fields.Preview_Status) || fields.Preview_Status));
  copy("Test_Run_ID", "test_run_id", transferQueueText(fields.Test_Run_ID));
  if ("Target_Production_Request_Outputs" in fields) {
    payload.target_production_request_output_ids = transferQueueLinkIds(fields.Target_Production_Request_Outputs);
  }
  if (Object.keys(payload).length) row.payload = payload;
  return row;
}

/**
 * Replace studio_media_transfer_targets for queue rows that include
 * Target_Production_Request_Outputs. Airtable ids stay in the queue payload.
 * production_request_outputs rows are inserted only as airtable_record_id
 * anchors so the join FK can resolve. This is not a Production Request
 * Output read cutover. A missing target field does not clear existing links.
 */
export async function syncTransferQueueTargetsToSupabase(env, records) {
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured", ok: true, linked: 0 };
  }
  const wanted = [];
  for (const record of records || []) {
    if (!record?.id || !record.fields || !("Target_Production_Request_Outputs" in record.fields)) continue;
    wanted.push({
      airtable_record_id: record.id,
      output_ids: transferQueueLinkIds(record.fields.Target_Production_Request_Outputs),
    });
  }
  if (!wanted.length) return { skipped: true, reason: "target_field_absent", ok: true, linked: 0 };

  const outputIds = [...new Set(wanted.flatMap((row) => row.output_ids))];
  for (const batch of chunkAirtableIds(outputIds)) {
    await upsertChunk(env, "production_request_outputs", batch.map((id) => ({ airtable_record_id: id })));
  }

  const queueUuid = new Map();
  for (const batch of chunkAirtableIds(wanted.map((row) => row.airtable_record_id))) {
    const rows = await supabaseRest(
      env,
      `studio_media_transfer_queue?airtable_record_id=in.(${batch.join(",")})&select=id,airtable_record_id`,
    );
    for (const row of rows || []) {
      if (row?.airtable_record_id && row?.id) queueUuid.set(row.airtable_record_id, row.id);
    }
  }
  const outputUuid = new Map();
  for (const batch of chunkAirtableIds(outputIds)) {
    const rows = await supabaseRest(
      env,
      `production_request_outputs?airtable_record_id=in.(${batch.join(",")})&select=id,airtable_record_id`,
    );
    for (const row of rows || []) {
      if (row?.airtable_record_id && row?.id) outputUuid.set(row.airtable_record_id, row.id);
    }
  }

  const inserts = [];
  const transferIds = [];
  let unresolved = 0;
  for (const row of wanted) {
    const transferId = queueUuid.get(row.airtable_record_id);
    if (!transferId) {
      unresolved += row.output_ids.length;
      continue;
    }
    transferIds.push(transferId);
    for (const outputId of row.output_ids) {
      const uuid = outputUuid.get(outputId);
      if (!uuid) {
        unresolved += 1;
        continue;
      }
      inserts.push({ transfer_id: transferId, production_request_output_id: uuid });
    }
  }
  for (const batch of chunkAirtableIds(transferIds)) {
    await supabaseRest(env, `studio_media_transfer_targets?transfer_id=in.(${batch.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
  }
  for (let index = 0; index < inserts.length; index += 200) {
    await supabaseRest(
      env,
      "studio_media_transfer_targets?on_conflict=transfer_id,production_request_output_id",
      {
        method: "POST",
        body: inserts.slice(index, index + 200),
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      },
    );
  }
  return {
    ok: true,
    linked: inserts.length,
    unresolved,
    queue_rows: transferIds.length,
    output_anchors: outputIds.length,
  };
}

export async function syncAirtableTransferQueueRowToSupabase(env, record, options = {}) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const row = transferQueueWriteThroughRow(record);
  if (!Object.keys(row).length && options.create === true) row.status = "Pending";
  if (!Object.keys(row).length) {
    return options.create === true
      ? { ok: false, reason: "create_identity" }
      : { skipped: true, reason: "empty_patch" };
  }
  await upsertChunk(env, "studio_media_transfer_queue", [{
    airtable_record_id: record.id,
    ...row,
  }]);
  let targets = { skipped: true, reason: "target_field_absent", ok: true, linked: 0 };
  if (record.fields && "Target_Production_Request_Outputs" in record.fields) {
    try {
      targets = await syncTransferQueueTargetsToSupabase(env, [record]);
    } catch (error) {
      console.warn("studio_media_transfer_targets write-through failed", error);
      targets = { ok: false, error: error?.message || String(error), linked: 0 };
    }
  }
  return { ok: true, mode: "upsert", studio_media_transfer_targets: targets };
}

export function studioSideEffectOutboxMissing(error) {
  const text = String(error?.message || error || "");
  return /PGRST205|schema cache|does not exist|Could not find the table|404/.test(text);
}

/**
 * Best-effort side-effect outbox. Missing table is a skip until
 * docs/supabase-migration/phase5/003_side_effect_outbox.sql is applied.
 * Make does not consume this table in Phase 5.
 */
export async function enqueueStudioSideEffectOutbox(env, entry) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  const row = {
    airtable_table: String(entry?.airtable_table || ""),
    airtable_record_id: String(entry?.airtable_record_id || ""),
    mutation: String(entry?.mutation || "PATCH"),
    payload: entry?.payload && typeof entry.payload === "object" && !Array.isArray(entry.payload) ? entry.payload : {},
    status: "pending",
  };
  if (!row.airtable_record_id || !row.airtable_table) return { skipped: true, reason: "missing_record" };
  try {
    await supabaseRest(env, "studio_side_effect_outbox", {
      method: "POST",
      body: [row],
      headers: { Prefer: "return=minimal" },
    });
    return { ok: true };
  } catch (error) {
    if (studioSideEffectOutboxMissing(error)) return { skipped: true, reason: "outbox_table_missing" };
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// These content packages were deleted from Airtable. Supabase and the Pipeline
// R2 snapshot are read copies and do not drop a row just because Airtable did.
const DELETED_DUPLICATE_OUTPUT_IDS = [
  // Output 7894 deleted at user request; guard against a stale Supabase mirror row.
  "recAlU4bLFmWDBV4H",
  "recKihcIDRMvDub6c", "recXBDHnArAuMgUj1", "recLFFt4f8qff6BOX", "recgOAq8BEp2CKIdo", "recfluZUndAj5r1ba", "recfTLNJNxKnFVU7z",
  "recCK6MIgH5kx1KmE", "recVjxZ2wGT4ifTjf", "recfmUJxEawPLQBu8", "recQqRR2KSvQSJp4X", "reczThEQbfzBozo55", "recf8NpYdYRk2EQ6U",
  "recGZ604BJTbnnJkJ", "recLKy5NHNghaH8G0", "recaIvISU0njbjH0G", "recTi10DHWXL0KK4K", "recTfwH2D15rub7LG", "recsxyG5HgyKL9S6W",
  "rec38nhz4IGlokqgr", "recfgWqYNzwGvMjlm", "reco5BavmXllNDc5G", "recBU6dwAYmuxZpf7", "recKxDSxjcZKoyvEs", "rec6FWq1NW3aa9XpM",
  "recoKSLhTyIaPgymu", "recblcyAdbtlcWBBK", "rec4F5CmSiDOIp02Y", "recgaHRga6qY4cCRt", "rechZDpxCQDbP9KWC", "rec1Zd8rtNgz72Cxy",
  "recQjraGKDD6iNWAY", "rech2slvGcpkmJWUq", "recnPx7lXDhAcJTLT", "recMqtyHSq8MBY2rL", "recU35gRmvlaQGlya", "recv1NsDvvmJNXanC",
  "recYZNbabMilub5mF", "rec49sX2QgBdPqTNN", "rec3IPjG8LeSpJexp", "recXMcA1m4KrOmhfZ", "recj6zWOkdfRfDW4v", "recWmOYCFFbOHKcco",
  "recs511XeOM4AcOkX", "recNw5kxIJxyiGuTy", "rec9cJlKkRzDzkTZS", "recBdfzeRqVXdbIzN", "recbXWqwPEsbMXdjf", "recCtBWHqkywb7jWy",
  "rec3MR1yuUY6MkWcs", "recENnnUz0wdr2xN4", "recTfKL4GT8ZCfOgn", "rec5P4mpBfTM5vicf", "recLfQxAhgYcsmtRe", "reczAWhOErFDU8A5z",
  "recaQo4mJ1ZCsesDj", "rec10FJKKG2Zzz8iN", "recpD2wqojtWOPa2Y", "recffWZOkKQP91f0u", "recPBXJpmUUKjzqvO", "recqaN5dEzyQEno9m",
  "recHLNWWMarl0u2BE", "rec2mU4eSSypZAnsV", "recY3QsmnSYezBPxH", "recJiGlKcumTvm9uG", "recZrxFhdEuN8mgLU", "rec502RSbeQGBtBPI",
  "recGtFBjyF7yGXXrd", "recNrBf54dVemYfEj", "recMIH1XBqEPL3iTR", "recpblnf7VYM1OQ25", "recLyIydV9HkO9LYP", "rec7eL4u62wGjdI9k",
  "rec0TokEpExRcnvcA", "recLKQRVuITI13OPt", "recEeJ8CYGe0uBaOu", "recd07qHdkVpOxjYr", "recNGunJFbREuaoRJ", "reca4whOS5rVhd4t0",
  "rec0hhRd7jsYLVMFT", "recMc8Lh8odcvG1th", "recgRWUUaPJqBJz3M", "recEXQlONTKvLG438", "recn9bEbGoa3lGOla", "recWXNzsHRtqXcVfN",
  "recThBCU5DnHYH4EQ", "recygfR2IqOGCgo2F", "recUbntStNGvMLRwr", "recCjFAMbzLT03fN3", "recD5m6vVRAnfq6Wl", "recOvurro1uWO9PCC",
  "receeJ0E7i4O0JLcG", "recPiqhyUX4u2f8e5", "reci7aw84vQJNNWf2", "rec05PcImD9XwJuhf", "recttuDyMneLjJTHw", "recc7eTwCDsi2cb0q",
  "recegh4Skwh82IZ5Q", "recNyBF01kNzQT6YV", "rec7zBWrCK8TJ7a6G", "rec7fvzhK4azluKKA", "rec2d4w9Bs4qWHrqu", "reczJ977PPBdkTTyS",
  "rece24QtlCVAZucph", "recGJxsARwydzNHGL", "recJ7ybnGwLw4uWMM", "recXXAWpKYSOhXb8w", "recCIJa3NVr7DliZZ", "recpkedudmK2f7lJi",
  "rec7tJ2UVjzqHZ8sX", "recXaKSDuTNQHSvHF", "recbq1ucGXpEhaYMv", "rec7SkuTENxKdzLjk", "recj3y7TFMDYEOyV2", "recq6WwoFBaS703Jp",
  "rec9rL5BVO0N9IT01", "reccGeXy6qunpZ0dx", "recqVYNzvuDyy6eNr", "recoVRK2lK1VhNMFR", "recYElI6zGotwna6z", "rec5Z7ZRXmyn4O6h5",
  "recw7zSbvzvWpgN1V", "recsZ38sjjpxHERQt", "recSjRuhW3L0GTdd0", "recy2EtMwXcOD0AGU", "recc5318zoKnuVIDu", "rec8RbO6ptabFYGng",
  "recC3H5KZ9ipUfZJd", "recQr6mdfZmtRkUuh", "rec9d8Bj6Cg5arJ1q", "rec0IkdI7ZRmQIF7A", "rece7feNgP39EIqc0", "recFOfstRH88Vex8k",
  "recjvxhoTntTTsyBB", "rechn6oOS4x3dmuJb", "recsx6ceZVl4Oph7y", "recaZTyH4q3dMJQZL", "recIFVqMfnhwRC971", "recJLgxoyuLhGMNts",
  "recRIifAZDo73JHSJ", "recCkgdE7v0e3DGEY", "rec02cZa1vdtsjyac", "recP6EKAM5tQbmASO", "recCVJCM8yv7hvVfM", "recN0qsp86NggNTB9",
  "recvhGcUBQG04wXDS", "recIkLN9VXqvSeq2c", "recmHEqlRjCLHyjDr", "recloF1hrOMk5NwQF", "reczqwCAjkiwZ6Pa0", "recY4cB5qbhTEet2T",
  "rec7W2qFv50xntIZU", "recsBjIxp6zpEEhJh", "rec4IHcIxpJGOPmRn", "recAWsNvVig3LJRLf", "reco5xB3UyBhM3K9D", "rec1LwVaXRXRQsOdm",
  "recjUGopyS1BUipTz", "recO1zTACvJCOjpKd", "recyw7ptCodFdcINK", "recpOIDZX9zQ0C2CG", "recp1vLQA11vFqFBG", "recTcRaCLQUkBIEIM",
  "recHfsfK92u5oSiIt", "recE0EEclVF0H77pw", "recbOSlA7PdeRj4e4", "recx7sQCI6lNJBB6S", "recqI68i7D0x3iZ1o", "recEg4AriB8x9FRIO",
  "recoMgriu7rn2pHj7", "recex6i9WzOC13Wti", "rec9t91ZqbxJLxiCF", "recot50yrLl0VoETV", "recWA4cpIbqr2WSzE", "rec1UCKk1Huz788pn",
  "recHV33S4TvBOm8hD", "recbBvtb61NsmYGES", "recOUArffBQOaAfpt", "rec5azEFIRtCv0K8l", "rec4ulP5DfYM6K8MB", "recaFIU9BfcsYb1a3",
  "recb619ve9eyLpr9Y", "reco3wurWPUbKAETL", "recrA2FCy2OEJl5bT", "recG27kdXGFz6dS3f", "recr4MHDxWaoLtjgi", "recCEhemMEzksqhxW",
  "recBNzLsc7JIEoGYk", "recxwWwe5GzRDcf3G", "rec8HS8rOJ6JNFwdh", "recF7sQ6TaLLy5v9Q", "recZyw5WZAeJ9Zfjq", "recWsWcQBIV8C3r2a",
  // NYC Content 2094 Battery Park View Guide — Airtable-deleted In Production twins
  // that blocked Factory Approve all (6 ready · 6 sibling awaiting).
  "recUk2dHAy46NC1m1", "recvEyf19YgvnnYLK", "recMRltdcjj1EPYVP",
  "recUeWwgha0wxtAqJ", "rec2iCOn0znlnw7Au", "reccNV0YE7k3ntvmU",
];
const DELETED_DUPLICATE_CONTENT_IDS = [
  "recWNbnAIsxpYNbkJ", "recM7FoAUXSUp5x8I", "recBjFgzASl88oxdS", "recyMKQJ8p53i1HOq", "recsgloGPGs0WWkNw",
  "recFXZY3CThReGs3q", "recRds0IM5AzMDcEh", "recSTJQC2MirB2j4h", "recjNXj1zlrbvUde4", "recHyP32DgUw2ADl0",
  "recxihGa49aULvnHG", "recMovkEWUeuKp0I8", "recIEmc6CVFC07rmy", "rec5KFrURWqPLA2Kr", "reczLbQK2U0fnOLJE",
  "recAY7qGbcXhmNMQG", "recqyV2N4f5llyO1h", "recQnXWApQeeY1IEy", "recHuqjToObxqKjlC", "reccQlAWWv7uMPTQT",
  "recbCRMWwXMlKEsum", "recTTReixJg9PG7qO", "rec9X2UOtiK9y0l2f", "rec0zN4MJ95HwFKM4", "recaUrPzLg8LNfal9",
  "recsdn9wUgcDzVvyc", "recFi1QQAP1TfE74W", "rec1XDW5Htm5R0glB", "recubBNz3jUYyHW5Z", "reclrB6fQVj9ComL9",
  "recL37ltFLwTKkYOD", "rec257Yyc9gPRM7fg"
];
const DELETED_DUPLICATE_REQUEST_IDS = [
  "recNCfAJB3dcNDIsz", "reczwn80zAwOsHUJ2", "recU74F9geoinOC16", "recQUS78jC1jNvlbv", "recnKInuP4CeV3VIh",
  "recugssggS2Zl4pwO", "reck4k0RS3PeXboFR", "recXyBDBS8SHurdi7", "rec5VJBUpT0MwWHLT", "recT5KhNgKWE2PwAW",
];
const DELETED_DUPLICATE_IDEA_IDS = [
  "rec3MEcGx2f57CMjf", "recPxlSeI2GTSqQKN", "rectCnhidhH8Cpgxy", "recrJBlA3riWLsU4p", "recZ4YHN22cxgfbjq",
  "recADH46vGkP4wmF0", "recUse7oQCD9RZ5Vf", "recEnznMatnL5Ucot", "recKNaLQpFwMeDjsk", "recG1wQIPE9hJDevc",
];
const DELETED_DUPLICATE_PROFILE_IDS = [
  "recF7UAn0LkMZZrWZ",
  "recpNlNn6U6eq0M9r",
  // NYC — DUMBO Pebble Beach Sunset (content 2051) orphan mirror rows 10236/10238/10240.
  "recgtK8Z7eNADNtVy",
];
// Ghost Platform Outputs that no longer exist in Airtable. Strip/purge by Output_ID
// when the Airtable record id is unknown (Supabase MCP unavailable).
const DELETED_DUPLICATE_OUTPUT_NUMBERS = [
  10236, 10238, 10240,
  // Content 2094 Battery Park View Guide mirror ghosts (10409/11/13/17/19/21).
  10409, 10411, 10413, 10417, 10419, 10421,
];
const deletedDuplicateOutputIdSet = new Set(DELETED_DUPLICATE_OUTPUT_IDS);
const deletedDuplicateContentIdSet = new Set(DELETED_DUPLICATE_CONTENT_IDS);
const deletedDuplicateOutputNumberSet = new Set(
  DELETED_DUPLICATE_OUTPUT_NUMBERS.map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0),
);

function firstLinkedId(value) {
  return Array.isArray(value) && value.length ? String(value[0] || "") : "";
}

function recordOutputNumber(row) {
  const raw = row?.output_number ?? row?.output_id ?? row?.fields?.Output_ID ?? null;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

function recordContentId(row) {
  return String(
    row?.content_item_id
    || row?.content_item_airtable_id
    || firstLinkedId(row?.content_item_links)
    || firstLinkedId(row?.fields?.Content_Item)
    || "",
  );
}

function recordPlatform(row) {
  return String(row?.platform || row?.fields?.Platform || "").trim().toLowerCase();
}

function recordStudioTypeKey(row) {
  const raw = String(
    row?.studio_output_type
    || row?.platform_output_type
    || row?.fields?.Studio_Output_Type
    || row?.fields?.Platform_Output_Type
    || "",
  ).trim().toLowerCase();
  // TikTok "Video Draft" ghosts against a live "Video" sibling share one slot.
  if (raw === "video draft") return "video";
  return raw;
}

function recordHasDeliverable(row) {
  const fields = row?.fields || {};
  return Boolean(
    row?.final_file_url
    || row?.studio_preview_url
    || row?.publish_asset_url
    || fields.Final_File_URL
    || fields.Studio_Preview_URL
    || fields.Publish_Asset_URL,
  );
}

function recordOutputStatus(row) {
  return String(row?.output_status || row?.fields?.Output_Status || "").trim().toLowerCase();
}

function siblingOutputRank(row) {
  let score = 0;
  const status = recordOutputStatus(row);
  if (status === "published" || status === "scheduled" || status === "approved") score += 120;
  else if (status === "ready for review") score += 100;
  else if (status === "preparing assets" || status === "draft") score -= 10;
  if (recordHasDeliverable(row)) score += 50;
  const render = String(row?.render_status || row?.fields?.Render_Status || "").trim().toLowerCase();
  if (render === "rendered" || render === "complete" || render === "completed") score += 20;
  // Tiny tie-break so ranking is stable; never enough alone to collapse two ready rows.
  score += recordOutputNumber(row) / 1e9;
  return score;
}

/** Drop clearly weaker same-content/platform/type siblings (ghost Preparing vs Ready). */
export function collapseSupersededSiblingOutputs(records) {
  if (!Array.isArray(records) || records.length < 2) return records;
  const groups = new Map();
  records.forEach((row, index) => {
    const content = recordContentId(row);
    const platform = recordPlatform(row);
    const type = recordStudioTypeKey(row);
    if (!content || !platform || !type) return;
    const key = `${content}|${platform}|${type}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push({ row, index });
  });
  const drop = new Set();
  for (const members of groups.values()) {
    if (members.length < 2) continue;
    let best = members[0];
    let bestRank = siblingOutputRank(best.row);
    for (const member of members.slice(1)) {
      const rank = siblingOutputRank(member.row);
      if (rank > bestRank) {
        best = member;
        bestRank = rank;
      }
    }
    for (const member of members) {
      if (member.index === best.index) continue;
      // Require a decisive gap so two Ready siblings of the same type stay.
      if (bestRank >= siblingOutputRank(member.row) + 40) drop.add(member.index);
    }
  }
  if (!drop.size) return records;
  return records.filter((_, index) => !drop.has(index));
}

export function stripDeletedDuplicateOutputRecords(records) {
  if (!Array.isArray(records) || !records.length) return records;
  const filtered = records.filter((row) => {
    if (deletedDuplicateOutputIdSet.has(String(row?.id || ""))) return false;
    const outputNumber = recordOutputNumber(row);
    if (outputNumber && deletedDuplicateOutputNumberSet.has(outputNumber)) return false;
    const contentId = recordContentId(row);
    return !deletedDuplicateContentIdSet.has(contentId);
  });
  const next = collapseSupersededSiblingOutputs(filtered);
  return next.length === records.length ? records : next;
}

async function deleteSupabaseByAirtableIds(env, table, ids) {
  const unique = [...new Set((ids || []).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(String(id || ""))))];
  let deleted = 0;
  for (let index = 0; index < unique.length; index += 30) {
    const batch = unique.slice(index, index + 30);
    const rows = await supabaseRest(env, `${table}?airtable_record_id=in.(${batch.join(",")})`, {
      method: "DELETE",
      headers: { Prefer: "return=representation" },
    });
    deleted += Array.isArray(rows) ? rows.length : 0;
  }
  return deleted;
}

async function deleteSupabaseByOutputNumbers(env, numbers) {
  const unique = [...new Set(
    (numbers || []).map((n) => Number(n)).filter((n) => Number.isFinite(n) && n > 0),
  )];
  if (!unique.length) return 0;
  const rows = await supabaseRest(env, `platform_outputs?output_number=in.(${unique.join(",")})`, {
    method: "DELETE",
    headers: { Prefer: "return=representation" },
  });
  return Array.isArray(rows) ? rows.length : 0;
}

async function stripDeletedDuplicateSnapshots(env) {
  if (!env?.STUDIO_MEDIA?.get || !env?.STUDIO_MEDIA?.put) return 0;
  let touched = 0;
  for (const profileId of DELETED_DUPLICATE_PROFILE_IDS) {
    for (const suffix of ["250-full", "250-review"]) {
      const snapshotKey = `studio/state/pipeline-list-${profileId}-${suffix}.json`;
      try {
        const object = await env.STUDIO_MEDIA.get(snapshotKey);
        if (!object) continue;
        const body = await object.json();
        const records = body?.payload?.records;
        if (!Array.isArray(records)) continue;
        const next = stripDeletedDuplicateOutputRecords(records);
        if (next === records) continue;
        body.payload = { ...body.payload, records: next };
        body.at = Date.now();
        await env.STUDIO_MEDIA.put(snapshotKey, JSON.stringify(body), {
          httpMetadata: { contentType: "application/json" },
        });
        touched += 1;
      } catch (error) {
        console.warn("purge duplicate snapshot strip failed", snapshotKey, error);
      }
    }
  }
  return touched;
}

/**
 * Lightweight orphan cleanup: delete known ghost Output_IDs and strip R2 snapshots.
 * Safe to call from Pipeline reads. Do NOT call purgeDeletedDuplicatePackages from cron.
 */
export async function purgeOrphanDuplicateOutputNumbers(env) {
  const result = { outputs: 0, snapshots: 0 };
  if (studioSupabaseConfigured(env)) {
    try {
      result.outputs = await deleteSupabaseByOutputNumbers(env, DELETED_DUPLICATE_OUTPUT_NUMBERS);
    } catch (error) {
      result.outputs_error = String(error?.message || error).slice(0, 180);
    }
  } else {
    result.skipped = "supabase_not_configured";
  }
  try {
    result.snapshots = await stripDeletedDuplicateSnapshots(env);
  } catch (error) {
    result.snapshots_error = String(error?.message || error).slice(0, 180);
  }
  return result;
}

// Do not call this from the 5-minute cron. production_request_outputs.platform_output_id
// has no index, so each DELETE scans that table until Postgres cancels it (57014)
// and the pool fills (PGRST003). The Pipeline list filter already drops these ids.
export async function purgeDeletedDuplicatePackages(env) {
  const result = { outputs: 0, requests: 0, ideas: 0, content: 0, snapshots: 0, orphan_output_numbers: 0 };
  if (studioSupabaseConfigured(env)) {
    result.outputs = await deleteSupabaseByAirtableIds(env, "platform_outputs", DELETED_DUPLICATE_OUTPUT_IDS);
    try {
      result.orphan_output_numbers = await deleteSupabaseByOutputNumbers(env, DELETED_DUPLICATE_OUTPUT_NUMBERS);
    } catch (error) {
      result.orphan_output_numbers_error = String(error?.message || error).slice(0, 180);
    }
    for (const [key, table, ids] of [
      ["requests", "production_requests", DELETED_DUPLICATE_REQUEST_IDS],
      ["ideas", "idea_candidates", DELETED_DUPLICATE_IDEA_IDS],
      ["content", "content_items", DELETED_DUPLICATE_CONTENT_IDS],
    ]) {
      try {
        result[key] = await deleteSupabaseByAirtableIds(env, table, ids);
      } catch (error) {
        result[`${key}_error`] = String(error?.message || error).slice(0, 180);
      }
    }
  } else {
    result.skipped = "supabase_not_configured";
  }
  result.snapshots = await stripDeletedDuplicateSnapshots(env);
  return result;
}

export const PIPELINE_SETTINGS_TABLE_ID = "tblpHPWeEkyJaF7ql";
export const ENGAGEMENT_SETTINGS_TABLE_ID = "tblY1wDxmrf5khAYy";
export const CAROUSEL_SLIDES_TABLE_ID = "tblcnQDBvUngpjDED";
export const IDEA_CANDIDATES_TABLE_ID = "tblTQapddqD47GOIG";
export const PLATFORM_OUTPUTS_TABLE_ID = "tblrlPeboBthkplH0";
export const CONTENT_ITEMS_TABLE_ID = "tblwzN9AXWvmKVKPs";
export const CONTENT_PROFILES_TABLE_ID = "tblNYg2QB0BmmVACy";

function sideTableKind(env, tableId) {
  const table = String(tableId || "");
  const idea = String(env?.AIRTABLE_IDEA_TABLE_ID || IDEA_CANDIDATES_TABLE_ID);
  const outputs = String(env?.AIRTABLE_OUTPUT_TABLE_ID || PLATFORM_OUTPUTS_TABLE_ID);
  const content = String(env?.AIRTABLE_CONTENT_TABLE_ID || CONTENT_ITEMS_TABLE_ID);
  const profiles = String(env?.AIRTABLE_PROFILE_TABLE_ID || CONTENT_PROFILES_TABLE_ID);
  if (table === outputs || table === PLATFORM_OUTPUTS_TABLE_ID) return "output";
  if (table === content || table === CONTENT_ITEMS_TABLE_ID) return "content";
  if (table === idea || table === IDEA_CANDIDATES_TABLE_ID) return "idea";
  if (table === profiles || table === CONTENT_PROFILES_TABLE_ID || table === "Content Profiles") {
    return "profile";
  }
  if (table === PIPELINE_SETTINGS_TABLE_ID) return "pipeline_settings";
  if (table === ENGAGEMENT_SETTINGS_TABLE_ID) return "engagement_settings";
  if (table === CAROUSEL_SLIDES_TABLE_ID || table === "Carousel Slides") return "slides";
  if (table === PHASE6_TRANSFER_QUEUE_TABLE_ID || table === "Studio Media Transfer Queue") return "queue";
  return "";
}

function sideRecordId(pathOrParams) {
  const text = String(pathOrParams || "").replace(/^\//, "").split("?")[0].trim();
  return /^rec[A-Za-z0-9]{14}$/.test(text) ? text : "";
}

function sideQuery(pathOrParams) {
  const text = String(pathOrParams || "");
  const index = text.indexOf("?");
  return new URLSearchParams(index >= 0 ? text.slice(index + 1) : "");
}

function compactFormula(formula) {
  return String(formula || "").replace(/\s+/g, "");
}

function settingsListFilter(formula) {
  const text = compactFormula(formula);
  let match = text.match(/^\{Setting_Name\}=(["'])([^"']*)\1$/);
  if (match) return { name: match[2], active: false, prefix: "", names: [] };
  match = text.match(/^AND\(\{Active\}=1,\{Setting_Name\}=(["'])([^"']*)\1\)$/);
  if (match) return { name: match[2], active: true, prefix: "", names: [] };
  if (text === "AND({Active}=1,FIND('A1_JOB_',{Setting_Name})=1)"
    || text === 'AND({Active}=1,FIND("A1_JOB_",{Setting_Name})=1)') {
    return { name: "", active: true, prefix: "A1_JOB_", names: [] };
  }
  // Active=1 AND OR({Setting_Name}='a',{Setting_Name}="b",...) — publish destination packs.
  match = text.match(/^AND\(\{Active\}=1,OR\((.+)\)\)$/);
  if (match) {
    const names = [...match[1].matchAll(/\{Setting_Name\}=(["'])([^"']*)\1/g)].map((row) => row[2]);
    if (names.length) return { name: "", active: true, prefix: "", names: [...new Set(names)] };
  }
  return null;
}

function ideaProfileIds(formula) {
  const text = compactFormula(formula);
  const ids = [...text.matchAll(/FIND\("([^"]+)",ARRAYJOIN\(\{Content_Profile\}\)(?:&"")?\)/g)]
    .map((match) => match[1])
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
  if (!ids.length || !text.includes("ARRAYJOIN({Content_Profile})")) return null;
  return {
    ids: [...new Set(ids)],
    openOnly: text.includes("{Promoted_Content_Record_ID}=BLANK()") && text.includes("{ContentItems}=BLANK()"),
  };
}

function settingActive(value) {
  return value === true || value === 1 || String(value ?? "").trim().toLowerCase() === "true";
}

function shapeSetting(row) {
  const payload = isPlainObject(row?.payload) ? row.payload : {};
  return { id: row.airtable_record_id, fields: { ...payload } };
}

async function readIdeaRow(env, id) {
  const rows = await supabaseRest(
    env,
    `idea_candidates?airtable_record_id=eq.${encodeURIComponent(id)}&select=airtable_record_id,content_profile_id,candidate_title,idea_summary,status,payload,created_at&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  return row?.airtable_record_id ? airtableShapedIdeaFromSupabase(row) : null;
}

async function readSettingRows(env, source, filter, limit) {
  const parts = [`payload->>source=eq.${source}`, `select=airtable_record_id,payload`, `limit=${limit}`];
  if (filter.name) parts.push(`payload->>Setting_Name=eq.${encodeURIComponent(filter.name)}`);
  if (filter.prefix) parts.push(`payload->>Setting_Name=like.${encodeURIComponent(filter.prefix)}*`);
  if (Array.isArray(filter.names) && filter.names.length) {
    const orParts = filter.names
      .map((name) => `payload->>Setting_Name.eq.${encodeURIComponent(String(name))}`)
      .join(",");
    parts.push(`or=(${orParts})`);
  }
  const rows = await supabaseRest(env, `engagement_settings?${parts.join("&")}`);
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.airtable_record_id)
    .map(shapeSetting)
    .filter((row) => !filter.active || settingActive(row.fields.Active));
}

/** Direct Pipeline Settings read by Setting_Name (Active preferred). */
export async function readSupabasePipelineSetting(env, name, { activeOnly = true } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const settingName = String(name || "").trim();
  if (!settingName) return null;
  const rows = await readSettingRows(
    env,
    "pipeline",
    { name: settingName, active: Boolean(activeOnly), prefix: "", names: [] },
    5,
  ).catch(() => null);
  if (!Array.isArray(rows)) return null;
  return rows[0] || null;
}

/** Active Pipeline Settings whose Setting_Name is in names. */
export async function listSupabasePipelineSettingsByNames(env, names, { limit = 50 } = {}) {
  if (!studioSupabaseConfigured(env)) return null;
  const wanted = [...new Set((names || []).map((name) => String(name || "").trim()).filter(Boolean))];
  if (!wanted.length) return [];
  const cap = Math.max(1, Math.min(200, Number(limit) || Math.max(40, wanted.length + 10)));
  const rows = await readSettingRows(
    env,
    "pipeline",
    { name: "", active: true, prefix: "", names: wanted },
    cap,
  ).catch(() => null);
  return Array.isArray(rows) ? rows : null;
}

async function readIdeasForProfiles(env, profileIds, openOnly, limit) {
  const uuids = [];
  for (const id of profileIds) {
    const uuid = await resolveSupabaseProfileId(env, id).catch(() => null);
    if (uuid) uuids.push(uuid);
  }
  if (!uuids.length) return [];
  const rows = await supabaseRest(
    env,
    `idea_candidates?content_profile_id=in.(${uuids.map(encodeURIComponent).join(",")})&select=airtable_record_id,content_profile_id,candidate_title,idea_summary,status,payload,created_at&order=created_at.desc&limit=${limit}`,
  );
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => row?.airtable_record_id)
    .map(airtableShapedIdeaFromSupabase)
    .filter((row) => {
      if (!openOnly) return true;
      const promoted = String(row.fields.Promoted_Content_Record_ID || "").trim();
      const items = row.fields["Content Items"];
      return !promoted && (!Array.isArray(items) || items.length === 0);
    });
}

const QUEUE_FILTER_FIELDS = {
  Transfer_Status: "status",
  Asset_Kind: "payload->>asset_kind",
  Preview_Status: "payload->>preview_status",
  Test_Run_ID: "payload->>test_run_id",
  Production_Request_Record_ID: "payload->>production_request_record_id",
  Source_Drive_File_ID: "payload->>source_drive_file_id",
  Aspect_Ratio: "payload->>aspect_ratio",
  Source_Asset_ID: "payload->>source_asset_id",
};

const QUEUE_PAYLOAD_FIELDS = {
  transfer_id: "Transfer_ID",
  production_request_record_id: "Production_Request_Record_ID",
  asset_kind: "Asset_Kind",
  source_asset_id: "Source_Asset_ID",
  source_name: "Source_Name",
  source_drive_file_id: "Source_Drive_File_ID",
  source_media_asset_id: "Source_Media_Asset",
  generated_media_asset_id: "Generated_Media_Asset",
  aspect_ratio: "Aspect_Ratio",
  preview_status: "Preview_Status",
  test_run_id: "Test_Run_ID",
  media_asset_record_id: "Media_Asset_Record_ID",
};

function tightenQueueFormula(text) {
  let out = "";
  let inString = false;
  let quote = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (inString) {
      out += ch;
      if (ch === "\\" && i + 1 < text.length) {
        out += text[i + 1];
        i += 1;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
      out += ch;
      continue;
    }
    if (/\s/.test(ch)) continue;
    out += ch;
  }
  return out;
}

function splitQueueArgs(args) {
  const parts = [];
  let depth = 0;
  let start = 0;
  let inString = false;
  let quote = "";
  for (let i = 0; i < args.length; i += 1) {
    const ch = args[i];
    if (inString) {
      if (ch === "\\" && i + 1 < args.length) {
        i += 1;
        continue;
      }
      if (ch === quote) inString = false;
      continue;
    }
    if (ch === '"' || ch === "'") {
      inString = true;
      quote = ch;
    } else if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth < 0) return null;
    } else if (ch === "," && depth === 0) {
      parts.push(args.slice(start, i));
      start = i + 1;
    }
  }
  if (depth !== 0 || inString) return null;
  if (start < args.length) parts.push(args.slice(start));
  return parts;
}

function queuePredicate(text) {
  if (text.startsWith("AND(") && text.endsWith(")")) return queueJoin("and", text.slice(4, -1));
  if (text.startsWith("OR(") && text.endsWith(")")) return queueJoin("or", text.slice(3, -1));
  const blank = text.match(/^\{([A-Za-z0-9_]+)\}=BLANK\(\)$/);
  if (blank) {
    const ref = QUEUE_FILTER_FIELDS[blank[1]];
    return ref ? `or(${ref}.is.null,${ref}.eq.)` : null;
  }
  const eq = text.match(/^\{([A-Za-z0-9_]+)\}=(?:"([^"]*)"|'([^']*)')$/);
  if (!eq) return null;
  const ref = QUEUE_FILTER_FIELDS[eq[1]];
  const value = eq[2] != null ? eq[2] : eq[3];
  if (!ref || /[,()"]/.test(value)) return null;
  return `${ref}.eq.${value}`;
}

function queueJoin(joiner, args) {
  const parts = splitQueueArgs(args);
  if (!parts?.length) return null;
  const filters = [];
  for (const part of parts) {
    const item = queuePredicate(part);
    if (!item) return null;
    filters.push(item);
  }
  return filters.length === 1 ? filters[0] : `${joiner}(${filters.join(",")})`;
}

function queueFormulaFilter(formula) {
  const cleaned = tightenQueueFormula(String(formula || ""));
  return cleaned ? queuePredicate(cleaned) : null;
}

function shapeQueueRow(row) {
  if (!row?.airtable_record_id) return null;
  const payload = isPlainObject(row.payload) ? row.payload : {};
  const fields = {};
  if (row.status != null) fields.Transfer_Status = row.status;
  if (row.error_message != null) fields.Error_Message = row.error_message;
  if (row.preview_error != null) fields.Preview_Error = row.preview_error;
  if (row.attempt_count != null) fields.Attempt_Count = row.attempt_count;
  if (row.last_attempt_at) fields.Last_Attempt_At = row.last_attempt_at;
  if (row.updated_at) fields.Updated_At = row.updated_at;
  for (const [column, airtableKey] of Object.entries(QUEUE_PAYLOAD_FIELDS)) {
    if (!payload[column]) continue;
    fields[airtableKey] = airtableKey === "Source_Media_Asset" || airtableKey === "Generated_Media_Asset"
      ? [payload[column]]
      : payload[column];
  }
  if (Array.isArray(payload.target_production_request_output_ids) && payload.target_production_request_output_ids.length) {
    fields.Target_Production_Request_Outputs = payload.target_production_request_output_ids;
  }
  return { id: row.airtable_record_id, fields };
}

async function readQueueRows(env, formula, limit, offset, recordId = "") {
  const tight = tightenQueueFormula(String(formula || ""));
  const translated = recordId ? "" : queueFormulaFilter(formula);
  if (!recordId && !translated) return null;
  if (!recordId && (tight.includes('{Transfer_Status}="Ready"') || tight.includes("{Transfer_Status}='Ready'"))) {
    const probe = await supabaseRest(
      env,
      "studio_media_transfer_queue?select=airtable_record_id&status=eq.Ready&limit=1&offset=4999",
    ).catch(() => null);
    if (!Array.isArray(probe) || !probe.length) return null;
  }
  const filter = recordId
    ? `airtable_record_id=eq.${encodeURIComponent(recordId)}`
    : `and=(${translated})`;
  const rows = await supabaseRest(
    env,
    "studio_media_transfer_queue?select=airtable_record_id,status,error_message,preview_error,attempt_count,last_attempt_at,updated_at,payload"
      + `&order=updated_at.desc&limit=${limit}&offset=${offset}&${filter}`,
  );
  if (!Array.isArray(rows)) return null;
  return rows.map(shapeQueueRow).filter(Boolean);
}

function summaryProfileIdFromFormula(formula) {
  const ids = [...String(formula || "").matchAll(/FIND\("([^"]+)",\s*ARRAYJOIN\(\{Content_Profile\}\)/g)]
    .map((match) => match[1])
    .filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id));
  return ids[0] || "";
}

/**
 * Profile-summary reconcile pages. A full page is the Supabase answer.
 */
export async function listProfileSummaryRecords(env, tableId, options = {}) {
  if (!studioSupabaseConfigured(env) || studioWriteSource(env) !== "supabase") return null;
  const profileAirtableId = summaryProfileIdFromFormula(options.filterFormula);
  if (!profileAirtableId) return null;
  const profileUuid = await resolveSupabaseProfileId(env, profileAirtableId).catch(() => null);
  if (!profileUuid) return null;
  const ideaTable = String(env?.AIRTABLE_IDEA_TABLE_ID || IDEA_CANDIDATES_TABLE_ID);
  const outputTable = String(env?.AIRTABLE_OUTPUT_TABLE_ID || "");
  const limit = Math.max(1, Math.min(50000, Number(options.limit) || 50000));
  if (outputTable && String(tableId) === outputTable) {
    const rows = await supabaseRestAll(
      env,
      `platform_outputs?content_profile_id=eq.${profileUuid}`
        + "&and=(or(output_status.is.null,output_status.neq.Published),or(publish_status.is.null,publish_status.neq.Published))"
        + `&select=${OUTPUT_SELECT}&order=output_number.desc`,
      { pageSize: 1000, maxRows: limit },
    );
    return (rows || []).map((row) => airtableShapedOutputFromSupabase(flattenOutputRow(row))).filter((row) => row?.id);
  }
  if (String(tableId) === ideaTable) {
    const rows = await supabaseRestAll(
      env,
      `idea_candidates?content_profile_id=eq.${profileUuid}`
        + "&select=airtable_record_id,content_profile_id,candidate_title,idea_summary,status,payload,created_at,content_profiles(airtable_record_id)"
        + "&order=created_at.desc",
      { pageSize: 1000, maxRows: limit },
    );
    return (rows || [])
      .map((row) => airtableShapedIdeaFromSupabase(flattenIdeaRow(row)))
      .filter((row) => row?.id && !String(row.fields.Promoted_Content_Record_ID || "").trim()
        && (!Array.isArray(row.fields["Content Items"]) || row.fields["Content Items"].length === 0));
  }
  return null;
}

/**
 * Dirty reread by record id. Missing ids are absent from Supabase and stay out of the batch.
 */
export async function readProfileSummaryDirtyBatch(env, kind, ids) {
  const clean = [...new Set((ids || []).map((id) => String(id || "")).filter((id) => /^rec[A-Za-z0-9]{14}$/.test(id)))];
  if (!clean.length || !studioSupabaseConfigured(env) || studioWriteSource(env) !== "supabase") return null;
  const quoted = clean.map(encodeURIComponent).join(",");
  const rows = kind === "idea"
    ? await supabaseRest(
      env,
      `idea_candidates?airtable_record_id=in.(${quoted})&select=airtable_record_id,content_profile_id,candidate_title,idea_summary,status,payload,created_at,content_profiles(airtable_record_id)`,
    )
    : await supabaseRest(
      env,
      `platform_outputs?airtable_record_id=in.(${quoted})&select=${OUTPUT_SELECT}`,
    );
  const shaped = (Array.isArray(rows) ? rows : []).map((row) => (
    kind === "idea"
      ? airtableShapedIdeaFromSupabase(flattenIdeaRow(row))
      : airtableShapedOutputFromSupabase(flattenOutputRow(row))
  )).filter((row) => row?.id);
  if (!Array.isArray(rows)) return null;
  return shaped;
}

async function readOutputRow(env, id) {
  const rows = await supabaseRest(
    env,
    `platform_outputs?airtable_record_id=eq.${encodeURIComponent(id)}&select=${OUTPUT_SELECT}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.airtable_record_id) return null;
  return shapeDeskHealRecord(row);
}

async function readContentRow(env, id) {
  const rows = await supabaseRest(
    env,
    `content_items?airtable_record_id=eq.${encodeURIComponent(id)}&select=${CONTENT_SELECT}&limit=1`,
  );
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row?.airtable_record_id) return null;
  return airtableShapedContentFromSupabase(flattenContentRow(row));
}

function tightenSideFormula(text) {
  return String(text || "").replace(/\s+/g, "");
}

function slideFormulaFilter(formula) {
  const cleaned = tightenSideFormula(formula);
  if (!cleaned) return null;
  const find = cleaned.match(/^FIND\("([^"]+)",ARRAYJOIN\(\{PO_Output_ID\}\)\)(?:>0)?$/);
  if (find) {
    const token = find[1];
    if (!token || /[,()*"]/.test(token)) return null;
    return `fields->>PO_Output_ID.like.*${token}*`;
  }
  if (cleaned.startsWith("AND(") && cleaned.endsWith(")")) {
    const parts = splitQueueArgs(cleaned.slice(4, -1));
    if (!parts?.length) return null;
    const filters = [];
    for (const part of parts) {
      const item = slideFormulaFilter(part);
      if (!item) return null;
      filters.push(item);
    }
    return filters.length === 1 ? filters[0] : `and(${filters.join(",")})`;
  }
  const checkbox = cleaned.match(/^\{(Shared_Asset_Approved|Is Cover|Deleted From Carousel)\}=([01])$/);
  if (checkbox) {
    const ref = `fields->>${checkbox[1]}`;
    return checkbox[2] === "1"
      ? `or(${ref}.eq.true,${ref}.eq.1,${ref}.eq.True)`
      : `or(${ref}.is.null,${ref}.eq.false,${ref}.eq.0,${ref}.eq.False,${ref}.eq.)`;
  }
  const eq = cleaned.match(/^\{(Asset_4x5_Public_Status|FB_Photo_Status|FB_Photo_Package_Revision|Review Status)\}="([^"]*)"$/);
  if (eq) return `fields->>${eq[1]}.eq.${eq[2]}`;
  const blank = cleaned.match(/^\{(Asset_4x5_Public_URL|FB_Photo_ID|Asset_4x5_Public_Status)\}=BLANK\(\)$/);
  if (blank) return `or(fields->>${blank[1]}.is.null,fields->>${blank[1]}.eq.)`;
  const nonempty = cleaned.match(/^\{(Asset_4x5_Public_URL|FB_Photo_ID)\}!=BLANK\(\)$/);
  if (nonempty) return `and(fields->>${nonempty[1]}.not.is.null,fields->>${nonempty[1]}.neq.)`;
  return null;
}

async function readSlideRows(env, formula, limit, offset) {
  const translated = slideFormulaFilter(formula);
  if (!translated) return null;
  const select = "airtable_record_id,current_order,deleted_from_carousel,ig_child_container_id,voiceover,creative_directives,fields";
  const rows = await supabaseRest(
    env,
    `carousel_slides?select=${select}`
      + `&order=current_order.asc.nullslast&limit=${limit}&offset=${offset}`
      + `&and=(${translated})`,
  );
  if (!Array.isArray(rows)) return null;
  return rows.map(airtableShapedCarouselSlide).filter((row) => row?.id);
}

function outputContentListFilter(kind, formula) {
  const cleaned = tightenSideFormula(formula);
  if (!cleaned) return null;
  const recordId = cleaned.match(/^RECORD_ID\(\)="(rec[A-Za-z0-9]{14})"$/);
  if (recordId) return `airtable_record_id.eq.${recordId[1]}`;
  if (kind === "output") {
    const outputId = cleaned.match(/^\{Output_ID\}=(\d+)$/);
    if (outputId) return `output_number.eq.${outputId[1]}`;
    const platform = cleaned.match(/^\{Platform\}="([^"]+)"$/);
    if (platform) return `platform.eq.${platform[1]}`;
    const contentNumber = cleaned.match(/^FIND\(",(\d+),",","&ARRAYJOIN\(\{Content_Item\}\)&","\)>0$/);
    if (contentNumber) return `content_number.eq.${contentNumber[1]}`;
    const contentRec = cleaned.match(/^FIND\("(rec[A-Za-z0-9]{14})",ARRAYJOIN\(\{Content_Item\}\)\)(?:>0)?$/);
    if (contentRec) return `content_item_airtable_id.eq.${contentRec[1]}`;
    const requestOut = cleaned.match(/^FIND\("(rec[A-Za-z0-9]{14})",ARRAYJOIN\(\{Production_Request_Output\}\)\)(?:>0)?$/);
    if (requestOut) return `production_request_output_text.like.*${requestOut[1]}*`;
    if (cleaned.startsWith("AND(") && cleaned.endsWith(")")) {
      const parts = splitQueueArgs(cleaned.slice(4, -1));
      if (!parts?.length) return null;
      const filters = [];
      for (const part of parts) {
        const item = outputContentListFilter(kind, part);
        if (!item) return null;
        filters.push(item);
      }
      return filters.length === 1 ? filters[0] : `and(${filters.join(",")})`;
    }
    const blank = cleaned.match(/^\{Test_Run_ID\}=BLANK\(\)$/);
    if (blank) return "or(test_run_id.is.null,test_run_id.eq.)";
  }
  if (kind === "content") {
    const contentId = cleaned.match(/^\{Content_ID\}=(\d+)$/);
    if (contentId) return `content_number.eq.${contentId[1]}`;
    if (cleaned.startsWith("AND(") && cleaned.endsWith(")")) {
      const parts = splitQueueArgs(cleaned.slice(4, -1));
      if (!parts?.length) return null;
      const filters = [];
      for (const part of parts) {
        const item = outputContentListFilter(kind, part);
        if (!item) return null;
        filters.push(item);
      }
      return filters.length === 1 ? filters[0] : `and(${filters.join(",")})`;
    }
  }
  return null;
}

async function readOutputContentListRows(env, kind, formula, limit, offset) {
  const translated = outputContentListFilter(kind, formula);
  if (!translated) return null;
  if (kind === "output") {
    const rows = await supabaseRest(
      env,
      `platform_outputs?select=${OUTPUT_SELECT}`
        + `&order=output_number.desc.nullslast&limit=${limit}&offset=${offset}`
        + `&and=(${translated})`,
    );
    if (!Array.isArray(rows)) return null;
    return rows.map((row) => shapeDeskHealRecord(row)).filter((row) => row?.id);
  }
  const rows = await supabaseRest(
    env,
    `content_items?select=${CONTENT_SELECT}`
      + `&order=content_number.desc.nullslast&limit=${limit}&offset=${offset}`
      + `&and=(${translated})`,
  );
  if (!Array.isArray(rows)) return null;
  return rows
    .map((row) => airtableShapedContentFromSupabase(flattenContentRow(row)))
    .filter((row) => row?.id);
}

/**
 * Upsert a Pipeline Setting into engagement_settings and re-read it.
 * Does not print Setting_Value. Airtable is not called.
 */
export async function studioUpsertSettingOnSupabase(env, name, value, notes) {
  if (studioWriteSource(env) !== "supabase" || !studioSupabaseConfigured(env)) {
    return null;
  }
  const settingName = String(name || "").trim();
  if (!settingName) throw new Error("Setting_Name is required");
  const existing = await readSettingRows(
    env,
    "pipeline",
    { name: settingName, active: false, prefix: "" },
    5,
  );
  const prior = existing[0] || null;
  const payload = {
    ...(isPlainObject(prior?.fields) ? prior.fields : {}),
    Setting_Name: settingName,
    Setting_Value: String(value ?? ""),
    Active: true,
    Notes: notes || null,
    source: "pipeline",
  };
  const recordId = prior?.id || mintAirtableRecordId();
  const body = { airtable_record_id: recordId, payload };
  if (prior?.id) {
    await supabaseRest(env, `engagement_settings?airtable_record_id=eq.${encodeURIComponent(recordId)}`, {
      method: "PATCH",
      body,
      headers: { Prefer: "return=minimal" },
    });
  } else {
    await upsertChunk(env, "engagement_settings", [body]);
  }
  const saved = await readSettingRows(
    env,
    "pipeline",
    { name: settingName, active: false, prefix: "" },
    5,
  );
  const row = saved.find((item) => item.id === recordId) || saved[0] || null;
  if (!row?.id) throw new Error(`Failed to upsert Pipeline Setting "${settingName}" on Supabase`);
  return row;
}

/**
 * Idea, settings, carousel-slide, transfer-queue, Output, Content, and
 * Content Profile reads from Supabase. Returns null when this call must stay
 * on Airtable. A missing Output/Content/Profile row stays null.
 */
export async function studioSideTableRead(env, tableId, pathOrParams) {
  if (studioWriteSource(env) !== "supabase") return null;
  const kind = sideTableKind(env, tableId);
  if (!kind) return null;
  const id = sideRecordId(pathOrParams);
  if (id) {
    if (kind === "output") {
      return await readOutputRow(env, id);
    }
    if (kind === "content") {
      return await readContentRow(env, id);
    }
    if (kind === "profile") {
      return await readSupabaseContentProfile(env, id);
    }
    if (kind === "idea") {
      const row = await readIdeaRow(env, id);
      return row || null;
    }
    if (kind === "slides") {
      const rows = await listSupabaseCarouselSlidesByIds(env, [id]);
      return rows[0] || null;
    }
    if (kind === "queue") {
      if (studioPhase6WriteSource(env) !== "supabase") return null;
      const rows = await readQueueRows(env, "", 1, 0, id);
      return rows?.[0] || null;
    }
    if (kind === "pipeline_settings" || kind === "engagement_settings") {
      const source = kind === "engagement_settings" ? "engagement" : "pipeline";
      const rows = await readSettingRows(env, source, { name: "", active: false, prefix: "" }, 1000);
      return rows.find((row) => row.id === id) || null;
    }
    return null;
  }
  const formula = sideQuery(pathOrParams).get("filterByFormula") || "";
  const limit = Math.max(1, Math.min(100, Number(sideQuery(pathOrParams).get("maxRecords") || sideQuery(pathOrParams).get("pageSize") || 50)));
  if (kind === "profile") {
    const cleaned = compactFormula(formula);
    // Full list, Active=1, and Active+Autonomous_Produce_Enabled=1 are the
    // Content Profile list shapes Studio uses. Other formulas stay on Airtable.
    const activeOnly = cleaned === "{Active}=1" || cleaned === "AND({Active}=1)";
    const autonomous = cleaned === "AND({Active}=1,{Autonomous_Produce_Enabled}=1)";
    if (cleaned && !activeOnly && !autonomous) return null;
    let records = await listSupabaseContentProfiles(env, {
      limit, activeOnly: Boolean(cleaned),
    });
    if (!records) return null;
    if (autonomous) {
      records = records.filter((row) => row?.fields?.Autonomous_Produce_Enabled === true);
    }
    return { records };
  }
  if (kind === "pipeline_settings" || kind === "engagement_settings") {
    const filter = settingsListFilter(formula);
    if (!filter) return null;
    const records = await readSettingRows(env, kind === "engagement_settings" ? "engagement" : "pipeline", filter, limit);
    return { records };
  }
  if (kind === "idea") {
    const profiles = ideaProfileIds(formula);
    if (!profiles) return null;
    const records = await readIdeasForProfiles(env, profiles.ids, profiles.openOnly, limit);
    return { records };
  }
  if (kind === "queue") {
    if (studioPhase6WriteSource(env) !== "supabase") return null;
    const offset = Math.max(0, Number(sideQuery(pathOrParams).get("offset") || 0));
    const records = await readQueueRows(env, formula, limit, offset);
    if (!records) return null;
    const body = { records };
    if (records.length === limit) body.offset = String(offset + records.length);
    return body;
  }
  if (kind === "slides") {
    const offset = Math.max(0, Number(sideQuery(pathOrParams).get("offset") || 0));
    const records = await readSlideRows(env, formula, limit, offset);
    if (!records) return null;
    const body = { records };
    if (records.length === limit) body.offset = String(offset + records.length);
    return body;
  }
  if (kind === "output" || kind === "content") {
    const offset = Math.max(0, Number(sideQuery(pathOrParams).get("offset") || 0));
    const records = await readOutputContentListRows(env, kind, formula, limit, offset);
    if (!records) return null;
    const body = { records };
    if (records.length === limit) body.offset = String(offset + records.length);
    return body;
  }
  return null;
}

async function commitIdeaRecords(env, records) {
  const saved = [];
  for (const record of records) {
    const existingRows = await supabaseRest(
      env,
      `idea_candidates?airtable_record_id=eq.${encodeURIComponent(record.id)}&select=payload,content_profile_id,candidate_title,idea_summary,status&limit=1`,
    ).catch(() => []);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    const prior = isPlainObject(existing?.payload) ? existing.payload : {};
    const fields = record.fields || {};
    const payload = { ...prior, ...fields };
    const profileAirtableId = firstLink(fields.Content_Profile) || prior.content_profile_airtable_id || null;
    if (profileAirtableId) payload.content_profile_airtable_id = profileAirtableId;
    const body = {
      airtable_record_id: record.id,
      candidate_title: fields.Candidate_Title || existing?.candidate_title || payload.Candidate_Title || null,
      idea_summary: fields.Idea_Summary || existing?.idea_summary || payload.Idea_Summary || null,
      status: selectName(fields.Candidate_Status) || existing?.status || selectName(payload.Candidate_Status),
      payload,
      updated_at: new Date().toISOString(),
    };
    const profileUuid = profileAirtableId
      ? await resolveSupabaseProfileId(env, profileAirtableId).catch(() => null)
      : existing?.content_profile_id || null;
    if (profileUuid) body.content_profile_id = profileUuid;
    if (existing) {
      await supabaseRest(env, `idea_candidates?airtable_record_id=eq.${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        body,
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await upsertChunk(env, "idea_candidates", [body]);
    }
    saved.push({ id: record.id, fields: payload });
  }
  return saved;
}

async function commitSettingRecords(env, source, records, { insert = false } = {}) {
  const prepared = [];
  for (const record of records) {
    const existingRows = await supabaseRest(
      env,
      `engagement_settings?airtable_record_id=eq.${encodeURIComponent(record.id)}&select=payload&limit=1`,
    ).catch(() => []);
    const existing = Array.isArray(existingRows) ? existingRows[0] : null;
    if (!existing && !insert) return null;
    const prior = isPlainObject(existing?.payload) ? existing.payload : {};
    prepared.push({
      id: record.id,
      existed: Boolean(existing),
      payload: { ...prior, ...(record.fields || {}), source },
    });
  }
  const saved = [];
  for (const record of prepared) {
    const body = { airtable_record_id: record.id, payload: record.payload };
    if (record.existed) {
      await supabaseRest(env, `engagement_settings?airtable_record_id=eq.${encodeURIComponent(record.id)}`, {
        method: "PATCH",
        body,
        headers: { Prefer: "return=minimal" },
      });
    } else {
      await upsertChunk(env, "engagement_settings", [body]);
    }
    saved.push({ id: record.id, fields: record.payload });
  }
  return saved;
}

async function commitSlideRecords(env, records) {
  const merged = [];
  for (const record of records) {
    const existing = await listSupabaseCarouselSlidesByIds(env, [record.id]).catch(() => []);
    const prior = existing[0]?.fields || {};
    merged.push({ id: record.id, fields: { ...prior, ...(record.fields || {}) } });
  }
  await syncCarouselSlideRecordsToSupabase(env, merged);
  return merged;
}

/** Commit idea, settings, or slide writes. ok false leaves the Airtable call in place. */
export async function studioSideTableCommit(env, tableId, method, pathOrParams, rawBody) {
  if (studioWriteSource(env) !== "supabase") return { ok: false, reason: "airtable" };
  const kind = sideTableKind(env, tableId);
  if (!kind || kind === "output" || kind === "content") return { ok: false, reason: "table" };
  const verb = String(method || "GET").toUpperCase();
  if (verb === "PATCH" || verb === "POST") {
    const parsed = verb === "PATCH"
      ? parseAirtableMutationRecords(pathOrParams, rawBody)
      : parseAirtableCreateFields(rawBody).map((fields) => ({ id: mintAirtableRecordId(), fields }));
    if (!parsed.length) return { ok: false, reason: "no_records" };
    const records = kind === "idea"
      ? await commitIdeaRecords(env, parsed)
      : kind === "slides"
        ? await commitSlideRecords(env, parsed)
        : kind === "pipeline_settings" || kind === "engagement_settings"
          ? await commitSettingRecords(env, kind === "engagement_settings" ? "engagement" : "pipeline", parsed, { insert: verb === "POST" })
          : null;
    if (!records) return { ok: false, reason: "missing_row" };
    return { ok: records.length === parsed.length, records };
  }
  if (verb === "DELETE") {
    const id = sideRecordId(pathOrParams);
    if (!id) return { ok: false, reason: "no_records" };
    if (kind !== "idea" && kind !== "slides" && kind !== "pipeline_settings" && kind !== "engagement_settings") {
      return { ok: false, reason: "table" };
    }
    const table = kind === "idea" ? "idea_candidates" : kind === "slides" ? "carousel_slides" : "engagement_settings";
    await supabaseRest(env, `${table}?airtable_record_id=eq.${encodeURIComponent(id)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return { ok: true, records: [{ id, deleted: true }] };
  }
  return { ok: false, reason: "method" };
}
