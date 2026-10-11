import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const appPath = path.join(here, "assets/app-item4-1008.js");

test("profile picker survives /api/profiles outages with session cache and retries", async () => {
  const app = await readFile(appPath, "utf8");
  assert.match(app, /PROFILE_LIST_CACHE_KEY = "studio\.content_profiles_cache_v1"/);
  assert.match(app, /hydrateStudioProfilesFromCache\(\)/);
  assert.match(app, /api\("\/api\/profiles", \{ retries: 2, timeoutMs: 12000 \}\)/);
  assert.match(app, /Loading profiles…/);
  assert.match(app, /scheduleStudioProfileListRetry\(\)/);
  assert.match(app, /wrap\.hidden = !loading && !studioProfiles\.length/);
});
