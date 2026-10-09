import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const worker = fs.readFileSync(new URL("./worker.js", import.meta.url), "utf8");
const onboarding = fs.readFileSync(new URL("./profile-onboarding.js", import.meta.url), "utf8");

test("new profile onboarding routes are wired", () => {
  assert.match(worker, /createProfileOnboarding/);
  assert.match(worker, /isProfileSetupRoute/);
  assert.match(worker, /isProfilePlatformValidateRoute/);
  assert.match(worker, /request\.method === "POST"[\s\S]{0,300}createProfile/);
});

test("new city routing is generic and timezone comes from profile", () => {
  assert.match(worker, /Profile_Key/);
  assert.match(worker, /studioSettingsPrefixForTheme/);
  assert.match(worker, /f\(profile, "Timezone"\)/);
  assert.doesNotMatch(onboarding, /ACCESS_TOKEN.*Platform_Setup_JSON/);
});

test("onboarding supports all four platforms and official create handoffs", () => {
  for (const platform of ["instagram","tiktok","youtube","facebook"]) assert.match(onboarding, new RegExp(platform));
  assert.match(onboarding, /instagram\.com\/accounts\/emailsignup/);
  assert.match(onboarding, /tiktok\.com\/signup/);
  assert.match(onboarding, /youtube\.com\/create_channel/);
  assert.match(onboarding, /facebook\.com\/pages\/create/);
});
