import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(here, "../studio-api/worker.js"), "utf8");

test("All Profiles overview uses one lean /api/profiles/overview call", () => {
  assert.match(overview, /\/api\/profiles\/overview/);
  assert.doesNotMatch(overview, /\/api\/dashboard\?profile=/);
  assert.doesNotMatch(overview, /mapPool\(profiles/);
  assert.match(overview, /requestIdleCallback|setTimeout\(start/);
  assert.match(overview, /sessionStorage/);
  assert.match(overview, /Showing last good overview/);
  assert.match(html, /all-profiles-overview-1007\.js\?v=/);
});

test("Worker exposes profilesOverview lean batch route", () => {
  assert.match(worker, /pathname === "\/api\/profiles\/overview"/);
  assert.match(worker, /async function profilesOverview/);
  assert.match(worker, /Skip produce-job hydration/);
  assert.match(worker, /studio_home_overview_lean_v1: true/);
});
