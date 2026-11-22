import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
import { carouselCronCandidateAdmission } from "./carousel-cron-legacy-admission.mjs";

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const reconciler = fs.readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");

test("#2340 every-five-minute Supabase carousel has exactly one independent owner", () => {
  const invocations = [...worker.matchAll(/studioReconcileInstagramCarousels\(env/g)];
  assert.equal(invocations.length, 1, "never run the old heavy owner and the independent owner together");
  const index = invocations[0].index;
  assert.match(worker.slice(index - 130, index + 90),
    /studioWriteSource\(env\) === "supabase"[\s\S]*ctx\.waitUntil\(studioReconcileInstagramCarousels\(env, \{ limit: 1 \}\)/);
  assert.ok(index < worker.indexOf("const coolMs = airtableCooldownWaitMs();", index),
    "independent carousel work must run before the shared Airtable cooldown return");
  assert.ok(index < worker.indexOf("await factoryBatchCronResume(env, ctx)", index),
    "independent carousel work must not wait behind Factory recovery");
  const region = worker.slice(index - 210, index + 420);
  assert.doesNotMatch(region, /if \(cadence\.heavy\)/,
    "the new independent stage must run on every five-minute tick, not only half-hour maintenance");
  assert.doesNotMatch(region, /fetch\(|graph\.facebook\.com|publishNow|media_publish/,
    "independent owner only invokes existing Python stage preflights; never direct Graph create");
});

test("#2340 historical AP0C and later provider stages remain behind original audit", () => {
  const start = reconciler.indexOf("export async function studioReconcileInstagramCarousels(");
  const end = reconciler.indexOf("/*__STUDIO_WORKER_END:studioReconcileInstagramCarousels__*/", start);
  const code = reconciler.slice(start, end);
  assert.ok(start >= 0 && end > start);
  assert.match(code, /studioWriteSource\(env\) !== "supabase"/);
  assert.match(code, /carouselCronCandidateAdmission\(row, scan\.stage\)/);
  assert.ok(code.indexOf("carouselCronCandidateAdmission(row, scan.stage)") <
    code.indexOf("await scan.pulse(env, row)"), "provider preflight must precede any Python stage call");

  const row = {
    id: "recY7doKbEmEohN6g",
    fields: {
      Platform: "Instagram", Platform_Output_Type: "Instagram Carousel",
      Review_Status: "Approved", Output_Status: "Approved for Publishing",
      Publish_Status: "Ready to Publish", Do_Not_Publish: false,
      Auto_Publish_Enabled: true, Scheduled_Post_Date: "2026-11-21T13:30:00Z",
      Issue_2340_AP0C_Gallery_Due_Promotion: {
        source_record_id: "recY7doKbEmEohN6g",
        original_publish_status: "Ready to Schedule",
        reason: "original package restored exactly four approved images",
      },
    },
  };
  const now = Date.parse("2026-11-22T04:00:00Z");
  assert.equal(carouselCronCandidateAdmission(row, "ap0c", now).eligible, true);
  const held = structuredClone(row);
  held.fields.Do_Not_Publish = true;
  assert.equal(carouselCronCandidateAdmission(held, "ap0c", now).eligible, false);
  const unaudited = structuredClone(row);
  unaudited.fields.Issue_2340_AP0C_Gallery_Due_Promotion = null;
  assert.equal(carouselCronCandidateAdmission(unaudited, "ap3c", now).eligible, false);
});
