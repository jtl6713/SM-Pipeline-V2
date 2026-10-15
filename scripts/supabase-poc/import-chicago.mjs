#!/usr/bin/env node
/**
 * Phase 2 POC: import Chicago Airtable export JSON into sm-pipeline-v2-dev.
 * Secrets: source /tmp/sm-pipeline-v2-dev.supabase.env (never commit).
 *
 * Expects export files in /tmp/supabase-poc-export/ (or EXPORT_DIR).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const EXPORT_DIR = process.env.EXPORT_DIR || "/tmp/supabase-poc-export";

if (!SUPABASE_URL || !KEY) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
  "Content-Type": "application/json",
  Prefer: "resolution=merge-duplicates,return=representation",
};

function loadJson(name) {
  return JSON.parse(readFileSync(resolve(EXPORT_DIR, name), "utf8"));
}

function cell(rec, fieldId) {
  return rec?.cellValuesByFieldId?.[fieldId];
}

function selectName(value) {
  if (value == null) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object" && value.name) return String(value.name);
  return null;
}

function firstLinkId(value) {
  if (!Array.isArray(value) || !value.length) return null;
  const row = value[0];
  if (typeof row === "string") return row;
  return row?.id || null;
}

function uuidFromAirtable(recId) {
  // Deterministic UUIDv5-ish namespace from airtable id (simple hex pad; not RFC UUID5).
  // Prefer letting Postgres gen_random_uuid and map via airtable_record_id.
  return null;
}

async function upsert(table, rows, onConflict = "airtable_record_id") {
  if (!rows.length) return [];
  const chunkSize = 200;
  const out = [];
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?on_conflict=${onConflict}`,
      {
        method: "POST",
        headers,
        body: JSON.stringify(chunk),
      },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`${table} upsert failed ${res.status}: ${text.slice(0, 500)}`);
    }
    const parsed = text ? JSON.parse(text) : [];
    out.push(...(Array.isArray(parsed) ? parsed : []));
    console.log(`upserted ${table}: ${Math.min(i + chunk.length, rows.length)}/${rows.length}`);
  }
  return out;
}

async function selectAll(table, query = "select=id,airtable_record_id") {
  const rows = [];
  let offset = 0;
  for (;;) {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/${table}?${query}&limit=1000&offset=${offset}`,
      { headers: { ...headers, Prefer: "count=exact" } },
    );
    const text = await res.text();
    if (!res.ok) throw new Error(`${table} select failed ${res.status}: ${text.slice(0, 400)}`);
    const batch = text ? JSON.parse(text) : [];
    rows.push(...batch);
    if (batch.length < 1000) break;
    offset += 1000;
  }
  return rows;
}

async function main() {
  const profiles = loadJson("content_profiles.json");
  const contentBundle = loadJson("content_items_chicago.json");
  const outputsBundle = loadJson("platform_outputs_chicago.json");

  // Org + brand stubs for FK integrity
  await upsert("organizations", [
    {
      airtable_record_id: "recLwmq0WzpG3MHQj",
      name: "ORG-JLD",
    },
  ]);
  await upsert("brands", [
    {
      airtable_record_id: "recjLbnpXhVnqHBgG",
      name: "BRD-CHICAGOSHINING",
      organization_id: (
        await selectAll("organizations", "select=id,airtable_record_id&airtable_record_id=eq.recLwmq0WzpG3MHQj")
      )[0]?.id,
    },
  ]);

  const orgs = Object.fromEntries(
    (await selectAll("organizations")).map((r) => [r.airtable_record_id, r.id]),
  );
  const brands = Object.fromEntries(
    (await selectAll("brands")).map((r) => [r.airtable_record_id, r.id]),
  );

  const chicago = profiles.find((p) => p.id === "recT2rbKX3MF7cVFU");
  await upsert(
    "content_profiles",
    profiles.map((p) => ({
      airtable_record_id: p.id,
      profile_name: p.profile_name,
      brand_name: p.brand_name,
      market_name: p.market_name,
      active: Boolean(p.active),
      organization_id: orgs[p.org] || null,
      brand_id: brands[p.brand] || null,
      platform_setup: {},
    })),
  );

  const profileMap = Object.fromEntries(
    (await selectAll("content_profiles")).map((r) => [r.airtable_record_id, r.id]),
  );
  const chicagoProfileId = profileMap["recT2rbKX3MF7cVFU"];
  if (!chicagoProfileId) throw new Error("Chicago profile missing after upsert");

  const contentRows = (contentBundle.records || []).map((rec) => ({
    airtable_record_id: rec.id,
    content_number: cell(rec, "fldmNgbvXvcKrZFKj") ?? null,
    content_title: cell(rec, "fldq6kRZTr6zwisuQ") || null,
    content_status: selectName(cell(rec, "fldtkhVaQzr0oCTB7")),
    content_profile_id: chicagoProfileId,
    primary_location: cell(rec, "fldHrXO0Rt1Mmicjj") || null,
    voiceover_status: selectName(cell(rec, "fldWVqlvqBd8jxOXu")),
    thumbnail_url: cell(rec, "fldDT6Lk2IyAAsuWe") || null,
    created_at: cell(rec, "fldLQTN03mZirkSHs") || rec.createdTime || null,
    extras: {
      production_request_airtable_id: firstLinkId(cell(rec, "fldIBw6fwzypBSdHD")),
    },
  }));
  await upsert("content_items", contentRows);

  const contentMap = Object.fromEntries(
    (await selectAll("content_items")).map((r) => [r.airtable_record_id, r.id]),
  );

  const outputRows = (outputsBundle.records || []).map((rec) => {
    const contentAirtableId = firstLinkId(cell(rec, "fldk6GSLmu2VXZa8x"));
    return {
      airtable_record_id: rec.id,
      output_number: cell(rec, "fldxQ7Ep88cpC1g2y") ?? null,
      content_item_id: contentAirtableId ? contentMap[contentAirtableId] || null : null,
      content_profile_id: chicagoProfileId,
      platform: selectName(cell(rec, "fldse0PC0P0WewJnH")) || "Unknown",
      format: selectName(cell(rec, "fldGNQY7PkNE4QyY8")),
      aspect_ratio: selectName(cell(rec, "fldkEHGte8ZlvApJd")),
      studio_output_type: selectName(cell(rec, "fldmj5rc7t0wIuzsP")),
      output_status: selectName(cell(rec, "fldXlaROiROoaAgoc")),
      render_status: selectName(cell(rec, "fldtEZy0rdIVS5LML")),
      review_status: selectName(cell(rec, "fldUwrl6I0U6BMJ2s")),
      publish_status: selectName(cell(rec, "fldViUkfcG57W6Es4")),
      do_not_publish: Boolean(cell(rec, "fldSaF56wryp4N2et")),
      test_run_id: cell(rec, "fld5Ew2FySt51Jl2Q") || null,
      output_title: cell(rec, "fldU1cHGtlPHOhPO7") || null,
      thumbnail_url: cell(rec, "fldhhiC4GnhOWMZfV") || null,
      final_file_url: cell(rec, "fldssVMZv37e2Ij6y") || null,
      scheduled_post_date: cell(rec, "fldfswSq2xy2rHrUD") || null,
      published_at: cell(rec, "fldQPpzUuPMzvqrtj") || null,
      selected_clip_count: cell(rec, "fldi2GtueX95tSYch") ?? null,
      error_messages: {},
    };
  });
  await upsert("platform_outputs", outputRows);

  const [ciCount, poCount] = await Promise.all([
    selectAll("content_items", "select=id"),
    selectAll("platform_outputs", "select=id"),
  ]);
  console.log(
    JSON.stringify(
      {
        ok: true,
        chicago_profile: chicago?.profile_name,
        content_items: ciCount.length,
        platform_outputs: poCount.length,
        expected_content_items: contentRows.length,
        expected_platform_outputs: outputRows.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
