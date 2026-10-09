export function createProfileOnboarding(deps) {
  const {
    HttpError,
    f,
    arrayOrEmpty,
    listRecords,
    airtableFetch,
    studioUpsertSetting,
    studioActivePipelineSettings,
    mapStudioContentProfile,
    studioThemeForProfile,
    studioCityLabel,
    studioSettingsPrefixForTheme,
    STUDIO_IDEA_PROFILE_TABLE_ID,
    respond,
    readJsonBody,
  } = deps;

  const platformNames = ["instagram", "tiktok", "youtube", "facebook"];
  const platformLabels = {
    instagram: "Instagram",
    tiktok: "TikTok",
    youtube: "YouTube",
    facebook: "Facebook",
  };
  const creationUrls = {
    instagram: "https://www.instagram.com/accounts/emailsignup/",
    tiktok: "https://www.tiktok.com/signup",
    youtube: "https://www.youtube.com/create_channel",
    facebook: "https://www.facebook.com/pages/create/",
  };

  function normalizeKey(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80);
  }

  function readSetup(record) {
    const raw = String(f(record, "Platform_Setup_JSON") || "").trim();
    if (!raw) return { version: 1, platforms: {} };
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? parsed
        : { version: 1, platforms: {} };
    } catch {
      return { version: 1, platforms: {} };
    }
  }

  function normalizeIntent(value) {
    const raw = String(value || "").trim().toLowerCase();
    return ["existing", "create", "skip"].includes(raw) ? raw : "existing";
  }

  function normalizeSetup(input, previous) {
    const prior = previous && typeof previous === "object" ? previous : { version: 1, platforms: {} };
    const next = { version: 1, updated_at: new Date().toISOString(), platforms: {} };
    for (const platform of platformNames) {
      const oldRow = (prior.platforms && prior.platforms[platform]) || {};
      const incoming = input && input[platform] && typeof input[platform] === "object" ? input[platform] : oldRow;
      const intent = normalizeIntent(incoming.intent || oldRow.intent);
      next.platforms[platform] = {
        intent,
        handle: String(incoming.handle ?? oldRow.handle ?? "").trim().replace(/^@/, "").slice(0, 160),
        account_id: String(incoming.account_id ?? oldRow.account_id ?? "").trim().slice(0, 240),
        service_url: String(incoming.service_url ?? oldRow.service_url ?? "").trim().slice(0, 1000),
        status: intent === "skip" ? "skipped" : String(incoming.status || oldRow.status || "needs_connection").trim(),
        notes: String(incoming.notes ?? oldRow.notes ?? "").trim().slice(0, 2000),
      };
    }
    return next;
  }

  function validateTimeZone(value) {
    const zone = String(value || "").trim();
    if (!zone) throw new HttpError(400, "Timezone is required");
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
    } catch {
      throw new HttpError(400, "Timezone must be a valid IANA timezone such as America/Los_Angeles");
    }
    return zone;
  }

  function recordIdFromPath(url) {
    const match = /^\/api\/profiles\/(rec[A-Za-z0-9]+)\//.exec(url.pathname);
    if (!match) throw new HttpError(400, "Invalid profile path");
    return match[1];
  }

  async function loadProfile(env, recordId, authorization) {
    const record = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, recordId);
    const organizations = arrayOrEmpty(f(record, "Organization"));
    const orgId = authorization && authorization.organization && authorization.organization.record_id;
    if (orgId && organizations.length && !organizations.includes(orgId)) {
      throw new HttpError(403, "Content Profile is not part of this Studio organization");
    }
    return record;
  }

  async function saveNonSecretSettings(env, record, setup) {
    const prefix = studioSettingsPrefixForTheme(studioThemeForProfile(record));
    const cityLabel = studioCityLabel(studioThemeForProfile(record), record);
    const jobs = [];
    const add = (name, value, notes) => {
      const clean = String(value || "").trim();
      if (!clean) return;
      jobs.push(studioUpsertSetting(env, prefix + name, clean, notes));
    };
    const fb = (setup.platforms && setup.platforms.facebook) || {};
    const ig = (setup.platforms && setup.platforms.instagram) || {};
    const yt = (setup.platforms && setup.platforms.youtube) || {};
    const tt = (setup.platforms && setup.platforms.tiktok) || {};
    add("FACEBOOK_PAGE_ID", fb.account_id, cityLabel + " Facebook Page ID from New Profile onboarding.");
    add("INSTAGRAM_BUSINESS_ACCOUNT_ID", ig.account_id, cityLabel + " Instagram Business Account ID from New Profile onboarding.");
    add("YOUTUBE_CHANNEL_ID", yt.account_id, cityLabel + " YouTube channel ID from New Profile onboarding.");
    add("YOUTUBE_UPLOAD_SERVICE_URL", yt.service_url, cityLabel + " YouTube uploader service URL from New Profile onboarding.");
    add("TIKTOK_WORKER_BASE_URL", tt.service_url, cityLabel + " TikTok OAuth/publishing worker URL from New Profile onboarding.");
    add("TIKTOK_HANDLE", tt.handle, cityLabel + " TikTok handle from New Profile onboarding.");
    await Promise.all(jobs);
  }

  async function readiness(env, record) {
    const setup = readSetup(record);
    const settings = await studioActivePipelineSettings(env, [
      "FACEBOOK_PAGE_ID",
      "FACEBOOK_PAGE_ACCESS_TOKEN",
      "INSTAGRAM_BUSINESS_ACCOUNT_ID",
      "META_GRAPH_API_ACCESS_TOKEN",
      "YOUTUBE_CHANNEL_ID",
      "YOUTUBE_UPLOAD_SERVICE_URL",
      "YOUTUBE_API_KEY",
      "TIKTOK_WORKER_BASE_URL",
      "FACEBOOK_GRAPH_API_VERSION",
      "META_GRAPH_API_VERSION",
    ], record).catch(() => ({}));

    const rows = {};
    for (const platform of platformNames) {
      const saved = (setup.platforms && setup.platforms[platform]) || {};
      const intent = normalizeIntent(saved.intent);
      const base = {
        platform,
        label: platformLabels[platform],
        intent,
        creation_url: creationUrls[platform],
        ready: false,
        missing: [],
        connect_url: null,
      };
      if (intent === "skip") {
        rows[platform] = Object.assign({}, base, { ready: true, status: "skipped" });
        continue;
      }
      if (platform === "facebook") {
        const id = String(f(record, "Facebook_Page_ID") || settings.FACEBOOK_PAGE_ID || saved.account_id || "").trim();
        const credentialReady = Boolean(String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim());
        if (!id) base.missing.push("Facebook Page ID");
        if (!credentialReady) base.missing.push("Facebook Page access token");
        rows[platform] = Object.assign({}, base, {
          account_id: id || null,
          credential_ready: credentialReady,
          ready: base.missing.length === 0,
          status: base.missing.length === 0 ? "ready" : "needs_connection",
        });
      } else if (platform === "instagram") {
        const id = String(f(record, "Instagram_Business_Account_ID") || settings.INSTAGRAM_BUSINESS_ACCOUNT_ID || saved.account_id || "").trim();
        const credentialReady = Boolean(String(settings.META_GRAPH_API_ACCESS_TOKEN || "").trim());
        if (!id) base.missing.push("Instagram Business Account ID");
        if (!credentialReady) base.missing.push("Meta Graph access token");
        rows[platform] = Object.assign({}, base, {
          account_id: id || null,
          handle: saved.handle || null,
          credential_ready: credentialReady,
          ready: base.missing.length === 0,
          status: base.missing.length === 0 ? "ready" : "needs_connection",
        });
      } else if (platform === "youtube") {
        const id = String(f(record, "YouTube_Channel_ID") || settings.YOUTUBE_CHANNEL_ID || saved.account_id || "").trim();
        const serviceUrl = String(settings.YOUTUBE_UPLOAD_SERVICE_URL || saved.service_url || "").trim();
        if (!id) base.missing.push("YouTube Channel ID");
        if (!serviceUrl) base.missing.push("city-specific YouTube uploader/OAuth service");
        rows[platform] = Object.assign({}, base, {
          account_id: id || null,
          handle: saved.handle || null,
          service_url: serviceUrl || null,
          ready: base.missing.length === 0,
          status: base.missing.length === 0 ? "ready" : "needs_connection",
        });
      } else if (platform === "tiktok") {
        const handle = String(f(record, "TikTok_Handle") || saved.handle || "").trim().replace(/^@/, "");
        const serviceUrl = String(settings.TIKTOK_WORKER_BASE_URL || saved.service_url || "").trim();
        if (!handle) base.missing.push("TikTok handle");
        if (!serviceUrl) base.missing.push("city-specific TikTok OAuth worker");
        rows[platform] = Object.assign({}, base, {
          handle: handle || null,
          service_url: serviceUrl || null,
          connect_url: serviceUrl ? serviceUrl.replace(/\/$/, "") + "/tiktok/connect" : null,
          ready: base.missing.length === 0,
          status: base.missing.length === 0 ? "ready" : "needs_connection",
        });
      }
    }
    const required = Object.values(rows).filter((row) => row.intent !== "skip");
    return {
      setup,
      platforms: rows,
      ready: required.length > 0 && required.every((row) => row.ready),
      required_count: required.length,
      ready_count: required.filter((row) => row.ready).length,
    };
  }

  async function createProfile(request, env, authorization) {
    const payload = await readJsonBody(request);
    const city = String(payload.city || "").trim().slice(0, 120);
    const stateRegion = String(payload.state_region || "").trim().slice(0, 120);
    const stateCode = String(payload.state_code || "").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
    const country = String(payload.country || "United States").trim().slice(0, 120);
    const countryCode = String(payload.country_code || "US").trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "US";
    const timezone = validateTimeZone(payload.timezone);
    const key = normalizeKey(payload.profile_key || payload.slug || city);
    const shortCode = String(payload.short_code || city.replace(/[^A-Za-z]/g, "").slice(0, 3)).trim().toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 10);
    const brandName = String(payload.brand_name || (city ? city + " Shining" : "")).trim().slice(0, 160);
    const profileName = String(payload.profile_name || brandName + " - " + city).trim().slice(0, 160);
    const websiteUrl = String(payload.website_url || "").trim().slice(0, 1000);
    const launchDate = String(payload.launch_date || "").trim();

    if (!city) throw new HttpError(400, "City is required");
    if (!stateRegion) throw new HttpError(400, "State or region is required");
    if (!key) throw new HttpError(400, "Profile key is required");
    if (!shortCode) throw new HttpError(400, "Short code is required");
    if (!brandName) throw new HttpError(400, "Brand name is required");
    if (websiteUrl) {
      try { new URL(websiteUrl); } catch { throw new HttpError(400, "Website URL must be a valid URL"); }
    }
    if (launchDate && !/^\d{4}-\d{2}-\d{2}$/.test(launchDate)) {
      throw new HttpError(400, "Launch date must be YYYY-MM-DD");
    }

    const profiles = await listRecords(env, STUDIO_IDEA_PROFILE_TABLE_ID, { limit: 100 });
    if (profiles.some((row) => normalizeKey(f(row, "Profile_Key") || f(row, "Market_Name")) === key)) {
      throw new HttpError(409, "A Content Profile for this city/profile key already exists");
    }

    let template = null;
    const templateId = String(payload.template_profile_id || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(templateId)) {
      template = profiles.find((row) => row.id === templateId) || await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, templateId);
    }
    if (!template) template = profiles.find((row) => studioThemeForProfile(row) === "chicago") || profiles[0] || null;
    if (!template) throw new HttpError(409, "A template Content Profile is required before creating a city");

    const setup = normalizeSetup(payload.platforms || {}, null);
    const defaultPlatforms = platformNames
      .filter((platform) => setup.platforms[platform].intent !== "skip")
      .map((platform) => platformLabels[platform]);
    const standardThemes = ["History","Architecture","Sites and Sounds","Events","Parks","Museums","Hidden Gems","Neighborhoods","Transportation","Food","Restaurants","Seasonal","Education","Tourist Tips","Nature"];
    const themes = Array.isArray(payload.allowed_content_themes) && payload.allowed_content_themes.length
      ? payload.allowed_content_themes.map((value) => String(value || "").trim()).filter(Boolean).slice(0, 30)
      : standardThemes;
    const priorityLocations = String(payload.priority_locations || "").trim().slice(0, 20000);
    const localContext = String(payload.local_context || city + " content should emphasize neighborhoods, landmarks, architecture, food, culture, parks, transportation, visually compelling local detail, and practical visitor context.").trim().slice(0, 20000);
    const brandVoice = String(payload.brand_voice || "Bright, polished, curious, visually driven, practical, and locally informed. Keep the tone positive, accessible, energetic, and specific to the city.").trim().slice(0, 20000);
    const primaryAudience = String(payload.primary_audience || "Locals, visitors, photographers, city explorers, architecture fans, food lovers, and travelers looking for visually interesting experiences.").trim().slice(0, 20000);
    const cityTag = city.replace(/[^A-Za-z0-9]/g, "");
    const brandTag = brandName.replace(/[^A-Za-z0-9]/g, "");
    const hashtags = String(payload.default_hashtags || "#" + cityTag + " #" + brandTag + " #CityTravel #Explore" + cityTag + " #Travel").trim().slice(0, 5000);
    const orgId = authorization && authorization.organization && authorization.organization.record_id;
    if (!orgId) throw new HttpError(409, "The Studio membership must be linked to an Organization");

    let brandRecord = null;
    let marketRecord = null;
    try {
      brandRecord = await airtableFetch(env, "Brands", "", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            Brand_ID: "BRD-" + shortCode,
            Brand_Name: brandName,
            Organization: [orgId],
            Active: true,
            Brand_Description: brandName + " is a visual local-discovery brand focused on " + city + " landmarks, neighborhoods, architecture, food, culture, parks, transportation, events, and practical visitor experiences.",
            Brand_Voice: brandVoice,
            Brand_Personality: "Optimistic\nCurious\nPolished\nWelcoming\nPractical\nVisually expressive\nLocally informed",
            Primary_Audience: primaryAudience,
            Caption_Guidelines: "Begin with a strong audience-facing first line. Provide concise context and practical value. Keep captions mobile-readable and free of internal production directions.",
            Hashtag_Guidelines: "Use no more than five highly relevant hashtags for Instagram and TikTok. Include #" + brandTag + " when appropriate.",
            Thumbnail_Style_Guidelines: "Use authentic, photorealistic city imagery with large mobile-readable text inside safe areas. Avoid CGI, fabricated landmarks, and text near crop zones.",
            Visual_Style_Guidelines: "Use authentic, photorealistic " + city + " imagery and accurate geography. Favor recognizable details, neighborhoods, architecture, public spaces, food, movement, and seasonal atmosphere.",
            Fact_Verification_Guidelines: "Verify current schedules, hours, prices, closures, transportation, rankings, business status, and historical claims when precision matters. Do not invent missing facts.",
            Restricted_Topics: "Avoid inflammatory commentary, unsupported safety claims, demeaning neighborhood stereotypes, fabricated history, and misleading location claims.",
            Default_Language: "English",
            ...(websiteUrl ? { Website_URL: websiteUrl } : {}),
          },
          typecast: true,
        }),
      });

      const marketSlug = key.toUpperCase().replace(/[^A-Z0-9]+/g, "-");
      marketRecord = await airtableFetch(env, "Markets", "", {
        method: "POST",
        body: JSON.stringify({
          fields: {
            Market_ID: "MKT-" + countryCode + "-" + (stateCode || "REGION") + "-" + marketSlug,
            Market_Name: city,
            Active: true,
            City: city,
            State_Region: stateRegion,
            Timezone: timezone,
            Country: country,
            Market_Type: "City",
            Primary_Language: "English",
            Local_Context: localContext,
            Priority_Locations: priorityLocations || null,
            Default_Hashtags: hashtags,
          },
          typecast: true,
        }),
      });

      const profileFields = {
        Profile_Name: profileName,
        Brand_Name: brandName,
        // Keep incomplete city profiles out of the normal Studio selector until
        // the platform readiness gate is explicitly activated.
        Active: false,
        Organization: [orgId],
        Brand: [brandRecord.id],
        Market: [marketRecord.id],
        Content_Vertical: arrayOrEmpty(f(template, "Content_Vertical")),
        AI_Persona: arrayOrEmpty(f(template, "AI_Persona")),
        Production_Profile: arrayOrEmpty(f(template, "Production_Profile")),
        Default_Formats: arrayOrEmpty(f(template, "Default_Formats")),
        Market_Name: city,
        State_Region: stateRegion,
        Country: country,
        Timezone: timezone,
        Primary_Audience: primaryAudience,
        Brand_Voice: brandVoice,
        Default_Platforms: defaultPlatforms,
        Allowed_Content_Themes: themes,
        Priority_Locations: priorityLocations || null,
        Avoid_Topics: String(payload.avoid_topics || "").trim() || null,
        Local_Context: localContext,
        Default_Hashtags: hashtags,
        Asset_Filter_Tag: String(payload.asset_filter_tag || city).trim().slice(0, 160),
        Idea_Generation_Enabled: false,
        Autonomous_Produce_Enabled: false,
        Daily_Idea_Limit: 5,
        Profile_Key: key,
        Profile_Short_Code: shortCode,
        Website_URL: websiteUrl || null,
        Launch_Date: launchDate || null,
        Profile_Setup_Status: "Platforms Pending",
        Platform_Setup_JSON: JSON.stringify(setup),
        Facebook_Page_ID: setup.platforms.facebook.account_id || null,
        Instagram_Business_Account_ID: setup.platforms.instagram.account_id || null,
        YouTube_Channel_ID: setup.platforms.youtube.account_id || null,
        TikTok_Handle: setup.platforms.tiktok.handle || null,
      };
      const created = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, "", {
        method: "POST",
        body: JSON.stringify({ fields: profileFields, typecast: true }),
      });
      await saveNonSecretSettings(env, created, setup);
      env.__contentProfilesPromise = null;
      return respond(request, env, {
        ok: true,
        created: true,
        profile: mapStudioContentProfile(created),
        brand: { id: brandRecord.id, name: brandName },
        market: { id: marketRecord.id, name: city },
        readiness: await readiness(env, created),
      }, 201);
    } catch (error) {
      if (marketRecord && marketRecord.id) {
        await airtableFetch(env, "Markets", marketRecord.id, { method: "DELETE" }).catch(() => {});
      }
      if (brandRecord && brandRecord.id) {
        await airtableFetch(env, "Brands", brandRecord.id, { method: "DELETE" }).catch(() => {});
      }
      throw error;
    }
  }

  async function getSetup(request, env, url, authorization) {
    const record = await loadProfile(env, recordIdFromPath(url), authorization);
    return respond(request, env, {
      ok: true,
      profile: mapStudioContentProfile(record),
      readiness: await readiness(env, record),
    });
  }

  async function patchSetup(request, env, url, authorization) {
    const record = await loadProfile(env, recordIdFromPath(url), authorization);
    const payload = await readJsonBody(request);
    const previous = readSetup(record);
    const setup = payload.platforms ? normalizeSetup(payload.platforms, previous) : previous;
    const fields = {};
    if (payload.platforms) {
      fields.Platform_Setup_JSON = JSON.stringify(setup);
      fields.Default_Platforms = platformNames
        .filter((platform) => setup.platforms[platform].intent !== "skip")
        .map((platform) => platformLabels[platform]);
      fields.Facebook_Page_ID = setup.platforms.facebook.account_id || null;
      fields.Instagram_Business_Account_ID = setup.platforms.instagram.account_id || null;
      fields.YouTube_Channel_ID = setup.platforms.youtube.account_id || null;
      fields.TikTok_Handle = setup.platforms.tiktok.handle || null;
      fields.Profile_Setup_Status = "Platforms Pending";
    }
    if (payload.website_url !== undefined) fields.Website_URL = String(payload.website_url || "").trim() || null;
    if (payload.launch_date !== undefined) fields.Launch_Date = String(payload.launch_date || "").trim() || null;

    let probeRecord = record;
    if (Object.keys(fields).length) {
      probeRecord = { ...record, fields: { ...(record.fields || {}), ...fields } };
    }
    await saveNonSecretSettings(env, probeRecord, setup);

    if (payload.action === "activate") {
      const state = await readiness(env, probeRecord);
      if (!state.ready) {
        const missing = Object.values(state.platforms)
          .filter((row) => row.intent !== "skip" && !row.ready)
          .map((row) => row.label + ": " + row.missing.join(", "));
        throw new HttpError(409, "Finish platform setup before activation. " + missing.join(" | "));
      }
      fields.Profile_Setup_Status = "Active";
      fields.Active = true;
    }
    if (!Object.keys(fields).length) throw new HttpError(400, "No profile setup changes were supplied");

    const updated = await airtableFetch(env, STUDIO_IDEA_PROFILE_TABLE_ID, record.id, {
      method: "PATCH",
      body: JSON.stringify({ fields, typecast: true }),
    });
    await saveNonSecretSettings(env, updated, setup);
    env.__contentProfilesPromise = null;
    return respond(request, env, {
      ok: true,
      profile: mapStudioContentProfile(updated),
      readiness: await readiness(env, updated),
    });
  }

  async function validatePlatform(request, env, url, authorization) {
    const record = await loadProfile(env, recordIdFromPath(url), authorization);
    const match = /\/platforms\/(instagram|tiktok|youtube|facebook)\/validate$/.exec(url.pathname);
    const platform = match && match[1];
    if (!platform) throw new HttpError(400, "Unknown platform");
    const state = await readiness(env, record);
    const row = state.platforms[platform];
    if (!row || row.intent === "skip") {
      return respond(request, env, {
        ok: true,
        platform,
        validation: { verified: Boolean(row && row.intent === "skip"), skipped: true },
        readiness: state,
      });
    }

    let validation = { verified: false, message: "Platform configuration is incomplete." };
    try {
      if (platform === "tiktok") {
        if (!row.service_url) throw new Error("TikTok OAuth worker is not configured.");
        const response = await fetch(row.service_url.replace(/\/$/, "") + "/tiktok/status", { signal: AbortSignal.timeout(8000) });
        const body = await response.json().catch(() => ({}));
        const username = String(body.creator_username || (body.creator && body.creator.creator_username) || (body.creator && body.creator.username) || "").replace(/^@/, "");
        validation = {
          verified: Boolean(response.ok && (body.authorized || body.ok) && (!row.handle || !username || username.toLowerCase() === String(row.handle).toLowerCase())),
          http_status: response.status,
          connected_handle: username || null,
          message: response.ok ? "TikTok worker responded." : "TikTok worker did not validate.",
        };
      } else if (platform === "youtube") {
        const settings = await studioActivePipelineSettings(env, ["YOUTUBE_API_KEY"], record);
        const key = String(settings.YOUTUBE_API_KEY || "").trim();
        if (!row.account_id) throw new Error("YouTube Channel ID is missing.");
        if (!key) throw new Error("YouTube API key is not configured.");
        const endpoint = "https://www.googleapis.com/youtube/v3/channels?part=snippet&id=" +
          encodeURIComponent(row.account_id) + "&key=" + encodeURIComponent(key);
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        const body = await response.json().catch(() => ({}));
        const item = Array.isArray(body.items) ? body.items[0] : null;
        validation = {
          verified: Boolean(response.ok && item && item.id),
          http_status: response.status,
          channel_title: item && item.snippet ? item.snippet.title : null,
          message: item && item.id ? "YouTube channel verified." : "YouTube channel was not found.",
        };
      } else {
        const settings = await studioActivePipelineSettings(env, [
          "FACEBOOK_PAGE_ACCESS_TOKEN",
          "META_GRAPH_API_ACCESS_TOKEN",
          "FACEBOOK_GRAPH_API_VERSION",
          "META_GRAPH_API_VERSION",
        ], record);
        const token = platform === "facebook"
          ? String(settings.FACEBOOK_PAGE_ACCESS_TOKEN || "").trim()
          : String(settings.META_GRAPH_API_ACCESS_TOKEN || "").trim();
        if (!row.account_id) throw new Error(platformLabels[platform] + " account ID is missing.");
        if (!token) throw new Error("Meta publishing credential is not configured for this city.");
        const version = String(settings.FACEBOOK_GRAPH_API_VERSION || settings.META_GRAPH_API_VERSION || "v25.0").replace(/^\/+|\/+$/g, "");
        const fields = platform === "instagram" ? "id,username,name" : "id,name";
        const endpoint = "https://graph.facebook.com/" + version + "/" + encodeURIComponent(row.account_id) +
          "?fields=" + encodeURIComponent(fields) + "&access_token=" + encodeURIComponent(token);
        const response = await fetch(endpoint, { signal: AbortSignal.timeout(8000) });
        const body = await response.json().catch(() => ({}));
        validation = {
          verified: Boolean(response.ok && body.id && !body.error),
          http_status: response.status,
          account_name: body.name || body.username || null,
          account_handle: body.username || null,
          message: response.ok && body.id ? platformLabels[platform] + " account verified." : String((body.error && body.error.message) || "Meta account validation failed."),
        };
      }
    } catch (error) {
      validation = { verified: false, message: error instanceof Error ? error.message : String(error) };
    }
    return respond(request, env, {
      ok: true,
      platform,
      validation,
      readiness: await readiness(env, record),
    });
  }

  return {
    readSetup,
    createProfile,
    getSetup,
    patchSetup,
    validatePlatform,
    readiness,
  };
}
