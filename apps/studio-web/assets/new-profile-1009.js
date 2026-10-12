(function () {
  "use strict";

  const DRAFT_KEY = "studio:new-profile-draft:v1";
  const platforms = ["instagram", "tiktok", "youtube", "facebook"];
  const platformLabels = {
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    facebook: "Facebook"
  };
  const presets = {
    "las-vegas": { city: "Las Vegas", state_region: "Nevada", state_code: "NV", timezone: "America/Los_Angeles", short_code: "LV", brand_name: "Las Vegas Shining", profile_key: "las-vegas" },
    "san-francisco": { city: "San Francisco", state_region: "California", state_code: "CA", timezone: "America/Los_Angeles", short_code: "SF", brand_name: "San Francisco Shining", profile_key: "san-francisco" },
    "new-orleans": { city: "New Orleans", state_region: "Louisiana", state_code: "LA", timezone: "America/Chicago", short_code: "NOLA", brand_name: "New Orleans Shining", profile_key: "new-orleans" },
    "washington-dc": { city: "Washington", state_region: "District of Columbia", state_code: "DC", timezone: "America/New_York", short_code: "DC", brand_name: "Washington DC Shining", profile_key: "washington-dc" },
    "boston": { city: "Boston", state_region: "Massachusetts", state_code: "MA", timezone: "America/New_York", short_code: "BOS", brand_name: "Boston Shining", profile_key: "boston" }
  };

  const state = {
    step: 1,
    profiles: [],
    canCreate: false,
    createdProfileId: null,
    readiness: null,
    loading: false
  };

  function $(id) { return document.getElementById(id); }
  function q(selector, root) { return (root || document).querySelector(selector); }
  function qa(selector, root) { return Array.from((root || document).querySelectorAll(selector)); }

  function slugify(value) {
    return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
  }

  function inferShort(city) {
    const words = String(city || "").trim().split(/\s+/).filter(Boolean);
    if (!words.length) return "";
    if (words.length > 1) return words.map(function (word) { return word.charAt(0); }).join("").toUpperCase().slice(0, 5);
    return words[0].replace(/[^A-Za-z]/g, "").slice(0, 3).toUpperCase();
  }

  async function api(path, options) {
    const opts = Object.assign({ credentials: "same-origin" }, options || {});
    opts.headers = Object.assign({}, opts.headers || {});
    if (opts.body && !opts.headers["Content-Type"]) opts.headers["Content-Type"] = "application/json";
    const response = await fetch(path, opts);
    const body = await response.json().catch(function () { return {}; });
    if (!response.ok) throw new Error(body.error || body.message || ("Request failed (" + response.status + ")"));
    return body;
  }

  function setMessage(message, error) {
    const el = $("newProfileMessage");
    if (!el) return;
    el.textContent = message || "";
    el.classList.toggle("error-text", Boolean(error));
  }

  function setBusy(busy) {
    state.loading = Boolean(busy);
    qa("#page-profiles button, #page-profiles input, #page-profiles select, #page-profiles textarea").forEach(function (el) {
      if (el.dataset.allowDuringBusy === "1") return;
      el.disabled = Boolean(busy);
    });
  }

  function setValue(id, value) {
    const el = $(id);
    if (el && value !== undefined && value !== null) el.value = value;
  }

  function checkedThemes() {
    return qa("[data-profile-theme]:checked").map(function (el) { return el.value; });
  }

  function platformData(platform) {
    const card = q('[data-profile-platform="' + platform + '"]');
    if (!card) return { intent: "skip", handle: "", account_id: "", service_url: "" };
    return {
      intent: q("[data-platform-intent]", card)?.value || "existing",
      handle: q("[data-platform-handle]", card)?.value.trim().replace(/^@/, "") || "",
      account_id: q("[data-platform-account-id]", card)?.value.trim() || "",
      service_url: q("[data-platform-service-url]", card)?.value.trim() || ""
    };
  }

  function platformPayload() {
    const result = {};
    platforms.forEach(function (platform) { result[platform] = platformData(platform); });
    return result;
  }

  function collectPayload() {
    return {
      template_profile_id: $("newProfileTemplate")?.value || "",
      city: $("newProfileCity")?.value.trim() || "",
      state_region: $("newProfileState")?.value.trim() || "",
      state_code: $("newProfileStateCode")?.value.trim().toUpperCase() || "",
      country: $("newProfileCountry")?.value.trim() || "United States",
      country_code: $("newProfileCountryCode")?.value.trim().toUpperCase() || "US",
      timezone: $("newProfileTimezone")?.value.trim() || "",
      brand_name: $("newProfileBrandName")?.value.trim() || "",
      profile_name: $("newProfileDisplayName")?.value.trim() || "",
      profile_key: $("newProfileKey")?.value.trim() || "",
      short_code: $("newProfileShortCode")?.value.trim().toUpperCase() || "",
      website_url: $("newProfileWebsite")?.value.trim() || "",
      launch_date: $("newProfileLaunchDate")?.value || "",
      primary_audience: $("newProfileAudience")?.value.trim() || "",
      brand_voice: $("newProfileBrandVoice")?.value.trim() || "",
      local_context: $("newProfileLocalContext")?.value.trim() || "",
      priority_locations: $("newProfilePriorityLocations")?.value.trim() || "",
      default_hashtags: $("newProfileHashtags")?.value.trim() || "",
      avoid_topics: $("newProfileAvoidTopics")?.value.trim() || "",
      allowed_content_themes: checkedThemes(),
      platforms: platformPayload()
    };
  }

  function validateStep(step) {
    if (step === 1) {
      const payload = collectPayload();
      const required = [
        ["city", "City"],
        ["state_region", "State / region"],
        ["state_code", "State / region code"],
        ["timezone", "Timezone"],
        ["brand_name", "Brand name"],
        ["profile_key", "Profile key"],
        ["short_code", "Short code"]
      ];
      const missing = required.filter(function (item) { return !payload[item[0]]; }).map(function (item) { return item[1]; });
      if (missing.length) throw new Error("Complete: " + missing.join(", ") + ".");
    }
    if (step === 2 && !checkedThemes().length) throw new Error("Select at least one content theme.");
    if (step === 3) {
      const selected = Object.values(platformPayload()).filter(function (row) { return row.intent !== "skip"; });
      if (!selected.length) throw new Error("Choose at least one platform, or go back and intentionally skip all platform setup.");
    }
  }

  function saveDraft() {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        step: state.step,
        created_profile_id: state.createdProfileId,
        payload: collectPayload()
      }));
    } catch (_) {}
  }

  function clearDraft() {
    try { localStorage.removeItem(DRAFT_KEY); } catch (_) {}
  }

  function restoreDraft() {
    let draft = null;
    try { draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || "null"); } catch (_) {}
    if (!draft || !draft.payload) return;
    const p = draft.payload;
    setValue("newProfileTemplate", p.template_profile_id);
    setValue("newProfileCity", p.city);
    setValue("newProfileState", p.state_region);
    setValue("newProfileStateCode", p.state_code);
    setValue("newProfileCountry", p.country || "United States");
    setValue("newProfileCountryCode", p.country_code || "US");
    setValue("newProfileTimezone", p.timezone);
    setValue("newProfileBrandName", p.brand_name);
    setValue("newProfileDisplayName", p.profile_name);
    setValue("newProfileKey", p.profile_key);
    setValue("newProfileShortCode", p.short_code);
    setValue("newProfileWebsite", p.website_url);
    setValue("newProfileLaunchDate", p.launch_date);
    setValue("newProfileAudience", p.primary_audience);
    setValue("newProfileBrandVoice", p.brand_voice);
    setValue("newProfileLocalContext", p.local_context);
    setValue("newProfilePriorityLocations", p.priority_locations);
    setValue("newProfileHashtags", p.default_hashtags);
    setValue("newProfileAvoidTopics", p.avoid_topics);
    if (Array.isArray(p.allowed_content_themes)) {
      qa("[data-profile-theme]").forEach(function (el) { el.checked = p.allowed_content_themes.includes(el.value); });
    }
    platforms.forEach(function (platform) {
      const card = q('[data-profile-platform="' + platform + '"]');
      const row = p.platforms && p.platforms[platform];
      if (!card || !row) return;
      const intent = q("[data-platform-intent]", card);
      const handle = q("[data-platform-handle]", card);
      const accountId = q("[data-platform-account-id]", card);
      const service = q("[data-platform-service-url]", card);
      if (intent) intent.value = row.intent || "existing";
      if (handle) handle.value = row.handle || "";
      if (accountId) accountId.value = row.account_id || "";
      if (service) service.value = row.service_url || "";
      syncPlatformCard(card);
    });
    state.createdProfileId = draft.created_profile_id || null;
    state.step = Math.max(1, Math.min(4, Number(draft.step) || 1));
  }

  function applyPreset(key) {
    const row = presets[key];
    if (!row) return;
    setValue("newProfileCity", row.city);
    setValue("newProfileState", row.state_region);
    setValue("newProfileStateCode", row.state_code);
    setValue("newProfileTimezone", row.timezone);
    setValue("newProfileBrandName", row.brand_name);
    setValue("newProfileDisplayName", row.brand_name + " - " + row.city);
    setValue("newProfileKey", row.profile_key);
    setValue("newProfileShortCode", row.short_code);
    setValue("newProfileCountry", "United States");
    setValue("newProfileCountryCode", "US");
    setValue("newProfileHashtags", "#" + row.city.replace(/[^A-Za-z0-9]/g, "") + " #" + row.brand_name.replace(/[^A-Za-z0-9]/g, "") + " #CityTravel #Explore" + row.city.replace(/[^A-Za-z0-9]/g, "") + " #Travel");
    setValue("newProfileLocalContext", row.city + " content should emphasize neighborhoods, landmarks, architecture, food, culture, parks, transportation, visually compelling local detail, and practical visitor context.");
    saveDraft();
    renderReview();
  }

  function autofillCityFields() {
    const city = $("newProfileCity")?.value.trim() || "";
    if (!city) return;
    if (!$("newProfileBrandName")?.value.trim()) setValue("newProfileBrandName", city + " Shining");
    if (!$("newProfileDisplayName")?.value.trim()) setValue("newProfileDisplayName", (city + " Shining") + " - " + city);
    if (!$("newProfileKey")?.value.trim()) setValue("newProfileKey", slugify(city));
    if (!$("newProfileShortCode")?.value.trim()) setValue("newProfileShortCode", inferShort(city));
  }

  function syncPlatformCard(card) {
    if (!card) return;
    const platform = card.dataset.profilePlatform;
    const intent = q("[data-platform-intent]", card)?.value || "existing";
    const fields = qa("[data-platform-field]", card);
    fields.forEach(function (el) { el.hidden = intent === "skip"; });
    const createCopy = q("[data-platform-create-copy]", card);
    if (createCopy) createCopy.hidden = intent !== "create";
    const status = q("[data-platform-status]", card);
    if (status && !state.readiness) {
      status.textContent = intent === "skip" ? "Skipped" : (intent === "create" ? "Needs account" : "Needs connection");
      status.className = "profile-platform-status " + (intent === "skip" ? "" : "warn");
    }
    if (platform === "instagram" || platform === "facebook") {
      const advanced = q("[data-platform-advanced-label]", card);
      if (advanced) advanced.textContent = "Publishing credential is configured outside this form; Studio never asks you to paste a Meta access token here.";
    }
  }

  function showStep(step) {
    state.step = Math.max(1, Math.min(4, Number(step) || 1));
    qa("[data-profile-step]").forEach(function (section) {
      section.hidden = Number(section.dataset.profileStep) !== state.step;
    });
    qa("[data-profile-step-button]").forEach(function (button) {
      const n = Number(button.dataset.profileStepButton);
      button.classList.toggle("active", n === state.step);
      button.classList.toggle("complete", n < state.step || Boolean(state.createdProfileId));
      button.setAttribute("aria-current", n === state.step ? "step" : "false");
    });
    const back = $("newProfileBack");
    const next = $("newProfileNext");
    const create = $("newProfileCreate");
    if (back) back.hidden = state.step === 1;
    if (next) next.hidden = state.step === 4;
    if (create) create.hidden = state.step !== 4 || Boolean(state.createdProfileId);
    if (state.step === 4) renderReview();
    saveDraft();
  }

  function renderReview() {
    const target = $("newProfileReview");
    if (!target) return;
    const p = collectPayload();
    const activePlatforms = platforms.filter(function (platform) { return p.platforms[platform].intent !== "skip"; }).map(function (platform) { return platformLabels[platform]; });
    target.innerHTML = [
      "<dl class=\"profile-review-list\">",
      "<dt>Profile</dt><dd>" + escapeHtml(p.profile_name || p.brand_name || "—") + "</dd>",
      "<dt>City</dt><dd>" + escapeHtml([p.city, p.state_region, p.country].filter(Boolean).join(", ") || "—") + "</dd>",
      "<dt>Timezone</dt><dd>" + escapeHtml(p.timezone || "—") + "</dd>",
      "<dt>Profile key</dt><dd>" + escapeHtml(p.profile_key || "—") + "</dd>",
      "<dt>Short code</dt><dd>" + escapeHtml(p.short_code || "—") + "</dd>",
      "<dt>Website</dt><dd>" + escapeHtml(p.website_url || "Not set") + "</dd>",
      "<dt>Platforms</dt><dd>" + escapeHtml(activePlatforms.join(", ") || "None") + "</dd>",
      "<dt>Scheduling</dt><dd>Profile-local timezone; 5:30–7:00 AM, 11:30 AM–1:00 PM, 4:30–6:00 PM; blackout 8:00 PM–3:30 AM.</dd>",
      "<dt>Output defaults</dt><dd>9:16, five hashtags, IG/TikTok covers, initial schedule empty.</dd>",
      "</dl>"
    ].join("");
  }

  function escapeHtml(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[ch];
    });
  }

  function renderReadiness(readiness) {
    state.readiness = readiness || null;
    const target = $("newProfileReadiness");
    const banner = $("newProfileCreatedBanner");
    if (banner && state.createdProfileId) banner.hidden = false;
    const reset = $("newProfileReset");
    if (reset && state.createdProfileId) reset.hidden = true;
    if (!target) return;
    if (!readiness || !readiness.platforms) {
      target.innerHTML = "<p class=\"subtle\">Create the Studio profile to begin live platform validation.</p>";
      return;
    }
    target.innerHTML = platforms.map(function (platform) {
      const row = readiness.platforms[platform] || {};
      const ready = Boolean(row.ready);
      const missing = Array.isArray(row.missing) ? row.missing : [];
      return "<div class=\"profile-readiness-row\">" +
        "<div><strong>" + escapeHtml(platformLabels[platform]) + "</strong>" +
        "<div class=\"profile-platform-note\">" + escapeHtml(row.intent === "skip" ? "Skipped for this profile." : (missing.length ? missing.join(" · ") : "Required publishing pieces are present.")) + "</div></div>" +
        "<span class=\"profile-platform-status " + (ready ? "ready" : "warn") + "\">" + (row.intent === "skip" ? "Skipped" : (ready ? "Ready" : "Needs setup")) + "</span>" +
        "</div>";
    }).join("");
    platforms.forEach(function (platform) {
      const card = q('[data-profile-platform="' + platform + '"]');
      const row = readiness.platforms[platform];
      if (!card || !row) return;
      const status = q("[data-platform-status]", card);
      if (status) {
        status.textContent = row.intent === "skip" ? "Skipped" : (row.ready ? "Ready" : "Needs setup");
        status.className = "profile-platform-status " + (row.ready ? "ready" : (row.intent === "skip" ? "" : "warn"));
      }
      const missing = q("[data-platform-missing]", card);
      if (missing) {
        const values = Array.isArray(row.missing) ? row.missing : [];
        missing.innerHTML = values.map(function (item) { return "<li>" + escapeHtml(item) + "</li>"; }).join("");
        missing.hidden = values.length === 0;
      }
      const connect = q("[data-platform-connect]", card);
      if (connect) {
        connect.hidden = !row.connect_url;
        if (row.connect_url) connect.href = row.connect_url;
      }
    });
    const activate = $("newProfileActivate");
    if (activate) {
      activate.hidden = !state.createdProfileId;
      activate.disabled = !readiness.ready;
    }
    const summary = $("newProfileReadinessSummary");
    if (summary) {
      summary.textContent = readiness.ready
        ? "All selected platform destinations are ready. You can activate this profile."
        : String(readiness.ready_count || 0) + " of " + String(readiness.required_count || 0) + " selected platform destinations are ready.";
    }
  }

  function hydrateCreatedSetup(result) {
    if (!result) return;
    if (result.profile && result.profile.id) state.createdProfileId = result.profile.id;
    if (result.readiness) renderReadiness(result.readiness);
    const name = result.profile?.name || collectPayload().profile_name || collectPayload().brand_name;
    const bannerName = $("newProfileCreatedName");
    if (bannerName) bannerName.textContent = name || "New profile";
    showStep(3);
    saveDraft();
  }

  async function createProfile() {
    for (let step = 1; step <= 3; step += 1) validateStep(step);
    setBusy(true);
    setMessage("Creating Brand, Market, Content Profile, and platform setup…");
    try {
      const result = await api("/api/profiles", { method: "POST", body: JSON.stringify(collectPayload()) });
      state.createdProfileId = result.profile?.id || null;
      renderReadiness(result.readiness);
      const bannerName = $("newProfileCreatedName");
      if (bannerName) bannerName.textContent = result.profile?.name || collectPayload().profile_name || collectPayload().brand_name;
      const banner = $("newProfileCreatedBanner");
      if (banner) banner.hidden = false;
      setMessage("Profile created. Finish or validate each platform, then activate when ready.");
      showStep(3);
      saveDraft();
    } catch (error) {
      setMessage(error.message || "Could not create profile.", true);
    } finally {
      setBusy(false);
    }
  }

  async function savePlatformSetup() {
    if (!state.createdProfileId) {
      setMessage("Create the Studio profile first, then save platform connections.", true);
      return;
    }
    setBusy(true);
    setMessage("Saving platform setup…");
    try {
      const result = await api("/api/profiles/" + encodeURIComponent(state.createdProfileId) + "/setup", {
        method: "PATCH",
        body: JSON.stringify({ platforms: platformPayload() })
      });
      renderReadiness(result.readiness);
      setMessage("Platform setup saved.");
      saveDraft();
    } catch (error) {
      setMessage(error.message || "Could not save platform setup.", true);
    } finally {
      setBusy(false);
    }
  }

  async function validatePlatform(platform) {
    if (!state.createdProfileId) {
      setMessage("Create the Studio profile first.", true);
      return;
    }
    await savePlatformSetup();
    setBusy(true);
    setMessage("Validating " + platformLabels[platform] + "…");
    try {
      const result = await api("/api/profiles/" + encodeURIComponent(state.createdProfileId) + "/platforms/" + platform + "/validate", {
        method: "POST",
        body: "{}"
      });
      renderReadiness(result.readiness);
      setMessage((result.validation?.verified ? "Verified: " : "Validation result: ") + (result.validation?.message || platformLabels[platform]));
    } catch (error) {
      setMessage(error.message || ("Could not validate " + platformLabels[platform] + "."), true);
    } finally {
      setBusy(false);
    }
  }

  async function activateProfile() {
    if (!state.createdProfileId) return;
    setBusy(true);
    setMessage("Activating profile…");
    try {
      const result = await api("/api/profiles/" + encodeURIComponent(state.createdProfileId) + "/setup", {
        method: "PATCH",
        body: JSON.stringify({ action: "activate", platforms: platformPayload() })
      });
      renderReadiness(result.readiness);
      setMessage("Profile activated. Reload Studio to use it from the Profile selector.");
      const activate = $("newProfileActivate");
      if (activate) activate.hidden = true;
      const reload = $("newProfileReload");
      if (reload) reload.hidden = false;
      clearDraft();
    } catch (error) {
      setMessage(error.message || "Profile is not ready to activate.", true);
    } finally {
      setBusy(false);
    }
  }

  async function resumeCreatedProfile() {
    if (!state.createdProfileId) return;
    try {
      const result = await api("/api/profiles/" + encodeURIComponent(state.createdProfileId) + "/setup");
      renderReadiness(result.readiness);
      const banner = $("newProfileCreatedBanner");
      if (banner) banner.hidden = false;
      const bannerName = $("newProfileCreatedName");
      if (bannerName) bannerName.textContent = result.profile?.name || "New profile";
      setMessage("Resumed saved profile setup.");
    } catch (error) {
      state.createdProfileId = null;
      setMessage("The saved onboarding draft was restored, but the previously created profile could not be reopened.", true);
    }
  }

  async function loadProfiles() {
    const result = await api("/api/profiles");
    state.profiles = Array.isArray(result.records) ? result.records : [];
    state.canCreate = Boolean(result.can_create_profile);
    const nav = $("navNewProfile");
    if (nav) nav.hidden = !state.canCreate;
    // Owner/Admin who can create profiles must also see Operations. Do not leave
    // Ops hidden when /api/session timed out earlier in checkHealth.
    if (state.canCreate) {
      const ops = $("navOperations");
      const footerOps = $("footerOperations");
      if (ops) ops.hidden = false;
      if (footerOps) footerOps.hidden = false;
    }
    const select = $("newProfileTemplate");
    if (select) {
      select.innerHTML = state.profiles.map(function (profile) {
        return "<option value=\"" + escapeHtml(profile.id) + "\">" + escapeHtml(profile.name || profile.city_label || profile.id) + "</option>";
      }).join("");
      const chicago = state.profiles.find(function (profile) { return profile.theme === "chicago"; });
      if (chicago) select.value = chicago.id;
    }
    if (!state.canCreate) {
      setMessage("New Profile requires Studio Owner/Admin permission.", true);
      qa("#page-profiles input, #page-profiles select, #page-profiles textarea, #page-profiles button").forEach(function (el) { el.disabled = true; });
    }
  }

  function bind() {
    qa("[data-profile-step-button]").forEach(function (button) {
      button.addEventListener("click", function () {
        const requested = Number(button.dataset.profileStepButton);
        if (requested > state.step) {
          try { validateStep(state.step); } catch (error) { setMessage(error.message, true); return; }
        }
        setMessage("");
        showStep(requested);
      });
    });
    $("newProfileBack")?.addEventListener("click", function () { showStep(state.step - 1); });
    $("newProfileNext")?.addEventListener("click", function () {
      try {
        validateStep(state.step);
        setMessage("");
        showStep(state.step + 1);
      } catch (error) {
        setMessage(error.message, true);
      }
    });
    $("newProfileCreate")?.addEventListener("click", createProfile);
    $("newProfileSavePlatforms")?.addEventListener("click", savePlatformSetup);
    $("newProfileActivate")?.addEventListener("click", activateProfile);
    $("newProfileReload")?.addEventListener("click", function () { location.reload(); });
    $("newProfileReset")?.addEventListener("click", function () {
      if (!confirm("Clear this new-profile draft and start over?")) return;
      clearDraft();
      state.createdProfileId = null;
      location.reload();
    });

    qa("[data-city-preset]").forEach(function (button) {
      button.addEventListener("click", function () { applyPreset(button.dataset.cityPreset); });
    });
    $("newProfileCity")?.addEventListener("blur", function () { autofillCityFields(); saveDraft(); });
    $("newProfileBrandName")?.addEventListener("blur", function () {
      const city = $("newProfileCity")?.value.trim() || "";
      if (!$("newProfileDisplayName")?.value.trim() && city) setValue("newProfileDisplayName", $("newProfileBrandName").value.trim() + " - " + city);
      saveDraft();
    });
    qa("#newProfileForm input, #newProfileForm select, #newProfileForm textarea").forEach(function (el) {
      el.addEventListener("change", function () { saveDraft(); renderReview(); });
    });

    qa("[data-profile-platform]").forEach(function (card) {
      q("[data-platform-intent]", card)?.addEventListener("change", function () {
        syncPlatformCard(card);
        saveDraft();
      });
      q("[data-platform-validate]", card)?.addEventListener("click", function () {
        validatePlatform(card.dataset.profilePlatform);
      });
      syncPlatformCard(card);
    });

    q('[data-page="profiles"]')?.addEventListener("click", function () {
      setTimeout(function () { showStep(state.step); }, 0);
    });
  }

  async function init() {
    if (!$("page-profiles")) return;
    bind();
    try {
      await loadProfiles();
      restoreDraft();
      showStep(state.step);
      await resumeCreatedProfile();
      renderReview();
    } catch (error) {
      setMessage(error.message || "Could not initialize New Profile.", true);
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
