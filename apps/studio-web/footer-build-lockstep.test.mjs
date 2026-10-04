import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { assertFooterLockstep } from "./assert-footer-lockstep.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

test("Studio footer, UI label, and cache-bust queries stay locked to BUILD_ID", () => {
  const result = assertFooterLockstep();
  assert.equal(result.cacheKey, result.buildId.slice("item4-".length));
  assert.match(result.semver, /^\d+\.\d+\.\d+$/);
  assert.match(result.buildId, /^item4-\d+\.\d+\.\d+-/);
});

test("stale HTML cache-bust or footer label fails closed", () => {
  const html = fs.readFileSync(path.join(here, "index.html"), "utf8");
  const app = fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const staleHtml = html.replace(/UI build \d+\.\d+\.\d+/, "UI build 0.6.458");
  assert.throws(() => assertFooterLockstep({ html: staleHtml, app }), /does not match BUILD_ID/);
  const staleQuery = html.replace(/app-item4-0625\.js\?v=[^"']+/, "app-item4-0625.js?v=0.6.458-timed-script-vo-driven");
  assert.throws(() => assertFooterLockstep({ html: staleQuery, app }), /cache-bust is/);
});
