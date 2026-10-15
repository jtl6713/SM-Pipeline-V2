#!/usr/bin/env node
import { performance } from "node:perf_hooks";

const SUPABASE_URL = String(process.env.SUPABASE_URL || "").replace(/\/$/, "");
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const headers = {
  apikey: KEY,
  Authorization: `Bearer ${KEY}`,
};

async function timed(label, path) {
  const t0 = performance.now();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  const body = await res.json();
  const ms = performance.now() - t0;
  const count = Array.isArray(body) ? body.length : null;
  console.log(JSON.stringify({ label, ms: Math.round(ms), status: res.status, count }));
  return { label, ms, status: res.status, count };
}

const profileRes = await fetch(
  `${SUPABASE_URL}/rest/v1/content_profiles?airtable_record_id=eq.recT2rbKX3MF7cVFU&select=id`,
  { headers },
);
const profiles = await profileRes.json();
const profileId = profiles?.[0]?.id;
if (!profileId) {
  console.error("Chicago profile missing — run import first");
  process.exit(1);
}

await timed("pipeline_outputs_250", `platform_outputs?content_profile_id=eq.${profileId}&select=id,output_number,platform,output_status,review_status,publish_status,scheduled_post_date,thumbnail_url,final_file_url,content_item_id&order=output_number.desc.nullslast&limit=250`);
await timed("pipeline_join_style", `platform_outputs?content_profile_id=eq.${profileId}&select=id,output_number,platform,output_status,content_items(content_number,content_title)&order=output_number.desc.nullslast&limit=250`);
await timed("awaiting_approval", `platform_outputs?content_profile_id=eq.${profileId}&do_not_publish=eq.false&or=(output_status.eq.Ready%20for%20Review,review_status.eq.Review%20Sent)&select=id,output_number,platform,output_status,review_status&order=output_number.desc&limit=80`);
await timed("content_items_100", `content_items?content_profile_id=eq.${profileId}&select=id,content_number,content_title,content_status,created_at&order=created_at.desc.nullslast&limit=100`);
await timed("published_100", `platform_outputs?content_profile_id=eq.${profileId}&published_at=not.is.null&select=id,output_number,platform,published_at&order=published_at.desc&limit=100`);
