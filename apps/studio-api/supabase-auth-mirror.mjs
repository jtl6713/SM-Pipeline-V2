/**
 * Airtable → Supabase auth table mirror (Users / Memberships / Orgs / Brands).
 * Mirror only — does not flip resolveAuthorization off Airtable.
 * Missing tables or extras columns are skipped/soft-failed so half-hour sync
 * stays completed+ok while schema catches up.
 */

import {
  homogenizeUpsertRows,
  studioSupabaseConfigured,
  supabaseRest,
} from "./supabase-pipeline-reads.mjs";

export const AUTH_ORG_SYNC_FIELDS = Object.freeze([
  "Organization_ID",
  "Organization_Name",
]);

export const AUTH_BRAND_SYNC_FIELDS = Object.freeze([
  "Brand_ID",
  "Brand_Name",
  "Organization",
  "Brand_Voice",
  "Active",
]);

export const AUTH_USER_SYNC_FIELDS = Object.freeze([
  "User_ID",
  "Email",
  "Display_Name",
  "User_Status",
  "Active",
]);

export const AUTH_MEMBERSHIP_SYNC_FIELDS = Object.freeze([
  "Membership_ID",
  "User",
  "Organization",
  "Role",
  "Active",
  "Membership_Status",
  "Is_Default",
  "Allowed_Brands",
  "Default_Brand",
]);

function text(value) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function selectName(value) {
  if (value == null) return null;
  if (typeof value === "string") return text(value);
  if (typeof value === "object" && value.name != null) return text(value.name);
  return text(value);
}

function linkIds(value) {
  if (!Array.isArray(value)) return [];
  return value.map((row) => {
    if (typeof row === "string") return text(row);
    return text(row?.id);
  }).filter(Boolean);
}

function firstLink(value) {
  return linkIds(value)[0] || null;
}

function authTableMissing(error) {
  const message = String(error?.message || error || "");
  return /PGRST205|schema cache|does not exist|Could not find the table|404/.test(message);
}

function authExtrasMissing(error) {
  const message = String(error?.message || error || "");
  return /PGRST204|Could not find the '.+' column|extras|organization_key|brand_key|user_key|membership_key|is_default/i.test(message);
}

async function upsertAuthChunk(env, table, rows, { withExtras = true } = {}) {
  if (!rows.length) return { ok: true, rows: 0, withExtras };
  const body = homogenizeUpsertRows(rows.map((row) => {
    if (withExtras) return row;
    const out = { ...row };
    delete out.extras;
    delete out.organization_key;
    delete out.brand_key;
    delete out.user_key;
    delete out.membership_key;
    delete out.is_default;
    return out;
  }));
  try {
    await supabaseRest(env, `${table}?on_conflict=airtable_record_id`, {
      method: "POST",
      body,
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    });
    return { ok: true, rows: body.length, withExtras };
  } catch (error) {
    if (withExtras && authExtrasMissing(error)) {
      return upsertAuthChunk(env, table, rows, { withExtras: false });
    }
    throw error;
  }
}

async function mapAirtableIdsToUuid(env, table, airtableIds) {
  const unique = [...new Set((airtableIds || []).filter(Boolean))];
  const out = new Map();
  for (let index = 0; index < unique.length; index += 50) {
    const batch = unique.slice(index, index + 50);
    const filter = batch.map((id) => `airtable_record_id.eq.${encodeURIComponent(id)}`).join(",");
    const rows = await supabaseRest(
      env,
      `${table}?or=(${filter})&select=id,airtable_record_id`,
    ).catch(() => []);
    for (const row of rows || []) {
      if (row?.airtable_record_id && row?.id) out.set(row.airtable_record_id, row.id);
    }
  }
  return out;
}

export function mapOrganizationAuthRow(record) {
  const fields = record?.fields || {};
  const name = text(fields.Organization_Name) || text(fields.Organization_ID) || record.id;
  return {
    airtable_record_id: record.id,
    name,
    organization_key: text(fields.Organization_ID),
    extras: {
      Organization_ID: text(fields.Organization_ID),
      Organization_Name: text(fields.Organization_Name),
    },
  };
}

export function mapBrandAuthRow(record, organizationUuid) {
  const fields = record?.fields || {};
  const name = text(fields.Brand_Name) || text(fields.Brand_ID) || record.id;
  if (!organizationUuid) return null;
  return {
    airtable_record_id: record.id,
    organization_id: organizationUuid,
    name,
    brand_voice: text(fields.Brand_Voice),
    brand_key: text(fields.Brand_ID),
    extras: {
      Brand_ID: text(fields.Brand_ID),
      Brand_Name: text(fields.Brand_Name),
      Organization: linkIds(fields.Organization),
      Active: fields.Active == null ? null : Boolean(fields.Active),
    },
  };
}

export function mapUserAuthRow(record) {
  const fields = record?.fields || {};
  const email = text(fields.Email)?.toLowerCase() || null;
  return {
    airtable_record_id: record.id,
    email,
    display_name: text(fields.Display_Name),
    user_status: selectName(fields.User_Status) || "Active",
    active: fields.Active == null ? true : Boolean(fields.Active),
    user_key: text(fields.User_ID),
    extras: {
      User_ID: text(fields.User_ID),
      Email: email,
      Display_Name: text(fields.Display_Name),
    },
  };
}

const ALLOWED_ROLES = new Set(["Owner", "Admin", "Editor", "Reviewer", "Viewer"]);

export function mapMembershipAuthRow(record, { userUuid, organizationUuid }) {
  const fields = record?.fields || {};
  if (!userUuid || !organizationUuid) return null;
  const roleRaw = selectName(fields.Role) || "Viewer";
  const role = ALLOWED_ROLES.has(roleRaw) ? roleRaw : "Viewer";
  return {
    airtable_record_id: record.id,
    user_id: userUuid,
    organization_id: organizationUuid,
    role,
    active: fields.Active == null ? true : Boolean(fields.Active),
    membership_status: selectName(fields.Membership_Status) || "Active",
    membership_key: text(fields.Membership_ID),
    is_default: Boolean(fields.Is_Default),
    extras: {
      Membership_ID: text(fields.Membership_ID),
      User: linkIds(fields.User),
      Organization: linkIds(fields.Organization),
      Allowed_Brands: linkIds(fields.Allowed_Brands),
      Default_Brand: linkIds(fields.Default_Brand),
      Is_Default: Boolean(fields.Is_Default),
      Role: role,
    },
  };
}

/**
 * Half-hour / manual auth mirror. Best-effort: missing auth tables skip ok;
 * upsert failures return ok:false but callers should not fail the whole sync.
 */
export async function syncAuthTablesToSupabase(env, deps = {}) {
  await deps.assertLease?.();
  const listRecords = deps.listRecords;
  if (!listRecords) throw new Error("syncAuthTablesToSupabase requires listRecords");
  if (!studioSupabaseConfigured(env)) {
    return { skipped: true, reason: "supabase_not_configured", ok: true };
  }

  const tables = deps.authTables || {
    organizations: "Organizations",
    brands: "Brands",
    users: "Studio Users",
    memberships: "Studio Memberships",
  };

  try {
    await deps.assertLease?.();
    const orgRecords = await listRecords(env, tables.organizations, {
      limit: Math.max(10, Math.min(100, Number(deps.orgLimit) || 50)),
      fields: [...AUTH_ORG_SYNC_FIELDS],
    });
    const orgRows = (orgRecords || []).map(mapOrganizationAuthRow).filter((row) => row?.airtable_record_id);
    let orgUpsert = await upsertAuthChunk(env, "organizations", orgRows);
    const orgMap = await mapAirtableIdsToUuid(env, "organizations", orgRows.map((row) => row.airtable_record_id));

    await deps.assertLease?.();
    const brandRecords = await listRecords(env, tables.brands, {
      limit: Math.max(20, Math.min(200, Number(deps.brandLimit) || 100)),
      fields: [...AUTH_BRAND_SYNC_FIELDS],
    });
    const brandRows = (brandRecords || []).map((record) => {
      const orgAirtableId = firstLink(record?.fields?.Organization);
      return mapBrandAuthRow(record, orgAirtableId ? orgMap.get(orgAirtableId) : null);
    }).filter(Boolean);
    let brandUpsert = await upsertAuthChunk(env, "brands", brandRows);

    await deps.assertLease?.();
    const userRecords = await listRecords(env, tables.users, {
      limit: Math.max(20, Math.min(200, Number(deps.userLimit) || 100)),
      fields: [...AUTH_USER_SYNC_FIELDS],
    });
    const userRows = (userRecords || []).map(mapUserAuthRow).filter((row) => row?.airtable_record_id);
    let userUpsert = await upsertAuthChunk(env, "studio_users", userRows);
    const userMap = await mapAirtableIdsToUuid(env, "studio_users", userRows.map((row) => row.airtable_record_id));

    await deps.assertLease?.();
    const membershipRecords = await listRecords(env, tables.memberships, {
      limit: Math.max(20, Math.min(300, Number(deps.membershipLimit) || 150)),
      fields: [...AUTH_MEMBERSHIP_SYNC_FIELDS],
    });
    let membershipUnresolved = 0;
    const membershipRows = [];
    for (const record of membershipRecords || []) {
      const userAirtableId = firstLink(record?.fields?.User);
      const orgAirtableId = firstLink(record?.fields?.Organization);
      const mapped = mapMembershipAuthRow(record, {
        userUuid: userAirtableId ? userMap.get(userAirtableId) : null,
        organizationUuid: orgAirtableId ? orgMap.get(orgAirtableId) : null,
      });
      if (!mapped) {
        membershipUnresolved += 1;
        continue;
      }
      membershipRows.push(mapped);
    }
    let membershipUpsert = await upsertAuthChunk(env, "studio_memberships", membershipRows);

    const extras = Boolean(
      orgUpsert.withExtras && brandUpsert.withExtras && userUpsert.withExtras && membershipUpsert.withExtras,
    );
    return {
      ok: true,
      extras,
      organizations: orgUpsert.rows,
      brands: brandUpsert.rows,
      studio_users: userUpsert.rows,
      studio_memberships: membershipUpsert.rows,
      memberships_unresolved: membershipUnresolved,
      scanned: {
        organizations: (orgRecords || []).length,
        brands: (brandRecords || []).length,
        studio_users: (userRecords || []).length,
        studio_memberships: (membershipRecords || []).length,
      },
    };
  } catch (error) {
    if (authTableMissing(error)) {
      return { skipped: true, reason: "auth_tables_missing", ok: true, error: error?.message || String(error) };
    }
    return { ok: false, error: error?.message || String(error) };
  }
}
