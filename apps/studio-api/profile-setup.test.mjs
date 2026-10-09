import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeProfileSetupState,
  profileDestinationSettingName,
  profileSetupChecklist,
  profileSetupSelectedPlatformLabels,
  profileSetupSettingName,
  profileSetupSlug,
} from "./profile-setup.mjs";

test("normalizes a new city setup with four platform choices", () => {
  const state = normalizeProfileSetupState({
    city: "Las Vegas",
    state_region: "Nevada",
    country: "United States",
    timezone: "America/Los_Angeles",
    profile_name: "Las Vegas Shining - Las Vegas",
    brand_name: "Las Vegas Shining",
    short_code: "lv",
    local_context: "Visual discovery across Las Vegas.",
    priority_locations: "The Strip, Fremont Street",
    default_hashtags: "#LasVegas #LasVegasShining",
    platforms: {
      instagram: { enabled: true },
      tiktok: { enabled: true, setup_mode: "create", desired_handle: "@lasvegasshining" },
      youtube: { enabled: true },
      facebook: { enabled: true },
    },
  });

  assert.equal(state.slug, "las-vegas");
  assert.equal(state.short_code, "LV");
  assert.equal(state.platforms.tiktok.setup_mode, "create");
  assert.equal(state.platforms.tiktok.desired_handle, "lasvegasshining");
  assert.deepEqual(profileSetupSelectedPlatformLabels(state), [
    "Instagram",
    "TikTok",
    "YouTube",
    "Facebook",
  ]);
});

test("profile scoped settings are deterministic and isolated", () => {
  assert.equal(profileSetupSettingName("recABC123"), "PROFILE_SETUP_V1_recABC123");
  assert.equal(
    profileDestinationSettingName("recABC123", "FACEBOOK_PAGE_ID"),
    "PROFILE_recABC123_FACEBOOK_PAGE_ID",
  );
  assert.notEqual(
    profileDestinationSettingName("recABC123", "FACEBOOK_PAGE_ID"),
    profileDestinationSettingName("recXYZ999", "FACEBOOK_PAGE_ID"),
  );
  assert.equal(profileSetupSlug("Washington, D.C."), "washington-d-c");
});

test("activation requires selected platforms to be connected or explicitly deferred", () => {
  const state = normalizeProfileSetupState({
    profile_id: "recCity123",
    city: "Boston",
    state_region: "Massachusetts",
    country: "United States",
    timezone: "America/New_York",
    profile_name: "Boston Shining - Boston",
    brand_name: "Boston Shining",
    local_context: "Boston city discovery.",
    priority_locations: "Beacon Hill, Back Bay",
    default_hashtags: "#Boston #BostonShining",
    content_themes: ["History", "Architecture"],
    platforms: {
      instagram: { enabled: true },
      tiktok: { enabled: true },
      youtube: { enabled: false },
      facebook: { enabled: false },
    },
  });

  let checklist = profileSetupChecklist(state, {
    instagram: { status: "connected" },
    tiktok: { status: "needs_authorization" },
  });
  assert.equal(checklist.can_activate, false);
  assert.equal(checklist.platform_items.find((item) => item.key === "tiktok").ok, false);

  const deferred = normalizeProfileSetupState({
    ...state,
    platforms: {
      ...state.platforms,
      tiktok: { ...state.platforms.tiktok, deferred: true },
    },
  }, state);

  checklist = profileSetupChecklist(deferred, {
    instagram: { status: "connected" },
    tiktok: { status: "needs_authorization" },
  });
  assert.equal(checklist.can_activate, true);
});

test("activation fails without content DNA even when platform is connected", () => {
  const state = normalizeProfileSetupState({
    profile_id: "recCity123",
    city: "San Francisco",
    state_region: "California",
    country: "United States",
    timezone: "America/Los_Angeles",
    profile_name: "San Francisco Shining - San Francisco",
    brand_name: "San Francisco Shining",
    platforms: {
      instagram: { enabled: true },
      tiktok: { enabled: false },
      youtube: { enabled: false },
      facebook: { enabled: false },
    },
  });
  const checklist = profileSetupChecklist(state, {
    instagram: { status: "connected" },
  });
  assert.equal(checklist.basics.ok, true);
  assert.equal(checklist.strategy.ok, false);
  assert.equal(checklist.can_activate, false);
});
