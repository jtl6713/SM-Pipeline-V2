import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const modulePath = path.join(here, "profile-onboarding.js");
const workerPath = path.join(here, "worker.js");
const webRoot = path.resolve(here, "../studio-web");

test("new profile onboarding module is valid ESM and never requires a token in profile setup", async () => {
  const mod = await import(pathToFileURL(modulePath).href + "?test=" + Date.now());
  assert.equal(typeof mod.createProfileOnboarding, "function");

  const handlers = mod.createProfileOnboarding({
    HttpError: class HttpError extends Error {},
    f(record, name) { return record?.fields?.[name]; },
    arrayOrEmpty(value) { return Array.isArray(value) ? value : []; },
    listRecords: async () => [],
    airtableFetch: async () => ({}),
    studioUpsertSetting: async () => ({}),
    studioActivePipelineSettings: async () => ({}),
    mapStudioContentProfile: (record) => record,
    studioThemeForProfile: () => "test-city",
    studioCityLabel: () => "Test City",
    studioSettingsPrefixForTheme: () => "TEST_CITY_",
    STUDIO_IDEA_PROFILE_TABLE_ID: "Content Profiles",
    respond: (_request, _env, data) => data,
    readJsonBody: async () => ({}),
  });
  assert.equal(typeof handlers.createProfile, "function");
  assert.equal(typeof handlers.validatePlatform, "function");
  assert.deepEqual(
    handlers.readSetup({ fields: { Platform_Setup_JSON: '{"version":1,"platforms":{"tiktok":{"intent":"create"}}}' } }),
    { version: 1, platforms: { tiktok: { intent: "create" } } }
  );

  const source = await readFile(modulePath, "utf8");
  assert.doesNotMatch(source, /access_token\s*:/i);
  assert.doesNotMatch(source, /client_secret\s*:/i);
  assert.match(source, /Instagram Business Account ID/);
  assert.match(source, /city-specific TikTok OAuth worker/);
  assert.match(source, /city-specific YouTube uploader\/OAuth service/);
});

test("Studio worker supports generic city keys, profile-local timezone, and onboarding routes", async () => {
  const source = await readFile(workerPath, "utf8");
  assert.match(source, /import \{ createProfileOnboarding \} from "\.\/profile-onboarding\.js";/);
  assert.match(source, /isProfileSetupRoute/);
  assert.match(source, /isProfilePlatformValidateRoute/);
  assert.match(source, /studioSettingsPrefixForTheme/);
  assert.match(source, /Profile_Key/);
  assert.match(source, /const explicit = String\(f\(profile, "Timezone"\)/);
  assert.match(source, /can_create_profile/);
});

test("Studio web exposes the four-step New Profile flow with five city presets and official account handoffs", async () => {
  const html = await readFile(path.join(webRoot, "index.html"), "utf8");
  const js = await readFile(path.join(webRoot, "assets/new-profile-1009.js"), "utf8");
  assert.match(html, /data-page="profiles"/);
  assert.match(html, /id="page-profiles"/);
  assert.match(html, /data-city-preset="las-vegas"/);
  assert.match(html, /data-city-preset="san-francisco"/);
  assert.match(html, /data-city-preset="new-orleans"/);
  assert.match(html, /data-city-preset="washington-dc"/);
  assert.match(html, /data-city-preset="boston"/);
  assert.match(html, /instagram\.com\/accounts\/emailsignup/);
  assert.match(html, /facebook\.com\/pages\/create/);
  assert.match(html, /tiktok\.com\/signup/);
  assert.match(html, /youtube\.com\/create_channel/);
  assert.match(html, /No passwords or access tokens here/);
  assert.match(js, /localStorage\.setItem\(DRAFT_KEY/);
  assert.match(js, /\/api\/profiles\/" \+ encodeURIComponent\(state\.createdProfileId\) \+ "\/setup/);
  assert.match(html, /Activate profile/);
});
