import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const overview = fs.readFileSync(path.join(here, "assets/all-profiles-overview-1007.js"), "utf8");
const html = fs.readFileSync(path.join(here, "index.html"), "utf8");

test("All Profiles overview caps dashboard concurrency and times out hung fetches", () => {
  assert.match(overview, /function mapPool/);
  assert.match(overview, /mapPool\(profiles,\s*2,/);
  assert.match(overview, /Timed out after/);
  assert.match(overview, /timeoutMs:\s*25000/);
  assert.match(overview, /load_error/);
  assert.match(html, /all-profiles-overview-1007\.js\?v=0\.6\.588-ai-api-soft/);
});
