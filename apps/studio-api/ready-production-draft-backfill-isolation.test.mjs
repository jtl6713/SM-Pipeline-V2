import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("#2574 optional Supabase Draft backfill failure cannot starve Ready R2 claims", async () => {
  const source = await readFile(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
  const start = source.indexOf("async function studioReadyProductionCronResume(");
  const end = source.indexOf("export { studioReadyProductionCronResume };", start);
  assert.ok(start >= 0 && end > start);
  const cron = source.slice(start,end);
  assert.match(cron, /stage = "discovery";/);
  assert.match(cron, /await discoverReadyProductionIdeas\(/);
  assert.match(cron, /stage = "enqueue";/);
  assert.match(cron, /stage = "draft_backfill";/);
  assert.match(cron, /await Promise\.allSettled\(\[/);
  assert.match(cron, /discoverReadyVibeProductionDrafts/);
  assert.match(cron, /discoverAssetReadyProductionDrafts/);
  assert.match(cron, /draftReadErrors\.push\(\{ source, reason \}\)/);
  assert.match(cron, /optional_draft_read_errors: draftReadErrors/);
  assert.match(cron, /stage = "claim"/);
  assert.ok(cron.indexOf("stage = \"claim\"") > cron.indexOf("await Promise.allSettled(["));
  assert.doesNotMatch(cron, /const \[recentVibes, ordinaryDrafts\] = await Promise\.all\(/);
  assert.match(cron, /readyProductionSelectJobs\(jobs,/);
  assert.match(cron, /await readyProductionClaim\(/);
  assert.match(cron, /final_approval: "human_only"/);
});
