import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const source = readFileSync(new URL("./worker-functions-04.mjs", import.meta.url), "utf8");
const start = source.indexOf("export async function studioReconcileFacebookReels(");
const end = source.indexOf("/*__STUDIO_WORKER_END:studioReconcileFacebookReels__*/", start);
assert.ok(start >= 0 && end > start);
const body = source.slice(start, end).replace("export async function", "async function");
const row = (id, platform, type) => ({ id, fields: { Platform: platform, Platform_Output_Type: type } });

test("Facebook Reel reconciliation rejects over-returned records and does not stamp preflight skips", async () => {
  const valid = row("valid", "Facebook", "Facebook Reel");
  const skipped = row("skip", "Facebook", "Facebook Reel");
  const youtube = row("yt", "YouTube", "YouTube Short");
  const tiktok = row("tt", "TikTok", "TikTok Video");
  const photo = row("photo", "Facebook", "Facebook Photo Set");
  const calls = [], stamps = [], formulas = [];
  const reconcile = new Function("pipelineStageBackend", "studioFacebookGraphPublishHeld", "listRecords", "f", "studioPublishCanDispatchNow", "studioPulseFbs3", "studioPulseFbs4", "studioStampPublishDispatch", body + "\nreturn studioReconcileFacebookReels;")(
    () => ({ mode: "python" }), () => false,
    async (_env, _table, options) => {
      formulas.push(options.filterFormula);
      return options.filterFormula.includes("Published Pending Finalize") ? [youtube, tiktok, photo, valid] :
        options.filterFormula.includes("Reel Processing") ? [] : [youtube, tiktok, photo, skipped, valid];
    },
    (record, key) => record.fields[key], () => true,
    async (_env, record) => { calls.push(["create", record.id]); return record.id === "skip" ? { ok: true, skipped: "slideshow_status_not_ready" } : { ok: true, video_id: "v1" }; },
    async (_env, record) => { calls.push(["poll", record.id]); return { ok: true }; },
    async (_env, record) => { stamps.push(record.id); }
  );
  await reconcile({}, { limit: 5 });
  assert.deepEqual(calls, [["create","skip"],["create","valid"],["poll","valid"]]);
  assert.deepEqual(stamps, ["valid"]);
  assert.ok(formulas.every(formula => formula.includes('{Platform}="Facebook"') && formula.includes('{Platform_Output_Type}="Facebook Reel"')));
});

test("FBS3 and native fallback fail closed on authoritative platform/format mismatch", () => {
  const file = readFileSync(new URL("./worker-functions-03.mjs", import.meta.url), "utf8");
  for (const name of ["studioPulseFbs3", "studioPublishFacebookReelNative"]) {
    const start = file.indexOf("function " + name + "(");
    const end = file.indexOf("/*__STUDIO_WORKER_END:" + name + "__*/", start);
    const section = file.slice(start, end);
    assert.match(section, /f\(latest, "Platform"\) !== "Facebook"/);
    assert.match(section, /f\(latest, "Platform_Output_Type"\) !== "Facebook Reel"/);
    assert.match(section, /wrong-facebook-reel-output/);
  }
});
