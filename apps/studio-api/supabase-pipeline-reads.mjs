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

export const STUDIO_SUPABASE_READ_ROUTES = Object.freeze([
  ...STUDIO_SUPABASE_PIPELINE_READ_ROUTES,
  ...STUDIO_SUPABASE_PHASE4_READ_ROUTES,
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
  const ceiling = Math.max(1, Math.min(20000, Number(maxRows) || 10000));
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

/** Build an Airtable-shaped record so existing mapOutput / f() keep working. */
export function airtableShapedOutputFromSupabase(row) {
  const contentAirtableId = row.content_item_airtable_id || null;
  const bag = isPlainObject(row.error_messages) ? row.error_messages : {};
  return {
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
}

export function airtableShapedContentFromSupabase(row) {
  const bag = isPlainObject(row.extras) ? row.extras : {};
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

export function airtableShapedIdeaFromSupabase(row) {
  const bag = isPlainObject(row.payload) ? row.payload : {};
  const profileId = row.content_profile_airtable_id || bag.content_profile_airtable_id || null;
  return {
    id: row.airtable_record_id,
    createdTime: bag.Create_Date || row.created_at || undefined,
    fields: {
      Candidate_ID: bag.Candidate_ID ?? null,
      Candidate_Title: row.candidate_title || bag.Candidate_Title || null,
      Idea_Summary: row.idea_summary || bag.Idea_Summary || null,
      Candidate_Status: row.status || bag.Candidate_Status || null,
      Content_Profile: profileId ? [profileId] : (Array.isArray(bag.Content_Profile) ? bag.Content_Profile : []),
      "Content Items": Array.isArray(bag["Content Items"]) ? bag["Content Items"] : [],
      Promoted_Content_Record_ID: bag.Promoted_Content_Record_ID || null,
      Create_Date: bag.Create_Date || row.created_at || null,
      Studio_Photo_Wait_Status: bag.Studio_Photo_Wait_Status || null,
      Production_Notes: bag.Production_Notes || null,
      Production_Config_Notes: bag.Production_Config_Notes || null,
    },
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
    const openRaw = await supabaseRest(
      env,
      `platform_outputs?content_profile_id=eq.${profileId}&do_not_publish=eq.false&output_status=neq.Published&output_status=neq.Cancelled&select=${OUTPUT_SELECT}&order=output_number.desc.nullslast&limit=1000`,
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
  return {
    records: stripDeletedDuplicateOutputRecords(flat.map(airtableShapedOutputFromSupabase)),
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
  const shapedOutputs = [...outputById.values()]
    .map(flattenOutputRow)
    .filter((row) => !String(row.test_run_id || "").trim())
    .map(airtableShapedOutputFromSupabase);

  const outputs = shapedOutputs.filter((row) => matchesOpsQueueOutputFormula(row.fields));
  const renderLaneOutputs = shapedOutputs.filter((row) => matchesOpsQueueRenderFormula(row.fields));
  const reviewOutputs = shapedOutputs.filter((row) => matchesOpsQueueReviewFormula(row.fields));
  const activeHolds = shapedOutputs.filter((row) => matchesRenderActiveHold(row.fields));

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

function upsertChunk(env, table, rows) {
  if (!rows.length) return Promise.resolve();
  return supabaseRest(env, `${table}?on_conflict=airtable_record_id`, {
    method: "POST",
    body: rows,
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
  });
}

export function mapAirtableProfileToSupabase(record, { organizationId = null, brandId = null } = {}) {
  const f = (name) => record?.fields?.[name];
  return {
    airtable_record_id: record.id,
    profile_name: String(f("Profile_Name") || ""),
    brand_name: String(f("Brand_Name") || "") || null,
    market_name: String(f("Market_Name") || "") || null,
    active: Boolean(f("Active")),
    organization_id: organizationId,
    brand_id: brandId,
    platform_setup: {},
  };
}

export function mapAirtableContentToSupabase(record, profileUuid) {
  const fields = record?.fields || {};
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
    extras: packContentExtras(fields),
  };
}

export function mapAirtableOutputToSupabase(record, { profileUuid, contentUuidByAirtableId }) {
  const fields = record?.fields || {};
  const contentAirtableId = firstLink(fields.Content_Item);
  return {
    airtable_record_id: record.id,
    output_number: fields.Output_ID ?? null,
    content_item_id: contentAirtableId ? (contentUuidByAirtableId.get(contentAirtableId) || null) : null,
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
    error_messages: packOutputListFields(fields),
  };
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

  const contentRows = (contents || []).map((row) => mapAirtableContentToSupabase(row, profileUuid));
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

  const outputRows = outputs.map((row) => mapAirtableOutputToSupabase(row, {
    profileUuid,
    contentUuidByAirtableId,
  }));
  for (let i = 0; i < outputRows.length; i += 200) {
    await guardedUpsert("platform_outputs", outputRows.slice(i, i + 200));
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
  const requestRows = (requests || []).map((row) => mapAirtableProductionRequestToSupabase(row, null));
  for (let i = 0; i < requestRows.length; i += 200) {
    await deps.assertLease?.();
    const started = Date.now();
    const chunk = requestRows.slice(i, i + 200);
    await upsertChunk(env, "production_requests", chunk);
    deps.onUpsert?.("production_requests", chunk.length, Date.now() - started);
  }
  return { ok: true, production_requests: requestRows.length };
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
  if (!abortedForCircuit && !supabaseCircuitOpen()) {
    try {
      await assertLease();
      requests = await syncOpenProductionRequestsToSupabase(env, { ...deps, assertLease });
    } catch (error) {
      requests = { ok: false, error: error?.message || String(error) };
      if (/Phase 5 sync lost lease|renewal lost CAS/.test(String(error?.message || ""))) throw error;
    }
  } else {
    requests = { skipped: true, reason: "supabase_circuit_open" };
  }
  const ok = results.length > 0 && results.every((row) => row?.ok === true)
    && requests?.ok === true && !abortedForCircuit && !supabaseCircuitOpen();
  return {
    ok,
    status: abortedForCircuit || supabaseCircuitOpen() ? "circuit_open"
      : ok ? "completed" : "partial",
    results,
    production_requests: requests,
  };
}

/**
 * Write-through after an Airtable schedule (or similar) PATCH so Pipeline
 * schedule-grid reads do not snap the bubble back to a stale Supabase time.
 */
export async function syncAirtableOutputRowToSupabase(env, record) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };

  const profileAirtableId = firstLink(record.fields?.Content_Profile);
  let profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
  if (!profileUuid) {
    // Patch schedule fields only when the row already exists from cron sync.
    await supabaseRest(
      env,
      `platform_outputs?airtable_record_id=eq.${encodeURIComponent(record.id)}`,
      {
        method: "PATCH",
        body: {
          scheduled_post_date: record.fields?.Scheduled_Post_Date || null,
          studio_scheduled_at: record.fields?.Studio_Scheduled_At || null,
          youtube_scheduled_publish_at: record.fields?.YouTube_Scheduled_Publish_At || null,
          publish_status: selectName(record.fields?.Publish_Status),
          output_status: selectName(record.fields?.Output_Status),
          review_status: selectName(record.fields?.Review_Status),
          error_messages: packOutputListFields(record.fields || {}),
        },
        headers: { Prefer: "return=minimal" },
      },
    );
    return { ok: true, mode: "patch" };
  }

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

  const row = mapAirtableOutputToSupabase(record, { profileUuid, contentUuidByAirtableId });
  await upsertChunk(env, "platform_outputs", [row]);
  return { ok: true, mode: "upsert" };
}

/**
 * Write-through one Content Item. Airtable stays write SoR.
 * Without a resolved profile uuid, patch columns that are present on the
 * Airtable record so a partial body cannot blank content_profile_id.
 */
export async function syncAirtableContentRowToSupabase(env, record) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const fields = record.fields || {};
  const profileAirtableId = firstLink(fields.Content_Profile);
  const profileUuid = profileAirtableId ? await resolveSupabaseProfileId(env, profileAirtableId) : null;
  const canUpsert = Boolean(profileUuid) && (
    fields.Content_ID != null || fields.Content_Status != null || fields.Content_Title != null
  );
  if (canUpsert) {
    await upsertChunk(env, "content_items", [mapAirtableContentToSupabase(record, profileUuid)]);
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
  if ("Content_ID" in fields) patch.extras = packContentExtras(fields);
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

export async function syncAirtableProductionRequestRowToSupabase(env, record) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const row = productionRequestWriteThroughRow(record);
  if (!Object.keys(row).length) return { skipped: true, reason: "empty_patch" };
  const identity = row.production_request_id != null && row.request_status != null;
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

/**
 * Phase 6 media slice: mirror Media Asset metadata after Airtable commits.
 * Drive stays the file store. Only scalar metadata columns that are present
 * on the Airtable body are sent, and file bytes are never written. An insert
 * requires Asset Name because media_assets.asset_name is not null. A thinner
 * body patches an existing row.
 */
function mediaAssetWriteThroughRow(record) {
  const fields = record?.fields || {};
  const row = {};
  const text = (value) => {
    const trimmed = String(value || "").trim();
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
  return row;
}

export async function syncAirtableMediaAssetRowToSupabase(env, record) {
  if (!studioSupabaseConfigured(env)) return { skipped: true, reason: "supabase_not_configured" };
  if (!record?.id) return { skipped: true, reason: "missing_record" };
  const row = mediaAssetWriteThroughRow(record);
  if (!Object.keys(row).length) return { skipped: true, reason: "empty_patch" };
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
  "recBNzLsc7JIEoGYk", "recxwWwe5GzRDcf3G", "rec8HS8rOJ6JNFwdh", "recF7sQ6TaLLy5v9Q", "recZyw5WZAeJ9Zfjq", "recWsWcQBIV8C3r2a"
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
const DELETED_DUPLICATE_PROFILE_IDS = ["recF7UAn0LkMZZrWZ", "recpNlNn6U6eq0M9r"];
const deletedDuplicateOutputIdSet = new Set(DELETED_DUPLICATE_OUTPUT_IDS);
const deletedDuplicateContentIdSet = new Set(DELETED_DUPLICATE_CONTENT_IDS);

function firstLinkedId(value) {
  return Array.isArray(value) && value.length ? String(value[0] || "") : "";
}

export function stripDeletedDuplicateOutputRecords(records) {
  if (!Array.isArray(records) || !records.length) return records;
  const next = records.filter((row) => {
    if (deletedDuplicateOutputIdSet.has(String(row?.id || ""))) return false;
    const contentId = String(
      row?.content_item_id
      || row?.content_item_airtable_id
      || firstLinkedId(row?.content_item_links)
      || firstLinkedId(row?.fields?.Content_Item)
      || "",
    );
    return !deletedDuplicateContentIdSet.has(contentId);
  });
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

// Do not call this from the 5-minute cron. production_request_outputs.platform_output_id
// has no index, so each DELETE scans that table until Postgres cancels it (57014)
// and the pool fills (PGRST003). The Pipeline list filter already drops these ids.
export async function purgeDeletedDuplicatePackages(env) {
  const result = { outputs: 0, requests: 0, ideas: 0, content: 0, snapshots: 0 };
  if (studioSupabaseConfigured(env)) {
    result.outputs = await deleteSupabaseByAirtableIds(env, "platform_outputs", DELETED_DUPLICATE_OUTPUT_IDS);
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
