/**
 * Phase 3: Pipeline list / schedule-grid reads from Supabase.
 * Airtable remains write SoR. Default source is airtable until
 * STUDIO_READ_SOURCE=supabase and SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are set.
 *
 * What currently relies on this module (when flag + secrets are set):
 * - GET /api/outputs (full Pipeline list + mode=review)
 * - GET /api/outputs?mode=latest
 * - GET /api/outputs/schedule-grid
 * - Heavy cron Airtable→Supabase upsert (studioSyncSupabasePipelineReads)
 * - POST/GET /api/ops/supabase/sync
 * Everything else (Factory, Overview, Approve, produce, publish, ideas, assets)
 * still uses Airtable only.
 */

export const STUDIO_SUPABASE_PIPELINE_READ_ROUTES = Object.freeze([
  "GET /api/outputs",
  "GET /api/outputs?mode=latest",
  "GET /api/outputs?mode=review",
  "GET /api/outputs/schedule-grid",
]);

export function studioSupabaseConfigured(env) {
  return Boolean(String(env?.SUPABASE_URL || "").trim() && String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim());
}

export function studioReadSource(env) {
  const raw = String(env?.STUDIO_READ_SOURCE || "airtable").trim().toLowerCase();
  if (raw === "supabase" && studioSupabaseConfigured(env)) return "supabase";
  return "airtable";
}

export function studioSupabaseBaseUrl(env) {
  return String(env?.SUPABASE_URL || "").trim().replace(/\/+$/, "");
}

export async function supabaseRest(env, pathAndQuery, { method = "GET", body = null, headers = {} } = {}) {
  const base = studioSupabaseBaseUrl(env);
  const key = String(env?.SUPABASE_SERVICE_ROLE_KEY || "").trim();
  if (!base || !key) throw new Error("Supabase is not configured");
  const url = pathAndQuery.startsWith("http") ? pathAndQuery : `${base}/rest/v1/${pathAndQuery.replace(/^\//, "")}`;
  const res = await fetch(url, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: method === "GET" ? "count=exact" : "resolution=merge-duplicates,return=minimal",
      ...headers,
    },
    body: body == null ? undefined : (typeof body === "string" ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
  if (!res.ok) {
    const detail = typeof parsed === "string" ? parsed.slice(0, 400) : JSON.stringify(parsed).slice(0, 400);
    throw new Error(`Supabase ${method} ${url} failed ${res.status}: ${detail}`);
  }
  return parsed;
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

/** Build an Airtable-shaped record so existing mapOutput / f() keep working. */
export function airtableShapedOutputFromSupabase(row) {
  const contentAirtableId = row.content_item_airtable_id || null;
  return {
    id: row.airtable_record_id,
    fields: {
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
      Content_Item: contentAirtableId ? [contentAirtableId] : [],
      Content_Profile: row.content_profile_airtable_id ? [row.content_profile_airtable_id] : [],
    },
  };
}

export function airtableShapedContentFromSupabase(row) {
  return {
    id: row.airtable_record_id,
    fields: {
      Content_ID: row.content_number,
      Content_Title: row.content_title,
      Content_Status: row.content_status,
      Primary_Location: row.primary_location,
      Voiceover_Status: row.voiceover_status,
      Thumbnail_URL: row.thumbnail_url,
      Created_At: row.created_at,
    },
  };
}

export async function resolveSupabaseProfileId(env, airtableProfileId) {
  const id = String(airtableProfileId || "").trim();
  if (!id) return null;
  const rows = await supabaseRest(
    env,
    `content_profiles?airtable_record_id=eq.${encodeURIComponent(id)}&select=id,airtable_record_id&limit=1`,
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
  "content_items(airtable_record_id,content_number,content_title)",
  "content_profiles(airtable_record_id)",
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
    records: flat.map(airtableShapedOutputFromSupabase),
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
    records: flat.map((row) => ({
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
    })),
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
    extras: {},
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
    error_messages: {},
  };
}

/**
 * Upsert one profile's content items + platform outputs into Supabase.
 * `deps.listRecords` / `deps.f` / `deps.contentProfileFilterFormula` come from worker.js.
 */
export async function syncProfilePipelineToSupabase(env, profile, deps = {}) {
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

  await upsertChunk(env, "content_profiles", [mapAirtableProfileToSupabase(profile)]);
  const profileUuid = await resolveSupabaseProfileId(env, profile.id);
  if (!profileUuid) throw new Error(`Supabase profile missing after upsert for ${profile.id}`);

  const profileFormula = contentProfileFilterFormula(profile);
  const outputLimit = Math.max(50, Math.min(1000, Number(deps.outputLimit) || 500));
  const contentLimit = Math.max(50, Math.min(500, Number(deps.contentLimit) || 250));

  const [contents, newest, openExtra] = await Promise.all([
    listRecords(env, env.AIRTABLE_CONTENT_TABLE_ID, {
      limit: contentLimit,
      sortField: "Created_At",
      filterFormula: profileFormula,
      fields: ["Content_ID", "Content_Title", "Content_Status", "Content_Profile", "Primary_Location", "Voiceover_Status", "Thumbnail_URL", "Created_At"],
    }).catch(() => []),
    listRecords(env, env.AIRTABLE_OUTPUT_TABLE_ID, {
      limit: outputLimit,
      sortField: "Output_ID",
      sortDirection: "desc",
      filterFormula: profileFormula,
      fields: outputFields,
    }).catch(() => []),
    typeof deps.listOpenOutputs === "function"
      ? deps.listOpenOutputs(profile).catch(() => [])
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
    await upsertChunk(env, "content_items", contentRows.slice(i, i + 200));
  }

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
    await upsertChunk(env, "platform_outputs", outputRows.slice(i, i + 200));
  }

  return {
    ok: true,
    profile_id: profile.id,
    content_items: contentRows.length,
    platform_outputs: outputRows.length,
    newest_outputs: (newest || []).length,
    open_outputs: (openExtra || []).length,
  };
}

export async function syncAllProfilesPipelineToSupabase(env, profiles, deps = {}) {
  const results = [];
  for (const profile of profiles || []) {
    if (!profile?.id) continue;
    if (deps.f && !deps.f(profile, "Active")) continue;
    try {
      results.push(await syncProfilePipelineToSupabase(env, profile, deps));
    } catch (error) {
      results.push({ ok: false, profile_id: profile.id, error: error?.message || String(error) });
    }
  }
  return { ok: true, results };
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
