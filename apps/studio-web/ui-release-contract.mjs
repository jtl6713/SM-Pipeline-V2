import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));
const defaultHtmlPath = path.join(moduleDir, "index.html");

function collectAssetUrls(html) {
  return [...new Set(
    [...String(html).matchAll(/\/assets\/[^"'<>\\\s]+/g)]
      .map((match) => match[0].replaceAll("&amp;", "&")),
  )];
}

function findAppUrl(html) {
  const urls = collectAssetUrls(html);
  return urls.find((url) => /^\/assets\/app-item4-[^?]+\.js(?:\?|$)/i.test(url)) || "";
}

function findAssetUrl(html, assetName) {
  return collectAssetUrls(html).find((url) => url.split("?", 1)[0] === `/assets/${assetName}`) || "";
}

function parseVersion(version, label) {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(version || ""));
  if (!match) throw new Error(`${label} must be a three-part numeric version, received '${version}'`);
  return match.slice(1).map(Number);
}

export function compareUiVersions(left, right) {
  const a = parseVersion(left, "left version");
  const b = parseVersion(right, "right version");
  for (let index = 0; index < a.length; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  return 0;
}

export function extractUiVersionFromHtml(html) {
  const label = String(html).match(/<span\s+id=["']uiBuildLabel["'][^>]*>\s*UI build (\d+\.\d+\.\d+)(?:-[a-z0-9-]+)?\s*<\/span>/i);
  if (!label) {
    throw new Error("index.html must contain a parseable 'UI build X.Y.Z' uiBuildLabel");
  }
  return label[1];
}

export function extractAppUrlFromHtml(html) {
  const appUrl = findAppUrl(html);
  if (!appUrl) throw new Error("index.html is missing its app-item4 JavaScript asset URL");
  return appUrl;
}

export function readUiReleaseContract(html, appSource) {
  const version = extractUiVersionFromHtml(html);
  const expectedJsUrl = extractAppUrlFromHtml(html);
  const parsedAppUrl = new URL(expectedJsUrl, "https://studio.invalid");
  const cacheKey = parsedAppUrl.searchParams.get("v") || "";
  const cacheVersion = cacheKey.match(/^(\d+\.\d+\.\d+)(?:-|$)/)?.[1] || "";
  const buildId = String(appSource).match(/\bBUILD_ID\s*=\s*["']([^"']+)["']/)?.[1] || "";

  if (!cacheKey) throw new Error(`Application URL is missing a v cache key: ${expectedJsUrl}`);
  if (cacheVersion !== version) {
    throw new Error(`UI label ${version} does not match application cache version ${cacheVersion || "(missing)"}`);
  }
  if (buildId !== `item4-${cacheKey}`) {
    throw new Error(`BUILD_ID '${buildId || "(missing)"}' must equal 'item4-${cacheKey}'`);
  }

  const versionedAssets = collectAssetUrls(html)
    .filter((url) => /\.(?:js|css)(?:\?|$)/i.test(url));
  const missingCacheKeys = versionedAssets.filter((url) => !new URL(url, "https://studio.invalid").searchParams.has("v"));
  if (missingCacheKeys.length) {
    throw new Error(`JavaScript/CSS assets missing v cache keys: ${missingCacheKeys.join(", ")}`);
  }
  const divergentCacheKeys = versionedAssets.filter((url) => new URL(url, "https://studio.invalid").searchParams.get("v") !== cacheKey);
  if (divergentCacheKeys.length) {
    throw new Error(`JavaScript/CSS assets do not share release cache key '${cacheKey}': ${divergentCacheKeys.join(", ")}`);
  }

  const expectedDensityCssUrl = findAssetUrl(html, "home-density-0517.css");
  const expectedOverviewUrl = findAssetUrl(html, "all-profiles-overview-1007.js");
  if (!expectedDensityCssUrl || !expectedOverviewUrl) {
    throw new Error("index.html is missing the Home density or All Profiles overview asset");
  }

  return {
    version,
    cacheKey,
    expectedLabel: version,
    expectedBuildId: buildId,
    expectedJsUrl,
    expectedJsPath: parsedAppUrl.pathname,
    expectedDensityCssUrl,
    expectedDensityCssPath: new URL(expectedDensityCssUrl, "https://studio.invalid").pathname,
    expectedOverviewUrl,
    expectedOverviewPath: new URL(expectedOverviewUrl, "https://studio.invalid").pathname,
    versionedAssetCount: versionedAssets.length,
  };
}

function readContractFromFiles(htmlPath, appPath = "") {
  const html = fs.readFileSync(htmlPath, "utf8");
  const appUrl = extractAppUrlFromHtml(html);
  const resolvedAppPath = appPath || path.join(path.dirname(htmlPath), new URL(appUrl, "https://studio.invalid").pathname.replace(/^\//, ""));
  return readUiReleaseContract(html, fs.readFileSync(resolvedAppPath, "utf8"));
}

function argumentValue(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : "";
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const htmlPath = argumentValue("--html") || defaultHtmlPath;
  if (process.argv.includes("--html-version")) {
    process.stdout.write(`${extractUiVersionFromHtml(fs.readFileSync(htmlPath, "utf8"))}\n`);
  } else if (process.argv.includes("--app-url")) {
    process.stdout.write(`${extractAppUrlFromHtml(fs.readFileSync(htmlPath, "utf8"))}\n`);
  } else {
    const contract = readContractFromFiles(htmlPath, argumentValue("--app"));
    const liveVersion = argumentValue("--assert-newer-than");
    if (liveVersion && compareUiVersions(contract.version, liveVersion) <= 0) {
      throw new Error(`Refusing unchanged or stale Pages release: requested UI ${contract.version}, live custom domain UI ${liveVersion}`);
    }
    if (liveVersion) {
      process.stdout.write(`pages_release_newness=PASS live=${liveVersion} requested=${contract.version}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(contract)}\n`);
    }
  }
}
