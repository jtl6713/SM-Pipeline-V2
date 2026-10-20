import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { runInNewContext } from "node:vm";

const here = path.dirname(fileURLToPath(import.meta.url));
const api = await readFile(path.join(here, "worker-functions-04.mjs"), "utf8");
const ui = await readFile(path.join(here, "../studio-web/assets/all-profiles-overview-1007.js"), "utf8");

function functionSource(start, end) {
  const from = api.indexOf(start);
  const to = api.indexOf(end, from);
  assert.ok(from !== -1 && to > from, `Expected source contract: ${start}`);
  return api.slice(from, to).replace(/^export /, "").trim();
}
const health = runInNewContext("(" + functionSource(
  "function studioProfilesOverviewRowsHealthy(",
  "function profilesOverviewSnapshotView()",
) + ")");

const scheduled = { Facebook: 4, Instagram: 5, TikTok: 3, YouTube: 2 };
function row(id, city, n = 2) {
  return { id, city_label: city, name: city, scheduled: { ...scheduled },
    manual: 0, failed: 0, approval: n, ideas: 12,
    approved_unpublished: 0, overdue_unpublished: 0 };
}
const idLa = "recF7UAn0LkMZZrWZ";
const idChicago = "recT2rbKX3MF7cVFU";

test("Home snapshot rejects four Chicago zero rows even if profile IDs differ", () => {
  const bad = ["recF7UAn0LkMZZrWZ", "recT2rbKX3MF7cVFU", "recgtK8Z7eNADNtVy", "recpNlNn6U6eq0M9r"].map(id =>
    ({ ...row(id, "Chicago", 0), scheduled: { Facebook: 0, Instagram: 0, TikTok: 0, YouTube: 0 }, ideas: 0 })
  );
  assert.equal(health(bad), false);
  assert.equal(health([row(idLa, "Los Angeles"), row(idChicago, "Chicago")]), true);
  assert.equal(health([{...row(idLa,"Los Angeles"), scheduled: {Facebook:0}}]), false);
  assert.equal(health([row(idLa, "Los Angeles"), row(idLa, "Chicago")]), false);
});

test("Hourly autonomous refill resolves full Airtable profiles and never writes shared Home snapshot", async () => {
  const raw = [
    { id: idLa, fields: { Profile_Name: "LA - Los Angeles", Market_Name: "Los Angeles", Active: true } },
    { id: idChicago, fields: { Profile_Name: "ChicagoShining - Chicago", Market_Name: "Chicago", Active: true } },
  ];
  // Presentation-mapped input intentionally omits .fields.
  const mapped = raw.map(p => ({ id: p.id, name: p.fields.Profile_Name, city_label: p.fields.Market_Name }));
  const badSnapshot = {
    rows: raw.map(p => ({...row(p.id, "Chicago", 0), scheduled: { Facebook:0, Instagram:0, TikTok:0, YouTube:0 }, ideas:0 })),
    at: Date.now(),
  };
  let sourceSeen = null;
  let writes = 0;
  const ctx = {
    studioProfilesOverviewRowsHealthy: health,
    studioProfilesOverviewAuthKey: p => p.map(x => x.id).join(","),
    readStudioProfilesOverviewSnapshot: async () => badSnapshot,
    STUDIO_PROFILES_OVERVIEW_CACHE_MS: 900000,
    listContentProfileRecords: async () => raw,
    f: (r, field) => r?.fields?.[field] ?? null,
    buildStudioProfilesOverviewRows: async (_, p) => {
      sourceSeen = p;
      return [row(idLa, "Los Angeles"), row(idChicago, "Chicago")];
    },
    validateStudioProfilesOverviewRows: (rows, profiles) => {
      assert.equal(health(rows), true);
      assert.ok(profiles.every(profile => profile.fields?.Profile_Name));
    },
    writeStudioProfilesOverviewSnapshot: async () => { writes++; },
    autonomousRefillScoresFromOverview: rows => ({ rows: rows.length }),
    AUTONOMOUS_SCHEDULED_TARGET: 500,
    console,
  };
  const refill = runInNewContext("(" + functionSource(
    "export async function studioLoadAutonomousRefillScores(",
    "/*__STUDIO_WORKER_END:studioLoadAutonomousRefillScores__*/",
  ) + ")", ctx);
  const result = await refill({}, mapped, { refresh: false });
  assert.equal(result.source, "live");
  assert.deepEqual(sourceSeen?.map(p => p.id), raw.map(p => p.id));
  assert.equal(writes, 0, "hourly scoring must not poison R2 Home snapshot");
  assert.equal(result.overview.length, 2);
});

test("Browser rejects invalid cached and fresh duplicate-city overview", () => {
  assert.match(ui, /function validOverviewRows\(rows\)/);
  assert.match(ui, /if \(!validOverviewRows\(parsed\?\.rows\)\)/);
  assert.match(ui, /if \(!validOverviewRows\(rows\)\) return false/);
  assert.match(api, /Refusing to overwrite Home overview with incomplete or duplicate-city rows/);
});
