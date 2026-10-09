(() => {
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const apiBase = String(config.apiBase || "").replace(/\/$/, "") || window.location.origin;
  const $ = (id) => document.getElementById(id);

  const presets = {
    "las-vegas": {
      city: "Las Vegas",
      state_region: "Nevada",
      country: "United States",
      timezone: "America/Los_Angeles",
      short_code: "LV",
      profile_name: "Las Vegas Shining - Las Vegas",
      brand_name: "Las Vegas Shining",
      brand_hashtag: "#LasVegasShining",
      default_hashtags: "#LasVegas #VegasTravel #VegasViews #ExploreVegas #LasVegasShining",
      background_color: "#efe8f6",
      local_context: "Las Vegas content should cover the Strip, Downtown and Fremont Street, resort architecture, entertainment, sports, dining, neon history, desert scenery, pools, conventions, practical visitor advice, and nearby experiences. Distinguish Las Vegas proper from wider Clark County and day-trip destinations when that context matters.",
      priority_locations: "Las Vegas Strip, Sphere, Bellagio fountains, Fremont Street Experience, Downtown Las Vegas, Neon Museum, Arts District, Resorts World, Wynn and Encore, Venetian and Palazzo, Caesars Palace, Paris Las Vegas, New York-New York, Mandalay Bay, Allegiant Stadium, T-Mobile Arena, LINQ Promenade, High Roller, Welcome to Fabulous Las Vegas sign, Red Rock Canyon, Hoover Dam, Lake Mead, and major skyline/night viewpoints.",
    },
    "san-francisco": {
      city: "San Francisco",
      state_region: "California",
      country: "United States",
      timezone: "America/Los_Angeles",
      short_code: "SF",
      profile_name: "San Francisco Shining - San Francisco",
      brand_name: "San Francisco Shining",
      brand_hashtag: "#SanFranciscoShining",
      default_hashtags: "#SanFrancisco #SFViews #ExploreSF #BayArea #SanFranciscoShining",
      background_color: "#e9f2f5",
      local_context: "San Francisco content should emphasize neighborhoods, hills, waterfronts, architecture, transit, food, parks, history, fog and weather, the Bay, and practical visitor context. Distinguish San Francisco from Oakland, Marin, Silicon Valley, and wider Bay Area destinations.",
      priority_locations: "Golden Gate Bridge, Presidio, Crissy Field, Fisherman's Wharf, Pier 39, Embarcadero, Ferry Building, Alcatraz viewpoints, Chinatown, North Beach, Nob Hill, Russian Hill, Lombard Street, Union Square, Financial District, Salesforce Park, SoMa, Mission District, Castro, Haight-Ashbury, Painted Ladies, Golden Gate Park, Ocean Beach, Lands End, Twin Peaks, cable cars, historic streetcars, and major skyline viewpoints.",
    },
    "new-orleans": {
      city: "New Orleans",
      state_region: "Louisiana",
      country: "United States",
      timezone: "America/Chicago",
      short_code: "NOLA",
      profile_name: "New Orleans Shining - New Orleans",
      brand_name: "New Orleans Shining",
      brand_hashtag: "#NewOrleansShining",
      default_hashtags: "#NewOrleans #NOLA #VisitNewOrleans #NOLAViews #NewOrleansShining",
      background_color: "#f1eee4",
      local_context: "New Orleans content should emphasize neighborhoods, Creole and Cajun influences, food, live music, architecture, streetcars, festivals, history, the Mississippi River, cemeteries, and practical visitor context. Avoid reducing the city to Bourbon Street alone.",
      priority_locations: "French Quarter, Jackson Square, St. Louis Cathedral, Royal Street, Bourbon Street, Frenchmen Street, Marigny, Bywater, Garden District, Magazine Street, St. Charles Avenue, streetcars, City Park, Audubon Park, Warehouse District, Arts District, National WWII Museum, Mississippi Riverfront, Crescent Park, Canal Street, Tremé, historic cemeteries, and major food and live-music corridors.",
    },
    "washington-dc": {
      city: "Washington",
      state_region: "District of Columbia",
      country: "United States",
      timezone: "America/New_York",
      short_code: "DC",
      profile_name: "Washington DC Shining - Washington",
      brand_name: "Washington DC Shining",
      brand_hashtag: "#WashingtonDCShining",
      default_hashtags: "#WashingtonDC #DCViews #VisitDC #ExploreDC #WashingtonDCShining",
      background_color: "#edf0f5",
      local_context: "Washington DC content should combine monuments, museums, architecture, neighborhoods, parks, waterfronts, transit, history, culture, seasonal events, and practical visitor advice. Keep political reporting separate from evergreen city-discovery content unless a location's civic history is the subject.",
      priority_locations: "National Mall, Lincoln Memorial, Washington Monument, Jefferson Memorial, U.S. Capitol exterior, Library of Congress, Smithsonian museums, National Gallery of Art, Tidal Basin, Georgetown, Georgetown Waterfront, Dupont Circle, Adams Morgan, U Street, Shaw, The Wharf, Navy Yard, Capitol Hill, Eastern Market, Union Station, Rock Creek Park, Embassy Row, Metro stations, and major rooftop/skyline viewpoints.",
    },
    "boston": {
      city: "Boston",
      state_region: "Massachusetts",
      country: "United States",
      timezone: "America/New_York",
      short_code: "BOS",
      profile_name: "Boston Shining - Boston",
      brand_name: "Boston Shining",
      brand_hashtag: "#BostonShining",
      default_hashtags: "#Boston #BostonViews #VisitBoston #ExploreBoston #BostonShining",
      background_color: "#edf3ef",
      local_context: "Boston content should emphasize history, neighborhoods, brick architecture, universities, harbor and waterfront, parks, food, transit, sports culture, seasonal experiences, and practical visitor context. Distinguish Boston proper from Cambridge and surrounding Greater Boston destinations.",
      priority_locations: "Freedom Trail, Boston Common, Public Garden, Beacon Hill, Acorn Street, Back Bay, Commonwealth Avenue, Copley Square, Boston Public Library, Newbury Street, North End, Faneuil Hall, Quincy Market, Seaport, Harborwalk, Rose Kennedy Greenway, Charlestown, USS Constitution, Fenway Park, South End, Chinatown, Cambridge viewpoints, Charles River Esplanade, MBTA stations, and major skyline/harbor viewpoints.",
    },
  };

  const themeNames = [
    "History", "Architecture", "Sites and Sounds", "Events", "Parks", "Museums",
    "Hidden Gems", "Neighborhoods", "Transportation", "Food", "Restaurants",
    "Seasonal", "Education", "Tourist Tips", "Nature",
  ];

  const formatNames = [
    "Vertical Short Video", "Story", "Carousel", "Feed Post", "Longform Video",
    "Thumbnail / Promo Still", "Photo Set",
  ];

  let payload = null;
  let current = null;
  let busy = false;

  async function api(path, options = {}) {
    const response = await fetch(apiBase + path, {
      credentials: "include",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body.error || body.message || `Request failed (${response.status})`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setMessage(text = "", tone = "") {
    const node = $("profileSetupMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `profile-setup-message${tone ? ` ${tone}` : ""}`;
  }

  function activeDrafts() {
    return (payload?.records || []).filter((item) => item?.state?.lifecycle !== "active");
  }

  function recordById(id) {
    return (payload?.records || []).find((item) => item?.profile?.id === id) || null;
  }

  function blankState() {
    return {
      city: "",
      state_region: "",
      country: "United States",
      timezone: "America/Chicago",
      short_code: "",
      profile_name: "",
      brand_name: "",
      slug: "",
      website_url: "",
      brand_hashtag: "",
      default_hashtags: "",
      primary_audience: "Travelers, locals, photographers, and people discovering the city.",
      brand_voice: "Bright, polished, curious, practical, visually driven, and locally informed.",
      local_context: "",
      priority_locations: "",
      avoid_topics: "",
      asset_filter_tag: "",
      background_color: "",
      default_formats: [...formatNames],
      content_themes: [...themeNames],
      platforms: Object.fromEntries(
        Object.keys(payload?.platforms || { instagram: {}, tiktok: {}, youtube: {}, facebook: {} })
          .map((key) => [key, { enabled: true, setup_mode: "existing", deferred: false, desired_handle: "" }])
      ),
    };
  }

  function currentState() {
    return current?.state ? structuredClone(current.state) : blankState();
  }

  function statusBadge(connection, saved) {
    const status = connection?.status || saved?.last_status || "not_configured";
    const label = saved?.deferred ? "Set up later" :
      status === "connected" ? "Connected" :
      status === "needs_authorization" ? "Needs authorization" :
      status === "error" ? "Connection error" :
      status === "configured" ? "Configured" : "Not configured";
    const tone = saved?.deferred ? "deferred" : status;
    return `<span class="profile-platform-status ${escapeHtml(tone)}">${escapeHtml(label)}</span>`;
  }

  function platformFields(key, saved = {}) {
    if (key === "facebook") {
      return `
        <label>Facebook Page ID<input name="facebook_page_id" value="${escapeHtml(current?.connections?.facebook?.account_id || "")}" autocomplete="off"></label>
        <label>Page access token <span class="field-hint">(stored, never displayed again)</span><input name="facebook_page_access_token" type="password" value="" autocomplete="new-password"></label>`;
    }
    if (key === "instagram") {
      return `
        <label>Instagram professional account ID<input name="instagram_business_account_id" value="${escapeHtml(current?.connections?.instagram?.account_id || "")}" autocomplete="off"></label>
        <label>Meta access token <span class="field-hint">(stored, never displayed again)</span><input name="instagram_page_access_token" type="password" value="" autocomplete="new-password"></label>`;
    }
    if (key === "youtube") {
      return `
        <label>YouTube channel ID<input name="youtube_channel_id" value="${escapeHtml(current?.connections?.youtube?.account_id || "")}" autocomplete="off"></label>
        <label>Uploader service URL<input name="youtube_upload_service_url" placeholder="https://…" autocomplete="off"></label>
        <label>Uploader shared secret <span class="field-hint">(optional if service uses the global secret)</span><input name="youtube_upload_service_shared_secret" type="password" value="" autocomplete="new-password"></label>`;
    }
    return `
      <label>TikTok handle<input name="tiktok_handle" value="${escapeHtml(saved.desired_handle || "")}" placeholder="@handle" autocomplete="off"></label>
      <label>TikTok auth worker URL<input name="tiktok_worker_base_url" placeholder="https://auth-….chicagoshining.com" autocomplete="off"></label>`;
  }

  function renderPlatformCard(key, descriptor) {
    const state = currentState();
    const saved = state.platforms?.[key] || {};
    const connection = current?.connections?.[key] || {};
    const createMode = saved.setup_mode === "create";
    const connectUrl = key === "tiktok" ? String(connection?.connect_url || "") : "";
    const integrationNote = key === "tiktok" && saved.enabled && !connection?.worker_configured
      ? "TikTok signup can be completed now; publishing authorization will remain pending until this profile has a TikTok auth worker URL."
      : key === "youtube" && saved.enabled && !connection?.service_configured
        ? "YouTube channel creation can be completed now; publishing authorization will remain pending until this profile has a YouTube uploader service URL."
        : "";
    return `
      <article class="profile-platform-card" data-platform-card="${key}">
        <div class="profile-platform-head">
          <div>
            <label class="profile-platform-enable">
              <input type="checkbox" data-platform-enabled="${key}" ${saved.enabled ? "checked" : ""}>
              <strong>${escapeHtml(descriptor.label)}</strong>
            </label>
            <p class="subtle">Create a new account or connect an existing destination.</p>
          </div>
          ${statusBadge(connection, saved)}
        </div>
        <div class="profile-platform-body" ${saved.enabled ? "" : "hidden"}>
          <div class="profile-choice-row">
            <label><input type="radio" name="${key}_mode" value="existing" ${!createMode ? "checked" : ""}> I already have it</label>
            <label><input type="radio" name="${key}_mode" value="create" ${createMode ? "checked" : ""}> Create a new one</label>
          </div>
          <label>Desired handle / account name
            <input data-platform-handle="${key}" value="${escapeHtml(saved.desired_handle || "")}" placeholder="${escapeHtml(state.brand_name || state.city || "City Shining")}">
          </label>
          <div class="profile-platform-actions">
            <a class="button secondary" data-platform-create="${key}" href="${escapeHtml(descriptor.create_url)}" target="_blank" rel="noopener">
              Open ${escapeHtml(descriptor.label)} ${createMode ? "account creation" : "site"}
            </a>
            <a class="button ghost" href="${escapeHtml(descriptor.help_url)}" target="_blank" rel="noopener">Setup help</a>
          </div>
          <p class="profile-platform-note">${platformCreationNote(key)}</p>
          <details class="profile-connection-details">
            <summary>Connection details</summary>
            <div class="profile-fields two-col">
              ${platformFields(key, saved)}
            </div>
          </details>
          <div class="profile-platform-footer">
            <label class="profile-defer"><input type="checkbox" data-platform-deferred="${key}" ${saved.deferred ? "checked" : ""}> Set up later and allow profile activation</label>
            <button type="button" class="secondary" data-platform-verify="${key}">Save & verify</button>
          </div>
          ${connection?.account_name ? `<p class="profile-connected-as">Connected as <strong>${escapeHtml(connection.account_name)}</strong></p>` : ""}
          ${integrationNote ? `<p class="profile-integration-note">${escapeHtml(integrationNote)}</p>` : ""}\n          ${connection?.error ? `<p class="error-text">${escapeHtml(connection.error)}</p>` : ""}
          ${connectUrl ? `<p><a class="button secondary" href="${escapeHtml(connectUrl)}" target="_blank" rel="noopener">Authorize TikTok</a></p>` : ""}
        </div>
      </article>`;
  }

  function platformCreationNote(key) {
    if (key === "instagram") return "Instagram may require email/phone verification, CAPTCHA, MFA, and conversion to a professional account. Studio will not bypass those platform-owned steps.";
    if (key === "facebook") return "Facebook Page creation happens in Meta's own flow. Create the Page under the intended admin account, then return here to connect the Page ID and token.";
    if (key === "youtube") return "Create the YouTube channel under the intended Google/Brand Account, then connect the uploader service that is authorized to that channel.";
    return "TikTok account signup and identity verification happen on TikTok. Afterward, return here and connect the profile's TikTok auth worker.";
  }

  function render() {
    const root = $("profileSetupRoot");
    if (!root || !payload) return;
    const state = currentState();
    const records = payload.records || [];
    const drafts = activeDrafts();
    const checklist = current?.checklist || null;
    const selectedId = current?.profile?.id || "";

    root.innerHTML = `
      <div class="profile-setup-shell">
        <section class="profile-setup-hero">
          <div>
            <p class="eyebrow">Shining Cities</p>
            <h2>New Profile / City Setup</h2>
            <p>Build the city profile, seed its strategy, create or connect its social accounts, verify destinations, and activate it only when the launch checklist is ready.</p>
          </div>
          <div class="profile-setup-summary">
            <strong>${drafts.length}</strong>
            <span>profiles in setup</span>
          </div>
        </section>

        <div class="profile-setup-toolbar">
          <label>Profile in setup
            <select id="profileSetupExisting">
              <option value="">Start a new city</option>
              ${records.map((item) => `<option value="${escapeHtml(item.profile.id)}" ${item.profile.id === selectedId ? "selected" : ""}>${escapeHtml(item.profile.name || item.state.city)}${item.state.lifecycle === "active" ? " · Active" : " · Setup"}</option>`).join("")}
            </select>
          </label>
          <button type="button" id="profileSetupNew" class="secondary">New city</button>
        </div>

        <section class="profile-setup-step">
          <div class="profile-step-number">1</div>
          <div class="profile-step-content">
            <h3>City & brand</h3>
            <p class="subtle">Choose one of the five planned expansion cities or start with a custom city.</p>
            <div class="profile-fields three-col">
              <label>City preset
                <select id="profileSetupPreset">
                  <option value="">Custom city</option>
                  <option value="las-vegas">Las Vegas</option>
                  <option value="san-francisco">San Francisco</option>
                  <option value="new-orleans">New Orleans</option>
                  <option value="washington-dc">Washington DC</option>
                  <option value="boston">Boston</option>
                </select>
              </label>
              <label>City *<input id="profileSetupCity" value="${escapeHtml(state.city)}"></label>
              <label>State / region *<input id="profileSetupRegion" value="${escapeHtml(state.state_region)}"></label>
              <label>Country<input id="profileSetupCountry" value="${escapeHtml(state.country || "United States")}"></label>
              <label>Timezone *
                <select id="profileSetupTimezone">
                  ${timezoneOptions(state.timezone)}
                </select>
              </label>
              <label>Short code<input id="profileSetupShortCode" maxlength="8" value="${escapeHtml(state.short_code)}" placeholder="LV"></label>
              <label>Profile name *<input id="profileSetupProfileName" value="${escapeHtml(state.profile_name)}"></label>
              <label>Brand name *<input id="profileSetupBrandName" value="${escapeHtml(state.brand_name)}"></label>
              <label>Website / domain<input id="profileSetupWebsite" value="${escapeHtml(state.website_url)}" placeholder="https://…"></label>
              <label>Brand hashtag<input id="profileSetupBrandHashtag" value="${escapeHtml(state.brand_hashtag)}" placeholder="#CityShining"></label>
              <label>Asset filter tag<input id="profileSetupAssetTag" value="${escapeHtml(state.asset_filter_tag)}" placeholder="city-slug"></label>
              <label>Studio background<input id="profileSetupBackground" type="text" value="${escapeHtml(state.background_color)}" placeholder="#RRGGBB"></label>
            </div>
            <div class="profile-step-actions">
              <button type="button" id="profileSetupSaveBasics" class="primary">${current?.profile?.id ? "Save city profile" : "Create profile draft"}</button>
            </div>
          </div>
        </section>

        <section class="profile-setup-step ${current?.profile?.id ? "" : "is-locked"}">
          <div class="profile-step-number">2</div>
          <div class="profile-step-content">
            <h3>Content DNA</h3>
            <p class="subtle">These become the city's reusable AI and editorial context.</p>
            <div class="profile-fields two-col">
              <label>Local context<textarea id="profileSetupLocalContext" rows="6">${escapeHtml(state.local_context)}</textarea></label>
              <label>Priority locations<textarea id="profileSetupLocations" rows="6">${escapeHtml(state.priority_locations)}</textarea></label>
              <label>Default hashtags<textarea id="profileSetupHashtags" rows="3">${escapeHtml(state.default_hashtags)}</textarea></label>
              <label>Avoid topics / guardrails<textarea id="profileSetupAvoid" rows="3">${escapeHtml(state.avoid_topics)}</textarea></label>
              <label>Primary audience<textarea id="profileSetupAudience" rows="3">${escapeHtml(state.primary_audience)}</textarea></label>
              <label>Brand voice<textarea id="profileSetupVoice" rows="3">${escapeHtml(state.brand_voice)}</textarea></label>
            </div>
            <fieldset class="profile-theme-picker">
              <legend>Allowed content themes</legend>
              <div class="profile-theme-grid">
                ${themeNames.map((name) => `<label><input type="checkbox" data-profile-theme="${escapeHtml(name)}" ${state.content_themes?.includes(name) ? "checked" : ""}> ${escapeHtml(name)}</label>`).join("")}
              </div>
            </fieldset>
            <div class="profile-step-actions">
              <button type="button" id="profileSetupSaveStrategy" class="secondary" ${current?.profile?.id ? "" : "disabled"}>Save content DNA</button>
            </div>
          </div>
        </section>

        <section class="profile-setup-step ${current?.profile?.id ? "" : "is-locked"}">
          <div class="profile-step-number">3</div>
          <div class="profile-step-content">
            <h3>Social platforms</h3>
            <p class="subtle">Studio supports both paths: use an account you already have, or open the platform's official account-creation flow and resume here afterward.</p>
            <div class="profile-platform-grid">
              ${Object.entries(payload.platforms || {}).map(([key, descriptor]) => renderPlatformCard(key, descriptor)).join("")}
            </div>
          </div>
        </section>

        <section class="profile-setup-step ${current?.profile?.id ? "" : "is-locked"}">
          <div class="profile-step-number">4</div>
          <div class="profile-step-content">
            <h3>Validate & activate</h3>
            ${renderChecklist(checklist)}
            <div class="profile-step-actions">
              <button type="button" id="profileSetupRefresh" class="secondary" ${current?.profile?.id ? "" : "disabled"}>Refresh validation</button>
              <button type="button" id="profileSetupActivate" class="primary" ${checklist?.can_activate && current?.state?.lifecycle !== "active" ? "" : "disabled"}>${current?.state?.lifecycle === "active" ? "Profile active" : "Activate profile"}</button>
            </div>
            <p class="subtle">Activation makes the city visible in the Studio profile switcher. Idea generation and autonomous production remain off until you enable them separately.</p>
          </div>
        </section>
      </div>`;

    bind();
  }

  function timezoneOptions(selected) {
    const zones = [
      ["America/Los_Angeles", "Pacific — America/Los_Angeles"],
      ["America/Denver", "Mountain — America/Denver"],
      ["America/Chicago", "Central — America/Chicago"],
      ["America/New_York", "Eastern — America/New_York"],
      ["America/Phoenix", "Arizona — America/Phoenix"],
      ["Pacific/Honolulu", "Hawaii — Pacific/Honolulu"],
      ["America/Anchorage", "Alaska — America/Anchorage"],
    ];
    if (selected && !zones.some(([value]) => value === selected)) zones.push([selected, selected]);
    return zones.map(([value, label]) => `<option value="${escapeHtml(value)}" ${value === selected ? "selected" : ""}>${escapeHtml(label)}</option>`).join("");
  }

  function renderChecklist(checklist) {
    if (!checklist) return '<p class="subtle">Create the profile draft to start validation.</p>';
    const base = [checklist.basics, checklist.strategy, checklist.platforms];
    return `
      <div class="profile-checklist">
        ${base.map((item) => `<div class="profile-check ${item.ok ? "ok" : "pending"}"><span>${item.ok ? "✓" : "○"}</span><strong>${escapeHtml(item.label)}</strong></div>`).join("")}
        ${(checklist.platform_items || []).map((item) => `<div class="profile-check platform ${item.ok ? "ok" : "pending"}"><span>${item.ok ? "✓" : "○"}</span><span>${escapeHtml(item.label)} — ${escapeHtml(item.connected ? "connected" : item.deferred ? "set up later" : item.status)}</span></div>`).join("")}
      </div>`;
  }

  function collectBasics(includeStrategy = false) {
    const base = currentState();
    const next = {
      ...base,
      city: $("profileSetupCity")?.value?.trim() || "",
      state_region: $("profileSetupRegion")?.value?.trim() || "",
      country: $("profileSetupCountry")?.value?.trim() || "United States",
      timezone: $("profileSetupTimezone")?.value || "",
      short_code: $("profileSetupShortCode")?.value?.trim() || "",
      profile_name: $("profileSetupProfileName")?.value?.trim() || "",
      brand_name: $("profileSetupBrandName")?.value?.trim() || "",
      website_url: $("profileSetupWebsite")?.value?.trim() || "",
      brand_hashtag: $("profileSetupBrandHashtag")?.value?.trim() || "",
      asset_filter_tag: $("profileSetupAssetTag")?.value?.trim() || "",
      background_color: $("profileSetupBackground")?.value?.trim() || "",
    };
    if (includeStrategy) {
      next.local_context = $("profileSetupLocalContext")?.value?.trim() || "";
      next.priority_locations = $("profileSetupLocations")?.value?.trim() || "";
      next.default_hashtags = $("profileSetupHashtags")?.value?.trim() || "";
      next.avoid_topics = $("profileSetupAvoid")?.value?.trim() || "";
      next.primary_audience = $("profileSetupAudience")?.value?.trim() || "";
      next.brand_voice = $("profileSetupVoice")?.value?.trim() || "";
      next.content_themes = [...document.querySelectorAll("[data-profile-theme]:checked")].map((node) => node.dataset.profileTheme);
    }
    next.platforms = collectPlatformState(next.platforms);
    return next;
  }

  function collectPlatformState(prior = {}) {
    const platforms = {};
    for (const key of Object.keys(payload?.platforms || {})) {
      platforms[key] = {
        ...(prior?.[key] || {}),
        enabled: Boolean(document.querySelector(`[data-platform-enabled="${key}"]`)?.checked),
        setup_mode: document.querySelector(`input[name="${key}_mode"]:checked`)?.value || prior?.[key]?.setup_mode || "existing",
        desired_handle: document.querySelector(`[data-platform-handle="${key}"]`)?.value?.trim() || "",
        deferred: Boolean(document.querySelector(`[data-platform-deferred="${key}"]`)?.checked),
      };
    }
    return platforms;
  }

  function applyPreset(key) {
    const preset = presets[key];
    if (!preset) return;
    const state = { ...currentState(), ...preset, asset_filter_tag: key };
    state.content_themes = [...themeNames];
    state.platforms = Object.fromEntries(
      Object.keys(payload?.platforms || {}).map((platform) => [
        platform,
        { ...(state.platforms?.[platform] || {}), enabled: true, setup_mode: "existing", deferred: false },
      ])
    );
    current = current?.profile?.id ? { ...current, state } : { state };
    render();
    const presetSelect = $("profileSetupPreset");
    if (presetSelect) presetSelect.value = key;
  }

  async function saveProfile(includeStrategy) {
    if (busy) return;
    busy = true;
    setMessage(current?.profile?.id ? "Saving profile…" : "Creating profile draft…");
    try {
      const state = collectBasics(includeStrategy);
      const result = current?.profile?.id
        ? await api(`/api/profile-setup/${current.profile.id}`, { method: "PATCH", body: JSON.stringify(state) })
        : await api("/api/profile-setup", { method: "POST", body: JSON.stringify(state) });
      await reload(result.profile?.id || current?.profile?.id);
      setMessage(current?.profile?.id ? "Profile saved." : "Profile draft created.", "success");
    } catch (error) {
      setMessage(error.message || "Could not save profile.", "error");
    } finally {
      busy = false;
    }
  }

  function platformPayload(key) {
    const state = collectBasics(false);
    const saved = state.platforms?.[key] || {};
    const card = document.querySelector(`[data-platform-card="${key}"]`);
    const val = (name) => card?.querySelector(`[name="${name}"]`)?.value?.trim() || "";
    const common = {
      enabled: saved.enabled,
      setup_mode: saved.setup_mode,
      deferred: saved.deferred,
      desired_handle: saved.desired_handle,
    };
    if (key === "facebook") return {
      ...common,
      page_id: val("facebook_page_id"),
      page_access_token: val("facebook_page_access_token"),
    };
    if (key === "instagram") return {
      ...common,
      instagram_business_account_id: val("instagram_business_account_id"),
      page_access_token: val("instagram_page_access_token"),
    };
    if (key === "youtube") return {
      ...common,
      youtube_channel_id: val("youtube_channel_id"),
      upload_service_url: val("youtube_upload_service_url"),
      upload_service_shared_secret: val("youtube_upload_service_shared_secret"),
    };
    return {
      ...common,
      tiktok_handle: val("tiktok_handle") || saved.desired_handle,
      worker_base_url: val("tiktok_worker_base_url"),
    };
  }

  async function savePlatform(key, extra = {}) {
    if (!current?.profile?.id || busy) return;
    busy = true;
    setMessage(`Saving ${payload.platforms[key]?.label || key} setup…`);
    try {
      const result = await api(`/api/profile-setup/${current.profile.id}/platform/${key}`, {
        method: "POST",
        body: JSON.stringify({ ...platformPayload(key), ...extra }),
      });
      current = { ...current, ...result, profile: current.profile };
      await reload(current.profile.id);
      setMessage(`${payload.platforms[key]?.label || key} setup saved and checked.`, "success");
    } catch (error) {
      setMessage(error.message || "Could not save platform setup.", "error");
    } finally {
      busy = false;
    }
  }

  async function activate() {
    if (!current?.profile?.id || busy) return;
    busy = true;
    setMessage("Activating profile…");
    try {
      const result = await api(`/api/profile-setup/${current.profile.id}/activate`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      current = result;
      await reload(current.profile?.id);
      window.dispatchEvent(new CustomEvent("studio-profile-created", { detail: { profile_id: current.profile?.id } }));
      setMessage("Profile activated and added to the Studio profile switcher.", "success");
    } catch (error) {
      if (error.body?.checklist) {
        current = { ...current, checklist: error.body.checklist, connections: error.body.connections, state: error.body.state };
        render();
      }
      setMessage(error.message || "Profile is not ready to activate.", "error");
    } finally {
      busy = false;
    }
  }

  async function reload(selectId = null) {
    payload = await api("/api/profile-setup");
    const id = selectId || current?.profile?.id;
    current = id ? recordById(id) : null;
    render();
  }

  async function load() {
    try {
      await reload();
    } catch (error) {
      setMessage(error.message || "Could not load profile setup.", "error");
    }
  }

  function bind() {
    $("profileSetupExisting")?.addEventListener("change", (event) => {
      current = event.target.value ? recordById(event.target.value) : null;
      render();
    });
    $("profileSetupNew")?.addEventListener("click", () => {
      current = null;
      render();
    });
    $("profileSetupPreset")?.addEventListener("change", (event) => applyPreset(event.target.value));
    $("profileSetupSaveBasics")?.addEventListener("click", () => saveProfile(false));
    $("profileSetupSaveStrategy")?.addEventListener("click", () => saveProfile(true));
    $("profileSetupRefresh")?.addEventListener("click", () => reload(current?.profile?.id));
    $("profileSetupActivate")?.addEventListener("click", activate);

    document.querySelectorAll("[data-platform-enabled]").forEach((input) => {
      input.addEventListener("change", () => {
        const card = input.closest("[data-platform-card]");
        const body = card?.querySelector(".profile-platform-body");
        if (body) body.hidden = !input.checked;
      });
    });
    document.querySelectorAll("[data-platform-create]").forEach((link) => {
      link.addEventListener("click", () => {
        const key = link.dataset.platformCreate;
        if (key && current?.profile?.id) savePlatform(key, { action: "mark_creation_opened" }).catch(() => {});
      });
    });
    document.querySelectorAll("[data-platform-verify]").forEach((button) => {
      button.addEventListener("click", () => savePlatform(button.dataset.platformVerify));
    });
  }

  async function bootstrap() {
    const nav = $("navProfileSetup");
    try {
      const data = await api("/api/profile-setup");
      payload = data;
      if (data.can_create && nav) nav.hidden = false;
      if ($("profileSetupRoot")) render();
    } catch (error) {
      if (nav) nav.hidden = true;
      if ($("profileSetupRoot") && error.status !== 403) setMessage(error.message || "New Profile setup unavailable.", "error");
    }
  }

  window.StudioProfileSetup = { load, bootstrap, presets };
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
