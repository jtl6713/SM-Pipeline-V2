// Resolve future-generation owner instructions from Supabase only.
// A Content Profile can explicitly link an Organization or be linked through
// a Brand. Ambiguous cross-tenant matches fail closed (no prompt leakage).
import { readSupabaseContentProfile, readSupabasePipelineSetting, supabaseRest } from "./supabase-pipeline-reads.mjs";
import { ownerGenerationSettingName, parseOwnerGenerationGuidance } from "./owner-generation-guidance.mjs";

const recordId = (value) => /^rec[A-Za-z0-9]{14}$/.test(String(value || "")) ? String(value) : null;
const firstId = (value) => Array.isArray(value) ? recordId(value[0]) : null;
const uuid = (value) => /^[a-f0-9-]{36}$/i.test(String(value || "")) ? String(value) : null;
const encodeFilter = (value) => encodeURIComponent(String(value || "")).replace(/\./g, "%2E");

export async function resolveOwnerOrganizationForProfile(env, profileId, dependencies = {}) {
  const readProfile = dependencies.readProfile || readSupabaseContentProfile;
  const rest = dependencies.rest || supabaseRest;
  const profile = await readProfile(env, profileId);
  if (!profile?.id) return null;
  const explicit = firstId(profile.fields?.Organization);
  if (explicit) return explicit;

  const brandRecordId = firstId(profile.fields?.Brand);
  const brandName = String(profile.fields?.Brand_Name || "").trim();
  if (!brandRecordId && !brandName) return null;

  // Airtable's Content Profile projection includes Brand links when available.
  // The name-only fallback is permitted only if it uniquely resolves one brand.
  const filter = brandRecordId
    ? `airtable_record_id=eq.${encodeFilter(brandRecordId)}`
    : `name=eq.${encodeFilter(brandName)}`;
  const brands = await rest(env, `brands?${filter}&select=organization_id&limit=2`);
  if (!Array.isArray(brands) || brands.length !== 1) return null;
  const orgId = uuid(brands[0].organization_id);
  if (!orgId) return null;
  const organizations = await rest(env,
    `organizations?id=eq.${encodeURIComponent(orgId)}&select=airtable_record_id&limit=2`);
  if (!Array.isArray(organizations) || organizations.length !== 1) return null;
  return recordId(organizations[0].airtable_record_id);
}

export async function loadOwnerGenerationForProfile(env, profileId, dependencies = {}) {
  const orgId = await resolveOwnerOrganizationForProfile(env, profileId, dependencies);
  if (!orgId) return { prompt: "", organization_id: null };
  const settingName = ownerGenerationSettingName(orgId);
  const readSetting = dependencies.readSetting || readSupabasePipelineSetting;
  const row = await readSetting(env, settingName, { activeOnly: true });
  const raw = row?.fields?.Setting_Value || row?.fields?.Value || "";
  return { ...parseOwnerGenerationGuidance(raw), organization_id: orgId };
}
