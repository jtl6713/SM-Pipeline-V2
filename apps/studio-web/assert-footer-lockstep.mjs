import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

export const FOOTER_LOCKSTEP_ASSETS = [
  "styles-phase7-0621.css",
  "pipeline-schedule-grid-0622.js",
  "platform-schedule-calendar-0924.js",
  "timed-script.js",
  "app-item4-0625.js",
];

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function assertFooterLockstep({ html, app } = {}) {
  const htmlText = html ?? fs.readFileSync(path.join(here, "index.html"), "utf8");
  const appText = app ?? fs.readFileSync(path.join(here, "assets", "app-item4-0625.js"), "utf8");
  const buildId = appText.match(/const BUILD_ID = "(item4-[^"]+)"/)?.[1];
  if (!buildId) {
    throw new Error("BUILD_ID missing from app-item4-0625.js");
  }
  const parsed = /^item4-(\d+\.\d+\.\d+)-(.+)$/.exec(buildId);
  if (!parsed) {
    throw new Error(`BUILD_ID must be item4-<semver>-<slug>, got ${buildId}`);
  }
  const semver = parsed[1];
  const cacheKey = buildId.slice("item4-".length);
  const label = htmlText.match(/id="uiBuildLabel">UI build (\d+\.\d+\.\d+)</)?.[1];
  if (label !== semver) {
    throw new Error(
      `index.html UI build ${label || "(missing)"} does not match BUILD_ID ${semver}. ` +
        "Bump the footer label and every lockstep ?v= query with BUILD_ID so CDN/browser cache cannot keep an old footer."
    );
  }
  for (const asset of FOOTER_LOCKSTEP_ASSETS) {
    const found = htmlText.match(new RegExp(`${escapeRegExp(asset)}\\?v=([^"'\\s]+)`))?.[1];
    if (found !== cacheKey) {
      throw new Error(
        `${asset} cache-bust is ${found || "(missing)"} but BUILD_ID requires ${cacheKey}`
      );
    }
  }
  if (!/uiBuildLabel\.textContent = `UI \$\{uiBuildMatch \? uiBuildMatch\[1\] : BUILD_ID\}`/.test(appText)) {
    throw new Error("app JS must overwrite #uiBuildLabel from BUILD_ID");
  }
  return { buildId, semver, cacheKey };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  const result = assertFooterLockstep();
  console.log(`footer lockstep ok: UI ${result.semver} (${result.buildId})`);
}
