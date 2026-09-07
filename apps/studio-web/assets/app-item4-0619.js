(() => {
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const configuredBase = String(config.apiBase || "").replace(/\/$/, "");
  const apiBase = configuredBase || window.location.origin;
  const $ = (id) => document.getElementById(id);
  let activeIdea = null;
  let ideasCache = [];

  function ideaIdFromRequest(record) {
    return record?.idea_record_id
      || (Array.isArray(record?.idea_candidate_links) ? record.idea_candidate_links[0] : null)
      || (Array.isArray(record?.idea_candidate_links) ? record.idea_candidate_links[0] : null)
      || null;
  }

  function ideaTitleForRequest(record) {
    const ideaId = ideaIdFromRequest(record);
    const cached = ideaId ? ideasCache.find((idea) => idea.id === ideaId) : null;
    return String(record?.idea_title || cached?.title || record?.requested_title || "").trim();
  }

  async function ensureIdeasCache() {
    if (ideasCache.length) return ideasCache;
    try {
      const { records = [] } = await api("/api/ideas?limit=100");
      if (records.length) ideasCache = records;
    } catch (_error) {
      /* Drafts can still render with the production request ID. */
    }
    return ideasCache;
  }
  let activeIdeaGenerationBatchId = null;
  let ideaGenerationPollTimer = null;
  let ideaGenerationInFlight = false;
  let activeProductionRequest = null;
  let productionRequestMusic = [];
  let productionRequestOutputs = [];
  let productionOutputMatrixLoaded = false;
  let item4Workspace = null;
  let item4BridgePreflight = null;
  let primaryLocationUserEdited = false;

  const CHICAGO_PLACE_SUGGESTIONS = [
    "Andersonville", "Bridgeport", "Bronzeville", "Bucktown", "Chicago", "Chinatown",
    "Clark Street", "Edgewater", "Fulton Market", "Garfield Park", "Gold Coast",
    "Grant Park", "Humboldt Park", "Hyde Park", "Lakeview", "Lincoln Park",
    "Lincoln Square", "Logan Square", "The Loop", "Magnificent Mile", "Millennium Park",
    "Museum Campus", "Navy Pier", "Near North Side", "Old Town", "Pilsen",
    "Printers Row", "Ravenswood", "River North", "Rogers Park", "South Loop",
    "Streeterville", "Ukrainian Village", "Uptown", "West Loop", "Wicker Park",
  ];

  function suggestPrimaryLocationFromCopy({ title = "", summary = "", primary = "", area = "", market = "" } = {}) {
    const stored = String(primary || "").trim();
    if (stored) return { name: stored, source: "stored" };
    const neighborhood = String(area || "").trim();
    if (neighborhood) return { name: neighborhood, source: "neighborhood" };
    const hay = ` ${String(`${title} ${summary}` || "").toLowerCase().replace(/[^a-z0-9\s]+/g, " ").replace(/\s+/g, " ").trim()} `;
    const names = [...CHICAGO_PLACE_SUGGESTIONS].sort((a, b) => b.length - a.length);
    for (const name of names) {
      if (hay.includes(` ${name.toLowerCase()} `)) return { name, source: "copy_match" };
    }
    const marketName = Array.isArray(market) ? String(market[0] || "").trim() : String(market || "").trim();
    if (marketName) return { name: marketName, source: "market" };
    return { name: "", source: "" };
  }

  function syncPrimaryLocationFields(value) {
    const text = String(value || "").trim();
    if ($("ezPrimaryLocation")) $("ezPrimaryLocation").value = text;
    if ($("prPrimaryLocation")) $("prPrimaryLocation").value = text;
  }

  function hydratePrimaryLocationFromSources({ record = activeProductionRequest, idea = activeIdea, force = false } = {}) {
    const stored = String(record?.primary_location || "").trim();
    if (stored) {
      syncPrimaryLocationFields(stored);
      primaryLocationUserEdited = false;
      const hint = $("ezPrimaryLocationHint");
      if (hint) hint.textContent = "Saved publish location. Overwrite anytime before promote.";
      return stored;
    }
    if (!force && primaryLocationUserEdited) {
      return String($("ezPrimaryLocation")?.value || $("prPrimaryLocation")?.value || "").trim();
    }
    const suggested = suggestPrimaryLocationFromCopy({
      title: idea?.title || $("ezIdeaTitle")?.value || record?.requested_title || "",
      summary: idea?.summary || $("ezIdeaSummary")?.value || "",
      primary: idea?.primary_location || "",
      area: idea?.neighborhood_or_area || "",
      market: idea?.market_name || record?.market_name || "",
    });
    syncPrimaryLocationFields(suggested.name);
    primaryLocationUserEdited = false;
    const hint = $("ezPrimaryLocationHint");
    if (hint) {
      hint.textContent = suggested.name
        ? `Suggested from ${suggested.source.replace(/_/g, " ")}. Overwrite anytime before promote.`
        : "Used as the publish location tag. Prefills when we recognize a place in the title.";
    }
    return suggested.name;
  }

  function currentPrimaryLocationValue() {
    return String($("ezPrimaryLocation")?.value || $("prPrimaryLocation")?.value || activeProductionRequest?.primary_location || "").trim();
  }
  let item4WorkspaceRetryTimer = 0;
  let item4PlanOverrides = {};
  let ezIntakeKind = null;
  let ezStagedFiles = [];
  let ezEntryPath = null;
  let ezLocalPreviews = new Map();
  let ezLocalClipPosters = new Map();
  let item4HeldClipFiles = new Map();
  const item4ClipObjectUrls = new Map();
  const item4ClipDurationCache = new Map();
  const item4PosterJobs = new Set();
  let ezSelectedVoiceId = "xVQH621DS3eyBYrseRt5";
  const DEFAULT_VOICE_ID = "xVQH621DS3eyBYrseRt5";
  const DEFAULT_VOICE_NAME = "Kate";
  let ezStarting = false;
  let ezWizardPending = null;
  let ezWizardStep = "start";
  let ezWizardAnswers = {};
  let ezWizardHistory = [];
  let ezWizardBusy = false;
  let azFinishedPath = false;
  let azProgressTimer = 0;
  let ezAutoPlanAfterUpload = false;
  let ezPlanInFlight = false;
  const ezCaptionDrafts = new Map();
  const ezCaptionModes = new Map();
  let ezCaptionDefault = "ai";
  let ezSlideCaptionHealDone = false;
  let ezCaptionSaveTimer = null;
  let ezPinnedExtraOutputs = [];
  let ezConfigSaveTimer = null;
  const ezDirty = new Set();
  let ezIdeaIdentitySaveTimer = null;
  let item4Uploading = false;
  let item4UploadBatchTotal = 0;
  let item4UploadBatchDone = 0;
  let item4PendingUploads = [];
  let item4PreparingVariants = false;
  let item4PrepareError = "";
  let item4PrepareClockTimer = 0;
  let item4VariantPolling = false;
  let item4PromoteInFlight = false;
  const item4PromotedRequestIds = new Set();
  let item4VariantPollTimer = null;
  let item4VariantPollStartedAt = 0;
  let item4MasterPollTimer = null;
  let item4MasterPollStartedAt = 0;
  const ITEM4_VARIANT_POLL_MS = 3000;
  const ITEM4_VARIANT_POLL_TIMEOUT_MS = 900000;
  const ITEM4_MASTER_POLL_MS = 3000;
  const ITEM4_MASTER_POLL_TIMEOUT_MS = 180000;
  const ITEM4_PREVIEW_RETRY_MAX = 3;
  const ITEM4_PREVIEW_RETRY_MS = 1200;
  const API_TRANSIENT_RETRY_MAX = 12;
  const API_TRANSIENT_RETRY_MS = 3000;
  const ITEM4_POLL_EXTRA_WINDOWS = 2;
  const ITEM4_POLL_EXTRA_MS = 15000;
  let item4MasterExtraWindows = 0;
  let item4VariantExtraWindows = 0;
  const item4PreviewFailures = new Map();
  const item4CropDrafts = new Map();
  let item4CropRequestId = null;
  let pipelineOutputs = [];
  let pipelineSort = { key: "output", dir: "desc" };
  let ideasSort = { key: "idea", dir: "desc" };
  let contentSort = { key: "content", dir: "desc" };
  const pipelineGroupOpen = new Map();
  const pipelineScheduleDrafts = new Map();
  const pipelineTiktokUrlDrafts = new Map();
  let pipelineViewFilter = "all";
  let pipelineOpenSingleOnLoad = false;
  let dashboardCache = { metrics: {}, ideas: [], content: [], outputs: [] };
  let dashboardView = "recent";
  const audioUserTouched = new Set();
  let activeCreativeOutputId = null;
  let activeCreativeOutput = null;
  let creativeSlides = [];
  let creativeOptions = {};
  let creativeHandoffPollToken = 0;
  let creativeHandoffStatus = null;
  let creativeTitleLock = null;
  let creativeEditorDirty = false;
  let creativeSavedFingerprint = "";
  let creativeDirtyTimer = null;
  const creativeSlideCollapsed = new Set();

  const BUILD_ID = "item4-0.6.256-library-size";
  let item4AssetStripSignature = "";
  const ITEM4_ACCEPT_PHOTOS = "image/*,.heic,.heif,image/heic,image/heif,image/heic-sequence,image/heif-sequence";
  const ITEM4_ACCEPT_VIDEOS = "video/mp4,video/quicktime,video/webm,video/*,.mp4,.mov,.m4v,.webm";
  const ITEM4_ACCEPT_MIXED = `${ITEM4_ACCEPT_PHOTOS},${ITEM4_ACCEPT_VIDEOS}`;

  function item4AcceptForKind(kind = ezIntakeKind) {
    const next = String(kind || "").trim();
    if (next === "finished-video") return `${ITEM4_ACCEPT_VIDEOS},image/*`;
    if (next === "video-clips") return ITEM4_ACCEPT_VIDEOS;
    if (next === "photos-and-clips") return ITEM4_ACCEPT_MIXED;
    return ITEM4_ACCEPT_PHOTOS;
  }

  function item4ApplyMediaInputAccept(kind = ezIntakeKind) {
    const accept = item4AcceptForKind(kind);
    const multiple = kind === "multiple-photos" || kind === "finished-stills" || kind === "photos-and-clips" || kind === "video-clips";
    ["item4MediaInput", "ezMediaInput"].forEach((id) => {
      const input = $(id);
      if (!input) return;
      input.accept = accept;
      input.multiple = multiple;
    });
    ["item4ChooseClip", "ezChooseClip"].forEach((id) => {
      const button = $(id);
      if (button) button.hidden = true;
    });
  }

  function item4BeginClipPick(inputId) {
    if (ezIntakeKind !== "photos-and-clips" && ezIntakeKind !== "video-clips") {
      selectPrMediaKind("photos-and-clips", { quiet: true });
    }
    mergeEzProductionNotes();
    $(inputId)?.click();
  }
  function defaultVoiceoverDuration(videoSeconds) {
    const n = Number(videoSeconds);
    return Number.isFinite(n) && n > 0 ? Math.max(1, Math.round(n * 0.5)) : 15;
  }
  const PROFILE_STORAGE_KEY = "studio.content_profile_id";
  let selectedProfileId = "";
  let studioProfiles = [];
  const uiBuildMatch = /item4-(\d+\.\d+\.\d+)/.exec(BUILD_ID);
  const uiBuildLabel = $("uiBuildLabel");
  if (uiBuildLabel) uiBuildLabel.textContent = `UI build ${uiBuildMatch ? uiBuildMatch[1] : BUILD_ID}`;
  const hubDate = $("studioHubDate");
  if (hubDate) {
    hubDate.textContent = new Date().toLocaleDateString(undefined, {
      weekday: "long",
      month: "long",
      day: "numeric",
    });
  }
  let studioSession = null;
  let pipelinePollTimer = null;
  let pipelineCountdownTimer = null;
  let pipelineNextRefreshAt = 0;
  let pipelinePollInFlight = false;
  let operationsTimezone = null;
  let operationsAnalyticsAccounts = [];
  const operationsAnalyticsQueue = { running: false, stop: false };
  const PIPELINE_POLL_MS = 8000;
  const PRODUCTION_POLL_MS = 8000;
  let productionPollTimer = null;
  let productionPollInFlight = false;
  let productionContentRecords = [];
  const pipelineProgressHighWater = new Map();

  function withStudioProfile(path) {
    if (!selectedProfileId) return path;
    const qIndex = String(path || "").indexOf("?");
    const pathname = qIndex === -1 ? path : path.slice(0, qIndex);
    if (!["/api/ideas", "/api/content", "/api/outputs", "/api/dashboard", "/api/production-requests", "/api/insights/best-times", "/api/insights/similar-times", "/api/insights/captions", "/api/insights/discover"].includes(pathname)) return path;
    const params = new URLSearchParams(qIndex === -1 ? "" : path.slice(qIndex + 1));
    params.set("profile", selectedProfileId);
    return `${pathname}?${params.toString()}`;
  }

  function activeNavPage() {
    return document.querySelector(".nav-item.active")?.dataset.page || "home";
  }

  function applyStudioProfile(profile, { reload = false } = {}) {
    if (!profile) return;
    selectedProfileId = profile.id;
    try { localStorage.setItem(PROFILE_STORAGE_KEY, profile.id); } catch {}
    document.documentElement.dataset.studioTheme = profile.theme || "chicago";
    const city = profile.city_label || "Chicago";
    const cityNode = $("ezPathBrandCity");
    if (cityNode) cityNode.textContent = city;
    const brand = $("ezPathBrand");
    if (brand) brand.setAttribute("aria-label", `${city} Shining`);
    const subtitle = $("brandSubtitle");
    if (subtitle) subtitle.textContent = profile.name || "Pipeline administration";
    document.title = `${city}Shining Studio`;
    ["studioProfileSelect"].forEach((id) => {
      const select = $(id);
      if (select && select.value !== profile.id) select.value = profile.id;
    });
    if (reload) {
      const page = activeNavPage();
      if (page) loadPage(page);
    }
  }

  function renderStudioProfileSelects() {
    const options = studioProfiles.map((profile) =>
      `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name || profile.city_label || profile.id)}</option>`
    ).join("");
    ["studioProfileSelect"].forEach((id) => {
      const select = $(id);
      if (!select) return;
      select.innerHTML = options || '<option value="">No profiles</option>';
      if (selectedProfileId) select.value = selectedProfileId;
    });
    const wrap = $("studioProfileWrap");
    if (wrap) wrap.hidden = !studioProfiles.length;
  }

  async function loadStudioProfiles() {
    const data = await api("/api/profiles");
    studioProfiles = Array.isArray(data.records) ? data.records : [];
    let stored = "";
    try { stored = String(localStorage.getItem(PROFILE_STORAGE_KEY) || ""); } catch {}
    const next = studioProfiles.find((profile) => profile.id === stored)
      || studioProfiles.find((profile) => profile.id === data.default_profile_id)
      || studioProfiles[0]
      || null;
    renderStudioProfileSelects();
    if (next) applyStudioProfile(next);
  }

  function pipelineDisplayPercent(record) {
    const raw = record?.studio_progress_percent ?? record?.youtube_processing_progress_percent ?? record?.youtube_upload_progress_percent;
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    if (pipelineIsTerminalFailure(record)) {
      pipelineProgressHighWater.delete(record.id);
      return n;
    }
    const prev = pipelineProgressHighWater.get(record.id);
    const next = prev == null ? n : Math.max(prev, n);
    pipelineProgressHighWater.set(record.id, next);
    return next;
  }

  const startupStatus = $("apiStatus");
  if (startupStatus) {
    startupStatus.textContent = "Connecting…";
    startupStatus.title = `${BUILD_ID}: JavaScript loaded`;
  }

  window.addEventListener("error", (event) => {
    const status = $("apiStatus");
    if (status) {
      status.textContent = "Studio UI error";
      status.title = `${BUILD_ID}: ${event.message || "JavaScript error"}`;
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const status = $("apiStatus");
    if (status) {
      status.textContent = "Studio UI error";
      status.title = `${BUILD_ID}: ${event.reason?.message || event.reason || "Unhandled promise rejection"}`;
    }
  });

  function isHubPage(page) {
    return page === "home" || page === "dashboard";
  }

  function showStudioPage(page) {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", isHubPage(page) ? button.dataset.page === "home" : button.dataset.page === page);
    });
    document.querySelectorAll(".page").forEach((section) => section.classList.remove("active"));
    if (isHubPage(page)) {
      $("page-home")?.classList.add("active");
      $("page-dashboard")?.classList.add("active");
    } else {
      $(`page-${page}`)?.classList.add("active");
    }
    if (page === "outputs") pipelineViewFilter = "all";
    if (page !== "outputs") stopPipelinePoll();
    if (page !== "content") stopProductionPoll();
    if (page === "support") showSupportDoc("walkthrough");
    loadPage(isHubPage(page) ? "home" : page);
  }

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!phase6ConfirmDiscardUnsaved("leave this editor")) return;
      showStudioPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => loadPage(button.dataset.refresh, true));
  });

  $("refreshDashboard").addEventListener("click", () => loadDashboard(true));
  $("operationsResetRenderUrls")?.addEventListener("click", async () => {
    try {
      setOperationsMessage("Resetting stale Remotion URLs…");
      const result = await api("/api/operations/reset-render-urls", { method: "POST", body: JSON.stringify({}) });
      setOperationsMessage(result.message || "M1 started.");
    } catch (error) {
      setOperationsMessage(error.message || "Could not reset render URLs.", "error-text");
    }
  });
  $("operationsRetryAssetSelection")?.addEventListener("click", async () => {
    try {
      setOperationsMessage("Checking failed asset selection…");
      const result = await api("/api/operations/retry-asset-selection", { method: "POST", body: JSON.stringify({}) });
      setOperationsMessage(result.message || "R2B started.");
    } catch (error) {
      setOperationsMessage(error.message || "Could not retry asset selection.", "error-text");
    }
  });
  $("operationsRunAllAnalytics")?.addEventListener("click", () => {
    runOperationsAnalyticsQueue($("operationsAnalyticsRunScope")?.value || "youtube");
  });
  $("operationsStopAnalytics")?.addEventListener("click", () => {
    if (!operationsAnalyticsQueue.running) return;
    operationsAnalyticsQueue.stop = true;
    setOperationsMessage("Stopping after the current handle…");
  });
  $("operationsRefreshSimilarTimes")?.addEventListener("click", async () => {
    const button = $("operationsRefreshSimilarTimes");
    const meta = $("operationsSimilarTimesMeta");
    const idleLabel = "Refresh similar times";
    if (operationsAnalyticsQueue.running) return;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Refreshing…";
      }
      if (meta) meta.textContent = "Refreshing public YouTube times… Instagram timing is paused.";
      setOperationsMessage("Refreshing public YouTube times…");
      const result = await api("/api/insights/similar-times", {
        method: "POST",
        body: JSON.stringify({
          force: true,
          limit: 1,
          profile: studioProfiles.find((item) => item.id === selectedProfileId)?.theme || "chicago",
          season: selectedInsightsSeason(),
        }),
        timeoutMs: 60000,
      });
      renderOperationsSimilarTimes(result);
      const done = result.remaining_to_sweep
        ? `Swept ${result.swept || 0} account(s). ${result.remaining_to_sweep} still queued for the next refresh.`
        : `Swept ${result.swept || 0} account(s).`;
      setOperationsMessage(done);
    } catch (error) {
      if (meta) meta.textContent = error.message || "Could not refresh similar times.";
      setOperationsMessage(error.message || "Could not refresh similar times.", "error-text");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = idleLabel;
      }
    }
  });
  $("operationsInsightsSeason")?.addEventListener("change", () => {
    loadOperations(true);
  });
  $("operationsDiscoverCreators")?.addEventListener("click", async () => {
    const button = $("operationsDiscoverCreators");
    if (operationsAnalyticsQueue.running) return;
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Searching…";
      }
      setOperationsMessage("Searching YouTube for Chicago content creators…");
      const result = await api("/api/insights/discover", {
        method: "POST",
        body: JSON.stringify({
          profile: studioProfiles.find((item) => item.id === selectedProfileId)?.theme || "chicago",
          limit: 8,
        }),
        timeoutMs: 60000,
      });
      setOperationsMessage(result.message || "Discovery finished.");
      loadOperations(true);
    } catch (error) {
      setOperationsMessage(error.message || "Could not discover creators.", "error-text");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = "Find Chicago creators";
      }
    }
  });
  $("operationsWatchlistForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (operationsAnalyticsQueue.running) return;
    const platform = String($("operationsWatchlistPlatform")?.value || "instagram").trim();
    const handle = String($("operationsWatchlistHandle")?.value || "").trim().replace(/^@/, "");
    if (!handle) {
      setOperationsMessage("Enter a handle. YouTube is timed from public posts; Instagram timing is paused pending Meta permission.", "error-text");
      return;
    }
    try {
      const current = await api("/api/insights/watchlist");
      const profile = studioProfiles.find((item) => item.id === selectedProfileId);
      const accounts = [...(current.accounts || []), { platform, handle, profile: profile?.theme || "chicago" }];
      await api("/api/insights/watchlist", { method: "POST", body: JSON.stringify({ accounts }) });
      if ($("operationsWatchlistHandle")) $("operationsWatchlistHandle").value = "";
      setOperationsMessage("Handle added.");
      loadOperations(true);
    } catch (error) {
      setOperationsMessage(error.message || "Could not add handle.", "error-text");
    }
  });
  $("operationsRunDailyIdeas")?.addEventListener("click", async () => {
    try {
      setOperationsMessage("Starting daily idea run…");
      const result = await api("/api/operations/ideas/run-daily", { method: "POST", body: JSON.stringify({}) });
      setOperationsMessage(result.skipped ? `Skipped: ${result.skipped}` : `Started daily idea generation for ${(result.runs || []).length} profile(s).`);
      loadOperations();
    } catch (error) {
      setOperationsMessage(error.message || "Daily idea run failed.", "error-text");
    }
  });
  $("operationsRunAutonomous")?.addEventListener("click", async () => {
    const button = $("operationsRunAutonomous");
    const idleLabel = button?.textContent || "Run autonomous now";
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Running…";
      }
      setOperationsMessage("Starting autonomous produce… this can take a minute.");
      const result = await api("/api/operations/ideas/run-autonomous", {
        method: "POST",
        body: JSON.stringify({
          preferred_subject: String($("operationsAutonomousSubject")?.value || "").trim(),
        }),
        timeoutMs: 180000,
      });
      if (result.skipped) setOperationsMessage(`Skipped: ${result.skipped}`);
      else if (result.status === "resuming") setOperationsMessage(`Resuming ${(result.resumed || []).length || "existing"} autonomous draft(s). No new idea will be picked.`);
      else if (result.status === "waiting_variants") setOperationsMessage("Plan is ready. Preparing platform frames in the background.");
      else if (result.status === "producing" || result.status === "promoted") setOperationsMessage("Autonomous piece is in production and will stop at Ready for Review.");
      else setOperationsMessage("Autonomous produce started.");
      loadOperations();
    } catch (error) {
      setOperationsMessage(error.message || "Autonomous produce failed.", "error-text");
    } finally {
      if (button) {
        button.disabled = false;
        button.textContent = idleLabel;
      }
    }
  });
  let intakePollTimer = null;
  let intakePollStartedAt = null;
  let intakePollDeadline = 0;
  function stopIntakePoll() {
    if (intakePollTimer) {
      clearInterval(intakePollTimer);
      intakePollTimer = null;
    }
  }
  function intakeIsFinished(status) {
    return Boolean(status?.complete || status?.failed || status?.a2?.result === "empty");
  }
  function startIntakePoll() {
    stopIntakePoll();
    intakePollDeadline = Date.now() + 90000;
    intakePollTimer = setInterval(pollIntakeStatus, 2500);
  }
  let compressionPollTimer = null;
  let operationsOversizedCache = [];
  let operationsCanCompress = false;
  let operationsCompressionJobs = [];

  function stopCompressionPoll() {
    if (compressionPollTimer) {
      clearInterval(compressionPollTimer);
      compressionPollTimer = null;
    }
  }

  function startCompressionPoll() {
    if (compressionPollTimer) return;
    compressionPollTimer = setInterval(pollCompressionStatus, 12000);
  }

  function syncCompressionPoll(hasJobs) {
    if (hasJobs) startCompressionPoll();
    else stopCompressionPoll();
  }

  function renderCompressionStatus(jobs, waitingCount) {
    const banner = $("operationsCompressionStatus");
    operationsCompressionJobs = Array.isArray(jobs) ? jobs : [];
    if (!banner) return;
    const active = operationsCompressionJobs[0];
    const extras = Math.max(0, operationsCompressionJobs.length - 1);
    const waiting = Math.max(0, Number(waitingCount) || 0);
    if (active) {
      banner.hidden = false;
      banner.dataset.tone = active.tone || "compressing";
      const waitingNote = waiting > operationsCompressionJobs.length
        ? `${waiting - operationsCompressionJobs.length} more waiting.`
        : extras ? `${extras} more compressing.` : "";
      const percent = Number(active.progress_percent);
      const bar = Number.isFinite(percent)
        ? `<div class="ops-progress-track" aria-hidden="true"><div class="ops-progress-fill" style="width:${Math.max(0, Math.min(100, percent))}%"></div></div>`
        : "";
      banner.innerHTML = `<p class="ops-compression-kicker">Compression in progress</p>
        <p class="ops-compression-headline">${escapeHtml(active.headline || `Compressing ${active.name || "video"}`)}</p>
        ${bar}
        <p class="ops-compression-detail">${escapeHtml([active.notes, waitingNote].filter(Boolean).join(" "))}</p>`;
      return;
    }
    if (waiting) {
      banner.hidden = false;
      banner.dataset.tone = "waiting";
      banner.innerHTML = `<p class="ops-compression-kicker">Waiting to compress</p>
        <p class="ops-compression-headline">${waiting === 1 ? "1 oversized video is waiting" : `${waiting} oversized videos are waiting`}</p>
        <p class="ops-compression-detail">Start compression from the list. One file runs at a time; this banner updates as the current file changes.</p>`;
      return;
    }
    banner.hidden = true;
    banner.removeAttribute("data-tone");
    banner.innerHTML = "";
  }

  async function pollCompressionStatus() {
    const operationsPage = $("page-operations");
    if (!operationsPage || !operationsPage.classList.contains("active")) {
      stopCompressionPoll();
      return;
    }
    try {
      const data = await api("/api/operations/compression");
      const jobs = data.jobs || [];
      renderOperationsOversized(operationsOversizedCache, operationsCanCompress, jobs);
      syncCompressionPoll(jobs.length > 0 || operationsOversizedCache.length > 0);
    } catch {
      /* keep the last banner until the next refresh */
    }
  }
  $("operationsCapAudioSilence")?.addEventListener("click", async () => {
    const button = $("operationsCapAudioSilence");
    try {
      if (button) button.disabled = true;
      stopIntakePoll();
      hideIntakeProgress();
      setOperationsMessage("Capping leading silence on catalog audio…");
      const result = await api("/api/operations/audio-leading-silence", {
        method: "POST",
        body: JSON.stringify({}),
        timeoutMs: 180000,
      });
      setOperationsMessage(result.message || "Leading silence pass finished.");
    } catch (error) {
      setOperationsMessage(error.message || "Leading silence pass failed.", "error-text");
    } finally {
      if (button) button.disabled = false;
    }
  });
  $("operationsCompressAllOversized")?.addEventListener("click", async () => {
    const button = $("operationsCompressAllOversized");
    try {
      if (button) button.disabled = true;
      setOperationsMessage("Starting compression for oversized intake folder videos…");
      const result = await api("/api/operations/compress", {
        method: "POST",
        body: JSON.stringify({ compress_all: true }),
        timeoutMs: 180000,
      });
      setOperationsMessage(result.message || "Compression started for the intake folder.");
      renderCompressionStatus([{
        headline: "Starting the next oversized video",
        tone: "waiting",
        notes: "Checking the intake folder…",
      }], operationsOversizedCache.length);
      startCompressionPoll();
      loadOperations();
    } catch (error) {
      setOperationsMessage(error.message || "Could not start intake-folder compression.", "error-text");
    } finally {
      if (button) button.disabled = false;
    }
  });
  $("operationsRunIntake")?.addEventListener("click", async () => {
    const button = $("operationsRunIntake");
    const clientStartedAt = new Date().toISOString();
    intakePollStartedAt = clientStartedAt;
    stopIntakePoll();
    try {
      if (button) button.disabled = true;
      setOperationsMessage("Starting A2…");
      showIntakeProgress({ percent: 8, summary: "Starting A2…", complete: false, a2: { result: "waiting", detail: "Starting A2…" }, stages: [
        { key: "A2", label: "Intake", detail: "Starting A2…" },
        { key: "A2B", label: "Video backfill", detail: "Queued" },
        { key: "A3", label: "Classification", detail: "Queued" },
        { key: "A4", label: "Reconciliation", detail: "Queued" },
      ] });
      let result = null;
      try {
        result = await api("/api/operations/intake", { method: "POST", body: JSON.stringify({}), timeoutMs: 180000 });
      } catch (error) {
        setOperationsMessage("Checking A2…");
      }
      if (result) {
        intakePollStartedAt = result.started_at || clientStartedAt;
        showIntakeProgress(result);
        if (result.library_intake) renderLibraryIntakeNotice(result.library_intake);
        setOperationsMessage(result.summary || result.message || "A2 finished.");
      }
      if (intakeIsFinished(result || {})) {
        if (button) button.disabled = false;
        loadOperations();
      } else {
        const done = await pollIntakeStatus();
        if (!done) startIntakePoll();
      }
    } catch (error) {
      setOperationsMessage(error.message || "Library intake failed.", "error-text");
      if (button) button.disabled = false;
    }
  });

  function isTimeoutError(error) {
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || error || "").toLowerCase();
    return name.includes("timeout") || name.includes("abort") || message.includes("signal timed out") || message.includes("timed out");
  }

  function sleepMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  function abortSignalWithTimeout(timeoutMs) {
    const ms = Math.max(1000, Number(timeoutMs) || 25000);
    if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
      return AbortSignal.timeout(ms);
    }
    const controller = new AbortController();
    setTimeout(() => controller.abort(), ms);
    return controller.signal;
  }

  function isTransientApiFailure({ status = 0, text = "", error = null, method = "GET" } = {}) {
    const write = !["GET", "HEAD"].includes(String(method || "GET").toUpperCase());
    if (error) {
      if (error.transient) return true;
      if (isTimeoutError(error)) return !write;
      const name = String(error.name || "");
      const message = String(error.message || "");
      return name === "TypeError" || /failed to fetch|networkerror|load failed/i.test(message);
    }
    const code = Number(status || 0);
    let parsed = null;
    try { parsed = text ? JSON.parse(text) : null; } catch { parsed = null; }
    const cf = /cloudflare|error code:\s*\d+|worker threw|1010|1042|1101/i.test(String(text || ""));
    const edge = !parsed || cf;
    if (code === 429) return true;
    if ([502, 503, 504, 520, 521, 522, 523, 524, 530].includes(code)) return write ? edge : true;
    if (code === 404) return edge;
    return Boolean(cf && code >= 500);
  }

  async function api(path, options = {}) {
    const { timeoutMs = 25000, signal: explicitSignal, retries, ...fetchOptions } = options;
    const method = String(fetchOptions.method || "GET").toUpperCase();
    const maxAttempts = Math.max(1, Number(retries ?? API_TRANSIENT_RETRY_MAX) || 1);

    const pathname = String(path || "").split("?")[0];
    if (selectedProfileId && fetchOptions.body && typeof fetchOptions.body === "string") {
      if (pathname === "/api/ideas" || pathname === "/api/ideas/generate" || pathname === "/api/outputs/approve-all") {
        try {
          const parsed = JSON.parse(fetchOptions.body);
          if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && !parsed.content_profile_id) {
            parsed.content_profile_id = selectedProfileId;
            fetchOptions.body = JSON.stringify(parsed);
          }
        } catch {}
      }
    }

    let lastError = null;
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const timeoutSignal = explicitSignal || abortSignalWithTimeout(timeoutMs);
      try {
        const response = await fetch(`${apiBase}${withStudioProfile(path)}`, {
          credentials: "same-origin",
          cache: "no-store",
          ...fetchOptions,
          ...(timeoutSignal ? { signal: timeoutSignal } : {}),
          headers: {
            ...(fetchOptions.body && !(typeof FormData !== "undefined" && fetchOptions.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
            ...(fetchOptions.headers || {}),
          },
        });
        const text = await response.text();
        let body = {};
        try { body = text ? JSON.parse(text) : {}; } catch { body = {}; }
        if (!response.ok || body.ok === false) {
          const preparing = String(body.status || "") === "Preparing"
            || /still running/i.test(String(body.message || body.error || ""));
          if (preparing && (response.status === 200 || response.status === 202)) return body;
          const failure = new Error(body.error || body.message || `Request failed (${response.status})`);
          failure.status = response.status;
          failure.bodyStatus = String(body.status || "");
          failure.transient = isTransientApiFailure({ status: response.status, text, method });
          if (failure.transient && attempt < maxAttempts) {
            lastError = failure;
            await sleepMs(API_TRANSIENT_RETRY_MS);
            continue;
          }
          throw failure;
        }
        return body;
      } catch (error) {
        if (error && error.transient === false) throw error;
        if (error && !("transient" in (error || {}))) {
          error.transient = isTransientApiFailure({ error, method });
        }
        lastError = error;
        if (!error?.transient || attempt >= maxAttempts) throw error;
        await sleepMs(API_TRANSIENT_RETRY_MS);
      }
    }
    throw lastError || new Error("Request failed");
  }

  function stateClass(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function badge(value) {
    const safe = escapeHtml(value || "Unknown");
    return `<span class="badge ${stateClass(value)}">${safe}</span>`;
  }

  function pipelineIsRetryingRender(record) {
    const state = String(record?.studio_state || "").trim();
    const output = String(record?.output_status || "").trim();
    const render = String(record?.render_status || "").trim();
    if (/published|ready for review|approved|skipped/i.test(output)) return false;
    if (state === "Trying Again") return true;
    if (state !== "Failed" && state !== "Error") return false;
    return /in production|rendering|ready for render|not ready|failed|error/i.test(`${output} ${render}`);
  }

  function pipelineIsTerminalFailure(record) {
    return (record?.studio_state === "Failed" || record?.studio_state === "Error") && !pipelineIsRetryingRender(record);
  }

  function pipelineStudioStateLabel(record) {
    if (pipelineIsRetryingRender(record)) return "Trying Again";
    const job = record?.studio_production_job;
    const step = String(job?.step || "").trim();
    if (step === "blocked") return "Blocked";
    if (step === "escalated") return "Escalated — needs investigation";
    const state = String(record?.studio_state || "").trim();
    // Per-row badge stays simple. Job counters like "Rendering 2/6" are PR-level,
    // not meaningful on each Platform Output row.
    if (state === "Rendering" || /^Rendering(\s+\d+\/\d+)?$/i.test(String(record?.studio_job_label || "").trim())) {
      return "Rendering";
    }
    const label = String(record?.studio_job_label || "").trim();
    if (label && ["Queued", "In Production", "Preparing Assets", ""].includes(state)) {
      return label;
    }
    return state;
  }

  function pipelineRenderLabel(record) {
    const render = String(record?.render_status || "").trim();
    if (pipelineIsRetryingRender(record) && /failed|error/i.test(render)) return "Trying Again";
    return render;
  }

  function pipelineOutputRenderComplete(record) {
    if (pipelineIsRetryingRender(record)) return false;
    const state = String(record?.studio_state || "").trim();
    return [
      "Ready for Review",
      "Approved",
      "Scheduled",
      "Published",
      "Uploading",
      "Platform Processing",
      "Draft Delivered",
      "Skipped",
    ].includes(state);
  }

  function pipelineOutputRenderInFlight(record) {
    if (pipelineIsRetryingRender(record)) return true;
    const state = String(record?.studio_state || "").trim();
    if (["Rendering", "Queued", "Preparing Assets"].includes(state)) return true;
    const render = String(record?.render_status || "").trim();
    return /^(Rendering|Ready for Render)(\s+\d+\/\d+)?$/i.test(render);
  }

  function pipelineDestinationProgress(records) {
    const list = Array.isArray(records) ? records.filter(Boolean) : [];
    const total = list.length;
    if (!total) return null;
    if (!list.some(pipelineOutputRenderInFlight)) return null;
    const done = list.filter(pipelineOutputRenderComplete).length;
    return { done, total, percent: Math.round((done / total) * 100) };
  }

  function pipelineProgressCell(record, groupRecords) {
    const dest = pipelineDestinationProgress(groupRecords);
    if (dest && pipelineOutputRenderInFlight(record)) {
      return `<div>${dest.done}/${dest.total}</div><div class="progress" title="${dest.done} of ${dest.total} destinations rendered"><span style="width:${Math.max(0, Math.min(100, dest.percent))}%"></span></div>`;
    }
    const pct = pipelineDisplayPercent(record);
    return pct === null || pct === undefined
      ? "—"
      : `<div>${value(pct)}%</div><div class="progress"><span style="width:${Math.max(0, Math.min(100, Number(pct) || 0))}%"></span></div>`;
  }

  function normalizeDisplayText(value) {
    let s = String(value ?? "");
    if (!s) return s;

    // API/session/Airtable values can arrive already mojibaked even when this JS bundle is UTF-8 clean.
    // Normalize only at the display boundary so IDs, URLs, webhook payloads, and write-back data remain untouched.
    const pairs = [
      ["â€¦", "…"], ["â€”", "—"], ["â€“", "–"], ["Â·", "·"],
      ["â†’", "→"], ["â†—", "↗"], ["â€¢", "•"], ["âœ“", "✓"],
      ["â‹®â‹®", "⋮⋮"], ["Ã—", "×"], ["â–¶", "▶"],
      ["â€˜", "‘"], ["â€™", "’"], ["â€œ", "“"], ["â€", "”"]
    ];
    for (const [bad, good] of pairs) s = s.split(bad).join(good);

    // Common three-byte UTF-8 sequences that were decoded as Windows-1252.
    // This branch is deliberately display-only.
    if (/[ÃÂâ]/.test(s)) {
      try {
        const cp1252 = {
          0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
          0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,
          0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
          0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F
        };
        const bytes = [];
        for (const ch of s) {
          const code = ch.codePointAt(0);
          if (code <= 0xFF) bytes.push(code);
          else if (cp1252[code] !== undefined) bytes.push(cp1252[code]);
          else { bytes.length = 0; break; }
        }
        if (bytes.length) {
          const decoded = new TextDecoder("utf-8", {fatal:true}).decode(new Uint8Array(bytes));
          if (decoded && !/[ÃÂâ]/.test(decoded)) s = decoded;
        }
      } catch (_) {}
    }
    return s;
  }

  function escapeHtml(value) {
    return normalizeDisplayText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function value(v, fallback = "—") { return v === null || v === undefined || v === "" ? fallback : escapeHtml(v); }
  function join(v) { return Array.isArray(v) && v.length ? v.map(escapeHtml).join(", ") : "—"; }

  const STUDIO_DEFAULT_TIMEZONE = "America/Chicago";

  function studioTimezone() {
    if (operationsTimezone) return operationsTimezone;
    const profile = studioProfiles.find((item) => item.id === selectedProfileId);
    return profile?.timezone || STUDIO_DEFAULT_TIMEZONE;
  }

  function studioTimezoneLabel(timeZone = studioTimezone()) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" }).formatToParts(new Date());
      return parts.find((part) => part.type === "timeZoneName")?.value || timeZone;
    } catch {
      return timeZone;
    }
  }

  function studioChicagoMonthDay(date = new Date()) {
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: "America/Chicago",
        month: "numeric",
        day: "numeric",
      }).formatToParts(date);
      const month = Number(parts.find((part) => part.type === "month")?.value);
      const day = Number(parts.find((part) => part.type === "day")?.value);
      if (!Number.isFinite(month) || month < 1 || !Number.isFinite(day) || day < 1) return null;
      return { month, day };
    } catch {
      return null;
    }
  }

  function studioInsightsSeason(date = new Date()) {
    const parts = studioChicagoMonthDay(date);
    if (!parts) return "summer";
    const md = parts.month * 100 + parts.day;
    if (md >= 1221 || md < 320) return "winter";
    if (md < 621) return "spring";
    if (md < 922) return "summer";
    return "fall";
  }

  function initOperationsInsightsSeason() {
    const seasonSelect = $("operationsInsightsSeason");
    if (!seasonSelect || seasonSelect.dataset.initialized) return;
    seasonSelect.value = studioInsightsSeason();
    seasonSelect.dataset.initialized = "true";
  }

  function studioInsightsSeasonLabel(season) {
    if (season === "winter") return "Winter";
    if (season === "spring") return "Spring";
    if (season === "summer") return "Summer";
    if (season === "fall") return "Fall";
    return "All seasons";
  }

  function selectedInsightsSeason() {
    initOperationsInsightsSeason();
    return String($("operationsInsightsSeason")?.value || studioInsightsSeason()).trim() || studioInsightsSeason();
  }

  function parseStudioDate(raw) {
    if (raw === null || raw === undefined || raw === "") return null;
    const text = String(raw).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const ms = Date.parse(`${text}T12:00:00`);
      return Number.isFinite(ms) ? new Date(ms) : null;
    }
    const ms = Date.parse(text);
    return Number.isFinite(ms) ? new Date(ms) : null;
  }

  function formatStudioDateTime(raw, { timeZone = studioTimezone(), fallback = "—" } = {}) {
    const date = parseStudioDate(raw);
    if (!date) return fallback;
    try {
      const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        month: "short",
        day: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
        timeZoneName: "short",
      }).formatToParts(date);
      const get = (type) => parts.find((part) => part.type === type)?.value || "";
      const month = get("month").replace(/\./g, "");
      const day = String(get("day")).padStart(2, "0");
      const year = get("year");
      const hour = String(get("hour")).padStart(2, "0");
      const minute = String(get("minute")).padStart(2, "0");
      const zone = get("timeZoneName") || studioTimezoneLabel(timeZone);
      return `${month}-${day}-${year} ${hour}:${minute} ${zone}`;
    } catch {
      return String(raw);
    }
  }

  function formatStudioDate(raw, { timeZone = studioTimezone(), fallback = "—", weekday = false } = {}) {
    const date = parseStudioDate(raw);
    if (!date) return fallback;
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: weekday ? "long" : undefined,
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
    } catch {
      return String(raw);
    }
  }

  function dateValue(raw, fallback = "—") {
    if (raw === null || raw === undefined || raw === "") return fallback;
    return escapeHtml(formatStudioDateTime(raw));
  }

  function formatDateTimeLocalInput(raw) {
    const date = parseStudioDate(raw);
    if (!date) return "";
    const pad = (n) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function studioOutputTimingLabel(record) {
    const parts = [];
    if (record?.scheduled_post_date) parts.push(`Scheduled ${formatStudioDateTime(record.scheduled_post_date)}`);
    if (record?.published_at) parts.push(`Published ${formatStudioDateTime(record.published_at)}`);
    return parts.join(" · ");
  }

  function studioRecordTimingLabel(record, { createdKey = "created_at", updatedKey = "updated_at" } = {}) {
    const parts = [];
    if (record?.[createdKey]) parts.push(`Created ${formatStudioDateTime(record[createdKey])}`);
    if (record?.[updatedKey] && record[updatedKey] !== record[createdKey]) {
      parts.push(`Updated ${formatStudioDateTime(record[updatedKey])}`);
    }
    return parts.join(" · ");
  }

  function repairRenderedText(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const fixed = normalizeDisplayText(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    }
  }

  const displayTextObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const fixed = normalizeDisplayText(mutation.target.nodeValue);
        if (fixed !== mutation.target.nodeValue) mutation.target.nodeValue = fixed;
      }
      for (const added of mutation.addedNodes || []) {
        if (added.nodeType === Node.TEXT_NODE) {
          const fixed = normalizeDisplayText(added.nodeValue);
          if (fixed !== added.nodeValue) added.nodeValue = fixed;
        } else if (added.nodeType === Node.ELEMENT_NODE) {
          repairRenderedText(added);
        }
      }
    }
  });

  function startDisplayTextRepair() {
    repairRenderedText(document.body);
    displayTextObserver.observe(document.body, {subtree:true, childList:true, characterData:true});
  }

  async function checkHealth() {
    try {
      const [health, session] = await Promise.all([api("/api/health"), api("/api/session")]);
      studioSession = session;
      try { await loadStudioProfiles(); } catch {}
      const navOps = $("navOperations");
      const footerOps = $("footerOperations");
      const showOps = Boolean(session?.permissions?.tenant_admin || session?.permissions?.publishing_control || session?.permissions?.production_configure);
      if (navOps) navOps.hidden = !showOps;
      if (footerOps) footerOps.hidden = !showOps;
      if (!health.airtable_configured) {
        $("apiStatus").textContent = "API needs Airtable configuration";
      } else if (session.authorized && session.user?.display_name) {
        $("apiStatus").textContent = normalizeDisplayText(`${session.user.display_name} · ${session.role || "Member"} · ${session.brand?.name || "Studio"}`);
        $("apiStatus").title = "Authenticated by Cloudflare Access and authorized by Studio membership";
      } else if (session.authenticated && session.email) {
        $("apiStatus").textContent = `Signed in · ${session.email}`;
        $("apiStatus").title = "Authenticated by Cloudflare Access; same-origin Studio API connected";
      } else {
        $("apiStatus").textContent = "API connected";
      }
    } catch (e) {
      $("apiStatus").textContent = "API unavailable";
    }
  }

  let dashboardInflight = null;
  let dashboardInflightKey = "";

  async function loadDashboard(force = false) {
    const key = selectedProfileId || "default";
    if (dashboardInflight && dashboardInflightKey === key && !force) return dashboardInflight;
    const metrics = $("metrics");
    const list = $("recentOutputs");
    const run = (async () => {
      renderDashboardMetrics();
      list.innerHTML = '<div class="empty">Loading pipeline data…</div>';
      try {
        const data = await api("/api/dashboard");
        if (selectedProfileId && data.profile?.id && data.profile.id !== selectedProfileId) return;
        const m = data.metrics || {};
        dashboardCache = {
          metrics: m,
          ideas: Array.isArray(data.ideas) ? data.ideas : [],
          content: Array.isArray(data.content) ? data.content : [],
          outputs: Array.isArray(data.outputs) && data.outputs.length ? data.outputs : (data.recent_outputs || []),
        };
        renderDashboardMetrics();
        renderDashboardPanel();
      } catch (e) {
        renderDashboardMetrics();
        list.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      }
    })();
    dashboardInflightKey = key;
    dashboardInflight = run.finally(() => {
      if (dashboardInflight === run) {
        dashboardInflight = null;
        dashboardInflightKey = "";
      }
    });
    return dashboardInflight;
  }

  function dashboardViewForCard(page, filter) {
    if (page === "ideas") return "ideas";
    if (page === "content") return "content";
    return filter || "all";
  }

  function dashboardCards() {
    const m = dashboardCache.metrics || {};
    return [
      { view: "ideas", label: "Ideas", page: "ideas", number: m.ideas },
      { view: "content", label: "Content items", page: "content", number: m.content_items },
      { view: "all", label: "Platform outputs", page: "outputs", filter: "all", number: m.platform_outputs },
      { view: "active", label: "Active outputs", page: "outputs", filter: "active", number: m.active_outputs },
      { view: "attention", label: "Needs attention", page: "outputs", filter: "attention", number: m.attention_outputs },
      { view: "published", label: "Published", page: "outputs", filter: "published", number: m.published_outputs },
    ];
  }

  function renderDashboardMetrics() {
    const metrics = $("metrics");
    if (!metrics) return;
    metrics.innerHTML = dashboardCards().map((card) => {
      const selected = dashboardView === card.view;
      return `<button type="button" class="metric metric-button${selected ? " is-selected" : ""}" data-dash-page="${escapeHtml(card.page)}" data-dash-filter="${escapeHtml(card.filter || "")}" aria-pressed="${selected ? "true" : "false"}" title="Show ${escapeHtml(card.label)}"><div class="metric-label">${escapeHtml(card.label)}</div><div class="metric-value">${card.number ?? 0}</div></button>`;
    }).join("");
    metrics.querySelectorAll("[data-dash-page]").forEach((button) => {
      button.addEventListener("click", () => openDashboardCard(button.dataset.dashPage, button.dataset.dashFilter));
    });
  }

  function dashboardPanelCopy(view) {
    if (view === "ideas") return { title: "Ideas", copy: "Idea candidates currently in the intake queue." };
    if (view === "content") return { title: "Content items", copy: "Promoted production items." };
    if (view === "all") return { title: "Platform outputs", copy: "Every current platform output." };
    if (view === "active") return { title: "Active outputs", copy: "Outputs still moving through production or publishing." };
    if (view === "attention") return { title: "Needs attention", copy: "Failed, retry pending, or manual-action outputs." };
    if (view === "published") return { title: "Published", copy: "Outputs that have reached a published state." };
    return { title: "Recent platform outputs", copy: "Normalized states hide scenario implementation details while preserving actionable status." };
  }

  function renderDashboardPanel() {
    const heading = dashboardPanelCopy(dashboardView);
    const title = $("dashboardListTitle");
    const copy = $("dashboardListCopy");
    const list = $("recentOutputs");
    if (title) title.textContent = heading.title;
    if (copy) copy.textContent = heading.copy;
    if (!list) return;
    if (dashboardView === "ideas") {
      renderIdeasTable(list, dashboardCache.ideas || []);
      return;
    }
    if (dashboardView === "content") {
      renderContentItemsTable(list, dashboardCache.content || []);
      return;
    }
    const filter = dashboardView === "recent" ? "all" : dashboardView;
    let records = dashboardCache.outputs || [];
    if (dashboardView !== "recent") {
      records = records.filter((record) => pipelineRecordMatchesFilter(record, filter));
    }
    records = sortedPipelineRecords(records);
    if (dashboardView === "recent") {
      records = records.slice(0, 12);
    }
    if (!records.length) {
      list.innerHTML = `<div class="empty">No ${escapeHtml(heading.title.toLowerCase())} right now.</div>`;
      return;
    }
    renderOutputsTable(list, records);
  }

  function openDashboardCard(page, filter) {
    const next = dashboardViewForCard(page, filter);
    dashboardView = dashboardView === next ? "recent" : next;
    renderDashboardMetrics();
    renderDashboardPanel();
    $("recentOutputs")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function ideaPathMode() {
    const checked = document.querySelector('input[name="ideaPathMode"]:checked');
    return checked?.value === "manual" ? "manual" : "existing";
  }

  function syncIdeaPathMode() {
    const mode = ideaPathMode();
    const existing = $("ideaExistingFields");
    const manual = $("ideaManualFields");
    const button = $("createIdeaButton");
    const title = $("ideaTitle");
    if (existing) existing.hidden = mode !== "existing";
    if (manual) manual.hidden = mode !== "manual";
    if (title) title.required = mode === "manual";
    if (button) button.textContent = mode === "manual" ? "Create idea" : "Continue with selected idea";
    if (mode === "manual") setTimeout(() => title?.focus(), 0);
    else setTimeout(() => $("ideaExistingSelect")?.focus(), 0);
  }

  function selectableIdeas(records = ideasCache) {
    return (records || []).filter((idea) => !ideaIsPromoted(idea));
  }

  function populateIdeaExistingSelect(records = ideasCache) {
    const select = $("ideaExistingSelect");
    const hint = $("ideaExistingHint");
    if (!select) return;
    const current = select.value;
    const options = selectableIdeas(records);
    if (!options.length) {
      select.innerHTML = '<option value="">No unpromoted ideas available</option>';
      select.disabled = true;
      if (hint) hint.textContent = "There are no open ideas right now. Write a new one, or generate AI ideas.";
      return;
    }
    select.disabled = false;
    select.innerHTML = [
      '<option value="">Select an idea…</option>',
      ...options.map((idea) => {
        const idLabel = idea.candidate_id ? `#${idea.candidate_id}` : idea.id;
        const status = ideaStatusLabel(idea);
        const title = idea.title || "Untitled idea";
        return `<option value="${escapeHtml(idea.id)}">${escapeHtml(`${idLabel} · ${title} · ${status}`)}</option>`;
      }),
    ].join("");
    if (current && options.some((idea) => idea.id === current)) select.value = current;
    if (hint) hint.textContent = "Shows ideas that are not in production yet. Open one to add photos or continue.";
  }

  // STUDIO_MANUAL_IDEA_GENERATOR_UI_V1
  function stopIdeaGenerationPoll() {
    if (ideaGenerationPollTimer) clearTimeout(ideaGenerationPollTimer);
    ideaGenerationPollTimer = null;
  }

  function setIdeaGenerateMessage(text = "", type = "") {
    const node = $("ideaGenerateMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setIdeaGeneratorOpen(open, { reset = false } = {}) {
    const panel = $("ideaGeneratePanel");
    if (!panel) return;
    panel.hidden = !open;
    if (open) setIdeaFormOpen(false);
    if (reset) {
      stopIdeaGenerationPoll();
      activeIdeaGenerationBatchId = null;
      ideaGenerationInFlight = false;
      $("ideaGenerateForm")?.reset();
      if ($("ideaGenerateCount")) $("ideaGenerateCount").value = "5";
      if ($("ideaGenerateQuality")) $("ideaGenerateQuality").value = "Highest Quality";
      if ($("ideaGenerateSubmit")) {
        $("ideaGenerateSubmit").disabled = false;
        $("ideaGenerateSubmit").textContent = "Generate Ideas";
      }
      if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = true;
      setIdeaGenerateMessage();
    }
  }

  async function pollIdeaGenerationBatch() {
    if (!activeIdeaGenerationBatchId) return;
    try {
      const result = await api(`/api/ideas/generate/${encodeURIComponent(activeIdeaGenerationBatchId)}`);
      const batch = result.batch || {};
      const generated = Number(batch.generated_count || 0);
      const requested = Number(batch.requested_count || 0);
      if (batch.status === "Complete") {
        stopIdeaGenerationPoll();
        ideaGenerationInFlight = false;
        if ($("ideaGenerateSubmit")) {
          $("ideaGenerateSubmit").disabled = false;
          $("ideaGenerateSubmit").textContent = "Generate Ideas";
        }
        setIdeaGenerateMessage(`${generated || requested} ideas created${batch.batch_id ? ` · ${batch.batch_id}` : ""}.`, "success");
        if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = false;
        await Promise.all([loadIdeas(), loadDashboard()]);
        return;
      }
      if (batch.status === "Failed") {
        stopIdeaGenerationPoll();
        ideaGenerationInFlight = false;
        if ($("ideaGenerateSubmit")) {
          $("ideaGenerateSubmit").disabled = false;
          $("ideaGenerateSubmit").textContent = "Retry";
        }
        setIdeaGenerateMessage(batch.error || "Unable to generate ideas. Try again.", "error-text");
        return;
      }
      setIdeaGenerateMessage(requested > 0 ? `${generated} of ${requested} complete` : "Generating ideas…");
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 1000);
    } catch (error) {
      setIdeaGenerateMessage(error.message || "Could not check idea generation. Retrying…", "error-text");
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 5000);
    }
  }

  $("generateIdeasButton")?.addEventListener("click", () => setIdeaGeneratorOpen(true, { reset: !ideaGenerationInFlight }));
  $("ideaGenerateCancel")?.addEventListener("click", () => setIdeaGeneratorOpen(false));
  $("ideaGenerateMore")?.addEventListener("click", () => setIdeaGeneratorOpen(true, { reset: true }));
  $("ideaGenerateView")?.addEventListener("click", async () => {
    await loadIdeas();
    setIdeaGeneratorOpen(false);
    $("ideasList")?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
  $("ideaGenerateForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (ideaGenerationInFlight) return;
    const count = Number($("ideaGenerateCount")?.value || 5);
    const quality = String($("ideaGenerateQuality")?.value || "Highest Quality");
    const button = $("ideaGenerateSubmit");
    if (!Number.isInteger(count) || count < 1 || count > 10) {
      setIdeaGenerateMessage("Enter a whole number from 1 to 10.", "error-text");
      $("ideaGenerateCount")?.focus();
      return;
    }
    ideaGenerationInFlight = true;
    stopIdeaGenerationPoll();
    if (button) { button.disabled = true; button.textContent = "Generating…"; }
    if ($("ideaGenerateComplete")) $("ideaGenerateComplete").hidden = true;
    setIdeaGenerateMessage("Starting idea generation…");
    try {
      const result = await api("/api/ideas/generate", {
        method: "POST",
        body: JSON.stringify({ count, quality }),
        timeoutMs: 30000,
      });
      activeIdeaGenerationBatchId = result.batch_record_id;
      if (!activeIdeaGenerationBatchId) throw new Error("Studio did not return an idea batch ID.");
      setIdeaGenerateMessage(`0 of ${count} complete`);
      ideaGenerationPollTimer = setTimeout(pollIdeaGenerationBatch, 500);
    } catch (error) {
      ideaGenerationInFlight = false;
      if (button) { button.disabled = false; button.textContent = "Retry"; }
      setIdeaGenerateMessage(error.message || "Unable to start idea generation. Try again.", "error-text");
    }
  });

  function setIdeaFormOpen(open, { mode = null } = {}) {
    const panel = $("ideaCreatePanel");
    panel.hidden = !open;
    $("ideaFormMessage").textContent = "";
    $("ideaFormMessage").className = "form-message";
    if (!open) return;
    if (mode === "manual" || mode === "existing") {
      const radio = document.querySelector(`input[name="ideaPathMode"][value="${mode}"]`);
      if (radio) radio.checked = true;
    }
    populateIdeaExistingSelect();
    syncIdeaPathMode();
    loadIdeas().catch(() => {});
  }

  $("newIdeaButton").addEventListener("click", () => setIdeaFormOpen(true, { mode: "manual" }));
  $("cancelIdeaButton").addEventListener("click", () => {
    $("ideaCreateForm").reset();
    const existingRadio = document.querySelector('input[name="ideaPathMode"][value="existing"]');
    if (existingRadio) existingRadio.checked = true;
    setIdeaFormOpen(false);
  });
  document.querySelectorAll('input[name="ideaPathMode"]').forEach((input) => {
    input.addEventListener("change", () => {
      $("ideaFormMessage").textContent = "";
      $("ideaFormMessage").className = "form-message";
      syncIdeaPathMode();
    });
  });

  $("ideaCreateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("createIdeaButton");
    const message = $("ideaFormMessage");
    const mode = ideaPathMode();
    button.disabled = true;
    message.className = "form-message";
    message.textContent = "";

    try {
      if (mode === "existing") {
        const ideaId = $("ideaExistingSelect")?.value || "";
        const idea = ideasCache.find((record) => record.id === ideaId);
        if (!ideaId || !idea) {
          message.className = "form-message error-text";
          message.textContent = "Select an existing idea to continue.";
          return;
        }
        button.textContent = "Opening…";
        setIdeaFormOpen(false);
        openIdeaDrawer(idea);
        return;
      }

      const title = $("ideaTitle").value.trim();
      const summary = $("ideaSummary").value.trim();
      if (!title) {
        message.className = "form-message error-text";
        message.textContent = "Enter an idea title.";
        return;
      }
      button.textContent = "Creating…";
      const result = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({ title, summary }),
      });
      message.className = "form-message success";
      message.textContent = `Created idea ${result.record?.candidate_id ? `#${result.record.candidate_id}` : "successfully"}.`;
      $("ideaCreateForm").reset();
      const existingRadio = document.querySelector('input[name="ideaPathMode"][value="existing"]');
      if (existingRadio) existingRadio.checked = true;
      await Promise.all([loadIdeas(), loadDashboard()]);
      const created = result.record;
      setTimeout(() => {
        setIdeaFormOpen(false);
        if (created?.id) openIdeaDrawer(created);
      }, 500);
    } catch (e) {
      message.className = "form-message error-text";
      message.textContent = e.message;
    } finally {
      button.disabled = false;
      syncIdeaPathMode();
    }
  });


  function ideaStatusLabel(idea) {
    if (idea?.is_on_hold) return "On Hold";
    if (ideaIsPromoted(idea)) return "In production";
    if (String(idea?.photo_wait_status || "") === "Waiting") return "Waiting for photos";
    if (String(idea?.photo_wait_status || "") === "Ready") return "Photos ready";
    const status = String(idea?.status || "").trim();
    if (status === "Sent for Review" || status === "Generated") return "Ready to produce";
    return status || "Unknown";
  }

  function ideaIsPromoted(idea) {
    return Boolean(
      idea?.promoted_content_record_id ||
      (Array.isArray(idea?.content_item_links) && idea.content_item_links.length)
    );
  }

  function ideaCanModify(idea) {
    return !ideaIsPromoted(idea) && idea?.status !== "Approved";
  }

  function ideaHasProductionRequest(idea) {
    return Array.isArray(idea?.production_request_links) && idea.production_request_links.length > 0;
  }

  function ideaCanPromote(idea) {
    const wait = String(idea?.photo_wait_status || "").trim();
    return !ideaIsPromoted(idea) && !idea?.is_on_hold && wait !== "Waiting" && wait !== "Ready";
  }

  function ideaShowPromoteAction(idea) {
    return ideaCanPromote(idea) && !ideaHasProductionRequest(idea);
  }

  function ideaPhotoWaitActive(idea) {
    const wait = String(idea?.photo_wait_status || "").trim();
    return wait === "Waiting" || wait === "Ready";
  }

  function ideaPhotoWaitPayload() {
    const contentType = $("promoteContentType")?.value || "";
    const imageMode = $("promoteCarouselImageMode")?.value || "";
    let slideMode = $("promoteCarouselSlideMode")?.value || "Exact";
    if (imageMode === "Wait for matching photos") slideMode = "Target range";
    return {
      content_type: contentType,
      slide_mode: slideMode,
      image_mode: imageMode,
      waits: ["Carousel", "Photo Set", "Feed Post"].includes(contentType)
        && slideMode === "Target range"
        && imageMode !== "Make AI Generated",
    };
  }

  function setSelectValue(id, value, fallback) {
    const el = $(id);
    if (!el) return;
    const desired = String(value || fallback || "");
    const exists = Array.from(el.options).some((option) => option.value === desired);
    el.value = exists ? desired : (fallback || "");
  }

  function syncPromotionPanels() {
    const contentType = $("promoteContentType").value;
    $("videoPromotionOptions").hidden = !["Vertical Short Video", "Longform Video"].includes(contentType);
    const imageFamily = ["Carousel", "Photo Set", "Feed Post"].includes(contentType);
    $("carouselPromotionOptions").hidden = !imageFamily;
    const wait = ideaPhotoWaitPayload();
    const range = wait.slide_mode === "Target range";
    if ($("promoteCarouselExactWrap")) $("promoteCarouselExactWrap").hidden = range;
    if ($("promoteCarouselMinWrap")) $("promoteCarouselMinWrap").hidden = !range;
    if ($("promoteCarouselMaxWrap")) $("promoteCarouselMaxWrap").hidden = !range;
    if ($("promotePhotoWaitHint")) $("promotePhotoWaitHint").hidden = !wait.waits;
    const promoteButton = $("promoteIdeaButton");
    if (promoteButton && !ideaIsPromoted(activeIdea) && !activeIdea?.is_on_hold && !ideaPhotoWaitActive(activeIdea)) {
      promoteButton.textContent = wait.waits ? "Approve and wait for photos" : "Promote to production";
    }
    if (wait.image_mode === "Wait for matching photos" && $("promoteCarouselSlideMode")) {
      $("promoteCarouselSlideMode").value = "Target range";
    }
  }

  function selectedPromotionPlatforms() {
    return Array.from(document.querySelectorAll('input[name="promotePlatform"]:checked')).map((input) => input.value);
  }

  function setManageMessage(text = "", type = "") {
    const target = $("ideaManageMessage");
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function updateIdeaDrawer(idea) {
    activeIdea = idea;
    $("ideaDrawerHeading").textContent = idea?.title || "Manage idea";
    $("ideaDetailStatus").innerHTML = badge(ideaStatusLabel(idea));
    $("ideaDetailCandidate").textContent = idea?.candidate_id ? `#${idea.candidate_id}` : idea?.id || "—";
    const ideaCreated = $("ideaDetailCreated");
    if (ideaCreated) ideaCreated.textContent = idea?.created_at ? formatStudioDateTime(idea.created_at) : "—";
    const ideaHoldWrap = $("ideaDetailHoldWrap");
    const ideaHold = $("ideaDetailHold");
    if (ideaHoldWrap && ideaHold) {
      const onHold = Boolean(idea?.is_on_hold && idea?.studio_hold_at);
      ideaHoldWrap.hidden = !onHold;
      ideaHold.textContent = onHold ? formatStudioDateTime(idea.studio_hold_at) : "—";
    }
    $("editIdeaTitle").value = idea?.title || "";
    $("editIdeaSummary").value = idea?.summary || "";

    setSelectValue("promoteContentType", idea?.content_type, "");
    document.querySelectorAll('input[name="promotePlatform"]').forEach((input) => {
      input.checked = Array.isArray(idea?.platforms) && idea.platforms.includes(input.value);
    });
    setSelectValue("promoteVoiceover", idea?.include_voiceover, "Use Profile Default");
    setSelectValue("promoteMusic", idea?.include_background_music, "Use Profile Default");
    setSelectValue("promoteThumbnail", idea?.include_thumbnail, "Use Profile Default");
    setSelectValue("promoteVideoDuration", idea?.video_duration ? String(idea.video_duration) : "30", "30");
    setSelectValue("promoteVideoClipCount", idea?.video_clip_count ? String(idea.video_clip_count) : "Auto", "Auto");
    setSelectValue("promoteVoiceoverTail", idea?.voiceover_tail_seconds !== null && idea?.voiceover_tail_seconds !== undefined ? String(idea.voiceover_tail_seconds) : "2", "2");
    $("promoteCarouselSlideCount").value = idea?.carousel_slide_count || 5;
    if ($("promoteCarouselSlideMin")) $("promoteCarouselSlideMin").value = idea?.carousel_slide_count_min || 3;
    if ($("promoteCarouselSlideMax")) $("promoteCarouselSlideMax").value = idea?.carousel_slide_count_max || 10;
    setSelectValue("promoteCarouselSlideMode", idea?.carousel_slide_count_mode, "Exact");
    const waitImageMode = String(idea?.photo_wait_status || "") && idea?.carousel_slide_count_mode === "Target range"
      ? "Wait for matching photos"
      : idea?.carousel_image_mode;
    setSelectValue("promoteCarouselImageMode", waitImageMode, "Make AI Generated");
    $("promoteProductionNotes").value = "";
    syncPromotionPanels();

    const snapshot = [
      ["Type", idea?.content_type],
      ["Platforms", Array.isArray(idea?.platforms) && idea.platforms.length ? idea.platforms.join(", ") : null],
      ["Slides", ideaPhotoWaitActive(idea) || idea?.carousel_slide_count_mode === "Target range"
        ? `${idea?.carousel_slide_count_min || "?"}–${idea?.carousel_slide_count_max || "?"} photos`
        : idea?.carousel_slide_count],
      ["Photo wait", idea?.photo_wait_status],
      ["Matched", idea?.photo_match?.high_count != null ? `${idea.photo_match.high_count} high-confidence` : null],
      ["Clips", idea?.video_clip_count],
      ["Voiceover", idea?.include_voiceover],
      ["Music", idea?.include_background_music],
      ["Thumbnail", idea?.include_thumbnail],
      ["Duration", idea?.video_duration ? `${idea.video_duration}s` : null],
    ];
    $("ideaProductionSnapshot").innerHTML = snapshot.map(([label, val]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${value(val)}</strong></div>`
    ).join("");
    const snapshotSection = $("ideaProductionSnapshotSection");
    if (snapshotSection) {
      snapshotSection.hidden = !snapshot.some(([, val]) => val != null && String(val).trim() !== "");
    }

    const promoted = ideaIsPromoted(idea);
    const modifiable = ideaCanModify(idea);
    $("saveIdeaButton").disabled = !modifiable;
    $("saveIdeaButton").textContent = promoted ? "Locked after promotion" : "Save changes";
    $("editIdeaTitle").disabled = !modifiable;
    $("editIdeaSummary").disabled = !modifiable;
    $("deleteIdeaButton").disabled = !modifiable;
    const configureButton = $("configureProductionButton");
    if (configureButton) {
      configureButton.disabled = promoted || Boolean(idea?.is_on_hold);
      configureButton.textContent = promoted
        ? "Production locked"
        : (String(idea?.photo_wait_status || "") === "Ready" ? "Open Production" : "Add new photos");
    }
    const useExistingButton = $("useExistingLibraryButton");
    if (useExistingButton) {
      useExistingButton.disabled = promoted || Boolean(idea?.is_on_hold);
      useExistingButton.hidden = promoted;
    }
    resetIdeaLibraryPicker();
    $("holdIdeaButton").hidden = Boolean(idea?.is_on_hold);
    $("restoreIdeaButton").hidden = !idea?.is_on_hold;
    $("holdIdeaButton").disabled = !modifiable;
    $("restoreIdeaButton").disabled = ideaIsPromoted(idea);

    const promotable = ideaCanPromote(idea);
    const libraryPromote = $("ideaLibraryPromote");
    if (libraryPromote) {
      libraryPromote.hidden = Boolean(idea?.is_on_hold) || promoted;
    }
    $("promoteIdeaButton").disabled = !promotable;
    $("ideaPromotionZone").classList.toggle("promotion-disabled", !promotable);
    $("ideaPromotionZone").querySelectorAll("select,input,textarea").forEach((control) => { control.disabled = !promotable; });
    const matchButton = $("matchIdeaPhotosButton");
    if (matchButton) {
      matchButton.hidden = !ideaPhotoWaitActive(idea) || promoted || Boolean(idea?.is_on_hold);
      matchButton.disabled = String(idea?.photo_wait_status || "") === "Ready";
    }
    const openProd = $("openIdeaProductionButton");
    if (openProd) {
      openProd.hidden = String(idea?.photo_wait_status || "") !== "Ready" || promoted;
    }

    if (ideaIsPromoted(idea)) {
      $("promoteIdeaButton").textContent = "Already promoted";
      setManageMessage("Promotion is complete. This Idea Candidate is intentionally locked; there is no background save or promotion task running.", "success");
    } else if (idea?.is_on_hold) {
      setManageMessage("Restore this idea before promoting it to production.", "");
    } else if (String(idea?.photo_wait_status || "") === "Waiting") {
      const high = Number(idea?.photo_match?.high_count || 0);
      const min = Number(idea?.carousel_slide_count_min || 0);
      const max = Number(idea?.carousel_slide_count_max || 0);
      $("promoteIdeaButton").textContent = "Waiting for photos";
      setManageMessage(`Approved and waiting. ${high} / ${min || "?"} high-confidence matches so far. When it runs it will take up to ${max || "?"} photos, then you set production rules.`, "");
    } else if (String(idea?.photo_wait_status || "") === "Ready") {
      $("promoteIdeaButton").textContent = "Photos ready";
      const count = Array.isArray(idea?.matched_media_asset_links) ? idea.matched_media_asset_links.length : (idea?.photo_match?.selected?.length || 0);
      setManageMessage(`${count || "Matched"} photo${count === 1 ? "" : "s"} attached. Open Production to set content rules, then approve rendering there.`, "success");
    } else if (idea?.status === "Approved") {
      setManageMessage("This idea is approved but not yet linked to a content item. Use Promote to production to retry.", "");
    } else {
      syncPromotionPanels();
      setManageMessage("Promote to production below. No review email is required.", "");
    }
  }

  function managedIdeaDraft() {
    return {
      title: String($("editIdeaTitle")?.value || "").trim(),
      summary: String($("editIdeaSummary")?.value || "").trim(),
    };
  }

  function managedIdeaDraftDirty(idea = activeIdea) {
    if (!idea) return false;
    const draft = managedIdeaDraft();
    return draft.title !== String(idea.title || "").trim()
      || draft.summary !== String(idea.summary || "").trim();
  }

  async function saveManagedIdeaIdentity({ quiet = false, reloadList = true } = {}) {
    const idea = activeIdea;
    if (!idea?.id || !ideaCanModify(idea)) return idea || null;
    if (!managedIdeaDraftDirty(idea)) return idea;
    const draft = managedIdeaDraft();
    if (!draft.title) {
      const error = new Error("Idea title is required.");
      if (!quiet) setManageMessage(error.message, "error-text");
      throw error;
    }
    const result = await api(`/api/ideas/${encodeURIComponent(idea.id)}`, {
      method: "PATCH",
      body: JSON.stringify(draft),
    });
    if (result.record) {
      activeIdea = result.record;
      if (reloadList) await Promise.all([loadIdeas(), loadDashboard()]);
      return result.record;
    }
    return idea;
  }

  function openIdeaDrawer(idea, { focusPromote = false } = {}) {
    updateIdeaDrawer(idea);
    $("ideaDrawerBackdrop").hidden = false;
    $("ideaManageDrawer").classList.add("open");
    $("ideaManageDrawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    setTimeout(() => {
      if (focusPromote) {
        $("ideaLibraryPromote")?.setAttribute("open", "");
        $("promoteIdeaButton")?.focus();
        $("promoteIdeaButton")?.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      $("editIdeaTitle").focus();
    }, 80);
  }

  async function closeIdeaDrawer({ save = true } = {}) {
    if (save && activeIdea?.id && ideaCanModify(activeIdea) && managedIdeaDraftDirty()) {
      try {
        await saveManagedIdeaIdentity({ quiet: true, reloadList: true });
      } catch (error) {
        setManageMessage(error.message || "Could not save the idea.", "error-text");
        return false;
      }
    }
    $("ideaManageDrawer").classList.remove("open");
    $("ideaManageDrawer").setAttribute("aria-hidden", "true");
    $("ideaDrawerBackdrop").hidden = true;
    document.body.classList.remove("drawer-open");
    activeIdea = null;
    setManageMessage();
    return true;
  }

  $("closeIdeaDrawer").addEventListener("click", () => { closeIdeaDrawer(); });
  $("ideaDrawerBackdrop").addEventListener("click", () => { closeIdeaDrawer(); });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("ideaManageDrawer").classList.contains("open")) closeIdeaDrawer();
  });

  async function refreshManagedIdea(recordId) {
    const { record } = await api(`/api/ideas/${encodeURIComponent(recordId)}`);
    updateIdeaDrawer(record);
    await Promise.all([loadIdeas(), loadDashboard()]);
    return record;
  }

  $("ideaEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeIdea?.id) return;

    const button = $("saveIdeaButton");
    button.disabled = true;
    button.textContent = "Saving…";
    setManageMessage();

    try {
      const record = await saveManagedIdeaIdentity({ quiet: false, reloadList: true });
      if (record) updateIdeaDrawer(record);
      setManageMessage("Changes saved.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.disabled = !ideaCanModify(activeIdea);
      button.textContent = "Save changes";
    }
  });

  $("holdIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const button = $("holdIdeaButton");
    button.disabled = true;
    button.textContent = "Holding…";
    setManageMessage();

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/hold`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard()]);
      setManageMessage("Idea is on hold. It cannot satisfy the existing Approved promotion gate.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Hold idea";
      if (activeIdea && !activeIdea.is_on_hold && ideaCanModify(activeIdea)) {
        button.disabled = false;
      }
    }
  });

  $("restoreIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const button = $("restoreIdeaButton");
    button.disabled = true;
    button.textContent = "Restoring…";
    setManageMessage();

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard()]);
      setManageMessage("Idea restored to its pre-hold status.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Restore idea";
      if (activeIdea && activeIdea.is_on_hold && !ideaIsPromoted(activeIdea)) {
        button.disabled = false;
      }
    }
  });


  $("promoteContentType").addEventListener("change", syncPromotionPanels);
  $("promoteCarouselSlideMode")?.addEventListener("change", syncPromotionPanels);
  $("promoteCarouselImageMode")?.addEventListener("change", syncPromotionPanels);

  $("matchIdeaPhotosButton")?.addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const button = $("matchIdeaPhotosButton");
    button.disabled = true;
    button.textContent = "Matching…";
    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/match-photos`, {
        method: "POST",
        body: JSON.stringify({ force: true }),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard(), loadProductionRequests()]);
      setManageMessage(result.photo_wait?.action === "ready"
        ? `Matched ${result.photo_wait.selected?.length || 0} photos. Open Production to set rules.`
        : `Still waiting. ${result.photo_wait?.high_count || 0} high-confidence matches so far.`,
        result.photo_wait?.action === "ready" ? "success" : "");
    } catch (error) {
      setManageMessage(error.message || "Could not match photos.", "error-text");
    } finally {
      button.textContent = "Match photos now";
      if (activeIdea && String(activeIdea.photo_wait_status || "") === "Waiting") button.disabled = false;
    }
  });

  $("openIdeaProductionButton")?.addEventListener("click", async () => {
    if (!activeIdea) return;
    try {
      await openProductionRequestForIdea(activeIdea);
    } catch (error) {
      setManageMessage(error.message || "Could not open Production.", "error-text");
    }
  });

  $("promoteIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id || !ideaCanPromote(activeIdea)) return;

    const contentType = $("promoteContentType").value;
    const platforms = selectedPromotionPlatforms();
    if (!contentType) {
      setManageMessage("Choose a master content type before promotion.", "error-text");
      return;
    }
    if (!platforms.length) {
      setManageMessage("Choose at least one target platform before promotion.", "error-text");
      return;
    }
    if (!$('editIdeaSummary').value.trim()) {
      setManageMessage("Add a summary and save it before promotion.", "error-text");
      return;
    }

    const label = activeIdea.title || `Candidate ${activeIdea.candidate_id || activeIdea.id}`;
    const wait = ideaPhotoWaitPayload();
    const confirmed = window.confirm(
      wait.waits
        ? `Approve "${label}" and wait for photos?\n\nStudio will not create a Content Item yet. When at least ${$("promoteCarouselSlideMin")?.value || 3} high-confidence stills exist, it will attach all of them up to ${$("promoteCarouselSlideMax")?.value || 10} and open Production for rules.`
        : `Promote "${label}" to production?\n\nStudio will create the content item from this idea. No review email is sent.`
    );
    if (!confirmed) return;

    const button = $("promoteIdeaButton");
    button.disabled = true;
    button.textContent = wait.waits ? "Approving…" : "Promoting…";
    setManageMessage(wait.waits ? "Approving and waiting for photos…" : "Promoting to production…", "");

    const payload = {
      content_type: contentType,
      platforms,
      include_voiceover: $("promoteVoiceover").value,
      include_background_music: $("promoteMusic").value,
      include_thumbnail: $("promoteThumbnail").value,
      video_duration: Number($("promoteVideoDuration").value || 30),
      video_clip_count: $("promoteVideoClipCount").value,
      voiceover_tail_seconds: Number($("promoteVoiceoverTail").value || 2),
      carousel_slide_count: Number($("promoteCarouselSlideCount").value || 5),
      carousel_slide_count_mode: wait.slide_mode,
      carousel_slide_count_min: $("promoteCarouselSlideMin")?.value || "",
      carousel_slide_count_max: $("promoteCarouselSlideMax")?.value || "",
      carousel_image_mode: $("promoteCarouselImageMode").value,
      production_notes: $("promoteProductionNotes").value.trim(),
    };

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/promote`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let record = result.record;
      if (result.photo_wait || result.waiting || result.handoff === "photo-wait") {
        updateIdeaDrawer(record);
        await Promise.all([loadIdeas(), loadDashboard(), loadProductionRequests()]);
        if (result.photo_wait?.action === "ready" && result.production_request) {
          setManageMessage(result.message || "Photos matched. Open Production to set rules.", "success");
        } else {
          setManageMessage(result.message || "Approved. Waiting for high-confidence photos.", "success");
        }
        return;
      }
      if (!ideaIsPromoted(record)) {
        setManageMessage("Approved. Waiting for the content item to finish…", "");
        for (let attempt = 0; attempt < 8 && !ideaIsPromoted(record); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1250));
          const refreshed = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`);
          record = refreshed.record;
        }
      }

      updateIdeaDrawer(record);
      await Promise.all([loadIdeas(), loadDashboard(), loadContent()]);

      if (ideaIsPromoted(record)) {
        const contentRecordId = record.promoted_content_record_id || (record.content_item_links || [])[0] || "created Content Item";
        setManageMessage(`Promoted to production. Content item: ${contentRecordId}.`, "success");
      } else {
        setManageMessage("Promotion is still finishing; use Refresh if the content item does not appear shortly.", "success");
      }
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Promote to production";
      if (activeIdea && ideaCanPromote(activeIdea)) button.disabled = false;
    }
  });

  $("deleteIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const label = activeIdea.title || `Candidate ${activeIdea.candidate_id || activeIdea.id}`;
    const confirmed = window.confirm(
      `Permanently delete "${label}"?\n\nThis removes the unpromoted Idea Candidate record from Airtable and cannot be undone.`
    );
    if (!confirmed) return;

    const button = $("deleteIdeaButton");
    button.disabled = true;
    button.textContent = "Deleting…";
    setManageMessage();

    try {
      await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      await closeIdeaDrawer({ save: false });
      await Promise.all([loadIdeas(), loadDashboard()]);
    } catch (e) {
      setManageMessage(e.message, "error-text");
      button.disabled = false;
      button.textContent = "Delete";
    }
  });

  function switchToPage(page) {
    showStudioPage(page);
  }

  function openPipelineAfterPromote() {
    switchToPage("outputs");
  }

  function showSupportDoc(id) {
    const doc = String(id || "walkthrough").trim() || "walkthrough";
    document.querySelectorAll("[data-support-doc]").forEach((button) => {
      button.classList.toggle("active", button.dataset.supportDoc === doc);
    });
    document.querySelectorAll("[data-support-article]").forEach((article) => {
      article.hidden = article.dataset.supportArticle !== doc;
    });
  }

  document.querySelectorAll("[data-support-doc]").forEach((button) => {
    button.addEventListener("click", () => showSupportDoc(button.dataset.supportDoc));
  });
  document.querySelectorAll("[data-open-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.dataset.openPage;
      if (!page || !$(`page-${page}`)) return;
      if (!phase6ConfirmDiscardUnsaved("leave this editor")) return;
      switchToPage(page);
    });
  });

  function ezPlanApi() {
    return window.ChicagoShiningEzPlan || null;
  }

  function setEzMessage(text = "", type = "") {
    const target = $("ezMessage");
    if (!target) return;
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function ezCaptionModeFor(assetId) {
    const id = String(assetId || "");
    return ezCaptionModes.get(id) || ezCaptionDefault || "ai";
  }

  function ezCaptionMode() {
    const modes = [];
    document.querySelectorAll("[data-ez-caption-mode]").forEach((el) => modes.push(el.value));
    if (!modes.length) ezCaptionModes.forEach((value) => modes.push(value));
    if (modes.some((value) => value === "manual")) return "manual";
    if (modes.length && modes.every((value) => value === "none")) return "none";
    return "ai";
  }

  function usingEzPlatforms() {
    if (!ezIntakeKind) return false;
    if (ezStarting) return true;
    return ezIsOriginRecord();
  }

  function ezSelectedPlatforms() {
    if (!usingEzPlatforms()) return item4SelectedPlatforms();
    const boxes = Array.from(document.querySelectorAll("[data-ez-platform]"));
    if (!boxes.length) return item4SelectedPlatforms();
    return boxes.filter((input) => input.checked && !input.disabled).map((input) => input.value);
  }

  function syncItem4PlatformsFromEz() {
    if (!usingEzPlatforms()) return;
    const selected = new Set(ezSelectedPlatforms());
    document.querySelectorAll("[data-item4-platform]").forEach((input) => {
      input.checked = selected.has(input.value);
    });
  }

  function currentEzPackageId() {
    return String(
      ezWizardPending?.packageId
      || ezWizardAnswers?.packageId
      || ezPlanApi()?.parseEzOriginNotes?.($("prProductionNotes")?.value || $("ezProductionNotes")?.value)?.packageId
      || ""
    ).trim();
  }

  function ezPlanCountOptions() {
    const inputKind = String(
      ezIntakeKind
      || (ezWizardPending || ezWizardAnswers)?.inputKind
      || ezPlanApi()?.parseEzOriginNotes?.($("prProductionNotes")?.value || $("ezProductionNotes")?.value)?.inputKind
      || ""
    ).trim();
    return {
      clipInput: ezIsClipRequest(),
      finishedVideo: ezIsFinishedVideo(),
      inputKind,
    };
  }

  function applyEzPlanOverrides(photoCount, platforms) {
    const planned = ezPlanApi()?.ezPlanFromPhotoCount({
      photoCount,
      platforms,
      packageId: currentEzPackageId(),
      ...ezPlanCountOptions(),
    }) || { overrides: {}, platforms: platforms || [] };
    item4PlanOverrides = { ...item4PlanOverrides, ...planned.overrides };
    if (ezIsClipRequest() && planned.overrides?.Facebook === "Reel") {
      item4PlanOverrides.Facebook = "Reel";
    }
    return planned;
  }

  function defaultPlanPlatforms(count = 1) {
    const planned = ezPlanApi()?.ezPlanFromPhotoCount({
      photoCount: count,
      packageId: currentEzPackageId(),
      ...ezPlanCountOptions(),
    });
    if (planned?.platforms?.length) return planned.platforms;
    return currentEzPackageId() === "slides" && Number(count || 0) <= 1
      ? ["Instagram", "Facebook", "TikTok"]
      : ["Instagram", "Facebook", "TikTok", "YouTube"];
  }

  function seedPlatformToggles(platforms) {
    const wanted = new Set(platforms || []);
    document.querySelectorAll("[data-item4-platform], [data-ez-platform]").forEach((input) => {
      if (input.disabled) return;
      input.checked = wanted.has(input.value);
    });
  }

  function ezPlanPlatforms(count, selected) {
    const usingEz = usingEzPlatforms() || ezStarting || ezAutoPlanAfterUpload;
    if (!usingEz) {
      const planned = applyEzPlanOverrides(count, selected);
      const platforms = planned.platforms.length ? planned.platforms : selected;
      return platforms.length ? platforms : defaultPlanPlatforms(count);
    }
    const defaults = defaultPlanPlatforms(count);
    const boxes = Array.from(document.querySelectorAll("[data-ez-platform]"));
    const platforms = boxes.length
      ? defaults.filter((platform) => {
          const box = boxes.find((input) => input.value === platform);
          return box ? (box.checked && !box.disabled) : true;
        })
      : defaults;
    const resolved = platforms.length ? platforms : defaults;
    applyEzPlanOverrides(count, resolved);
    return resolved;
  }

  function ezIsOriginRecord(record = activeProductionRequest) {
    return Boolean(ezPlanApi()?.parseEzOriginNotes(record?.production_notes));
  }

  function setEzAdvancedOpen(open) {
    const details = $("ezAdvancedOptions");
    if (details) details.open = Boolean(open);
  }

  function ezPhotoSetActive() {
    const count = item4Workspace?.assets?.length || ezStagedFiles.length || 0;
    if (ezIntakeKind === "multiple-photos" || ezIntakeKind === "photos-and-clips" || ezIntakeKind === "video-clips" || count > 1) return true;
    const parsed = ezPlanApi()?.parseEzOriginNotes(activeProductionRequest?.production_notes);
    return ["multiple-photos", "multiple-ai", "mixed", "photos-and-clips", "video-clips"].includes(parsed?.inputKind);
  }

  function ezManualCaptionsEnabled() {
    return ezCaptionMode() === "manual";
  }

  function ezIsClipRequest(record = activeProductionRequest) {
    const kind = String(ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "").trim();
    if (kind === "photos-and-clips" || kind === "video-clips") return true;
    const heading = String($("item4MediaHeading")?.textContent || "").toLowerCase();
    if (heading.includes("clip")) return true;
    const notes = String(record?.production_notes || item4Workspace?.production_notes || "").toLowerCase();
    if (notes.includes("ez-input=photos-and-clips")
      || notes.includes("ez-input=video-clips")
      || /ez-clips=\d+/.test(notes)) return true;
    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const clips = assets.filter(item4AssetLooksLikeVideo).length;
    const photos = assets.filter((asset) => asset && !item4AssetLooksLikeVideo(asset)).length;
    return clips > 0 && photos > 0;
  }

  function item4IsFinishedRequest(record = activeProductionRequest) {
    if (ezIsClipRequest(record)) return false;
    const kind = String(ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "").trim();
    if (kind === "finished-video" || kind === "finished-stills") return true;
    const notes = String(record?.production_notes || item4Workspace?.production_notes || "").toLowerCase();
    if (notes.includes("ez-input=finished-video") || notes.includes("ez-input=finished-stills") || notes.includes("ez-input=finished-carousel")) return true;
    const assets = item4Workspace?.assets || [];
    return assets.length === 1 && assets.every(item4AssetLooksLikeVideo);
  }

  function item4FileLooksLikeVideo(file) {
    const mime = String(file?.type || "").toLowerCase();
    const ext = item4UploadFileExtension(file?.name);
    return mime.startsWith("video/") || ["mp4", "mov", "m4v", "webm"].includes(ext);
  }

  function item4FileLooksLikePhoto(file) {
    const mime = String(file?.type || "").toLowerCase();
    const ext = item4UploadFileExtension(file?.name);
    return mime.startsWith("image/") || ext === "heic" || ext === "heif";
  }

  function item4AdoptKindForIncomingFiles(incoming) {
    const files = Array.from(incoming || []);
    if (!files.length) return;
    const hasVideo = files.some(item4FileLooksLikeVideo);
    const hasPhoto = files.some(item4FileLooksLikePhoto);
    if (!hasVideo) return;
    if (ezIsClipRequest() || ezIsFinishedVideo()) return;
    if (hasPhoto || files.filter(item4FileLooksLikeVideo).length > 1) {
      selectEzInput(hasPhoto ? "photos-and-clips" : "video-clips", { resetPlatforms: false });
      return;
    }
    selectEzInput("finished-video", { resetPlatforms: false });
  }

  const ITEM4_CLIP_EDGE_MAX_BYTES = 100 * 1024 * 1024;
  const ITEM4_CLIP_HARD_MAX_BYTES = 200 * 1024 * 1024;
  const ITEM4_COMPRESS_POLL_TIMEOUT_MS = 20 * 60 * 1000;
  let item4OversizedClipNotice = "";
  let item4OversizedNoticeKind = "error-text";

  function item4ClipFileMb(file) {
    return Math.max(1, Math.round(Number(file?.size || 0) / (1024 * 1024)));
  }

  function item4OversizedClipFiles(files, limitBytes = ITEM4_CLIP_EDGE_MAX_BYTES) {
    return Array.from(files || []).filter((file) => item4FileLooksLikeVideo(file) && Number(file.size || 0) > limitBytes);
  }

  function item4OversizedClipMessage(oversized, keptCount = 0, { autoCompress = false } = {}) {
    const labels = oversized.map((file) => `${file.name || "clip"} (${item4ClipFileMb(file)} MB)`);
    const list = labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    if (autoCompress) {
      if (ezIsAzFinishedPath()) {
        return oversized.length === 1
          ? `${list} is over 100 MB. Studio will compress it automatically. You can close this tab.`
          : `${oversized.length} videos are over 100 MB. Studio will compress them automatically. You can close this tab.`;
      }
      return oversized.length === 1
        ? `${list} is over 100 MB. Studio will compress it automatically — keep this tab open.`
        : `${oversized.length} videos are over 100 MB. Studio will compress them automatically — keep this tab open.`;
    }
    const need = oversized.length === 1
      ? `${list} is over 200 MB and cannot be uploaded in Studio.`
      : `${oversized.length} files are over 200 MB and cannot be uploaded: ${list}.`;
    const how = " Use a file under 200 MB.";
    const kept = keptCount
      ? ` Uploading the other ${keptCount} file${keptCount === 1 ? "" : "s"} that ${keptCount === 1 ? "is" : "are"} under the limit.`
      : "";
    return `${need}${how}${kept}`;
  }

  function item4LibraryOversizedClipMessage(oversized, keptCount = 0) {
    const labels = oversized.map((file) => `${file.name || "clip"} (${item4ClipFileMb(file)} MB)`);
    const list = labels.length === 1
      ? labels[0]
      : `${labels.slice(0, -1).join(", ")} and ${labels[labels.length - 1]}`;
    const need = oversized.length === 1
      ? `${list} is over 100 MB and needs to be compressed before the library can store it.`
      : `${oversized.length} clips are over 100 MB and need to be compressed: ${list}.`;
    const how = oversized.length === 1
      ? " Compress the file first, or add it to the Drive ingestion folder so Operations can compress it."
      : " Compress those files first, or add them to the Drive ingestion folder so Operations can compress them.";
    const kept = keptCount
      ? ` Uploading the other ${keptCount} file${keptCount === 1 ? "" : "s"} that ${keptCount === 1 ? "is" : "are"} under 100 MB.`
      : "";
    return `${need}${how}${kept}`;
  }

  function item4ShowOversizedClipNotice() {
    if (!item4OversizedClipNotice) return false;
    setEzMessage(item4OversizedClipNotice, item4OversizedNoticeKind);
    setRequestMessage(item4OversizedClipNotice, item4OversizedNoticeKind);
    return true;
  }

  function item4DropOversizedClips(files, { resetNotice = false, autoCompress = true } = {}) {
    const incoming = Array.from(files || []);
    if (!autoCompress) {
      const oversized = item4OversizedClipFiles(incoming, ITEM4_CLIP_EDGE_MAX_BYTES);
      const allowed = incoming.filter((file) => !oversized.includes(file));
      if (resetNotice && !oversized.length) {
        item4OversizedClipNotice = "";
        item4OversizedNoticeKind = "error-text";
      }
      if (oversized.length) {
        item4OversizedClipNotice = item4LibraryOversizedClipMessage(oversized, allowed.length);
        item4OversizedNoticeKind = "error-text";
        item4ShowOversizedClipNotice();
      }
      return { oversized, allowed, compressable: [] };
    }
    const tooLarge = item4OversizedClipFiles(incoming, ITEM4_CLIP_HARD_MAX_BYTES);
    const compressable = item4OversizedClipFiles(incoming, ITEM4_CLIP_EDGE_MAX_BYTES)
      .filter((file) => Number(file.size || 0) <= ITEM4_CLIP_HARD_MAX_BYTES);
    const allowed = incoming.filter((file) => !tooLarge.includes(file));
    if (resetNotice && !tooLarge.length && !compressable.length) {
      item4OversizedClipNotice = "";
      item4OversizedNoticeKind = "error-text";
    }
    if (tooLarge.length) {
      item4OversizedClipNotice = item4OversizedClipMessage(tooLarge, allowed.length, { autoCompress: false });
      item4OversizedNoticeKind = "error-text";
      item4ShowOversizedClipNotice();
    } else if (compressable.length) {
      item4OversizedClipNotice = item4OversizedClipMessage(compressable, 0, { autoCompress: true });
      item4OversizedNoticeKind = "success";
      item4ShowOversizedClipNotice();
    }
    return { oversized: tooLarge, allowed, compressable };
  }

  function item4WorkspaceNeedsCompression(status = item4Workspace) {
    return (Array.isArray(status?.assets) ? status.assets : []).some((asset) => {
      const state = String(asset?.compression_status || "").toLowerCase();
      if (["pending", "queued", "compressing", "downloading"].includes(state)) return true;
      return asset?.compression_needed === true && state !== "ready" && state !== "failed";
    });
  }

  function item4WorkspaceCompressionFailed(status = item4Workspace) {
    return (Array.isArray(status?.assets) ? status.assets : []).some((asset) => (
      String(asset?.compression_status || "").toLowerCase() === "failed"
    ));
  }

  function item4CompressionProgressLabel(status = item4Workspace) {
    const asset = (Array.isArray(status?.assets) ? status.assets : []).find((row) => {
      const state = String(row?.compression_status || "").toLowerCase();
      return ["pending", "queued", "compressing", "downloading"].includes(state) || row?.compression_needed === true;
    });
    const name = asset?.name || "video";
    const pct = Number(asset?.compression_progress);
    if (Number.isFinite(pct) && pct > 0) {
      return ezIsAzFinishedPath()
        ? `Compressing ${name} · ${Math.round(pct)}%. You can close this tab.`
        : `Compressing ${name} · ${Math.round(pct)}%. Keep this tab open.`;
    }
    return ezIsAzFinishedPath()
      ? `Studio is compressing ${name}. You can close this tab.`
      : `Studio is compressing ${name}. Keep this tab open.`;
  }

  function item4AssetLooksLikeVideo(asset) {
    if (String(asset?.media_kind || "").toLowerCase() === "video") return true;
    const mime = String(asset?.mime_type || "").toLowerCase();
    const name = String(asset?.name || "").toLowerCase();
    return mime.startsWith("video/") || /\.(mp4|mov|m4v|webm)$/i.test(name);
  }

  function ezIsFinishedVideo() {
    if (ezIsClipRequest()) return false;
    const kind = String(ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "").trim();
    if (kind === "finished-video") return true;
    const notes = String(activeProductionRequest?.production_notes || item4Workspace?.production_notes || "").toLowerCase();
    if (notes.includes("ez-input=finished-video")) return true;
    const assets = item4Workspace?.assets || [];
    return assets.length === 1 && assets.every(item4AssetLooksLikeVideo);
  }

  function ezIsAzFinishedPath() {
    if (azFinishedPath) return true;
    const pending = ezWizardPending || ezWizardAnswers;
    const origin = String(pending?.origin || "").trim().toLowerCase();
    if (origin === "az-finished-video") return true;
    const notes = String(activeProductionRequest?.production_notes || item4Workspace?.production_notes || "");
    return /origin=az-finished-video/i.test(notes) || (/az-auto-queue=1/i.test(notes) && /ez-input=finished-video/i.test(notes));
  }

  function setAzFinishedMessage(text = "", type = "") {
    const node = $("azFinishedMessage");
    if (!node) return;
    node.textContent = text || "";
    node.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setAzFinishedProgress(label = "") {
    const node = $("azFinishedProgress");
    if (!node) return;
    if (!label) {
      node.hidden = true;
      node.textContent = "";
      return;
    }
    node.hidden = false;
    node.textContent = label;
  }

  function stopAzFinishedProgressPolling() {
    if (azProgressTimer) {
      window.clearTimeout(azProgressTimer);
      azProgressTimer = 0;
    }
  }

  function azProgressStage(workspace = item4Workspace, outputs = productionRequestOutputs) {
    if (item4WorkspaceCompressionFailed(workspace)) return "error";
    if (item4Uploading || ezStarting) return "ingesting";
    if (item4WorkspaceNeedsCompression(workspace)) return "compressing";
    const assetsReady = String(workspace?.assets_status || "") === "Ready";
    if (!assetsReady) return "ingesting";
    const rows = Array.isArray(outputs) ? outputs : [];
    if (!rows.length) return "cover/caption";
    const story = (row) => /story/i.test(String(row?.studio_output_type || row?.output_type || row?.format || ""));
    const mains = rows.filter((row) => !story(row));
    const hasCover = mains.length && mains.every((row) => String(row.thumbnail_url || "").trim());
    const hasCaption = rows.every((row) => String(row.output_caption || "").trim());
    const queued = rows.length && rows.every((row) => {
      const review = String(row.review_status || "").trim();
      const publish = String(row.publish_status || "").trim();
      const status = String(row.output_status || "").trim();
      return review === "Approved"
        || status === "Approved for Publishing"
        || /ready to (schedule|publish)|publishing|published/i.test(publish);
    });
    const scheduled = rows.some((row) => String(row.scheduled_post_date || "").trim());
    if (queued) return "queued";
    if (scheduled && hasCover && hasCaption) return "scheduled";
    return "cover/caption";
  }

  async function pollAzFinishedProgress() {
    if (!ezIsAzFinishedPath() || !activeProductionRequest?.id) return;
    try {
      await loadItem4Workspace(activeProductionRequest);
      try { await loadProductionRequestOutputs(activeProductionRequest); } catch {}
      const stage = azProgressStage(item4Workspace, productionRequestOutputs);
      setAzFinishedProgress(stage);
      const closeNote = "You can close this tab.";
      if (stage === "error") {
        const failed = (item4Workspace?.assets || []).find((asset) => String(asset?.compression_status || "").toLowerCase() === "failed");
        setAzFinishedMessage(String(failed?.compression_error || "").trim() || "Studio could not compress this video automatically.", "error-text");
        $("azFinishedDrop")?.classList.remove("is-busy");
        stopAzFinishedProgressPolling();
        return;
      }
      if (stage === "queued") {
        setAzFinishedMessage(`Queued across Instagram, Facebook, YouTube, and TikTok. ${closeNote}`, "success");
        $("azFinishedDrop")?.classList.remove("is-busy");
        stopAzFinishedProgressPolling();
        return;
      }
      if (stage === "scheduled") setAzFinishedMessage(`Times are set. Studio is queueing publishes. ${closeNote}`, "success");
      else if (stage === "compressing") setAzFinishedMessage(item4CompressionProgressLabel(), "success");
      else if (stage === "cover/caption") setAzFinishedMessage(`Making the 3D cover and caption. ${closeNote}`, "success");
      else setAzFinishedMessage(`Ingesting the file. ${closeNote}`, "success");
    } catch {}
    azProgressTimer = window.setTimeout(pollAzFinishedProgress, 4000);
  }

  function startAzFinishedProgressPolling() {
    if (!ezIsAzFinishedPath()) return;
    stopAzFinishedProgressPolling();
    pollAzFinishedProgress();
  }

  function item4MediaCountPhrase(counts) {
    const photos = Math.max(0, Number(counts?.photos || 0));
    const clips = Math.max(0, Number(counts?.clips || 0));
    if (photos && clips) return `${photos} photo${photos === 1 ? "" : "s"} and ${clips} clip${clips === 1 ? "" : "s"}`;
    if (clips) return `${clips} clip${clips === 1 ? "" : "s"}`;
    return `${photos} photo${photos === 1 ? "" : "s"}`;
  }

  function ezMediaWord(count = 1) {
    const n = Math.max(1, Number(count) || 1);
    if (ezIsClipRequest() || item4ClipCountsFromStatus(item4Workspace || {}).clips) {
      return n === 1 ? "item" : "items";
    }
    return ezIsFinishedVideo() ? (n === 1 ? "video" : "videos") : (n === 1 ? "photo" : "photos");
  }

  function syncFinishedMediaHeadings() {
    const video = ezIsFinishedVideo();
    const heading = ezIsClipRequest() ? "Photos and clips" : (video ? "Video" : "Photos");
    const mediaH = $("item4MediaHeading");
    if (mediaH) mediaH.textContent = heading;
    const step = $("productionStepMedia");
    if (step) step.textContent = heading;
    const zone = $("item4UploadZone");
    if (zone) zone.setAttribute("aria-label", video ? "Upload finished video" : "Upload master photos");
  }

  function setPageContentSimple(on) {
    $("page-content")?.classList.toggle("page-content-simple", Boolean(on));
  }

  function hideEzFrontDoor() {
    const intake = $("ezIntake");
    const composer = $("ezComposer");
    if (intake) intake.hidden = true;
    if (composer) composer.hidden = true;
  }

  function showProductionRequestWorkspace() {
    ezEntryPath = "configure";
    setPageContentSimple(false);
    hideEzFrontDoor();
    const workspace = $("productionRequestWorkspace");
    if (workspace) workspace.hidden = false;
    syncPrMediaKindUi();
  }

  function selectPrMediaKind(kind, { quiet = false } = {}) {
    const nextKind = ["multiple-photos", "single-photo", "photos-and-clips", "video-clips", "finished-video", "finished-stills"].includes(kind) ? kind : null;
    ezIntakeKind = nextKind;
    document.querySelectorAll("[data-pr-input]").forEach((button) => {
      button.classList.toggle("selected", Boolean(nextKind) && button.dataset.prInput === nextKind);
    });
    item4ApplyMediaInputAccept(nextKind);
    const title = $("item4UploadTitle");
    const hint = $("item4UploadHint");
    const choose = $("item4ChooseMedia");
    const library = $("item4ChooseLibrary");
    if (library) library.hidden = nextKind === "finished-video";
    if (nextKind === "finished-video") {
      if (title) title.textContent = "Drop video";
      if (hint) hint.textContent = "";
      if (choose) choose.textContent = "Choose video";
      const picker = $("item4LibraryPicker");
      if (picker) picker.hidden = true;
    } else if (nextKind === "finished-stills") {
      if (title) title.textContent = "Drop photos";
      if (hint) hint.textContent = "";
      if (choose) choose.textContent = "Choose photos";
    } else if (nextKind === "video-clips") {
      if (title) title.textContent = "Drop clips";
      if (hint) hint.textContent = "Raw mp4/mov clips only. Studio cuts them into a Reel — not a finished file. Files over 100 MB are compressed automatically.";
      if (choose) choose.textContent = "Choose clips";
    } else if (nextKind === "photos-and-clips") {
      if (title) title.textContent = "Drop photos and clips";
      if (hint) hint.textContent = "Pick stills and clips together. Studio saves them one file at a time in the background. Files over 100 MB are compressed automatically.";
      if (choose) choose.textContent = "Choose files";
    } else if (nextKind === "multiple-photos") {
      if (title) title.textContent = "Drop photos";
      if (hint) hint.textContent = "";
      if (choose) choose.textContent = "Choose photos";
    } else if (nextKind === "single-photo") {
      if (title) title.textContent = "Drop a photo";
      if (hint) hint.textContent = "";
      if (choose) choose.textContent = "Choose photo";
    } else {
      if (title) title.textContent = "Drop photos";
      if (hint) hint.textContent = "";
      if (choose) choose.textContent = "Choose photos";
    }
    syncFinishedMediaHeadings();
    syncPrMediaKindUi();
    if (!quiet && nextKind) setRequestMessage();
  }

  function syncPrMediaKindUi() {
    const grid = $("item4MediaKindGrid");
    const hint = $("item4MediaKindHint");
    const zone = $("item4UploadZone");
    const assetCount = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets.length : 0;
    const hasAssets = assetCount > 0;
    const parsed = ezPlanApi()?.parseEzOriginNotes(activeProductionRequest?.production_notes);
    const notesText = String(activeProductionRequest?.production_notes || item4Workspace?.production_notes || "");
    const noteKind = String(parsed?.inputKind || "").trim()
      || (/ez-input=video-clips/i.test(notesText) ? "video-clips" : "")
      || (/ez-input=photos-and-clips|ez-clips=\d+/i.test(notesText) ? "photos-and-clips" : "");
    if (noteKind === "photos-and-clips" || noteKind === "video-clips" || noteKind === "finished-video" || noteKind === "finished-stills") {
      if (ezIntakeKind !== noteKind) {
        selectPrMediaKind(noteKind, { quiet: true });
        return;
      }
    }
    if (!ezIntakeKind && ["single-photo", "multiple-photos", "photos-and-clips", "video-clips"].includes(noteKind)) {
      selectPrMediaKind(noteKind, { quiet: true });
      return;
    }
    if (!ezIntakeKind && hasAssets) {
      if (ezIsClipRequest()) {
        selectPrMediaKind("photos-and-clips", { quiet: true });
        return;
      }
      ezIntakeKind = assetCount > 1 ? "multiple-photos" : "single-photo";
      document.querySelectorAll("[data-pr-input]").forEach((button) => {
        button.classList.toggle("selected", button.dataset.prInput === ezIntakeKind);
      });
    }
    item4ApplyMediaInputAccept(ezIntakeKind);
    const kindReady = Boolean(ezIntakeKind);
    if (grid) {
      grid.hidden = hasAssets;
      document.querySelectorAll("[data-pr-input]").forEach((button) => {
        button.disabled = hasAssets;
        button.classList.toggle("selected", Boolean(ezIntakeKind) && button.dataset.prInput === ezIntakeKind);
      });
    }
    if (hint) {
      hint.hidden = hasAssets;
      if (!hasAssets && !kindReady) hint.textContent = "Pick one before uploading so the platform plan matches what you intend.";
      else if (!hasAssets && ezIntakeKind === "single-photo") hint.textContent = "Single photo selected. Upload one image.";
      else if (!hasAssets) hint.textContent = "Multiple photos selected. Add photos one at a time. The set needs two or more before the platform plan.";
    }
    if (zone) zone.hidden = !kindReady && !hasAssets ? true : false;
    if (zone && kindReady) zone.hidden = false;
  }

  function goHome() {
    ezEntryPath = null;
    setPageContentSimple(false);
    hideEzFrontDoor();
    const workspace = $("productionRequestWorkspace");
    if (workspace) workspace.hidden = true;
    switchToPage("home");
  }

  function showEzFork() {
    goHome();
  }

  function enterEzContentPath() {
    ezEntryPath = "content";
    const contentPage = $("page-content");
    if (contentPage && !contentPage.classList.contains("active")) {
      switchToPage("content");
      return;
    }
    setPageContentSimple(true);
    const intake = $("ezIntake");
    const composer = $("ezComposer");
    if (intake) intake.hidden = false;
    if (composer) composer.hidden = false;
    const audio = $("ezAudioGroup");
    if (audio) audio.open = true;
    syncEzStructureCounts();
    syncEzIdeaIdentityFields();
    loadEzAudioOptions().catch(() => {});
    setTimeout(() => $("ezIdeaTitle")?.focus(), 0);
  }

  function enterEzIdeaPath() {
    ezEntryPath = "idea";
    setPageContentSimple(false);
    switchToPage("ideas");
    setIdeaFormOpen(true, { mode: "existing" });
  }

  function revokeEzLocalClipPosters() {
    ezLocalClipPosters.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    ezLocalClipPosters.clear();
  }

  function revokeEzLocalPreviews() {
    ezLocalPreviews.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    ezLocalPreviews.clear();
    revokeEzLocalClipPosters();
  }

  function item4LocalClipPoster(name) {
    return String(ezLocalClipPosters.get(String(name || "")) || "").trim();
  }

  function stageEzLocalPreviews(files) {
    revokeEzLocalPreviews();
    (files || []).forEach((file, index) => {
      const heic = item4IsHeicAsset({ name: file.name, mime_type: file.type });
      if (heic || item4FileLooksLikeVideo(file)) return;
      try {
        const url = URL.createObjectURL(file);
        ezLocalPreviews.set(index, url);
        if (file?.name) ezLocalPreviews.set(file.name, url);
      } catch {}
    });
  }

  function appendEzLocalPreview(file) {
    if (!file || item4IsHeicAsset({ name: file.name, mime_type: file.type })) return;
    if (item4FileLooksLikeVideo(file)) return;
    try {
      const url = URL.createObjectURL(file);
      if (file.name) ezLocalPreviews.set(file.name, url);
    } catch {}
  }

  function ezPersistedAssetCount() {
    return (Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [])
      .filter((asset) => asset && !String(asset.id || "").startsWith("local:")).length;
  }

  function ezPersistedKindCounts() {
    const assets = (Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [])
      .filter((asset) => asset && !String(asset.id || "").startsWith("local:"));
    let photos = 0;
    let clips = 0;
    for (const asset of assets) {
      if (item4AssetLooksLikeVideo(asset)) clips += 1;
      else photos += 1;
    }
    return { photos, clips, total: photos + clips };
  }

  function ezTargetPhotoCount() {
    const pending = ezWizardPending || ezWizardAnswers;
    const helpers = ezPlanApi();
    if (pending?.inputKind === "mixed") return helpers?.ezWizardExpectedUploads?.(pending) || 1;
    if (pending?.inputKind === "photos-and-clips") {
      return Math.max(1, Number(pending?.photoCount) || helpers?.ezWizardPhotoCount?.(pending) || 1);
    }
    if (pending?.inputKind === "multiple-photos" || ezIntakeKind === "multiple-photos") {
      return Math.max(2, Number(pending?.photoCount) || 2);
    }
    return 1;
  }

  function ezTargetClipCount() {
    const pending = ezWizardPending || ezWizardAnswers;
    return Math.max(0, Number(pending?.clipCount) || ezPlanApi()?.ezWizardClipCount?.(pending) || 0);
  }

  function ezMasterSetReadyForPlan() {
    const pending = ezWizardPending || ezWizardAnswers;
    const kind = pending?.inputKind || ezIntakeKind;
    const total = ezPersistedAssetCount();
    if (kind === "single-ai" || kind === "multiple-ai") return ezWizardAllowsPlanWithoutAssets();
    if (item4WorkspaceNeedsCompression()) return false;
    if (kind === "mixed") return total >= (ezPlanApi()?.ezWizardExpectedUploads?.(pending) || 1);
    if (kind === "photos-and-clips" || kind === "video-clips") {
      const counts = ezPersistedKindCounts();
      const wantPhotos = kind === "video-clips" ? 0 : ezTargetPhotoCount();
      const wantClips = Math.max(1, ezTargetClipCount());
      return counts.photos >= wantPhotos && counts.clips >= wantClips;
    }
    if (kind === "multiple-photos") return total >= ezTargetPhotoCount();
    return total >= 1;
  }

  function ezIncompleteSetMessage(total) {
    const pending = ezWizardPending || ezWizardAnswers;
    const kind = pending?.inputKind || ezIntakeKind;
    if (kind === "photos-and-clips" || kind === "video-clips") {
      const counts = ezPersistedKindCounts();
      const wantPhotos = kind === "video-clips" ? 0 : ezTargetPhotoCount();
      const wantClips = Math.max(1, ezTargetClipCount());
      if (counts.photos < wantPhotos || counts.clips < wantClips) {
        if (kind === "video-clips") {
          return `${counts.clips} of ${wantClips} clip${wantClips === 1 ? "" : "s"} added. Use Choose clips for the rest.`;
        }
        return `${counts.photos} of ${wantPhotos} photos and ${counts.clips} of ${wantClips} clips added. Use Choose files for the rest.`;
      }
    }
    if (kind === "mixed") {
      const expected = ezPlanApi()?.ezWizardExpectedUploads?.(pending) || 1;
      if (total < expected) {
        return `${total} of ${expected} of your photos added. Add more one at a time, or remove any you don’t want.`;
      }
    }
    if (kind === "multiple-photos") {
      const want = ezTargetPhotoCount();
      if (Number(pending?.photoCount) && total < want) {
        return `${total} of ${want} photos added. Add more one at a time, or remove any you don’t want.`;
      }
      if (total < 2) return "1 photo in the set. Add another, or remove this one.";
      if (total < want) return `${total} photos in the set. Add more one at a time, or remove any you don’t want.`;
    }
    return "";
  }

  function item4OptimisticAssetsFromFiles(files, existing = []) {
    return (files || []).map((file, index) => {
      const prior = (existing || []).find((asset) => String(asset?.name || "") === String(file?.name || "")) || {};
      return {
        ...prior,
        id: prior.id || `local:${index}`,
        order: Number(prior.order || index + 1),
        name: file.name,
        mime_type: file.type || prior.mime_type || "",
        browser_preview_compatible: prior.browser_preview_compatible
          ?? !item4IsHeicAsset({ name: file.name, mime_type: file.type }),
      };
    });
  }

  function paintItem4LocalPreviews(files, { uploading = true } = {}) {
    const incoming = Array.from(files || []);
    const existing = (Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [])
      .filter((asset) => asset && !String(asset.id || "").startsWith("local:"));
    incoming.forEach((file) => appendEzLocalPreview(file));
    ezStagedFiles = [...(Array.isArray(ezStagedFiles) ? ezStagedFiles : []), ...incoming];
    const optimisticNew = item4OptimisticAssetsFromFiles(incoming, []).map((asset, index) => ({
      ...asset,
      id: `local:${existing.length + index}`,
      order: existing.length + index + 1,
    }));
    const optimistic = {
      ...(item4Workspace || {}),
      assets: [...existing, ...optimisticNew],
      assets_status: uploading ? "Uploading" : (item4Workspace?.assets_status || "Uploading"),
    };
    item4Workspace = optimistic;
    renderItem4Assets(optimistic);
    renderItem4Variants(optimistic);
    renderEzPhotoStrip();
    updateItem4MasterProgress(optimistic);
  }

  function ezLocalPreviewFor(index, name) {
    if (/\.(mp4|mov|m4v|webm)$/i.test(String(name || ""))) return "";
    if (name && ezLocalPreviews.has(name)) return ezLocalPreviews.get(name);
    const match = ezStagedFiles.findIndex((file) => file.name === name && !item4FileLooksLikeVideo(file));
    return match >= 0 ? (ezLocalPreviews.get(name) || "") : "";
  }

  function renderEzPhotoStrip() {
    const host = $("ezPhotoStrip");
    if (!host) return;
    const files = Array.isArray(ezStagedFiles) ? ezStagedFiles : [];
    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const count = assets.length || files.length;
    if (!count) {
      host.hidden = true;
      host.innerHTML = "";
      return;
    }
    host.hidden = false;
    hydrateEzCaptionDrafts(item4Workspace || {});
    const cards = [];
    for (let index = 0; index < count; index += 1) {
      const file = files[index];
      const asset = assets[index] || {};
      const name = asset.name || file?.name || (ezIsFinishedVideo() ? `Video ${index + 1}` : `Photo ${index + 1}`);
      const id = String(asset.id || `staged:${index}`);
      const isVideo = item4FileLooksLikeVideo(file) || item4AssetLooksLikeVideo(asset);
      const localUrl = isVideo ? item4LocalClipPoster(name) : ezLocalPreviewFor(index, name);
      const remoteUrl = asset.id && !String(asset.id).startsWith("local:") ? item4AssetPreviewUrl(asset) : "";
      const previewUrl = localUrl || remoteUrl;
      const heic = item4IsHeicAsset(file || asset);
      const streamUrl = isVideo ? item4PlayableClipSrc(asset) : "";
      const visual = isVideo
        ? (item4ClipPlayerHtml({ previewUrl, streamUrl, name, durationSeconds: asset.duration_seconds, asset, preload: Boolean(streamUrl) }) || item4AssetPlaceholder(file || asset, "Clip saved"))
        : previewUrl
          ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(name)}" draggable="false">`
          : item4AssetPlaceholder(file || asset, heic ? "HEIC original" : "Preview");
      const canRemove = asset.id && !String(asset.id).startsWith("local:") && !String(asset.id).startsWith("staged:");
      const seconds = item4KnownClipDuration(asset);
      const durationNote = isVideo && seconds > 0 ? ` · ${formatLibraryClipDuration(seconds)}` : "";
      cards.push(`<article class="ez-photo-card" data-item4-asset="${escapeHtml(id)}">
        ${visual}
        <div class="item4-asset-meta"><strong>${escapeHtml(name)}</strong><span>${isVideo ? `Clip ${index + 1}` : (ezIsFinishedVideo() ? `Video ${index + 1}` : `Photo ${index + 1}`)}${durationNote}</span></div>
        ${item4CaptionField(id)}
        ${canRemove ? `<button type="button" class="item4-remove-asset" data-remove-item4-asset="${escapeHtml(asset.id)}" title="${ezIsFinishedVideo() ? "Remove this video" : "Remove this photo"}">×</button>` : ""}
      </article>`);
    }
    host.innerHTML = cards.join("");
    host.querySelectorAll("[data-remove-item4-asset]").forEach((button) => {
      button.addEventListener("click", () => removeItem4Asset(button.dataset.removeItem4Asset));
    });
    item4BindClipPlayers(host);
    bindEzCaptionInputs(host);
    productionDecorateTooltips(host);
  }

  function ensureVoiceOption(select, selectedId = DEFAULT_VOICE_ID, selectedName = DEFAULT_VOICE_NAME) {
    if (!select) return;
    const id = String(selectedId || DEFAULT_VOICE_ID).trim() || DEFAULT_VOICE_ID;
    const name = String(selectedName || DEFAULT_VOICE_NAME).trim() || DEFAULT_VOICE_NAME;
    if (![...select.options].some((option) => option.value === id)) {
      const option = document.createElement("option");
      option.value = id;
      option.dataset.name = name;
      option.textContent = name;
      select.insertAdjacentElement("afterbegin", option);
    }
    select.value = id;
  }

  function applyVoiceToSelects(voiceId, voiceName) {
    const id = String(voiceId || DEFAULT_VOICE_ID).trim() || DEFAULT_VOICE_ID;
    const name = String(voiceName || DEFAULT_VOICE_NAME).trim() || DEFAULT_VOICE_NAME;
    ensureVoiceOption($("ezAudioVoice"), id, name);
    ensureVoiceOption($("prVoice"), id, name);
    ezSelectedVoiceId = id;
  }

  function selectedRequestVoice() {
    const voiceoverOn = $("prVoiceover")?.value === "Yes" || $("ezAudioVoiceover")?.value === "Yes";
    if (!voiceoverOn) return { voice_id: "", voice_name: "" };
    const select = ($("prVoice")?.value ? $("prVoice") : null) || $("ezAudioVoice") || $("prVoice");
    const picked = phase6SelectedVoice(select);
    return {
      voice_id: picked.id || DEFAULT_VOICE_ID,
      voice_name: picked.name || DEFAULT_VOICE_NAME,
    };
  }

  function resolvedAudioMode(kind) {
    const ezId = kind === "voiceover" ? "ezAudioVoiceover" : "ezAudioMusic";
    const prId = kind === "voiceover" ? "prVoiceover" : "prMusicMode";
    const recKey = kind === "voiceover" ? "voiceover_mode" : "background_music_mode";
    const ez = String($(ezId)?.value || "");
    const pr = String($(prId)?.value || "");
    const rec = String(activeProductionRequest?.[recKey] || "");
    if (audioUserTouched.has(ezId) || audioUserTouched.has(prId)) {
      return pr === "Yes" || ez === "Yes" ? "Yes" : "No";
    }
    if (ez === "Yes" || pr === "Yes" || rec === "Yes" || rec === "Use Profile Default" || !rec) return "Yes";
    if (rec === "No" || pr === "No" || ez === "No") return "No";
    return "Yes";
  }

  function alignAudioSelect(fromEl, toEl) {
    if (!fromEl || !toEl) return;
    if (fromEl.value === "Yes") toEl.value = "Yes";
    else if (fromEl.value === "No") toEl.value = "No";
  }

  function isAudioYes(value) {
    return String(value || "").trim() === "Yes";
  }

  function syncRequestAudioUi({ fromEz = false, userChanged = false } = {}) {
    const ezVo = $("ezAudioVoiceover");
    const prVo = $("prVoiceover");
    const ezMu = $("ezAudioMusic");
    const prMu = $("prMusicMode");
    if (fromEz) {
      if (userChanged || isAudioYes(ezVo?.value) || isAudioYes(ezMu?.value)) {
        alignAudioSelect(ezVo, prVo);
        alignAudioSelect(ezMu, prMu);
      }
    } else {
      alignAudioSelect(prVo, ezVo);
      alignAudioSelect(prMu, ezMu);
    }
    if (isAudioYes(prVo?.value) && ezVo) ezVo.value = "Yes";
    if (isAudioYes(ezVo?.value) && prVo) prVo.value = "Yes";
    if (isAudioYes(prMu?.value) && ezMu) ezMu.value = "Yes";
    if (isAudioYes(ezMu?.value) && prMu) prMu.value = "Yes";

    const voiceoverOn = isAudioYes(prVo?.value) || isAudioYes(ezVo?.value);
    const musicOn = isAudioYes(prMu?.value) || isAudioYes(ezMu?.value);
    if ($("ezAudioVoiceField")) $("ezAudioVoiceField").hidden = !voiceoverOn;
    if ($("prVoiceField")) $("prVoiceField").hidden = !voiceoverOn;
    if ($("ezAudioTrackField")) $("ezAudioTrackField").hidden = !musicOn;
    if ($("prMusicField")) $("prMusicField").hidden = !musicOn;
    if (voiceoverOn) {
      const audio = $("ezAudioGroup");
      if (audio) audio.open = true;
      const source = fromEz
        ? $("ezAudioVoice")
        : (($("prVoice")?.value && $("prVoice")) || $("ezAudioVoice") || $("prVoice"));
      const picked = phase6SelectedVoice(source);
      applyVoiceToSelects(picked.id || DEFAULT_VOICE_ID, picked.name || DEFAULT_VOICE_NAME);
    } else {
      ezSelectedVoiceId = "";
    }
    if (musicOn) {
      const track = fromEz ? $("ezAudioTrack")?.value : ($("prMusicAsset")?.value || $("ezAudioTrack")?.value || "");
      if ($("ezAudioTrack") && track) $("ezAudioTrack").value = track;
      if ($("prMusicAsset") && track) $("prMusicAsset").value = track;
    } else if (userChanged) {
      if ($("ezAudioTrack")) $("ezAudioTrack").value = "";
      if ($("prMusicAsset")) $("prMusicAsset").value = "";
    }
    const audioWarning = "Music and voiceover play on vertical video (Reels, TikTok drafts, YouTube Shorts) and on the YouTube Slideshow Video that accompanies scrollable slides. They are not used on native stills such as Instagram Carousel, Facebook Multi-Image Post, or TikTok Multi-Photo.";
    ["prAudioPlatformWarning", "ezAudioPlatformWarning"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.hidden = !(voiceoverOn || musicOn);
      if (!el.hidden) el.textContent = audioWarning;
    });
  }

  function syncEzAudioFields() {
    syncRequestAudioUi({ fromEz: true });
  }

  function syncRequestVoiceUi(opts) {
    syncRequestAudioUi(opts);
  }

  function copySelectValue(fromId, toId) {
    const from = $(fromId);
    const to = $(toId);
    if (!from || !to) return;
    if (Array.from(to.options).some((option) => option.value === from.value)) to.value = from.value;
  }

  function syncEzStructureCounts() {
    const carouselMode = $("ezCarouselSlideMode")?.value;
    $("ezCarouselStructure")?.querySelectorAll(".exact-count").forEach((el) => { el.hidden = carouselMode !== "Exact"; });
    $("ezCarouselStructure")?.querySelectorAll(".range-count").forEach((el) => { el.hidden = carouselMode !== "Target range"; });
    const videoMode = $("ezVideoClipMode")?.value;
    $("ezVideoStructure")?.querySelectorAll(".exact-count").forEach((el) => { el.hidden = videoMode !== "Exact"; });
    $("ezVideoStructure")?.querySelectorAll(".range-count").forEach((el) => { el.hidden = videoMode !== "Target range"; });
  }

  function userNotesFromProductionNotes(raw) {
    const text = String(raw || "");
    const parsed = ezPlanApi()?.parseEzOriginNotes(text);
    if (!parsed) return text;
    const origin = ezPlanApi()?.ezOriginNotes({
      origin: parsed.origin,
      inputKind: parsed.inputKind,
      captionMode: parsed.captionMode,
      manualCount: parsed.manualCount,
      aiCount: parsed.aiCount,
      clipCount: parsed.clipCount,
      packageId: parsed.packageId,
    }) || "";
    if (origin && text.startsWith(origin)) return text.slice(origin.length).replace(/^\s+/, "");
    const lines = text.split(/\n/);
    if (lines[0]?.includes("origin=")) return lines.slice(1).join("\n").replace(/^\s+/, "");
    return text;
  }

  function mergeEzProductionNotes() {
    const pending = ezWizardPending || ezWizardAnswers;
    const origin = ezPlanApi()?.ezOriginNotes({
      origin: ezIsAzFinishedPath()
        ? ezPlanApi()?.EZ_ORIGIN_AZ
        : (pending?.start ? ezPlanApi()?.EZ_ORIGIN_WIZARD : undefined),
      inputKind: (ezIntakeKind === "photos-and-clips" || ezIntakeKind === "video-clips" || ezIntakeKind === "finished-video" || ezIntakeKind === "finished-stills")
        ? ezIntakeKind
        : (pending?.inputKind || ezIntakeKind || "single-photo"),
      captionMode: ezCaptionMode(),
      manualCount: pending?.manualCount,
      aiCount: pending?.aiCount,
      clipCount: pending?.clipCount || ((ezIntakeKind === "photos-and-clips" || ezIntakeKind === "video-clips") ? 1 : undefined),
      packageId: pending?.packageId || currentEzPackageId(),
    }) || "";
    const user = String($("ezProductionNotes")?.value || "").trim();
    const combined = user ? `${origin}\n\n${user}` : origin;
    if ($("prProductionNotes")) $("prProductionNotes").value = combined;
    return combined;
  }

  function ezTitleIsCustomized() {
    const mode = $("ezTitleMode")?.value || "AI decides";
    const text = String($("ezRequestedTitle")?.value || "").trim();
    return mode !== "AI decides" || Boolean(text);
  }

  function ezScriptIsCustomized() {
    const mode = $("ezScriptMode")?.value || "AI decides";
    const text = String($("ezRequestedScript")?.value || "").trim();
    return mode !== "AI decides" || Boolean(text);
  }

  function ezCaptionIsCustomized() {
    const mode = $("ezCaptionMode")?.value || "AI decides";
    const text = String($("ezRequestedCaption")?.value || "").trim();
    return mode !== "AI decides" || Boolean(text);
  }

  function ezFieldDirty(...ids) {
    return ids.some((id) => ezDirty.has(id));
  }

  function applyEzToAdvanced({ force = false } = {}) {
    const take = (...ids) => force || ezFieldDirty(...ids);
    if (take("ezTitleMode", "ezRequestedTitle")) {
      copySelectValue("ezTitleMode", "prTitleMode");
      if ($("prRequestedTitle")) $("prRequestedTitle").value = $("ezRequestedTitle")?.value || "";
    }
    if ($("ezTitle")) $("ezTitle").value = String(($("ezRequestedTitle")?.value || $("prRequestedTitle")?.value || "")).trim().slice(0, 160);
    if (take("ezCaptionMode", "ezRequestedCaption")) {
      copySelectValue("ezCaptionMode", "prCaptionMode");
      if ($("prRequestedCaption")) $("prRequestedCaption").value = $("ezRequestedCaption")?.value || "";
    }
    if (take("ezScriptMode", "ezRequestedScript")) {
      copySelectValue("ezScriptMode", "prScriptMode");
      if ($("prRequestedScript")) $("prRequestedScript").value = $("ezRequestedScript")?.value || "";
    }
    if (take("ezThumbnail")) copySelectValue("ezThumbnail", "prThumbnail");
    if (take("ezVoiceoverTail") && $("prVoiceoverTail") && $("ezVoiceoverTail")) {
      $("prVoiceoverTail").value = $("ezVoiceoverTail").value;
    }
    if (take("ezVideoDuration") && $("prVideoDuration") && $("ezVideoDuration")) {
      $("prVideoDuration").value = $("ezVideoDuration").value;
    }
    if (take("ezVoiceoverDuration") && $("prVoiceoverDuration") && $("ezVoiceoverDuration")) {
      $("prVoiceoverDuration").value = $("ezVoiceoverDuration").value;
    }
    if (take("ezMusicStart") && $("prMusicStart") && $("ezMusicStart")) {
      $("prMusicStart").value = $("ezMusicStart").value;
    }
    if (take("ezVideoClipMode", "ezVideoClipExact", "ezVideoClipMin", "ezVideoClipMax")) {
      copySelectValue("ezVideoClipMode", "prVideoClipMode");
      if ($("prVideoClipExact")) $("prVideoClipExact").value = $("ezVideoClipExact")?.value || "";
      if ($("prVideoClipMin")) $("prVideoClipMin").value = $("ezVideoClipMin")?.value || "";
      if ($("prVideoClipMax")) $("prVideoClipMax").value = $("ezVideoClipMax")?.value || "";
    }
    if (take("ezCarouselSlideMode", "ezCarouselSlideExact", "ezCarouselSlideMin", "ezCarouselSlideMax", "ezCarouselImageMode")) {
      copySelectValue("ezCarouselSlideMode", "prCarouselSlideMode");
      if ($("prCarouselSlideExact")) $("prCarouselSlideExact").value = $("ezCarouselSlideExact")?.value || "";
      if ($("prCarouselSlideMin")) $("prCarouselSlideMin").value = $("ezCarouselSlideMin")?.value || "";
      if ($("prCarouselSlideMax")) $("prCarouselSlideMax").value = $("ezCarouselSlideMax")?.value || "";
      copySelectValue("ezCarouselImageMode", "prCarouselImageMode");
    }
    if (take("ezPrimaryLocation") && $("prPrimaryLocation") && $("ezPrimaryLocation")) {
      $("prPrimaryLocation").value = $("ezPrimaryLocation").value;
    }
    if (force || ezFieldDirty("ezProductionNotes") || usingEzPlatforms() || ezEntryPath === "content") {
      mergeEzProductionNotes();
    }
    syncEzStructureCounts();
    if ($("prVideoClipMode") && $("prCarouselSlideMode")) syncAllStructureControls();
  }

  function syncEzConfigFields() {
    applyEzToAdvanced();
  }

  function hydrateEzOutputsFromMatrix() {
    document.querySelectorAll("[data-ez-output]").forEach((input) => {
      const match = outputMatrixInputs().find((row) => row.dataset.platform === input.dataset.platform && row.value === input.value);
      if (match) input.checked = match.checked;
    });
  }

  function ezExtraOutputSnapshot() {
    const recommended = new Set(
      ezSelectedPlatforms().map((platform) => `${platform}::${recommendedOutputFor(platform)}`)
    );
    const checked = Array.from(document.querySelectorAll("[data-ez-output]:checked"))
      .map((input) => `${input.dataset.platform}::${input.value}`)
      .filter((key) => !recommended.has(key) && key !== "TikTok::Story");
    ezPinnedExtraOutputs = checked;
    return checked;
  }

  function applyEzExtraOutputs(keys = ezPinnedExtraOutputs) {
    (Array.isArray(keys) ? keys : []).forEach((key) => {
      const [platform, ...rest] = String(key).split("::");
      const outputType = rest.join("::");
      const match = outputMatrixInputs().find((row) => row.dataset.platform === platform && row.value === outputType);
      if (match) match.checked = true;
    });
    hydrateEzOutputsFromMatrix();
    if ($("prOutputMatrixSummary")) updateOutputMatrixSummary();
  }

  function hydrateEzConfigFromRequest(record = activeProductionRequest) {
    ezDirty.clear();
    audioUserTouched.clear();
    if (!record) {
      syncEzStructureCounts();
      return;
    }
    if ($("ezAudioVoiceover")) {
      $("ezAudioVoiceover").value = record.voiceover_mode === "No" ? "No" : "Yes";
    }
    if (record.voiceover_mode === "Yes") {
      applyVoiceToSelects(record.voice_id || DEFAULT_VOICE_ID, record.voice_name || DEFAULT_VOICE_NAME);
    }
    if ($("ezAudioMusic")) {
      $("ezAudioMusic").value = record.background_music_mode === "No" ? "No" : "Yes";
    }
    const musicId = Array.isArray(record.selected_music_asset_links) ? record.selected_music_asset_links[0] : "";
    if ($("ezAudioTrack") && musicId) $("ezAudioTrack").value = musicId;
    syncRequestAudioUi({ fromEz: false });
    if ($("ezTitleMode")) setSelectValue("ezTitleMode", record.title_mode, "AI decides");
    if ($("ezRequestedTitle")) $("ezRequestedTitle").value = String(record.requested_title || "").trim();
    if ($("ezTitle")) $("ezTitle").value = String(record.requested_title || "").trim().slice(0, 160);
    if ($("ezCaptionMode")) setSelectValue("ezCaptionMode", record.caption_mode, "AI decides");
    if ($("ezRequestedCaption")) $("ezRequestedCaption").value = String(record.requested_caption || "").trim();
    if ($("ezScriptMode")) setSelectValue("ezScriptMode", record.script_mode, "AI decides");
    if ($("ezRequestedScript")) $("ezRequestedScript").value = record.requested_script || "";
    if ($("ezThumbnail")) setSelectValue("ezThumbnail", record.thumbnail_mode, "Yes");
    if ($("ezVoiceoverTail")) $("ezVoiceoverTail").value = record.voiceover_tail_seconds ?? 15;
    if ($("ezVoiceoverDuration")) $("ezVoiceoverDuration").value = record.voiceover_duration_seconds ?? defaultVoiceoverDuration(record.video_duration_seconds ?? 30);
    if ($("ezMusicStart")) $("ezMusicStart").value = record.music_start_seconds ?? 0;
    if ($("ezVideoDuration")) $("ezVideoDuration").value = record.video_duration_seconds ?? 30;
    if ($("ezVideoClipMode")) setSelectValue("ezVideoClipMode", record.video_clip_count_mode, "AI decides");
    if ($("ezVideoClipExact")) $("ezVideoClipExact").value = record.video_clip_count_exact ?? "";
    if ($("ezVideoClipMin")) $("ezVideoClipMin").value = record.video_clip_count_min ?? "";
    if ($("ezVideoClipMax")) $("ezVideoClipMax").value = record.video_clip_count_max ?? "";
    if ($("ezCarouselSlideMode")) setSelectValue("ezCarouselSlideMode", record.carousel_slide_count_mode, "AI decides");
    if ($("ezCarouselSlideExact")) $("ezCarouselSlideExact").value = record.carousel_slide_count_exact ?? "";
    if ($("ezCarouselSlideMin")) $("ezCarouselSlideMin").value = record.carousel_slide_count_min ?? "";
    if ($("ezCarouselSlideMax")) $("ezCarouselSlideMax").value = record.carousel_slide_count_max ?? "";
    if ($("ezCarouselImageMode")) setSelectValue("ezCarouselImageMode", record.carousel_image_mode, "Manual Upload");
    if ($("ezProductionNotes")) $("ezProductionNotes").value = userNotesFromProductionNotes(record.production_notes);
    hydratePrimaryLocationFromSources({ record, idea: activeIdea, force: false });
    syncEzStructureCounts();
    hydrateEzOutputsFromMatrix();
  }

  function queueEzConfigSave() {
    syncRequestAudioUi({ fromEz: false });
    syncEzConfigFields();
    if (!activeProductionRequest?.id) return;
    clearTimeout(ezConfigSaveTimer);
    ezConfigSaveTimer = setTimeout(() => {
      saveActiveProductionRequest({ quiet: true }).catch(() => {});
    }, 400);
  }

  async function loadEzAudioOptions() {
    const track = $("ezAudioTrack");
    const musicJob = ensureProductionRequestMusic().then(() => {
      const source = $("prMusicAsset");
      if (track && source) track.innerHTML = source.innerHTML;
    }).catch(() => {});
    const voiceJob = (async () => {
      const voiceSelect = $("ezAudioVoice");
      const prVoice = $("prVoice");
      const hint = $("ezAudioVoiceHint");
      const prHint = $("prVoiceHint");
      if (hint) hint.textContent = "Loading ElevenLabs voices…";
      if (prHint) prHint.textContent = "Loading ElevenLabs voices…";
      const result = await api("/api/voices", { timeoutMs: 45000 });
      const voices = phase6NormalizeVoices(result.voices || result.records || result.items || []);
      const current = ezSelectedVoiceId || voiceSelect?.value || prVoice?.value || DEFAULT_VOICE_ID;
      const options = phase6VoiceOptionList(voices, current || DEFAULT_VOICE_ID, DEFAULT_VOICE_NAME);
      if (voiceSelect) voiceSelect.innerHTML = options;
      if (prVoice) prVoice.innerHTML = options;
      const selected = phase6SelectedVoice(voiceSelect || prVoice);
      applyVoiceToSelects(selected.id || current || DEFAULT_VOICE_ID, selected.name || DEFAULT_VOICE_NAME);
      const hintText = voices.length && result.live_connected
        ? `${voices.length} ElevenLabs voices`
        : voices.length
          ? (result.live_error ? `${voices.length} cached voices · ${result.live_error}` : `${voices.length} cached voices`)
          : result.live_error
            ? result.live_error
            : (result.live_configured === false
              ? "Add the ElevenLabs API key to load the full voice catalog."
              : "No ElevenLabs voices returned.");
      if (hint) hint.textContent = hintText;
      if (prHint) prHint.textContent = hintText;
    })().catch(() => {
      if ($("ezAudioVoiceHint")) $("ezAudioVoiceHint").textContent = "Could not load ElevenLabs voices.";
      if ($("prVoiceHint")) $("prVoiceHint").textContent = "Could not load ElevenLabs voices.";
    });
    await Promise.all([musicJob, voiceJob]);
    if (ezEntryPath === "content") syncRequestAudioUi({ fromEz: false });
    else syncRequestVoiceUi({ fromEz: false });
  }

  function hydrateEzCaptionDrafts(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    assets.forEach((asset, index) => {
      const id = String(asset?.id || "");
      const staged = ezCaptionDrafts.get(`staged:${index}`);
      const stagedMode = ezCaptionModes.get(`staged:${index}`);
      if (id && staged && !ezCaptionDrafts.has(id)) ezCaptionDrafts.set(id, staged);
      if (id && stagedMode && !ezCaptionModes.has(id)) ezCaptionModes.set(id, stagedMode);
      const savedMode = String(asset?.caption_mode || "").trim().toLowerCase();
      if (id && savedMode && !ezCaptionModes.has(id)) ezCaptionModes.set(id, savedMode);
      if (id && asset?.caption && !ezCaptionDrafts.has(id)) ezCaptionDrafts.set(id, String(asset.caption));
    });
  }

  function item4RequestEditable(record = activeProductionRequest) {
    return ["Draft", "Ready", ""].includes(String(record?.status || "Draft"));
  }

  function ezCaptionsLocked() {
    return !item4RequestEditable();
  }

  function syncEzCaptionLock() {
    const locked = ezCaptionsLocked();
    document.querySelectorAll("[data-ez-asset-caption]").forEach((input) => {
      input.readOnly = locked;
      input.disabled = false;
    });
    document.querySelectorAll("[data-ez-caption-mode]").forEach((input) => {
      input.disabled = locked;
    });
  }

  function item4CaptionField(assetId) {
    if (ezIsFinishedVideo()) return "";
    const id = String(assetId || "");
    if (!id) return "";
    const mode = ezCaptionModeFor(id);
    const value = ezCaptionDrafts.get(id) || "";
    const locked = ezCaptionsLocked();
    const lockAttr = locked ? " disabled" : "";
    return `<div class="item4-asset-caption-field item4-variant-caption">
      <label><span>On-photo caption</span>
        <select data-ez-caption-mode="${escapeHtml(id)}"${lockAttr}>
          <option value="ai"${mode === "ai" ? " selected" : ""}>AI</option>
          <option value="manual"${mode === "manual" ? " selected" : ""}>Manual</option>
          <option value="none"${mode === "none" ? " selected" : ""}>None</option>
        </select>
      </label>
      <textarea data-ez-asset-caption="${escapeHtml(id)}" rows="2" maxlength="2000" placeholder="Label this photo. This is not the post caption."${mode === "manual" ? "" : " hidden"}${locked ? " readonly" : ""}>${escapeHtml(value)}</textarea>
      ${mode === "ai" ? "<em>AI writes a short on-photo label for this still when the video is built.</em>" : ""}
      ${locked ? "<em>Locked after promote</em>" : ""}
    </div>`;
  }

  function syncEzCaptionModeUi(assetId, mode) {
    const id = String(assetId || "");
    const next = String(mode || ezCaptionModeFor(id) || "ai");
    if (id) ezCaptionModes.set(id, next);
    document.querySelectorAll(`[data-ez-caption-mode="${CSS.escape(id)}"]`).forEach((select) => {
      if (select.value !== next) select.value = next;
    });
    document.querySelectorAll(`[data-ez-asset-caption="${CSS.escape(id)}"]`).forEach((box) => {
      box.hidden = next !== "manual";
    });
  }

  function bindEzCaptionInputs(root = document) {
    root.querySelectorAll("[data-ez-caption-mode]").forEach((select) => {
      if (select.dataset.ezCaptionBound) return;
      select.dataset.ezCaptionBound = "1";
      select.addEventListener("change", () => {
        const id = String(select.dataset.ezCaptionMode || "");
        const mode = String(select.value || "ai");
        syncEzCaptionModeUi(id, mode);
        const box = select.closest(".item4-asset-caption-field")?.querySelector("[data-ez-asset-caption]");
        if (box && mode === "manual" && !ezCaptionsLocked()) box.focus();
        if (mode === "manual") return;
        queueEzCaptionSave();
      });
    });
    root.querySelectorAll("[data-ez-asset-caption]").forEach((input) => {
      if (input.dataset.ezCaptionBound) return;
      input.dataset.ezCaptionBound = "1";
      ["pointerdown", "mousedown", "click"].forEach((type) => {
        input.addEventListener(type, (event) => event.stopPropagation());
      });
      input.addEventListener("input", () => {
        const id = String(input.dataset.ezAssetCaption || "");
        ezCaptionDrafts.set(id, input.value);
        document.querySelectorAll(`[data-ez-asset-caption="${CSS.escape(id)}"]`).forEach((other) => {
          if (other !== input) other.value = input.value;
        });
        queueEzCaptionSave();
      });
    });
    syncEzCaptionLock();
    if (detachLeakedPostCaption()) queueEzCaptionSave();
  }

  function syncEzPlanChrome() {
    const button = $("item4BuildPlan");
    const hint = $("item4PlanHint");
    const ez = ezIsOriginRecord() || ezStarting || ezAutoPlanAfterUpload;
    const planReady = item4Workspace?.plan_status === "Ready" && Boolean(item4Workspace?.plan?.items?.length);
    const hasAssets = Boolean(item4Workspace?.assets?.length);
    if (button) {
      button.hidden = false;
      button.textContent = planReady ? "Update formats" : "Recommend formats";
      button.disabled = !hasAssets || item4Uploading || ezPlanInFlight || item4WorkspaceNeedsCompression();
    }
    if (!hint) return;
    if (ezPlanInFlight) {
      hint.textContent = "Studio is building the platform plan.";
      return;
    }
    if (planReady) {
      hint.textContent = "Formats are saved. Change one and tap Update formats if needed.";
      return;
    }
    if (hasAssets && !ezMasterSetReadyForPlan()) {
      hint.textContent = item4WorkspaceNeedsCompression()
        ? item4CompressionProgressLabel()
        : (ezIncompleteSetMessage(ezPersistedAssetCount())
          || "Add the rest of the set, or tap Recommend formats to plan with what you have.");
      return;
    }
    if (hasAssets) {
      hint.textContent = ez
        ? "Tap Recommend formats to suggest Instagram, Facebook, TikTok, and YouTube."
        : "Ready to recommend the best format for each selected platform.";
      return;
    }
    hint.textContent = "Add photos first, then get a plan.";
  }

  async function maybeAutoEzPlan(force = false) {
    if (ezIsAzFinishedPath()) return;
    if (!activeProductionRequest?.id) return;
    if (!ezIsOriginRecord() && !ezAutoPlanAfterUpload && !ezStarting) return;
    if (!item4Workspace?.assets?.length && !ezWizardAllowsPlanWithoutAssets()) return;
    if (!ezMasterSetReadyForPlan()) return;
    if (!force && item4Workspace?.plan_status === "Ready" && item4Workspace?.plan?.items?.length) {
      ezAutoPlanAfterUpload = false;
      syncEzPlanChrome();
      return;
    }
    if (ezPlanInFlight) return;
    ezPlanInFlight = true;
    ezAutoPlanAfterUpload = false;
    const extras = ezExtraOutputSnapshot();
    try {
      setEzMessage("Building the platform plan…");
      await buildItem4Plan();
      applyEzExtraOutputs(extras);
      item4DropUnsupportedStoryChecks(false);
      if (extras.filter((key) => key !== "TikTok::Story").length) await saveProductionRequestOutputs(activeProductionRequest);
      setEzMessage("Platform plan ready.", "success");
    } catch (error) {
      setEzMessage(error.message || "Could not build the platform plan.", "error-text");
    } finally {
      ezPlanInFlight = false;
      syncEzPlanChrome();
    }
  }

  function renderEzPerPhotoCaptions() {
    const host = $("ezPerPhotoCaptions");
    if (host) {
      host.hidden = true;
      host.innerHTML = "";
    }
  }

  function collectEzSlideCaptionRecords() {
    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const ids = assets.map((asset) => String(asset?.id || "")).filter(Boolean);
    document.querySelectorAll("[data-ez-caption-mode]").forEach((select) => {
      const id = String(select.dataset.ezCaptionMode || "");
      if (id) ezCaptionModes.set(id, String(select.value || "ai"));
    });
    document.querySelectorAll("[data-ez-asset-caption]").forEach((input) => {
      const id = String(input.dataset.ezAssetCaption || "");
      if (id) ezCaptionDrafts.set(id, input.value);
    });
    const ordered = ids.length ? ids : Array.from(new Set([
      ...Array.from(ezCaptionModes.keys()),
      ...Array.from(ezCaptionDrafts.keys()),
    ]));
    return ordered.map((id) => ({
      id,
      mode: ezCaptionModeFor(id),
      text: String(ezCaptionDrafts.get(id) || "").trim(),
    }));
  }

  function joinedManualSlideCaptions() {
    return collectEzSlideCaptionRecords()
      .filter((row) => row.mode === "manual" && row.text)
      .map((row) => row.text);
  }

  function detachLeakedPostCaption() {
    if (ezSlideCaptionHealDone) return false;
    const manuals = joinedManualSlideCaptions();
    if (manuals.length < 2) return false;
    const post = String($("prRequestedCaption")?.value || "").trim();
    if (!post || (post !== manuals.join("\n\n") && post !== manuals.join("\n"))) return false;
    if ($("prCaptionMode")) $("prCaptionMode").value = "AI decides";
    if ($("prRequestedCaption")) $("prRequestedCaption").value = "";
    ezSlideCaptionHealDone = true;
    return true;
  }

  function queueEzCaptionSave() {
    clearTimeout(ezCaptionSaveTimer);
    ezCaptionSaveTimer = setTimeout(() => {
      saveEzCaptionsToRequest().catch((error) => {
        const message = String(error?.message || "Could not save the caption.");
        if (/enter a caption/i.test(message)) return;
        setEzMessage(
          /request failed \(5\d\d\)/i.test(message)
            ? "Couldn't save that caption yet. Your photos are still here — try typing again in a moment."
            : message,
          "error-text"
        );
      });
    }, 700);
  }

  function ezControlValue(id, fallback = "") {
    const value = $(id)?.value;
    if (value === null || value === undefined || String(value).trim() === "") return fallback;
    return value;
  }

  function ezCaptionSavePayload(captionFields) {
    syncRequestAudioUi({ fromEz: false });
    syncEzConfigFields();
    const record = activeProductionRequest || {};
    const requestedPlatforms = selectedRequestPlatforms();
    const recordPlatforms = Array.isArray(record.platforms) ? record.platforms : [];
    const payload = {
      content_type: syncHiddenMasterContentType() || ezControlValue("prContentType", record.content_type || "Photo Set"),
      platforms: requestedPlatforms.length ? requestedPlatforms : (recordPlatforms.length ? recordPlatforms : item4SelectedPlatforms()),
      voiceover_mode: ezControlValue("prVoiceover", record.voiceover_mode || "Yes"),
      background_music_mode: ezControlValue("prMusicMode", record.background_music_mode || "Yes"),
      thumbnail_mode: ezControlValue("prThumbnail", record.thumbnail_mode || "Yes"),
      video_duration_seconds: ezControlValue("prVideoDuration", record.video_duration_seconds ?? 30),
      video_clip_count_mode: ezControlValue("prVideoClipMode", record.video_clip_count_mode || "AI decides"),
      video_clip_count_exact: ezControlValue("prVideoClipExact", record.video_clip_count_exact ?? ""),
      video_clip_count_min: ezControlValue("prVideoClipMin", record.video_clip_count_min ?? ""),
      video_clip_count_max: ezControlValue("prVideoClipMax", record.video_clip_count_max ?? ""),
      carousel_slide_count_mode: ezControlValue("prCarouselSlideMode", record.carousel_slide_count_mode || "Exact"),
      carousel_slide_count_exact: ezControlValue("prCarouselSlideExact", record.carousel_slide_count_exact ?? ""),
      carousel_slide_count_min: ezControlValue("prCarouselSlideMin", record.carousel_slide_count_min ?? ""),
      carousel_slide_count_max: ezControlValue("prCarouselSlideMax", record.carousel_slide_count_max ?? ""),
      carousel_image_mode: ezControlValue("prCarouselImageMode", record.carousel_image_mode || "Manual Upload"),
      voiceover_tail_seconds: ezControlValue("prVoiceoverTail", record.voiceover_tail_seconds ?? 15),
      voiceover_duration_seconds: ezControlValue("prVoiceoverDuration", record.voiceover_duration_seconds ?? defaultVoiceoverDuration(record.video_duration_seconds ?? 30)),
      music_start_seconds: ezControlValue("prMusicStart", record.music_start_seconds ?? 0),
      selected_music_asset_id: ezControlValue(
        "prMusicAsset",
        Array.isArray(record.selected_music_asset_links) ? (record.selected_music_asset_links[0] || "") : ""
      ),
      title_mode: ezControlValue("prTitleMode", captionFields.title_mode || "AI decides"),
      requested_title: String($("prRequestedTitle")?.value || captionFields.requested_title || "").trim(),
      caption_mode: captionFields.caption_mode || "AI decides",
      requested_caption: captionFields.requested_caption || "",
      script_mode: ezControlValue("prScriptMode", captionFields.script_mode || record.script_mode || "AI decides"),
      requested_script: String($("prRequestedScript")?.value || captionFields.requested_script || record.requested_script || ""),
      primary_location: currentPrimaryLocationValue() || record.primary_location || "",
      production_notes: mergeEzProductionNotes() || captionFields.production_notes || record.production_notes || "",
      ...selectedRequestVoice(),
    };
    if (payload.video_clip_count_mode === "Exact" && String(payload.video_clip_count_exact).trim() === "") {
      payload.video_clip_count_mode = "AI decides";
      payload.video_clip_count_exact = "";
    }
    if (payload.carousel_slide_count_mode === "Exact" && String(payload.carousel_slide_count_exact).trim() === "") {
      payload.carousel_slide_count_exact = item4Workspace?.assets?.length || ezStagedFiles.length || 2;
    }
    if (payload.caption_mode === "Leave blank" || captionFields.mode === "none") {
      const none = captionFields.live_fallback || {
        title_mode: "Force exact",
        requested_title: " ",
        caption_mode: "Force exact",
        requested_caption: " ",
        script_mode: "AI decides",
        requested_script: "",
      };
      payload.caption_mode = none.caption_mode;
      payload.requested_caption = none.requested_caption;
      if (!ezTitleIsCustomized()) {
        payload.title_mode = none.title_mode;
        payload.requested_title = none.requested_title;
      }
      if (!ezScriptIsCustomized()) {
        payload.script_mode = none.script_mode;
        payload.requested_script = none.requested_script;
      }
      payload.production_notes = mergeEzProductionNotes();
    }
    return payload;
  }

  async function saveEzCaptionsToRequest() {
    if (!activeProductionRequest?.id || ezStarting) return;
    detachLeakedPostCaption();
    const payload = productionRequestPayload();
    payload.slide_captions = collectEzSlideCaptionRecords();
    if (!payload.slide_captions.length) return;
    const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (result.record) {
      activeProductionRequest = {
        ...result.record,
        title_mode: $("prTitleMode")?.value || result.record.title_mode,
        requested_title: $("prRequestedTitle")?.value ?? result.record.requested_title,
        caption_mode: $("prCaptionMode")?.value || result.record.caption_mode,
        requested_caption: $("prRequestedCaption")?.value ?? result.record.requested_caption,
        script_mode: $("prScriptMode")?.value || result.record.script_mode,
        requested_script: $("prRequestedScript")?.value ?? result.record.requested_script,
        voiceover_tail_seconds: $("prVoiceoverTail")?.value || result.record.voiceover_tail_seconds,
      };
    }
  }

  function renderEzCaptionUi() {
    const mode = ezCaptionMode();
    const hint = $("ezCaptionHint");
    if (hint) {
      if (mode === "manual") hint.textContent = "Write a caption under each photo. Studio saves as you type.";
      else if (mode === "none") hint.textContent = "No AI text and no overlay titles.";
      else hint.textContent = "Studio writes the post caption. On-photo labels under each crop stay on that photo only.";
    }
    renderEzPerPhotoCaptions();
    renderEzPhotoStrip();
    const continueBtn = $("ezContinue");
    if (continueBtn) continueBtn.hidden = true;
    if (item4Workspace?.assets?.length) renderItem4Assets(item4Workspace);
  }

  function syncEzYouTubeAvailability(resetChecked = true) {
    const youtube = $("ezYouTube");
    const packageId = currentEzPackageId();
    const youtubeOn = packageId === "video"
      || (packageId === "slides" && (ezIntakeKind === "multiple-photos" || ezIntakeKind === "finished-stills"))
      || (!packageId && (ezIntakeKind === "multiple-photos" || ezIntakeKind === "photos-and-clips" || ezIntakeKind === "video-clips" || ezIntakeKind === "finished-video" || ezIntakeKind === "finished-stills"));
    if (!youtube) return;
    youtube.disabled = !youtubeOn;
    if (!youtubeOn) youtube.checked = false;
    else if (resetChecked) youtube.checked = true;
  }

  function selectEzPackage(packageId, { resetPlatforms = true } = {}) {
    const next = String(packageId || "").trim().toLowerCase();
    if (next !== "video" && next !== "slides") return;
    ezWizardAnswers = { ...ezWizardAnswers, packageId: next };
    if (ezWizardPending) ezWizardPending = { ...ezWizardPending, packageId: next };
    document.querySelectorAll("[data-ez-package]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.ezPackage === next);
    });
    const count = ezPlanApi()?.ezWizardPhotoCount?.(ezWizardAnswers) || item4Workspace?.assets?.length || ezStagedFiles.length || 1;
    applyEzPlanOverrides(count, ezSelectedPlatforms());
    if (next === "video") {
      ezPinnedExtraOutputs = ezPlanApi()?.EZ_VIDEO_STORY_EXTRAS || ["Instagram::Story", "Facebook::Story"];
      applyEzExtraOutputs(ezPinnedExtraOutputs);
    } else {
      ezPinnedExtraOutputs = [];
    }
    syncEzYouTubeAvailability(resetPlatforms);
    if (resetPlatforms) syncItem4PlatformsFromEz();
  }

  function selectEzInput(kind, { resetPlatforms = true } = {}) {
    const nextKind = ["multiple-photos", "single-photo", "photos-and-clips", "video-clips", "finished-video", "finished-stills"].includes(kind)
      ? kind
      : "single-photo";
    if (resetPlatforms && ezIntakeKind && ezIntakeKind !== nextKind) {
      ezStagedFiles = [];
      revokeEzLocalPreviews();
      renderEzPhotoStrip();
    }
    ezIntakeKind = nextKind;
    document.querySelectorAll("[data-ez-input]").forEach((button) => {
      button.classList.toggle("selected", button.dataset.ezInput === ezIntakeKind);
    });
    const composer = $("ezComposer");
    if (composer) composer.hidden = false;
    item4ApplyMediaInputAccept(ezIntakeKind);
    const title = $("ezUploadTitle");
    const hint = $("ezUploadHint");
    const choose = $("ezChooseMedia");
    if (choose) {
      if (ezIntakeKind === "finished-video") choose.textContent = "Choose video";
      else if (ezIntakeKind === "video-clips") choose.textContent = "Choose clips";
      else if (ezIntakeKind === "photos-and-clips") choose.textContent = "Choose files";
      else if (ezIntakeKind === "single-photo") choose.textContent = "Choose photo";
      else choose.textContent = "Choose photos";
    }
    if (ezIntakeKind === "finished-video") {
      if (title) title.textContent = "Drop the finished video here";
      if (hint) hint.textContent = "One MP4. Studio skips crops and Remotion.";
    } else if (ezIntakeKind === "finished-stills") {
      if (title) title.textContent = "Drop finished photos here";
      if (hint) hint.textContent = "Finished stills. No on-image lettering.";
    } else if (ezIntakeKind === "video-clips") {
      if (title) title.textContent = "Drop clips here";
      if (hint) hint.textContent = "Raw mp4/mov clips only. Order them here. Studio cuts them into a Reel — not a finished file.";
    } else if (ezIntakeKind === "photos-and-clips") {
      if (title) title.textContent = "Drop photos and clips here";
      if (hint) hint.textContent = "Pick stills and clips together. Studio saves them one file at a time in the background.";
    } else if (ezIntakeKind === "multiple-photos") {
      if (title) title.textContent = "Drop photos here";
      if (hint) hint.textContent = "Add or remove one at a time. They show up here immediately.";
    } else {
      if (title) title.textContent = "Drop one photo here";
      if (hint) hint.textContent = "Drop one photo. It shows up here immediately.";
    }
    selectPrMediaKind(nextKind, { quiet: true });
    syncFinishedMediaHeadings();
    const slidesCard = document.querySelector('[data-ez-package="slides"]');
    const videoOnlyInput = nextKind === "photos-and-clips" || nextKind === "video-clips" || nextKind === "finished-video";
    if (slidesCard) slidesCard.hidden = videoOnlyInput;
    if (videoOnlyInput && currentEzPackageId() !== "video") {
      selectEzPackage("video", { resetPlatforms: false });
    }
    syncEzYouTubeAvailability(resetPlatforms);
    if (resetPlatforms) syncItem4PlatformsFromEz();
    renderEzCaptionUi();
    if (resetPlatforms) setEzMessage();
  }

  function ezIdeaTitleValue() {
    return String($("ezIdeaTitle")?.value || $("ezTitle")?.value || "").trim();
  }

  function userIdeaSummaryFromStored(raw) {
    const text = String(raw || "").trim();
    if (!text) return "";
    const origin = ezPlanApi()?.ezIdeaSummary({ inputKind: ezIntakeKind }) || "";
    if (origin && text === origin) return "";
    if (origin && text.endsWith(origin)) return text.slice(0, -origin.length).replace(/\s+$/, "");
    return text.replace(/\n*Created from New content[^\n]*\.?/g, "").trim();
  }

  function ezIdeaSummaryValue(inputKind = ezIntakeKind) {
    const user = String($("ezIdeaSummary")?.value || "").trim();
    const origin = ezPlanApi()?.ezIdeaSummary({ inputKind }) || "";
    return user ? `${user}\n\n${origin}` : origin;
  }

  function syncEzIdeaIdentityFields() {
    const title = ezIdeaTitleValue();
    if ($("ezTitle")) $("ezTitle").value = title.slice(0, 160);
    const heading = $("productionRequestTitle");
    if (heading && title) heading.textContent = title;
    ["ezIdeaTitle", "ezIdeaSummary"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.readOnly = false;
      el.disabled = false;
    });
  }

  function setEzIdeaIdentityHint(text = "You can edit these anytime. Photos do not lock the name.", type = "") {
    const hint = $("ezIdeaIdentityHint");
    if (!hint) return;
    hint.textContent = text;
    hint.className = `ez-option-hint${type ? ` ${type}` : ""}`;
  }

  async function saveEzIdeaIdentity() {
    syncEzIdeaIdentityFields();
    if (!activeIdea?.id) return;
    const title = ezIdeaTitleValue() || activeIdea.title || "New photo";
    setEzIdeaIdentityHint("Saving…");
    const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`, {
      method: "PATCH",
      body: JSON.stringify({
        title: title.slice(0, 160),
        summary: ezIdeaSummaryValue(),
      }),
    });
    if (result.record) activeIdea = result.record;
    setEzIdeaIdentityHint("Saved. You can keep editing.");
  }

  function queueEzIdeaIdentitySave() {
    syncEzIdeaIdentityFields();
    if (!activeIdea?.id) {
      setEzIdeaIdentityHint("This name is saved when the photos land.");
      return;
    }
    clearTimeout(ezIdeaIdentitySaveTimer);
    setEzIdeaIdentityHint("Saving…");
    ezIdeaIdentitySaveTimer = setTimeout(() => {
      saveEzIdeaIdentity().catch((error) => {
        setEzIdeaIdentityHint(error?.message || "Could not save the title yet.", "error-text");
      });
    }, 400);
  }

  function titleFromFiles(files) {
    const typed = ezIdeaTitleValue();
    if (typed) return typed.slice(0, 160);
    const name = String(files[0]?.name || "New photo").replace(/\.[^.]+$/, "").trim();
    return (name || "New photo").slice(0, 160);
  }

  async function createEzProductionRequest(ideaId, payload) {
    try {
      return await api("/api/production-requests", { method: "POST", body: JSON.stringify({ idea_record_id: ideaId, ...payload }) });
    } catch (error) {
      if (payload.caption_mode !== "Leave blank") throw error;
      const fallback = ezPlanApi()?.ezCaptionFields("none")?.live_fallback || {
        title_mode: "Force exact",
        requested_title: " ",
        caption_mode: "Force exact",
        requested_caption: " ",
      };
      return await api("/api/production-requests", {
        method: "POST",
        body: JSON.stringify({ idea_record_id: ideaId, ...payload, ...fallback }),
      });
    }
  }

  function ezWizardAllowsPlanWithoutAssets() {
    const helpers = ezPlanApi();
    const pending = ezWizardPending || ezWizardAnswers;
    const mode = $("ezCarouselImageMode")?.value || helpers?.ezImageModeFromWizard?.(pending?.inputKind);
    const count = helpers?.ezWizardPhotoCount?.(pending) || Number($("ezCarouselSlideExact")?.value || 0);
    return mode === "Make AI Generated" && count >= 1;
  }

  function ezWizardSetMessage(text = "", type = "") {
    const node = $("ezWizardMessage");
    if (!node) return;
    node.textContent = text;
    node.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function setEzWizardBusy(busy, text, type = "") {
    ezWizardBusy = Boolean(busy);
    $("ezWizardChips")?.querySelectorAll("button").forEach((button) => {
      button.disabled = ezWizardBusy;
    });
    $("ezWizardForm")?.querySelectorAll("button, input").forEach((el) => {
      el.disabled = ezWizardBusy;
    });
    if ($("ezWizardBack")) $("ezWizardBack").disabled = ezWizardBusy;
    if ($("ezWizardReset")) $("ezWizardReset").disabled = ezWizardBusy;
    if (typeof text === "string") ezWizardSetMessage(text, type);
  }

  function ezWizardLogAdd(role, text) {
    const log = $("ezWizardLog");
    if (!log) return;
    const p = document.createElement("p");
    p.className = `ez-wizard-bubble ez-wizard-bubble--${role === "user" ? "user" : "bot"}`;
    p.textContent = text;
    log.appendChild(p);
    log.scrollTop = log.scrollHeight;
  }

  function ezWizardSummaryText(answers = ezWizardAnswers) {
    const bits = [];
    if (answers.start === "idea") bits.push(answers.ideaMode === "existing" ? "Existing idea" : "New idea");
    else if (answers.start === "photos") bits.push("Your photos");
    else if (answers.start === "ai") bits.push("AI images");
    else if (answers.start === "mixed") bits.push("Mixed photos + AI");
    if (answers.inputKind === "single-photo") bits.push("1 photo");
    if (answers.inputKind === "single-ai") bits.push("1 AI image");
    if (answers.inputKind === "multiple-photos" && answers.photoWait && answers.photoCountMin && answers.photoCountMax) {
      bits.push(`wait ${answers.photoCountMin}–${answers.photoCountMax} photos`);
    } else if (answers.inputKind === "multiple-photos" && answers.photoCount) bits.push(`${answers.photoCount} photos`);
    if (answers.inputKind === "multiple-ai" && answers.photoCount) bits.push(`${answers.photoCount} AI images`);
    if (answers.inputKind === "photos-and-clips") {
      bits.push(`${answers.photoCount || 0} photos · ${answers.clipCount || 0} clips`);
    }
    if (answers.inputKind === "video-clips") bits.push(answers.clipCount ? `${answers.clipCount} clips` : "clips only");
    if (answers.inputKind === "mixed") bits.push(`${answers.manualCount || 0} yours · ${answers.aiCount || 0} AI`);
    if (answers.packageId) {
      const pkg = ezPlanApi()?.ezWizardPackages?.(ezPlanApi()?.ezWizardPhotoCount?.(answers) || 1, answers)
        ?.find((row) => row.id === answers.packageId);
      if (pkg) bits.push(pkg.label);
    }
    return bits.join(" · ");
  }

  function resetEzWizard({ silent = false } = {}) {
    ezWizardStep = "start";
    ezWizardAnswers = azFinishedPath ? ezWizardAnswers : {};
    ezWizardHistory = [];
    if (!azFinishedPath) ezWizardPending = null;
    ezWizardBusy = false;
    if (!azFinishedPath && !$("azFinishedDrop")?.classList.contains("is-busy")) {
      stopAzFinishedProgressPolling();
      $("azFinishedDrop")?.classList.remove("is-busy");
      setAzFinishedMessage();
      setAzFinishedProgress("");
    }
    if (azFinishedPath) {
      if ($("ezAudioVoiceover")) $("ezAudioVoiceover").value = "No";
      if ($("ezAudioMusic")) $("ezAudioMusic").value = "No";
      if ($("prVoiceover")) $("prVoiceover").value = "No";
      if ($("prMusicMode")) $("prMusicMode").value = "No";
    } else {
      if ($("ezAudioVoiceover")) $("ezAudioVoiceover").value = "Yes";
      if ($("ezAudioMusic")) $("ezAudioMusic").value = "Yes";
      if ($("prVoiceover")) $("prVoiceover").value = "Yes";
      if ($("prMusicMode")) $("prMusicMode").value = "Yes";
      audioUserTouched.clear();
    }
    if ($("ezThumbnail")) $("ezThumbnail").value = "Yes";
    if ($("prThumbnail")) $("prThumbnail").value = "Yes";
    const log = $("ezWizardLog");
    if (log) log.innerHTML = "";
    ezWizardSetMessage();
    if (!silent) renderEzWizard();
  }

  function applyEzWizardAnswersToIntake() {
    const helpers = ezPlanApi();
    if (!helpers) return null;
    const answers = { ...ezWizardAnswers };
    const planned = helpers.ezWizardResolvePackage(answers);
    const intake = helpers.ezIntakeKindFromWizard(answers.inputKind);
    const count = helpers.ezWizardPhotoCount(answers);
    ezWizardPending = { ...answers, planned };
    selectEzInput(intake, { resetPlatforms: true });
    item4PlanOverrides = { ...(planned.overrides || {}) };
    document.querySelectorAll("[data-ez-platform]").forEach((input) => {
      input.checked = planned.platforms.includes(input.value);
    });
    syncEzYouTubeAvailability(false);
    if ($("ezCarouselImageMode")) $("ezCarouselImageMode").value = answers.photoWait
      ? "Manual Upload"
      : helpers.ezImageModeFromWizard(answers.inputKind);
    if ($("ezCarouselSlideMode")) $("ezCarouselSlideMode").value = answers.photoWait ? "Target range" : "Exact";
    if ($("ezCarouselSlideExact")) $("ezCarouselSlideExact").value = answers.photoWait ? "" : String(Math.max(1, Number(count) || 1));
    if ($("ezCarouselSlideMin")) $("ezCarouselSlideMin").value = answers.photoWait ? String(answers.photoCountMin || "") : "";
    if ($("ezCarouselSlideMax")) $("ezCarouselSlideMax").value = answers.photoWait ? String(answers.photoCountMax || "") : "";
    const clipCount = helpers.ezWizardClipCount?.(answers) || Number(answers.clipCount) || 0;
    if (clipCount > 0) {
      if ($("ezVideoClipMode")) setSelectValue("ezVideoClipMode", "Exact", "AI decides");
      if ($("ezVideoClipExact")) $("ezVideoClipExact").value = String(clipCount);
      ["ezVideoClipMode", "ezVideoClipExact"].forEach((id) => ezDirty.add(id));
    }
    ["ezCarouselImageMode", "ezCarouselSlideMode", "ezCarouselSlideExact", "ezCarouselSlideMin", "ezCarouselSlideMax"].forEach((id) => ezDirty.add(id));
    ezPinnedExtraOutputs = planned.extras || [];
    applyEzExtraOutputs(ezPinnedExtraOutputs);
    if (answers.packageId) {
      document.querySelectorAll("[data-ez-package]").forEach((button) => {
        button.classList.toggle("selected", button.dataset.ezPackage === answers.packageId);
      });
    }
    const expected = helpers.ezWizardExpectedUploads(answers);
    const title = $("ezUploadTitle");
    const hint = $("ezUploadHint");
    if (answers.inputKind === "mixed") {
      if (title) title.textContent = expected === 1 ? "Drop your photo" : `Add ${expected} of your photos`;
      if (hint) hint.textContent = `Add them one at a time. Studio then adds ${answers.aiCount} AI image${Number(answers.aiCount) === 1 ? "" : "s"}.`;
    } else if (answers.inputKind === "multiple-photos") {
      if (title) title.textContent = `Add ${count} photos`;
      if (hint) hint.textContent = "Add or remove one at a time. You can also drop several together.";
    } else if (answers.inputKind === "video-clips") {
      const clips = helpers.ezWizardClipCount?.(answers) || Number(answers.clipCount) || 1;
      if (title) title.textContent = `Add ${clips} clip${clips === 1 ? "" : "s"}`;
      if (hint) hint.textContent = "Raw mp4/mov clips only. Not a finished video.";
    } else if (answers.inputKind === "photos-and-clips") {
      const photos = helpers.ezWizardPhotoCount(answers);
      const clips = helpers.ezWizardClipCount?.(answers) || Number(answers.clipCount) || 1;
      if (title) title.textContent = `Add ${photos} photo${photos === 1 ? "" : "s"} and ${clips} clip${clips === 1 ? "" : "s"}`;
      if (hint) hint.textContent = "Pick stills and clips together. Studio saves them one file at a time.";
    } else if (answers.inputKind === "finished-video") {
      if (title) title.textContent = "Drop the finished video here";
      if (hint) hint.textContent = "One MP4. Studio skips crops and Remotion.";
    } else if (answers.inputKind === "finished-stills") {
      if (title) title.textContent = "Drop finished photos here";
      if (hint) hint.textContent = "Finished stills. No on-image lettering.";
    } else if (answers.inputKind === "single-ai" || answers.inputKind === "multiple-ai") {
      if (title) title.textContent = "No upload needed for AI images";
      if (hint) hint.textContent = "Studio generates the images from this plan.";
    }
    syncEzStructureCounts();
    applyEzToAdvanced({ force: true });
    return planned;
  }

  function ezWizardRequestPayload(planned, { fileCount = 0 } = {}) {
    const helpers = ezPlanApi();
    const count = helpers?.ezWizardPhotoCount?.(ezWizardPending || ezWizardAnswers) || fileCount || 1;
    const slideMode = $("ezCarouselSlideMode")?.value || "Exact";
    const finished = ["finished-video", "finished-stills"].includes((ezWizardPending || ezWizardAnswers)?.inputKind || ezIntakeKind);
    const az = ezIsAzFinishedPath();
    let captionFields = helpers?.ezCaptionFields(ezCaptionMode(), { captions: joinedManualSlideCaptions(), finished }) || {};
    if (captionFields.caption_mode === "Force exact" && !String(captionFields.requested_caption || "").trim()) {
      captionFields = { ...captionFields, caption_mode: "AI decides", requested_caption: "" };
    }
    return {
      content_type: az
        ? "Vertical Short Video"
        : (planned?.master_content_type || helpers?.ezMasterContentType?.(count) || "Photo Set"),
      platforms: az ? ["Instagram", "Facebook", "TikTok", "YouTube"] : (planned?.platforms || ezSelectedPlatforms()),
      voiceover_mode: (finished || az) ? "No" : ($("ezAudioVoiceover")?.value || "Yes"),
      background_music_mode: (finished || az) ? "No" : ($("ezAudioMusic")?.value || "Yes"),
      thumbnail_mode: (finished || az) ? "Yes" : ($("ezThumbnail")?.value || "Yes"),
      video_duration_seconds: $("ezVideoDuration")?.value || 30,
      video_clip_count_mode: (helpers?.ezWizardClipCount?.(ezWizardPending || ezWizardAnswers) || Number((ezWizardPending || ezWizardAnswers)?.clipCount) || 0) > 0
        ? "Exact"
        : ($("ezVideoClipMode")?.value || "AI decides"),
      video_clip_count_exact: (helpers?.ezWizardClipCount?.(ezWizardPending || ezWizardAnswers) || Number((ezWizardPending || ezWizardAnswers)?.clipCount) || 0) > 0
        ? String(helpers.ezWizardClipCount(ezWizardPending || ezWizardAnswers) || (ezWizardPending || ezWizardAnswers)?.clipCount)
        : ($("ezVideoClipExact")?.value || ""),
      video_clip_count_min: $("ezVideoClipMin")?.value || "",
      video_clip_count_max: $("ezVideoClipMax")?.value || "",
      voiceover_tail_seconds: $("ezVoiceoverTail")?.value || 15,
      voiceover_duration_seconds: $("ezVoiceoverDuration")?.value || defaultVoiceoverDuration($("ezVideoDuration")?.value || 30),
      music_start_seconds: $("ezMusicStart")?.value || 0,
      title_mode: ezTitleIsCustomized() ? ($("ezTitleMode")?.value || "AI decides") : (captionFields.title_mode || "AI decides"),
      requested_title: ezTitleIsCustomized() ? String($("ezRequestedTitle")?.value || "").trim() : (captionFields.requested_title || ""),
      caption_mode: ezCaptionIsCustomized() ? ($("ezCaptionMode")?.value || "AI decides") : (captionFields.caption_mode || "AI decides"),
      requested_caption: ezCaptionIsCustomized() ? String($("ezRequestedCaption")?.value || "").trim() : (captionFields.requested_caption || ""),
      script_mode: ezScriptIsCustomized() ? ($("ezScriptMode")?.value || "AI decides") : (captionFields.script_mode || "AI decides"),
      requested_script: ezScriptIsCustomized() ? String($("ezRequestedScript")?.value || "") : (captionFields.requested_script || ""),
      primary_location: currentPrimaryLocationValue()
        || suggestPrimaryLocationFromCopy({
          title: ezIdeaTitleValue(),
          summary: ezIdeaSummaryValue(),
          primary: activeIdea?.primary_location || "",
          area: activeIdea?.neighborhood_or_area || "",
          market: activeIdea?.market_name || "",
        }).name,
      carousel_image_mode: helpers?.ezImageModeFromWizard?.((ezWizardPending || ezWizardAnswers)?.inputKind)
        || $("ezCarouselImageMode")?.value
        || "Manual Upload",
      carousel_slide_count_mode: (ezWizardPending || ezWizardAnswers)?.photoWait ? "Target range" : slideMode,
      carousel_slide_count_exact: (() => {
        const raw = $("ezCarouselSlideExact")?.value;
        const n = Number(raw);
        if (slideMode === "Exact" && (!Number.isFinite(n) || n < 1)) return String(count);
        return raw || (slideMode === "Exact" ? String(count) : "");
      })(),
      carousel_slide_count_min: (ezWizardPending || ezWizardAnswers)?.photoCountMin || $("ezCarouselSlideMin")?.value || "",
      carousel_slide_count_max: (ezWizardPending || ezWizardAnswers)?.photoCountMax || $("ezCarouselSlideMax")?.value || "",
      selected_music_asset_id: $("ezAudioTrack")?.value || "",
      production_notes: mergeEzProductionNotes(),
      ...selectedRequestVoice(),
    };
  }

  function renderEzWizardChips(chips) {
    const host = $("ezWizardChips");
    if (!host) return;
    host.innerHTML = "";
    chips.forEach((chip) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ez-wizard-chip";
      button.textContent = chip.label;
      if (chip.pressed) button.setAttribute("aria-pressed", "true");
      button.addEventListener("click", () => chip.onClick(chip));
      host.appendChild(button);
    });
  }

  function ezWizardShowForm(html, onSubmit) {
    const form = $("ezWizardForm");
    if (!form) return;
    form.hidden = false;
    form.innerHTML = html;
    form.onsubmit = (event) => {
      event.preventDefault();
      onSubmit(new FormData(form));
    };
  }

  function ezWizardHideForm() {
    const form = $("ezWizardForm");
    if (!form) return;
    form.hidden = true;
    form.innerHTML = "";
    form.onsubmit = null;
  }

  function ezWizardGo(step, { push = true } = {}) {
    const prompts = {
      start: "Where do you want to start?",
      ideaMode: "Do you want an existing idea, or a new one?",
      ideaExisting: "Which idea should we open?",
      ideaWrite: "What’s the idea?",
      ideaKind: "What should this idea use?",
      photoKind: "Single photo, or several?",
      photoCount: "How many photos do you prefer?",
      clipCount: "How many video clips do you prefer?",
      photoRange: "What is the minimum and maximum number of photos?",
      aiKind: "Single AI image, or several?",
      aiCount: "How many AI images do you prefer?",
      mixManual: "How many of your photos?",
      mixAi: "How many AI-generated images?",
      package: "Vertical video, or scrollable slides?",
      platforms: "Which platforms?",
      custom: "Pick the formats you want.",
      confirm: "Suggested Chicago times are filled in. Change any before continuing.",
    };
    if (push && ezWizardStep && ezWizardStep !== step) {
      ezWizardHistory.push(ezWizardStep);
      if (prompts[step]) ezWizardLogAdd("bot", prompts[step]);
    }
    ezWizardStep = step;
    renderEzWizard();
  }

  function ezWizardPick(label, patch, nextStep) {
    ezWizardLogAdd("user", label);
    if (ezWizardStep === "start") ezWizardAnswers = {};
    Object.assign(ezWizardAnswers, patch);
    ezWizardGo(nextStep);
  }

  function renderEzWizard() {
    if (ezWizardBusy) return;
    const helpers = ezPlanApi();
    const prompt = $("ezWizardPrompt");
    const back = $("ezWizardBack");
    const summary = $("ezWizardSummary");
    const chipsHost = $("ezWizardChips");
    if (!prompt || !chipsHost) return;
    if (back) back.hidden = ezWizardHistory.length === 0;
    const summaryText = ezWizardSummaryText();
    if (summary) {
      summary.hidden = !summaryText;
      summary.textContent = summaryText;
    }
    ezWizardHideForm();
    ezWizardSetMessage();
    const answers = ezWizardAnswers;
    const count = helpers?.ezWizardPhotoCount?.(answers) || 1;

    if (ezWizardStep === "start") {
      prompt.textContent = "Where do you want to start?";
      if (!$("ezWizardLog")?.children.length) {
        ezWizardLogAdd("bot", "Where do you want to start?");
      }
      renderEzWizardChips([
        { label: "An idea I already have, or a new idea", onClick: () => ezWizardPick("An idea", { start: "idea" }, "ideaMode") },
        { label: "Photos I already have", onClick: () => ezWizardPick("Photos I already have", { start: "photos" }, "photoKind") },
        { label: "AI-generated images", onClick: () => ezWizardPick("AI-generated images", { start: "ai" }, "aiKind") },
        { label: "Mix of my photos and AI images", onClick: () => ezWizardPick("Mix of my photos and AI", { start: "mixed" }, "mixManual") },
      ]);
      return;
    }

    if (ezWizardStep === "ideaMode") {
      prompt.textContent = "Do you want an existing idea, or a new one?";
      renderEzWizardChips([
        { label: "Existing idea", onClick: () => ezWizardPick("Existing idea", { ideaMode: "existing" }, "ideaExisting") },
        { label: "Write a new idea", onClick: () => ezWizardPick("Write a new idea", { ideaMode: "manual" }, "ideaWrite") },
      ]);
      return;
    }

    if (ezWizardStep === "ideaExisting") {
      prompt.textContent = "Which idea should we open?";
      renderEzWizardChips([]);
      loadIdeas().then(() => {
        const options = selectableIdeas();
        if (!options.length) {
          ezWizardSetMessage("No unpromoted ideas are available. Write a new one instead.", "error-text");
          ezWizardShowForm(
            `<div class="ez-wizard-form-actions"><button type="submit">Write a new idea</button></div>`,
            () => ezWizardPick("Write a new idea", { ideaMode: "manual" }, "ideaWrite")
          );
          return;
        }
        ezWizardShowForm(
          `<label>Existing idea<select name="ideaId">${options.map((idea) => {
            const idLabel = idea.candidate_id ? `#${idea.candidate_id}` : idea.id;
            return `<option value="${escapeHtml(idea.id)}">${escapeHtml(`${idLabel} · ${idea.title || "Untitled"}`)}</option>`;
          }).join("")}</select></label><div class="ez-wizard-form-actions"><button type="submit">Use this idea</button></div>`,
          (data) => {
            const ideaId = String(data.get("ideaId") || "");
            const idea = options.find((row) => row.id === ideaId);
            ezWizardPick(idea?.title || "Selected idea", { ideaId, ideaTitle: idea?.title || "" }, "ideaKind");
          }
        );
      }).catch((error) => ezWizardSetMessage(error.message, "error-text"));
      return;
    }

    if (ezWizardStep === "ideaWrite") {
      prompt.textContent = "What’s the idea?";
      renderEzWizardChips([]);
      ezWizardShowForm(
        `<label>Title<input name="title" maxlength="160" required placeholder="e.g. Ride the CTA: Chicago trains from the platform"></label>
         <label>Summary <span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:.7">(optional)</span>
         <textarea name="summary" maxlength="5000" placeholder="What should this content be about?"></textarea></label>
         <label>Primary location <span style="text-transform:none;letter-spacing:0;font-weight:600;opacity:.7">(optional)</span>
         <input name="location" maxlength="200" placeholder="e.g. Chicago"></label>
         <div class="ez-wizard-form-actions"><button type="submit">Continue</button></div>`,
        (data) => {
          const title = String(data.get("title") || "").trim();
          if (!title) {
            ezWizardSetMessage("Enter an idea title.", "error-text");
            return;
          }
          ezWizardPick(title, {
            ideaTitle: title,
            ideaSummary: String(data.get("summary") || "").trim(),
            ideaLocation: String(data.get("location") || "").trim(),
          }, "ideaKind");
        }
      );
      return;
    }

    if (ezWizardStep === "ideaKind") {
      prompt.textContent = "What should this idea use?";
      renderEzWizardChips([
        { label: "Single photo I’ll upload", onClick: () => ezWizardPick("Single photo I’ll upload", { inputKind: "single-photo", photoCount: 1 }, "package") },
        { label: "Multiple photos I’ll upload", onClick: () => ezWizardPick("Multiple photos I’ll upload", { inputKind: "multiple-photos", photoWait: false }, "photoCount") },
        { label: "Wait for matching library photos", onClick: () => ezWizardPick("Wait for matching library photos", { inputKind: "multiple-photos", photoWait: true }, "photoRange") },
        { label: "Single AI image", onClick: () => ezWizardPick("Single AI image", { inputKind: "single-ai", photoCount: 1 }, "package") },
        { label: "Multiple AI images", onClick: () => ezWizardPick("Multiple AI images", { inputKind: "multiple-ai" }, "aiCount") },
        { label: "Mix of my photos and AI", onClick: () => ezWizardPick("Mix of my photos and AI", { inputKind: "mixed" }, "mixManual") },
        { label: "Photos and clips I’ll combine", onClick: () => ezWizardPick("Photos and clips", { inputKind: "photos-and-clips" }, "photoCount") },
        { label: "Clips only I’ll upload", onClick: () => ezWizardPick("Clips only", { inputKind: "video-clips", photoCount: 0 }, "clipCount") },
        { label: "Finished video I’ll upload", onClick: () => ezWizardPick("Finished video", { inputKind: "finished-video", photoCount: 1 }, "package") },
        { label: "Finished photos I’ll upload", onClick: () => ezWizardPick("Finished photos", { inputKind: "finished-stills" }, "photoCount") },
      ]);
      return;
    }

    if (ezWizardStep === "photoKind") {
      prompt.textContent = "What type of input content do you want to start with?";
      renderEzWizardChips([
        { label: "Single manually created image", onClick: () => ezWizardPick("Single photo", { inputKind: "single-photo", photoCount: 1 }, "package") },
        { label: "Multiple manually created images", onClick: () => ezWizardPick("Multiple photos", { inputKind: "multiple-photos" }, "photoCount") },
        { label: "Video clips I’ll upload", onClick: () => ezWizardPick("Video clips", { inputKind: "video-clips", photoCount: 0 }, "clipCount") },
      ]);
      return;
    }

    if (ezWizardStep === "aiKind") {
      prompt.textContent = "Single AI image, or several?";
      renderEzWizardChips([
        { label: "Single AI image", onClick: () => ezWizardPick("Single AI image", { inputKind: "single-ai", photoCount: 1 }, "package") },
        { label: "Multiple AI images", onClick: () => ezWizardPick("Multiple AI images", { inputKind: "multiple-ai" }, "aiCount") },
      ]);
      return;
    }

    if (ezWizardStep === "photoRange") {
      prompt.textContent = "What is the minimum and maximum number of photos?";
      renderEzWizardChips([
        { label: "2–5", onClick: () => ezWizardPick("2–5", { photoWait: true, photoCountMin: 2, photoCountMax: 5, photoCount: 5 }, "package") },
        { label: "3–8", onClick: () => ezWizardPick("3–8", { photoWait: true, photoCountMin: 3, photoCountMax: 8, photoCount: 8 }, "package") },
        { label: "3–10", onClick: () => ezWizardPick("3–10", { photoWait: true, photoCountMin: 3, photoCountMax: 10, photoCount: 10 }, "package") },
        { label: "5–10", onClick: () => ezWizardPick("5–10", { photoWait: true, photoCountMin: 5, photoCountMax: 10, photoCount: 10 }, "package") },
      ]);
      ezWizardShowForm(
        `<label>Minimum<input name="min" type="number" min="1" max="20" step="1" value="2" required></label>
         <label>Maximum<input name="max" type="number" min="1" max="20" step="1" value="5" required></label>
         <div class="ez-wizard-form-actions"><button type="submit">Use this range</button></div>`,
        (data) => {
          const min = Math.round(Number(data.get("min")));
          const max = Math.round(Number(data.get("max")));
          if (!Number.isFinite(min) || !Number.isFinite(max) || min < 1 || max > 20 || min > max) {
            ezWizardSetMessage("Enter a minimum and maximum between 1 and 20, with min at or below max.", "error-text");
            return;
          }
          ezWizardPick(`${min}–${max}`, { photoWait: true, photoCountMin: min, photoCountMax: max, photoCount: max }, "package");
        }
      );
      return;
    }

    if (ezWizardStep === "photoCount" || ezWizardStep === "aiCount") {
      const ai = ezWizardStep === "aiCount";
      prompt.textContent = ai ? "How many AI images do you prefer?" : "How many photos do you prefer?";
      const next = ezWizardAnswers.inputKind === "photos-and-clips" ? "clipCount" : "package";
      const allowOne = ezWizardAnswers.inputKind === "finished-stills" || ezWizardAnswers.inputKind === "photos-and-clips";
      const counts = allowOne ? [1, 2, 3, 4, 5, 6, 8, 10, 12] : [2, 3, 4, 5, 6, 8, 10, 12];
      const minCount = allowOne ? 1 : 2;
      renderEzWizardChips(counts.map((n) => ({
        label: String(n),
        onClick: () => ezWizardPick(`${n}`, { photoCount: n }, next),
      })));
      ezWizardShowForm(
        `<label>Other count<input name="count" type="number" min="${minCount}" max="20" step="1" required></label>
         <div class="ez-wizard-form-actions"><button type="submit">Use this count</button></div>`,
        (data) => {
          const n = Number(data.get("count"));
          if (!Number.isFinite(n) || n < minCount || n > 20) {
            ezWizardSetMessage(`Enter a count between ${minCount} and 20.`, "error-text");
            return;
          }
          ezWizardPick(String(n), { photoCount: Math.round(n) }, next);
        }
      );
      return;
    }

    if (ezWizardStep === "clipCount") {
      prompt.textContent = "How many video clips do you prefer?";
      const counts = [1, 2, 3, 4, 5, 6];
      renderEzWizardChips(counts.map((n) => ({
        label: String(n),
        onClick: () => ezWizardPick(`${n} clip${n === 1 ? "" : "s"}`, { clipCount: n }, "package"),
      })));
      ezWizardShowForm(
        `<label>Other count<input name="count" type="number" min="1" max="12" step="1" required></label>
         <div class="ez-wizard-form-actions"><button type="submit">Use this count</button></div>`,
        (data) => {
          const n = Number(data.get("count"));
          if (!Number.isFinite(n) || n < 1 || n > 12) {
            ezWizardSetMessage("Enter a clip count between 1 and 12.", "error-text");
            return;
          }
          ezWizardPick(`${Math.round(n)} clips`, { clipCount: Math.round(n) }, "package");
        }
      );
      return;
    }

    if (ezWizardStep === "mixManual") {
      prompt.textContent = "How many of your photos?";
      renderEzWizardChips([1, 2, 3, 4, 5, 6].map((n) => ({
        label: String(n),
        onClick: () => ezWizardPick(`${n} of mine`, { manualCount: n, inputKind: "mixed" }, "mixAi"),
      })));
      ezWizardShowForm(
        `<label>Other count<input name="count" type="number" min="1" max="19" step="1" required></label>
         <div class="ez-wizard-form-actions"><button type="submit">Continue</button></div>`,
        (data) => {
          const n = Number(data.get("count"));
          if (!Number.isFinite(n) || n < 1 || n > 19) {
            ezWizardSetMessage("Enter how many of your photos, from 1 to 19.", "error-text");
            return;
          }
          ezWizardPick(`${n} of mine`, { manualCount: Math.round(n), inputKind: "mixed" }, "mixAi");
        }
      );
      return;
    }

    if (ezWizardStep === "mixAi") {
      prompt.textContent = "How many AI-generated images?";
      const remaining = Math.max(1, 20 - (Number(answers.manualCount) || 1));
      renderEzWizardChips([1, 2, 3, 4, 5].filter((n) => n <= remaining).map((n) => ({
        label: String(n),
        onClick: () => ezWizardPick(`${n} AI`, { aiCount: n }, "package"),
      })));
      ezWizardShowForm(
        `<label>Other count<input name="count" type="number" min="1" max="${remaining}" step="1" required></label>
         <div class="ez-wizard-form-actions"><button type="submit">Continue</button></div>`,
        (data) => {
          const n = Number(data.get("count"));
          if (!Number.isFinite(n) || n < 1 || n > remaining) {
            ezWizardSetMessage(`Enter 1 to ${remaining} AI images.`, "error-text");
            return;
          }
          ezWizardPick(`${n} AI`, { aiCount: Math.round(n) }, "package");
        }
      );
      return;
    }

    if (ezWizardStep === "package") {
      prompt.textContent = "Vertical video, or scrollable slides?";
      const packages = helpers?.ezWizardPackages?.(count, answers) || [];
      renderEzWizardChips(packages.map((pkg) => ({
        label: pkg.label,
        onClick: () => {
          const next = pkg.id === "platforms" ? "platforms" : pkg.id === "custom" ? "custom" : "confirm";
          ezWizardPick(pkg.label, { packageId: pkg.id }, next);
        },
      })));
      return;
    }

    if (ezWizardStep === "platforms") {
      prompt.textContent = "Which platforms?";
      const selected = new Set(answers.platforms || ["Instagram", "Facebook", "TikTok", "YouTube"]);
      const redraw = () => {
        renderEzWizardChips([
          ...["Instagram", "Facebook", "TikTok", "YouTube"].map((platform) => ({
            label: platform,
            pressed: selected.has(platform),
            onClick: () => {
              if (selected.has(platform)) selected.delete(platform);
              else selected.add(platform);
              redraw();
            },
          })),
          {
            label: "Continue",
            onClick: () => {
              if (!selected.size) {
                ezWizardSetMessage("Pick at least one platform.", "error-text");
                return;
              }
              ezWizardPick([...selected].join(", "), { platforms: [...selected] }, "confirm");
            },
          },
        ]);
      };
      redraw();
      return;
    }

    if (ezWizardStep === "custom") {
      prompt.textContent = "Pick the formats you want.";
      renderEzWizardChips([]);
      const options = helpers?.EZ_OUTPUT_OPTIONS || [];
      ezWizardShowForm(
        `<div class="ez-wizard-custom">${options.map((group) => `
          <fieldset><legend>${escapeHtml(group.platform)}</legend>
          ${group.types.map((type) => `<label><input type="checkbox" name="out" value="${escapeHtml(`${group.platform}::${type}`)}"> ${escapeHtml(type)}</label>`).join("")}
          </fieldset>`).join("")}</div>
         <div class="ez-wizard-form-actions"><button type="submit">Use these formats</button></div>`,
        (data) => {
          const keys = data.getAll("out").map(String);
          if (!keys.length) {
            ezWizardSetMessage("Pick at least one format.", "error-text");
            return;
          }
          const customItems = keys.map((key) => {
            const [platform, ...rest] = key.split("::");
            return { platform, output_type: rest.join("::") };
          });
          ezWizardPick("Custom formats", { packageId: "custom", customItems, platforms: [...new Set(customItems.map((item) => item.platform))] }, "confirm");
        }
      );
      return;
    }

    prompt.textContent = "Suggested Chicago times are filled in. Change any before continuing.";
    renderEzWizardChips([]);
    const planned = helpers?.ezWizardResolvePackage?.(ezWizardAnswers);
    const scheduleItems = helpers?.ezPlanScheduleItems?.(planned) || [];
    const saved = ezWizardAnswers.schedules && typeof ezWizardAnswers.schedules === "object"
      ? ezWizardAnswers.schedules
      : {};
    const stamps = helpers?.ezBuildSuggestedScheduleMap?.(
      scheduleItems.map((item) => ({
        ...item,
        scheduled_at: saved[`${item.platform}::${item.output_type}`] || "",
      }))
    ) || new Map();
    const rows = scheduleItems.map((item) => {
      const key = `${item.platform}::${item.output_type}`;
      const iso = stamps.get(key) || saved[key] || "";
      const value = formatDateTimeLocalInput(iso);
      const field = `sched_${item.platform}_${String(item.output_type || "").replace(/\s+/g, "_")}`;
      return `<label class="ez-wizard-schedule-row">${escapeHtml(item.platform)} · ${escapeHtml(item.output_type)}
        <input type="datetime-local" name="${escapeHtml(field)}" data-schedule-key="${escapeHtml(key)}" value="${escapeHtml(value)}" required></label>`;
    }).join("");
    ezWizardShowForm(
      `${rows ? `<div class="ez-wizard-schedules">${rows}</div>` : ""}
       <p class="subtle">Same-platform posts stay at least 90 minutes apart. Publishing still waits for Ready for Review → Approve publish.</p>
       <div class="ez-wizard-form-actions"><button type="submit">Continue</button></div>`,
      () => {
        const schedules = {};
        $("ezWizardForm")?.querySelectorAll("[data-schedule-key]").forEach((input) => {
          const key = String(input.getAttribute("data-schedule-key") || "").trim();
          const raw = String(input.value || "").trim();
          if (!key || !raw) return;
          const ms = Date.parse(raw);
          if (Number.isNaN(ms)) return;
          schedules[key] = new Date(ms).toISOString();
        });
        ezWizardLogAdd("user", "Suggested times");
        Object.assign(ezWizardAnswers, { schedules });
        finishEzWizard();
      }
    );
    return;
  }

  async function finishEzWizard() {
    if (ezWizardBusy) return;
    const helpers = ezPlanApi();
    if (!helpers) {
      ezWizardSetMessage("Studio plan helper did not load.", "error-text");
      return;
    }
    setEzWizardBusy(true, "Saving your answers…");
    try {
      const helpersNow = ezPlanApi();
      const planned = helpersNow?.ezWizardResolvePackage?.(ezWizardAnswers) || applyEzWizardAnswersToIntake();
      ezWizardPending = { ...ezWizardAnswers, planned };
      const answers = ezWizardPending;
      if (answers.start === "idea") {
        let idea = null;
        if (answers.ideaId) {
          idea = ideasCache.find((row) => row.id === answers.ideaId) || { id: answers.ideaId, title: answers.ideaTitle };
        } else if (answers.ideaTitle) {
          setEzWizardBusy(true, "Creating the idea…");
          const result = await api("/api/ideas", {
            method: "POST",
            body: JSON.stringify({
              title: answers.ideaTitle,
              summary: answers.ideaSummary || answers.ideaTitle,
              primary_location: answers.ideaLocation || "",
            }),
            timeoutMs: 30000,
            retries: 1,
          });
          idea = result.record;
          if (idea?.id) {
            ezWizardAnswers.ideaId = idea.id;
            answers.ideaId = idea.id;
          }
        }
        if (!idea?.id) {
          ezWizardSetMessage("Could not save the idea. Enter a title and try again.", "error-text");
          enterEzIdeaPath();
          setIdeaFormOpen(true, { mode: "manual" });
          return;
        }
        if (answers.photoWait && answers.photoCountMin && answers.photoCountMax) {
          setEzWizardBusy(true, `Approving and waiting for ${answers.photoCountMin}–${answers.photoCountMax} photos…`);
          const platforms = planned?.platforms?.length ? planned.platforms : ["Instagram", "Facebook", "TikTok"];
          const result = await api(`/api/ideas/${encodeURIComponent(idea.id)}/promote`, {
            method: "POST",
            body: JSON.stringify({
              content_type: planned?.master_content_type || "Photo Set",
              platforms,
              include_voiceover: $("ezAudioVoiceover")?.value || "Use Profile Default",
              include_background_music: $("ezAudioMusic")?.value || "Use Profile Default",
              include_thumbnail: $("ezThumbnail")?.value || "Use Profile Default",
              carousel_slide_count_mode: "Target range",
              carousel_slide_count_min: answers.photoCountMin,
              carousel_slide_count_max: answers.photoCountMax,
              carousel_image_mode: "Wait for matching photos",
              photo_wait: true,
            }),
            timeoutMs: 45000,
            retries: 0,
          });
          resetEzWizard({ silent: true });
          switchToPage("ideas");
          updateIdeaDrawer(result.record || idea);
          openIdeaDrawer(result.record || idea);
          setManageMessage(result.message || `Approved. Waiting for ${answers.photoCountMin}–${answers.photoCountMax} matching photos.`, "success");
          loadIdeas().catch(() => {});
          return;
        }
        setEzWizardBusy(true, "Opening production…");
        applyEzWizardAnswersToIntake();
        await openProductionRequestForIdea(idea, { fromWizard: true });
        resetEzWizard({ silent: true });
        return;
      }
      applyEzWizardAnswersToIntake();
      if (!helpers.ezWizardRequiresUploads(answers)) {
        if ($("ezIdeaTitle") && !String($("ezIdeaTitle").value || "").trim()) {
          $("ezIdeaTitle").value = answers.photoCount > 1 ? "AI generated images" : "AI generated image";
        }
        await startEzProduction({ files: [] });
        return;
      }
      enterEzContentPath();
      const expected = helpers.ezWizardExpectedUploads(answers);
      setEzMessage(answers.inputKind === "mixed"
        ? `Add ${expected} of your photo${expected === 1 ? "" : "s"} one at a time. Studio will add ${answers.aiCount} AI image${Number(answers.aiCount) === 1 ? "" : "s"}.`
        : answers.inputKind === "video-clips"
          ? `Add ${answers.clipCount || 1} clip${Number(answers.clipCount) === 1 ? "" : "s"}.`
          : answers.inputKind === "photos-and-clips"
          ? `Add ${answers.photoCount || 0} photo${Number(answers.photoCount) === 1 ? "" : "s"} and ${answers.clipCount || 0} clip${Number(answers.clipCount) === 1 ? "" : "s"}.`
          : answers.inputKind === "finished-video"
          ? "Drop the finished video to continue."
          : expected === 1
            ? "Drop one photo to continue."
            : `Add ${expected} photos one at a time, or drop several together.`);
    } catch (error) {
      const timedOut = isTimeoutError(error);
      ezWizardSetMessage(
        timedOut
          ? "Studio took too long to save that start. Tap Continue again, or open Ideas and approve the idea there."
          : (error.message || "Could not continue."),
        "error-text"
      );
    } finally {
      const stayedOnHome = Boolean($("page-home")?.classList.contains("active")) && !activeProductionRequest?.id;
      if (stayedOnHome) setEzWizardBusy(false);
      else ezWizardBusy = false;
    }
  }

  function drainPendingMasterUploads() {
    if (item4Uploading || ezStarting || !item4PendingUploads.length) return;
    const queued = item4PendingUploads.splice(0);
    receiveMasterPhotos(queued);
  }

  function receiveMasterPhotos(fileList) {
    const incoming = Array.from(fileList || []);
    item4AdoptKindForIncomingFiles(incoming);
    const unsupportedNote = item4UnsupportedPhotoMessage(incoming);
    let files = incoming.filter(item4IsSupportedPhotoFile);
    if (unsupportedNote) {
      setEzMessage(unsupportedNote, "error-text");
      setRequestMessage(unsupportedNote, "error-text");
      if (!files.length) return;
    } else if (!files.length) {
      const choose = ezIsFinishedVideo() ? "Choose a video file." : "Choose one or more photo files.";
      setEzMessage(choose, "error-text");
      setRequestMessage(choose, "error-text");
      return;
    }
    const oversizedSplit = item4DropOversizedClips(files, { resetNotice: true });
    if (oversizedSplit.oversized.length) {
      files = oversizedSplit.allowed;
      if (!files.length) return;
    }
    if (item4Uploading || ezStarting) {
      item4PendingUploads.push(...files);
      if (!item4ShowOversizedClipNotice()) setEzMessage("Adding to the set…");
      return;
    }
    if (activeProductionRequest?.id) {
      uploadItem4Files(files, { preserveOversizedNotice: true });
      return;
    }
    startEzProduction({ files, preserveOversizedNotice: true });
  }

  async function startEzFromFiles(fileList) {
    receiveMasterPhotos(fileList);
  }

  async function startEzProduction({ files = [], preserveOversizedNotice = false } = {}) {
    const apiHelpers = ezPlanApi();
    if (!apiHelpers) throw new Error("EZ plan helper did not load");
    const pending = ezWizardPending || ezWizardAnswers;
    const expected = pending?.inputKind ? apiHelpers.ezWizardExpectedUploads(pending) : null;
    const allowEmpty = expected === 0;
    const incoming = Array.from(files || []);
    item4AdoptKindForIncomingFiles(incoming);
    const unsupportedNote = item4UnsupportedPhotoMessage(incoming);
    const supported = incoming.filter(item4IsSupportedPhotoFile);
    if (unsupportedNote) {
      setEzMessage(unsupportedNote, "error-text");
      if (!supported.length) return;
    } else if (!allowEmpty && !supported.length) {
      setEzMessage(ezIsFinishedVideo() ? "Choose a video file." : "Choose one or more photo files.", "error-text");
      return;
    }
    if (!ezIntakeKind && supported.length) {
      selectEzInput(supported.length > 1 ? "multiple-photos" : "single-photo", { resetPlatforms: false });
    }
    if (ezIntakeKind === "single-photo" && supported.length > 1) {
      setEzMessage("Single photo uses the first image. Choose Multiple photos for a set.", "");
    }
    const existingCount = ezPersistedAssetCount();
    if (ezIntakeKind === "single-photo" && existingCount >= 1) {
      setEzMessage("This piece already has a photo. Remove it first to replace it.", "error-text");
      return;
    }
    let nextFiles = ezIntakeKind === "single-photo" ? supported.slice(0, 1) : supported;
    if (ezIntakeKind === "finished-video") {
      nextFiles = supported.filter(item4FileLooksLikeVideo).slice(0, 1);
      if (!nextFiles.length) nextFiles = supported.slice(0, 1);
    }
    if (pending?.inputKind === "mixed") {
      const remaining = Math.max(0, Number(expected || 0) - existingCount);
      if (!remaining) {
        setEzMessage("This mixed set already has your photos.", "error-text");
        return;
      }
      nextFiles = nextFiles.slice(0, remaining);
    }
    const oversizedSplit = item4DropOversizedClips(nextFiles, { resetNotice: !preserveOversizedNotice });
    if (oversizedSplit.oversized.length) {
      nextFiles = oversizedSplit.allowed;
      if (!nextFiles.length && !allowEmpty) return;
    }
    if (activeProductionRequest?.id && nextFiles.length) {
      await uploadItem4Files(nextFiles, { preserveOversizedNotice: true });
      return;
    }
    const captionMode = ezCaptionMode();
    const captions = joinedManualSlideCaptions();
    if (ezStarting) return;
    ezStarting = true;
    const continueBtn = $("ezContinue");
    if (continueBtn) continueBtn.disabled = true;
    if (!item4OversizedClipNotice) {
      setEzMessage(allowEmpty ? "Saving the AI plan…" : "Saving in the background…");
      if (ezIsAzFinishedPath()) setAzFinishedMessage("Saving the file to Drive. You can close this tab after it lands.");
    }
    try {
      const wizardPlanned = pending?.planned;
      const totalAfter = existingCount + nextFiles.length;
      const photoCount = allowEmpty
        ? (apiHelpers.ezWizardPhotoCount(pending) || 1)
        : (Number(pending?.photoCount) || (pending?.inputKind === "mixed" ? apiHelpers.ezWizardPhotoCount(pending) : 0) || Math.max(totalAfter, ezIntakeKind === "multiple-photos" ? 2 : 1));
      let planned;
      if (wizardPlanned) {
        planned = wizardPlanned;
        item4PlanOverrides = { ...(wizardPlanned.overrides || {}) };
      } else if (ezIntakeKind === "finished-video") {
        planned = apiHelpers.ezWizardResolvePackage({ inputKind: "finished-video", photoCount: 1, packageId: "video" });
        item4PlanOverrides = { ...(planned.overrides || {}) };
      } else {
        item4PlanOverrides = {};
        planned = applyEzPlanOverrides(photoCount, ezSelectedPlatforms());
      }
      syncItem4PlatformsFromEz();
      syncRequestAudioUi({ fromEz: true, userChanged: true });
      applyEzToAdvanced({ force: true });
      const extras = (wizardPlanned?.extras && wizardPlanned.extras.length)
        ? wizardPlanned.extras
        : ezExtraOutputSnapshot();
      let captionFields = apiHelpers.ezCaptionFields(captionMode, { captions });
      if (captionFields.caption_mode === "Force exact" && !String(captionFields.requested_caption || "").trim()) {
        captionFields = { ...captionFields, caption_mode: "AI decides", requested_caption: "" };
      }
      const azTitle = ezIsAzFinishedPath() ? String($("azFinishedTitle")?.value || "").trim() : "";
      const defaultTitle = allowEmpty
        ? (String($("ezIdeaTitle")?.value || "").trim() || (photoCount > 1 ? "AI generated images" : "AI generated image"))
        : (azTitle || titleFromFiles(nextFiles));
      const idea = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          title: defaultTitle,
          summary: ezIdeaSummaryValue(pending?.inputKind || ezIntakeKind),
        }),
      });
      activeIdea = idea.record;
      if ($("ezIdeaTitle") && !String($("ezIdeaTitle").value || "").trim()) {
        $("ezIdeaTitle").value = activeIdea.title || "";
      }
      if ($("ezIdeaSummary") && !String($("ezIdeaSummary").value || "").trim()) {
        $("ezIdeaSummary").value = userIdeaSummaryFromStored(activeIdea.summary);
      }
      hydratePrimaryLocationFromSources({ record: activeProductionRequest, idea: activeIdea, force: true });
      syncEzIdeaIdentityFields();
      setEzIdeaIdentityHint("Saved. You can keep editing.");
      const requestPayload = ezWizardRequestPayload(planned, { fileCount: photoCount });
      if (allowEmpty) {
        requestPayload.carousel_image_mode = "Make AI Generated";
        requestPayload.carousel_slide_count_mode = "Exact";
        requestPayload.carousel_slide_count_exact = photoCount;
      } else if (pending?.inputKind === "mixed") {
        requestPayload.carousel_image_mode = "Make AI Generated";
        requestPayload.carousel_slide_count_mode = "Exact";
        requestPayload.carousel_slide_count_exact = apiHelpers.ezWizardPhotoCount(pending);
      } else if (pending?.inputKind === "single-photo" || pending?.inputKind === "multiple-photos" || nextFiles.length) {
        requestPayload.carousel_image_mode = "Manual Upload";
        requestPayload.carousel_slide_count_mode = "Exact";
        requestPayload.carousel_slide_count_exact = photoCount;
      }
      await ensureProductionRequestMusic();
      const created = await createEzProductionRequest(activeIdea.id, requestPayload);
      setEzAdvancedOpen(false);
      populateProductionRequestForm(created.record, { reveal: false });
      await loadProductionRequestOutputs(created.record);
      applyEzExtraOutputs(extras);
      if (extras.length) await saveProductionRequestOutputs(created.record);
      await loadItem4Workspace(created.record);
      await loadProductionRequests();
      if (allowEmpty) {
        ezAutoPlanAfterUpload = true;
        showProductionRequestWorkspace();
        setEzMessage("AI plan saved. Studio will generate the images.");
        setRequestMessage("AI image plan saved. You can still add a title, script, or notes before promote.", "success");
        await maybeAutoEzPlan(true);
      } else {
        ezAutoPlanAfterUpload = !ezIsAzFinishedPath();
        if (!item4ShowOversizedClipNotice()) {
          setEzMessage("Uploading originals…");
          if (ezIsAzFinishedPath()) setAzFinishedMessage("Uploading to Drive. You can close this tab after the file is stored.");
        }
        await uploadItem4Files(nextFiles, { preserveOversizedNotice: true });
        renderEzPhotoStrip();
        if (ezIsAzFinishedPath()) startAzFinishedProgressPolling();
      }
    } catch (error) {
      const saved = Boolean(activeProductionRequest?.id);
      const message = saved
        ? `Your photos are still here, but Studio could not finish saving (${error.message}). You can keep editing captions.`
        : error.message;
      setEzMessage(message, "error-text");
      setRequestMessage(error.message, "error-text");
      if (ezIsAzFinishedPath()) {
        setAzFinishedMessage(error.message || "Could not start publish.", "error-text");
        $("azFinishedDrop")?.classList.remove("is-busy");
      }
    } finally {
      ezStarting = false;
      if (continueBtn) continueBtn.disabled = false;
      drainPendingMasterUploads();
    }
  }

  function bindEzWizard() {
    $("ezWizardBack")?.addEventListener("click", () => {
      const previous = ezWizardHistory.pop();
      if (!previous) return;
      ezWizardStep = previous;
      renderEzWizard();
    });
    $("ezWizardReset")?.addEventListener("click", () => resetEzWizard());
    renderEzWizard();
  }

  function lockAzFinishedDefaults() {
    if ($("ezAudioVoiceover")) $("ezAudioVoiceover").value = "No";
    if ($("ezAudioMusic")) $("ezAudioMusic").value = "No";
    if ($("ezThumbnail")) $("ezThumbnail").value = "Yes";
    if ($("prVoiceover")) $("prVoiceover").value = "No";
    if ($("prMusicMode")) $("prMusicMode").value = "No";
    if ($("prThumbnail")) $("prThumbnail").value = "Yes";
    audioUserTouched.add("ezAudioVoiceover");
    audioUserTouched.add("ezAudioMusic");
    const title = String($("azFinishedTitle")?.value || "").trim();
    if (title) {
      if ($("ezIdeaTitle")) $("ezIdeaTitle").value = title;
      if ($("ezTitleMode")) $("ezTitleMode").value = "Force exact";
      if ($("ezRequestedTitle")) $("ezRequestedTitle").value = title;
      if ($("prTitleMode")) $("prTitleMode").value = "Force exact";
      if ($("prRequestedTitle")) $("prRequestedTitle").value = title;
      ["ezTitleMode", "ezRequestedTitle"].forEach((id) => ezDirty.add(id));
    }
  }

  async function beginAzFinishedVideo(fileList) {
    const incoming = Array.from(fileList || []);
    const videos = incoming.filter(item4FileLooksLikeVideo);
    if (!videos.length) {
      setAzFinishedMessage("Drop one MP4 (or MOV).", "error-text");
      return;
    }
    if (item4Uploading || ezStarting) {
      setAzFinishedMessage("This video is already uploading.", "error-text");
      return;
    }
    azFinishedPath = true;
    $("azFinishedDrop")?.classList.add("is-busy");
    setAzFinishedProgress("ingesting");
    setAzFinishedMessage("Saving the file to Drive…");
    const helpers = ezPlanApi();
    ezWizardAnswers = {
      origin: helpers?.EZ_ORIGIN_AZ || "az-finished-video",
      start: "content",
      inputKind: "finished-video",
      packageId: "video",
      platforms: ["Instagram", "Facebook", "TikTok", "YouTube"],
    };
    applyEzWizardAnswersToIntake();
    lockAzFinishedDefaults();
    ezAutoPlanAfterUpload = false;
    try {
      await startEzProduction({ files: videos.slice(0, 1), preserveOversizedNotice: true });
      startAzFinishedProgressPolling();
    } catch (error) {
      setAzFinishedMessage(error.message || "Could not start publish.", "error-text");
      $("azFinishedDrop")?.classList.remove("is-busy");
    }
  }

  function bindAzFinishedDrop() {
    const zone = $("azFinishedZone");
    const input = $("azFinishedInput");
    if (!zone || !input) return;
    const pick = () => {
      if ($("azFinishedDrop")?.classList.contains("is-busy")) return;
      input.click();
    };
    zone.addEventListener("click", (event) => {
      if (event.target.closest("input, button, label")) return;
      pick();
    });
    zone.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        pick();
      }
    });
    ["dragenter", "dragover"].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((type) => zone.addEventListener(type, (event) => {
      event.preventDefault();
      event.stopPropagation();
      zone.classList.remove("dragging");
    }));
    zone.addEventListener("drop", (event) => beginAzFinishedVideo(event.dataTransfer?.files));
    input.addEventListener("change", (event) => {
      beginAzFinishedVideo(event.target.files);
      event.target.value = "";
    });
  }

  function bindEzIntake() {
    bindEzWizard();
    $("ezStartOver")?.addEventListener("click", () => {
      azFinishedPath = false;
      resetEzWizard({ silent: true });
      revokeEzLocalPreviews();
      ezStagedFiles = [];
      ezIntakeKind = null;
      ezCaptionDefault = "ai";
      ezSlideCaptionHealDone = false;
      ezCaptionModes.clear();
      ezCaptionDrafts.clear();
      if ($("ezIdeaTitle")) $("ezIdeaTitle").value = "";
      if ($("ezIdeaSummary")) $("ezIdeaSummary").value = "";
      if ($("ezPrimaryLocation")) $("ezPrimaryLocation").value = "";
      if ($("prPrimaryLocation")) $("prPrimaryLocation").value = "";
      primaryLocationUserEdited = false;
      if ($("ezTitle")) $("ezTitle").value = "";
      setEzIdeaIdentityHint("You can edit these anytime. Photos do not lock the name.");
      document.querySelectorAll("[data-ez-input]").forEach((button) => button.classList.remove("selected"));
      renderEzPhotoStrip();
      setEzMessage();
      goHome();
      renderEzWizard();
    });
    ["ezIdeaTitle", "ezIdeaSummary"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", () => {
        queueEzIdeaIdentitySave();
        if (!primaryLocationUserEdited) {
          hydratePrimaryLocationFromSources({
            record: activeProductionRequest,
            idea: {
              ...(activeIdea || {}),
              title: $("ezIdeaTitle")?.value || activeIdea?.title || "",
              summary: $("ezIdeaSummary")?.value || activeIdea?.summary || "",
            },
            force: true,
          });
        }
      });
      el.addEventListener("change", queueEzIdeaIdentitySave);
    });
    $("ezAudioTrack")?.addEventListener("change", () => {
      if ($("ezAudioTrack")?.value) clearPreviewPickMessage();
    });
    $("ezAudioVoice")?.addEventListener("change", () => {
      if ($("ezAudioVoice")?.value) clearPreviewPickMessage();
    });
    ["ezAudioVoiceover", "ezAudioMusic", "ezAudioTrack", "ezAudioVoice"].forEach((id) => {
      $(id)?.addEventListener("change", (event) => {
        if (event.isTrusted !== false && (id === "ezAudioVoiceover" || id === "ezAudioMusic")) {
          audioUserTouched.add(id);
        }
        stopStudioAudioPreview();
        syncRequestAudioUi({ fromEz: true, userChanged: true });
        if (activeProductionRequest?.id) saveActiveProductionRequest({ quiet: true }).catch(() => {});
      });
    });
    [
      "ezTitleMode", "ezRequestedTitle", "ezCaptionMode", "ezRequestedCaption", "ezScriptMode", "ezRequestedScript",
      "ezThumbnail", "ezVoiceoverTail", "ezVideoDuration", "ezVideoClipMode",
      "ezVideoClipExact", "ezVideoClipMin", "ezVideoClipMax", "ezCarouselSlideMode",
      "ezCarouselSlideExact", "ezCarouselSlideMin", "ezCarouselSlideMax",
      "ezCarouselImageMode", "ezProductionNotes", "ezPrimaryLocation",
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", (event) => {
        if (event.isTrusted === false) return;
        if (id === "ezPrimaryLocation") {
          primaryLocationUserEdited = true;
          if ($("prPrimaryLocation")) $("prPrimaryLocation").value = el.value;
        }
        ezDirty.add(id);
        queueEzConfigSave();
      });
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
        el.addEventListener("input", (event) => {
          if (event.isTrusted === false) return;
          if (id === "ezPrimaryLocation") {
            primaryLocationUserEdited = true;
            if ($("prPrimaryLocation")) $("prPrimaryLocation").value = el.value;
          }
          ezDirty.add(id);
          queueEzConfigSave();
        });
      }
    });
    $("prPrimaryLocation")?.addEventListener("input", () => {
      primaryLocationUserEdited = true;
      if ($("ezPrimaryLocation")) $("ezPrimaryLocation").value = $("prPrimaryLocation").value;
    });
    $("prPrimaryLocation")?.addEventListener("change", () => {
      primaryLocationUserEdited = true;
      if ($("ezPrimaryLocation")) $("ezPrimaryLocation").value = $("prPrimaryLocation").value;
      if (activeProductionRequest?.id) saveActiveProductionRequest({ quiet: true }).catch(() => {});
    });
    document.querySelectorAll("[data-ez-output]").forEach((input) => {
      input.addEventListener("change", () => {
        if (input.dataset.platform === "TikTok" && input.value === "Story" && input.checked) {
          item4DropUnsupportedStoryChecks(true);
          return;
        }
        const match = outputMatrixInputs().find((row) => row.dataset.platform === input.dataset.platform && row.value === input.value);
        if (match) match.checked = input.checked;
        ezExtraOutputSnapshot();
        updateOutputMatrixSummary();
        if (activeProductionRequest?.id && productionOutputMatrixLoaded) {
          saveProductionRequestOutputs().catch(() => {});
        }
      });
    });
    $("ezAudioVoicePreview")?.addEventListener("click", () => {
      const voice = phase6SelectedVoice($("ezAudioVoice"));
      if (voice.id) setEzMessage();
      phase6PreviewSelectedVoice($("ezAudioVoice"), $("ezAudioVoicePreview"), setEzMessage);
    });
    $("ezAudioTrackPreview")?.addEventListener("click", () => {
      const select = $("ezAudioTrack");
      const id = String(select?.value || "").trim();
      if (!id) {
        setEzMessage("Pick a music track to preview.", "error-text");
        return;
      }
      const option = select?.selectedOptions?.[0];
      const preview = String(option?.dataset?.preview || "").trim() || `${apiBase}/api/music/${encodeURIComponent(id)}/preview`;
      setEzMessage();
      playStudioAudioPreview(preview, $("ezAudioTrackPreview"), setEzMessage, option?.textContent?.trim() || "track");
    });
    document.querySelectorAll("[data-ez-input]").forEach((button) => {
      button.addEventListener("click", () => selectEzInput(button.dataset.ezInput));
    });
    document.querySelectorAll("[data-ez-package]").forEach((button) => {
      button.addEventListener("click", () => selectEzPackage(button.dataset.ezPackage));
    });
    document.querySelectorAll('input[name="ezCaptionMode"]').forEach((input) => {
      input.addEventListener("change", renderEzCaptionUi);
    });
    document.querySelectorAll("[data-ez-platform]").forEach((input) => {
      input.addEventListener("change", () => {
        syncItem4PlatformsFromEz();
        if ((ezIsOriginRecord() || ezStarting) && ezMasterSetReadyForPlan() && !ezIsAzFinishedPath()) {
          maybeAutoEzPlan(true);
        }
      });
    });
    $("ezChooseMedia")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      item4ApplyMediaInputAccept(ezIntakeKind);
      $("ezMediaInput")?.click();
    });
    $("ezChooseClip")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      item4BeginClipPick("ezClipInput");
    });
    $("ezMediaInput")?.addEventListener("change", (event) => {
      startEzFromFiles(event.target.files);
      event.target.value = "";
    });
    $("ezClipInput")?.addEventListener("change", (event) => {
      startEzFromFiles(event.target.files);
      event.target.value = "";
    });
    $("ezContinue")?.addEventListener("click", () => {
      if (activeProductionRequest?.id && ezPersistedAssetCount()) return;
      startEzFromFiles(ezStagedFiles);
    });
    bindAzFinishedDrop();
    const drop = $("ezUploadZone");
    if (!drop) return;
    drop.addEventListener("click", (event) => {
      if (event.target.closest("button, input")) return;
      $("ezMediaInput")?.click();
    });
    ["dragenter", "dragover"].forEach((type) => drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.add("dragging");
    }));
    ["dragleave", "drop"].forEach((type) => drop.addEventListener(type, (event) => {
      event.preventDefault();
      drop.classList.remove("dragging");
    }));
    drop.addEventListener("drop", (event) => startEzFromFiles(event.dataTransfer?.files));
    drop.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("ezMediaInput")?.click();
      }
    });
  }

  function item4SelectedPlatforms() {
    return Array.from(document.querySelectorAll("[data-item4-platform]:checked")).map(el => el.value);
  }

  function item4StateLabel(value, fallback) {
    const raw = String(value || fallback || "").trim();
    const key = raw.toLowerCase();
    const labels = {
      "needs plan": "Not started",
      none: "Not started",
      ready: "Ready",
      building: "Building…",
      error: "Needs attention",
      "not prepared": "Waiting",
      preparing: "Preparing…",
    };
    return labels[key] || raw || fallback || "—";
  }

  function productionPillState(text) {
    const t = String(text || "").toLowerCase();
    if (/attention|error|need/.test(t)) return "attention";
    if (/process|prepar|upload|building/.test(t)) return "busy";
    if (/ready|complete/.test(t)) return "ready";
    return "idle";
  }

  function item4PrepareButtonView({
    planStatus = "",
    variantStatus = "None",
    readyCount = 0,
    targetCount = 0,
    inFlight = false,
  } = {}) {
    const planReady = String(planStatus || "") === "Ready";
    const count = `${Number(readyCount || 0)}/${targetCount || "?"}`;
    if (!planReady) {
      return { disabled: true, label: "Prepare", retry: false };
    }
    if (inFlight) {
      return { disabled: true, label: `Preparing… ${count}`, retry: false };
    }
    if (variantStatus === "Ready") {
      return { disabled: false, label: "Rebuild", retry: false };
    }
    if (variantStatus === "Preparing") {
      return { disabled: false, label: `Retry remaining (${count})`, retry: true };
    }
    if (variantStatus === "Error") {
      return { disabled: false, label: "Retry", retry: true };
    }
    return { disabled: false, label: "Prepare", retry: false };
  }

  function syncProductionStudioState() {
    syncFinishedMediaHeadings();
    const asset = $("item4AssetStatus");
    const plan = $("item4PlanStatus");
    const variant = $("item4VariantStatus");
    [asset, plan, variant].forEach((el) => {
      if (el) el.dataset.state = productionPillState(el.textContent);
    });
    const assetState = asset?.dataset.state || "idle";
    const planState = plan?.dataset.state || "idle";
    const variantState = variant?.dataset.state || "idle";
    const steps = {
      media: assetState === "ready" ? "complete" : "current",
      plan: assetState === "ready" ? (planState === "ready" ? "complete" : "current") : "idle",
      frames: planState === "ready" ? (variantState === "ready" ? "complete" : "current") : "idle",
    };
    document.querySelectorAll("[data-production-step]").forEach((el) => {
      el.dataset.progress = steps[el.dataset.productionStep] || "idle";
    });
  }

  function item4AssetExtension(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function item4IsHeicAsset(asset) {
    const mime = String(asset?.mime_type || "").toLowerCase();
    const ext = item4AssetExtension(asset?.name);
    return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif";
  }

  function item4DriveThumbnailUrl(fileId) {
    const id = String(fileId || "").trim();
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : "";
  }

  function item4NextPreviewRetry(attempt) {
    const current = Math.max(0, Number(attempt) || 0);
    if (current >= ITEM4_PREVIEW_RETRY_MAX) {
      return { retry: false, attempt: current, wait_ms: null, hard_refresh_required: false };
    }
    return { retry: true, attempt: current + 1, wait_ms: ITEM4_PREVIEW_RETRY_MS, hard_refresh_required: false };
  }

  function item4CacheBustedPreviewUrl(url, attempt) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    const [withoutHash, hash = ""] = raw.split("#");
    const [path, query = ""] = withoutHash.split("?");
    const params = new URLSearchParams(query);
    params.set("heal", String(attempt));
    return `${path}?${params.toString()}${hash ? `#${hash}` : ""}`;
  }

  function item4NextStatusPoll(elapsedMs, windowMs, extraWindowsUsed) {
    if (Number(elapsedMs) < Number(windowMs)) {
      return { continue: true, delay_ms: ITEM4_MASTER_POLL_MS, mode: "observe", extra_windows_used: extraWindowsUsed, hard_refresh_required: false };
    }
    if (Number(extraWindowsUsed) < ITEM4_POLL_EXTRA_WINDOWS) {
      return { continue: true, delay_ms: ITEM4_POLL_EXTRA_MS, mode: "revalidate", extra_windows_used: Number(extraWindowsUsed) + 1, hard_refresh_required: false };
    }
    return { continue: false, delay_ms: null, mode: "await-visibility", extra_windows_used: extraWindowsUsed, hard_refresh_required: false };
  }

  function item4PreviewUrlLooksLikeImage(url) {
    const raw = String(url || "").trim();
    if (!raw) return false;
    if (raw.startsWith("blob:")) {
      return [...ezLocalClipPosters.values()].includes(raw);
    }
    if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(raw)) return false;
    if (/thumbnail\?id=/i.test(raw)) return false;
    return /googleusercontent|\.jpe?g(\?|#|$)|\.png(\?|#|$)|\.webp(\?|#|$)|\.gif(\?|#|$)|clip-posters/i.test(raw);
  }

  function item4ClipPosterLooksReal(url) {
    const raw = String(url || "").trim();
    if (!raw || raw.startsWith("blob:")) return [...ezLocalClipPosters.values()].includes(raw);
    if (/\.svg(\?|#|$)/i.test(raw) || /\/api\/media-assets\//i.test(raw)) return false;
    return item4PreviewUrlLooksLikeImage(raw);
  }

  function item4AssetPreviewCandidates(asset) {
    try {
      if (item4AssetLooksLikeVideo(asset)) {
        const candidates = [];
        const local = item4LocalClipPoster(asset?.name) || item4LocalClipPoster(asset?.id);
        const poster = String(asset?.poster_url || "").trim();
        if (local) candidates.push(local);
        if (item4ClipPosterLooksReal(poster)) candidates.push(poster);
        return [...new Set(candidates.filter(Boolean))];
      }
      const candidates = [];
      const name = String(asset?.name || "");
      const local = ezLocalPreviewFor(Number(asset?.order || 0) - 1, name);
      const cdn = String(asset?.preview_url || "").trim();
      if (local) candidates.push(local);
      if (cdn && item4PreviewUrlLooksLikeImage(cdn)) candidates.push(cdn);
      const recordId = String(asset?.media_asset_record_id || "").trim();
      if (/^rec[A-Za-z0-9]+$/.test(recordId)) {
        candidates.push(`${apiBase}/api/media-assets/${encodeURIComponent(recordId)}/preview`);
      }
      const driveThumb = item4DriveThumbnailUrl(asset?.google_drive_file_id);
      if (driveThumb) candidates.push(driveThumb);
      return [...new Set(candidates.filter(Boolean))];
    } catch {
      return [];
    }
  }

  function item4BindPreviewImage(img, { placeholder, candidates, failureKey } = {}) {
    const chain = (Array.isArray(candidates) && candidates.length
      ? candidates
      : [String(img.dataset.previewSrc || img.getAttribute("src") || "").trim()])
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    if (!chain.length) return;

    const key = String(failureKey || img.dataset.previewFailureKey || chain[0] || "").trim();
    const prior = item4PreviewFailures.get(key);
    if (prior?.exhaustedAt && Date.now() - prior.exhaustedAt >= ITEM4_POLL_EXTRA_MS) {
      item4PreviewFailures.delete(key);
    }
    const blocked = item4PreviewFailures.get(key);
    // Only suppress while cooldown is active. After cooldown, retry even if
    // earlier attempts hit ITEM4_PREVIEW_RETRY_MAX (previews often become Ready later).
    if (blocked?.exhaustedAt && Date.now() - blocked.exhaustedAt < ITEM4_POLL_EXTRA_MS) {
      const host = img.closest(".item4-thumb, .item4-variant-image-wrap");
      if (host && typeof placeholder === "function") host.innerHTML = placeholder();
      return;
    }

    let candidateIndex = Math.max(0, Number(img.dataset.previewCandidate || 0) || 0);
    if (candidateIndex >= chain.length) candidateIndex = 0;
    img.dataset.previewFailureKey = key;
    img.dataset.previewCandidate = String(candidateIndex);
    if (String(img.getAttribute("src") || "") !== chain[candidateIndex]) {
      img.src = chain[candidateIndex];
    }

    img.addEventListener("load", () => {
      item4PreviewFailures.delete(key);
    }, { once: true });

    img.addEventListener("error", () => {
      if (!img.isConnected) return;
      const nextIndex = candidateIndex + 1;
      if (nextIndex < chain.length) {
        candidateIndex = nextIndex;
        img.dataset.previewCandidate = String(candidateIndex);
        img.src = item4CacheBustedPreviewUrl(chain[candidateIndex], candidateIndex);
        return;
      }

      const recorded = item4PreviewFailures.get(key) || { attempt: 0 };
      const decision = item4NextPreviewRetry(recorded.attempt);
      recorded.attempt = decision.attempt;
      item4PreviewFailures.set(key, recorded);
      if (decision.retry) {
        candidateIndex = 0;
        img.dataset.previewCandidate = "0";
        window.setTimeout(() => {
          if (!img.isConnected) return;
          img.src = item4CacheBustedPreviewUrl(chain[0], decision.attempt);
        }, decision.wait_ms);
        return;
      }
      recorded.exhaustedAt = Date.now();
      item4PreviewFailures.set(key, recorded);
      const host = img.closest(".item4-thumb, .item4-variant-image-wrap");
      if (host && typeof placeholder === "function") host.innerHTML = placeholder();
    }, { once: false });
  }

  function item4AssetPreviewUrl(asset) {
    return item4AssetPreviewCandidates(asset)[0] || "";
  }

  function item4ClipStreamUrl(asset) {
    const recordId = String(asset?.media_asset_record_id || "").trim()
      || (/^rec[A-Za-z0-9]+$/.test(String(asset?.id || "").trim()) ? String(asset.id).trim() : "");
    if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return "";
    return `${apiBase}/api/media-assets/${encodeURIComponent(recordId)}/stream`;
  }

  function formatLibraryClipDuration(seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return "";
    const total = Math.round(value);
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = total % 60;
    if (hours) return `${hours}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function libraryDurationLine(record) {
    if (String(record?.media_kind || "").toLowerCase() !== "video") return "";
    const formatted = formatLibraryClipDuration(record?.duration_seconds);
    return formatted ? `Length ${formatted}` : "";
  }

  function libraryFileBytes(record) {
    const bytes = Number(record?.file_size_bytes || 0);
    if (Number.isFinite(bytes) && bytes > 0) return Math.round(bytes);
    const mb = Number(record?.file_size_mb || 0);
    if (Number.isFinite(mb) && mb > 0) return Math.round(mb * 1024 * 1024);
    return 0;
  }

  function formatLibraryFileSize(bytes) {
    const value = Number(bytes);
    if (!Number.isFinite(value) || value <= 0) return "";
    const kb = 1024;
    const mb = kb * 1024;
    const gb = mb * 1024;
    const trim = (n) => (n >= 100 ? String(Math.round(n)) : String(Math.round(n * 10) / 10));
    if (value < kb) return `${Math.round(value)} B`;
    if (value < mb) return `${trim(value / kb)} KB`;
    if (value < gb) return `${trim(value / mb)} MB`;
    return `${trim(value / gb)} GB`;
  }

  function librarySizeLine(record) {
    return formatLibraryFileSize(libraryFileBytes(record));
  }

  function libraryListClassName(mode) {
    if (mode === "list") return "library-list library-list--text";
    if (mode === "thumbs") return "library-list library-list--thumbs";
    return "library-grid";
  }

  function item4RememberClipDuration(keys, seconds) {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value <= 0) return;
    (Array.isArray(keys) ? keys : [keys]).forEach((key) => {
      const id = String(key || "").trim();
      if (id) item4ClipDurationCache.set(id, value);
    });
  }

  function item4KnownClipDuration(item) {
    const stored = Number(item?.duration_seconds || 0);
    if (Number.isFinite(stored) && stored > 0) return stored;
    for (const key of [item?.id, item?.media_asset_record_id, item?.name]) {
      const cached = item4ClipDurationCache.get(String(key || ""));
      if (cached) return cached;
    }
    return 0;
  }

  function item4HeldClipObjectUrl(asset) {
    const file = item4HeldClipFiles.get(String(asset?.name || "")) || item4HeldClipFiles.get(String(asset?.id || ""));
    if (!file) return "";
    const key = String(asset?.id || asset?.name || "");
    if (!key) return "";
    if (!item4ClipObjectUrls.has(key)) item4ClipObjectUrls.set(key, URL.createObjectURL(file));
    return item4ClipObjectUrls.get(key);
  }

  function item4PlayableClipSrc(asset) {
    return item4ClipStreamUrl(asset) || item4HeldClipObjectUrl(asset);
  }

  function item4ClipDurationBadgeHtml(seconds) {
    const label = formatLibraryClipDuration(seconds);
    return `<em class="item4-clip-duration"${label ? "" : " hidden"}>${escapeHtml(label)}</em>`;
  }

  function item4ClipPlayerHtml({ previewUrl = "", streamUrl = "", name = "Clip", durationSeconds = 0, asset = null, preload = false } = {}) {
    const seconds = item4KnownClipDuration({
      duration_seconds: durationSeconds,
      id: asset?.id,
      media_asset_record_id: asset?.media_asset_record_id,
      name,
    });
    const src = String(streamUrl || "").trim();
    const img = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(name || "Clip")}" loading="lazy" class="item4-clip-poster"${asset ? ` data-item4-preview-image data-preview-src="${escapeHtml(previewUrl)}" data-preview-failure-key="${escapeHtml(String(asset.id || asset.media_asset_record_id || previewUrl))}"` : ""}>`
      : "";
    const video = src
      ? `<video muted playsinline class="item4-clip-video"${preload ? ` src="${escapeHtml(src)}" preload="metadata"` : ` preload="none" data-item4-stream="${escapeHtml(src)}"`}></video>`
      : "";
    if (!img && !video) return "";
    return `<div class="item4-clip-poster-wrap" data-item4-clip-player data-clip-key="${escapeHtml(String(asset?.id || asset?.media_asset_record_id || name || ""))}">
      ${img}${video}
      ${src ? `<button type="button" class="item4-clip-play" data-item4-play aria-label="Play ${escapeHtml(name || "clip")}"></button>` : `<span class="item4-clip-play" aria-hidden="true"></span>`}
      ${item4ClipDurationBadgeHtml(seconds)}
    </div>`;
  }

  function item4PaintClipDuration(wrap, seconds) {
    const label = formatLibraryClipDuration(seconds);
    if (!label || !wrap) return;
    const badge = wrap.querySelector(".item4-clip-duration");
    if (badge) {
      badge.textContent = label;
      badge.hidden = false;
    }
    const card = wrap.closest("[data-item4-asset], .idea-library-card, .library-card");
    const durationLine = card?.querySelector("[data-library-duration]");
    if (durationLine) {
      durationLine.textContent = `Length ${label}`;
      durationLine.hidden = false;
    } else {
      const nameLine = card?.querySelector(".item4-asset-meta span, .idea-library-card > span, h3");
      if (nameLine && !/\d+:\d{2}/.test(String(nameLine.textContent || ""))) {
        nameLine.textContent = `${String(nameLine.textContent || "").replace(/\s+$/, "")} · ${label}`;
      }
    }
  }

  function item4UnloadClipStream(wrap) {
    const video = wrap?.querySelector("video");
    if (!wrap || !video) return;
    try { video.pause(); } catch {}
    wrap.classList.remove("is-playing", "is-loading", "is-failed");
    video.controls = false;
    if (video.dataset.item4Stream) {
      video.removeAttribute("src");
      try { video.load(); } catch {}
    }
  }

  function item4PauseOtherClipPlayers(active) {
    document.querySelectorAll("[data-item4-clip-player]").forEach((wrap) => {
      if (wrap === active) return;
      const inLibrary = Boolean(wrap.closest(".library-card"));
      const video = wrap.querySelector("video");
      const busy = wrap.classList.contains("is-playing") || wrap.classList.contains("is-loading") || Boolean(video?.getAttribute("src"));
      if (inLibrary) {
        if (busy) item4UnloadClipStream(wrap);
        return;
      }
      if (!wrap.classList.contains("is-playing")) return;
      try { video?.pause(); } catch {}
      wrap.classList.remove("is-playing", "is-loading");
      if (video) video.controls = false;
    });
  }

  function item4BindClipPlayers(root) {
    if (!root) return;
    root.querySelectorAll("[data-item4-clip-player]").forEach((wrap) => {
      if (wrap.dataset.boundPlayer) return;
      wrap.dataset.boundPlayer = "1";
      const video = wrap.querySelector("video");
      const play = wrap.querySelector("[data-item4-play]");
      const applyDuration = () => {
        const seconds = Number(video?.duration || 0);
        if (!Number.isFinite(seconds) || seconds <= 0) return;
        item4RememberClipDuration(wrap.dataset.clipKey, seconds);
        const card = wrap.closest("[data-item4-asset]");
        const asset = (item4Workspace?.assets || []).find((row) => String(row?.id || "") === String(card?.dataset?.item4Asset || ""));
        if (asset) asset.duration_seconds = seconds;
        const libraryCard = wrap.closest("[data-item4-library-id], [data-library-id]");
        const libraryId = libraryCard?.getAttribute("data-item4-library-id") || libraryCard?.getAttribute("data-library-id");
        if (libraryId) {
          item4RememberClipDuration(libraryId, seconds);
          const row = item4LibraryItems.find((item) => item.id === libraryId) || ideaLibraryPickerItems.find((item) => item.id === libraryId);
          if (row) row.duration_seconds = seconds;
          persistLibraryClipDuration(libraryId, seconds, wrap.closest(".library-card"));
        }
        item4PaintClipDuration(wrap, seconds);
      };
      const ensureSrc = () => {
        if (!video) return false;
        const pending = String(video.dataset.item4Stream || "").trim();
        if (!pending) return false;
        if (video.dataset.item4Failed === "1") {
          video.removeAttribute("src");
          try { video.load(); } catch {}
          delete video.dataset.item4Failed;
        }
        if (video.currentSrc || video.getAttribute("src")) return true;
        video.src = pending;
        return true;
      };
      const restorePoster = () => {
        wrap.classList.remove("is-playing", "is-loading");
        if (video) video.controls = false;
      };
      video?.addEventListener("loadedmetadata", applyDuration);
      play?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (!video || !ensureSrc()) return;
        item4PauseOtherClipPlayers(wrap);
        wrap.classList.remove("is-failed");
        wrap.classList.add("is-loading");
        video.muted = false;
        video.play().catch(() => {
          wrap.classList.add("is-failed");
          restorePoster();
        });
      });
      video?.addEventListener("play", () => {
        item4PauseOtherClipPlayers(wrap);
      });
      video?.addEventListener("playing", () => {
        wrap.classList.remove("is-loading", "is-failed");
        wrap.classList.add("is-playing");
        video.controls = true;
      });
      video?.addEventListener("error", () => {
        if (video.dataset.item4Failed === "1") return;
        video.dataset.item4Failed = "1";
        wrap.classList.add("is-failed");
        restorePoster();
        if (video.dataset.item4Stream) {
          video.removeAttribute("src");
          try { video.load(); } catch {}
        }
      });
      video?.addEventListener("pause", () => {
        if (video.ended) restorePoster();
      });
      video?.addEventListener("ended", () => {
        restorePoster();
      });
      if (video?.readyState >= 1) applyDuration();
    });
    item4ProbeVisibleClipDurations(root);
  }

  function item4ProbeVisibleClipDurations(root) {
    const videos = [...(root?.querySelectorAll("video[data-item4-stream]") || [])]
      .filter((video) => !video.currentSrc && !video.dataset.probedDuration)
      .filter((video) => !video.closest(".library-card"))
      .filter((video) => video.closest(".library-card")?.dataset.libraryNeedsDuration !== "0");
    if (!videos.length) return;
    const start = (video) => {
      if (!video.isConnected || video.dataset.probedDuration || video.currentSrc) return;
      const stream = String(video.dataset.item4Stream || "").trim();
      if (!stream) return;
      video.dataset.probedDuration = "1";
      video.preload = "metadata";
      video.src = stream;
    };
    if (!window.IntersectionObserver) {
      videos.slice(0, 4).forEach(start);
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        start(entry.target);
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.2 });
    videos.forEach((video) => observer.observe(video));
  }

  function item4AssetPlaceholder(asset, label = "Preview unavailable") {
    const isVideo = item4AssetLooksLikeVideo(asset);
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const format = ext || (isVideo ? "CLIP" : (item4IsHeicAsset(asset) ? "HEIC" : "IMAGE"));
    const seconds = item4KnownClipDuration(asset);
    const clipLabel = isVideo
      ? (seconds > 0 ? `${formatLibraryClipDuration(seconds)} clip saved` : "Clip saved")
      : label;
    return `<div class="item4-heic-placeholder item4-image-placeholder${isVideo ? " item4-clip-placeholder" : ""}">${isVideo ? `<span class="item4-clip-play" aria-hidden="true"></span>` : ""}<strong>${escapeHtml(format)}</strong><span>${escapeHtml(isVideo ? clipLabel : label)}</span></div>`;
  }

  function item4AssetThumb(asset) {
    const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : "Original";
    const isHeic = item4IsHeicAsset(asset);
    const isVideo = item4AssetLooksLikeVideo(asset);
    const candidates = item4AssetPreviewCandidates(asset);
    const previewUrl = candidates[0] || "";
    const streamUrl = isVideo ? item4PlayableClipSrc(asset) : "";
    const visual = isVideo
      ? (item4ClipPlayerHtml({ previewUrl, streamUrl, name: asset.name || "Clip", durationSeconds: asset.duration_seconds, asset, preload: Boolean(streamUrl) }) || item4AssetPlaceholder(asset, "Clip saved"))
      : previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(asset.name || "Master photo")}" loading="lazy" data-item4-preview-image data-preview-src="${escapeHtml(previewUrl)}" data-preview-failure-key="${escapeHtml(String(asset.id || asset.media_asset_record_id || previewUrl))}">`
        : item4AssetPlaceholder(asset, isHeic ? "Original preserved" : "Preview unavailable");
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const seconds = item4KnownClipDuration(asset);
    const durationNote = isVideo && seconds > 0 ? ` · ${formatLibraryClipDuration(seconds)}` : "";
    const formatNote = ext ? ` · ${ext} original` : (isHeic ? " · HEIC original" : "");
    const showCaption = ezManualCaptionsEnabled() && (ezPhotoSetActive() || ezIntakeKind === "single-photo");
    const captionField = showCaption ? item4CaptionField(asset.id) : "";
    const canRemove = asset.id && !String(asset.id).startsWith("local:");
    return `<article class="item4-asset-card${showCaption ? " with-caption" : ""}" data-item4-asset="${escapeHtml(asset.id)}">
      <div class="item4-thumb">${visual}</div>
      <div class="item4-asset-meta"><strong>${escapeHtml(asset.name || (isVideo ? "Clip" : "Photo"))}</strong><span>${escapeHtml(isVideo ? `Clip ${asset.order || ""}` : `Photo ${asset.order || ""}`)} · ${escapeHtml(dims)}${durationNote}${formatNote}</span></div>
      ${captionField}
      ${canRemove ? `<button type="button" class="item4-remove-asset" data-remove-item4-asset="${escapeHtml(asset.id)}" title="${ezIsFinishedVideo() ? "Remove this video" : "Remove this photo"}">×</button>` : ""}
    </article>`;
  }

  function renderItem4Assets(status) {
    syncFinishedMediaHeadings();
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const host = $("item4AssetStrip");
    const badge = $("item4AssetStatus");
    const authority = String(status?.assets_status || "None");
    if (badge) {
      const counts = item4ClipCountsFromStatus({ assets });
      const phrase = item4MediaCountPhrase(counts);
      badge.textContent = !assets.length
        ? "No media yet"
        : authority === "Ready"
          ? `${phrase} ready`
          : authority === "Error"
            ? `${phrase} need attention`
            : `${phrase} processing`;
    }
    if (!host) {
      syncProductionStudioState();
      return;
    }
    hydrateEzCaptionDrafts(status);
    const signature = assets.map((asset) => `${asset.id}|${asset.name}|${asset.poster_url || ""}|${asset.preview_url || ""}|${asset.google_drive_file_id || ""}`).join(";");
    if (!assets.length && (item4Uploading || ezStagedFiles.length || String(status?.assets_status || "") === "Uploading")) {
      item4AssetStripSignature = "";
      host.innerHTML = `<div class="empty compact-empty">${ezIsFinishedVideo() ? "Video is loading into the system." : "Photos are loading into the system."} You can keep working or leave this screen.</div>`;
    } else if (signature && signature === item4AssetStripSignature && host.querySelector("[data-item4-asset]")) {
      syncFinishedMediaHeadings();
      syncProductionStudioState();
      item4EnsureClipPosters(assets);
      return;
    } else {
      item4AssetStripSignature = signature;
      host.innerHTML = assets.length ? assets.map(item4AssetThumb).join("") : '<div class="empty compact-empty"></div>';
    }
    host.querySelectorAll("[data-item4-preview-image]").forEach((img) => {
      const card = img.closest("[data-item4-asset]");
      const asset = assets.find((row) => String(row?.id || "") === String(card?.dataset?.item4Asset || ""));
      item4BindPreviewImage(img, {
        candidates: item4AssetPreviewCandidates(asset || {}),
        failureKey: String(asset?.id || asset?.media_asset_record_id || img.dataset.previewFailureKey || "").trim(),
        placeholder: () => item4AssetPlaceholder(asset || {}, item4IsHeicAsset(asset) ? "Original preserved" : "Preview unavailable"),
      });
    });
    host.querySelectorAll("[data-remove-item4-asset]").forEach(button => button.addEventListener("click", () => removeItem4Asset(button.dataset.removeItem4Asset)));
    item4BindClipPlayers(host);
    bindEzCaptionInputs(host);
    productionDecorateTooltips(host);
    syncFinishedMediaHeadings();
    syncProductionStudioState();
    item4EnsureClipPosters(assets);
  }

  function item4PlanCard(item) {
    const companion = Boolean(item.companion) || item.output_type === "Story";
    const options = Array.isArray(item.available_output_types) ? item.available_output_types : [item.output_type];
    const ratio = item.aspect_ratio || "Needs review";
    const count = Number(item.source_asset_count || item4Workspace?.assets?.length || 0);
    const rationale = String(item.rationale || "").replace(/five photos/ig, `${count} photo${count === 1 ? "" : "s"}`);
    const formatControl = companion
      ? `<div class="form-field"><span>Format</span><strong>${escapeHtml(item.output_type)} companion</strong></div>`
      : `<label class="form-field"><span>Format</span><select data-item4-format="${escapeHtml(item.platform)}">${options.map(x => `<option${x === item.output_type ? " selected" : ""}>${escapeHtml(x)}</option>`).join("")}</select></label>`;
    return `<article class="item4-plan-card" data-item4-plan-platform="${escapeHtml(item.platform)}">
      <div class="item4-plan-card-top"><strong>${escapeHtml(item.platform)}</strong><span class="item4-ratio-chip">${escapeHtml(ratio)}</span></div>
      ${formatControl}
      <div class="item4-plan-why">${escapeHtml(rationale)}</div>
      <div class="item4-plan-source">${item.aspect_ratio ? `Ratio authority: ${escapeHtml(item.ratio_source || "Platform Output Mappings")}` : "Ratio mapping needs review before production."}</div>
    </article>`;
  }

  function renderItem4Plan(status) {
    const plan = status?.plan || null;
    const host = $("item4OutputPlan");
    const badge = $("item4PlanStatus");
    const gate = $("item4ProductionGate");
    if (badge) badge.textContent = item4StateLabel(status?.plan_status, "Needs plan");
    if (!host) {
      syncProductionStudioState();
      return;
    }
    if (!plan?.items?.length) {
      host.innerHTML = '<div class="empty compact-empty"></div>';
      if (gate) gate.hidden = true;
      syncProductionStudioState();
      return;
    }
    host.innerHTML = plan.items.map(item4PlanCard).join("");
    item4PlanOverrides = Object.fromEntries(
      plan.items
        .filter((item) => !item.companion && item.output_type !== "Story")
        .map((item) => [item.platform, item.output_type])
    );
    host.querySelectorAll("[data-item4-format]").forEach(select => {
      select.addEventListener("change", () => {
        item4PlanOverrides[select.dataset.item4Format] = select.value;
        if (ezIsOriginRecord()) {
          maybeAutoEzPlan(true);
          return;
        }
        const button = $("item4BuildPlan");
        if (button) button.textContent = "Update formats";
      });
    });
    if (gate) gate.hidden = status?.plan_status !== "Ready";
    productionDecorateTooltips(host);
    syncProductionStudioState();
  }

  function item4MediaAssetPreviewUrl(recordId) {
    const id = String(recordId || "").trim();
    return /^rec[A-Za-z0-9]+$/.test(id)
      ? `${apiBase}/api/media-assets/${encodeURIComponent(id)}/preview`
      : "";
  }

  function item4VariantPreviewUrl(variant) {
    if (!variant) return "";
    return String(variant.preview_url || "").trim()
      || item4MediaAssetPreviewUrl(variant.media_asset_record_id)
      || String(variant.url || "").trim();
  }

  function item4VariantAssets(manifest) {
    if (Array.isArray(manifest?.assets)) return manifest.assets;
    if (Array.isArray(manifest?.asset_manifest)) return manifest.asset_manifest;
    if (Array.isArray(manifest?.items)) return manifest.items;
    return [];
  }

  function item4RequiredRatios(manifest) {
    if (Array.isArray(manifest?.required_ratios) && manifest.required_ratios.length) return manifest.required_ratios;
    const ratios = new Set();
    item4VariantAssets(manifest).forEach(asset => {
      Object.keys(asset?.variants || {}).forEach(ratio => ratios.add(ratio));
    });
    return [...ratios];
  }

  function item4PlanRatios(status) {
    const fromManifest = item4RequiredRatios(status?.variants);
    if (fromManifest.length) return fromManifest;
    const ratios = [];
    (Array.isArray(status?.plan?.items) ? status.plan.items : []).forEach((item) => {
      const ratio = String(item?.aspect_ratio || "").trim();
      if (ratio && !ratios.includes(ratio)) ratios.push(ratio);
    });
    return ratios;
  }

  function item4CropKey(assetId, ratio) {
    return `${assetId}::${ratio}`;
  }

  function item4CropStorageKey() {
    return `cs-item4-crops:${activeProductionRequest?.id || ""}`;
  }

  function item4DefaultCrop() {
    return { x: 0.5, y: 0.5, zoom: 1 };
  }

  function item4ClampCrop(point) {
    const x = Number(point?.x);
    const y = Number(point?.y);
    const zoom = Number(point?.zoom);
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      return { ...item4DefaultCrop(), zoom: Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1 };
    }
    return {
      x: Math.min(1, Math.max(0, x)),
      y: Math.min(1, Math.max(0, y)),
      zoom: Number.isFinite(zoom) ? Math.min(4, Math.max(1, zoom)) : 1,
    };
  }

  function item4TwoAxisZoom(frameW, frameH, naturalW, naturalH) {
    const nw = Math.max(1, naturalW || 1);
    const nh = Math.max(1, naturalH || 1);
    const fw = Math.max(1, frameW || 1);
    const fh = Math.max(1, frameH || 1);
    const cover = Math.max(fw / nw, fh / nh);
    const minExtra = Math.max(36, 0.22 * Math.min(fw, fh));
    const needed = Math.max((fw + minExtra) / nw, (fh + minExtra) / nh);
    return Math.min(4, Math.max(1, needed / cover));
  }

  function item4CropMetrics(frame, img, crop) {
    const fw = Math.max(1, frame.clientWidth || 1);
    const fh = Math.max(1, frame.clientHeight || 1);
    const nw = Math.max(1, img.naturalWidth || Number(img.dataset.naturalWidth) || 1);
    const nh = Math.max(1, img.naturalHeight || Number(img.dataset.naturalHeight) || 1);
    const cover = Math.max(fw / nw, fh / nh);
    const zoom = Math.max(1, Number(crop?.zoom) || 1);
    const scale = cover * zoom;
    const width = nw * scale;
    const height = nh * scale;
    const extraX = Math.max(0, width - fw);
    const extraY = Math.max(0, height - fh);
    const point = item4ClampCrop(crop);
    return {
      width,
      height,
      extraX,
      extraY,
      left: extraX > 0 ? -extraX * point.x : (fw - width) / 2,
      top: extraY > 0 ? -extraY * point.y : (fh - height) / 2,
      zoom,
      cover,
    };
  }

  function item4ApplyCropPosition(frame, img, crop) {
    if (!frame || !img) return;
    const point = item4ClampCrop(crop);
    const metrics = item4CropMetrics(frame, img, point);
    img.style.position = "absolute";
    img.style.inset = "auto";
    img.style.maxWidth = "none";
    img.style.width = `${metrics.width}px`;
    img.style.height = `${metrics.height}px`;
    img.style.left = `${metrics.left}px`;
    img.style.top = `${metrics.top}px`;
    img.style.objectFit = "fill";
    img.style.objectPosition = "center";
  }

  function item4GetCrop(assetId, ratio) {
    return item4ClampCrop(item4CropDrafts.get(item4CropKey(assetId, ratio)) || item4DefaultCrop());
  }

  function item4PersistCrops() {
    const id = activeProductionRequest?.id;
    if (!id || !item4CropDrafts.size) return;
    const payload = {};
    item4CropDrafts.forEach((point, key) => {
      payload[key] = item4ClampCrop(point);
    });
    try { localStorage.setItem(item4CropStorageKey(), JSON.stringify(payload)); } catch {}
  }

  function item4HydrateCrops(status) {
    const id = activeProductionRequest?.id || "";
    if (item4CropRequestId !== id) {
      item4CropDrafts.clear();
      item4CropRequestId = id;
    }
    const stored = {};
    try { Object.assign(stored, JSON.parse(localStorage.getItem(item4CropStorageKey()) || "{}")); } catch {}
    Object.entries(stored).forEach(([key, point]) => {
      if (!item4CropDrafts.has(key)) item4CropDrafts.set(key, item4ClampCrop(point));
    });
    (Array.isArray(status?.assets) ? status.assets : []).forEach((asset) => {
      Object.entries(asset?.crops || {}).forEach(([ratio, point]) => {
        const key = item4CropKey(asset.id, ratio);
        if (!item4CropDrafts.has(key)) item4CropDrafts.set(key, item4ClampCrop(point));
      });
    });
    item4VariantAssets(status?.variants).forEach((asset) => {
      Object.entries(asset?.variants || {}).forEach(([ratio, variant]) => {
        if (!variant?.crop) return;
        const key = item4CropKey(asset.id, ratio);
        if (!item4CropDrafts.has(key)) item4CropDrafts.set(key, item4ClampCrop(variant.crop));
      });
    });
  }

  function collectItem4Crops() {
    const crops = {};
    item4CropDrafts.forEach((point, key) => {
      const split = String(key).split("::");
      const assetId = split[0];
      const ratio = split.slice(1).join("::");
      if (!assetId || !ratio) return;
      crops[assetId] = crops[assetId] || {};
      crops[assetId][ratio] = item4ClampCrop(point);
    });
    return crops;
  }

  function item4MasterAsset(assetId) {
    return (Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [])
      .find((asset) => String(asset?.id || "") === String(assetId || "")) || null;
  }

  function item4VariantRows(manifest, ratio) {
    return item4VariantAssets(manifest)
      .map(asset => ({ asset, variant: asset?.variants?.[ratio] }))
      .filter(row => Boolean(row.variant));
  }

  function item4CropRows(status, ratio) {
    const variantById = new Map(
      item4VariantRows(status?.variants, ratio).map((row) => [String(row.asset?.id || ""), row])
    );
    const masters = Array.isArray(status?.assets) ? status.assets : [];
    if (masters.length) {
      return masters.map((asset) => {
        const match = variantById.get(String(asset.id || ""));
        return {
          asset: item4MasterAsset(asset.id) || asset,
          variant: match?.variant || null,
        };
      });
    }
    return item4VariantRows(status?.variants, ratio).map((row) => ({
      asset: item4MasterAsset(row.asset?.id) || row.asset,
      variant: row.variant,
    }));
  }

  function item4LiveCrop(frame, img, assetId, ratio) {
    const current = item4GetCrop(assetId, ratio);
    if (current.zoom > 1) return current;
    if (!img.naturalWidth || !frame.clientWidth) return current;
    const zoom = item4TwoAxisZoom(frame.clientWidth, frame.clientHeight, img.naturalWidth, img.naturalHeight);
    const next = { ...current, zoom };
    item4CropDrafts.set(item4CropKey(assetId, ratio), next);
    return next;
  }

  function item4BindCropFrame(frame) {
    const img = frame.querySelector("img");
    const assetId = frame.dataset.item4CropAsset;
    const ratio = frame.dataset.item4CropRatio;
    if (!img || !assetId || !ratio) return;
    const layout = () => {
      if (img.naturalWidth) {
        img.dataset.naturalWidth = String(img.naturalWidth);
        img.dataset.naturalHeight = String(img.naturalHeight);
      }
      const crop = item4LiveCrop(frame, img, assetId, ratio);
      item4ApplyCropPosition(frame, img, crop);
    };
    if (img.complete && img.naturalWidth) layout();
    else img.addEventListener("load", layout, { once: true });
    let pointer = null;
    const onMove = (event) => {
      if (!pointer) return;
      event.preventDefault();
      const crop = pointer.crop;
      const metrics = item4CropMetrics(frame, img, crop);
      const next = item4ClampCrop({
        ...crop,
        x: metrics.extraX > 1 ? crop.x - (event.clientX - pointer.x) / metrics.extraX : 0.5,
        y: metrics.extraY > 1 ? crop.y - (event.clientY - pointer.y) / metrics.extraY : 0.5,
      });
      item4CropDrafts.set(item4CropKey(assetId, ratio), next);
      item4ApplyCropPosition(frame, img, next);
    };
    const onUp = () => {
      if (!pointer) return;
      pointer = null;
      frame.classList.remove("is-dragging");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      item4PersistCrops();
    };
    frame.addEventListener("pointerdown", (event) => {
      if (event.button !== 0) return;
      if (event.target.closest("textarea, input, button, label")) return;
      event.preventDefault();
      pointer = { x: event.clientX, y: event.clientY, crop: item4LiveCrop(frame, img, assetId, ratio) };
      frame.classList.add("is-dragging");
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    });
    frame.addEventListener("wheel", (event) => {
      event.preventDefault();
      const current = item4LiveCrop(frame, img, assetId, ratio);
      const next = item4ClampCrop({
        ...current,
        zoom: current.zoom * (event.deltaY < 0 ? 1.08 : 1 / 1.08),
      });
      item4CropDrafts.set(item4CropKey(assetId, ratio), next);
      item4ApplyCropPosition(frame, img, next);
      item4PersistCrops();
    }, { passive: false });
  }

  function item4VariantPreviewCandidates(row) {
    const master = row?.asset || {};
    const chain = [];
    const variantUrl = item4VariantPreviewUrl(row?.variant);
    if (variantUrl) chain.push(variantUrl);
    for (const url of item4AssetPreviewCandidates(master)) {
      if (url && !chain.includes(url)) chain.push(url);
    }
    return chain;
  }

  function item4WorkspaceHasClips(status) {
    const assets = Array.isArray((status || {}).assets) ? status.assets : [];
    return assets.some((asset) => item4AssetLooksLikeVideo(asset))
      || item4ClipCountsFromStatus(status || {}).clips > 0;
  }

  function item4MastersNeedSave(status = item4Workspace) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    if (item4Uploading) return true;
    if (!ezPersistedAssetCount()) return true;
    return assets.some((asset) => {
      const id = String(asset?.id || "");
      return id.startsWith("local:") || id.startsWith("staged:");
    });
  }

  function item4UnsavedPrepareMessage() {
    if (item4Uploading) {
      return "Those files are still saving. Wait until they finish copying to Google Drive, then click Prepare.";
    }
    return "Those photos and clips are only on this tab. Use Choose files again and wait until they show as saved, then click Prepare.";
  }

  function item4ShowVariantError(message) {
    item4PrepareError = String(message || "").trim();
    const error = $("item4VariantError");
    if (!error) return;
    error.hidden = !item4PrepareError;
    error.textContent = item4PrepareError;
  }

  function item4FormatElapsed(ms) {
    const total = Math.max(0, Math.floor(Number(ms) / 1000) || 0);
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function stopItem4PrepareClock() {
    if (item4PrepareClockTimer) clearInterval(item4PrepareClockTimer);
    item4PrepareClockTimer = 0;
  }

  function ensureItem4PrepareClock() {
    if (item4PrepareClockTimer) return;
    if (!item4VariantPollStartedAt) item4VariantPollStartedAt = Date.now();
    item4PrepareClockTimer = setInterval(() => {
      updateItem4VariantProgress(item4Workspace || {});
    }, 1000);
  }

  function updateItem4VariantProgress(status) {
    const progress = $("item4VariantProgress");
    if (!progress) return;
    const variantStatus = String(status?.variant_status || "None");
    const busy = item4PreparingVariants || variantStatus === "Preparing";
    if (!busy) {
      progress.hidden = true;
      progress.innerHTML = "";
      delete progress.dataset.heal;
      stopItem4PrepareClock();
      return;
    }
    const clips = item4WorkspaceHasClips(status);
    const readyCount = Number(status?.variants?.ready_count || 0);
    const targetCount = Number(status?.variants?.target_count || status?.variants?.source_asset_count || 0);
    const elapsed = item4FormatElapsed(Date.now() - (item4VariantPollStartedAt || Date.now()));
    const count = targetCount ? `${readyCount} of ${targetCount} ready` : `${readyCount} ready`;
    progress.hidden = false;
    progress.dataset.heal = "preparing";
    progress.innerHTML = `<strong>${clips ? "Attaching clip frames" : "Preparing platform crops"}</strong><span>${escapeHtml(count)} · ${escapeHtml(elapsed)} elapsed. This page updates automatically. Click Retry remaining if the count stops moving.</span>`;
    ensureItem4PrepareClock();
  }

  function item4VariantClipThumb(asset) {
    const master = item4MasterAsset(asset?.id) || asset || {};
    const previewUrl = item4AssetPreviewUrl(master);
    const streamUrl = item4PlayableClipSrc(master);
    const visual = item4ClipPlayerHtml({
      previewUrl,
      streamUrl,
      name: master.name || "Clip",
      durationSeconds: master.duration_seconds,
      asset: master,
      preload: Boolean(streamUrl),
    }) || item4AssetPlaceholder(master, "Clip saved");
    const assetId = master.id || "";
    return `<article class="item4-variant-thumb item4-variant-clip" data-item4-asset="${escapeHtml(assetId)}">
      <div class="item4-variant-image-wrap" style="aspect-ratio:9 / 16">${visual}</div>
      <p class="item4-crop-hint">Clips skip photo crops. The same file is used for each platform frame.</p>
      <div class="item4-variant-meta">
        <strong>Clip ${escapeHtml(master.order || "")}</strong>
        <span>${escapeHtml(master.name || "")}</span>
      </div>
      ${item4CaptionField(assetId)}
    </article>`;
  }

  function item4VariantThumb(row, ratio) {
    const master = item4MasterAsset(row.asset?.id) || row.asset;
    if (item4AssetLooksLikeVideo(master)) return item4VariantClipThumb(master);
    const candidates = item4VariantPreviewCandidates({ asset: master, variant: row.variant });
    const previewUrl = candidates[0] || "";
    const cssRatio = String(ratio || "4:5").replace(":", " / ");
    const safe = ratio === "9:16" ? '<span class="item4-safe-overlay" title="Centered 4:5 critical-content safe zone"></span>' : "";
    const assetId = master?.id || row.asset?.id || "";
    const visual = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(row.asset?.name || "Platform-ready photo")}" draggable="false" data-item4-preview-image data-preview-src="${escapeHtml(previewUrl)}" data-preview-failure-key="${escapeHtml(String(assetId || previewUrl))}">`
      : `<div class="item4-heic-placeholder"><strong>${escapeHtml(ratio)}</strong><span>Preview unavailable</span></div>`;
    return `<article class="item4-variant-thumb">
      <div class="item4-variant-image-wrap item4-crop-frame" data-item4-crop-asset="${escapeHtml(assetId)}" data-item4-crop-ratio="${escapeHtml(ratio)}" style="aspect-ratio:${escapeHtml(cssRatio)}">${visual}${safe}</div>
      <p class="item4-crop-hint">Drag any direction. Use + / − or the scroll wheel to zoom.</p>
      <div class="item4-variant-meta">
        <strong>${ezIsFinishedVideo() ? "Video" : `Photo ${escapeHtml(row.asset?.order || "")}`}</strong>
        <span>${escapeHtml(row.asset?.name || "")}</span>
        <span class="item4-crop-tools">
          <button type="button" class="item4-crop-zoom" data-item4-crop-zoom="${escapeHtml(assetId)}" data-item4-crop-ratio="${escapeHtml(ratio)}" data-dir="-1">−</button>
          <button type="button" class="item4-crop-zoom" data-item4-crop-zoom="${escapeHtml(assetId)}" data-item4-crop-ratio="${escapeHtml(ratio)}" data-dir="1">+</button>
          <button type="button" class="item4-crop-reset" data-item4-crop-reset="${escapeHtml(assetId)}" data-item4-crop-ratio="${escapeHtml(ratio)}">Reset</button>
        </span>
      </div>
      ${item4CaptionField(assetId)}
    </article>`;
  }

  function renderItem4Variants(status) {
    const badge = $("item4VariantStatus");
    const hint = $("item4VariantHint");
    const error = $("item4VariantError");
    const host = $("item4VariantGallery");
    const button = $("item4PrepareVariants");
    if (ezIsFinishedVideo()) {
      if (badge) badge.textContent = "Not needed";
      if (error) {
        error.hidden = true;
        error.textContent = "";
      }
      if (button) {
        button.hidden = true;
        button.disabled = true;
      }
      if (hint) hint.textContent = "Finished video. Studio skips crops and Remotion.";
      if (host) host.innerHTML = '<div class="empty compact-empty">This file is already finished. Approve sends it to review as-is.</div>';
      updateItem4VariantProgress({});
      syncProductionStudioState();
      return;
    }
    if (button) button.hidden = false;
    const variantStatus = status?.variant_status || "None";
    const manifest = status?.variants || null;
    const readyCount = Number(manifest?.ready_count || 0);
    const targetCount = Number(manifest?.target_count || manifest?.source_asset_count || 0);
    const clipRequest = item4WorkspaceHasClips(status);
    if (badge) badge.textContent = variantStatus === "Ready"
      ? `${readyCount} frames ready`
      : variantStatus === "Preparing"
        ? `Preparing… ${readyCount}/${targetCount || "?"}`
        : variantStatus === "Error" ? "Needs attention" : "Waiting";
    const shownError = String(status?.variant_error || item4PrepareError || "").trim();
    if (error) {
      error.hidden = !shownError;
      error.textContent = shownError;
    }
    if (button) {
      const view = item4PrepareButtonView({
        planStatus: status?.plan_status,
        variantStatus,
        readyCount,
        targetCount,
        inFlight: item4PreparingVariants,
      });
      button.disabled = view.disabled;
      button.textContent = view.label;
    }
    if (hint) {
      hint.textContent = status?.plan_status !== "Ready"
        ? "Choose platforms first."
        : variantStatus === "Preparing"
          ? (clipRequest
            ? `Studio is attaching clip frames (${readyCount}/${targetCount || "?"}). Click Retry remaining if the count stops moving.`
            : `Studio is preparing crops in the background (${readyCount}/${targetCount || "?"}). Click Retry remaining if the count stops moving.`)
          : variantStatus === "Error"
            ? "Preparation stopped. Click Retry to send the leftover crops again. The originals are still safe."
            : variantStatus === "Ready"
              ? (clipRequest ? "These clips are the platform frames. Rebuild if you swapped files." : "Rebuild if you change the crop.")
              : (clipRequest ? "Click Prepare to attach these clips as platform frames. Clips skip photo crops." : "Click Prepare when the framing looks right.");
    }
    updateItem4VariantProgress(status);
    if (!host) {
      syncProductionStudioState();
      return;
    }
    const activeCaption = document.activeElement?.matches?.("[data-ez-asset-caption]") ? document.activeElement : null;
    const restoreCaption = activeCaption ? {
      id: String(activeCaption.dataset.ezAssetCaption || ""),
      value: activeCaption.value,
      start: activeCaption.selectionStart,
      end: activeCaption.selectionEnd,
      ratio: String(activeCaption.closest(".item4-variant-thumb")?.querySelector("[data-item4-crop-ratio]")?.dataset.item4CropRatio || ""),
    } : null;
    item4HydrateCrops(status);
    hydrateEzCaptionDrafts(status);
    const ratios = item4PlanRatios(status);
    const masters = Array.isArray(status?.assets) ? status.assets : [];
    const clipAssets = masters.filter(item4AssetLooksLikeVideo);
    const photoAssets = masters.filter((asset) => asset && !item4AssetLooksLikeVideo(asset));
    if (!ratios.length || !masters.length) {
      host.innerHTML = variantStatus === "Ready"
        ? `<div class="empty compact-empty">${clipRequest ? "Clip frames are ready. Previews are catching up." : "Crops are ready. Previews are catching up."}</div>`
        : `<div class="empty compact-empty">${clipRequest ? "Clip frames appear here after Prepare. Clips skip photo crops." : "Crops for 4:5, 9:16, 1:1, or 16:9 will appear here when a platform needs them."}</div>`;
      syncProductionStudioState();
      return;
    }
    const clipSection = clipAssets.length
      ? `<section class="item4-ratio-group"><div class="item4-ratio-heading"><div><strong>Clips</strong><span>${clipAssets.length} clip${clipAssets.length === 1 ? "" : "s"} · no crop</span></div></div><div class="item4-variant-strip">${clipAssets.map(item4VariantClipThumb).join("")}</div></section>`
      : "";
    const photoSections = photoAssets.length
      ? ratios.map((ratio) => {
        const rows = item4CropRows(status, ratio).filter((row) => !item4AssetLooksLikeVideo(row.asset));
        const spec = rows[0]?.variant || {};
        const safeNote = ratio === "9:16" ? '<span class="item4-safe-note">Dashed box = centered 4:5 critical-content zone</span>' : "";
        return `<section class="item4-ratio-group"><div class="item4-ratio-heading"><div><strong>${escapeHtml(ratio)}</strong><span>${escapeHtml(spec.width || "")}${spec.width ? "×" : ""}${escapeHtml(spec.height || "")}${spec.width ? " · " : ""}${rows.length} photo${rows.length === 1 ? "" : "s"} · drag to reframe</span></div>${safeNote}</div><div class="item4-variant-strip">${rows.map((row) => item4VariantThumb(row, ratio)).join("")}</div></section>`;
      }).join("")
      : "";
    host.innerHTML = clipSection + photoSections || (clipRequest
      ? '<div class="empty compact-empty">Clip frames appear here after Prepare.</div>'
      : '<div class="empty compact-empty">Crops for 4:5, 9:16, 1:1, or 16:9 will appear here when a platform needs them.</div>');
    host.querySelectorAll(".item4-crop-frame img[data-item4-preview-image]").forEach((img) => {
      const frame = img.closest(".item4-crop-frame");
      const assetId = frame?.dataset.item4CropAsset;
      const master = item4MasterAsset(assetId) || {};
      item4BindPreviewImage(img, {
        candidates: [...new Set([
          String(img.dataset.previewSrc || "").trim(),
          ...item4AssetPreviewCandidates(master),
        ].filter(Boolean))],
        failureKey: String(assetId || img.dataset.previewFailureKey || "").trim(),
        placeholder: () => item4AssetPlaceholder(master, "Preview unavailable"),
      });
    });
    host.querySelectorAll(".item4-crop-frame").forEach((frame) => item4BindCropFrame(frame));
    const refreshFrame = (assetId, ratio) => {
      const frame = host.querySelector(`.item4-crop-frame[data-item4-crop-asset="${CSS.escape(assetId)}"][data-item4-crop-ratio="${CSS.escape(ratio)}"]`);
      const img = frame?.querySelector("img");
      if (!frame || !img) return;
      item4ApplyCropPosition(frame, img, item4LiveCrop(frame, img, assetId, ratio));
    };
    host.querySelectorAll("[data-item4-crop-reset]").forEach((button) => {
      button.addEventListener("click", () => {
        const assetId = button.dataset.item4CropReset;
        const ratio = button.dataset.item4CropRatio;
        item4CropDrafts.set(item4CropKey(assetId, ratio), item4DefaultCrop());
        item4PersistCrops();
        refreshFrame(assetId, ratio);
      });
    });
    host.querySelectorAll("[data-item4-crop-zoom]").forEach((button) => {
      button.addEventListener("click", () => {
        const assetId = button.dataset.item4CropZoom;
        const ratio = button.dataset.item4CropRatio;
        const frame = host.querySelector(`.item4-crop-frame[data-item4-crop-asset="${CSS.escape(assetId)}"][data-item4-crop-ratio="${CSS.escape(ratio)}"]`);
        const img = frame?.querySelector("img");
        if (!frame || !img) return;
        const current = item4LiveCrop(frame, img, assetId, ratio);
        const next = item4ClampCrop({
          ...current,
          zoom: current.zoom * (button.dataset.dir === "1" ? 1.12 : 1 / 1.12),
        });
        item4CropDrafts.set(item4CropKey(assetId, ratio), next);
        item4ApplyCropPosition(frame, img, next);
        item4PersistCrops();
      });
    });
    host.querySelectorAll(".item4-variant-clip [data-item4-preview-image]").forEach((img) => {
      const card = img.closest("[data-item4-asset]");
      const master = item4MasterAsset(card?.dataset?.item4Asset) || {};
      item4BindPreviewImage(img, {
        candidates: item4AssetPreviewCandidates(master),
        failureKey: String(master.id || master.media_asset_record_id || img.dataset.previewFailureKey || "").trim(),
        placeholder: () => item4AssetPlaceholder(master, "Clip saved"),
      });
    });
    item4BindClipPlayers(host);
    bindEzCaptionInputs(host);
    if (restoreCaption?.id) {
      const thumb = restoreCaption.ratio
        ? host.querySelector(`.item4-crop-frame[data-item4-crop-asset="${CSS.escape(restoreCaption.id)}"][data-item4-crop-ratio="${CSS.escape(restoreCaption.ratio)}"]`)?.closest(".item4-variant-thumb")
        : null;
      const next = thumb?.querySelector("[data-ez-asset-caption]")
        || host.querySelector(`[data-ez-asset-caption="${CSS.escape(restoreCaption.id)}"]`);
      document.querySelectorAll(`[data-ez-asset-caption="${CSS.escape(restoreCaption.id)}"]`).forEach((box) => {
        box.value = restoreCaption.value;
      });
      if (next) {
        ezCaptionDrafts.set(restoreCaption.id, restoreCaption.value);
        next.focus();
        try { next.setSelectionRange(restoreCaption.start, restoreCaption.end); } catch {}
      }
    }
    productionDecorateTooltips(host);
    syncProductionStudioState();
  }

  function stopItem4MasterPolling() {
    if (item4MasterPollTimer) clearTimeout(item4MasterPollTimer);
    item4MasterPollTimer = null;
    item4MasterPollStartedAt = 0;
  }

  function item4MasterReadyCount(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    return assets.filter(asset =>
      String(asset?.google_drive_file_id || "").trim() &&
      String(asset?.media_asset_record_id || "").trim()
    ).length;
  }

  function item4ClipCountsFromStatus(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    let photos = 0;
    let clips = 0;
    for (const asset of assets) {
      if (!asset || String(asset.id || "").startsWith("local:")) continue;
      if (item4AssetLooksLikeVideo(asset)) clips += 1;
      else photos += 1;
    }
    return { photos, clips, total: photos + clips };
  }

  function item4WaitingForClips(status) {
    if (!ezIsClipRequest() || ezIsFinishedVideo()) return false;
    const counts = item4ClipCountsFromStatus(status);
    const wantClips = Math.max(1, ezTargetClipCount());
    return counts.clips < wantClips;
  }

  function item4MasterReadyMessage(status) {
    if (ezIsFinishedVideo()) {
      return "Video is loaded into the system. You can keep working or leave this screen anytime.";
    }
    if (item4WaitingForClips(status)) {
      return ezIncompleteSetMessage(ezPersistedAssetCount())
        || "Photos are saved. Use Choose files again for the clips — they are not in the set yet.";
    }
    const counts = item4ClipCountsFromStatus(status);
    if (counts.clips || ezIsClipRequest()) {
      return `${item4MediaCountPhrase(counts)} are loaded. You can keep working or leave this screen anytime.`;
    }
    return "Photos are loaded into the system. You can keep working or leave this screen anytime.";
  }

  function item4MasterProgressMarkup(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const ready = item4Uploading && item4UploadBatchTotal
      ? item4UploadBatchDone
      : item4MasterReadyCount(status);
    const target = item4Uploading && item4UploadBatchTotal
      ? item4UploadBatchTotal
      : (assets.length || ezStagedFiles.length);
    const state = String(status?.assets_status || (item4Uploading ? "Uploading" : "None"));
    const loading = item4Uploading || state === "Uploading" || state === "Processing" || (target && state !== "Ready" && state !== "Error");
    if (!target && !loading) return null;
    if (item4WorkspaceCompressionFailed(status)) {
      return {
        heal: "error",
        title: "Video compression needs attention.",
        body: (status?.assets || []).find((asset) => String(asset?.compression_status || "").toLowerCase() === "failed")?.compression_error
          || "Studio could not compress this video automatically. Keep this tab open and try the same file again.",
      };
    }
    if (item4WorkspaceNeedsCompression(status)) {
      return {
        heal: "uploading",
        title: "Studio is compressing this video.",
        body: item4CompressionProgressLabel(status),
      };
    }
    if (!item4Uploading && state === "Ready" && item4WaitingForClips(status)) {
      const counts = item4ClipCountsFromStatus(status);
      const wantClips = Math.max(1, ezTargetClipCount());
      return {
        heal: "uploading",
        title: "Photos are saved. Add clips with Choose files.",
        body: `${counts.photos} photo${counts.photos === 1 ? "" : "s"} saved to Google Drive. ${counts.clips} of ${wantClips} clip${wantClips === 1 ? "" : "s"} saved. Use the same Choose files picker for remaining stills and clips.`,
      };
    }
    if (!item4Uploading && state === "Ready") {
      if (ezIsFinishedVideo()) {
        return {
          heal: "ready",
          title: "Video is loaded into the system.",
          body: "The finished video is stored and ready. Crops and Drive copies are skipped.",
        };
      }
      const counts = item4ClipCountsFromStatus(status);
      if (counts.clips || ezIsClipRequest()) {
        return {
          heal: "ready",
          title: "Photos and clips are loaded into the system.",
          body: `${item4MediaCountPhrase(counts)} saved to Google Drive. You can keep editing or leave this screen anytime.`,
        };
      }
      return {
        heal: "ready",
        title: "Photos are loaded into the system.",
        body: `${item4MediaCountPhrase(counts)} saved to Google Drive. You can keep editing or leave this screen anytime.`,
      };
    }
    if (state === "Error") {
      return {
        heal: "error",
        title: ezIsFinishedVideo() || ezIsClipRequest() ? "Media upload needs attention." : "Master photos need attention.",
        body: `${ready} of ${target} saved. Your originals remain in Studio. You can keep working or leave this screen.`,
      };
    }
    const count = target ? `${ready} of ${target} saved so far.` : "";
    const clipUpload = item4Uploading && ezIsClipRequest();
    return {
      heal: "uploading",
      title: ezIsFinishedVideo()
        ? "Video is loading into the system."
        : (clipUpload ? "Photos and clips are loading into the system." : "Photos are loading into the system."),
      body: ezIsFinishedVideo()
        ? "You can keep working on this screen, or leave and come back."
        : (clipUpload
          ? "Keep this tab open until the clip appears in the strip. Drive copies finish in the background."
          : "You can keep working on this screen, or leave and come back. Your photos stay in Studio while Google Drive copies finish in the background."),
      count,
    };
  }

  function updateItem4MasterProgress(status) {
    const markup = item4MasterProgressMarkup(status || {});
    ["item4UploadProgress", "ezUploadProgress"].forEach((id) => {
      const progress = $(id);
      if (!progress) return;
      if (!markup) {
        progress.hidden = true;
        progress.innerHTML = "";
        delete progress.dataset.heal;
        delete progress.dataset.phase6Tooltip;
        delete progress.dataset.studioTooltip;
        return;
      }
      progress.hidden = false;
      progress.dataset.heal = markup.heal;
      const countHtml = markup.count
        ? ` <em class="item4-upload-progress-count">${escapeHtml(markup.count)}</em>`
        : "";
      progress.innerHTML = `<strong>${escapeHtml(markup.title)}</strong><span>${escapeHtml(markup.body)}${countHtml}</span>`;
      const tip = `${markup.title} ${markup.body}`.trim();
      progress.dataset.phase6Tooltip = tip;
      if (typeof window.studioLockTooltip === "function") window.studioLockTooltip(progress, tip);
    });
  }

  function mergeItem4WorkspaceStatus(incoming) {
    const next = incoming && typeof incoming === "object" ? { ...incoming } : {};
    const incomingAssets = Array.isArray(next.assets) ? next.assets : [];
    const currentAssets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const uploading = item4Uploading
      || String(item4Workspace?.assets_status || "") === "Uploading"
      || String(next.assets_status || "") === "Uploading"
      || ezStagedFiles.length > 0;
    if (!incomingAssets.length && currentAssets.length && uploading) {
      next.assets = currentAssets;
      if (!next.assets_status || next.assets_status === "None") {
        next.assets_status = item4Workspace?.assets_status || "Uploading";
      }
      return next;
    }
    if (uploading && currentAssets.length) {
      const incomingNames = new Set(incomingAssets.map((asset) => String(asset?.name || "").toLowerCase()));
      const keepLocal = currentAssets.filter((asset) => {
        const id = String(asset?.id || "");
        const name = String(asset?.name || "").toLowerCase();
        return id.startsWith("local:") && name && !incomingNames.has(name);
      });
      if (keepLocal.length) next.assets = [...incomingAssets, ...keepLocal];
    }
    return next;
  }

  async function pollItem4MasterAssets() {
    if (!activeProductionRequest?.id) { stopItem4MasterPolling(); return; }
    if (!item4MasterPollStartedAt) item4MasterPollStartedAt = Date.now();
    try {
      await loadItem4Workspace(activeProductionRequest);
      const state = String(item4Workspace?.assets_status || "None");
      updateItem4MasterProgress(item4Workspace || {});
      if (item4WorkspaceCompressionFailed(item4Workspace)) {
        stopItem4MasterPolling();
        const failed = (item4Workspace?.assets || []).find((asset) => String(asset?.compression_status || "").toLowerCase() === "failed");
        const detail = String(failed?.compression_error || "").trim()
          || "Studio could not compress this video automatically. Try the same file again.";
        setRequestMessage(detail, "error-text");
        setEzMessage(detail, "error-text");
        return;
      }
      if (item4WorkspaceNeedsCompression(item4Workspace)) {
        setRequestMessage(item4CompressionProgressLabel(item4Workspace), "success");
        setEzMessage(item4CompressionProgressLabel(item4Workspace), "success");
        if (ezIsAzFinishedPath()) {
          setAzFinishedProgress("compressing");
          setAzFinishedMessage(item4CompressionProgressLabel(item4Workspace), "success");
        }
        const elapsed = Date.now() - item4MasterPollStartedAt;
        if (elapsed >= ITEM4_COMPRESS_POLL_TIMEOUT_MS) {
          stopItem4MasterPolling();
          setRequestMessage(ezIsAzFinishedPath()
            ? "Compression is still running in the background. You can close this tab."
            : "Compression is still running. Keep this tab open, or wait a minute and refresh.", "success");
          if (ezIsAzFinishedPath()) {
            setAzFinishedMessage("Compression is still running in the background. You can close this tab.", "success");
            startAzFinishedProgressPolling();
          }
          return;
        }
        item4MasterPollTimer = setTimeout(pollItem4MasterAssets, ITEM4_MASTER_POLL_MS);
        return;
      }
      if (state === "Ready") {
        stopItem4MasterPolling();
        setRequestMessage(item4MasterReadyMessage(item4Workspace || {}), "success");
        if (ezIsAzFinishedPath()) {
          startAzFinishedProgressPolling();
          return;
        }
        await maybeAutoEzPlan();
        return;
      }
      if (state === "Error") {
        stopItem4MasterPolling();
        setRequestMessage("Master-media preparation needs attention. Your uploaded originals remain preserved.", "error-text");
        return;
      }
      const decision = item4NextStatusPoll(Date.now() - item4MasterPollStartedAt, ITEM4_MASTER_POLL_TIMEOUT_MS, item4MasterExtraWindows);
      if (!decision.continue) {
        stopItem4MasterPolling();
        setRequestMessage(ezIsFinishedVideo()
          ? "Video is still loading into the system. You can keep working or leave this screen."
          : "Photos are still loading into the system. You can keep working or leave this screen; Studio will finish Drive copies in the background.", "success");
        return;
      }
      if (decision.mode === "revalidate") {
        item4MasterExtraWindows = decision.extra_windows_used;
        setRequestMessage(`${ezIsFinishedVideo() ? "Video is" : "Photos are"} still loading into the system. You can keep working or leave. Automatic retry ${item4MasterExtraWindows}/${ITEM4_POLL_EXTRA_WINDOWS}.`, "success");
        item4MasterPollTimer = setTimeout(pollItem4MasterAssets, decision.delay_ms);
        return;
      }
    } catch (error) {
      console.warn("Item 4 master-media status poll deferred", error);
    }
    item4MasterPollTimer = setTimeout(pollItem4MasterAssets, ITEM4_MASTER_POLL_MS);
  }

  function startItem4MasterPolling() {
    stopItem4MasterPolling();
    item4MasterPollStartedAt = Date.now();
    item4MasterExtraWindows = 0;
    item4MasterPollTimer = setTimeout(pollItem4MasterAssets, 800);
  }

  function stopItem4VariantPolling() {
    item4VariantPolling = false;
    if (item4VariantPollTimer) clearTimeout(item4VariantPollTimer);
    item4VariantPollTimer = null;
    item4VariantPollStartedAt = 0;
    stopItem4PrepareClock();
  }

  async function pollItem4Variants() {
    if (!activeProductionRequest?.id) { stopItem4VariantPolling(); return; }
    item4VariantPolling = true;
    if (item4VariantPollTimer) {
      clearTimeout(item4VariantPollTimer);
      item4VariantPollTimer = null;
    }
    if (!item4VariantPollStartedAt) item4VariantPollStartedAt = Date.now();
    try {
      await loadItem4Workspace(activeProductionRequest);
      const state = item4Workspace?.variant_status || "None";
      const clips = item4WorkspaceHasClips(item4Workspace || {});
      updateItem4VariantProgress(item4Workspace || {});
      if (state === "Ready") {
        stopItem4VariantPolling();
        setRequestMessage(clips
          ? "Clip frames are ready. Clips skip photo crops."
          : "Platform-ready media is complete. Review the prepared crops below.", "success");
        return;
      }
      if (state === "Error") {
        stopItem4VariantPolling();
        setRequestMessage(item4Workspace?.variant_error || "Platform-media preparation needs attention.", "error-text");
        return;
      }
      if (state === "None" && !item4PreparingVariants) {
        stopItem4VariantPolling();
        const unsaved = item4MastersNeedSave(item4Workspace || {});
        const message = unsaved
          ? item4UnsavedPrepareMessage()
          : (clips
            ? "Prepare did not finish attaching those clips. Click Prepare again."
            : "Prepare did not finish. Click Prepare again.");
        setRequestMessage(message, "error-text");
        item4ShowVariantError(message);
        renderItem4Variants(item4Workspace || {});
        return;
      }
      const readyCount = Number(item4Workspace?.variants?.ready_count || 0);
      const targetCount = Number(item4Workspace?.variants?.target_count || 0);
      const elapsed = item4FormatElapsed(Date.now() - item4VariantPollStartedAt);
      if (state === "Preparing") {
        setRequestMessage(clips
          ? `Attaching clip frames ${readyCount}/${targetCount || "?"} · ${elapsed} elapsed.`
          : `Preparing platform crops ${readyCount}/${targetCount || "?"} · ${elapsed} elapsed.`, "success");
      }
      const decision = item4NextStatusPoll(Date.now() - item4VariantPollStartedAt, ITEM4_VARIANT_POLL_TIMEOUT_MS, item4VariantExtraWindows);
      if (!decision.continue) {
        stopItem4VariantPolling();
        setRequestMessage(clips
          ? "Clip frames are still attaching. Click Retry remaining if the count has not moved."
          : "Platform media is still reconciling. Click Retry remaining if the count has not moved.", "success");
        return;
      }
      if (decision.mode === "revalidate") {
        item4VariantExtraWindows = decision.extra_windows_used;
        setRequestMessage(`${clips ? "Clip frames are" : "Platform media is"} still preparing (${elapsed}). Automatic retry ${item4VariantExtraWindows}/${ITEM4_POLL_EXTRA_WINDOWS}.`, "success");
        item4VariantPollTimer = setTimeout(pollItem4Variants, decision.delay_ms);
        return;
      }
    } catch (error) {
      // Transient polling errors should not convert a valid background job into a user-facing failure.
      console.warn("Item 4 variant status poll deferred", error);
    }
    item4VariantPollTimer = setTimeout(pollItem4Variants, ITEM4_VARIANT_POLL_MS);
  }

  function startItem4VariantPolling(forceRestart = false) {
    if (item4VariantPolling && !forceRestart) return;
    if (item4VariantPollTimer) clearTimeout(item4VariantPollTimer);
    item4VariantPollTimer = null;
    item4VariantPolling = true;
    if (forceRestart || !item4VariantPollStartedAt) {
      item4VariantPollStartedAt = Date.now();
      item4VariantExtraWindows = 0;
    }
    ensureItem4PrepareClock();
    item4VariantPollTimer = setTimeout(pollItem4Variants, 800);
  }

  function item4PreparingInBackgroundMessage() {
    return item4WorkspaceHasClips(item4Workspace || {})
      ? "Attaching clip frames. Watch the elapsed timer — if the count stops moving, click Retry remaining."
      : "Platform media is preparing in the background. If the count stops moving, click Retry remaining.";
  }

  function item4IsRetryablePrepareFailure(error, status) {
    const variantStatus = String(status?.variant_status || "");
    if (String(error?.bodyStatus || "") === "Error" || variantStatus === "Error") return false;
    if (variantStatus === "Preparing") return true;
    const message = String(error?.message || error || "");
    return /request failed \(5\d{2}\)/i.test(message)
      || isTimeoutError(error)
      || /platform media preparation is still running/i.test(message)
      || /attaching .* clip frames/i.test(message);
  }

  async function prepareItem4Variants() {
    if (!activeProductionRequest?.id || item4PreparingVariants) return;
    if (item4MastersNeedSave(item4Workspace || {})) {
      const message = item4UnsavedPrepareMessage();
      setRequestMessage(message, "error-text");
      item4ShowVariantError(message);
      return;
    }
    item4PreparingVariants = true;
    item4ShowVariantError("");
    renderItem4Variants(item4Workspace || {});
    setRequestMessage(item4WorkspaceHasClips(item4Workspace || {})
      ? "Starting clip-frame attach…"
      : "Starting platform-media preparation…", "success");
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/variants`, {method:"POST",body:JSON.stringify({ crops: collectItem4Crops(), retry: ["Preparing", "Error"].includes(String(item4Workspace?.variant_status || "")) }),timeoutMs:45000});
      if (result.production_request) activeProductionRequest = result.production_request;
      await loadItem4Workspace(activeProductionRequest);
      if (item4Workspace?.variant_status === "Ready") {
        stopItem4VariantPolling();
        setRequestMessage(result.message || (item4WorkspaceHasClips(item4Workspace || {})
          ? "Clip frames are ready. Clips skip photo crops."
          : "Platform-ready media prepared. Review the crops below."), "success");
      } else {
        setRequestMessage(item4PreparingInBackgroundMessage(), "success");
        startItem4VariantPolling(true);
      }
    } catch (error) {
      await loadItem4Workspace(activeProductionRequest).catch(()=>{});
      if (item4IsRetryablePrepareFailure(error, item4Workspace)) {
        setRequestMessage(item4PreparingInBackgroundMessage(), "success");
        startItem4VariantPolling(true);
      } else {
        stopItem4VariantPolling();
        const message = error.message || item4UnsavedPrepareMessage();
        setRequestMessage(message, "error-text");
        item4ShowVariantError(message);
      }
    } finally {
      item4PreparingVariants = false;
      renderItem4Variants(item4Workspace || {});
    }
  }

  function renderItem4Workspace(status) {
    item4Workspace = status || null;
    renderItem4Assets(status);
    renderItem4Plan(status);
    renderItem4Variants(status);
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    document.querySelectorAll("[data-item4-platform]").forEach(input => {
      const planPlatforms = status?.plan?.items?.map(x => x.platform) || [];
      if (planPlatforms.length) input.checked = planPlatforms.includes(input.value);
    });
    setProductionRequestControlState(activeProductionRequest);
    syncHiddenMasterContentType();
    updateItem4MasterProgress(status || {});
    productionDecorateTooltips($("productionRequestWorkspace") || $("page-content"));
    syncEzPlanChrome();
    if (status?.assets?.length && status?.assets_status === "Uploading" && !item4MasterPollTimer) startItem4MasterPolling();
    if (status?.assets_status === "Ready" || status?.assets_status === "Error") stopItem4MasterPolling();
    if (status?.variant_status === "Preparing" && !item4VariantPolling) startItem4VariantPolling();
    if (status?.variant_status === "Ready" || status?.variant_status === "Error") stopItem4VariantPolling();
  }

  function isTransientStudioError(error) {
    const text = String(error?.message || error || "");
    return /too many subrequests|subrequest|request failed \(5\d\d\)|timed out|networkerror|failed to fetch|502|503|504/i.test(text);
  }

  function item4BridgeIssueCopy(issues) {
    const lines = (Array.isArray(issues) ? issues : [issues])
      .map((issue) => String(issue || "").trim())
      .filter(Boolean)
      .filter((issue) => !isTransientStudioError(issue));
    if (!lines.length) return "";
    return lines.map((issue) => {
      if (/requires a title/i.test(issue)) return "Add a title before approving.";
      if (/master media must be ready/i.test(issue)) return "Photos are still finishing. Try again in a moment.";
      if (/platform output plan must be ready/i.test(issue)) return "Save the platform plan first.";
      if (/variants must be ready|variant manifest is not complete/i.test(issue)) return "Platform crops are still finishing. Try again in a moment.";
      if (/exactly one idea/i.test(issue)) return "This request needs to stay linked to its idea.";
      if (/proven production route|not fully mapped|not fully linked/i.test(issue)) return "One destination still needs a moment to finish linking. Try again shortly.";
      if (/missing .+ authoritative variant/i.test(issue)) return "A platform crop is still finishing. Try again in a moment.";
      return "Something still needs a moment before approve. Try again shortly.";
    }).filter((line, index, all) => all.indexOf(line) === index);
  }

  function item4BridgeIssuesAreDestinationLinks(issues) {
    const lines = (Array.isArray(issues) ? issues : [issues])
      .map((issue) => String(issue || "").trim())
      .filter(Boolean);
    return lines.length > 0 && lines.every((issue) =>
      /proven production route|not fully mapped|not fully linked/i.test(issue)
    );
  }

  async function loadItem4BridgePreflight(record = activeProductionRequest) {
    if (!record?.id) return null;
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/bridge-preflight`);
      item4BridgePreflight = result;
      setProductionRequestControlState(activeProductionRequest || record);
      if (
        !result?.ready
        && item4Workspace?.variant_status === "Ready"
        && item4BridgeIssuesAreDestinationLinks(result?.issues)
      ) {
        window.setTimeout(() => {
          if (activeProductionRequest?.id === record.id) loadItem4BridgePreflight(record).catch(() => {});
        }, 2000);
      }
      return result;
    } catch (error) {
      if (isTransientStudioError(error)) {
        item4BridgePreflight = item4BridgePreflight?.ready
          ? item4BridgePreflight
          : { ready: false, pending: true, issues: [], warnings: [], notes: [] };
        setProductionRequestControlState(activeProductionRequest || record);
        window.setTimeout(() => {
          if (activeProductionRequest?.id === record.id) loadItem4BridgePreflight(record).catch(() => {});
        }, 2000);
        return item4BridgePreflight;
      }
      item4BridgePreflight = {
        ready: false,
        issues: [error.message || "Could not confirm this request is ready."],
        warnings: [],
        notes: [],
      };
      setProductionRequestControlState(activeProductionRequest || record);
      return item4BridgePreflight;
    }
  }

  async function loadItem4Workspace(record = activeProductionRequest) {
    if (!record?.id) return;
    try {
      const status = mergeItem4WorkspaceStatus(await api(`/api/production-requests/${encodeURIComponent(record.id)}/item4`));
      item4BridgePreflight = null;
      renderItem4Workspace(status);
      syncPrMediaKindUi();
      if ((ezIsOriginRecord() || ezAutoPlanAfterUpload || ezStarting)
        && !ezIsAzFinishedPath()
        && ezMasterSetReadyForPlan()
        && status?.plan_status !== "Ready") {
        Promise.resolve().then(() => maybeAutoEzPlan());
      }
      if (status?.assets?.length && status?.plan_status === "Ready" && status?.variant_status === "Ready") {
        Promise.resolve().then(() => loadItem4BridgePreflight(record));
      }
      // Preview enrichment must never be allowed to invalidate the loaded production request.
      Promise.resolve().then(async () => {
        if (status?.variant_status !== "Ready") return;
        try {
          const variantStatus = await api(`/api/production-requests/${encodeURIComponent(record.id)}/variants`);
          if (!variantStatus?.manifest) return;
          const enriched = {
            ...status,
            variant_status: variantStatus.status || status.variant_status,
            variant_updated_at: variantStatus.updated_at || status.variant_updated_at,
            variant_error: variantStatus.error || null,
            variants: variantStatus.manifest
          };
          item4Workspace = enriched;
          try { renderItem4Variants(enriched); } catch (error) {
            console.warn("Item 4 variant preview rendering failed without affecting workspace state", error);
          }
        } catch (error) {
          console.warn("Item 4 variant preview enrichment failed without affecting workspace state", error);
        }
      });
    } catch (error) {
      if (item4Workspace) {
        console.warn("Item 4 workspace refresh deferred", error);
        if (!isTransientStudioError(error)) {
          setRequestMessage("Could not refresh this request. Your photos and plan are still saved.", "error-text");
        }
      } else {
        setRequestMessage(
          isTransientStudioError(error)
            ? "Still loading this request. Studio will try again."
            : "Could not open this request. Try again in a moment.",
          isTransientStudioError(error) ? "" : "error-text"
        );
      }
      if (!item4WorkspaceRetryTimer) {
        item4WorkspaceRetryTimer = window.setTimeout(() => {
          item4WorkspaceRetryTimer = 0;
          if (activeProductionRequest?.id === record.id) loadItem4Workspace(record).catch(() => {});
        }, 2000);
      }
    }
  }

  function item4UploadFileExtension(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function item4ClipOriginKind() {
    if (ezIntakeKind === "video-clips") return "video-clips";
    if (ezIsClipRequest() || ezIntakeKind === "photos-and-clips") return "photos-and-clips";
    return ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "";
  }

  function item4IsSupportedPhotoFile(file) {
    const mime = String(file?.type || "").toLowerCase();
    const ext = item4UploadFileExtension(file?.name);
    const kind = ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "";
    if (item4FileLooksLikeVideo(file)) {
      return ezIsClipRequest() || kind === "finished-video" || kind === "photos-and-clips" || kind === "video-clips";
    }
    if (kind === "finished-video") {
      return mime.startsWith("image/") || ["heic", "heif"].includes(ext);
    }
    return mime.startsWith("image/") || ext === "heic" || ext === "heif";
  }

  function item4UnsupportedPhotoMessage(files) {
    const rejected = Array.from(files || []).filter((file) => !item4IsSupportedPhotoFile(file));
    if (!rejected.length) return "";
    const names = rejected.map((file) => String(file?.name || "").trim()).filter(Boolean);
    const noun = ezIsFinishedVideo() ? "video" : (ezIsClipRequest() ? "photo or clip" : "photo");
    if (names.length === 1) return `${names[0]} is not a supported ${noun}.`;
    if (names.length === 2 || names.length === 3) return `${names.join(", ")} are not supported ${noun}s.`;
    return `${rejected.length} files are not supported ${noun}s.`;
  }

  function item4UploadErrorMessage(error, files) {
    const hasVideo = (files || []).some(item4FileLooksLikeVideo);
    const raw = String(error?.message || error || "").trim();
    const status = Number(error?.status || 0);
    const aborted = error?.name === "AbortError" || /aborted|timeout|timed out|failed to fetch/i.test(raw);
    if (aborted && hasVideo) {
      return "The clip did not finish saving. Use an MP4 or MOV under 100 MB and keep this tab open until the clip appears next to the photos.";
    }
    if ((status === 500 || status === 502 || status === 503 || /Request failed \(50[023]\)/.test(raw)) && !hasVideo) {
      return "That photo did not finish saving. Use Choose files again for it — Studio shrinks heavy stills automatically.";
    }
    if (status === 415 && hasVideo) {
      return raw || "This file was rejected as a clip. Keep Photos and clips selected and drop an MP4 or MOV.";
    }
    if (status === 413) return raw || "This clip is too large for one upload.";
    return raw || "Upload failed.";
  }

  function item4HoldClipFile(file) {
    if (!file || !item4FileLooksLikeVideo(file)) return;
    const name = String(file.name || "").trim();
    if (name) item4HeldClipFiles.set(name, file);
  }

  function item4ApplyLocalClipPoster(assetOrName, blob) {
    if (!blob || blob.size < 80) return "";
    const name = typeof assetOrName === "string" ? assetOrName : String(assetOrName?.name || assetOrName?.id || "");
    if (!name) return "";
    const prior = ezLocalClipPosters.get(name);
    if (prior) {
      try { URL.revokeObjectURL(prior); } catch {}
    }
    const url = URL.createObjectURL(blob);
    ezLocalClipPosters.set(name, url);
    if (assetOrName?.id) ezLocalClipPosters.set(String(assetOrName.id), url);
    return url;
  }

  function item4CanvasHasPicture(canvas) {
    try {
      const ctx = canvas.getContext("2d");
      if (!ctx) return false;
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
      let lit = 0;
      for (let i = 0; i < data.length; i += 64) {
        if (data[i] + data[i + 1] + data[i + 2] > 30) lit += 1;
      }
      return lit > 6;
    } catch {
      return false;
    }
  }

  function item4BlobFromVideoFrame(video) {
    const width = Number(video.videoWidth || 0);
    const height = Number(video.videoHeight || 0);
    if (!width || !height) return Promise.resolve(null);
    const max = 640;
    const scale = Math.min(1, max / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return Promise.resolve(null);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    if (!item4CanvasHasPicture(canvas)) return Promise.resolve(null);
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob && blob.size > 80 ? blob : null), "image/jpeg", 0.82);
    });
  }

  async function item4ClipPosterFromUrl(src, { timeoutMs = 16000 } = {}) {
    const source = String(src || "").trim();
    if (!source || /\.(jpe?g|png|webp)(\?|#|$)/i.test(source)) return null;
    const video = document.createElement("video");
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.setAttribute("playsinline", "");
    video.setAttribute("webkit-playsinline", "");
    video.preload = "auto";
    video.controls = false;
    video.style.cssText = "position:fixed;left:-2400px;top:0;width:4px;height:4px;opacity:0;pointer-events:none";
    document.body.appendChild(video);

    const cleanup = () => {
      try { video.pause(); } catch {}
      try { video.removeAttribute("src"); video.load(); } catch {}
      try { video.remove(); } catch {}
    };

    return new Promise((resolve) => {
      let settled = false;
      const finish = (blob) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        cleanup();
        resolve(blob || null);
      };
      const timer = window.setTimeout(() => finish(null), timeoutMs);
      video.onerror = () => finish(null);

      const waitFrame = () => new Promise((done) => {
        if (typeof video.requestVideoFrameCallback === "function") {
          video.requestVideoFrameCallback(() => done());
          window.setTimeout(done, 400);
          return;
        }
        window.setTimeout(done, 220);
      });

      video.onloadedmetadata = async () => {
        const duration = Number(video.duration);
        const marks = [0.08, 0.25, 0.6, Number.isFinite(duration) && duration > 1.5 ? Math.min(duration * 0.2, 1.2) : 0.15]
          .filter((time) => time >= 0 && (!Number.isFinite(duration) || duration <= 0 || time < duration - 0.02));
        try {
          await video.play();
          await waitFrame();
          video.pause();
          const first = await item4BlobFromVideoFrame(video);
          if (first) {
            finish(first);
            return;
          }
        } catch {}
        for (const time of marks) {
          if (settled) return;
          try {
            await new Promise((done) => {
              const giveUp = window.setTimeout(done, 900);
              video.onseeked = () => {
                window.clearTimeout(giveUp);
                done();
              };
              try { video.currentTime = time; } catch {
                window.clearTimeout(giveUp);
                done();
              }
            });
            const blob = await item4BlobFromVideoFrame(video);
            if (blob) {
              finish(blob);
              return;
            }
          } catch {}
        }
        finish(null);
      };
      video.src = source;
      try { video.load(); } catch {}
    });
  }

  async function item4ClipPosterFromFile(file) {
    if (!item4FileLooksLikeVideo(file)) return null;
    const url = URL.createObjectURL(file);
    try {
      return await item4ClipPosterFromUrl(url);
    } finally {
      try { URL.revokeObjectURL(url); } catch {}
    }
  }

  async function item4PersistClipPoster(asset, blob) {
    if (!activeProductionRequest?.id || !asset?.id || String(asset.id).startsWith("local:") || !blob) return null;
    const form = new FormData();
    form.append("poster", blob, `${String(asset.name || "clip").replace(/\.[^.]+$/, "") || "clip"}-poster.jpg`);
    const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(asset.id)}/poster`, {
      method: "POST",
      body: form,
      timeoutMs: 30000,
      retries: 0,
    });
    return String(result?.poster_url || "").trim() || null;
  }

  async function item4RequestSavedClipPoster(asset) {
    if (!activeProductionRequest?.id || !asset?.id || String(asset.id).startsWith("local:")) return null;
    const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(asset.id)}/poster`, {
      method: "POST",
      body: new FormData(),
      timeoutMs: 90000,
      retries: 0,
    });
    return String(result?.poster_url || "").trim() || null;
  }

  function item4ApplySavedClipPoster(asset, stored) {
    if (!stored || !item4Workspace?.assets) return;
    item4Workspace.assets = item4Workspace.assets.map((row) => String(row?.id || "") === String(asset.id)
      ? { ...row, poster_url: stored }
      : row);
    item4AssetStripSignature = "";
    renderItem4Assets(item4Workspace);
    renderEzPhotoStrip();
  }

  async function item4FillClipPoster(asset) {
    if (!asset || !item4AssetLooksLikeVideo(asset)) return;
    if (item4ClipPosterLooksReal(asset.poster_url) || item4LocalClipPoster(asset.name) || item4LocalClipPoster(asset.id)) return;
    const held = item4HeldClipFiles.get(String(asset.name || "")) || item4HeldClipFiles.get(String(asset.id || ""));
    if (held) {
      const blob = await item4ClipPosterFromFile(held);
      if (blob) {
        const localUrl = item4ApplyLocalClipPoster(asset, blob);
        item4ApplySavedClipPoster(asset, localUrl);
        try {
          const stored = await item4PersistClipPoster(asset, blob);
          if (stored) item4ApplySavedClipPoster(asset, stored);
        } catch (error) {
          console.warn("Item 4 clip poster persist deferred", error);
        }
        return;
      }
    }
    const streamUrl = item4ClipStreamUrl(asset);
    if (streamUrl) {
      try {
        const blob = await item4ClipPosterFromUrl(streamUrl, { timeoutMs: 12000 });
        if (blob) {
          const localUrl = item4ApplyLocalClipPoster(asset, blob);
          item4ApplySavedClipPoster(asset, localUrl);
          try {
            const stored = await item4PersistClipPoster(asset, blob);
            if (stored) item4ApplySavedClipPoster(asset, stored);
          } catch (error) {
            console.warn("Item 4 clip poster persist deferred", error);
          }
          return;
        }
      } catch (error) {
        console.warn("Item 4 clip stream frame deferred", error);
      }
    }
    try {
      const stored = await item4RequestSavedClipPoster(asset);
      if (item4ClipPosterLooksReal(stored)) item4ApplySavedClipPoster(asset, stored);
    } catch (error) {
      console.warn("Item 4 clip poster job deferred", error);
    }
  }

  function item4EnsureClipPosters(assets) {
    (Array.isArray(assets) ? assets : []).forEach((asset) => {
      if (!item4AssetLooksLikeVideo(asset) || item4ClipPosterLooksReal(asset?.poster_url) || item4LocalClipPoster(asset?.name)) return;
      const id = String(asset?.id || "");
      if (!id || id.startsWith("local:") || item4PosterJobs.has(id)) return;
      item4PosterJobs.add(id);
      item4FillClipPoster(asset).finally(() => item4PosterJobs.delete(id));
    });
  }

  async function imageMetadataForFiles(files) {
    const result = [];
    for (const file of files) {
      let width = null, height = null, duration_seconds = null;
      if (item4FileLooksLikeVideo(file)) {
        try {
          duration_seconds = await new Promise((resolve) => {
            const url = URL.createObjectURL(file);
            const video = document.createElement("video");
            video.preload = "metadata";
            video.onloadedmetadata = () => {
              const value = Number(video.duration);
              URL.revokeObjectURL(url);
              resolve(Number.isFinite(value) && value > 0 ? value : null);
            };
            video.onerror = () => {
              URL.revokeObjectURL(url);
              resolve(null);
            };
            video.src = url;
          });
        } catch {}
      } else {
        try {
          const bitmap = await createImageBitmap(file);
          width = bitmap.width; height = bitmap.height; bitmap.close();
        } catch {}
      }
      result.push({ name: file.name, width, height, duration_seconds });
    }
    return result;
  }

  const ITEM4_PHOTO_STAGE_MAX_BYTES = 4 * 1024 * 1024;
  const ITEM4_PHOTO_STAGE_MAX_EDGE = 4096;
  const ITEM4_PHOTO_RETRY_MAX_EDGE = 2560;

  function item4CanvasToJpegBlob(canvas, quality) {
    return new Promise((resolve) => {
      canvas.toBlob((blob) => resolve(blob && blob.size > 80 ? blob : null), "image/jpeg", quality);
    });
  }

  async function item4PreparePhotoFile(file, { force = false, quality = 0.82, maxEdge = ITEM4_PHOTO_STAGE_MAX_EDGE } = {}) {
    if (!file || item4FileLooksLikeVideo(file)) return file;
    const size = Number(file.size || 0);
    let bitmap = null;
    try {
      bitmap = await createImageBitmap(file);
    } catch {
      return file;
    }
    try {
      const maxDim = Math.max(bitmap.width, bitmap.height);
      const needsScale = maxDim > maxEdge;
      const needsBytes = force || size > ITEM4_PHOTO_STAGE_MAX_BYTES;
      if (!needsScale && !needsBytes) return file;
      const scale = needsScale ? (maxEdge / maxDim) : 1;
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { alpha: false });
      if (!ctx) return file;
      ctx.drawImage(bitmap, 0, 0, width, height);
      let blob = await item4CanvasToJpegBlob(canvas, quality);
      if (blob && blob.size > ITEM4_PHOTO_STAGE_MAX_BYTES && quality > 0.68) {
        blob = await item4CanvasToJpegBlob(canvas, 0.68);
      }
      if (!blob || blob.size >= size) return file;
      return new File([blob], file.name, { type: "image/jpeg", lastModified: file.lastModified || Date.now() });
    } finally {
      try { bitmap.close(); } catch {}
    }
  }

  async function postItem4MasterFile(file, poster) {
    const send = async (payload) => {
      const metadata = await imageMetadataForFiles([payload]);
      const form = new FormData();
      form.append("files", payload, payload.name);
      if (poster && poster.size > 80) {
        const base = String(payload.name || "clip").replace(/\.[^.]+$/, "") || "clip";
        form.append("posters", poster, `${base}-poster.jpg`);
      } else {
        form.append("posters", new Blob([], { type: "application/octet-stream" }), "empty");
      }
      form.append("metadata", JSON.stringify(metadata));
      const originKind = item4ClipOriginKind() || ezIntakeKind || (ezWizardPending || ezWizardAnswers)?.inputKind || "";
      if (originKind) form.append("origin_kind", originKind);
      return api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets`, {
        method: "POST",
        body: form,
        timeoutMs: item4FileLooksLikeVideo(payload) || originKind === "finished-video" ? 180000 : 90000,
        retries: 0,
      });
    };
    const prepared = await item4PreparePhotoFile(file);
    try {
      return await send(prepared);
    } catch (error) {
      const status = Number(error?.status || 0);
      if (item4FileLooksLikeVideo(file) || (status !== 500 && status !== 502 && status !== 503 && !/Request failed \(50[023]\)/.test(String(error?.message || "")))) {
        throw error;
      }
      const smaller = await item4PreparePhotoFile(file, { force: true, quality: 0.68, maxEdge: ITEM4_PHOTO_RETRY_MAX_EDGE });
      if (smaller === file || smaller.size >= Number(prepared.size || file.size || 0)) throw error;
      return send(smaller);
    }
  }

  async function uploadItem4Files(fileList, { preserveOversizedNotice = false } = {}) {
    if (!activeProductionRequest?.id) return;
    if (item4Uploading) {
      item4PendingUploads.push(...Array.from(fileList || []).filter(item4IsSupportedPhotoFile));
      return;
    }
    if (!ezIntakeKind && ezIsClipRequest()) {
      selectEzInput("photos-and-clips", { resetPlatforms: false });
    }
    if (!ezIntakeKind) {
      setRequestMessage("Choose a media type before uploading.", "error-text");
      syncPrMediaKindUi();
      return;
    }
    const incoming = Array.from(fileList || []);
    item4AdoptKindForIncomingFiles(incoming);
    if ((ezIntakeKind === "single-photo" || ezIntakeKind === "multiple-photos") && incoming.some(item4FileLooksLikeVideo)) {
      selectEzInput("photos-and-clips", { resetPlatforms: false });
      selectPrMediaKind("photos-and-clips", { quiet: true });
    }
    const unsupportedNote = item4UnsupportedPhotoMessage(incoming);
    let files = incoming.filter(item4IsSupportedPhotoFile);
    if (unsupportedNote) {
      setRequestMessage(unsupportedNote, "error-text");
      if (!files.length) return;
    } else if (!files.length) {
      setRequestMessage(ezIsFinishedVideo() ? "Choose a video file." : "Choose one or more photo files.", "error-text");
      return;
    }
    const oversizedSplit = item4DropOversizedClips(files, { resetNotice: !preserveOversizedNotice });
    if (oversizedSplit.oversized.length) {
      files = oversizedSplit.allowed;
      if (!files.length) return;
    }
    files = files.slice().sort((a, b) => Number(item4FileLooksLikeVideo(a)) - Number(item4FileLooksLikeVideo(b)));
    const existingCount = ezPersistedAssetCount();
    if (ezIntakeKind === "finished-video") {
      if (existingCount >= 1) {
        setRequestMessage("This piece already has a video. Remove it first to replace it.", "error-text");
        return;
      }
      if (files.length > 1) files = files.slice(0, 1);
    }
    if (ezIntakeKind === "single-photo") {
      if (existingCount >= 1) {
        setRequestMessage("This piece already has a photo. Remove it first to replace it.", "error-text");
        return;
      }
      if (files.length > 1) {
        setRequestMessage("Single photo uses the first image. Choose Multiple photos for a set.", "");
        files = files.slice(0, 1);
      }
    }
    const pending = ezWizardPending || ezWizardAnswers;
    if (pending?.inputKind === "mixed") {
      const expected = ezPlanApi()?.ezWizardExpectedUploads?.(pending) || 1;
      const remaining = Math.max(0, expected - existingCount);
      if (!remaining) {
        setRequestMessage("This mixed set already has your photos.", "error-text");
        return;
      }
      files = files.slice(0, remaining);
    }
    item4Uploading = true;
    item4UploadBatchTotal = existingCount + files.length;
    item4UploadBatchDone = existingCount;
    const progress = $("item4UploadProgress");
    const button = $("item4BuildPlan");
    files.forEach(item4HoldClipFile);
    paintItem4LocalPreviews(files, { uploading: true });
    if (button) button.disabled = true;
    const uploadingClips = files.some(item4FileLooksLikeVideo);
    updateItem4MasterProgress(item4Workspace || {});
    if (!item4OversizedClipNotice) {
      setRequestMessage(`Saving ${files.length} file${files.length === 1 ? "" : "s"} one at a time so the full set can finish.`, "success");
      if (ezIsAzFinishedPath()) setAzFinishedMessage("Saving to Drive…");
    }
    const failed = [];
    const posterBlobs = [];
    try {
      mergeEzProductionNotes();
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setRequestMessage(`Saving ${index + 1} of ${files.length}: ${file.name}`, "success");
        updateItem4MasterProgress(item4Workspace || {});
        let poster = null;
        if (item4FileLooksLikeVideo(file)) {
          poster = await Promise.race([
            item4ClipPosterFromFile(file).then((blob) => {
              if (blob) item4ApplyLocalClipPoster(file.name, blob);
              return blob;
            }).catch(() => null),
            new Promise((resolve) => window.setTimeout(() => resolve(null), 8000)),
          ]);
        }
        posterBlobs[index] = poster;
        try {
          const result = await postItem4MasterFile(file, poster);
          if (result?.record) activeProductionRequest = result.record;
          item4UploadBatchDone += 1;
          await loadItem4Workspace(activeProductionRequest);
          ezStagedFiles = files.slice(index + 1);
          updateItem4MasterProgress(item4Workspace || {});
        } catch (error) {
          failed.push(`${file.name}: ${item4UploadErrorMessage(error, [file])}`);
        }
      }
      ezStagedFiles = [];
      syncPrMediaKindUi();
      const total = ezPersistedAssetCount();
      const incomplete = ezIncompleteSetMessage(total);
      if (failed.length) {
        const friendly = failed.length === files.length
          ? failed.join(" ")
          : `${item4UploadBatchDone} saved. ${failed.length} still need another try. ${failed.join(" ")}`;
        if (progress) {
          progress.hidden = false;
          progress.dataset.heal = "error";
          progress.innerHTML = `<strong>Photo upload needs attention.</strong><span>${escapeHtml(friendly)}</span>`;
        }
        setRequestMessage(friendly, "error-text");
        setEzMessage(friendly, "error-text");
        if (item4Workspace?.assets_status !== "Ready") startItem4MasterPolling();
      } else if (item4OversizedClipNotice) {
        updateItem4MasterProgress(item4Workspace || {});
        const extra = incomplete || (item4Workspace?.assets_status === "Ready" ? item4MasterReadyMessage(item4Workspace) : "");
        setRequestMessage(extra ? `${item4OversizedClipNotice} ${extra}` : item4OversizedClipNotice, item4OversizedNoticeKind);
        setEzMessage(item4OversizedClipNotice, item4OversizedNoticeKind);
        if (item4WorkspaceNeedsCompression(item4Workspace) || item4Workspace?.assets_status !== "Ready") startItem4MasterPolling();
      } else if (incomplete) {
        updateItem4MasterProgress(item4Workspace || {});
        setRequestMessage(incomplete, "success");
        setEzMessage(incomplete, "success");
        if (item4Workspace?.assets_status !== "Ready") startItem4MasterPolling();
      } else if (item4Workspace?.assets_status === "Ready") {
        updateItem4MasterProgress(item4Workspace);
        setRequestMessage(item4MasterReadyMessage(item4Workspace), "success");
      } else {
        updateItem4MasterProgress(item4Workspace || {});
        setRequestMessage(ezIsFinishedVideo()
          ? (ezIsAzFinishedPath()
            ? "Finished video is stored. Studio will thumbnail, schedule, and queue all four platforms. You can close this tab."
            : "Video is loading into the system. You can keep working or leave this screen.")
          : (uploadingClips
            ? "Clip is loading into the system. Keep this tab open until it appears in the strip."
            : "Photos are loading into the system. You can keep working or leave this screen — Drive copies finish in the background."), "success");
        if (ezIsAzFinishedPath()) {
          setAzFinishedMessage("Finished video is stored. Studio will thumbnail, schedule, and queue all four platforms. You can close this tab.", "success");
        }
        startItem4MasterPolling();
      }
      if (!failed.length && !incomplete && !ezIsAzFinishedPath()) await maybeAutoEzPlan();
      if (!failed.length && ezIsAzFinishedPath()) startAzFinishedProgressPolling();
      files.forEach((file, index) => {
        const blob = posterBlobs[index];
        if (!blob || !item4FileLooksLikeVideo(file)) return;
        const asset = (Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [])
          .find((row) => item4AssetLooksLikeVideo(row) && String(row?.name || "") === String(file.name || ""));
        if (!asset || item4ClipPosterLooksReal(asset.poster_url)) return;
        item4ApplyLocalClipPoster(asset, blob);
        item4PersistClipPoster(asset, blob).catch((error) => console.warn("Item 4 clip poster persist deferred", error));
      });
      renderEzCaptionUi();
      renderEzPhotoStrip();
    } catch (error) {
      ezAutoPlanAfterUpload = false;
      const friendly = item4UploadErrorMessage(error, files);
      if (progress) {
        progress.hidden = false;
        progress.dataset.heal = "error";
        progress.innerHTML = `<strong>${uploadingClips || ezIsFinishedVideo() ? "Clip" : "Photo"} upload needs attention.</strong><span>${escapeHtml(friendly)}</span>`;
      }
      const ezProgress = $("ezUploadProgress");
      if (ezProgress && (uploadingClips || ezIsClipRequest())) {
        ezProgress.hidden = false;
        ezProgress.dataset.heal = "error";
        ezProgress.innerHTML = `<strong>${uploadingClips ? "Clip" : "Photo"} upload needs attention.</strong><span>${escapeHtml(friendly)}</span>`;
      }
      setRequestMessage(friendly, "error-text");
      setEzMessage(friendly, "error-text");
    } finally {
      item4Uploading = false;
      item4UploadBatchTotal = 0;
      item4UploadBatchDone = 0;
      if (button) button.disabled = !(item4Workspace?.assets?.length);
      drainPendingMasterUploads();
    }
  }

  async function removeItem4Asset(assetId) {
    if (!activeProductionRequest?.id || !assetId) return;
    if (String(assetId).startsWith("local:") || String(assetId).startsWith("staged:")) return;
    if (!window.confirm("Remove this photo from the set? You can add it again afterward.")) return;
    try {
      await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(assetId)}`, {method:"DELETE", body:JSON.stringify({})});
      await loadItem4Workspace(activeProductionRequest);
      ezStagedFiles = [];
      const total = ezPersistedAssetCount();
      const incomplete = ezIncompleteSetMessage(total);
      setRequestMessage(incomplete || "Photo removed. Add another, or rebuild the platform plan when the set is ready.", "success");
      setEzMessage(incomplete || "Photo removed.", incomplete ? "success" : "");
      renderEzPhotoStrip();
      if (ezIsOriginRecord() && ezMasterSetReadyForPlan()) await maybeAutoEzPlan(true);
    } catch (error) { setRequestMessage(error.message, "error-text"); }
  }

  async function buildItem4Plan() {
    if (!activeProductionRequest?.id) return;
    syncItem4PlatformsFromEz();
    const selected = ezSelectedPlatforms().length ? ezSelectedPlatforms() : item4SelectedPlatforms();
    const wizardCount = ezPlanApi()?.ezWizardPhotoCount?.(ezWizardPending || ezWizardAnswers) || 0;
    const count = item4Workspace?.assets?.length || wizardCount || 0;
    let platforms = ezPlanPlatforms(count || 1, selected);
    if (!platforms.length) {
      platforms = defaultPlanPlatforms(count || 1);
      seedPlatformToggles(platforms);
    }
    if (!platforms.length) { setRequestMessage("Choose at least one platform.", "error-text"); return; }
    seedPlatformToggles(platforms);
    const button = $("item4BuildPlan");
    if (button) { button.disabled = true; button.textContent = "Building plan…"; }
    setRequestMessage("Building the platform plan…");
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/plan`, {
        method: "POST",
        body: JSON.stringify({
          platforms,
          overrides: item4PlanOverrides,
          extras: item4EnabledExtraPairs(),
          package: currentEzPackageId(),
          skip_fbs1_guard: true,
          schedules: ezWizardAnswers?.schedules || null,
        }),
        timeoutMs: 45000,
        retries: 0,
      });
      if (result.production_request) activeProductionRequest = result.production_request;
      productionRequestOutputs = Array.isArray(result.outputs) ? result.outputs : productionRequestOutputs;
      populateProductionRequestForm(activeProductionRequest);
      renderProductionRequestOutputCards();
      await loadItem4Workspace(activeProductionRequest);
      await loadProductionRequestOutputs(activeProductionRequest);
      setRequestMessage(result.message || "Platform plan ready.", "success");
    } catch (error) {
      setRequestMessage(
        isTimeoutError(error)
          ? "Studio took too long to build the plan. Tap Recommend formats again."
          : (error.message || "Could not build the platform plan."),
        "error-text"
      );
    } finally {
      if (button) {
        button.hidden = false;
        button.textContent = item4Workspace?.plan?.items?.length ? "Update formats" : "Recommend formats";
        button.disabled = !(item4Workspace?.assets?.length || ezWizardAllowsPlanWithoutAssets());
      }
      syncEzPlanChrome();
    }
  }

  function selectedRequestPlatforms() {
    return Array.from(document.querySelectorAll('input[name="prPlatform"]:checked')).map(input => input.value);
  }

  function setRequestMessage(text = "", type = "") {
    const target = $("productionRequestMessage");
    if (!target) return;
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function isPreviewPickMessage(text) {
    return /pick a music track to preview|pick an elevenlabs voice to preview/i.test(String(text || ""));
  }

  function clearPreviewPickMessage() {
    const request = $("productionRequestMessage");
    if (request && isPreviewPickMessage(request.textContent)) setRequestMessage();
    const ez = $("ezMessage");
    if (ez && isPreviewPickMessage(ez.textContent)) setEzMessage();
  }

  function syncCountInputs(modeId, containerId) {
    const mode = $(modeId).value;
    const container = $(containerId);
    container.querySelectorAll(".exact-count").forEach(el => el.hidden = mode !== "Exact");
    container.querySelectorAll(".range-count").forEach(el => el.hidden = mode !== "Target range");
  }

  function syncAllStructureControls() {
    syncCountInputs("prVideoClipMode", "prVideoStructure");
    syncCountInputs("prCarouselSlideMode", "prCarouselStructure");
  }

  $("prVideoClipMode")?.addEventListener("change", syncAllStructureControls);
  $("prCarouselSlideMode")?.addEventListener("change", syncAllStructureControls);

  function musicOptionLabel(record) {
    const name = record.display_name || record.name || record.id;
    return record.favorite ? `★ ${name}` : name;
  }

  function musicPreviewUrl(record) {
    return record.preview_url || (record.preview_available ? `/api/music/${record.id}/preview` : "");
  }

  function musicOptionHtml(record) {
    return `<option value="${escapeHtml(record.id)}" data-preview="${escapeHtml(musicPreviewUrl(record))}" data-favorite="${record.favorite ? "true" : "false"}">${escapeHtml(musicOptionLabel(record))}</option>`;
  }

  function sortClientMusic(records) {
    return [...records].sort((left, right) => {
      if (Boolean(left.favorite) !== Boolean(right.favorite)) return left.favorite ? -1 : 1;
      return String(left.display_name || left.name || "").localeCompare(String(right.display_name || right.name || ""), undefined, { sensitivity: "base" });
    });
  }

  function fillMusicDropdowns() {
    const options = productionRequestMusic.map(musicOptionHtml).join("");
    const blank = '<option value="">AI / profile chooses track</option>';
    const pr = $("prMusicAsset");
    const ez = $("ezAudioTrack");
    const prValue = pr?.value || "";
    const ezValue = ez?.value || "";
    if (pr) {
      pr.innerHTML = blank + options;
      if (prValue) pr.value = prValue;
    }
    if (ez) {
      ez.innerHTML = blank + options;
      if (ezValue) ez.value = ezValue;
    }
  }

  async function ensureProductionRequestMusic() {
    if (productionRequestMusic.length) return productionRequestMusic;
    const { records = [] } = await api("/api/music?limit=100");
    productionRequestMusic = sortClientMusic(records.filter((record) => !record.do_not_use));
    fillMusicDropdowns();
    return productionRequestMusic;
  }

  const OUTPUT_DEFAULTS_BY_CONTENT_TYPE = {
    "Vertical Short Video": {Instagram:"Reel", Facebook:"Reel", TikTok:"Video Draft", YouTube:"Short"},
    "Story": {Instagram:"Story", Facebook:"Story", TikTok:"Story"},
    "Carousel": {Instagram:"Carousel", Facebook:"Multi-Image Post", TikTok:"Multi-Photo", YouTube:"Slideshow Video"},
    "Feed Post": {Instagram:"Single Image", Facebook:"Single Image", TikTok:"Multi-Photo"},
    "Photo Set": {Instagram:"Reel", Facebook:"Slideshow Reel", TikTok:"Video Draft", YouTube:"Short"},
    "Longform Video": {YouTube:"Standard Video"},
  };

  function outputMatrixInputs() {
    return Array.from(document.querySelectorAll("[data-pr-output]"));
  }

  function selectedOutputMatrix() {
    const schedules = ezWizardAnswers?.schedules && typeof ezWizardAnswers.schedules === "object"
      ? ezWizardAnswers.schedules
      : {};
    return outputMatrixInputs().filter(input => input.checked).map(input => {
      const platform = input.dataset.platform;
      const output_type = input.value;
      const scheduled_at = String(schedules[`${platform}::${output_type}`] || "").trim();
      return {
        platform,
        output_type,
        enabled: true,
        ...(scheduled_at ? { scheduled_at } : {}),
      };
    });
  }

  function item4EnabledExtraPairs() {
    item4DropUnsupportedStoryChecks(false);
    return selectedOutputMatrix()
      .filter((row) => {
        if (row.platform === "TikTok" && row.output_type === "Story") return false;
        const primary = item4PlanOverrides?.[row.platform] || recommendedOutputFor(row.platform);
        return row.output_type !== primary;
      })
      .map((row) => ({ platform: row.platform, output_type: row.output_type }));
  }

  function item4DropUnsupportedStoryChecks(announce = false) {
    const inputs = document.querySelectorAll('[data-pr-output][data-platform="TikTok"][value="Story"], [data-ez-output][data-platform="TikTok"][value="Story"]');
    let dropped = false;
    inputs.forEach((input) => {
      if (!input.checked) return;
      input.checked = false;
      dropped = true;
    });
    if (dropped) {
      updateOutputMatrixSummary();
      if (announce) {
        const text = "TikTok Story is not a posting destination. Instagram and Facebook Stories are 5-second 9:16 teasers from the first photo, with a slight zoom and music. After the main post is live, the Story can link through to it.";
        setEzMessage(text);
        setRequestMessage(text);
      }
    }
    return dropped;
  }

  function updateOutputMatrixSummary() {
    const outputs = selectedOutputMatrix();
    const target = $("prOutputMatrixSummary");
    if (!target) return;
    target.textContent = outputs.length
      ? `${outputs.length} requested output${outputs.length === 1 ? "" : "s"}: ${outputs.map(o => `${o.platform} ${o.output_type}`).join(" · ")}`
      : "No custom outputs selected. Studio will use the recommended output for each selected platform.";
    hydrateEzOutputsFromMatrix();
    syncNativeVideoCoverRule();
  }

  function item4SelectedHasRenderedVideo() {
    const types = new Set(["Reel", "Video Draft", "Short", "Standard Video", "Slideshow Reel", "Slideshow Video"]);
    const fromMatrix = selectedOutputMatrix().some((row) => types.has(row.output_type));
    if (fromMatrix) return true;
    return Array.from(document.querySelectorAll("[data-ez-output]:checked")).some((input) => types.has(input.value));
  }

  function syncNativeVideoCoverRule() {
    const lock = item4SelectedHasRenderedVideo();
    ["prThumbnail", "ezThumbnail"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      if (lock) {
        el.value = "Yes";
        el.disabled = true;
        el.title = "Rendered video always uses the 3D grid cover.";
      } else {
        el.title = "";
      }
    });
  }

  function outputRecordKey(row) {
    return `${row?.platform || ""}::${row?.output_type || ""}`;
  }

  function enabledProductionRequestOutputs() {
    return productionRequestOutputs
      .filter(row => row.enabled !== false)
      .sort((a, b) => Number(a.output_order || 0) - Number(b.output_order || 0));
  }

  function overrideCount(row) {
    const keys = [
      "voiceover_mode_override","background_music_mode_override","thumbnail_mode_override",
      "video_duration_seconds_override","video_clip_count_mode_override","video_clip_count_exact_override",
      "video_clip_count_min_override","video_clip_count_max_override","carousel_slide_count_mode_override",
      "carousel_slide_count_exact_override","carousel_slide_count_min_override","carousel_slide_count_max_override",
      "carousel_image_mode_override","voiceover_tail_seconds_override","requested_title_override",
      "requested_caption_override","requested_script_override","output_notes","scheduled_at"
    ];
    let count = keys.filter(key => {
      const v = row?.[key];
      return v !== null && v !== undefined && v !== "" && v !== "Inherit";
    }).length;
    if (Array.isArray(row?.selected_music_asset_override_links) && row.selected_music_asset_override_links.length) count++;
    if (row?.title_mode_override && row.title_mode_override !== "Inherit") count++;
    if (row?.caption_mode_override && row.caption_mode_override !== "Inherit") count++;
    if (row?.script_mode_override && row.script_mode_override !== "Inherit") count++;
    if (row?.publish_mode && row.publish_mode !== "Inherit") count++;
    return count;
  }

  function renderProductionRequestOutputCards() {
    const host = $("prOutputCards");
    if (!host) return;
    const rows = enabledProductionRequestOutputs();
    if (!rows.length) {
      host.innerHTML = '<div class="empty compact-empty">Recommended outputs will be created automatically when the draft is saved. Use Section 5 only for additional or alternative outputs.</div>';
      return;
    }

    host.innerHTML = rows.map(row => {
      const count = overrideCount(row);
      const effective = row.effective || {};
      const detail = [
        effective.video_duration_seconds ? `${effective.video_duration_seconds}s` : null,
        effective.video_clip_count_mode && ["Reel","Video Draft","Short","Standard Video"].includes(row.output_type)
          ? `${effective.video_clip_count_mode} clips` : null,
        effective.carousel_slide_count_mode && ["Carousel","Multi-Image Post","Multi-Photo","Slideshow Reel","Slideshow Video"].includes(row.output_type)
          ? `${effective.carousel_slide_count_mode} slides` : null,
        effective.voiceover_mode === "Yes"
          ? `VO ${activeProductionRequest?.voice_name || DEFAULT_VOICE_NAME}`
          : (effective.voiceover_mode ? `VO ${effective.voiceover_mode}` : null),
        row.scheduled_at ? `Suggested ${formatStudioDateTime(row.scheduled_at)}` : null,
      ].filter(Boolean).join(" · ");

      return `<div class="requested-output-card">
        <div>
          <div class="requested-output-title">${escapeHtml(row.platform)} · ${escapeHtml(row.output_type)}</div>
          <div class="requested-output-detail">${escapeHtml(detail || "Inherits master request")}</div>
        </div>
        <div class="requested-output-actions">
          ${count ? `<span class="override-count">${count} override${count === 1 ? "" : "s"}</span>` : '<span class="inherit-pill">Inherits master</span>'}
          <button type="button" class="button secondary small" data-edit-pr-output="${escapeHtml(row.id)}">Override</button>
        </div>
      </div>`;
    }).join("");

    host.querySelectorAll("[data-edit-pr-output]").forEach(button => {
      button.addEventListener("click", () => openProductionRequestOutputOverride(button.dataset.editPrOutput));
    });
  }

  function setOverrideSelect(id, value, fallback = "Inherit") {
    const el = $(id);
    if (!el) return;
    const desired = String(value || fallback);
    el.value = Array.from(el.options).some(o => o.value === desired) ? desired : fallback;
  }

  function setOverrideValue(id, value) {
    const el = $(id);
    if (el) el.value = value === null || value === undefined ? "" : value;
  }

  function isVideoClipOutput(outputType) {
    return ["Reel","Video Draft","Short","Standard Video"].includes(outputType);
  }

  function isSlideOutput(outputType) {
    return ["Carousel","Multi-Image Post","Multi-Photo","Slideshow Reel","Slideshow Video"].includes(outputType);
  }

  function fillOverrideMusicChoices(row) {
    const select = $("prOverrideMusicAsset");
    if (!select) return;
    const selected = Array.isArray(row?.selected_music_asset_override_links) && row.selected_music_asset_override_links.length
      ? row.selected_music_asset_override_links[0] : "";
    select.innerHTML = '<option value="">Inherit master track</option>' + productionRequestMusic.map((track) =>
      `<option value="${escapeHtml(track.id)}" data-favorite="${track.favorite ? "true" : "false"}">${escapeHtml(musicOptionLabel(track))}</option>`
    ).join("");
    select.value = selected || "";
  }

  function effectivePreviewHtml(row) {
    const e = row?.effective || {};
    const bits = [
      ["Voiceover", e.voiceover_mode === "Yes" ? (activeProductionRequest?.voice_name || DEFAULT_VOICE_NAME) : e.voiceover_mode],
      ["Music", e.background_music_mode],
      ["Thumbnail", e.thumbnail_mode],
      ["Duration", e.video_duration_seconds ? `${e.video_duration_seconds}s` : null],
      ["Clip count", isVideoClipOutput(row?.output_type) ? e.video_clip_count_mode : null],
      ["Slide count", isSlideOutput(row?.output_type) ? e.carousel_slide_count_mode : null],
      ["Title", e.title_mode],
      ["Caption", e.caption_mode],
      ["Script", e.script_mode],
      ["Publish", e.publish_mode],
    ].filter(([,v]) => v !== null && v !== undefined && v !== "");

    return `<strong>Effective settings after inheritance</strong>
      <div class="effective-preview-grid">${bits.map(([k,v]) =>
        `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")}</div>`;
  }

  function openProductionRequestOutputOverride(recordId) {
    const row = productionRequestOutputs.find(r => r.id === recordId);
    if (!row) return;

    $("prOverrideRecordId").value = row.id;
    $("prOverrideHeading").textContent = `${row.platform} · ${row.output_type}`;
    $("prOverrideInheritedNote").textContent = "Use Inherit or leave numeric/text fields blank to use the master Production Request.";

    setOverrideSelect("prOverrideVoiceover", row.voiceover_mode_override);
    setOverrideSelect("prOverrideMusicMode", row.background_music_mode_override);
    setOverrideSelect("prOverrideThumbnail", row.thumbnail_mode_override);
    setOverrideValue("prOverrideDuration", row.video_duration_seconds_override);
    setOverrideValue("prOverrideVoiceoverTail", row.voiceover_tail_seconds_override);

    setOverrideSelect("prOverrideClipMode", row.video_clip_count_mode_override);
    setOverrideValue("prOverrideClipExact", row.video_clip_count_exact_override);
    setOverrideValue("prOverrideClipMin", row.video_clip_count_min_override);
    setOverrideValue("prOverrideClipMax", row.video_clip_count_max_override);

    setOverrideSelect("prOverrideSlideMode", row.carousel_slide_count_mode_override);
    setOverrideValue("prOverrideSlideExact", row.carousel_slide_count_exact_override);
    setOverrideValue("prOverrideSlideMin", row.carousel_slide_count_min_override);
    setOverrideValue("prOverrideSlideMax", row.carousel_slide_count_max_override);
    setOverrideSelect("prOverrideImageMode", row.carousel_image_mode_override);

    setOverrideSelect("prOverrideTitleMode", row.title_mode_override);
    setOverrideValue("prOverrideTitle", row.requested_title_override);
    setOverrideSelect("prOverrideCaptionMode", row.caption_mode_override);
    setOverrideValue("prOverrideCaption", row.requested_caption_override);
    setOverrideSelect("prOverrideScriptMode", row.script_mode_override);
    setOverrideValue("prOverrideScript", row.requested_script_override);
    setOverrideValue("prOverrideNotes", row.output_notes);
    setOverrideSelect("prOverridePublishMode", row.publish_mode);
    setOverrideValue("prOverrideScheduledAt", row.scheduled_at ? formatDateTimeLocalInput(row.scheduled_at) : "");
    const scheduleHint = $("prOverrideScheduledHint");
    if (scheduleHint) {
      scheduleHint.textContent = row.scheduled_at
        ? `Saved as ${formatStudioDateTime(row.scheduled_at)}. Picker uses your browser local time.`
        : `Times display in ${studioTimezoneLabel()}. Picker uses your browser local time.`;
    }

    fillOverrideMusicChoices(row);
    $("prOverrideClipSection").hidden = !isVideoClipOutput(row.output_type);
    $("prOverrideSlideSection").hidden = !isSlideOutput(row.output_type);
    $("prOverrideDurationField").hidden = !isVideoClipOutput(row.output_type) && !["Slideshow Reel","Slideshow Video","Story"].includes(row.output_type);
    $("prOverrideEffectivePreview").innerHTML = effectivePreviewHtml(row);
    $("prOverrideMessage").textContent = "";
    $("prOverrideMessage").className = "form-message";

    $("prOutputOverrideEditor").hidden = false;
    $("prOutputOverrideEditor").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function nullableNumberFromInput(id) {
    const raw = String($(id)?.value || "").trim();
    return raw === "" ? null : Number(raw);
  }

  async function saveProductionRequestOutputOverride() {
    const recordId = $("prOverrideRecordId").value;
    if (!recordId) return;

    const button = $("savePrOverride");
    const message = $("prOverrideMessage");
    button.disabled = true;
    button.textContent = "Saving…";
    message.textContent = "";
    message.className = "form-message";

    try {
      const scheduledRaw = String($("prOverrideScheduledAt").value || "").trim();
      const payload = {
        voiceover_mode_override: $("prOverrideVoiceover").value,
        background_music_mode_override: $("prOverrideMusicMode").value,
        thumbnail_mode_override: $("prOverrideThumbnail").value,
        selected_music_asset_override_id: $("prOverrideMusicAsset").value || "",
        video_duration_seconds_override: nullableNumberFromInput("prOverrideDuration"),
        voiceover_tail_seconds_override: nullableNumberFromInput("prOverrideVoiceoverTail"),

        video_clip_count_mode_override: $("prOverrideClipMode").value,
        video_clip_count_exact_override: nullableNumberFromInput("prOverrideClipExact"),
        video_clip_count_min_override: nullableNumberFromInput("prOverrideClipMin"),
        video_clip_count_max_override: nullableNumberFromInput("prOverrideClipMax"),

        carousel_slide_count_mode_override: $("prOverrideSlideMode").value,
        carousel_slide_count_exact_override: nullableNumberFromInput("prOverrideSlideExact"),
        carousel_slide_count_min_override: nullableNumberFromInput("prOverrideSlideMin"),
        carousel_slide_count_max_override: nullableNumberFromInput("prOverrideSlideMax"),
        carousel_image_mode_override: $("prOverrideImageMode").value,

        title_mode_override: $("prOverrideTitleMode").value,
        requested_title_override: $("prOverrideTitle").value.trim(),
        caption_mode_override: $("prOverrideCaptionMode").value,
        requested_caption_override: $("prOverrideCaption").value.trim(),
        script_mode_override: $("prOverrideScriptMode").value,
        requested_script_override: $("prOverrideScript").value.trim(),
        output_notes: $("prOverrideNotes").value.trim(),

        publish_mode: $("prOverridePublishMode").value,
        scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : "",
      };

      const result = await api(`/api/production-request-outputs/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const idx = productionRequestOutputs.findIndex(r => r.id === recordId);
      if (idx >= 0) productionRequestOutputs[idx] = result.record;
      renderProductionRequestOutputCards();
      openProductionRequestOutputOverride(recordId);

      message.textContent = "Output override saved.";
      message.className = "form-message success";
    } catch (e) {
      message.textContent = e.message;
      message.className = "form-message error-text";
    } finally {
      button.disabled = false;
      button.textContent = "Save output override";
    }
  }

  function syncLegacyPlatformsFromOutputMatrix() {
    const selectedPlatforms = new Set(selectedOutputMatrix().map(o => o.platform));
    document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
      if (["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) {
        input.checked = selectedPlatforms.has(input.value);
      }
    });
  }

  function clearOutputMatrix() {
    outputMatrixInputs().forEach(input => { input.checked = false; });
    updateOutputMatrixSummary();
  }

  function recommendedOutputFor(platform) {
    const wizardCount = ezPlanApi()?.ezWizardPhotoCount?.(ezWizardPending || ezWizardAnswers) || 0;
    const count = item4Workspace?.assets?.length || (usingEzPlatforms() ? ezStagedFiles.length : 0) || wizardCount;
    if (count > 0 || usingEzPlatforms()) {
      const planned = ezPlanApi()?.ezPlanFromPhotoCount({
        photoCount: count,
        platforms: [platform],
        packageId: currentEzPackageId(),
        ...ezPlanCountOptions(),
      });
      if (planned?.overrides?.[platform]) return planned.overrides[platform];
    }
    const contentType = $("prContentType")?.value || "";
    return OUTPUT_DEFAULTS_BY_CONTENT_TYPE[contentType]?.[platform] || "";
  }

  function seedOutputMatrixFromLegacyPlatforms(record) {
    clearOutputMatrix();
    if ($("prOutputCards")) $("prOutputCards").innerHTML = "";
    if ($("prOutputOverrideEditor")) $("prOutputOverrideEditor").hidden = true;
    for (const platform of (Array.isArray(record?.platforms) ? record.platforms : [])) {
      const recommended = recommendedOutputFor(platform);
      const input = outputMatrixInputs().find(x => x.dataset.platform === platform && x.value === recommended);
      if (input) input.checked = true;
    }
    updateOutputMatrixSummary();
  }

  async function loadProductionRequestOutputs(record = activeProductionRequest) {
    if (!record?.id) return;
    productionOutputMatrixLoaded = false;
    const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/outputs`);
    productionRequestOutputs = Array.isArray(result.records) ? result.records : [];
    clearOutputMatrix();

    if (productionRequestOutputs.length) {
      const selected = new Set(
        productionRequestOutputs.filter(row => row.enabled !== false).map(row => `${row.platform}::${row.output_type}`)
      );
      outputMatrixInputs().forEach(input => {
        input.checked = selected.has(`${input.dataset.platform}::${input.value}`);
      });
      if (ezIsClipRequest(record)) {
        const slideshow = outputMatrixInputs().find((input) => input.dataset.platform === "Facebook" && input.value === "Slideshow Reel");
        const reel = outputMatrixInputs().find((input) => input.dataset.platform === "Facebook" && input.value === "Reel");
        if (slideshow?.checked && reel) {
          slideshow.checked = false;
          reel.checked = true;
          item4PlanOverrides = { ...item4PlanOverrides, Facebook: "Reel" };
        }
      }
      item4DropUnsupportedStoryChecks(false);
    } else {
      seedOutputMatrixFromLegacyPlatforms(record);
    }

    syncLegacyPlatformsFromOutputMatrix();
    updateOutputMatrixSummary();
    productionOutputMatrixLoaded = true;
    renderProductionRequestOutputCards();
    setProductionRequestControlState(activeProductionRequest);
  }

  function defaultOutputsForPlatforms(platforms) {
    return Array.from(new Set(Array.isArray(platforms) ? platforms : []))
      .map(platform => ({ platform, output_type: recommendedOutputFor(platform), enabled: true }))
      .filter(row => row.output_type);
  }

  async function saveProductionRequestOutputs(record = activeProductionRequest) {
    if (!record?.id || !productionOutputMatrixLoaded) return null;
    item4DropUnsupportedStoryChecks(false);
    let outputs = selectedOutputMatrix();
    if (!outputs.length) {
      const planPlatforms = item4SelectedPlatforms();
      const requestPlatforms = selectedRequestPlatforms();
      const savedPlatforms = Array.isArray(record?.platforms) ? record.platforms : [];
      outputs = defaultOutputsForPlatforms(planPlatforms.length ? planPlatforms : (requestPlatforms.length ? requestPlatforms : savedPlatforms));
    }
    if (!outputs.length) return null;

    const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/outputs`, {
      method: "PUT",
      body: JSON.stringify({ outputs }),
    });

    productionRequestOutputs = Array.isArray(result.records) ? result.records : [];
    if (result.production_request) activeProductionRequest = result.production_request;
    syncLegacyPlatformsFromOutputMatrix();
    updateOutputMatrixSummary();
    renderProductionRequestOutputCards();
    return result;
  }

  function setProductionRequestControlState(record) {
    const recordId = String(record?.id || "");
    const status = item4PromotedRequestIds.has(recordId)
      ? "Promoted"
      : String(record?.status || "Draft");
    const editable = status === "Draft" || status === "Ready";
    const form = $("productionRequestForm");

    if (form) {
      form.querySelectorAll("input, select, textarea").forEach((control) => {
        if (control.matches("[data-ez-asset-caption], [data-ez-caption-mode], #ezIdeaTitle, #ezIdeaSummary, #ezPrimaryLocation, #prPrimaryLocation")) return;
        control.disabled = !editable;
      });
    }
    syncNativeVideoCoverRule();
    syncEzIdeaIdentityFields();
    syncEzCaptionLock();

    const save = $("saveProductionRequest");
    if (save) {
      save.disabled = !editable;
      save.textContent = editable ? "Save" : (status === "Promoted" ? "Locked" : "Submitted");
    }

    const promote = $("promoteProductionRequest");
    if (promote) {
      if (item4PromoteInFlight || promote.dataset.busy === "true") {
        promote.disabled = true;
        promote.textContent = status === "Submitted" ? "Checking…" : "Submitting…";
      } else if (status === "Promoted") {
        const retryHandoff = item4IsFinishedRequest(record);
        promote.disabled = !retryHandoff;
        promote.textContent = retryHandoff ? "Send to review" : "Promoted";
        if (retryHandoff) {
          promote.title = "Finish the Pipeline review handoff. This does not publish.";
        }
      } else if (status === "Submitted") {
        promote.disabled = false;
        promote.textContent = "Check promotion status";
      } else if (item4Workspace?.assets?.length) {
        const planReady = item4Workspace?.plan_status === "Ready";
        const finished = item4IsFinishedRequest(record);
        const variantsReady = finished
          || item4Workspace?.variant_status === "Ready"
          || item4Workspace?.variant_status === "Not Needed";
        promote.disabled = Boolean(item4Uploading);
        promote.textContent = "Approve";
        promote.title = !planReady
          ? "Choose platforms first."
          : (!variantsReady
              ? "Wait until platform crops are ready, then approve."
              : (finished
                  ? "Approve this finished file and send it to review."
                  : "Approve this piece and start production."));
      } else {
        promote.disabled = false;
        promote.textContent = "Approve";
      }
    }

    const sync = $("syncProductionRequestDirectives");
    if (sync) {
      sync.hidden = status !== "Promoted";
      sync.disabled = false;
      sync.textContent = "Sync advanced directives";
    }

    const compatibility = $("productionPromotionCompatibility");
    if (compatibility) {
      const warnings = Array.isArray(item4BridgePreflight?.warnings) ? item4BridgePreflight.warnings.filter(Boolean) : [];
      const notes = Array.isArray(item4BridgePreflight?.notes) ? item4BridgePreflight.notes.filter(Boolean) : [];
      let kind = "";
      const finished = item4IsFinishedRequest(record);
      let text = finished
        ? "Finished file, caption, and platform plan need to be ready before you approve."
        : "Photos, plan, and platform crops need to be ready before you approve.";
      if (status === "Promoted") {
        kind = "success";
        text = finished ? "Approved. This finished file is going to review." : "Approved. This request is in production.";
      } else if (status === "Submitted") {
        text = "This request was sent. Use Check promotion status if you need an update.";
      } else if (item4Workspace?.assets?.length) {
        if (item4Workspace?.plan_status !== "Ready") {
          text = "Photos are saved. Next: save the platform plan.";
        } else if (!finished && item4Workspace?.variant_status !== "Ready" && item4Workspace?.variant_status !== "Not Needed") {
          text = "Plan is ready. Next: prepare the platform crops.";
        } else if (item4BridgePreflight?.ready) {
          kind = "success";
          const extra = [...notes, ...warnings].filter(Boolean);
          text = extra.length
            ? `Ready to approve. ${extra.join(" ")}`
            : "Ready to approve.";
        } else if (item4BridgePreflight?.pending) {
          text = "Finishing a quick check. Your crops are saved.";
        } else if (item4BridgePreflight) {
          const copy = item4BridgeIssueCopy(item4BridgePreflight.issues);
          if (!copy.length) {
            text = "Finishing a quick check. Your crops are saved.";
          } else if (
            item4Workspace?.variant_status === "Ready"
            && item4BridgeIssuesAreDestinationLinks(item4BridgePreflight.issues)
          ) {
            text = "Finishing destination links. Your crops are saved.";
          } else {
            kind = "error-text";
            text = copy.join(" ");
          }
        } else {
          text = "Finishing a quick check. Your crops are saved.";
        }
      }
      compatibility.className = `form-message${kind ? ` ${kind}` : ""}`;
      compatibility.textContent = text;
    }
  }

  function populateProductionRequestForm(record, { reveal = true } = {}) {
    activeProductionRequest = record;
    productionOutputMatrixLoaded = false;
    if (reveal && ezEntryPath !== "content") {
      showProductionRequestWorkspace();
    } else {
      $("productionRequestWorkspace").hidden = true;
    }
    $("productionRequestTitle").textContent = activeIdea?.title || ideaTitleForRequest(record) || "Untitled piece";
    if ($("productionRequestSubtitle")) $("productionRequestSubtitle").textContent = "";
    const requestId = $("productionRequestId");
    if (requestId) {
      requestId.textContent = record.production_request_id || "";
      requestId.hidden = true;
      if (record.production_request_id) requestId.setAttribute("title", record.production_request_id);
    }
    $("productionRequestStatus").textContent = record.status || "Draft";
    $("productionRequestStatus").className = `badge ${stateClass(record.status || "Draft")}`;

    setSelectValue("prContentType", record.content_type, "");
    syncHiddenMasterContentType();
    document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
      input.checked = Array.isArray(record.platforms) && record.platforms.includes(input.value);
    });
    setSelectValue("prVoiceover", record.voiceover_mode, "Yes");
    setSelectValue("prMusicMode", record.background_music_mode, "Yes");
    setSelectValue("prThumbnail", record.thumbnail_mode, "Yes");
    if (record.voiceover_mode === "Yes") {
      applyVoiceToSelects(record.voice_id || DEFAULT_VOICE_ID, record.voice_name || DEFAULT_VOICE_NAME);
    }
    syncRequestVoiceUi();
    $("prVideoDuration").value = record.video_duration_seconds ?? 30;
    if ($("prVoiceoverDuration")) $("prVoiceoverDuration").value = record.voiceover_duration_seconds ?? defaultVoiceoverDuration(record.video_duration_seconds ?? 30);
    if ($("prMusicStart")) $("prMusicStart").value = record.music_start_seconds ?? 0;
    setSelectValue("prVideoClipMode", record.video_clip_count_mode, "AI decides");
    $("prVideoClipExact").value = record.video_clip_count_exact ?? "";
    $("prVideoClipMin").value = record.video_clip_count_min ?? "";
    $("prVideoClipMax").value = record.video_clip_count_max ?? "";
    setSelectValue("prCarouselSlideMode", record.carousel_slide_count_mode, "AI decides");
    $("prCarouselSlideExact").value = record.carousel_slide_count_exact ?? "";
    $("prCarouselSlideMin").value = record.carousel_slide_count_min ?? "";
    $("prCarouselSlideMax").value = record.carousel_slide_count_max ?? "";
    setSelectValue("prCarouselImageMode", record.carousel_image_mode, "Make AI Generated");
    $("prVoiceoverTail").value = record.voiceover_tail_seconds ?? 15;
    setSelectValue("prTitleMode", record.title_mode, "AI decides");
    $("prRequestedTitle").value = record.requested_title || "";
    setSelectValue("prCaptionMode", record.caption_mode, "AI decides");
    $("prRequestedCaption").value = record.requested_caption || "";
    hydrateEzCaptionDrafts({ assets: record.studio_master_assets || [] });
    ezSlideCaptionHealDone = false;
    setSelectValue("prScriptMode", record.script_mode, "AI decides");
    $("prRequestedScript").value = record.requested_script || "";
    $("prProductionNotes").value = record.production_notes || "";
    hydratePrimaryLocationFromSources({ record, idea: activeIdea, force: true });
    const musicId = Array.isArray(record.selected_music_asset_links) ? record.selected_music_asset_links[0] : "";
    $("prMusicAsset").value = musicId || "";
    syncAllStructureControls();
    setProductionRequestControlState(record);
    setRequestMessage();
    const parsed = ezPlanApi()?.parseEzOriginNotes(record.production_notes);
    const intakeKind = parsed?.inputKind
      ? (ezPlanApi()?.ezIntakeKindFromWizard?.(parsed.inputKind) || parsed.inputKind)
      : null;
    if (["multiple-photos", "single-photo", "photos-and-clips", "video-clips", "finished-video", "finished-stills"].includes(intakeKind)) {
      if (ezEntryPath === "content") {
        selectEzInput(intakeKind, { resetPlatforms: false });
        document.querySelectorAll("[data-ez-platform]").forEach((input) => {
          input.checked = Array.isArray(record.platforms) && record.platforms.includes(input.value);
        });
        syncEzYouTubeAvailability(false);
        if (parsed?.captionMode) {
          ezCaptionDefault = parsed.captionMode;
          renderEzCaptionUi();
        }
      } else {
        selectPrMediaKind(intakeKind, { quiet: true });
      }
    }
    hydrateEzConfigFromRequest(record);
    // Always start collapsed; operators can expand when they need the matrix.
    setEzAdvancedOpen(false);
    loadEzAudioOptions().catch(() => {});
    syncFinishedMediaHeadings();
  }

  async function openProductionRequestForIdea(idea, { fromWizard = false } = {}) {
    if (!idea?.id) return;
    const button = $("configureProductionButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Opening…";
    }
    setManageMessage("Opening Phase 2B Production Request…", "");
    if (fromWizard) ezWizardSetMessage("Opening production…");

    try {
      loadEzAudioOptions().catch(() => {});
      let result;
      if (ezWizardPending) {
        applyEzWizardAnswersToIntake();
        const payload = ezWizardRequestPayload(ezWizardPending.planned, {
          fileCount: ezPlanApi()?.ezWizardPhotoCount?.(ezWizardPending) || 1,
        });
        result = await createEzProductionRequest(idea.id, payload);
      } else {
        result = await api(`/api/ideas/${encodeURIComponent(idea.id)}/production-request`, {
          method: "POST",
          body: JSON.stringify({}),
        });
      }
      await closeIdeaDrawer({ save: false });
      activeIdea = idea;
      ezEntryPath = "configure";
      switchToPage("content");
      populateProductionRequestForm(result.record);
      showProductionRequestWorkspace();
      if (fromWizard) ezWizardSetMessage("Loading the draft…");
      await loadProductionRequestOutputs(result.record);
      await loadItem4Workspace(result.record);
      const assetCount = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets.length : 0;
      if (ezWizardPending) {
        const extras = ezWizardPending.planned?.extras || [];
        applyEzExtraOutputs(extras);
        if (extras.length) await saveProductionRequestOutputs(result.record);
        const intake = ezPlanApi()?.ezIntakeKindFromWizard?.(ezWizardPending.inputKind);
        if (intake) selectPrMediaKind(intake, { quiet: true });
        else if (!assetCount) selectPrMediaKind(null, { quiet: true });
        if (ezWizardAllowsPlanWithoutAssets()) {
          ezAutoPlanAfterUpload = true;
          await maybeAutoEzPlan(true);
        }
      } else if (!assetCount) selectPrMediaKind(null, { quiet: true });
      else syncPrMediaKindUi();
      loadProductionRequests().catch(() => {});
      setEzAdvancedOpen(false);
      if (ezWizardPending) {
        const needsUpload = ezPlanApi()?.ezWizardRequiresUploads?.(ezWizardPending);
        if (!needsUpload) {
          setRequestMessage("Studio will generate the images. You can still add a title, script, or notes before you approve.", "success");
        } else if (ezWizardPending.inputKind === "mixed") {
          const n = ezPlanApi()?.ezWizardExpectedUploads?.(ezWizardPending) || 1;
          setRequestMessage(`Drop ${n} of your photo${n === 1 ? "" : "s"}. Studio will add ${ezWizardPending.aiCount} AI image${Number(ezWizardPending.aiCount) === 1 ? "" : "s"}.`, "success");
        } else if (ezWizardPending.inputKind === "video-clips") {
          const n = Number(ezWizardPending.clipCount) || 1;
          setRequestMessage(`Add ${n} clip${n === 1 ? "" : "s"}.`, "success");
        } else if (ezWizardPending.inputKind === "photos-and-clips") {
          setRequestMessage(`Add ${ezWizardPending.photoCount || 0} photo${Number(ezWizardPending.photoCount) === 1 ? "" : "s"} and ${ezWizardPending.clipCount || 0} clip${Number(ezWizardPending.clipCount) === 1 ? "" : "s"}.`, "success");
        } else {
          setRequestMessage("Add photos one at a time, or drop several together.", "success");
        }
      } else {
        setRequestMessage(result.created ? "Production Request draft created. Choose Single or Multiple photos, then upload." : "Existing Production Request draft opened.", "success");
      }
    } catch (e) {
      setManageMessage(e.message, "error-text");
      if (fromWizard) {
        ezWizardSetMessage(e.message || "Could not open production.", "error-text");
        throw e;
      }
    } finally {
      if (button && activeIdea && !ideaIsPromoted(activeIdea) && !activeIdea.is_on_hold) {
        button.disabled = false;
        button.textContent = "Add new photos";
      }
    }
  }

  let ideaLibraryPickerItems = [];
  let ideaLibrarySelected = new Set();
  let ideaLibrarySuggestedIds = new Set();
  let ideaLibrarySeeded = false;
  let ideaLibrarySearchTimer = 0;

  function resetIdeaLibraryPicker() {
    ideaLibraryPickerItems = [];
    ideaLibrarySelected = new Set();
    ideaLibrarySuggestedIds = new Set();
    ideaLibrarySeeded = false;
    const picker = $("ideaLibraryPicker");
    const grid = $("ideaLibraryGrid");
    const search = $("ideaLibrarySearch");
    const continueButton = $("ideaLibraryContinueButton");
    if (picker) picker.hidden = true;
    if (grid) grid.innerHTML = "";
    if (search) search.value = "";
    if (continueButton) continueButton.disabled = true;
  }

  function ideaLibraryPreviewUrl(item) {
    const path = String(item?.preview_path || "").trim();
    if (path.startsWith("http")) return path;
    if (path) return `${apiBase}${path}`;
    const id = String(item?.id || "").trim();
    return id ? `${apiBase}/api/media-assets/${encodeURIComponent(id)}/preview` : "";
  }

  function libraryPickerMaxCount() {
    const ideaMax = Number(activeIdea?.carousel_slide_count_max || 0);
    const requestMax = Number(activeProductionRequest?.carousel_slide_count_max || 0);
    const cap = ideaMax || requestMax || 10;
    return Math.min(20, Math.max(1, cap));
  }

  async function fetchLibraryBrowse(query = "") {
    const q = String(query || "").trim();
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    params.set("include", "video");
    const result = await api(`/api/media-assets/library-stills?${params.toString()}`, { timeoutMs: 20000 });
    return Array.isArray(result?.records) ? result.records : [];
  }

  async function fetchIdeaLibrarySuggested(ideaId) {
    if (!ideaId) return [];
    const result = await api(`/api/ideas/${encodeURIComponent(ideaId)}/library-suggestions`, { timeoutMs: 20000 });
    return Array.isArray(result?.suggested) ? result.suggested : [];
  }

  function mergeLibraryPickerItems(suggested, browse) {
    const byId = new Map();
    for (const item of suggested || []) byId.set(item.id, { ...item, suggested: true });
    for (const item of browse || []) {
      if (!byId.has(item.id)) byId.set(item.id, { ...item, suggested: false });
    }
    return [...byId.values()];
  }

  function seedLibrarySelection(current, suggested, attachedIds, max, seed) {
    const next = new Set(current || []);
    for (const id of attachedIds || []) if (id) next.add(id);
    if (seed) {
      for (const item of suggested || []) {
        if (next.size >= max) break;
        if (item?.id) next.add(item.id);
      }
    }
    return next;
  }

  function renderLibraryPickerSections(items, selected, suggestedIds, idAttr) {
    const suggested = items.filter((item) => suggestedIds.has(item.id));
    const more = items.filter((item) => !suggestedIds.has(item.id));
    const card = (item) => {
      const checked = selected.has(item.id);
      const preview = ideaLibraryPreviewUrl(item);
      const video = String(item.media_kind || "").toLowerCase() === "video";
      const duration = video ? formatLibraryClipDuration(item4KnownClipDuration(item)) : "";
      const tags = [];
      if (suggestedIds.has(item.id)) tags.push(`<em class="idea-library-card-tag">Suggested</em>`);
      if (video) tags.push(`<em class="idea-library-card-tag">Clip</em>`);
      const tag = tags.join("");
      const media = video
        ? (item4ClipPlayerHtml({
          previewUrl: preview,
          streamUrl: item4ClipStreamUrl(item),
          name: item.name || "Clip",
          durationSeconds: item.duration_seconds,
          asset: item,
          preload: false,
        }) || (preview ? `<img src="${escapeHtml(preview)}" alt="" loading="lazy">` : `<img alt="">`))
        : (preview ? `<img src="${escapeHtml(preview)}" alt="" loading="lazy">` : `<img alt="">`);
      return `<div class="idea-library-card" role="button" tabindex="0" ${idAttr}="${escapeHtml(item.id)}" data-selected="${checked ? "true" : "false"}">
        <input type="checkbox" tabindex="-1" ${checked ? "checked" : ""} aria-hidden="true">
        ${media}
        ${tag}
        <span>${escapeHtml(item.name || item.id)}${duration ? ` · ${escapeHtml(duration)}` : ""}</span>
      </div>`;
    };
    const parts = [];
    if (suggested.length) {
      parts.push(`<div class="idea-library-block"><p class="idea-library-section">Suggested</p><div class="idea-library-cards">${suggested.map(card).join("")}</div></div>`);
    }
    if (more.length) {
      parts.push(`<div class="idea-library-block"><p class="idea-library-section">More from library</p><div class="idea-library-cards">${more.map(card).join("")}</div></div>`);
    }
    return parts.join("") || `<p class="idea-library-picker-hint">No classified Drive stills matched that search.</p>`;
  }

  function syncIdeaLibraryContinue() {
    const button = $("ideaLibraryContinueButton");
    if (button) button.disabled = ideaLibrarySelected.size < 1;
  }

  function renderIdeaLibraryPicker() {
    const grid = $("ideaLibraryGrid");
    const hint = $("ideaLibraryPickerHint");
    if (!grid) return;
    grid.innerHTML = renderLibraryPickerSections(
      ideaLibraryPickerItems,
      ideaLibrarySelected,
      ideaLibrarySuggestedIds,
      "data-library-id"
    );
    if (hint) {
      const checked = ideaLibrarySelected.size;
      const suggested = ideaLibrarySuggestedIds.size;
      const max = libraryPickerMaxCount();
      hint.textContent = suggested
        ? `${suggested} suggested. ${checked} checked (max ${max}). Uncheck to drop, search to add.`
        : `No place match yet. ${checked} checked (max ${max}). Search the Drive library and check stills to add.`;
    }
    syncIdeaLibraryContinue();
    item4BindClipPlayers(grid);
  }

  async function loadIdeaLibrarySuggestions(query = "") {
    if (!activeIdea?.id) return;
    const grid = $("ideaLibraryGrid");
    const hint = $("ideaLibraryPickerHint");
    if (grid) grid.innerHTML = `<p class="idea-library-picker-hint">Loading library stills…</p>`;
    if (hint) hint.textContent = "Loading suggested stills and the Drive library.";
    const [suggested, browse] = await Promise.all([
      fetchIdeaLibrarySuggested(activeIdea.id),
      fetchLibraryBrowse(query),
    ]);
    ideaLibrarySuggestedIds = new Set(suggested.map((item) => item.id));
    ideaLibraryPickerItems = mergeLibraryPickerItems(suggested, browse);
    ideaLibrarySelected = seedLibrarySelection(
      ideaLibrarySelected,
      suggested,
      [],
      libraryPickerMaxCount(),
      !ideaLibrarySeeded
    );
    ideaLibrarySeeded = true;
    renderIdeaLibraryPicker();
  }

  async function openIdeaLibraryPicker() {
    const picker = $("ideaLibraryPicker");
    if (picker) picker.hidden = false;
    picker?.scrollIntoView({ block: "nearest" });
    try {
      await loadIdeaLibrarySuggestions($("ideaLibrarySearch")?.value || "");
    } catch (error) {
      setManageMessage(error.message || "Could not load library suggestions.", "error-text");
      const grid = $("ideaLibraryGrid");
      if (grid) grid.innerHTML = `<p class="idea-library-picker-hint">${escapeHtml(error.message || "Could not load library suggestions.")}</p>`;
    }
  }

  async function openProductionRequestWithLibrary(idea, mediaAssetIds) {
    if (!idea?.id) return;
    const continueButton = $("ideaLibraryContinueButton");
    if (continueButton) {
      continueButton.disabled = true;
      continueButton.textContent = "Attaching…";
    }
    setManageMessage("Attaching library stills and opening Production…", "");
    try {
      await Promise.all([ensureProductionRequestMusic(), loadEzAudioOptions()]);
      const result = await api(`/api/ideas/${encodeURIComponent(idea.id)}/production-request`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      const requestId = result?.record?.id;
      if (!requestId) throw new Error("Production Request was not created.");
      await api(`/api/production-requests/${encodeURIComponent(requestId)}/assets/library`, {
        method: "POST",
        body: JSON.stringify({ media_asset_ids: mediaAssetIds }),
        timeoutMs: 45000,
      });
      await closeIdeaDrawer({ save: false });
      activeIdea = idea;
      ezEntryPath = "configure";
      switchToPage("content");
      populateProductionRequestForm(result.record);
      showProductionRequestWorkspace();
      await loadProductionRequestOutputs(result.record);
      await loadItem4Workspace(result.record);
      const assetCount = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets.length : 0;
      selectPrMediaKind(assetCount > 1 ? "multiple-photos" : "single-photo", { quiet: true });
      await loadProductionRequests();
      setEzAdvancedOpen(false);
      setRequestMessage(
        `${assetCount} library still${assetCount === 1 ? "" : "s"} attached. Add more or change platforms, then approve.`,
        "success"
      );
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      if (continueButton) {
        continueButton.textContent = "Continue to Production";
        syncIdeaLibraryContinue();
      }
    }
  }

  $("item4ChooseMedia")?.addEventListener("click", (event) => {
    event.stopPropagation();
    item4ApplyMediaInputAccept(ezIntakeKind);
    $("item4MediaInput")?.click();
  });
  $("item4ChooseClip")?.addEventListener("click", (event) => {
    event.stopPropagation();
    item4BeginClipPick("item4ClipInput");
  });
  $("item4MediaInput")?.addEventListener("change", (event) => { uploadItem4Files(event.target.files); event.target.value = ""; });
  $("item4ClipInput")?.addEventListener("change", (event) => { uploadItem4Files(event.target.files); event.target.value = ""; });

  let item4LibraryItems = [];
  let item4LibrarySelected = new Set();
  let item4LibrarySuggestedIds = new Set();
  let item4LibrarySeeded = false;
  let item4LibrarySearchTimer = 0;

  function item4AttachedMediaIds() {
    return new Set((item4Workspace?.assets || []).map((asset) => String(asset.media_asset_record_id || "").trim()).filter(Boolean));
  }

  function item4LibraryDiff() {
    const attached = item4AttachedMediaIds();
    const toAdd = [...item4LibrarySelected].filter((id) => !attached.has(id));
    const toRemove = [...attached].filter((id) => !item4LibrarySelected.has(id));
    return { toAdd, toRemove, attached };
  }

  function syncItem4LibraryAdd() {
    const button = $("item4LibraryAddButton");
    if (!button) return;
    const { toAdd, toRemove } = item4LibraryDiff();
    button.disabled = !activeProductionRequest?.id || (!toAdd.length && !toRemove.length);
  }

  function renderItem4LibraryPicker() {
    const grid = $("item4LibraryGrid");
    const hint = $("item4LibraryPickerHint");
    if (!grid) return;
    grid.innerHTML = renderLibraryPickerSections(
      item4LibraryItems,
      item4LibrarySelected,
      item4LibrarySuggestedIds,
      "data-item4-library-id"
    );
    if (hint) {
      const { toAdd, toRemove } = item4LibraryDiff();
      const max = libraryPickerMaxCount();
      hint.textContent = `${item4LibrarySuggestedIds.size} suggested. ${item4LibrarySelected.size} checked (max ${max}). Uncheck to remove, search to add.${toAdd.length || toRemove.length ? ` Apply will add ${toAdd.length} and remove ${toRemove.length}.` : ""}`;
    }
    syncItem4LibraryAdd();
    item4BindClipPlayers(grid);
  }

  async function loadItem4LibraryStills(query = "") {
    const grid = $("item4LibraryGrid");
    const hint = $("item4LibraryPickerHint");
    if (grid) grid.innerHTML = `<p class="idea-library-picker-hint">Loading suggested stills and the Drive library…</p>`;
    if (hint) hint.textContent = "Loading suggested stills and the Drive library.";
    const ideaId = activeProductionRequest?.idea_record_id || activeIdea?.id || null;
    const [suggested, browse] = await Promise.all([
      fetchIdeaLibrarySuggested(ideaId),
      fetchLibraryBrowse(query),
    ]);
    item4LibrarySuggestedIds = new Set(suggested.map((item) => item.id));
    item4LibraryItems = mergeLibraryPickerItems(suggested, browse);
    item4LibrarySelected = seedLibrarySelection(
      item4LibrarySelected,
      suggested,
      [...item4AttachedMediaIds()],
      libraryPickerMaxCount(),
      !item4LibrarySeeded
    );
    item4LibrarySeeded = true;
    renderItem4LibraryPicker();
  }

  async function openItem4LibraryPicker() {
    if (!activeProductionRequest?.id) {
      setRequestMessage("Open or create a Production request first, then pick from the library.", "error-text");
      return;
    }
    const picker = $("item4LibraryPicker");
    if (picker) picker.hidden = false;
    picker?.scrollIntoView({ block: "nearest" });
    try {
      await loadItem4LibraryStills($("item4LibrarySearch")?.value || "");
    } catch (error) {
      setRequestMessage(error.message || "Could not load Drive library stills.", "error-text");
      const grid = $("item4LibraryGrid");
      if (grid) grid.innerHTML = `<p class="idea-library-picker-hint">${escapeHtml(error.message || "Could not load Drive library stills.")}</p>`;
    }
  }

  $("item4ChooseLibrary")?.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openItem4LibraryPicker();
  });
  $("item4LibraryGrid")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-item4-play], video, .item4-clip-duration")) return;
    const card = event.target.closest("[data-item4-library-id]");
    if (!card || card.disabled) return;
    const id = String(card.dataset.item4LibraryId || "").trim();
    if (!id) return;
    if (item4LibrarySelected.has(id)) item4LibrarySelected.delete(id);
    else item4LibrarySelected.add(id);
    renderItem4LibraryPicker();
  });
  $("item4LibrarySearch")?.addEventListener("input", () => {
    window.clearTimeout(item4LibrarySearchTimer);
    item4LibrarySearchTimer = window.setTimeout(() => {
      loadItem4LibraryStills($("item4LibrarySearch")?.value || "").catch((error) => {
        setRequestMessage(error.message || "Library search failed.", "error-text");
      });
    }, 280);
  });
  $("item4LibraryCancelButton")?.addEventListener("click", () => {
    const picker = $("item4LibraryPicker");
    if (picker) picker.hidden = true;
  });
  $("item4LibraryAddButton")?.addEventListener("click", async () => {
    if (!activeProductionRequest?.id) return;
    const { toAdd, toRemove } = item4LibraryDiff();
    if (!toAdd.length && !toRemove.length) return;
    const button = $("item4LibraryAddButton");
    try {
      if (button) {
        button.disabled = true;
        button.textContent = "Applying…";
      }
      for (const mediaId of toRemove) {
        const asset = (item4Workspace?.assets || []).find((row) => String(row.media_asset_record_id || "").trim() === mediaId);
        if (!asset?.id) continue;
        await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(asset.id)}`, {
          method: "DELETE",
          body: JSON.stringify({}),
        });
      }
      let result = null;
      if (toAdd.length) {
        result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/library`, {
          method: "POST",
          body: JSON.stringify({ media_asset_ids: toAdd, allow_video: true, origin_kind: ezIntakeKind || "photos-and-clips" }),
          timeoutMs: 45000,
        });
        if (result?.record) {
          activeProductionRequest = result.record;
          populateProductionRequestForm(result.record);
        }
      }
      await loadItem4Workspace(activeProductionRequest);
      const added = Number(result?.attached || toAdd.length);
      setRequestMessage(
        `Updated library stills: added ${added}, removed ${toRemove.length}.`,
        "success"
      );
      const picker = $("item4LibraryPicker");
      if (picker) picker.hidden = true;
    } catch (error) {
      setRequestMessage(error.message || "Could not update library stills.", "error-text");
    } finally {
      if (button) button.textContent = "Apply selection";
      syncItem4LibraryAdd();
    }
  });
  $("item4BuildPlan")?.addEventListener("click", buildItem4Plan);
  $("item4PrepareVariants")?.addEventListener("click", prepareItem4Variants);
  document.querySelectorAll("[data-pr-input]").forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) return;
      selectPrMediaKind(button.dataset.prInput);
    });
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible" || !activeProductionRequest?.id) return;
    loadItem4Workspace(activeProductionRequest);
  });
  window.addEventListener("focus", () => {
    if (!activeProductionRequest?.id) return;
    loadItem4Workspace(activeProductionRequest);
  });
  const item4Drop = $("item4UploadZone");
  if (item4Drop) {
    ["dragenter","dragover"].forEach(type => item4Drop.addEventListener(type, event => { event.preventDefault(); item4Drop.classList.add("dragging"); }));
    ["dragleave","drop"].forEach(type => item4Drop.addEventListener(type, event => { event.preventDefault(); item4Drop.classList.remove("dragging"); }));
    item4Drop.addEventListener("drop", event => uploadItem4Files(event.dataTransfer?.files));
    item4Drop.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("item4MediaInput")?.click(); } });
  }
  bindEzIntake();

  $("configureProductionButton")?.addEventListener("click", async () => {
    if (!activeIdea) return;
    const button = $("configureProductionButton");
    try {
      const idea = await saveManagedIdeaIdentity({ quiet: true, reloadList: true });
      openProductionRequestForIdea(idea || activeIdea);
    } catch (error) {
      setManageMessage(error.message || "Could not save the idea before opening production.", "error-text");
      if (button && activeIdea && !ideaIsPromoted(activeIdea) && !activeIdea.is_on_hold) {
        button.disabled = false;
        button.textContent = "Add new photos";
      }
    }
  });

  $("useExistingLibraryButton")?.addEventListener("click", async () => {
    if (!activeIdea) return;
    const button = $("useExistingLibraryButton");
    try {
      if (button) button.disabled = true;
      const idea = await saveManagedIdeaIdentity({ quiet: true, reloadList: true });
      if (idea) activeIdea = idea;
      await openIdeaLibraryPicker();
    } catch (error) {
      setManageMessage(error.message || "Could not save the idea before loading library stills.", "error-text");
    } finally {
      if (button && activeIdea && !ideaIsPromoted(activeIdea) && !activeIdea.is_on_hold) {
        button.disabled = false;
      }
    }
  });

  $("ideaLibraryGrid")?.addEventListener("click", (event) => {
    if (event.target.closest("[data-item4-play], video, .item4-clip-duration")) return;
    const card = event.target.closest("[data-library-id]");
    if (!card) return;
    const id = String(card.dataset.libraryId || "").trim();
    if (!id) return;
    if (ideaLibrarySelected.has(id)) ideaLibrarySelected.delete(id);
    else ideaLibrarySelected.add(id);
    renderIdeaLibraryPicker();
  });

  $("ideaLibrarySearch")?.addEventListener("input", () => {
    window.clearTimeout(ideaLibrarySearchTimer);
    ideaLibrarySearchTimer = window.setTimeout(() => {
      loadIdeaLibrarySuggestions($("ideaLibrarySearch")?.value || "").catch((error) => {
        setManageMessage(error.message || "Library search failed.", "error-text");
      });
    }, 280);
  });

  $("ideaLibraryContinueButton")?.addEventListener("click", async () => {
    if (!activeIdea || ideaLibrarySelected.size < 1) return;
    try {
      const idea = await saveManagedIdeaIdentity({ quiet: true, reloadList: true });
      await openProductionRequestWithLibrary(idea || activeIdea, [...ideaLibrarySelected]);
    } catch (error) {
      setManageMessage(error.message || "Could not attach library stills.", "error-text");
    }
  });

  $("closeProductionRequest")?.addEventListener("click", () => {
    stopItem4MasterPolling();
    stopItem4VariantPolling();
    const workspace = $("productionRequestWorkspace");
    if (workspace) workspace.hidden = true;
    activeProductionRequest = null;
    productionRequestOutputs = [];
    productionOutputMatrixLoaded = false;
    item4Workspace = null;
    item4PlanOverrides = {};
    item4PreparingVariants = false;
    stopItem4VariantPolling();
    clearOutputMatrix();
    setRequestMessage();
    if (ezEntryPath === "configure") {
      ezEntryPath = null;
      setPageContentSimple(false);
      hideEzFrontDoor();
    }
  });

  function inferredMasterContentType() {
    const count = Number(item4Workspace?.assets?.length || ezStagedFiles.length || 0);
    return ezPlanApi()?.ezMasterContentType?.(count)
      || (count <= 1 ? "Feed Post" : "Photo Set");
  }

  function syncHiddenMasterContentType() {
    const select = $("prContentType");
    const inferred = inferredMasterContentType();
    const current = String(select?.value || "").trim();
    const fromRecord = String(activeProductionRequest?.content_type || "").trim();
    const next = (item4Workspace?.assets?.length || ezStagedFiles.length)
      ? inferred
      : (current || fromRecord || inferred);
    if (select && select.value !== next) select.value = next;
    return next;
  }

  function productionRequestPayload() {
    if (usingEzPlatforms() || ezEntryPath === "content") {
      const voiceoverMode = resolvedAudioMode("voiceover");
      const musicMode = resolvedAudioMode("music");
      if ($("prVoiceover")) $("prVoiceover").value = voiceoverMode;
      if ($("prMusicMode")) $("prMusicMode").value = musicMode;
      if ($("ezAudioVoiceover")) $("ezAudioVoiceover").value = voiceoverMode === "No" ? "No" : "Yes";
      if ($("ezAudioMusic")) $("ezAudioMusic").value = musicMode === "No" ? "No" : "Yes";
      syncRequestAudioUi({ fromEz: false });
      syncEzConfigFields();
    }
    const requestedPlatforms = selectedRequestPlatforms();
    const planPlatforms = item4SelectedPlatforms();
    const payload = {
      content_type: syncHiddenMasterContentType(),
      platforms: requestedPlatforms.length ? requestedPlatforms : planPlatforms,
      voiceover_mode: resolvedAudioMode("voiceover"),
      background_music_mode: resolvedAudioMode("music"),
      thumbnail_mode: $("prThumbnail").value,
      video_duration_seconds: $("prVideoDuration").value,
      video_clip_count_mode: $("prVideoClipMode").value,
      video_clip_count_exact: $("prVideoClipExact").value,
      video_clip_count_min: $("prVideoClipMin").value,
      video_clip_count_max: $("prVideoClipMax").value,
      carousel_slide_count_mode: $("prCarouselSlideMode").value,
      carousel_slide_count_exact: $("prCarouselSlideExact").value,
      carousel_slide_count_min: $("prCarouselSlideMin").value,
      carousel_slide_count_max: $("prCarouselSlideMax").value,
      carousel_image_mode: $("prCarouselImageMode").value,
      voiceover_tail_seconds: $("prVoiceoverTail").value,
      voiceover_duration_seconds: $("prVoiceoverDuration")?.value || defaultVoiceoverDuration($("prVideoDuration")?.value || 30),
      music_start_seconds: $("prMusicStart")?.value || 0,
      selected_music_asset_id: $("prMusicAsset").value,
      ...selectedRequestVoice(),
      title_mode: $("prTitleMode").value,
      requested_title: $("prRequestedTitle").value.trim(),
      caption_mode: $("prCaptionMode").value,
      requested_caption: $("prRequestedCaption").value.trim(),
      script_mode: $("prScriptMode").value,
      requested_script: $("prRequestedScript").value.trim(),
      primary_location: currentPrimaryLocationValue(),
      production_notes: $("prProductionNotes").value.trim(),
      slide_captions: collectEzSlideCaptionRecords(),
    };
    if (payload.video_clip_count_mode === "Exact" && !String(payload.video_clip_count_exact || "").trim()) {
      payload.video_clip_count_mode = activeProductionRequest?.video_clip_count_mode || "AI decides";
      payload.video_clip_count_exact = activeProductionRequest?.video_clip_count_exact ?? "";
    }
    if (payload.carousel_slide_count_mode === "Exact" && !String(payload.carousel_slide_count_exact || "").trim()) {
      payload.carousel_slide_count_exact = activeProductionRequest?.carousel_slide_count_exact
        || item4Workspace?.assets?.length
        || ezStagedFiles.length
        || "";
    }
    if (!payload.content_type) payload.content_type = activeProductionRequest?.content_type || "";
    if (!payload.platforms.length && Array.isArray(activeProductionRequest?.platforms)) {
      payload.platforms = activeProductionRequest.platforms;
    }
    const parsed = ezPlanApi()?.parseEzOriginNotes(payload.production_notes);
    if (parsed?.captionMode === "none") {
      const none = ezPlanApi().ezCaptionFields("none");
      Object.assign(payload, none.live_fallback || {
        title_mode: "Force exact",
        requested_title: " ",
        caption_mode: "Force exact",
        requested_caption: " ",
      });
      payload.production_notes = $("prProductionNotes").value.trim();
    }
    return payload;
  }

  async function saveActiveProductionRequest({ quiet = false } = {}) {
    if (!activeProductionRequest?.id) throw new Error("No Production Request is open");
    if (!["Draft", "Ready"].includes(String(activeProductionRequest.status || "Draft"))) {
      return activeProductionRequest;
    }

    const button = $("saveProductionRequest");
    if (button) {
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = "Saving draft…";
    }
    if (!quiet) setRequestMessage();

    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}`, {
        method: "PATCH",
        body: JSON.stringify(productionRequestPayload()),
      });
      activeProductionRequest = result.record;
      ezDirty.clear();
      if (quiet) return activeProductionRequest;
      await saveProductionRequestOutputs(result.record);
      populateProductionRequestForm(activeProductionRequest);
      await loadProductionRequestOutputs(activeProductionRequest);
      await loadItem4Workspace(activeProductionRequest);
      await loadProductionRequests();
      setRequestMessage("Production Request draft and requested platform outputs saved.", "success");
      return activeProductionRequest;
    } finally {
      if (button) {
        delete button.dataset.busy;
        setProductionRequestControlState(activeProductionRequest);
      }
    }
  }

  outputMatrixInputs().forEach(input => {
    input.addEventListener("change", () => {
      if (input.dataset.platform === "TikTok" && input.value === "Story" && input.checked) {
        item4DropUnsupportedStoryChecks(true);
        return;
      }
      syncLegacyPlatformsFromOutputMatrix();
      updateOutputMatrixSummary();
    });
  });

  document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
    input.addEventListener("change", () => {
      if (!["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) return;
      const platformInputs = outputMatrixInputs().filter(x => x.dataset.platform === input.value);
      if (!input.checked) {
        platformInputs.forEach(x => { x.checked = false; });
      } else if (!platformInputs.some(x => x.checked)) {
        const target = platformInputs.find(x => x.value === recommendedOutputFor(input.value));
        if (target) target.checked = true;
      }
      updateOutputMatrixSummary();
    });
  });

  $("prContentType")?.addEventListener("change", () => {
    document.querySelectorAll('input[name="prPlatform"]:checked').forEach(input => {
      if (!["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) return;
      const platformInputs = outputMatrixInputs().filter(x => x.dataset.platform === input.value);
      if (!platformInputs.some(x => x.checked)) {
        const target = platformInputs.find(x => x.value === recommendedOutputFor(input.value));
        if (target) target.checked = true;
      }
    });
    updateOutputMatrixSummary();
  });

  $("closePrOverride")?.addEventListener("click", () => {
    $("prOutputOverrideEditor").hidden = true;
    $("prOverrideRecordId").value = "";
  });

  $("savePrOverride")?.addEventListener("click", saveProductionRequestOutputOverride);

  $("productionRequestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveActiveProductionRequest();
    } catch (e) {
      setRequestMessage(e.message, "error-text");
      setProductionRequestControlState(activeProductionRequest);
    }
  });

  ["prVoiceover", "prVoice", "prMusicMode", "prMusicAsset"].forEach((id) => {
    $(id)?.addEventListener("change", (event) => {
      if (event.isTrusted !== false && (id === "prVoiceover" || id === "prMusicMode")) {
        audioUserTouched.add(id);
      }
      stopStudioAudioPreview();
      if ((id === "prMusicAsset" && $("prMusicAsset")?.value) || (id === "prVoice" && $("prVoice")?.value)) {
        clearPreviewPickMessage();
      }
      syncRequestAudioUi({ fromEz: false });
      if (activeProductionRequest?.id) saveActiveProductionRequest({ quiet: true }).catch(() => {});
    });
  });
  $("prVoicePreview")?.addEventListener("click", () => {
    const voice = phase6SelectedVoice($("prVoice"));
    if (voice.id) setRequestMessage();
    phase6PreviewSelectedVoice($("prVoice"), $("prVoicePreview"), setRequestMessage);
  });
  $("prMusicPreview")?.addEventListener("click", () => {
    const select = $("prMusicAsset");
    const id = String(select?.value || "").trim();
    if (!id) {
      setRequestMessage("Pick a music track to preview.", "error-text");
      return;
    }
    const option = select?.selectedOptions?.[0];
    const preview = String(option?.dataset?.preview || "").trim() || `${apiBase}/api/music/${encodeURIComponent(id)}/preview`;
    setRequestMessage();
    playStudioAudioPreview(preview, $("prMusicPreview"), setRequestMessage, option?.textContent?.trim() || "track");
  });

  $("syncProductionRequestDirectives")?.addEventListener("click", async () => {
    if (!activeProductionRequest?.id) return;

    const button = $("syncProductionRequestDirectives");
    if (button) {
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = "Syncing…";
    }
    setRequestMessage();

    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/sync-directives`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRequestMessage(
        `${result.message || "Advanced directives synchronized."} Content Item: ${result.content_item_record_id}.`,
        "success"
      );
    } catch (e) {
      setRequestMessage(e.message, "error-text");
    } finally {
      if (button) {
        delete button.dataset.busy;
        button.disabled = false;
        button.textContent = "Sync advanced directives";
      }
    }
  });

  $("promoteProductionRequest")?.addEventListener("click", async (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (!activeProductionRequest?.id) return;
    const promoteButton = $("promoteProductionRequest");
    if (item4PromoteInFlight || promoteButton?.dataset.busy === "true" || promoteButton?.disabled) return;
    if (item4PromotedRequestIds.has(String(activeProductionRequest.id))) return;

    if (item4Workspace?.assets?.length && item4Workspace?.plan_status !== "Ready") {
      setRequestMessage("Save the platform plan first, then click Approve again.", "error-text");
      return;
    }
    if (item4Workspace?.assets?.length && !item4IsFinishedRequest() && item4Workspace?.variant_status !== "Ready" && item4Workspace?.variant_status !== "Not Needed") {
      setRequestMessage("Platform crops are still finishing. Wait until they show ready, then click Approve again.", "error-text");
      return;
    }

    const status = String(activeProductionRequest.status || "Draft");

    if (status !== "Submitted") {
      const confirmed = window.confirm(
        status === "Promoted" && item4IsFinishedRequest()
          ? "Send this finished file to Pipeline review?\n\nThis does not publish."
          : item4IsFinishedRequest()
          ? "Approve this finished file and send it to review?\n\nThis skips production crops and render. It locks the request after it is sent."
          : "Approve this request and start production?\n\nThis locks the request after it is sent."
      );
      if (!confirmed) return;
    }

    item4PromoteInFlight = true;
    if (promoteButton) {
      promoteButton.disabled = true;
      promoteButton.dataset.busy = "true";
      promoteButton.textContent = status === "Submitted" ? "Checking…" : "Submitting…";
    }
    setRequestMessage("Sending this into production…", "success");

    try {
      if (status === "Draft" || status === "Ready") {
        await saveActiveProductionRequest({ quiet: true });
      }

      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/promote`, {
        method: "POST",
        body: JSON.stringify({}),
        timeoutMs: 120000,
      });

      if (result.production_request) {
        activeProductionRequest = result.production_request;
      }
      if (result.promoted && activeProductionRequest) {
        item4PromotedRequestIds.add(String(activeProductionRequest.id));
        activeProductionRequest = { ...activeProductionRequest, status: "Promoted" };
      }
      if (result.production_request || result.promoted) {
        populateProductionRequestForm(activeProductionRequest);
      }
      setProductionRequestControlState(activeProductionRequest);

      if (result.promoted) {
        const content = result.content_item_record_id ? ` Content Item: ${result.content_item_record_id}.` : "";
        setRequestMessage(`${result.message || "Approved. This request is in production."}${content}`, "success");
        openPipelineAfterPromote();
      } else {
        setRequestMessage(result.message || "Promotion is processing.", "");
      }

      Promise.all([loadProductionRequests(), loadContent(), loadIdeas(), loadDashboard()]).catch(() => {});
    } catch (e) {
      if (isTimeoutError(e) && activeProductionRequest?.id) {
        try {
          const latest = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}`);
          if (latest?.record) {
            activeProductionRequest = latest.record;
            populateProductionRequestForm(latest.record);
            setProductionRequestControlState(latest.record);
            const latestStatus = String(latest.record.status || "");
            if (latestStatus === "Promoted") {
              item4PromotedRequestIds.add(String(latest.record.id || activeProductionRequest.id));
              activeProductionRequest = { ...activeProductionRequest, status: "Promoted" };
              populateProductionRequestForm(activeProductionRequest);
              setProductionRequestControlState(activeProductionRequest);
              setRequestMessage("Approved. This request is in production.", "success");
              item4PromoteInFlight = false;
              if (promoteButton) delete promoteButton.dataset.busy;
              openPipelineAfterPromote();
              return;
            }
            if (latestStatus === "Submitted") {
              setRequestMessage("Promotion is still processing. Click Check promotion status in a moment.", "success");
              item4PromoteInFlight = false;
              if (promoteButton) delete promoteButton.dataset.busy;
              setProductionRequestControlState(activeProductionRequest);
              return;
            }
          }
        } catch {}
      }
      item4PromoteInFlight = false;
      if (promoteButton) {
        delete promoteButton.dataset.busy;
        promoteButton.disabled = false;
        promoteButton.textContent = "Approve";
      }
      setRequestMessage(e.message, "error-text");
      setProductionRequestControlState(activeProductionRequest);
      return;
    }

    item4PromoteInFlight = false;
    if (promoteButton) delete promoteButton.dataset.busy;
    setProductionRequestControlState(activeProductionRequest);
  });

  async function loadProductionRequests({ silent = false } = {}) {
    const target = $("productionRequestList");
    if (!target) return;
    if (silent && item4Uploading) return;
    if (!silent) target.innerHTML = '<div class="empty production-empty"><strong>Loading drafts…</strong></div>';
    try {
      const { records = [] } = await api("/api/production-requests?limit=100");
      // Drafts = still editable (or mid-promote). Promoted requests live under
      // In production / Platform pipeline — not as Continue cards.
      const draftStatuses = new Set(["Draft", "Ready", "Submitted"]);
      const drafts = records.filter((record) => draftStatuses.has(String(record?.status || "").trim()));
      if (!drafts.length) {
        target.innerHTML = '<div class="empty production-empty">No open drafts. Start from Home, or open Platform pipeline for work already promoted.</div>';
        return;
      }
      await ensureIdeasCache();
      target.innerHTML = `<div class="production-draft-grid">${drafts.map(r => {
        const ideaName = ideaTitleForRequest(r) || "Untitled piece";
        const timing = studioRecordTimingLabel(r);
        const platforms = join(r.platforms);
        return `<article class="production-draft-card">
          <div class="production-draft-meta">${badge(r.status)}${timing ? `<span class="subtle">${escapeHtml(timing)}</span>` : ""}</div>
          <h3>${value(ideaName)}</h3>
          <p>${platforms !== "—" ? platforms : "Platforms not chosen yet"}</p>
          <button type="button" class="manage-button" data-pr-id="${escapeHtml(r.id)}">Continue</button>
        </article>`;
      }).join("")}</div>`;

      const byId = new Map(drafts.map(record => [record.id, record]));
      target.querySelectorAll("[data-pr-id]").forEach(button => {
        button.addEventListener("click", async () => {
          const record = byId.get(button.dataset.prId);

          if (!record) {
            setRequestMessage("That draft is not in the current list. Click Refresh and try again.", "error-text");
            return;
          }

          // Open immediately from the Production Request record already loaded
          // into the drafts table. Do not block opening on a second API call.
          const ideaId = ideaIdFromRequest(record);
          activeIdea = ideaId ? ideasCache.find((idea) => idea.id === ideaId) || null : null;
          populateProductionRequestForm(record);
          await loadProductionRequestOutputs(record);
          await loadItem4Workspace(record);

          // Refresh music choices only after the workspace is visible.
          try {
            await Promise.all([ensureProductionRequestMusic(), loadEzAudioOptions()]);
            const musicId = Array.isArray(record.selected_music_asset_links)
              ? record.selected_music_asset_links[0]
              : "";
            if ($("prMusicAsset")) $("prMusicAsset").value = musicId || "";
            if (record.voiceover_mode === "Yes") {
              applyVoiceToSelects(record.voice_id || DEFAULT_VOICE_ID, record.voice_name || DEFAULT_VOICE_NAME);
            }
            syncRequestVoiceUi();
          } catch (e) {
            setRequestMessage(
              `Production Request opened. Music catalogue refresh failed: ${e.message}`,
              "error-text"
            );
          }

          $("productionRequestWorkspace")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });
      });
      productionDecorateTooltips(target);
    } catch (e) {
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  }


  function ideaStructureLabel(record) {
    const wait = String(record?.photo_wait_status || "").trim();
    if (wait === "Waiting") {
      const high = Number(record?.photo_match?.high_count || 0);
      const min = Number(record?.carousel_slide_count_min || 0);
      return `${high} / ${min || "?"} photos`;
    }
    if (wait === "Ready") {
      const count = Array.isArray(record?.matched_media_asset_links) ? record.matched_media_asset_links.length : (record?.photo_match?.selected?.length || 0);
      return `${count || record.carousel_slide_count || 0} photos ready`;
    }
    if (record?.carousel_slide_count_mode === "Target range") {
      return `${record.carousel_slide_count_min || "?"}–${record.carousel_slide_count_max || "?"} photos`;
    }
    if (record?.carousel_slide_count) return `${record.carousel_slide_count} slides`;
    if (record?.video_clip_count) return `${record.video_clip_count} clips`;
    return "AI / default";
  }

  function ideaProductionLabel(record) {
    return `VO: ${record?.include_voiceover || "—"} · Music: ${record?.include_background_music || "—"} · Thumbnail: ${record?.include_thumbnail || "—"}`;
  }

  function ideaSortValue(record, key) {
    if (key === "idea") {
      const ms = parseStudioDate(record?.created_at)?.getTime();
      if (Number.isFinite(ms)) return ms;
      return String(record?.title || record?.candidate_id || "");
    }
    if (key === "status") return String(ideaStatusLabel(record));
    if (key === "type") return String(record?.content_type || "");
    if (key === "platforms") return Array.isArray(record?.platforms) ? record.platforms.join(", ") : "";
    if (key === "structure") return ideaStructureLabel(record);
    if (key === "production") return ideaProductionLabel(record);
    return "";
  }

  function compareIdeaRows(a, b, key) {
    if (key === "idea") {
      const ta = parseStudioDate(a?.created_at)?.getTime();
      const tb = parseStudioDate(b?.created_at)?.getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      if (Number.isFinite(ta) && !Number.isFinite(tb)) return 1;
      if (!Number.isFinite(ta) && Number.isFinite(tb)) return -1;
    }
    const av = ideaSortValue(a, key);
    const bv = ideaSortValue(b, key);
    if (typeof av === "number" && typeof bv === "number") return av - bv;
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  }

  function sortedIdeaRecords(records) {
    const dir = ideasSort.dir === "desc" ? -1 : 1;
    const key = ideasSort.key || "idea";
    return [...records].sort((a, b) => {
      const primary = compareIdeaRows(a, b, key);
      if (primary) return dir * primary;
      return dir * compareIdeaRows(a, b, "idea");
    });
  }

  function ideaSortHeader(key, label) {
    const active = ideasSort.key === key;
    const arrow = !active ? "↕" : ideasSort.dir === "asc" ? "↑" : "↓";
    return `<th><button type="button" class="table-sort${active ? " is-active" : ""}" data-idea-sort="${escapeHtml(key)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function renderIdeasTable(target, records) {
    if (!target) return;
    if (!records.length) {
      target.innerHTML = '<div class="empty"><strong>No ideas are currently in the intake queue.</strong><br><span class="subtle">Studio is connected; the Idea Candidates table is simply empty after the recent reset/test cycle.</span></div>';
      return;
    }
    const sorted = sortedIdeaRecords(records);
    target.innerHTML = `<table class="data-table idea-table"><thead><tr>${ideaSortHeader("idea", "Idea")}${ideaSortHeader("status", "Status")}${ideaSortHeader("type", "Type")}${ideaSortHeader("platforms", "Platforms")}${ideaSortHeader("structure", "Structure")}${ideaSortHeader("production", "Production")}<th></th></tr></thead><tbody>${sorted.map((r) => {
      const promote = ideaShowPromoteAction(r)
        ? `<button type="button" class="manage-button promote-row-button" data-idea-id="${escapeHtml(r.id)}" data-idea-action="promote">Promote</button>`
        : "";
      return `<tr class="${r.is_on_hold ? "idea-row-held" : ""}"><td><div class="title-cell">${value(r.title)}</div><div class="subtle">${value(r.summary, "")}${r.created_at ? `${r.summary ? " · " : ""}Created ${dateValue(r.created_at)}` : ""}</div></td><td>${badge(ideaStatusLabel(r))}</td><td>${value(r.content_type)}</td><td>${join(r.platforms)}</td><td>${ideaStructureLabel(r)}</td><td><div class="subtle">${escapeHtml(ideaProductionLabel(r))}</div></td><td><div class="idea-row-actions">${promote}<button type="button" class="manage-button" data-idea-id="${escapeHtml(r.id)}">Manage</button></div></td></tr>`;
    }).join("")}</tbody></table>`;
    target.querySelectorAll("[data-idea-sort]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = button.dataset.ideaSort;
        if (ideasSort.key === key) {
          ideasSort.dir = ideasSort.dir === "asc" ? "desc" : "asc";
        } else {
          ideasSort.key = key;
          ideasSort.dir = key === "idea" ? "desc" : "asc";
        }
        renderIdeasTable(target, records);
      });
    });
    const byId = new Map(sorted.map((record) => [record.id, record]));
    target.querySelectorAll("[data-idea-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const idea = byId.get(button.dataset.ideaId);
        if (idea) openIdeaDrawer(idea, { focusPromote: button.dataset.ideaAction === "promote" });
      });
    });
  }

  function contentRenderLabel(record) {
    const counts = record?.output_state_counts;
    if (counts && typeof counts === "object") {
      const total = Object.values(counts).reduce((sum, n) => sum + Number(n || 0), 0);
      const incomplete = Number(counts.Rendering || 0)
        + Number(counts["Trying Again"] || 0)
        + Number(counts.Queued || 0)
        + Number(counts["Preparing Assets"] || 0);
      if (total && (counts.Rendering || counts["Trying Again"])) {
        return `Rendering ${Math.max(0, total - incomplete)}/${total}`;
      }
    }
    return String(record?.render_status || "");
  }

  function contentSortValue(record, key) {
    if (key === "content") {
      const ms = parseStudioDate(record?.created_at)?.getTime();
      if (Number.isFinite(ms)) return ms;
      return String(record?.title || record?.content_id || "");
    }
    if (key === "stage") return String(record?.studio_stage || "");
    if (key === "assets") return String(record?.asset_match_status || "");
    if (key === "render") return contentRenderLabel(record);
    if (key === "review") return String(record?.review_status || record?.carousel_review_status || "");
    if (key === "outputs") return Array.isArray(record?.output_links) ? record.output_links.length : 0;
    return "";
  }

  function compareContentRows(a, b, key) {
    if (key === "content") {
      const ta = parseStudioDate(a?.created_at)?.getTime();
      const tb = parseStudioDate(b?.created_at)?.getTime();
      if (Number.isFinite(ta) && Number.isFinite(tb) && ta !== tb) return ta - tb;
      if (Number.isFinite(ta) && !Number.isFinite(tb)) return 1;
      if (!Number.isFinite(ta) && Number.isFinite(tb)) return -1;
    }
    if (key === "outputs") return contentSortValue(a, key) - contentSortValue(b, key);
    const av = contentSortValue(a, key);
    const bv = contentSortValue(b, key);
    return String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" });
  }

  function sortedContentRecords(records) {
    const dir = contentSort.dir === "desc" ? -1 : 1;
    const key = contentSort.key || "content";
    return [...records].sort((a, b) => {
      const primary = compareContentRows(a, b, key);
      if (primary) return dir * primary;
      return dir * compareContentRows(a, b, "content");
    });
  }

  function contentSortHeader(key, label) {
    const active = contentSort.key === key;
    const arrow = !active ? "↕" : contentSort.dir === "asc" ? "↑" : "↓";
    return `<th><button type="button" class="table-sort${active ? " is-active" : ""}" data-content-sort="${escapeHtml(key)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function renderContentItemsTable(target, records) {
    if (!target) return;
    if (!records.length) {
      target.innerHTML = '<div class="empty"><strong>No content items are currently in production.</strong><br><span class="subtle">Studio is connected; new promoted ideas will appear here as production begins.</span></div>';
      return;
    }
    const sorted = sortedContentRecords(records);
    target.innerHTML = `<table class="data-table content-table"><thead><tr>${contentSortHeader("content", "Content")}${contentSortHeader("stage", "Studio stage")}${contentSortHeader("assets", "Assets")}${contentSortHeader("render", "Render")}${contentSortHeader("review", "Review")}${contentSortHeader("outputs", "Outputs")}</tr></thead><tbody>${sorted.map((r) => `<tr><td><div class="title-cell">${value(r.title)}</div><div class="subtle">Content ${value(r.content_id)} · ${value(r.content_type)}${r.created_at ? ` · Created ${dateValue(r.created_at)}` : ""}</div></td><td>${badge(r.studio_stage)}</td><td>${value(r.asset_match_status)}</td><td>${value(contentRenderLabel(r))}</td><td>${value(r.review_status || r.carousel_review_status)}</td><td>${Array.isArray(r.output_links) ? r.output_links.length : 0}</td></tr>`).join("")}</tbody></table>`;
    target.querySelectorAll("[data-content-sort]").forEach((button) => {
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        const key = button.dataset.contentSort;
        if (contentSort.key === key) {
          contentSort.dir = contentSort.dir === "asc" ? "desc" : "asc";
        } else {
          contentSort.key = key;
          contentSort.dir = key === "content" || key === "outputs" ? "desc" : "asc";
        }
        renderContentItemsTable(target, records);
      });
    });
  }

  async function loadIdeas() {
    const target = $("ideasList");
    target.innerHTML = '<div class="empty">Loading ideas…</div>';
    try {
      const { records = [] } = await api("/api/ideas?limit=100");
      ideasCache = records;
      populateIdeaExistingSelect(records);
      renderIdeasTable(target, records);
    } catch (e) {
      ideasCache = [];
      populateIdeaExistingSelect([]);
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  }

  function productionPageActive() {
    return Boolean($("page-content")?.classList.contains("active"));
  }

  function productionContentFingerprint(records) {
    return JSON.stringify((records || []).map((r) => [
      r.id,
      r.studio_stage,
      r.asset_match_status,
      contentRenderLabel(r),
      r.review_status || r.carousel_review_status,
      Array.isArray(r.output_links) ? r.output_links.length : 0,
      r.lifecycle_complete,
    ]));
  }

  function setProductionLiveHint(text) {
    const hint = $("productionLiveHint");
    if (hint) hint.textContent = text;
  }

  function stopProductionPoll() {
    if (productionPollTimer) {
      clearTimeout(productionPollTimer);
      productionPollTimer = null;
    }
    if ($("productionLiveHint") && !productionPageActive()) setProductionLiveHint("Open Production to watch live updates");
  }

  function scheduleProductionPoll() {
    stopProductionPoll();
    if (!productionPageActive() || document.hidden) {
      if (productionPageActive() && document.hidden) setProductionLiveHint("Paused while this tab is in the background");
      return;
    }
    productionPollTimer = setTimeout(() => {
      productionPollTimer = null;
      setProductionLiveHint("Live · refreshing…");
      refreshProductionPage({ silent: true }).finally(scheduleProductionPoll);
    }, PRODUCTION_POLL_MS);
  }

  async function refreshProductionContent({ silent = false } = {}) {
    const target = $("contentList");
    if (!target) return;
    if (!silent) target.innerHTML = '<div class="empty production-empty"><strong>Loading in-production items…</strong></div>';
    const { records = [] } = await api("/api/content?limit=100");
    const active = records.filter((record) => !record?.lifecycle_complete);
    const unchanged = silent && target.querySelector("table") && productionContentFingerprint(active) === productionContentFingerprint(productionContentRecords);
    productionContentRecords = active;
    if (unchanged) return;
    if (!active.length) {
      const hadAny = records.length > 0;
      target.innerHTML = hadAny
        ? '<div class="empty production-empty">Nothing actively in production. Published and scheduled pieces are on Platform pipeline.</div>'
        : '<div class="empty production-empty">Nothing in production yet.</div>';
      return;
    }
    const scrollTop = target.scrollTop;
    renderContentItemsTable(target, active);
    target.scrollTop = scrollTop;
  }

  async function refreshProductionPage({ silent = false } = {}) {
    if (silent && productionPollInFlight) return;
    productionPollInFlight = true;
    if (!silent) setProductionLiveHint("Refreshing…");
    try {
      await Promise.all([
        loadProductionRequests({ silent }),
        refreshProductionContent({ silent }),
      ]);
      if (productionPageActive() && !document.hidden) setProductionLiveHint("Live · refreshed just now");
    } catch (e) {
      if (!silent) {
        const target = $("contentList");
        if (target) target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      } else {
        setProductionLiveHint("Live update failed · retrying");
      }
    } finally {
      productionPollInFlight = false;
    }
  }

  async function loadContent() {
    if (ezEntryPath === "content") {
      enterEzContentPath();
    } else if (ezEntryPath === "configure") {
      showProductionRequestWorkspace();
    } else {
      setPageContentSimple(false);
      hideEzFrontDoor();
    }
    await refreshProductionPage({ silent: false });
    scheduleProductionPoll();
  }

  function phase6OptionList(values, current, { label = (v) => v, emptyLabel = null } = {}) {
    const items = Array.isArray(values) ? [...values] : [];
    if (current !== null && current !== undefined && current !== "" && !items.includes(current)) items.unshift(current);
    const options = [];
    if (emptyLabel !== null) options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    for (const item of items) {
      options.push(`<option value="${escapeHtml(item)}" ${String(item) === String(current) ? "selected" : ""}>${escapeHtml(label(item))}</option>`);
    }
    return options.join("");
  }

  function phase6Percent(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 1000) / 10)) : fallback;
  }

  function phase6NumberFromInput(id, fallback = null) {
    const n = Number($(id)?.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function phase6RatioClass(ratio) {
    if (ratio === "9:16") return "ratio-9x16";
    if (ratio === "1:1") return "ratio-1x1";
    if (ratio === "16:9") return "ratio-16x9";
    return "";
  }

  function phase6FitLabel(value) {
    const labels = {
      fill_crop: "Fill / crop",
      full_with_blur: "Full image + blurred background",
      full_with_solid_background: "Full image + solid background",
    };
    return labels[value] || value;
  }

  function phase6MotionLabel(value) {
    const labels = {
      none: "None",
      slowZoom: "Slow zoom in",
      slowZoomOut: "Slow zoom out",
      panLeft: "Pan left",
      panRight: "Pan right",
      panUp: "Pan up",
      panDown: "Pan down",
      kenBurnsLeft: "Ken Burns left",
      kenBurnsRight: "Ken Burns right",
    };
    return labels[value] || value;
  }

  function phase6TransitionLabel(value) {
    const labels = { none: "None", fade: "Fade", slideLeft: "Slide left", slideRight: "Slide right", zoom: "Zoom" };
    return labels[value] || value;
  }


  let studioPreviewAudio = null;
  let studioPreviewButton = null;

  function stopStudioAudioPreview() {
    if (!studioPreviewAudio) return;
    studioPreviewAudio.pause();
    try { studioPreviewAudio.currentTime = 0; } catch (_) {}
    if (studioPreviewButton) studioPreviewButton.textContent = "▶ Preview";
    studioPreviewAudio = null;
    studioPreviewButton = null;
  }

  function playStudioAudioPreview(url, button = null, messageFn = phase6Message, label = "preview") {
    if (!url) {
      messageFn(`No preview is available for ${label}.`, "error-text");
      return;
    }
    try {
      if (studioPreviewAudio) {
        const clickedActiveButton = !!button && button === studioPreviewButton;
        stopStudioAudioPreview();
        if (clickedActiveButton) return;
      }

      const audio = new Audio(url);
      studioPreviewAudio = audio;
      studioPreviewButton = button || null;
      audio.preload = "auto";
      if (button) button.textContent = "■ Stop";

      const restore = () => {
        if (studioPreviewAudio !== audio) return;
        stopStudioAudioPreview();
      };
      audio.addEventListener("ended", restore, { once: true });
      audio.addEventListener("error", () => {
        restore();
        messageFn(`That ${label} could not be played.`, "error-text");
      }, { once: true });
      audio.play().catch(() => {
        restore();
        messageFn("Browser playback was blocked. Click Preview again.", "error-text");
      });
    } catch (e) {
      messageFn(e.message || "Preview failed.", "error-text");
    }
  }

  function phase6NormalizeVoices(values) {
    return (Array.isArray(values) ? values : []).map((voice) => {
      if (typeof voice === "string") return { id: voice, name: voice, preview_url: null };
      return {
        id: String(voice?.id || voice?.voice_id || voice?.name || "").trim(),
        name: String(voice?.name || voice?.id || "").trim(),
        preview_url: voice?.preview_url || null,
        category: voice?.category || null,
        accent: voice?.accent || null,
        gender: voice?.gender || null,
        age: voice?.age || null,
        use_case: voice?.use_case || null,
        description: voice?.description || null,
        is_default: Boolean(voice?.is_default),
      };
    }).filter((voice) => voice.id && voice.name);
  }

  function phase6VoiceLabel(voice) {
    const meta = [voice.gender, voice.accent, voice.age, voice.use_case].filter(Boolean).slice(0, 3);
    return meta.length ? `${voice.name} · ${meta.join(" · ")}` : voice.name;
  }

  function phase6VoiceOptionList(values, selectedId = "", selectedName = "") {
    const voices = phase6NormalizeVoices(values);
    let selectedFound = false;
    const options = voices.map((voice) => {
      const selected = voice.id === selectedId || (!selectedId && voice.name === selectedName);
      if (selected) selectedFound = true;
      return `<option value="${escapeHtml(voice.id)}" data-name="${escapeHtml(voice.name)}" data-preview="${escapeHtml(voice.preview_url || "")}" ${selected ? "selected" : ""}>${escapeHtml(phase6VoiceLabel(voice))}</option>`;
    });
    if (!selectedFound && (selectedId || selectedName)) {
      const fallbackId = selectedId || selectedName;
      const fallbackName = selectedName || selectedId;
      options.unshift(`<option value="${escapeHtml(fallbackId)}" data-name="${escapeHtml(fallbackName)}" selected>${escapeHtml(fallbackName)} · current</option>`);
    }
    return options.join("");
  }

  function phase6SelectedVoice(select) {
    const option = select?.selectedOptions?.[0];
    return {
      id: String(select?.value || "").trim(),
      name: String(option?.dataset?.name || option?.textContent?.split(" · ")?.[0] || "").trim(),
      preview_url: String(option?.dataset?.preview || "").trim() || null,
    };
  }

  function phase6PreviewSelectedVoice(select, button = null, messageFn = phase6Message) {
    const voice = phase6SelectedVoice(select);
    if (!voice.id) {
      messageFn("Pick an ElevenLabs voice to preview.", "error-text");
      return;
    }
    const previewUrl = voice.preview_url || `${apiBase}/api/voices/${encodeURIComponent(voice.id)}/preview`;
    playStudioAudioPreview(previewUrl, button, messageFn, voice.name || "voice");
  }

  function phase6Message(message = "", type = "") {
    const target = $("creativeEditorMessage");
    if (!target) return;
    target.textContent = message;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function phase6CreativeFingerprint() {
    try { return JSON.stringify(collectCreativePayload()); } catch { return ""; }
  }

  function phase6SavedRevisionNeedsRender(output = activeCreativeOutput) {
    const savedAt = Date.parse(String(output?.creative_settings?.savedAt || ""));
    const previewAt = Date.parse(String(output?.studio_preview_updated_at || ""));
    if (!Number.isFinite(savedAt)) return false;
    return !Number.isFinite(previewAt) || savedAt > previewAt;
  }

  function phase6PreviewLooksLikeImage(url) {
    return /\.(jpe?g|png|webp|gif)(\?|$)/i.test(String(url || ""));
  }

  function phase6UrlLooksPublicPublish(url) {
    const href = String(url || "").trim();
    if (!href.startsWith("https://media.chicagoshining.com/")) return false;
    const path = href.slice("https://media.chicagoshining.com/".length);
    return path.startsWith("studio/previews/") || path.startsWith("publish/");
  }

  function phase6UrlLooksPublicVideo(url) {
    const href = String(url || "").trim();
    if (!href.startsWith("https://media.chicagoshining.com/")) return false;
    if (phase6PreviewLooksLikeImage(href)) return false;
    const path = href.slice("https://media.chicagoshining.com/".length);
    return path.startsWith("studio/previews/")
      || path.startsWith("publish/")
      || path.startsWith("studio/master-assets/");
  }

  function creativeIsFinishedVideo(output = activeCreativeOutput) {
    const notes = [
      output?.output_notes,
      output?.production_notes,
      activeProductionRequest?.production_notes,
      item4Workspace?.production_notes,
    ].map((value) => String(value || "")).join("\n");
    if (/ez-input=finished-video/i.test(notes)) return true;
    return typeof ezIsFinishedVideo === "function" && ezIsFinishedVideo();
  }

  function creativeFinishedVideoSeconds(output = activeCreativeOutput) {
    const video = $("creativeRenderPreview");
    const loaded = Number(video?.duration || 0);
    if (Number.isFinite(loaded) && loaded > 1) return loaded;
    const assets = item4Workspace?.assets || [];
    const fromAsset = assets
      .map((asset) => Number(asset?.duration_seconds || asset?.out_seconds || 0))
      .find((value) => Number.isFinite(value) && value > 1);
    if (fromAsset) return fromAsset;
    const hinted = Number(output?.video_duration_seconds || output?.duration_seconds || 0);
    return Number.isFinite(hinted) && hinted > 0 ? hinted : 0;
  }

  function phase6CoverStillUrl(output) {
    const candidates = [output?.thumbnail_url, output?.native_still_url];
    for (const raw of candidates) {
      const href = String(raw || "").trim();
      if (!href) continue;
      if (phase6PreviewLooksLikeImage(href) || /googleusercontent\.com/i.test(href)) return href;
      const id = phase6DriveFileId(href);
      if (id) return `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w1920`;
    }
    return "";
  }

  function phase6ThumbnailDownloadUrl(output = activeCreativeOutput) {
    const raw = String(output?.thumbnail_url || "").trim();
    if (!raw) return "";
    if (/media\.chicagoshining\.com\//i.test(raw)) return raw;
    const id = phase6DriveFileId(raw);
    if (id) return `https://drive.google.com/uc?export=download&id=${encodeURIComponent(id)}`;
    return raw;
  }

  function phase6IsNativeStillPreview(output = activeCreativeOutput) {
    if (!output) return false;
    if (/story/i.test(String(output.studio_output_type || output.platform_output_type || output.format || ""))) return false;
    if (String(output.preview_kind || "") === "still") return true;
    if (creativeIsNativePhotoPackage(output)) return true;
    return false;
  }

  function creativeOutputTypeLabel(output = activeCreativeOutput) {
    return String(output?.studio_output_type || output?.platform_output_type || output?.format || "").trim();
  }

  function creativeIsStoryTeaser(output = activeCreativeOutput) {
    return /story/i.test(creativeOutputTypeLabel(output));
  }

  function creativeSimpleVideoKind(output = activeCreativeOutput) {
    if (!output) return null;
    if (phase6IsNativeStillPreview(output) || creativeIsNativePhotoPackage(output)) return "still";
    const type = creativeOutputTypeLabel(output);
    const platform = String(output?.platform || "").trim();
    if (/story/i.test(type)) return "story";
    if (/slideshow\s*reel/i.test(type) || (platform === "Facebook" && /reel/i.test(type))) return "slideshow";
    if (/video\s*draft/i.test(type) || (platform === "TikTok" && /video/i.test(type))) return "tiktok";
    if (/^short$/i.test(type) || (platform === "YouTube" && /short/i.test(type))) return "short";
    if (/^reel$/i.test(type) || (platform === "Instagram" && /reel/i.test(type))) return "reel";
    return "video";
  }

  function creativeVoiceoverOn(output = activeCreativeOutput) {
    if (creativeIsStoryTeaser(output)) return false;
    const mode = String(output?.voiceover?.mode || "").trim().toLowerCase();
    if (mode === "yes") return true;
    if (mode === "no") return false;
    return Boolean(String(output?.voiceover?.url || "").trim());
  }

  function creativeMusicLabel(output, kind) {
    const named = String(output?.music?.track_name || output?.music?.name || output?.selected_music_name || "").trim();
    if (kind === "story") return named ? `On · ${named}` : "On · catalog track if none was picked";
    if (String(output?.music_url || "").trim() || named) return named ? `On · ${named}` : "On";
    const mode = String(output?.background_music_mode || "").trim().toLowerCase();
    if (mode === "yes") return named ? `On · ${named}` : "On · catalog fallback";
    if (mode === "no") return "Off";
    return Number(output?.music?.normal_volume) > 0 ? "On" : "Off";
  }

  function creativeVideoFactRows(output, kind) {
    const finishedVideo = creativeIsFinishedVideo(output);
    const included = Array.isArray(creativeSlides) ? creativeSlides.filter((slide) => slide?.include !== false) : [];
    const photos = included.length;
    const slideSeconds = included.reduce((total, slide) => total + Number(slide?.duration_seconds || 0), 0);
    const finishedSeconds = creativeFinishedVideoSeconds(output);
    const duration = finishedVideo
      ? (finishedSeconds > 0 ? `${Math.round(finishedSeconds)} seconds` : "Your uploaded video")
      : (kind === "story"
        ? "5 seconds"
        : (slideSeconds > 0
          ? `${Math.round(slideSeconds)} seconds`
          : `${Number($("creativeDefaultDuration")?.value || output?.creative_settings?.default_slide_duration_seconds || 30)} seconds`));
    if (finishedVideo) {
      return [
        ["Length", duration],
        ["Source", "Your uploaded video"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Cover", output?.thumbnail_url ? "3D still for the grid — not on the video" : "Missing"],
      ];
    }
    const labels = {
      story: [
        ["Length", duration],
        ["Source", "First vertical photo"],
        ["Motion", "Slight zoom"],
        ["Voiceover", "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      reel: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      slideshow: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      tiktok: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Cover", output?.thumbnail_url ? "Download cover in details below" : "Missing — generate before TikTok"],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      short: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Cover", output?.thumbnail_url ? "Download cover in details below" : "Missing"],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      still: [
        ["Post type", creativeOutputTypeLabel(output) || "Photo post"],
        ["Photos", photos ? `${photos}` : "Photo package"],
        ["Ratio", output?.aspect_ratio || "—"],
        ["Render", "Native photos · no video mix"],
      ],
      video: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "—"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
    };
    return labels[kind] || labels.video;
  }

  function syncCreativeStoryTeaserChrome(output = activeCreativeOutput) {
    const kind = creativeSimpleVideoKind(output);
    const story = kind === "story";
    const still = kind === "still";
    const voiceOn = creativeVoiceoverOn(output);
    const finishedVideo = creativeIsFinishedVideo(output);
    const panel = $("creativeEditorPanel");
    if (panel) {
      panel.classList.toggle("simple-video-review", Boolean(kind));
      panel.classList.toggle("story-teaser-mode", story && !finishedVideo);
      panel.classList.toggle("native-still-review", still);
      panel.classList.toggle("finished-video-review", finishedVideo);
      panel.classList.toggle("no-voiceover-review", Boolean(kind) && !still && !voiceOn && !finishedVideo);
    }
    const navLabel = {
      story: "Story",
      reel: "Reel",
      slideshow: "Reel",
      tiktok: "Video",
      short: "Short",
      still: "Post",
      video: "Video",
    }[kind] || "Video";
    document.querySelectorAll("[data-creative-jump][data-simple-nav='label']").forEach((button) => {
      button.textContent = navLabel;
    });
    const facts = $("creativeStoryFacts");
    const heading = $("creativeDefaultsHeading");
    const copy = $("creativeDefaultsCopy");
    if (facts) {
      if (!kind) {
        facts.hidden = true;
        facts.innerHTML = "";
      } else {
        facts.innerHTML = creativeVideoFactRows(output, kind)
          .map(([label, value]) => `<div><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(value)}</dd></div>`)
          .join("");
        facts.hidden = false;
      }
    }
    const titles = {
      story: finishedVideo
        ? ["This Story", "Your uploaded video. Stories do not use a profile grid cover."]
        : ["This Story", "Fixed 5-second teaser. Music volume is the useful control."],
      reel: finishedVideo
        ? ["This Reel", "Your uploaded video. The 3D still is the grid cover only."]
        : ["This Reel", "Photo sequence with your audio settings. Music volume is the useful control."],
      slideshow: finishedVideo
        ? ["This Facebook Reel", "Your uploaded video. The 3D still is the grid cover only."]
        : ["This Facebook Reel", "Photo sequence with your audio settings. Music volume is the useful control."],
      tiktok: finishedVideo
        ? ["This TikTok video", "Your uploaded video, saved as a TikTok draft after Approve. The 3D still is the cover to set in TikTok."]
        : ["This TikTok video", "Finished file saved as a TikTok draft. Download the 3D cover from Thumbnail in the details panel, then set it in TikTok."],
      short: finishedVideo
        ? ["This YouTube Short", "Your uploaded video. The 3D still is the grid cover only."]
        : ["This YouTube Short", "Photo sequence with your audio settings. Download the cover from Thumbnail in the details panel if YouTube needs a custom thumb."],
      still: ["This photo post", "These photos publish as stills. There is no video mix to edit."],
      video: finishedVideo
        ? [`This ${String(output?.platform || "video").trim()} ${creativeOutputTypeLabel(output) || "output"}`.replace(/\s+/g, " ").trim(), "Your uploaded video. The 3D still is the grid cover only."]
        : [`This ${String(output?.platform || "video").trim()} ${creativeOutputTypeLabel(output) || "output"}`.replace(/\s+/g, " ").trim(), "Play the render. Music volume is the useful control."],
    };
    if (heading) heading.textContent = kind ? titles[kind][0] : "This output";
    if (copy) {
      copy.textContent = kind
        ? titles[kind][1]
        : "Play the render. Music volume is the useful control.";
    }
    const audioHeading = document.querySelector("#creativeAudioSection .creative-section-heading h3");
    const audioCopy = document.querySelector("#creativeAudioSection .creative-section-heading p");
    if (audioHeading) audioHeading.textContent = still || finishedVideo ? "Audio" : (voiceOn ? "Audio mix" : "Music");
    if (audioCopy) {
      audioCopy.textContent = still || finishedVideo
        ? (finishedVideo ? "This uploaded file already has its audio. There is no mix to rerender." : "Photo posts do not use a video mix.")
        : (voiceOn
          ? "Change volumes, then Apply mix & rerender to hear a new preview."
          : "No voiceover on this output. Change music volume, then Apply mix & rerender.");
    }
    updateCreativeAudioSummary();
  }

  function phase6NativeStillUrl(output = activeCreativeOutput) {
    const direct = String(output?.native_still_url || "").trim();
    if (direct) return direct;
    const preview = String(output?.studio_preview_url || "").trim();
    if (preview && phase6PreviewLooksLikeImage(preview)) return preview;
    const slide = Array.isArray(creativeSlides) ? creativeSlides.find((item) => String(item?.preview_url || "").trim()) : null;
    return String(slide?.preview_url || "").trim();
  }

  function phase6UpdatePreviewFreshness() {
    const target = $("creativePreviewFreshness");
    if (!target) return;
    const stillPreview = phase6IsNativeStillPreview();
    let text = stillPreview
      ? (/story/i.test(String(activeCreativeOutput?.studio_output_type || activeCreativeOutput?.platform_output_type || "")) ? "Current Story still" : "Current photo still")
      : "Current rendered preview";
    let state = "current";
    if (creativeEditorDirty) {
      text = "Preview does not include your unsaved edits";
      state = "unsaved";
    } else if (creativeHandoffStatus?.active && !creativeHandoffStatus?.completed) {
      text = "Previous mix still playing · new render in progress";
      state = "active";
    } else if (phase6SavedRevisionNeedsRender()) {
      text = "Saved edits are not in this preview yet";
      state = "stale";
    } else if (creativeHandoffStatus?.completed) {
      text = "Preview includes the latest saved revision";
      state = "current";
    }
    target.textContent = text;
    target.className = `creative-preview-freshness ${state}`;
  }

  function creativeWatchOnly() {
    return Boolean(activeCreativeOutput && !activeCreativeOutput.do_not_publish);
  }

  function creativeMixInProgress(handoff = creativeHandoffStatus, output = activeCreativeOutput) {
    if (creativeSimpleVideoKind(output) === "still") return false;
    if (handoff?.completed || handoff?.overall_status === "complete" || handoff?.overall_status === "idle") return false;
    const render = String(output?.render_status || "").trim();
    const status = String(output?.output_status || "").trim();
    if (["Ready for Render", "Rendering"].includes(render)) return true;
    // In Production alone is not enough — package rebuild leaves that status
    // while Pipeline used to still show Ready for Review from stale Review Sent.
    if (status === "In Production" && !String(output?.final_file_url || "").trim() && !String(output?.studio_preview_url || "").trim()) {
      return Boolean(handoff?.active && handoff?.overall_status === "active");
    }
    if (status === "In Production" && (["Ready for Render", "Rendering"].includes(render) || (handoff?.active && handoff?.overall_status === "active"))) return true;
    return Boolean(handoff?.active && handoff?.overall_status === "active");
  }

  function phase6UpdateSaveState() {
    const badge = $("creativeSaveState");
    const reset = $("reloadCreativeEditor");
    if (badge) {
      if (creativeSimpleVideoKind() === "still") {
        badge.textContent = creativePublishSettled() ? "Published" : "Saved";
        badge.className = "creative-save-state saved";
      } else if (creativeWatchOnly() && !creativeEditorDirty && !creativeMixInProgress()) {
        badge.textContent = "Mix ready";
        badge.className = "creative-save-state saved";
      } else {
        badge.textContent = creativeEditorDirty ? "Unsaved mix" : (creativeMixInProgress() ? "Rendering mix" : "Saved");
        badge.className = `creative-save-state ${creativeEditorDirty ? "dirty" : "saved"}`;
      }
    }
    if (reset && reset.dataset.busy !== "true") reset.disabled = !creativeEditorDirty;
    phase6UpdatePreviewFreshness();
  }

  function phase6MarkDirty() {
    if (!activeCreativeOutputId) return;
    clearTimeout(creativeDirtyTimer);
    creativeDirtyTimer = setTimeout(() => {
      const current = phase6CreativeFingerprint();
      creativeEditorDirty = Boolean(current && creativeSavedFingerprint && current !== creativeSavedFingerprint);
      phase6UpdateSaveState();
    }, 100);
  }

  function phase6MarkSaved() {
    clearTimeout(creativeDirtyTimer);
    creativeSavedFingerprint = phase6CreativeFingerprint();
    creativeEditorDirty = false;
    phase6UpdateSaveState();
  }

  function phase6ConfirmDiscardUnsaved(action = "continue") {
    if (!creativeEditorDirty) return true;
    return window.confirm(`You have unsaved creative edits. Discard them and ${action}?`);
  }

  const PHASE6_PROGRESS_STAGE_ORDER = ["saved", "voice_prep", "rendering", "final_upload", "preview_ready"];
  const PHASE6_PROGRESS_STAGE_LABELS = {
    saved: "Saved",
    voice_prep: "Voice Prep",
    rendering: "Rendering",
    final_upload: "Final Upload",
    preview_ready: "Preview Ready",
  };

  function phase6ProgressIcon(status) {
    if (status === "complete") return "✓";
    if (status === "error") return "!";
    if (status === "active") return "•";
    return "";
  }

  function syncCreativeRenderBusyOverlay(handoff = creativeHandoffStatus) {
    const frame = $("creativeRenderPreviewFrame");
    const card = $("creativePreviewSection");
    const overlay = $("creativeRenderBusy");
    const title = $("creativeRenderBusyTitle");
    const detail = $("creativeRenderBusyDetail");
    const still = creativeSimpleVideoKind() === "still";
    const busy = !still && Boolean(
      (handoff?.active && !handoff?.completed && handoff?.overall_status === "active")
      || creativeMixInProgress(handoff)
    );
    frame?.classList.toggle("is-rendering", busy);
    card?.classList.toggle("is-rendering", busy);
    if (overlay) overlay.hidden = !busy;
    if (!busy) return;
    $("creativeRenderPreview")?.pause();
    if (title) title.textContent = `${handoff?.current_stage_label || "Rendering"} in progress`;
    if (detail) detail.textContent = "This player still has the previous mix. The new preview replaces it when this page says Ready.";
  }

  function renderCreativeChangeProgress(handoff = null) {
    if (creativeSimpleVideoKind() === "still") {
      handoff = {
        ...(handoff || {}),
        active: false,
        completed: false,
        overall_status: "idle",
        current_stage_label: null,
        message: "Native stills do not use a video mix.",
      };
    }
    creativeHandoffStatus = handoff || null;
    const panel = $("creativeChangeProgress");
    const stepsTarget = $("creativeChangeProgressSteps");
    const title = $("creativeChangeProgressTitle");
    const state = $("creativeChangeProgressState");
    const detail = $("creativeChangeProgressDetail");
    if (!panel || !stepsTarget || !title || !state || !detail) return;

    const byKey = new Map((Array.isArray(handoff?.stages) ? handoff.stages : []).map((stage) => [stage.key, stage]));
    stepsTarget.innerHTML = PHASE6_PROGRESS_STAGE_ORDER.map((key) => {
      const stage = byKey.get(key) || { key, label: PHASE6_PROGRESS_STAGE_LABELS[key], status: "pending" };
      const status = stage.status || "pending";
      const errorText = stage.error ? `<div class="creative-change-stage-error">${escapeHtml(stage.error)}</div>` : "";
      return `<div class="creative-change-stage ${escapeHtml(status)}" data-stage="${escapeHtml(key)}">
        <div class="creative-change-stage-marker">${escapeHtml(phase6ProgressIcon(status))}</div>
        <div class="creative-change-stage-copy"><b>${escapeHtml(stage.label || PHASE6_PROGRESS_STAGE_LABELS[key])}</b><span>${escapeHtml(stage.detail || "Waiting")}</span>${errorText}</div>
      </div>`;
    }).join("");

    const overall = handoff?.overall_status || "idle";
    panel.dataset.status = overall;
    state.textContent = overall === "complete" ? "Ready" : overall === "error" ? "Needs attention" : overall === "active" ? "Processing" : "Idle";
    state.className = `creative-change-progress-state ${overall}`;
    title.textContent = handoff?.completed
      ? "Preview ready"
      : handoff?.error_stage
        ? `${handoff.current_stage_label || "Creative change"} needs attention`
        : handoff?.active
          ? `${handoff.current_stage_label || "Rendering"} in progress`
          : (creativeWatchOnly() ? "No mix revision in progress" : "No change request in progress");
    detail.textContent = handoff?.message
      || (creativeWatchOnly()
        ? "Adjust music and voiceover, then apply the mix to render a new preview."
        : "Save and rerender the preview to begin a new revision.");
    syncCreativeRenderBusyOverlay(handoff);
    phase6UpdatePreviewFreshness();
  }

  async function refreshCreativeChangeProgress({ updateMessage = false } = {}) {
    if (!activeCreativeOutputId) return null;
    const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative/handoff/status`, { timeoutMs: 25000 });
    const handoff = result?.handoff || null;
    renderCreativeChangeProgress(handoff);
    if (result?.output) activeCreativeOutput = { ...(activeCreativeOutput || {}), ...result.output };
    if (updateMessage && handoff?.message) {
      if (handoff.overall_status === "error") phase6Message(handoff.message, "error-text");
      else phase6Message("");
    }
    return handoff;
  }

  function setCreativeBusy(busy) {
    ["saveCreativeEditor", "creativeRequestChanges", "creativeApprovePreview", "reloadCreativeEditor", "creativeUnlockTitles"].forEach((id) => {
      const button = $(id);
      if (button) {
        button.disabled = Boolean(busy);
        button.dataset.busy = busy ? "true" : "false";
      }
    });
    if (!busy) {
      phase6UpdateSaveState();
      if (creativeWatchOnly()) {
        if ($("saveCreativeEditor")) $("saveCreativeEditor").disabled = true;
        if ($("creativeRequestChanges")) $("creativeRequestChanges").disabled = creativeMixInProgress();
        if ($("creativeApprovePreview")) $("creativeApprovePreview").disabled = !creativeCanApproveForPublishing() || creativeMixInProgress();
        if ($("reloadCreativeEditor")) $("reloadCreativeEditor").disabled = !creativeEditorDirty;
      }
    }
  }

  function phase6FormatPercent(value) {
    const n = Math.max(0, Math.min(125, Number(value) || 0));
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  }

  function updateCreativeAudioSummary() {
    const voice = Math.max(0, Math.min(125, Number($("creativeVoiceoverVolume")?.value || 100)));
    const normal = Math.max(0, Math.min(100, Number($("creativeMusicNormal")?.value || 0)));
    const ducked = Math.max(0, Math.min(100, Number($("creativeMusicDucked")?.value || 0)));
    const enabled = Boolean($("creativeDuckingEnabled")?.checked);
    $("creativeAudioSummary").textContent = (creativeIsStoryTeaser() || (creativeSimpleVideoKind() && !creativeVoiceoverOn()))
      ? `Music ${phase6FormatPercent(normal)}% · no voiceover`
      : (enabled
      ? `VO ${phase6FormatPercent(voice)}% · music ${phase6FormatPercent(normal)}% · ${phase6FormatPercent(ducked)}% under narration`
      : `VO ${phase6FormatPercent(voice)}% · music ${phase6FormatPercent(normal)}% · ducking off`);
  }

  function syncCreativeAudioPair(sourceId, targetId) {
    const source = $(sourceId);
    const target = $(targetId);
    if (!source || !target) return;
    let n = Number(source.value);
    if (!Number.isFinite(n)) n = 0;
    const maxValue = sourceId.includes("VoiceoverVolume") ? 125 : 100;
    n = Math.max(0, Math.min(maxValue, Math.round(n * 10) / 10));
    source.value = phase6FormatPercent(n);
    target.value = phase6FormatPercent(n);
    updateCreativeAudioSummary();
  }


  const PHASE6_CONTROL_HELP = {
    creativeStyleStrategy: "Controls how visual styles are chosen across the sequence: let AI vary them naturally, keep one campaign look, or manage each slide manually.",
    creativeDefaultDuration: "Default requested slide duration in seconds. A slide can override this. If narration plus the voiceover tail is longer, the render may extend the slide so speech is not cut off.",
    creativeDefaultMotion: "Default image movement for slides that do not override it, such as slow zoom or pan.",
    creativeDefaultTransition: "Default visual transition used between slides unless a slide specifies a different transition.",
    creativeDefaultTransitionFrames: "Default transition length in video frames. At 30 fps, 12 frames is about 0.4 seconds.",
    creativeDefaultVoice: "Default ElevenLabs voice used when narration is generated or regenerated for a slide that does not choose its own voice. The saved voice ID is the generation authority.",
    creativeDefaultVoicePreview: "Plays the ElevenLabs sample for the currently selected default voice. This does not change or regenerate your content.",
    creativeVoiceoverTail: "Extra visual time after narration finishes before the slide ends. This prevents the cut from landing immediately on the last spoken word.",
    creativeVariantPolicy: "Controls whether Studio prefers exact pre-sized image variants or may use the source image with crop/fill when an exact variant is not prepared.",
    creativeOpeningTreatment: "Controls how the first slide is treated: automatic choice, title card, plain image, or no text.",
    creativeClosingTreatment: "Controls how the last slide is treated: automatic choice, end card, plain image, or no text.",
    creativeVoiceoverVolumeRange: "Global narration level for the sequence. 100% is the proven level used before this control was added. Individual slides can override it.",
    creativeVoiceoverVolume: "Global narration level for the sequence. 100% is the proven level used before this control was added. Individual slides can override it.",
    creativeMusicNormalRange: "Background-music level when narration is not playing.",
    creativeMusicNormal: "Background-music level when narration is not playing.",
    creativeMusicDuckedRange: "Background-music level while narration is playing. This should normally be lower than the normal music level.",
    creativeMusicDucked: "Background-music level while narration is playing. This should normally be lower than the normal music level.",
    creativeDuckingEnabled: "When enabled, music automatically moves from the normal level to the narration level while voiceover is active.",
    creativeDuckFadeFrames: "How quickly music ramps between normal and ducked levels. At 30 fps, 6 frames is about 0.2 seconds.",
    creativeReviewNotes: "Notes for this review cycle. Use this to record what should change or why the current preview is being accepted.",
    reloadCreativeEditor: "Discard unsaved edits and reload the latest saved values from Studio.",
    creativeRequestChanges: "Save the current music and voiceover levels and render a new preview. Approve stays locked until that preview is ready.",
    "Save draft": "Save these edits as a draft without creating a new rendered preview. Unavailable in watch-only review.",
    creativeApprovePreview: "Approve this output for publishing. Immediate is the default. Set a local date and time to override. Instagram, Facebook, and YouTube auto-publish; TikTok is a draft.",
    pipelineApproveAll: "Approve every Ready for Review output. Immediate is the default unless Use default schedules is on. Same-platform times stay 90 minutes apart. Instagram, Facebook, and YouTube auto-publish; TikTok is a draft.",
    creativeUnlockTitles: "Unlock per-photo titles after approval so you can start a new title version. Publishing stays locked.",
    closeCreativeEditor: "Close the creative editor. Unsaved changes are not preserved.",
  };

  const PHASE6_SLIDE_HELP = {
    include: "Include or exclude this slide from the rendered sequence without deleting the slide record.",
    duration_seconds: "Requested slide duration in seconds. If narration plus the configured voiceover tail is longer, the effective render duration can extend so narration is not cut off.",
    focal_point: "Sets the visual anchor used when the source image must be cropped to the target aspect ratio.",
    fit_mode: "Controls how the source image fills the target frame. Fill/crop covers the frame and may crop edges; other modes preserve more of the source.",
    safe_area_aware: "Shows and honors the platform-safe area so important text and composition stay away from edges and common app UI overlays.",
    overlay_enabled: "Turn the text treatment for this slide on or off.",
    overlay_style: "Selects the visual text preset, such as Chicago Editorial, Glass Card, or Black Gold Arched.",
    overlay_role: "Describes the purpose of the text treatment, such as title card, callout, or end card, so the renderer can apply the appropriate treatment.",
    overlay_position: "Controls where the text treatment is positioned within the safe area.",
    overlay_text: "The on-photo title for this slide. This is separate from the spoken narration script.",
    overlay_caption: "Optional second line under the title. Kept inside the same safe area as the title.",
    overlay_size: "Text size used for the primary overlay treatment on this slide.",
    overlay_start: "When the title appears during this slide, as a fraction of the slide duration.",
    overlay_end: "When the title disappears during this slide, as a fraction of the slide duration.",
    voiceover_enabled: "Turn narration for this slide on or off.",
    voiceover_voice: "ElevenLabs voice to use when this slide narration is generated or regenerated. Studio saves the underlying voice ID, so names can change without breaking generation.",
    voiceover_voice_preview: "Plays the ElevenLabs sample for this slide selected voice without changing the saved narration.",
    voiceover_volume_override: "Optional narration-volume override for this slide. Leave blank to use the global voiceover volume above. 100% matches the original proven level.",
    voiceover_text: "The narration script spoken for this slide. Editing the script can require a regenerated voiceover before the next render.",
    motion_type: "Image movement during this slide, such as a slow zoom or pan.",
    transition_type: "Visual transition from this slide into the next slide.",
    transition_frames: "Length of this slide's transition in frames. At 30 fps, 12 frames is about 0.4 seconds.",
  };

  const PHASE6_BUTTON_HELP = {
    "Open review": "Open this output to watch the render or review the still, see the photo package, and read the caption.",
    "Open editor": "Open the Phase 6 creative review editor for this output.",
    "Not ready yet": "This output does not have a rendered file or photo package to review yet.",
    "Blocked": "Production stopped on this request. The job error is shown on the output row.",
  };

  const PRODUCTION_CONTROL_HELP = {
    ezIdeaTitle: "Name this content. You can change it later — dropping photos does not lock the title.",
    ezIdeaSummary: "Optional description for the idea. Helps the pipeline write captions and scripts.",
    ezPrimaryLocation: "Neighborhood or place used when publishing. Prefills from the idea or title when recognized. You can overwrite it.",
    prPrimaryLocation: "Publish location tag for Instagram / Facebook. Same value as Primary location on the Production form.",
    ezAudioVoiceover: "Turn spoken narration on or off. Voiceover is used on video outputs, not native still carousels.",
    ezAudioVoice: "ElevenLabs voice used when narration is generated. Kate is the default.",
    ezAudioMusic: "Turn background music on or off. Music is used on video outputs, not native still carousels.",
    ezAudioTrack: "Pick a specific music bed, or leave it so AI / the brand profile chooses.",
    ezTitleMode: "AI decides writes the on-post title. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    ezRequestedTitle: "The on-post title. Separate from the idea name at the top of this screen.",
    ezCaptionMode: "This is the Instagram / Facebook / TikTok / YouTube post caption. It is separate from the on-photo labels under each crop.",
    ezRequestedCaption: "Write the post caption here. Force exact uses this wording. On-photo labels stay on each photo.",
    ezScriptMode: "AI decides writes the spoken script. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    ezRequestedScript: "Paste spoken words here only if you want to control the voiceover. Leave blank to let AI write it.",
    ezThumbnail: "Rendered videos always get the 3D ChicagoShining grid cover on Instagram Reels, Facebook Reels, and YouTube Shorts. You do not add Carousel for that. This control only applies to still-only posts.",
    ezVoiceoverTail: "Extra seconds of picture after narration ends, so the last word is not cut off.",
    ezVideoDuration: "Hard cap for the rendered video length. Long uploads are trimmed or sliced to fit; with music, cuts land on beats.",
    ezVideoClipMode: "How many clips Studio should aim for in a video. AI decides unless you force a count or range.",
    ezVideoClipExact: "Exact number of clips to use in the video.",
    ezVideoClipMin: "Minimum clip count when using a target range.",
    ezVideoClipMax: "Maximum clip count when using a target range.",
    ezCarouselSlideMode: "How many slides Studio should aim for in a carousel or photo sequence.",
    ezCarouselSlideExact: "Exact number of slides in the carousel.",
    ezCarouselSlideMin: "Minimum slide count when using a target range.",
    ezCarouselSlideMax: "Maximum slide count when using a target range.",
    ezCarouselImageMode: "Use the photos you uploaded, or let Studio generate additional images.",
    ezProductionNotes: "Anything extra for pacing, style, or execution. Saved with the production request.",
    prVideoDuration: "Hard cap for slideshows and rendered videos. Long uploads are trimmed or sliced to fit this length; with music, cuts land on beats. Autonomous runs stay at 30 seconds.",
    prVoiceoverDuration: "Spoken voiceover length in seconds. Autonomous runs use half the video duration (15 seconds of a 30-second slideshow).",
    prMusicStart: "Seconds into the song file to skip before playback. The video still starts at 0:00; this only fast-forwards the track so you can skip the intro.",
    prVideoClipMode: "How many clips Studio should aim for in a video.",
    prVideoClipExact: "Exact number of clips to use in the video.",
    prVideoClipMin: "Minimum clip count when using a target range.",
    prVideoClipMax: "Maximum clip count when using a target range.",
    prCarouselSlideMode: "How many slides Studio should aim for in a carousel or photo sequence.",
    prCarouselSlideExact: "Exact number of slides in the carousel.",
    prCarouselSlideMin: "Minimum slide count when using a target range.",
    prCarouselSlideMax: "Maximum slide count when using a target range.",
    prCarouselImageMode: "Use uploaded photos, or let Studio generate additional images.",
    prVoiceover: "Turn spoken narration on or off for video outputs. Native stills ignore this.",
    prMusicMode: "Turn background music on or off for video outputs. Native stills ignore this.",
    prVoice: "ElevenLabs voice used when narration is generated. Kate is the default.",
    prMusicAsset: "Pick a specific music bed, or leave it so AI / the brand profile chooses.",
    prThumbnail: "Rendered videos always get the 3D ChicagoShining grid cover. Carousel is a separate still post, not the Reel cover.",
    prVoiceoverTail: "Seconds of picture and music after narration ends. For a 30-second video with a 15-second voiceover, this is 15.",
    prTitleMode: "AI decides writes the on-post title. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    prRequestedTitle: "The on-post title. Separate from the idea name.",
    prCaptionMode: "This is the post caption on Instagram, Facebook, TikTok, and YouTube. It is separate from the on-photo labels under each crop.",
    prRequestedCaption: "Shared caption direction for requested outputs unless a photo has its own caption.",
    prScriptMode: "AI decides writes the spoken script. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    prRequestedScript: "Paste spoken words here only if you want to control the voiceover.",
    prProductionNotes: "Anything extra for pacing, style, or execution.",
    prOverrideVoiceover: "Override voiceover for this one output, or inherit the master setting.",
    prOverrideMusicMode: "Override background music for this one output, or inherit the master setting.",
    prOverrideThumbnail: "Override this output’s cover. Inherit follows the piece. Yes is AI generated. Use photo frame copies a still from the photos.",
    prOverrideMusicAsset: "Override the music track for this one output, or inherit the master track.",
    prOverrideDuration: "Override duration for this one output. Long clips are still cut to fit. Stories default to 5 seconds for a single still and do not inherit the 30-second main video. Leave blank to inherit.",
    prOverrideVoiceoverTail: "Override extra seconds after narration for this one output.",
    prOverrideClipMode: "Override video clip count for this one output, or inherit the master setting.",
    prOverridePublishMode: "Override whether this output auto-publishes, waits for review, or stays unpublished.",
    prOverrideScheduledAt: "Optional publish time for this one output.",
    prOverrideNotes: "Notes that apply only to this output, not the whole request.",
  };

  const PRODUCTION_BUTTON_HELP = {
    ezStartOver: "Return to the Production home without deleting photos that already uploaded.",
    ezChooseMedia: "Open a file picker for stills and clips. Studio saves each file in the background.",
    ezChooseClip: "Open the phone or computer video library. Use this to add an MP4 or MOV clip next to the photos. Files over 100 MB are compressed automatically.",
    ezContinue: "Save these photos into a production request and continue to platform planning.",
    ezAudioVoicePreview: "Play a short sample of the selected voice. This does not generate your script.",
    ezAudioTrackPreview: "Play a preview of the selected music track.",
    item4ChooseMedia: "Open a file picker for stills and clips together. Studio saves each file in the background. You can also drop files onto the dashed box.",
    item4ChooseClip: "Open the phone or computer video library. Use this to add an MP4 or MOV clip next to the photos. Files over 100 MB are compressed automatically.",
    item4ChooseLibrary: "Review suggested Drive stills, uncheck to remove, or search the library to add more.",
    item4LibraryAddButton: "Apply checked Drive stills: add new checks and remove unchecked ones.",
    item4LibraryCancelButton: "Close the Drive library picker without attaching more stills.",
    item4BuildPlan: "Recommend the strongest format for each selected platform from the photos you uploaded.",
    item4PrepareVariants: "Create the cropped 4:5, 9:16, 1:1, or 16:9 versions required by the plan. If a run stalls, Retry remaining requeues leftover crops. Files must finish saving to Google Drive first. Drag each photo to keep the important part in frame.",
    closeProductionRequest: "Close this request and return to the draft list. Saved photos stay in Studio.",
    saveProductionRequest: "Save the current draft without promoting it into the pipeline.",
    syncProductionRequestDirectives: "Copy advanced options from this form onto the requested platform outputs.",
    promoteProductionRequest: "Approve this request and send it into the production pipeline. Publishing stays a later step.",
    pipelineApproveAll: "Approve every Ready for Review output on this page. Leave Use default schedules off to publish now; turn it on to fill empty times from each platform’s suggested slot. A time you already typed still wins.",
    pipelineUseDefaultSchedules: "When on, Approve All uses each platform’s suggested publish window for any row that does not already have a time. Studio then moves a time later if that platform already has a post within 90 minutes. Off means empty times publish now, still staggered if two rows on the same platform would go at once. New requests already come with suggested times filled in.",
    prVoicePreview: "Play a short sample of the selected voice. This does not generate your script.",
    prMusicPreview: "Play a preview of the selected music track.",
    savePrOverride: "Save overrides for this one platform output without changing the master defaults.",
    closePrOverride: "Close the per-output override editor without promoting the request.",
  };

  const PRODUCTION_TARGET_HELP = {
    ezUploadZone: "Drop photos here. They appear immediately. Drive copies can finish in the background — you can keep working or leave this screen.",
    item4UploadZone: "Drop stills and clips here, or tap Choose files. Studio saves them one at a time. From library picks classified Drive assets.",
    item4AssetStatus: "Shows whether master photos are still loading into Drive or already saved.",
    item4PlanStatus: "Shows whether Studio has recommended a format for each selected platform.",
    item4VariantStatus: "Shows whether platform frames have been prepared. Clips skip photo crops and attach as-is.",
    productionRequestStatus: "Draft means you can still edit. Promoted means it has entered the pipeline.",
    item4PlanHint: "Build the plan after photos are on screen. You do not have to wait for Drive copies to finish.",
    item4VariantHint: "Prepare after the platform plan is ready. Photos can be dragged to reframe. Clips skip crops.",
    item4ProductionGate: "The plan is saved. Studio still checks the source-to-production bridge before promote.",
    productionPromotionCompatibility: "Promote stays locked until master photos, the platform plan, and required crops are ready.",
  };

  let phase6TooltipPopover = null;
  let phase6TooltipActive = null;

  function phase6TooltipElement() {
    if (phase6TooltipPopover) return phase6TooltipPopover;
    const tip = document.createElement("div");
    tip.className = "phase6-tooltip-popover";
    tip.id = "phase6ControlTooltip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);
    phase6TooltipPopover = tip;
    return tip;
  }

  function hideStudioGlobalTooltip() {
    if (typeof window.studioHideGlobalTooltip === "function") {
      window.studioHideGlobalTooltip();
      return;
    }
    const tooltip = document.getElementById("studioGlobalTooltip");
    if (!tooltip) return;
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
  }

  function phase6HideTooltip() {
    if (!phase6TooltipPopover) return;
    phase6TooltipPopover.classList.remove("visible", "above");
    phase6TooltipPopover.setAttribute("aria-hidden", "true");
    if (phase6TooltipActive) phase6TooltipActive.removeAttribute("aria-describedby");
    phase6TooltipActive = null;
  }

  function phase6ShowTooltip(target, text) {
    if (!target || !text) return;
    if (window.matchMedia("(max-width: 760px), (pointer: coarse)").matches) return;
    hideStudioGlobalTooltip();
    const tip = phase6TooltipElement();
    phase6TooltipActive = target;
    tip.textContent = text;
    tip.classList.remove("above");
    tip.classList.add("visible");
    tip.setAttribute("aria-hidden", "false");
    target.setAttribute("aria-describedby", tip.id);
    const r = target.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(330, window.innerWidth - 24);
    tip.style.width = `${width}px`;
    tip.style.left = "12px";
    tip.style.top = "12px";
    const tr = tip.getBoundingClientRect();
    let left = r.left + Math.min(r.width / 2, 22) - 20;
    left = Math.max(10, Math.min(left, window.innerWidth - tr.width - 10));
    let top = r.bottom + 8;
    let above = false;
    if (top + tr.height > window.innerHeight - 10 && r.top - tr.height - 8 >= 10) {
      top = r.top - tr.height - 8;
      above = true;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(10, top)}px`;
    tip.style.setProperty("--tip-arrow-left", `${Math.max(12, Math.min(tr.width - 16, r.left + r.width / 2 - left - 4))}px`);
    tip.classList.toggle("above", above);
  }

  function phase6BindTooltipTarget(target, text) {
    if (!target || !text) return;
    target.dataset.phase6Tooltip = text;
    target.classList.add("phase6-tooltip-target");
    target.removeAttribute("title");
    if (typeof window.studioLockTooltip === "function") {
      window.studioLockTooltip(target, text);
      if (target.dataset.phase6TooltipBound === "1") return;
      target.dataset.phase6TooltipBound = "1";
      return;
    }
    if (target.dataset.phase6TooltipBound === "1") return;
    target.dataset.phase6TooltipBound = "1";
    delete target.dataset.studioTooltip;
    target.addEventListener("mouseenter", () => phase6ShowTooltip(target, target.dataset.phase6Tooltip || text));
    target.addEventListener("mouseleave", phase6HideTooltip);
    target.addEventListener("focus", () => phase6ShowTooltip(target, target.dataset.phase6Tooltip || text));
    target.addEventListener("blur", phase6HideTooltip);
  }

  function productionDecorateTooltips(root) {
    const scope = root && root.querySelectorAll ? root : $("page-content");
    if (!scope?.querySelectorAll) return;
    const page = $("page-content");
    const searchRoot = scope === document || (page && page.contains(scope)) ? scope : page;
    if (!searchRoot?.querySelectorAll) return;

    Object.entries(PRODUCTION_CONTROL_HELP).forEach(([id, text]) => {
      const control = searchRoot.id === id ? searchRoot : searchRoot.querySelector?.(`#${id}`) || $(id);
      if (!control || (searchRoot !== document && searchRoot !== page && !searchRoot.contains(control) && control !== searchRoot)) return;
      if (control.closest?.("#creativeEditorPanel")) return;
      phase6AttachHelpDot(control.closest("label"), text);
      phase6BindTooltipTarget(control, text);
    });

    Object.entries(PRODUCTION_BUTTON_HELP).forEach(([id, text]) => {
      const button = searchRoot.id === id ? searchRoot : searchRoot.querySelector?.(`#${id}`) || $(id);
      if (!button || button.closest?.("#creativeEditorPanel")) return;
      phase6BindTooltipTarget(button, text);
    });

    Object.entries(PRODUCTION_TARGET_HELP).forEach(([id, text]) => {
      if (id === "ezUploadProgress" || id === "item4UploadProgress") return;
      const target = searchRoot.id === id ? searchRoot : searchRoot.querySelector?.(`#${id}`) || $(id);
      if (!target || target.closest?.("#creativeEditorPanel")) return;
      phase6BindTooltipTarget(target, text);
    });

    searchRoot.querySelectorAll?.("[data-pr-id]").forEach((button) => {
      phase6BindTooltipTarget(button, "Open this draft to continue photos, platform plan, crops, and promote.");
    });
    searchRoot.querySelectorAll?.("[data-refresh='content']").forEach((button) => {
      phase6BindTooltipTarget(button, "Reload drafts and promoted items. Photo uploads keep running in the background.");
    });
    searchRoot.querySelectorAll?.("[data-ez-input='single-photo'], [data-pr-input='single-photo']").forEach((card) => {
      phase6BindTooltipTarget(card, "One photo. Studio plans Instagram 4:5, Facebook image, and TikTok photo draft from that original.");
    });
    searchRoot.querySelectorAll?.("[data-ez-input='multiple-photos'], [data-pr-input='multiple-photos']").forEach((card) => {
      phase6BindTooltipTarget(card, "A set of photos. Studio plans Reels, a Facebook slideshow Reel, TikTok video draft, and YouTube Short. The 3D thumbnail is the grid cover on those videos.");
    });
    searchRoot.querySelectorAll?.("[data-ez-input='photos-and-clips'], [data-pr-input='photos-and-clips']").forEach((card) => {
      phase6BindTooltipTarget(card, "Mix photos and raw clips on one timeline. Studio renders a Reel, Facebook Reel, TikTok draft, and YouTube Short. Finished video (publish as-is) is a different choice.");
    });
    searchRoot.querySelectorAll?.("[data-ez-input='video-clips'], [data-pr-input='video-clips']").forEach((card) => {
      phase6BindTooltipTarget(card, "Raw clips only, no stills. Studio cuts them into a Reel, Facebook Reel, TikTok draft, and YouTube Short. Finished video (publish as-is) is a different choice.");
    });
    searchRoot.querySelectorAll?.("[data-item4-platform], [data-ez-platform]").forEach((input) => {
      const label = input.closest("label") || input;
      phase6BindTooltipTarget(label, `Include ${input.value} in the recommended platform plan. You can change this before you promote.`);
    });
    searchRoot.querySelectorAll?.("[data-pr-output], [data-ez-output]").forEach((input) => {
      const label = input.closest("label") || input;
      const platform = input.dataset.platform || "";
      const type = input.value;
      const text = type === "Story" && platform === "TikTok"
        ? "TikTok’s posting API does not have a separate Stories destination. Leave this off; the Video Draft is the TikTok post."
        : type === "Story"
          ? `Add a companion 5-second 9:16 ${platform} Story from the first photo, with a slight zoom and music. After the main ${platform} post is live, the Story can link through to it.`
          : `Add ${platform} ${type} as an extra output beyond the recommended plan.`.replace(/\s+/g, " ").trim();
      phase6BindTooltipTarget(label, text);
    });
    searchRoot.querySelectorAll?.("[data-remove-item4-asset]").forEach((button) => {
      phase6BindTooltipTarget(button, "Remove this photo from the master set. Other originals stay in Studio.");
    });
    searchRoot.querySelectorAll?.("[data-ez-caption-mode]").forEach((select) => {
      phase6BindTooltipTarget(select, "AI, Manual, or None for this photo only. This does not change the post caption.");
    });
    searchRoot.querySelectorAll?.("[data-ez-asset-caption]").forEach((box) => {
      phase6BindTooltipTarget(box, "Label this photo. The Pipeline Caption field is the post text, not this.");
    });
    searchRoot.querySelectorAll?.("[data-item4-format]").forEach((select) => {
      phase6BindTooltipTarget(select, "Override the recommended format for this platform. Native stills stay photos; video formats use the render path.");
    });
    searchRoot.querySelectorAll?.(".item4-crop-frame").forEach((frame) => {
      phase6BindTooltipTarget(frame, "Drag to keep the important part in the frame. Scroll or use + / − to zoom. The original photo stays uncropped.");
    });
    searchRoot.querySelectorAll?.("[data-item4-crop-zoom]").forEach((button) => {
      phase6BindTooltipTarget(button, Number(button.dataset.dir) < 0 ? "Zoom out so more of the photo stays in frame." : "Zoom in on the part of the photo you want to keep.");
    });
    searchRoot.querySelectorAll?.("[data-item4-crop-reset]").forEach((button) => {
      phase6BindTooltipTarget(button, "Reset this crop to the default center framing.");
    });
    searchRoot.querySelectorAll?.(".ez-option-group > summary, #ezAdvancedOptions > summary").forEach((summary) => {
      const map = {
        "Audio / Voiceover": "Optional. Voiceover and music apply to video outputs, not native still carousels.",
        "Post title": "Optional on-post title. Separate from the idea name at the top.",
        Script: "Optional spoken-script control. Leave closed to let AI write narration when needed.",
        Cover: "Optional thumbnail / cover still and extra seconds after voiceover.",
        Structure: "Optional clip and slide counts. Closed means AI decides.",
        Notes: "Optional production notes for pacing, style, or execution.",
        Outputs: "Optional extra formats. Defaults already follow your platforms and photos.",
        "Advanced options": "Extra outputs, structure, audio, wording, and notes. Closed means the photo plan and EZ defaults already apply.",
      };
      const text = map[summary.textContent.trim()];
      if (text) phase6BindTooltipTarget(summary, text);
    });
  }

  function phase6AttachHelpDot(label, text) {
    if (!label || !text || label.dataset.phase6HelpDecorated === "1") return;
    label.dataset.phase6HelpDecorated = "1";
    const labelSpan = label.querySelector(":scope > span") || label.querySelector("span");
    if (!labelSpan) return;
    labelSpan.classList.add("control-label-with-help");
    const dot = document.createElement("span");
    dot.className = "control-help-dot";
    dot.textContent = "?";
    dot.tabIndex = 0;
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", `Help: ${labelSpan.textContent.trim()}`);
    phase6BindTooltipTarget(dot, text);
    dot.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (typeof window.studioShowGlobalTooltip === "function") window.studioShowGlobalTooltip(dot, e);
      else phase6ShowTooltip(dot, text);
    });
    labelSpan.appendChild(dot);
  }

  function phase6DecorateTooltips(root = document) {
    const scope = root || document;
    scope.querySelectorAll?.("input, select, textarea").forEach((control) => {
      if (!control.closest("#creativeEditorPanel")) return;
      const text = PHASE6_CONTROL_HELP[control.id] || PHASE6_SLIDE_HELP[control.dataset.field];
      if (!text) return;
      phase6AttachHelpDot(control.closest("label"), text);
    });
    scope.querySelectorAll?.("button").forEach((button) => {
      if (!button.closest("#creativeEditorPanel")) return;
      const text = PHASE6_CONTROL_HELP[button.id] || PHASE6_BUTTON_HELP[button.textContent.trim()];
      if (text) phase6BindTooltipTarget(button, text);
    });
    scope.querySelectorAll?.(".slide-drag-handle").forEach((handle) => phase6BindTooltipTarget(handle, "Drag this slide to change its order in the rendered sequence."));
    scope.querySelectorAll?.(".variant-chip").forEach((chip) => phase6BindTooltipTarget(chip, "Shows whether this slide has an exact pre-sized image for the ratio. Source/crop or source-ready means Studio can still render it from the original image."));
    scope.querySelectorAll?.(".ratio-summary-item").forEach((tile) => phase6BindTooltipTarget(tile, "Ratio readiness shows whether the output can render at this aspect ratio. An exact variant is optional; source + fill/crop means Studio will render from the source image and crop as needed."));
    scope.querySelectorAll?.("[data-creative-output-id]").forEach((button) => {
      const text = PHASE6_BUTTON_HELP[button.textContent.trim()] || "Open the Phase 6 creative review editor for this output.";
      phase6BindTooltipTarget(button, text);
    });
  }

  function renderCreativeOutputMeta(output) {
    const target = $("creativeOutputMeta");
    const watchUrl = output.studio_preview_url || output.final_file_url || output.output_url || "";
    const thumbUrl = phase6ThumbnailDownloadUrl(output);
    const coverPreview = phase6CoverStillUrl(output);
    const rows = [
      ["Platform", output.platform || "—"],
      ["Output type", output.platform_output_type || output.format || "—"],
      ["Ratio", output.aspect_ratio || "—"],
      ["Render", output.render_status || "—"],
      ["Review", output.review_status || "—"],
      ["Publish safety", output.do_not_publish ? "Do Not Publish" : "Publishing enabled"],
    ];
    if (output.scheduled_post_date) rows.push(["Scheduled", formatStudioDateTime(output.scheduled_post_date)]);
    if (output.published_at) rows.push(["Published", formatStudioDateTime(output.published_at)]);
    if (output.review_decision_at) rows.push(["Review decision", formatStudioDateTime(output.review_decision_at)]);
    if (output.studio_preview_updated_at) rows.push(["Preview updated", formatStudioDateTime(output.studio_preview_updated_at)]);
    if (output.output_caption) rows.push(["Caption", output.output_caption]);
    if (output.output_hashtags) rows.push(["Hashtags", output.output_hashtags]);
    let html = rows.map(([label, v]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(v)}</b></div>`).join("");
    if (watchUrl) {
      html += `<div><span>File</span><b><a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(watchUrl)}">Open rendered file ↗</a></b></div>`;
    }
    if (thumbUrl) {
      html += `<div><span>Thumbnail</span><b><a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(thumbUrl)}">Download cover ↗</a></b></div>`;
      if (coverPreview) {
        html += `<div class="creative-thumb-preview"><span>Cover</span><b><a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(thumbUrl)}"><img src="${escapeHtml(coverPreview)}" alt="Output cover thumbnail" width="120" height="213" loading="lazy"></a></b></div>`;
      }
    } else {
      html += `<div><span>Thumbnail</span><b>Not set</b></div>`;
    }
    target.innerHTML = html;
  }

  function tiktokNeedsUrlEntry(record) {
    if (String(record?.platform || "").trim().toLowerCase() !== "tiktok") return false;
    if (record?.do_not_publish) return false;
    const publish = String(record?.publish_status || "").trim().toLowerCase();
    const output = String(record?.output_status || "").trim().toLowerCase();
    const draft = String(record?.tiktok_draft_status || "").trim().toLowerCase();
    if (publish === "published" || output === "published" || draft === "published") return false;
    const manual = String(record?.manual_completion_status || "").trim().toLowerCase();
    const studio = String(record?.studio_state || pipelineStudioStateLabel(record) || "").trim().toLowerCase();
    return manual === "required"
      || studio.includes("manual action")
      || studio === "draft delivered"
      || draft.includes("manual action")
      || draft.includes("draft delivered")
      || draft.includes("manual completion received");
  }

  function tiktokLiveUrl(record) {
    return String(record?.platform_post_url || record?.manual_published_url || "").trim();
  }

  function tiktokMusicChoice(record, selected) {
    if (selected) return selected;
    return /manual action/i.test(String(record?.music_status || "")) ? "no" : "not_requested";
  }

  async function submitTiktokComplete(recordId, { url, musicCompleted, record } = {}) {
    const postUrl = String(url || "").trim();
    if (!/tiktok\.com/i.test(postUrl)) throw new Error("Paste a live TikTok URL containing tiktok.com.");
    return api(`/api/outputs/${encodeURIComponent(recordId)}/tiktok-complete`, {
      method: "POST",
      body: JSON.stringify({
        platform_post_url: postUrl,
        music_completed: tiktokMusicChoice(record, musicCompleted),
      }),
    });
  }

  function renderCreativeTiktokComplete(output) {
    const card = $("creativeTiktokComplete");
    const form = $("creativeTiktokCompleteForm");
    const live = $("creativeTiktokCompleteLive");
    const musicWrap = $("creativeTiktokMusicWrap");
    const music = $("creativeTiktokMusic");
    const input = $("creativeTiktokUrl");
    if (!card || !form || !live || !input) return;
    const tiktok = String(output?.platform || "").trim().toLowerCase() === "tiktok";
    const awaiting = tiktokNeedsUrlEntry(output);
    const posted = tiktokLiveUrl(output);
    if (!tiktok || (!awaiting && !posted)) {
      card.hidden = true;
      return;
    }
    card.hidden = false;
    form.hidden = !awaiting;
    live.hidden = awaiting || !posted;
    if (musicWrap) musicWrap.hidden = !awaiting || !/manual action/i.test(String(output?.music_status || ""));
    if (music && awaiting) music.value = tiktokMusicChoice(output);
    if (awaiting) input.value = posted;
    if (!awaiting && posted) {
      live.innerHTML = `Live post: <a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(posted)}">Open TikTok ↗</a>`;
    } else if (!awaiting) {
      live.hidden = true;
    }
  }

  function renderCreativeRatioPanel() {
    const target = $("creativeRatioPanel");
    if (!activeCreativeOutput) return target.innerHTML = "";
    const targetRatio = String(activeCreativeOutput.aspect_ratio || "");
    const canvases = creativeOptions.ratio_canvases || { "9:16": "1080x1920", "4:5": "1080x1350", "1:1": "1080x1080", "16:9": "1920x1080" };
    const ratios = ["9:16", "4:5", "1:1", "16:9"];
    const total = creativeSlides.length;
    target.innerHTML = `<div class="creative-ratio-summary">${ratios.map((ratio) => {
      const exact = creativeSlides.filter((slide) => Boolean(slide.variants?.[ratio])).length;
      const current = ratio === targetRatio;
      let status = "Renderable from source if targeted";
      if (!total) status = "No linked slides";
      else if (current && exact === total) status = `${exact}/${total} exact variants ready · others use source`;
      else if (current) status = `${total}/${total} renderable · source + fill/crop`;
      else if (exact > 0) status = `${exact}/${total} exact variants ready · others use source`;
      return `<div class="ratio-summary-item ${current ? "active" : ""}"><span>${escapeHtml(ratio)}${current ? " · target" : ""}</span><b>${escapeHtml(canvases[ratio] || "")}</b><small>${escapeHtml(status)}</small></div>`;
    }).join("")}</div>`;
    phase6DecorateTooltips(target);
  }

  function phase6DefaultOverlayPosition() {
    return String(activeCreativeOutput?.platform || "") === "TikTok" && String(activeCreativeOutput?.aspect_ratio || "") === "9:16"
      ? "lower-third"
      : "center";
  }

  function phase6OverlayPreviewHtml(overlay = {}) {
    const title = String(overlay.text || "").trim();
    const caption = String(overlay.caption || overlay.subtitle || "").trim();
    const enabled = overlay.enabled !== false && Boolean(title);
    const position = String(overlay.position || phase6DefaultOverlayPosition()).replace(/[^a-z0-9-]/gi, "") || "center";
    const size = Math.max(10, Math.round((Number(overlay.size || 64) / 64) * 13));
    if (!enabled) return `<div class="slide-title-preview pos-${escapeHtml(position)} off" aria-hidden="true"></div>`;
    return `<div class="slide-title-preview pos-${escapeHtml(position)}" style="font-size:${size}px">
      <div class="slide-title-preview-title">${escapeHtml(title)}</div>
      ${caption ? `<div class="slide-title-preview-caption">${escapeHtml(caption)}</div>` : ""}
    </div>`;
  }

  function phase6BindOverlayPreview(card) {
    const canvas = card.querySelector(".slide-preview-canvas");
    if (!canvas) return;
    const update = () => {
      const style = card.querySelector('[data-field="overlay_style"]')?.value;
      const overlay = {
        enabled: Boolean(card.querySelector('[data-field="overlay_enabled"]')?.checked) && style !== "No Text",
        text: card.querySelector('[data-field="overlay_text"]')?.value || "",
        caption: card.querySelector('[data-field="overlay_caption"]')?.value || "",
        position: card.querySelector('[data-field="overlay_position"]')?.value || phase6DefaultOverlayPosition(),
        size: Number(card.querySelector('[data-field="overlay_size"]')?.value || 64),
      };
      const nextWrap = document.createElement("div");
      nextWrap.innerHTML = phase6OverlayPreviewHtml(overlay);
      const next = nextWrap.firstElementChild;
      const existing = canvas.querySelector(".slide-title-preview");
      if (existing) existing.replaceWith(next);
      else canvas.appendChild(next);
    };
    ["overlay_enabled", "overlay_text", "overlay_caption", "overlay_position", "overlay_size", "overlay_style"].forEach((field) => {
      const node = card.querySelector(`[data-field="${field}"]`);
      node?.addEventListener("input", update);
      node?.addEventListener("change", update);
    });
  }

  function phase6SlideAudioStatus(slide, output) {
    const status = String(slide?.voiceover?.status || "").trim();
    const itemUrl = String(output?.voiceover?.url || output?.voiceover_url || "").trim();
    const itemMode = String(output?.voiceover?.mode || "").trim();
    const itemStatus = String(output?.voiceover?.status || "").trim();
    if (status && status !== "Not Requested") return status;
    if (itemUrl || itemMode === "Yes" || itemStatus === "Item voiceover" || itemStatus === "Requested") return "Item voiceover";
    if (slide?.virtual && (!status || status === "Not Requested")) return "Not on this slide";
    return status || "—";
  }

  function renderCreativeSlides() {
    const target = $("creativeSlidesList");
    $("creativeSlideCount").textContent = `${creativeSlides.length} slide${creativeSlides.length === 1 ? "" : "s"}`;
    if (!creativeSlides.length) {
      target.innerHTML = '<div class="creative-no-slides">This output does not currently have linked Carousel Slides. Audio and shared creative settings can still be reviewed, but there are no per-slide controls to edit.</div>';
      renderCreativeRatioPanel();
      return;
    }

    const targetRatio = String(activeCreativeOutput?.aspect_ratio || "4:5");
    const tiktok916 = String(activeCreativeOutput?.platform || "") === "TikTok" && targetRatio === "9:16";
    const titleLocked = Boolean(creativeTitleLock?.locked);
    const titleLockAttr = titleLocked ? "disabled" : "";
    const styles = creativeOptions.style_presets || [];
    const roles = creativeOptions.text_roles || [];
    const positions = creativeOptions.positions || [];
    const focalPoints = creativeOptions.focal_points || [];
    const fits = creativeOptions.fit_modes || [];
    const motions = creativeOptions.motions || [];
    const transitions = creativeOptions.transitions || [];
    const voices = phase6NormalizeVoices(creativeOptions.voices || []);

    target.innerHTML = creativeSlides.map((slide, index) => {
      const overlay = slide.overlay || {};
      const overlayPosition = overlay.position || (tiktok916 ? "lower-third" : "center");
      const overlayCaption = overlay.caption || overlay.subtitle || "";
      const overlayVersion = Number(overlay.version || slide.title_render_input?.version || 1);
      const voiceover = slide.voiceover || {};
      const audioStatus = phase6SlideAudioStatus(slide, activeCreativeOutput);
      const variants = slide.variants || {};
      const preview = slide.preview_url;
      const variantChips = ["4:5", "9:16", "1:1", "16:9"].map((ratio) => {
        const exact = Boolean(variants[ratio]);
        const current = ratio === targetRatio;
        const label = current ? (exact ? `${ratio} target · exact` : `${ratio} target · source/crop`) : (exact ? `${ratio} exact` : `${ratio} source-ready`);
        return `<span class="variant-chip ${exact ? "ready" : ""} ${current ? "target" : ""}">${escapeHtml(label)}</span>`;
      }).join("");
      const previewHtml = preview
        ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(slide.name || `Slide ${index + 1}`)}">`
        : '<div class="slide-preview-placeholder">No preview image available</div>';
      const titlePreviewHtml = phase6OverlayPreviewHtml({
        enabled: overlay.enabled,
        text: overlay.text,
        caption: overlayCaption,
        position: overlayPosition,
        size: overlay.size,
      });
      const tiktokProof = targetRatio === "9:16" && slide.tiktok_safe_zone_status
        ? `<div class="subtle">TikTok safe zone: ${escapeHtml(slide.tiktok_safe_zone_status)}</div>` : "";

      const collapsed = creativeSlideCollapsed.has(slide.id);
      const slideSummary = `v${overlayVersion} · ${Number(slide.duration_seconds ?? 4).toFixed(1)}s · ${overlay.style_preset || "No style"} · ${voiceover.enabled === false ? "No voiceover" : (voiceover.voice || "Voiceover")}${titleLocked ? " · titles locked" : ""}`;
      return `<article class="creative-slide-card ${slide.include === false ? "excluded" : ""} ${collapsed ? "collapsed" : ""} ${titleLocked ? "title-locked" : ""}" draggable="true" data-slide-id="${escapeHtml(slide.id)}">
        <div class="creative-slide-header">
          <div class="creative-slide-title-wrap"><span class="slide-drag-handle" title="Drag to reorder">⋮⋮</span><div><div class="creative-slide-title">${escapeHtml(slide.name || `Slide ${index + 1}`)}</div><div class="creative-slide-subtitle">Order ${index + 1}${slide.is_cover ? " · Cover" : ""}${slide.review_status ? ` · ${escapeHtml(slide.review_status)}` : ""} · ${escapeHtml(slideSummary)}</div></div></div>
          <div class="creative-slide-header-actions"><button type="button" class="slide-collapse-button" aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Expand" : "Collapse"}</button><label class="slide-include-control"><input type="checkbox" data-field="include" ${slide.include !== false ? "checked" : ""}> Include</label></div>
        </div>
        <div class="creative-slide-body">
          <div class="creative-slide-visual">
            <div class="slide-preview-canvas ${phase6RatioClass(targetRatio)}">${previewHtml}${titlePreviewHtml}<div class="safe-zone-overlay ${slide.safe_area_aware !== false ? "on" : ""}"></div></div>
            <div class="variant-chips">${variantChips}</div>${tiktokProof}
          </div>
          <div class="creative-slide-controls">
            <div class="slide-control-section">
              <div class="slide-control-section-title">Timing & framing</div>
              <div class="slide-control-row">
                <label class="form-field"><span>Duration (sec)</span><input data-field="duration_seconds" type="number" min="0.5" max="60" step="0.1" value="${escapeHtml(slide.duration_seconds ?? 4)}"></label>
                <label class="form-field"><span>Focal point</span><select data-field="focal_point">${phase6OptionList(focalPoints, slide.focal_point || "center")}</select></label>
                <label class="form-field"><span>Fit mode</span><select data-field="fit_mode">${phase6OptionList(fits, slide.fit_mode || "fill_crop", { label: phase6FitLabel })}</select></label>
                <label class="toggle-control"><input data-field="safe_area_aware" type="checkbox" ${slide.safe_area_aware !== false ? "checked" : ""}><span>Show / honor safe area</span></label>
              </div>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">On-photo title ${titleLocked ? "· locked" : `· v${overlayVersion}`}</div>
              <div class="slide-control-row">
                <label class="toggle-control"><input data-field="overlay_enabled" type="checkbox" ${overlay.enabled !== false ? "checked" : ""} ${titleLockAttr}><span>Text on this slide</span></label>
                <label class="form-field"><span>Style</span><select data-field="overlay_style" ${titleLockAttr}>${phase6OptionList(styles, overlay.style_preset || "Chicago Editorial")}</select></label>
                <label class="form-field"><span>Role</span><select data-field="overlay_role" ${titleLockAttr}>${phase6OptionList(roles, overlay.role || "overlay")}</select></label>
                <label class="form-field"><span>Placement</span><select data-field="overlay_position" ${titleLockAttr}>${phase6OptionList(positions, overlayPosition)}</select></label>
              </div>
              <div class="slide-control-row two">
                <label class="form-field"><span>On-photo title</span><textarea class="slide-overlay-text" data-field="overlay_text" ${titleLockAttr}>${escapeHtml(overlay.text || "")}</textarea></label>
                <label class="form-field"><span>On-photo caption</span><textarea class="slide-overlay-text" data-field="overlay_caption" ${titleLockAttr}>${escapeHtml(overlayCaption)}</textarea></label>
              </div>
              <div class="slide-control-row three">
                <label class="form-field"><span>Text size</span><input data-field="overlay_size" type="number" min="20" max="140" step="1" value="${escapeHtml(overlay.size ?? 64)}" ${titleLockAttr}></label>
                <label class="form-field"><span>Start (0–1)</span><input data-field="overlay_start" type="number" min="0" max="1" step="0.05" value="${escapeHtml(overlay.start_fraction ?? 0)}" ${titleLockAttr}></label>
                <label class="form-field"><span>End (0–1)</span><input data-field="overlay_end" type="number" min="0" max="1" step="0.05" value="${escapeHtml(overlay.end_fraction ?? 1)}" ${titleLockAttr}></label>
              </div>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">Voiceover</div>
              <div class="slide-control-row">
                <label class="toggle-control"><input data-field="voiceover_enabled" type="checkbox" ${voiceover.enabled !== false ? "checked" : ""}><span>Voiceover on</span></label>
                <div class="voice-select-wrap"><label class="form-field"><span>Voice</span><select data-field="voiceover_voice">${phase6VoiceOptionList(voices, voiceover.voice_id || "", voiceover.voice || "Kate")}</select></label><button type="button" class="voice-preview-button" data-field="voiceover_voice_preview">▶ Preview</button></div>
                <label class="form-field"><span>VO volume override (%)</span><input data-field="voiceover_volume_override" type="number" min="0" max="125" step="1" value="${voiceover.volume_override === null || voiceover.volume_override === undefined ? "" : escapeHtml(phase6FormatPercent(Number(voiceover.volume_override) * 100))}" placeholder="Global ${escapeHtml(phase6FormatPercent(Number(activeCreativeOutput?.voiceover?.volume ?? 1) * 100))}%"></label>
                <div class="form-field"><span>Current audio</span><div class="subtle">${escapeHtml(audioStatus)}${voiceover.duration_seconds ? ` · ${Number(voiceover.duration_seconds).toFixed(1)}s` : ""} · ${escapeHtml(phase6FormatPercent(Number(voiceover.volume ?? activeCreativeOutput?.voiceover?.volume ?? 1) * 100))}%</div></div>
              </div>
              <label class="form-field"><span>Narration text</span><textarea class="voiceover-text" data-field="voiceover_text">${escapeHtml(voiceover.text || "")}</textarea></label>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">Motion & transition</div>
              <div class="slide-control-row three">
                <label class="form-field"><span>Motion</span><select data-field="motion_type">${phase6OptionList(motions, slide.motion?.type || "none", { label: phase6MotionLabel })}</select></label>
                <label class="form-field"><span>Transition</span><select data-field="transition_type">${phase6OptionList(transitions, slide.transition?.type || "fade", { label: phase6TransitionLabel })}</select></label>
                <label class="form-field"><span>Transition frames</span><input data-field="transition_frames" type="number" min="0" max="90" step="1" value="${escapeHtml(slide.transition?.duration_frames ?? 12)}"></label>
              </div>
            </div>
          </div>
        </div>
      </article>`;
    }).join("");
    phase6DecorateTooltips(target);
    target.querySelectorAll('[data-field="voiceover_voice_preview"]').forEach((button) => {
      button.addEventListener("click", () => {
        const card = button.closest(".creative-slide-card");
        phase6PreviewSelectedVoice(card?.querySelector('[data-field="voiceover_voice"]'), button);
      });
    });

    let draggedId = null;
    target.querySelectorAll(".creative-slide-card").forEach((card) => {
      card.querySelector(".slide-collapse-button")?.addEventListener("click", () => {
        const id = card.dataset.slideId;
        if (creativeSlideCollapsed.has(id)) creativeSlideCollapsed.delete(id);
        else creativeSlideCollapsed.add(id);
        card.classList.toggle("collapsed", creativeSlideCollapsed.has(id));
        const button = card.querySelector(".slide-collapse-button");
        if (button) {
          const isCollapsed = creativeSlideCollapsed.has(id);
          button.textContent = isCollapsed ? "Expand" : "Collapse";
          button.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        }
      });
      card.addEventListener("dragstart", () => {
        syncCreativeSlidesFromDom();
        draggedId = card.dataset.slideId;
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        target.querySelectorAll(".creative-slide-card").forEach((c) => c.classList.remove("drag-over"));
        draggedId = null;
      });
      card.addEventListener("dragover", (event) => { event.preventDefault(); card.classList.add("drag-over"); });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-over");
        const dropId = card.dataset.slideId;
        if (!draggedId || draggedId === dropId) return;
        const from = creativeSlides.findIndex((s) => s.id === draggedId);
        const to = creativeSlides.findIndex((s) => s.id === dropId);
        if (from < 0 || to < 0) return;
        const [moved] = creativeSlides.splice(from, 1);
        creativeSlides.splice(to, 0, moved);
        creativeSlides.forEach((s, i) => { s.order = i + 1; });
        renderCreativeSlides();
        phase6MarkDirty();
      });
      card.querySelector('[data-field="include"]')?.addEventListener("change", (event) => card.classList.toggle("excluded", !event.target.checked));
      card.querySelector('[data-field="safe_area_aware"]')?.addEventListener("change", (event) => card.querySelector(".safe-zone-overlay")?.classList.toggle("on", event.target.checked));
      card.querySelector('[data-field="overlay_style"]')?.addEventListener("change", (event) => {
        if (event.target.value === "No Text") card.querySelector('[data-field="overlay_enabled"]').checked = false;
      });
      phase6BindOverlayPreview(card);
    });
    renderCreativeRatioPanel();
  }

  function syncCreativeSlidesFromDom() {
    const list = $("creativeSlidesList");
    if (!list) return creativeSlides;
    const byId = new Map(creativeSlides.map((s) => [s.id, s]));
    const collected = [];
    list.querySelectorAll(".creative-slide-card").forEach((card, index) => {
      const base = byId.get(card.dataset.slideId) || { id: card.dataset.slideId };
      const get = (field) => card.querySelector(`[data-field="${field}"]`);
      collected.push({
        ...base,
        order: index + 1,
        include: Boolean(get("include")?.checked),
        duration_seconds: Number(get("duration_seconds")?.value || 4),
        focal_point: get("focal_point")?.value || "center",
        fit_mode: get("fit_mode")?.value || "fill_crop",
        safe_area_aware: Boolean(get("safe_area_aware")?.checked),
        overlay: {
          ...(base.overlay || {}),
          enabled: Boolean(get("overlay_enabled")?.checked),
          text: get("overlay_text")?.value || "",
          caption: get("overlay_caption")?.value || "",
          subtitle: get("overlay_caption")?.value || "",
          style_preset: get("overlay_style")?.value || "Chicago Editorial",
          role: get("overlay_role")?.value || "overlay",
          position: get("overlay_position")?.value || phase6DefaultOverlayPosition(),
          size: Number(get("overlay_size")?.value || 64),
          start_fraction: Number(get("overlay_start")?.value ?? 0),
          end_fraction: Number(get("overlay_end")?.value ?? 1),
        },
        voiceover: {
          ...(base.voiceover || {}),
          enabled: Boolean(get("voiceover_enabled")?.checked),
          text: get("voiceover_text")?.value || "",
          voice_id: phase6SelectedVoice(get("voiceover_voice")).id || base.voiceover?.voice_id || "",
          voice: phase6SelectedVoice(get("voiceover_voice")).name || base.voiceover?.voice || "Kate",
          volume_override: (() => {
            const raw = get("voiceover_volume_override")?.value;
            if (raw === undefined || raw === null || String(raw).trim() === "") return null;
            return Math.max(0, Math.min(1.25, Number(raw) / 100));
          })(),
        },
        motion: { ...(base.motion || {}), type: get("motion_type")?.value || "none" },
        transition: {
          ...(base.transition || {}),
          type: get("transition_type")?.value || "fade",
          duration_frames: Number(get("transition_frames")?.value || 12),
        },
      });
    });
    creativeSlides = collected;
    return creativeSlides;
  }

  function populateCreativeGlobalControls(output) {
    const settings = output.creative_settings || {};
    const manifest = output.creative_manifest || {};
    const manifestPolish = manifest.visualPolish || {};
    const inferredStrategy = manifestPolish.styleMode === "mixed_per_slide" ? "AI vary naturally" : "Manual per slide";
    $("creativeStyleStrategy").value = settings.style_strategy || inferredStrategy;
    $("creativeDefaultDuration").value = settings.default_slide_duration_seconds ?? creativeSlides[0]?.duration_seconds ?? 4;
    $("creativeDefaultTransitionFrames").value = settings.default_transition_frames ?? manifest.transitionFrames ?? 12;
    $("creativeVoiceoverTail").value = output.voiceover_tail_seconds ?? manifest.voiceoverTailSeconds ?? 2;
    $("creativeVariantPolicy").value = settings.variant_policy || "Prefer exact prepared variant";
    $("creativeOpeningTreatment").value = settings.opening_treatment || "Auto";
    $("creativeClosingTreatment").value = settings.closing_treatment || "Auto";

    const defaultMotion = settings.default_motion || creativeSlides[0]?.motion?.type || "none";
    const defaultTransition = settings.default_transition || creativeSlides[0]?.transition?.type || "fade";
    const firstVoiceSlide = creativeSlides.find((s) => s.voiceover?.voice_id || s.voiceover?.voice);
    const defaultVoiceId = settings.default_voice_id || firstVoiceSlide?.voiceover?.voice_id || creativeOptions.default_voice_id || "xVQH621DS3eyBYrseRt5";
    const defaultVoiceName = settings.default_voice || firstVoiceSlide?.voiceover?.voice || "Kate";
    $("creativeDefaultMotion").innerHTML = phase6OptionList(creativeOptions.motions || [], defaultMotion, { label: phase6MotionLabel });
    $("creativeDefaultTransition").innerHTML = phase6OptionList(creativeOptions.transitions || [], defaultTransition, { label: phase6TransitionLabel });
    $("creativeDefaultVoice").innerHTML = phase6VoiceOptionList(creativeOptions.voices || [], defaultVoiceId, defaultVoiceName);
    const voiceNote = creativeOptions.voice_catalog_live
      ? `${phase6NormalizeVoices(creativeOptions.voices || []).length} ElevenLabs voices available from your account.`
      : (creativeOptions.voice_catalog_configured ? "Live ElevenLabs lookup failed; Studio is using its cached voices." : "Add the ELEVENLABS_API_KEY Worker secret to load the full ElevenLabs account voice catalog.");
    $("creativeDefaultVoice").closest(".voice-select-wrap")?.querySelector(".voice-catalog-note")?.remove();
    $("creativeDefaultVoice").closest(".voice-select-wrap")?.insertAdjacentHTML("beforeend", `<div class="voice-catalog-note">${escapeHtml(voiceNote)}</div>`);

    const voiceover = Math.max(0, Math.min(125, Number(output.voiceover?.volume ?? 1) * 100));
    const normal = phase6Percent(output.music?.normal_volume, 100);
    const ducked = phase6Percent(output.music?.ducked_volume, 8);
    $("creativeVoiceoverVolume").value = phase6FormatPercent(voiceover);
    $("creativeVoiceoverVolumeRange").value = phase6FormatPercent(voiceover);
    $("creativeMusicNormal").value = normal;
    $("creativeMusicNormalRange").value = normal;
    $("creativeMusicDucked").value = ducked;
    $("creativeMusicDuckedRange").value = ducked;
    $("creativeDuckingEnabled").checked = output.music?.ducking_enabled !== false;
    $("creativeDuckFadeFrames").value = output.music?.duck_fade_frames ?? 6;
    $("creativeReviewNotes").value = output.review_notes || "";
    updateCreativeAudioSummary();
  }

  function phase6DriveFileId(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const direct = text.match(/\/d\/([^/?#]+)/);
    if (direct?.[1]) return direct[1];
    try {
      const url = new URL(text, window.location.origin);
      return url.searchParams.get("id") || null;
    } catch {
      return null;
    }
  }

  function phase6DriveEmbedUrl(fileId) {
    return fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview` : "";
  }

  function showCreativeRenderedPreview(output) {
    const video = $("creativeRenderPreview");
    const still = $("creativeRenderPreviewStill");
    const drive = $("creativeRenderPreviewDrive");
    const empty = $("creativeRenderPreviewEmpty");
    const heading = $("creativePreviewHeading");
    const copy = $("creativePreviewCopy");
    if (!video || !drive || !empty) return;

    video.pause();
    video.onerror = null;
    video.onloadedmetadata = null;
    video.removeAttribute("src");
    drive.removeAttribute("src");
    if (still) {
      still.removeAttribute("src");
      still.hidden = true;
    }
    video.hidden = true;
    drive.hidden = true;

    const storyOutput = creativeIsStoryTeaser(output);
    const videoKind = creativeSimpleVideoKind(output);
    if (heading && copy) {
      if (phase6IsNativeStillPreview(output)) {
        heading.textContent = "Photo preview";
        copy.textContent = "This output posts as native stills. Review the photo package below. There is no Remotion video.";
      } else if (creativeIsFinishedVideo(output)) {
        heading.textContent = videoKind === "short" ? "YouTube Short" : (videoKind === "reel" ? `${output?.platform || ""} Reel`.trim() : (videoKind === "slideshow" ? "Facebook Reel" : (videoKind === "tiktok" ? "TikTok video" : (storyOutput ? "Story" : "Finished video"))));
        copy.textContent = storyOutput
          ? "This is the video you uploaded. Stories do not use a profile grid cover."
          : "This is the video you uploaded. The 3D lettering is the grid cover only — it is not burned into the file.";
      } else if (storyOutput) {
        heading.textContent = "Story teaser";
        copy.textContent = "A 5-second 9:16 clip from the first photo, with a slight zoom and the selected music.";
      } else if (videoKind === "reel") {
        heading.textContent = "Instagram Reel";
        copy.textContent = "Play the rendered Reel, then change music under Audio if you want a new mix.";
      } else if (videoKind === "slideshow") {
        heading.textContent = "Facebook Reel";
        copy.textContent = "Play the rendered Reel, then change music under Audio if you want a new mix.";
      } else if (videoKind === "tiktok") {
        heading.textContent = "TikTok video";
        copy.textContent = "Play the rendered video. TikTok is saved as a draft after Approve.";
      } else if (videoKind === "short") {
        heading.textContent = "YouTube Short";
        copy.textContent = "Play the rendered Short, then change music under Audio if you want a new mix.";
      } else if (videoKind === "video") {
        heading.textContent = `${output?.platform || "Platform"} preview`;
        copy.textContent = "Play the render, then change music under Audio if you want a new mix.";
      } else {
        heading.textContent = "Rendered preview";
        copy.textContent = "Play the render, then change music under Audio if you want a new mix.";
      }
    }

    const stillUrl = phase6NativeStillUrl(output);
    if (!creativeIsFinishedVideo(output) && !storyOutput && (phase6IsNativeStillPreview(output) || (stillUrl && phase6PreviewLooksLikeImage(output?.studio_preview_url || stillUrl) && !output?.final_file_url && !output?.final_file_id))) {
      if (stillUrl && still) {
        still.alt = storyOutput ? "Story still preview" : "Native photo preview";
        still.src = stillUrl;
        still.hidden = false;
        empty.hidden = true;
        return;
      }
      empty.textContent = "Native photo route — review the stills below. No Remotion MP4.";
      empty.hidden = false;
      return;
    }

    const coverUrl = phase6CoverStillUrl(output);
    const showCoverStill = () => {
      if (!coverUrl || !still) return false;
      still.alt = "Output thumbnail";
      still.src = coverUrl;
      still.hidden = false;
      empty.hidden = true;
      video.hidden = true;
      drive.hidden = true;
      return true;
    };

    const fileId = output.final_file_id || phase6DriveFileId(output.final_file_url) || phase6DriveFileId(output.output_url);
    const publicVideo = [
      output.publish_asset_url,
      output.final_file_url,
      output.studio_preview_url,
    ].map((value) => String(value || "").trim()).find((href) => href && phase6UrlLooksPublicVideo(href)) || "";
    const directPreview = publicVideo;
    if (!fileId && !output.final_file_url && !directPreview && !output.studio_preview_url) {
      if (showCoverStill()) return;
      empty.textContent = String(output.render_status || "").toLowerCase().includes("native photo")
        ? "Native photo route — review the stills below. No Remotion MP4."
        : (String(output.render_status || "").toLowerCase().includes("render") || /story/i.test(String(output.studio_output_type || output.platform_output_type || ""))
          ? (/story/i.test(String(output.studio_output_type || output.platform_output_type || ""))
            ? "The 5-second Story teaser is still rendering. Open Review will show the zoom-and-music clip when the MP4 is ready."
            : "The video is still rendering. Open Review will unlock when the MP4 is ready.")
          : "No rendered preview is available yet.");
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const fallbackToDrive = () => {
      if (!creativeIsFinishedVideo(output) && showCoverStill()) return;
      const embed = phase6DriveEmbedUrl(fileId);
      if (!embed) {
        empty.textContent = "Rendered file exists, but no playable preview source is available.";
        empty.hidden = false;
        video.hidden = true;
        return;
      }
      video.pause();
      video.removeAttribute("src");
      video.hidden = true;
      drive.src = embed;
      drive.hidden = false;
    };

    const playableSrc = (() => {
      const stamp = output.studio_preview_updated_at || output.remotion_job_id || "";
      if (directPreview) {
        const sep = directPreview.includes("?") ? "&" : "?";
        return stamp ? `${directPreview}${sep}v=${encodeURIComponent(String(stamp))}` : directPreview;
      }
      return output.id ? `/api/outputs/${encodeURIComponent(output.id)}/preview` : "";
    })();
    if (playableSrc) {
      if (coverUrl && !creativeIsFinishedVideo(output)) video.setAttribute("poster", coverUrl);
      else video.removeAttribute("poster");
      video.src = playableSrc;
      video.hidden = false;
      video.onerror = fallbackToDrive;
      video.onloadedmetadata = () => {
        drive.removeAttribute("src");
        drive.hidden = true;
        video.hidden = false;
        if (creativeIsFinishedVideo(output)) syncCreativeStoryTeaserChrome(output);
      };
      video.load();
      return;
    }

    if (!creativeIsFinishedVideo(output) && showCoverStill()) return;
    fallbackToDrive();
  }

  function populateCreativeEditor(data) {
    activeCreativeOutput = data.output || null;
    creativeSlides = Array.isArray(data.slides) ? data.slides : [];
    creativeOptions = data.options || {};
    creativeTitleLock = data.title_lock || data.output?.creative_settings?.title_lock || null;
    const output = activeCreativeOutput || {};
    const titleLocked = Boolean(creativeTitleLock?.locked);
    $("creativeEditorTitle").textContent = `Output ${output.output_id ?? ""} · ${output.platform || "Creative review"}`;
    $("creativeEditorSubtitle").textContent = `${creativeIsFinishedVideo(output) ? "Uploaded video" : (output.platform_output_type || output.format || "Photo sequence")}${output.aspect_ratio ? ` · ${output.aspect_ratio}` : ""} · creative review`;
    $("creativeSafetyBadge").textContent = output.do_not_publish
      ? (titleLocked ? "Titles locked" : "Publishing locked")
      : (creativePublishSettled(output)
        ? "Published"
        : (creativeCanApproveForPublishing(output) ? "Ready to approve" : "Watch-only review"));
    $("creativeSafetyBadge").className = "badge ready-for-review";
    $("creativeSafetyBanner").innerHTML = !output.do_not_publish
      ? (creativeSimpleVideoKind(output) === "still"
        ? (creativePublishSettled(output)
          ? "<strong>Photo post.</strong> This still has no video mix. Studio is not rendering."
          : (creativeCanApproveForPublishing(output)
            ? "<strong>Final publish approval.</strong> Review the still, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft."
            : "<strong>Photo post.</strong> These photos publish as stills. There is no video mix to edit."))
        : (creativeIsFinishedVideo(output)
        ? (creativeCanApproveForPublishing(output)
          ? "<strong>Final publish approval.</strong> Play your uploaded video, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft. The 3D still is the grid cover only."
          : "<strong>Review the uploaded video.</strong> This file is already finished. There is no mix to rerender.")
        : (creativeMixInProgress(data.handoff || creativeHandoffStatus, output)
        ? "<strong>Rendering a new mix.</strong> This page will show Processing, then Ready when the new preview is available. Approve stays locked until then."
        : (creativeCanApproveForPublishing(output)
        ? (phase6IsNativeStillPreview(output)
          ? "<strong>Final publish approval.</strong> Review the still, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft."
          : (creativeSimpleVideoKind(output)
            ? "<strong>Final publish approval.</strong> Play the render, change music volume under Audio if you want, then Approve for publishing."
            : "<strong>Final publish approval.</strong> Adjust music and voiceover if needed, play the render, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft."))
        : "<strong>Review mix.</strong> Adjust music and voiceover, then Apply mix &amp; rerender. Play the new preview before approving."))))
      : titleLocked
        ? '<strong>Titles locked.</strong> The approved preview locked per-photo titles. Unlock titles to start a new version. Publishing stays locked.'
        : '<strong>Review mode.</strong> Edit, save, rerender, and approve the preview here. Approving locks per-photo titles. Publishing stays locked until the later publishing step.';

    showCreativeRenderedPreview(output);
    renderCreativeOutputMeta(output);
    renderCreativeTiktokComplete(output);
    populateCreativeGlobalControls(output);
    renderCreativeSlides();
    renderCreativeChangeProgress(data.handoff || creativeHandoffStatus);
    if (!data.handoff && !creativeHandoffStatus) phase6Message("");
    $("creativeEditorPanel").hidden = false;
    $("creativeEditorPanel").classList.toggle("title-edit-locked", titleLocked);
    $("creativeEditorPanel").classList.toggle("watch-only", !output.do_not_publish);
    syncCreativeStoryTeaserChrome(output);
    $("creativeEditorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    setCreativeBusy(false);
    refreshCreativeScheduleHint(output);
    if ($("creativeScheduleAt") && output.scheduled_post_date) {
      $("creativeScheduleAt").value = formatDateTimeLocalInput(output.scheduled_post_date);
      document.querySelectorAll("input[name='creativeScheduleMode']").forEach((radio) => {
        radio.checked = radio.value === "schedule";
      });
    }
    const finished = creativeIsFinishedVideo(output) || /ez-input=finished-/i.test(String(output.output_notes || ""));
    if ($("creativeRequestChanges")) $("creativeRequestChanges").hidden = finished;
    const watchOnly = !output.do_not_publish;
    $("saveCreativeEditor").disabled = watchOnly;
    if ($("creativeRequestChanges")) {
      $("creativeRequestChanges").textContent = watchOnly ? "Apply mix & rerender" : "Save & rerender preview";
      $("creativeRequestChanges").disabled = watchOnly ? creativeMixInProgress(data.handoff || creativeHandoffStatus, output) : false;
    }
    if ($("creativeAudioHelp")) {
      const kind = creativeSimpleVideoKind(output);
      $("creativeAudioHelp").textContent = kind && !creativeVoiceoverOn(output)
        ? "This output has no voiceover. Change music volume here, then Apply mix & rerender to hear it in a new preview."
        : (watchOnly
        ? "Voiceover and music volume apply on the next render. Submit the mix on this page; Processing becomes Ready when the new preview is available."
        : "100% voiceover is the current proven render level. A slide can optionally override it below. Changes apply to the next preview render; they do not alter the current video in-place.");
    }
    $("creativeApprovePreview").textContent = watchOnly ? "Approve for publishing" : "Approve preview";
    $("creativeApprovePreview").disabled = watchOnly
      ? (!creativeCanApproveForPublishing(output) || creativeMixInProgress(data.handoff || creativeHandoffStatus, output))
      : false;
    if ($("reloadCreativeEditor") && watchOnly) $("reloadCreativeEditor").disabled = !creativeEditorDirty;
    if ($("creativeUnlockTitles")) {
      $("creativeUnlockTitles").hidden = !titleLocked;
      $("creativeUnlockTitles").disabled = !output.do_not_publish || !titleLocked;
    }
    requestAnimationFrame(() => phase6MarkSaved());
  }

  async function openCreativeEditor(recordId) {
    if (activeCreativeOutputId && activeCreativeOutputId !== recordId && !phase6ConfirmDiscardUnsaved("open another output")) return;
    if (activeCreativeOutputId !== recordId) creativeSlideCollapsed.clear();
    activeCreativeOutputId = recordId;
    $("creativeEditorPanel").hidden = false;
    $("creativeEditorTitle").textContent = "Loading creative review…";
    $("creativeSlidesList").innerHTML = '<div class="empty">Loading creative directives…</div>';
    phase6Message("Loading saved creative values…");
    setCreativeBusy(true);
    try {
      const data = await api(`/api/outputs/${encodeURIComponent(recordId)}/creative`);
      populateCreativeEditor(data);
      const still = creativeSimpleVideoKind(data?.output) === "still";
      const handoff = still ? data?.handoff : (data?.handoff || await refreshCreativeChangeProgress());
      const resumable = !still && (Boolean(handoff?.active && !handoff?.completed && handoff?.overall_status !== "error")
        || creativeMixInProgress(handoff, data?.output));
      if (resumable) {
        continueCreativeHandoff({ handoff_state: handoff?.handoff_state || "render_prep_needed", handoff, message: handoff?.message || "Resuming the automatic voice/render handoff…" })
          .catch((e) => phase6Message(e.message, "error-text"));
      } else if (handoff?.message) {
        if (handoff.overall_status === "error") phase6Message(handoff.message, "error-text");
        else phase6Message("");
      }
    } catch (e) {
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
    }
  }

  function collectCreativePayload() {
    const slides = syncCreativeSlidesFromDom().map((slide, index) => ({
      id: slide.id,
      order: index + 1,
      include: slide.include !== false,
      duration_seconds: Number(slide.duration_seconds || 4),
      focal_point: slide.focal_point || "center",
      fit_mode: slide.fit_mode || "fill_crop",
      safe_area_aware: slide.safe_area_aware !== false,
      overlay: {
        enabled: slide.overlay?.enabled !== false,
        text: slide.overlay?.text || "",
        caption: slide.overlay?.caption || slide.overlay?.subtitle || "",
        subtitle: slide.overlay?.caption || slide.overlay?.subtitle || "",
        style_preset: slide.overlay?.style_preset || "Chicago Editorial",
        role: slide.overlay?.role || "overlay",
        position: slide.overlay?.position || phase6DefaultOverlayPosition(),
        size: Number(slide.overlay?.size || 64),
        start_fraction: Number(slide.overlay?.start_fraction ?? 0),
        end_fraction: Number(slide.overlay?.end_fraction ?? 1),
      },
      voiceover: {
        enabled: slide.voiceover?.enabled !== false,
        text: slide.voiceover?.text || "",
        voice_id: slide.voiceover?.voice_id || "",
        voice: slide.voiceover?.voice || "Kate",
        volume_override: slide.voiceover?.volume_override ?? null,
      },
      motion: { type: slide.motion?.type || "none" },
      transition: { type: slide.transition?.type || "fade", duration_frames: Number(slide.transition?.duration_frames ?? 12) },
    }));

    const normalPct = Math.max(0, Math.min(100, phase6NumberFromInput("creativeMusicNormal", 100)));
    const duckedPct = Math.max(0, Math.min(100, phase6NumberFromInput("creativeMusicDucked", 8)));
    const duckingEnabled = Boolean($("creativeDuckingEnabled").checked);
    if (duckingEnabled && duckedPct > normalPct) throw new Error("Music during narration cannot be louder than normal music while ducking is enabled.");

    return {
      audio: {
        voiceover_volume: Math.max(0, Math.min(125, phase6NumberFromInput("creativeVoiceoverVolume", 100))) / 100,
        normal_volume: normalPct / 100,
        ducked_volume: duckedPct / 100,
        ducking_enabled: duckingEnabled,
        duck_fade_frames: Math.round(phase6NumberFromInput("creativeDuckFadeFrames", 6)),
      },
      voiceover_tail_seconds: phase6NumberFromInput("creativeVoiceoverTail", 2),
      review_notes: $("creativeReviewNotes").value || "",
      creative_settings: {
        style_strategy: $("creativeStyleStrategy").value,
        default_slide_duration_seconds: phase6NumberFromInput("creativeDefaultDuration", 4),
        default_motion: $("creativeDefaultMotion").value,
        default_transition: $("creativeDefaultTransition").value,
        default_transition_frames: Math.round(phase6NumberFromInput("creativeDefaultTransitionFrames", 12)),
        default_voice_id: phase6SelectedVoice($("creativeDefaultVoice")).id,
        default_voice: phase6SelectedVoice($("creativeDefaultVoice")).name || "Kate",
        variant_policy: $("creativeVariantPolicy").value,
        opening_treatment: $("creativeOpeningTreatment").value,
        closing_treatment: $("creativeClosingTreatment").value,
      },
      slides,
    };
  }

  async function saveActiveCreative({ quiet = false } = {}) {
    if (!activeCreativeOutputId) throw new Error("Open an output before saving creative settings.");
    const payload = collectCreativePayload();
    setCreativeBusy(true);
    if (!quiet) phase6Message("Saving creative changes…");
    try {
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      activeCreativeOutput = result.record || activeCreativeOutput;
      creativeSlides = Array.isArray(result.slides) ? result.slides : creativeSlides;
      if (result.title_lock) creativeTitleLock = result.title_lock;
      if (!quiet) {
        populateCreativeEditor({ output: activeCreativeOutput, slides: creativeSlides, options: creativeOptions, handoff: creativeHandoffStatus });
        phase6Message("Draft saved. The rendered preview is unchanged until you choose Save & rerender preview.", "success");
        refreshCreativeChangeProgress().catch(() => {});
      } else {
        setCreativeBusy(false);
      }
      return result;
    } catch (e) {
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
      throw e;
    }
  }

  function phase6HandoffNeedsContinuation(state) {
    return ["voice_prep_running", "render_prep_needed", "render_ready", "render_start_pending", "rendering", "finalizing"].includes(String(state || ""));
  }

  async function continueCreativeHandoff(initialResult = null) {
    if (!activeCreativeOutputId) return;
    if (creativeSimpleVideoKind() === "still") return;
    const outputId = activeCreativeOutputId;
    const token = ++creativeHandoffPollToken;
    let state = initialResult?.handoff_state || "rendering";
    if (!phase6HandoffNeedsContinuation(state)) return;

    setCreativeBusy(true);
    phase6Message("");
    syncCreativeRenderBusyOverlay(initialResult?.handoff || {
      active: true,
      completed: false,
      overall_status: "active",
      current_stage_label: "Rendering",
    });

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (token !== creativeHandoffPollToken || activeCreativeOutputId !== outputId) return;
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 4000));
      try {
        const step = await api(`/api/outputs/${encodeURIComponent(outputId)}/creative/render/continue`, {
          method: "POST",
          body: "{}",
          timeoutMs: 30000,
        });
        state = step.handoff_state || state;
        if (step.handoff) renderCreativeChangeProgress(step.handoff);
        else await refreshCreativeChangeProgress().catch(() => null);

        if (state === "rendered_preview_ready" || step.completed || step?.handoff?.completed) {
          const refreshed = await api(`/api/outputs/${encodeURIComponent(outputId)}/creative`);
          if (token !== creativeHandoffPollToken || activeCreativeOutputId !== outputId) return;
          populateCreativeEditor(refreshed);
          renderCreativeChangeProgress(refreshed.handoff || step.handoff);
          phase6Message("");
          await loadOutputs();
          return;
        }

        if (["voice_prep_failed", "render_failed"].includes(state) || step.error || step?.handoff?.overall_status === "error") {
          const h = step.handoff || await refreshCreativeChangeProgress().catch(() => null);
          const errorMessage = h?.message || step.error || step.message || "Automatic preview rerender failed.";
          phase6Message(errorMessage, "error-text");
          setCreativeBusy(false);
          return;
        }

        const h = step.handoff || creativeHandoffStatus;
        if (h?.overall_status === "error") phase6Message(h?.message || step.message || "Studio needs attention.", "error-text");
        else phase6Message("");
      } catch (e) {
        if (token !== creativeHandoffPollToken) return;
        if (isTimeoutError(e)) {
          const h = await refreshCreativeChangeProgress().catch(() => null);
          if (h?.overall_status === "error") phase6Message(h?.message || "Studio needs attention.", "error-text");
          else phase6Message("");
        } else {
          const h = await refreshCreativeChangeProgress().catch(() => null);
          if (h?.overall_status === "error") phase6Message(h?.message || `Automatic handoff check failed: ${e.message}.`, "error-text");
          else phase6Message("");
        }
      }
    }

    if (token === creativeHandoffPollToken && activeCreativeOutputId === outputId) {
      const h = await refreshCreativeChangeProgress().catch(() => null);
      if (h?.overall_status === "error") phase6Message(h?.message || "The creative handoff needs attention.", "error-text");
      else phase6Message("");
      setCreativeBusy(false);
    }
  }

  async function unlockCreativeTitles() {
    if (!activeCreativeOutputId) return;
    if (!window.confirm("Unlock per-photo titles? Approval will no longer cover these titles until you save a new preview and approve again. Publishing stays locked.")) return;
    setCreativeBusy(true);
    phase6Message("Unlocking per-photo titles…");
    try {
      const payload = collectCreativePayload();
      payload.unlock_titles = true;
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      const refreshed = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`);
      populateCreativeEditor(refreshed);
      phase6Message(result.message || "Titles unlocked. Save a new preview before approving again.", "success");
    } catch (e) {
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
    }
  }

  function creativeIsNativePhotoPackage(output = activeCreativeOutput) {
    const platform = String(output?.platform || "").trim();
    const type = String(output?.studio_output_type || output?.platform_output_type || output?.format || "").trim();
    const render = String(output?.render_status || "").toLowerCase();
    if (render.includes("native photo")) return true;
    if (platform === "TikTok" && /multi-photo|slideshow|single photo/i.test(type)) return true;
    if (platform === "Instagram" && /carousel|single image|feed post/i.test(type) && !/story|reel/i.test(type)) return true;
    if (platform === "Facebook" && /multi-image\s*post|photo\s*set|single image|facebook post/i.test(type) && !/story|reel/i.test(type)) return true;
    return false;
  }

  function creativePublishSettled(output = activeCreativeOutput) {
    const status = String(output?.output_status || "").trim();
    const pub = String(output?.publish_status || "").trim();
    return status === "Published" || pub === "Published";
  }

  function creativeCanApproveForPublishing(output = activeCreativeOutput) {
    if (!output || output.do_not_publish) return false;
    const review = String(output.review_status || "").trim();
    const status = String(output.output_status || "").trim();
    if (review === "Approved" || status === "Approved for Publishing" || status === "Published") return false;
    if (String(output.publish_status || "").trim() === "Published") return false;
    const hasFile = Boolean(String(output.final_file_url || "").trim() || String(output.studio_preview_url || "").trim());
    if (!hasFile && !creativeIsNativePhotoPackage(output)) return false;
    if (!output.creative_available) return false;
    return status === "Ready for Review" || review === "Review Sent";
  }

  function pipelineApprovableOutputs(records = pipelineOutputs) {
    return (records || []).filter((record) => creativeCanApproveForPublishing(record));
  }

  function pipelineOutputLabel(record) {
    const id = record.output_id || record.id;
    const platform = record.platform || "Platform";
    const type = record.platform_output_type || record.studio_output_type || record.format || "output";
    return `${id} · ${platform} ${type}`.trim();
  }

  function collectCreativeSchedulePayload() {
    const mode = document.querySelector("input[name='creativeScheduleMode']:checked")?.value || "immediate";
    const raw = String($("creativeScheduleAt")?.value || "").trim();
    if (mode !== "schedule" || !raw) return { scheduled_post_date: "" };
    return { scheduled_post_date: new Date(raw).toISOString() };
  }

  function rememberPipelineScheduleDrafts() {
    document.querySelectorAll("[data-pipeline-schedule]").forEach((input) => {
      const id = input.dataset.pipelineSchedule;
      if (!id) return;
      pipelineScheduleDrafts.set(id, String(input.value || "").trim());
    });
    rememberPipelineTiktokUrlDrafts();
  }

  function rememberPipelineTiktokUrlDrafts() {
    document.querySelectorAll("[data-tiktok-complete] input[type=url]").forEach((input) => {
      const id = input.closest("[data-tiktok-complete]")?.dataset.tiktokComplete;
      if (!id) return;
      pipelineTiktokUrlDrafts.set(id, String(input.value || "").trim());
    });
  }

  function pipelineTiktokUrlDraft(record) {
    if (pipelineTiktokUrlDrafts.has(record.id)) return pipelineTiktokUrlDrafts.get(record.id);
    return tiktokLiveUrl(record);
  }

  function pipelineTiktokCompleteCell(record) {
    if (!tiktokNeedsUrlEntry(record)) return "";
    const current = pipelineTiktokUrlDraft(record);
    return `<form class="pipeline-tiktok-complete" data-tiktok-complete="${escapeHtml(record.id)}"><label><span>TikTok URL</span><input type="url" required placeholder="https://www.tiktok.com/@…/video/…" value="${escapeHtml(current)}" autocomplete="url"></label><button type="submit" class="secondary-button pipeline-tiktok-save">Save URL</button><span class="pipeline-tiktok-complete-msg" aria-live="polite"></span></form>`;
  }

  function bindPipelineTiktokComplete(root) {
    (root || document).querySelectorAll("[data-tiktok-complete]").forEach((form) => {
      const keepOnRow = (event) => event.stopPropagation();
      form.addEventListener("click", keepOnRow);
      form.addEventListener("mousedown", keepOnRow);
      form.addEventListener("pointerdown", keepOnRow);
      const input = form.querySelector("input[type=url]");
      input?.addEventListener("input", () => {
        const id = form.dataset.tiktokComplete;
        if (id) pipelineTiktokUrlDrafts.set(id, String(input.value || "").trim());
      });
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        event.stopPropagation();
        const id = form.dataset.tiktokComplete;
        const message = form.querySelector(".pipeline-tiktok-complete-msg");
        const button = form.querySelector("button[type=submit]");
        const record = (pipelineOutputs || []).find((row) => row.id === id);
        if (!id || !input) return;
        if (button) button.disabled = true;
        if (message) {
          message.classList.remove("error-text");
          message.textContent = "Saving…";
        }
        try {
          await submitTiktokComplete(id, { url: input.value, record });
          pipelineTiktokUrlDrafts.delete(id);
          if (message) message.textContent = "Saved";
          await refreshPipelineOutputs({ silent: true });
        } catch (error) {
          if (message) {
            message.textContent = error.message || "Could not save URL.";
            message.classList.add("error-text");
          }
        } finally {
          if (button) button.disabled = false;
        }
      });
    });
  }

  function pipelineScheduleInputValue(record) {
    if (pipelineScheduleDrafts.has(record.id)) return pipelineScheduleDrafts.get(record.id);
    return formatDateTimeLocalInput(record.scheduled_post_date);
  }

  function bindPipelineScheduleInputs(root) {
    (root || document).querySelectorAll("[data-pipeline-schedule]").forEach((input) => {
      const keepOnRow = (event) => event.stopPropagation();
      input.addEventListener("click", keepOnRow);
      input.addEventListener("mousedown", keepOnRow);
      input.addEventListener("pointerdown", keepOnRow);
      input.addEventListener("keydown", keepOnRow);
      input.addEventListener("change", () => {
        const id = input.dataset.pipelineSchedule;
        if (id) pipelineScheduleDrafts.set(id, String(input.value || "").trim());
      });
    });
  }

  function collectPipelineSchedules() {
    rememberPipelineScheduleDrafts();
    const map = {};
    pipelineScheduleDrafts.forEach((raw, id) => {
      map[id] = raw ? new Date(raw).toISOString() : "";
    });
    document.querySelectorAll("[data-pipeline-schedule]").forEach((input) => {
      const id = input.dataset.pipelineSchedule;
      const raw = String(input.value || "").trim();
      map[id] = raw ? new Date(raw).toISOString() : "";
    });
    return map;
  }

  const PIPELINE_DEFAULT_SCHEDULES_KEY = "studio.pipeline.useDefaultSchedules";

  function pipelineUseDefaultSchedules() {
    return Boolean($("pipelineUseDefaultSchedules")?.checked);
  }

  function persistPipelineUseDefaultSchedules() {
    const on = pipelineUseDefaultSchedules();
    try { window.sessionStorage.setItem(PIPELINE_DEFAULT_SCHEDULES_KEY, on ? "1" : "0"); } catch {}
    return on;
  }

  function restorePipelineUseDefaultSchedules() {
    const box = $("pipelineUseDefaultSchedules");
    if (!box) return;
    try {
      box.checked = window.sessionStorage.getItem(PIPELINE_DEFAULT_SCHEDULES_KEY) !== "0";
    } catch {
      box.checked = true;
    }
  }

  function pipelineRowHasSchedule(record) {
    if (!record?.id) return false;
    const input = document.querySelector(`[data-pipeline-schedule="${record.id}"]`);
    if (input) return Boolean(String(input.value || "").trim());
    if (pipelineScheduleDrafts.has(record.id)) return Boolean(String(pipelineScheduleDrafts.get(record.id) || "").trim());
    return Boolean(String(record.scheduled_post_date || "").trim());
  }

  const PIPELINE_SCHEDULE_GAP_MS = 90 * 60 * 1000;

  function pipelineRecordScheduleIso(record) {
    if (!record?.id) return "";
    const input = document.querySelector(`[data-pipeline-schedule="${record.id}"]`);
    const raw = input
      ? String(input.value || "").trim()
      : (pipelineScheduleDrafts.has(record.id)
        ? String(pipelineScheduleDrafts.get(record.id) || "").trim()
        : String(record.scheduled_post_date || "").trim());
    if (!raw) return "";
    const ms = Date.parse(raw);
    return Number.isNaN(ms) ? "" : new Date(ms).toISOString();
  }

  function pipelineOccupiedScheduleMs(platform, excludeId) {
    const key = String(platform || "").trim().toLowerCase();
    if (!key) return [];
    const taken = [];
    for (const record of pipelineOutputs || []) {
      if (!record?.id || record.id === excludeId) continue;
      if (String(record.platform || "").trim().toLowerCase() !== key) continue;
      if (record.do_not_publish) continue;
      const state = String(record.studio_state || record.publish_status || "");
      if (/published/i.test(state)) continue;
      const iso = pipelineRecordScheduleIso(record);
      const ms = iso ? Date.parse(iso) : NaN;
      if (!Number.isNaN(ms)) taken.push(ms);
    }
    return taken;
  }

  function nextOpenScheduleIso(candidateIso, occupiedMs, gapMs = PIPELINE_SCHEDULE_GAP_MS) {
    let ms = Date.parse(candidateIso);
    if (Number.isNaN(ms)) ms = Date.now();
    let guard = 0;
    while ((occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs) && guard < 36) {
      ms += gapMs;
      guard += 1;
    }
    return new Date(ms).toISOString();
  }

  async function applyDefaultSchedulesToReadyRows() {
    const ready = pipelineApprovableOutputs()
      .slice()
      .sort((a, b) => pipelineOutputNumber(a) - pipelineOutputNumber(b));
    const reserved = {};
    for (const record of pipelineOutputs || []) {
      const platform = String(record.platform || "").trim();
      const iso = pipelineRecordScheduleIso(record);
      if (!platform || !iso) continue;
      if (record.do_not_publish || /published/i.test(String(record.studio_state || record.publish_status || ""))) continue;
      (reserved[platform] ||= []).push(Date.parse(iso));
    }
    for (const record of ready) {
      if (pipelineRowHasSchedule(record)) continue;
      try {
        const data = await fetchBestTimesForOutput(record);
        const suggested = String(data?.suggested_iso || "").trim();
        if (!suggested) continue;
        const platform = String(record.platform || "").trim();
        const iso = nextOpenScheduleIso(suggested, reserved[platform] || []);
        const input = document.querySelector(`[data-pipeline-schedule="${record.id}"]`);
        if (input) applySuggestedIsoToScheduleInput(input, iso);
        else pipelineScheduleDrafts.set(record.id, formatDateTimeLocalInput(iso));
        (reserved[platform] ||= []).push(Date.parse(iso));
      } catch {}
    }
  }

  function staggerApproveAllSchedules(schedules, records) {
    const reserved = {};
    const approving = new Set((records || []).map((record) => record.id));
    for (const record of pipelineOutputs || []) {
      if (approving.has(record.id)) continue;
      const platform = String(record.platform || "").trim();
      const iso = pipelineRecordScheduleIso(record);
      if (!platform || !iso) continue;
      if (record.do_not_publish || /published/i.test(String(record.studio_state || record.publish_status || ""))) continue;
      (reserved[platform] ||= []).push(Date.parse(iso));
    }
    const next = { ...(schedules || {}) };
    const ordered = (records || []).slice().sort((a, b) => pipelineOutputNumber(a) - pipelineOutputNumber(b));
    for (const record of ordered) {
      const platform = String(record.platform || "").trim();
      const requested = next[record.id] || new Date().toISOString();
      const iso = nextOpenScheduleIso(requested, reserved[platform] || []);
      next[record.id] = iso;
      (reserved[platform] ||= []).push(Date.parse(iso));
      const input = document.querySelector(`[data-pipeline-schedule="${record.id}"]`);
      if (input) applySuggestedIsoToScheduleInput(input, iso);
    }
    return next;
  }

  const pipelineBestTimesCache = new Map();
  let creativeSuggestedIso = "";

  function formatBestTimesSuggestion(data) {
    const suggested = data?.suggested;
    if (!suggested || typeof suggested !== "object") return "";
    const days = Array.isArray(suggested.days) ? suggested.days.filter(Boolean) : [];
    const windows = Array.isArray(suggested.windows) ? suggested.windows.filter(Boolean) : [];
    if (!days.length || !windows.length) return "";
    const sourceLabel = data.source === "first_party"
      ? "your posts"
      : data.source === "similar_accounts"
        ? "similar accounts"
        : data.source === "learned_model" || data.source === "blended"
          ? "learned model"
          : "industry default";
    const similar = data?.similar;
    const similarDays = Array.isArray(similar?.days) ? similar.days.filter(Boolean) : [];
    const similarWindows = Array.isArray(similar?.windows) ? similar.windows.filter(Boolean) : [];
    const similarNote = similar?.label && data.source !== "similar_accounts" && similarDays.length && similarWindows.length
      ? ` Similar accounts: ${similarDays.join(", ")} · ${similarWindows.join(" or ")}.`
      : "";
    const captionNote = data?.caption?.label ? ` ${data.caption.label}.` : "";
    return `Suggested: ${days.join(", ")} · ${windows.join(" or ")} (${data.season_label || studioInsightsSeasonLabel(studioInsightsSeason())} · ${sourceLabel}).${similarNote}${captionNote} Now stays selected unless you pick a time.`;
  }

  async function fetchBestTimesForOutput(record) {
    const platform = String(record?.platform || "").trim();
    const outputType = String(record?.platform_output_type || record?.studio_output_type || "").trim();
    const season = studioInsightsSeason();
    const key = `${selectedProfileId || ""}|${platform}|${outputType}|${season}`;
    if (pipelineBestTimesCache.has(key)) return pipelineBestTimesCache.get(key);
    const pending = api(
      `/api/insights/best-times?platform=${encodeURIComponent(platform)}&output_type=${encodeURIComponent(outputType)}&season=${encodeURIComponent(season)}`,
      { timeoutMs: 12000, retries: 1 }
    )
      .then((data) => {
        pipelineBestTimesCache.set(key, data);
        return data;
      })
      .catch((error) => {
        pipelineBestTimesCache.delete(key);
        throw error;
      });
    pipelineBestTimesCache.set(key, pending);
    return pending;
  }

  function applySuggestedIsoToScheduleInput(input, iso) {
    if (!input || !iso) return false;
    const local = formatDateTimeLocalInput(iso);
    if (!local) return false;
    input.value = local;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }

  async function refreshCreativeScheduleHint(record) {
    const hint = $("creativeScheduleSuggest");
    const useButton = $("creativeUseSuggestedTime");
    if (!hint) return;
    creativeSuggestedIso = "";
    if (useButton) useButton.hidden = true;
    hint.textContent = "Loading suggested publish time…";
    try {
      const data = await fetchBestTimesForOutput(record);
      const text = formatBestTimesSuggestion(data);
      creativeSuggestedIso = String(data?.suggested_iso || "").trim();
      hint.textContent = text || String(data?.note || "No suggested time available yet.");
      if (useButton) useButton.hidden = !creativeSuggestedIso;
    } catch (error) {
      hint.textContent = error?.message
        ? `Could not load suggested time (${error.message}).`
        : "Could not load suggested time.";
    }
  }

  async function refreshPipelineScheduleSuggestions(records) {
    const ready = (Array.isArray(records) ? records : []).filter((record) =>
      /ready for review/i.test(String(record?.studio_state || record?.output_status || record?.review_status || ""))
    );
    const byId = new Map(ready.map((record) => [record.id, record]));
    const nodes = Array.from(document.querySelectorAll("[data-pipeline-schedule-suggest]"));
    await Promise.all(nodes.map(async (suggestEl) => {
      const id = suggestEl.getAttribute("data-pipeline-schedule-suggest");
      const record = byId.get(id);
      if (!record) return;
      const useBtn = document.querySelector(`[data-pipeline-use-suggested="${id}"]`);
      suggestEl.hidden = false;
      suggestEl.textContent = "Loading suggestion…";
      if (useBtn) useBtn.hidden = true;
      try {
        const data = await fetchBestTimesForOutput(record);
        const text = formatBestTimesSuggestion(data);
        const iso = String(data?.suggested_iso || "").trim();
        suggestEl.textContent = text || String(data?.note || "No suggestion yet.");
        suggestEl.dataset.suggestedIso = iso;
        if (useBtn) {
          useBtn.hidden = !iso;
          useBtn.dataset.suggestedIso = iso;
        }
        if (pipelineUseDefaultSchedules() && iso && !pipelineRowHasSchedule(record)) {
          const input = document.querySelector(`[data-pipeline-schedule="${id}"]`);
          const openIso = nextOpenScheduleIso(iso, pipelineOccupiedScheduleMs(record.platform, record.id));
          applySuggestedIsoToScheduleInput(input, openIso);
        }
      } catch (error) {
        suggestEl.textContent = error?.message ? `Suggestion unavailable (${error.message}).` : "Suggestion unavailable.";
      }
    }));
  }

  function updatePipelineApproveAllButton() {
    const button = $("pipelineApproveAll");
    if (!button) return;
    const ready = pipelineApprovableOutputs();
    const count = ready.length;
    button.disabled = !count || button.dataset.busy === "true";
    button.textContent = count ? `Approve All (${count})` : "Approve All";
  }

  async function approveAllPipelineOutputs() {
    const button = $("pipelineApproveAll");
    const ready = pipelineApprovableOutputs();
    if (!ready.length) return;
    if (pipelineUseDefaultSchedules()) {
      setPipelineLiveHint("Applying default schedules…");
      await applyDefaultSchedulesToReadyRows();
    }
    const schedules = staggerApproveAllSchedules(collectPipelineSchedules(), ready);
    const list = ready.map((record) => {
      const iso = schedules[record.id];
      const when = iso ? formatStudioDateTime(iso) : "now";
      return `• ${pipelineOutputLabel(record)} — ${when}`;
    }).join("\n");
    const scheduleNote = pipelineUseDefaultSchedules()
      ? "Default schedules fill empty times. Same-platform posts stay at least 90 minutes apart. A time already on a row is kept unless it clashes.\n\n"
      : "Empty times publish now. Same-platform posts still stay at least 90 minutes apart.\n\n";
    const confirmed = window.confirm(
      `Approve ${ready.length} output${ready.length === 1 ? "" : "s"} for publishing?\n\n${scheduleNote}Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft.\n\n${list}`
    );
    if (!confirmed) return;
    try {
      if (button) {
        button.dataset.busy = "true";
        button.disabled = true;
        button.textContent = "Approving…";
      }
      setPipelineLiveHint("Approving all ready outputs…");
      const result = await api("/api/outputs/approve-all", {
        method: "POST",
        body: JSON.stringify({ notes: "Studio Pipeline Approve All", schedules }),
        timeoutMs: 120000,
      });
      pipelineScheduleDrafts.clear();
      pipelineTiktokUrlDrafts.clear();
      await refreshPipelineOutputs({ silent: true });
      const approved = Number(result.approved_count || 0);
      const failed = Number(result.failed_count || 0);
      if (failed) {
        setPipelineLiveHint(result.message || `Approved ${approved}, ${failed} failed`);
      } else if (result.dispatch_deferred) {
        setPipelineLiveHint(result.message || `Approved ${approved}. Publishers start from the approved queue.`);
      } else {
        setPipelineLiveHint(result.message || `Approved ${approved} output${approved === 1 ? "" : "s"}`);
      }
    } catch (e) {
      setPipelineLiveHint(e.message || "Approve All failed");
    } finally {
      if (button) {
        button.dataset.busy = "false";
        updatePipelineApproveAllButton();
      }
    }
  }

  async function reviewActiveCreative(action) {
    if (!activeCreativeOutputId) return;
    try {
      if (!creativeWatchOnly() || action === "changes_requested" || action === "apply_audio_mix") await saveActiveCreative({ quiet: true });
      const publishing = action === "approve_for_publishing" || (action === "approve" && creativeWatchOnly());
      phase6Message(publishing ? "Saving publish approval…" : (action === "approve" ? "Saving review approval…" : "Applying mix and starting render…"));
      setCreativeBusy(true);
      const reviewBody = { action, notes: $("creativeReviewNotes").value || "", ...collectCreativeSchedulePayload() };
      if (action === "apply_audio_mix" || action === "changes_requested") {
        const collected = collectCreativePayload();
        reviewBody.audio = collected.audio;
        reviewBody.notes = collected.review_notes || reviewBody.notes;
      }
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative/review`, {
        method: "POST",
        body: JSON.stringify(reviewBody),
        timeoutMs: publishing ? 45000 : 30000,
        retries: 1,
      });
      const refreshed = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`);
      populateCreativeEditor(refreshed);
      renderCreativeChangeProgress(refreshed.handoff || result.handoff || creativeHandoffStatus);
      if (publishing && result.message) phase6Message(result.message, "success");
      else if (refreshed?.handoff?.overall_status === "error") phase6Message(refreshed.handoff.message || result.message || "Review state needs attention.", "error-text");
      else phase6Message("");
      await loadOutputs();
      if (action !== "approve" && action !== "approve_for_publishing" && phase6HandoffNeedsContinuation(result.handoff_state)) {
        continueCreativeHandoff(result).catch((e) => phase6Message(e.message, "error-text"));
      }
    } catch (e) {
      if (action !== "approve" && action !== "approve_for_publishing" && isTimeoutError(e) && activeCreativeOutputId) {
        phase6Message("The save/review request is still being processed. Studio is resuming the handoff automatically…", "success");
        continueCreativeHandoff({ handoff_state: "voice_prep_running", message: "Resuming after a slow save/review response…" })
          .catch((err) => phase6Message(err.message, "error-text"));
        return;
      }
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
    }
  }


  function pipelineFilterLabel(filter = pipelineViewFilter) {
    if (filter === "active") return "Active outputs";
    if (filter === "attention") return "Needs attention";
    if (filter === "published") return "Published";
    return "All outputs";
  }

  function pipelineRecordMatchesFilter(record, filter = pipelineViewFilter) {
    const state = String(record?.studio_state || "");
    if (!filter || filter === "all") return true;
    if (filter === "published") return state === "Published";
    if (filter === "attention") return ["Failed", "Retry Pending", "Manual Action Required"].includes(state);
    if (filter === "active") return !["Published", "Skipped", "Failed"].includes(state);
    return true;
  }

  function filteredPipelineRecords(records) {
    return (records || []).filter((record) => pipelineRecordMatchesFilter(record));
  }

  function updatePipelineFilterBar(visibleCount = 0) {
    const bar = $("pipelineFilterBar");
    const label = $("pipelineFilterLabel");
    if (!bar) return;
    if (!pipelineViewFilter || pipelineViewFilter === "all") {
      bar.hidden = true;
      return;
    }
    bar.hidden = false;
    if (label) label.textContent = `Showing ${pipelineFilterLabel()} · ${visibleCount}`;
  }

  function maybeOpenFilteredPipelineOutput() {
    if (!pipelineOpenSingleOnLoad) return;
    pipelineOpenSingleOnLoad = false;
    const openable = filteredPipelineRecords(pipelineOutputs).filter((record) => record.creative_available);
    if (openable.length === 1) openCreativeEditor(openable[0].id);
  }

  function pipelineOutputNumber(record) {
    const n = Number(String(record?.output_id || "").replace(/\D/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  function pipelineContentGroupKey(record) {
    const links = Array.isArray(record?.content_item_links) ? record.content_item_links : [];
    return String(links[0] || record?.content_item_id || "").trim() || "unassigned";
  }

  function pipelineContentGroupLabel(records) {
    const first = records[0] || {};
    const title = String(first.output_title || first.content_title || "").trim();
    const count = records.length;
    const suffix = `${count} output${count === 1 ? "" : "s"}`;
    const dest = pipelineDestinationProgress(records);
    const destHint = dest ? ` · ${dest.done}/${dest.total} rendered` : "";
    if (title) return `${title} · ${suffix}${destHint}`;
    if (pipelineContentGroupKey(first) === "unassigned") return `Unassigned · ${suffix}${destHint}`;
    return `Content piece · ${suffix}${destHint}`;
  }

  function groupedPipelineRecords(records) {
    const groups = [];
    const index = new Map();
    for (const record of records || []) {
      const key = pipelineContentGroupKey(record);
      if (!index.has(key)) {
        const group = { key, records: [] };
        index.set(key, group);
        groups.push(group);
      }
      index.get(key).records.push(record);
    }
    for (const group of groups) group.records = sortedPipelineRecords(group.records);
    groups.sort((a, b) => Math.max(...b.records.map(pipelineOutputNumber)) - Math.max(...a.records.map(pipelineOutputNumber)));
    return groups;
  }

  function isPipelineGroupExpanded(key, isNewest) {
    if (pipelineGroupOpen.has(key)) return pipelineGroupOpen.get(key);
    return Boolean(isNewest);
  }

  function pipelineSortValue(record, key) {
    if (key === "output") return String(record.output_id || "");
    if (key === "platform") return String(record.platform || "");
    if (key === "type") return `${record.platform_output_type || record.format || ""} ${record.aspect_ratio || ""}`.trim();
    if (key === "state") return String(pipelineStudioStateLabel(record) || record.studio_state || "");
    if (key === "render") return String(record.render_status || "");
    if (key === "review") return String(record.review_status || "");
    if (key === "publish") return String(record.platform_publish_status || record.publish_status || "");
    if (key === "progress") {
      const dest = pipelineDestinationProgress(
        (pipelineOutputs || []).filter((row) => pipelineContentGroupKey(row) === pipelineContentGroupKey(record))
      );
      if (dest && pipelineOutputRenderInFlight(record)) return dest.percent;
      const pct = pipelineDisplayPercent(record);
      return Number.isFinite(Number(pct)) ? Number(pct) : -1;
    }
    return "";
  }

  function comparePipelineRows(a, b, key) {
    if (key === "output") {
      const na = pipelineOutputNumber(a);
      const nb = pipelineOutputNumber(b);
      if (na !== nb) return na - nb;
    }
    if (key === "progress") return pipelineSortValue(a, key) - pipelineSortValue(b, key);
    return String(pipelineSortValue(a, key)).localeCompare(String(pipelineSortValue(b, key)), undefined, {
      numeric: true,
      sensitivity: "base",
    });
  }

  function sortedPipelineRecords(records) {
    const dir = pipelineSort.dir === "desc" ? -1 : 1;
    const key = pipelineSort.key || "output";
    return [...records].sort((a, b) => {
      const primary = comparePipelineRows(a, b, key);
      if (primary) return dir * primary;
      return dir * comparePipelineRows(a, b, "output");
    });
  }

  function pipelineSortHeader(key, label) {
    const active = pipelineSort.key === key;
    const arrow = !active ? "↕" : pipelineSort.dir === "asc" ? "↑" : "↓";
    return `<th><button type="button" class="pipeline-sort${active ? " is-active" : ""}" data-pipeline-sort="${escapeHtml(key)}" aria-pressed="${active ? "true" : "false"}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button></th>`;
  }

  function renderOutputsTable(target, records) {
    phase6HideTooltip();
    const isPipeline = target?.id === "outputsList";
    const isDashboard = target?.id === "recentOutputs";
    const source = isPipeline ? filteredPipelineRecords(records) : records;
    if (isPipeline) updatePipelineFilterBar(source.length);
    if (!source.length) {
      target.innerHTML = isPipeline && pipelineViewFilter && pipelineViewFilter !== "all"
        ? `<div class="empty">No ${escapeHtml(pipelineFilterLabel().toLowerCase())} right now.</div>`
        : '<div class="empty">No Platform Output records were returned.</div>';
      return;
    }
    const sortedSource = isDashboard ? sortedPipelineRecords(source) : source;
    const pipelineRow = (r, groupRecords) => {
      const postLink = r.platform_post_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(r.platform_post_url)}">Open post ↗</a>` : "";
      const timing = studioOutputTimingLabel(r);
      const typeCell = isPipeline ? `<td><div>${value(r.platform_output_type || r.format)}</div><div class="subtle">${value(r.aspect_ratio)}</div></td>` : "";
      const canOpen = Boolean(r.creative_available);
      const blocked = ["blocked", "escalated"].includes(String(r.studio_production_job?.step || "")) || Boolean(r.studio_job_error);
      const notReadyLabel = String(r.studio_production_job?.step || "") === "escalated"
        ? "Escalated"
        : blocked
          ? "Blocked"
          : "Not ready yet";
      const notReadyTitle = escapeHtml(String(r.studio_job_error || r.studio_job_label || PHASE6_BUTTON_HELP["Not ready yet"]));
      const ready = /ready for review/i.test(String(r.studio_state || r.output_status || r.review_status || ""));
      const scheduleValue = pipelineScheduleInputValue(r);
      const scheduleCell = isPipeline && ready
        ? `<div class="subtle pipeline-schedule-cell">Time <input type="datetime-local" data-pipeline-schedule="${escapeHtml(r.id)}" value="${escapeHtml(scheduleValue)}" title="Leave empty to publish now"> ${scheduleValue ? "" : "Now"}<div class="pipeline-schedule-suggest" data-pipeline-schedule-suggest="${escapeHtml(r.id)}"></div><button type="button" class="text-button" data-pipeline-use-suggested="${escapeHtml(r.id)}" hidden>Use suggested</button></div>`
        : "";
      const creativeCell = isPipeline ? `<td class="creative-output-action-cell"><button type="button" class="creative-button" data-creative-output-id="${escapeHtml(r.id)}" ${canOpen ? "" : "disabled"} title="${canOpen ? "" : notReadyTitle}">${canOpen ? "Open review" : notReadyLabel}</button>${scheduleCell}</td>` : "";
      const rowOpen = isPipeline && canOpen ? ` class="pipeline-open-row" data-open-output-id="${escapeHtml(r.id)}" tabindex="0"` : "";
      const subtleParts = [r.publish_method, timing].filter(Boolean).map((part) => escapeHtml(String(part)));
      return `<tr${rowOpen}><td><div class="title-cell">Output ${value(r.output_id)}</div><div class="subtle">${subtleParts.join(" · ") || "—"}</div>${postLink}</td><td>${value(r.platform)}</td>${typeCell}<td>${badge(pipelineStudioStateLabel(r))}${isPipeline ? pipelineTiktokCompleteCell(r) : ""}</td><td>${value(pipelineRenderLabel(r))}</td><td>${value(r.review_status)}</td><td>${value(r.platform_publish_status || r.publish_status)}</td><td>${pipelineProgressCell(r, groupRecords)}</td>${creativeCell}</tr>`;
    };
    const body = isPipeline
      ? groupedPipelineRecords(source).map((group, index) => {
          const newest = index === 0;
          const open = isPipelineGroupExpanded(group.key, newest);
          const label = pipelineContentGroupLabel(group.records);
          const header = `<tr class="pipeline-group-row"><td colspan="9"><button type="button" class="pipeline-group-toggle" data-pipeline-group-toggle="${escapeHtml(group.key)}" aria-expanded="${open ? "true" : "false"}"><span class="pipeline-group-chevron" aria-hidden="true">${open ? "▾" : "▸"}</span><span class="pipeline-group-title">${escapeHtml(label)}</span></button></td></tr>`;
          return `<tbody class="pipeline-output-group${open ? "" : " is-collapsed"}" data-pipeline-group="${escapeHtml(group.key)}">${header}${group.records.map((row) => pipelineRow(row, group.records)).join("")}</tbody>`;
        }).join("")
      : `<tbody>${sortedSource.map((row) => pipelineRow(row, sortedSource.filter((peer) => pipelineContentGroupKey(peer) === pipelineContentGroupKey(row)))).join("")}</tbody>`;
    const head = isPipeline
      ? `<tr>${pipelineSortHeader("output", "Output")}${pipelineSortHeader("platform", "Platform")}${pipelineSortHeader("type", "Type / ratio")}${pipelineSortHeader("state", "Studio state")}${pipelineSortHeader("render", "Render")}${pipelineSortHeader("review", "Review")}${pipelineSortHeader("publish", "Publish")}${pipelineSortHeader("progress", "Progress")}<th>Creative</th></tr>`
      : isDashboard
      ? `<tr>${pipelineSortHeader("output", "Output")}${pipelineSortHeader("platform", "Platform")}${pipelineSortHeader("state", "Studio state")}${pipelineSortHeader("render", "Render")}${pipelineSortHeader("review", "Review")}${pipelineSortHeader("publish", "Publish")}${pipelineSortHeader("progress", "Progress")}</tr>`
      : `<tr><th>Output</th><th>Platform</th><th>Studio state</th><th>Render</th><th>Review</th><th>Publish</th><th>Progress</th></tr>`;
    rememberPipelineScheduleDrafts();
    const tableClass = isDashboard ? "data-table dashboard-output-table" : "data-table";
    target.innerHTML = `<table class="${tableClass}"><thead>${head}</thead>${body}</table>`;
    if (isPipeline || isDashboard) {
      target.querySelectorAll("[data-pipeline-sort]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const key = button.dataset.pipelineSort;
          if (pipelineSort.key === key) {
            pipelineSort.dir = pipelineSort.dir === "asc" ? "desc" : "asc";
          } else {
            pipelineSort.key = key;
            pipelineSort.dir = key === "output" || key === "progress" ? "desc" : "asc";
          }
          if (isPipeline) renderOutputsTable(target, pipelineOutputs);
          else renderDashboardPanel();
        });
      });
    }
    if (isPipeline) {
      target.querySelectorAll("[data-pipeline-group-toggle]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const key = button.dataset.pipelineGroupToggle;
          const groupBody = button.closest("tbody");
          if (!groupBody || !key) return;
          const open = !groupBody.classList.contains("is-collapsed");
          pipelineGroupOpen.set(key, !open);
          groupBody.classList.toggle("is-collapsed", open);
          button.setAttribute("aria-expanded", open ? "false" : "true");
          const chevron = button.querySelector(".pipeline-group-chevron");
          if (chevron) chevron.textContent = open ? "▸" : "▾";
        });
      });
      target.querySelectorAll("[data-creative-output-id]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openCreativeEditor(button.dataset.creativeOutputId);
        });
      });
      bindPipelineScheduleInputs(target);
      bindPipelineTiktokComplete(target);
      target.querySelectorAll("[data-pipeline-use-suggested]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          const id = button.dataset.pipelineUseSuggested;
          const iso = button.dataset.suggestedIso || "";
          const record = (pipelineOutputs || []).find((row) => row.id === id);
          const input = target.querySelector(`[data-pipeline-schedule="${id}"]`);
          const openIso = nextOpenScheduleIso(iso, pipelineOccupiedScheduleMs(record?.platform, id));
          applySuggestedIsoToScheduleInput(input, openIso);
        });
      });
      refreshPipelineScheduleSuggestions(source);
      target.querySelectorAll("[data-open-output-id]").forEach((row) => {
        row.addEventListener("click", (event) => {
          if (event.target.closest("a, button, input, select, textarea, label, .pipeline-schedule-cell, .pipeline-tiktok-complete")) return;
          openCreativeEditor(row.dataset.openOutputId);
        });
        row.addEventListener("keydown", (event) => {
          if (event.target.closest("input, select, textarea")) return;
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openCreativeEditor(row.dataset.openOutputId);
        });
      });
      phase6DecorateTooltips(target);
    }
  }

  function pipelinePageActive() {
    return Boolean($("page-outputs")?.classList.contains("active"));
  }

  function pipelineFingerprint(records) {
    return JSON.stringify((records || []).map((r) => [
      r.id,
      r.studio_state,
      r.render_status,
      r.review_status,
      r.platform_publish_status || r.publish_status,
      pipelineDisplayPercent(r),
      pipelineOutputRenderComplete(r),
      r.creative_available,
      r.final_file_url,
      r.studio_preview_url,
      r.platform_post_url,
      r.tiktok_draft_status,
      r.manual_completion_status,
    ]));
  }

  function setPipelineLiveHint(text) {
    const hint = $("pipelineLiveHint");
    if (hint) hint.textContent = text;
  }

  function stopPipelinePoll() {
    if (pipelinePollTimer) {
      clearTimeout(pipelinePollTimer);
      pipelinePollTimer = null;
    }
    if (pipelineCountdownTimer) {
      clearInterval(pipelineCountdownTimer);
      pipelineCountdownTimer = null;
    }
    pipelineNextRefreshAt = 0;
    if ($("pipelineLiveHint") && !pipelinePageActive()) setPipelineLiveHint("Open Pipeline to watch live updates");
  }

  function updatePipelineCountdownHint() {
    if (!pipelinePageActive() || document.hidden || !pipelineNextRefreshAt) return;
    const remainingMs = pipelineNextRefreshAt - Date.now();
    if (remainingMs <= 0) {
      setPipelineLiveHint("Live · refreshing…");
      return;
    }
    const seconds = Math.max(1, Math.ceil(remainingMs / 1000));
    setPipelineLiveHint(`Live · refreshing in ${seconds} second${seconds === 1 ? "" : "s"}`);
  }

  function schedulePipelinePoll() {
    stopPipelinePoll();
    if (!pipelinePageActive() || document.hidden) {
      if (pipelinePageActive() && document.hidden) setPipelineLiveHint("Paused while this tab is in the background");
      return;
    }
    pipelineNextRefreshAt = Date.now() + PIPELINE_POLL_MS;
    updatePipelineCountdownHint();
    pipelineCountdownTimer = setInterval(updatePipelineCountdownHint, 250);
    pipelinePollTimer = setTimeout(() => {
      pipelinePollTimer = null;
      if (pipelineCountdownTimer) {
        clearInterval(pipelineCountdownTimer);
        pipelineCountdownTimer = null;
      }
      pipelineNextRefreshAt = 0;
      setPipelineLiveHint("Live · refreshing…");
      refreshPipelineOutputs({ silent: true }).finally(schedulePipelinePoll);
    }, PIPELINE_POLL_MS);
  }

  async function refreshPipelineOutputs({ silent = false } = {}) {
    const target = $("outputsList");
    if (!target) return;
    if (silent && pipelinePollInFlight) return;
    pipelinePollInFlight = true;
    if (!silent) {
      target.innerHTML = '<div class="empty">Loading outputs…</div>';
      setPipelineLiveHint("Refreshing…");
    }
    try {
      const { records = [] } = await api("/api/outputs?limit=100");
      const unchanged = silent && target.querySelector("table") && pipelineFingerprint(records) === pipelineFingerprint(pipelineOutputs);
      pipelineOutputs = records;
      updatePipelineApproveAllButton();
      if (!unchanged) {
        const scrollTop = target.scrollTop;
        renderOutputsTable(target, records);
        target.scrollTop = scrollTop;
      }
      maybeOpenFilteredPipelineOutput();
      if (pipelinePageActive() && !document.hidden && !pipelineCountdownTimer) setPipelineLiveHint("Live · refreshed just now");
    } catch (e) {
      if (!silent) target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      else setPipelineLiveHint("Live update failed · retrying");
    } finally {
      pipelinePollInFlight = false;
    }
  }

  async function loadOutputs() {
    await refreshPipelineOutputs({ silent: false });
    schedulePipelinePoll();
  }

  function setMusicUploadMessage(text, className = "") {
    const node = $("musicUploadMessage");
    if (!node) return;
    node.textContent = text || "";
    node.className = `form-message ${className}`.trim();
  }

  function invalidateMusicCatalog() {
    productionRequestMusic = [];
  }

  async function setMusicFavorite(recordId, favorite) {
    const result = await api(`/api/music/${encodeURIComponent(recordId)}/favorite`, {
      method: "PATCH",
      body: JSON.stringify({ favorite }),
    });
    const updated = result.record;
    if (updated?.id) {
      const next = productionRequestMusic.some((track) => track.id === updated.id)
        ? productionRequestMusic.map((track) => (track.id === updated.id ? { ...track, ...updated } : track))
        : [...productionRequestMusic, updated];
      productionRequestMusic = sortClientMusic(next.filter((track) => !track.do_not_use));
      fillMusicDropdowns();
    }
    return updated;
  }

  function bindMusicPlayers(target) {
    const players = Array.from(target.querySelectorAll("audio.music-preview"));
    players.forEach((player) => player.load());
    players.forEach((player) => player.addEventListener("play", () => {
      players.forEach((other) => { if (other !== player) other.pause(); });
    }));
  }

  async function loadMusic() {
    const target = $("musicList");
    target.innerHTML = '<div class="empty">Loading music library…</div>';
    try {
      const { records = [] } = await api("/api/music?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty">No Music assets were returned.</div>';
      const sorted = sortClientMusic(records);
      productionRequestMusic = sorted.filter((record) => !record.do_not_use);
      fillMusicDropdowns();
      target.innerHTML = sorted.map((r) => {
        const preview = r.preview_url || r.google_drive_url;
        const sizeLabel = r.file_size_mb ? `${value(r.file_size_mb)} MB` : (r.file_extension || "mp3");
        const favored = Boolean(r.favorite);
        return `<article class="music-card${favored ? " is-favorite" : ""}"><div class="music-card-head"><h3>${value(r.display_name || r.name)}</h3><button type="button" class="music-favorite-button" data-music-favorite="${escapeHtml(r.id)}" data-favorite="${favored ? "true" : "false"}" aria-pressed="${favored ? "true" : "false"}" aria-label="${favored ? "Remove from favorites" : "Add to favorites"}">${favored ? "★" : "☆"}</button></div>${r.display_name && r.display_name !== r.name ? `<div class="raw-filename">${value(r.name)}</div>` : ""}<div class="music-meta">${value(r.mime_type || "audio/mpeg")} · ${sizeLabel} · ${value(r.rights_status)}</div><div class="subtle">${value(r.description, "No description yet")}</div>${preview ? `<audio class="music-preview" controls preload="metadata" src="${escapeHtml(preview)}"></audio>` : `<div class="subtle">No preview URL available.</div>`}<div class="music-actions">${r.google_drive_url && !r.studio_uploaded ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.google_drive_url)}">Open source</a>` : (r.studio_uploaded ? `<span class="badge ready-for-review">Studio upload</span>` : "")}<span class="badge ${r.do_not_use ? "failed" : "published"}">${r.do_not_use ? "Do not use" : "Available"}</span><button type="button" class="text-button music-delete-button" data-music-delete="${escapeHtml(r.id)}" data-music-name="${escapeHtml(r.display_name || r.name || "this track")}">Delete</button></div></article>`;
      }).join("");
      bindMusicPlayers(target);
      target.querySelectorAll("[data-music-favorite]").forEach((button) => {
        button.addEventListener("click", async () => {
          const id = button.dataset.musicFavorite;
          const next = button.dataset.favorite !== "true";
          button.disabled = true;
          try {
            await setMusicFavorite(id, next);
            await loadMusic();
          } catch (error) {
            setMusicUploadMessage(error.message, "error-text");
            button.disabled = false;
          }
        });
      });
      target.querySelectorAll("[data-music-delete]").forEach((button) => {
        button.addEventListener("click", async () => {
          const id = button.dataset.musicDelete;
          const name = button.dataset.musicName || "this track";
          if (!window.confirm(`Delete “${name}” from the music library and Google Drive?\n\nThis is permanent. If a Production Request or Content Item still has this track selected, Studio will refuse and you should unpick it first.`)) {
            return;
          }
          button.disabled = true;
          try {
            await api(`/api/music/${encodeURIComponent(id)}`, {
              method: "DELETE",
              body: JSON.stringify({}),
            });
            invalidateMusicCatalog();
            setMusicUploadMessage(`Deleted ${name}.`, "success");
            await loadMusic();
          } catch (error) {
            setMusicUploadMessage(error.message, "error-text");
            button.disabled = false;
          }
        });
      });
    } catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  }

  async function uploadMusicFiles(fileList) {
    const files = Array.from(fileList || []).filter((file) => /\.(mp3|wav)$/i.test(file.name || "") || /audio\/(mpeg|mp3|wav|x-wav|wave)/i.test(file.type || ""));
    if (!files.length) {
      setMusicUploadMessage("Choose one or more MP3 or WAV files.", "error-text");
      return;
    }
    const zone = $("musicUploadZone");
    const choose = $("musicChooseFiles");
    const form = new FormData();
    files.forEach((file) => form.append("files", file, file.name));
    const displayName = String($("musicDisplayName")?.value || "").trim();
    if (displayName && files.length === 1) form.append("display_name", displayName);
    if (zone) zone.dataset.busy = "true";
    if (choose) choose.disabled = true;
    setMusicUploadMessage(files.length === 1 ? "Adding track…" : `Adding ${files.length} tracks…`, "");
    try {
      const result = await api("/api/music", { method: "POST", body: form, timeoutMs: 120000, retries: 0 });
      if ($("musicDisplayName")) $("musicDisplayName").value = "";
      if ($("musicFileInput")) $("musicFileInput").value = "";
      invalidateMusicCatalog();
      setMusicUploadMessage(result.message || "Track added to the music library.", "success");
      await loadMusic();
    } catch (error) {
      setMusicUploadMessage(error.message, "error-text");
    } finally {
      if (zone) delete zone.dataset.busy;
      if (choose) choose.disabled = false;
    }
  }

  function bindMusicUpload() {
    const zone = $("musicUploadZone");
    const input = $("musicFileInput");
    const choose = $("musicChooseFiles");
    const addButton = $("musicAddButton");
    if (!input || (zone && zone.dataset.bound)) return;
    if (zone) zone.dataset.bound = "true";
    const openPicker = (event) => {
      event?.preventDefault();
      event?.stopPropagation();
      input.click();
    };
    addButton?.addEventListener("click", openPicker);
    choose?.addEventListener("click", openPicker);
    zone?.addEventListener("click", (event) => {
      if (event.target === choose || event.target === addButton) return;
      openPicker(event);
    });
    zone?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") openPicker(event);
    });
    zone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    });
    zone?.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone?.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
      uploadMusicFiles(event.dataTransfer?.files);
    });
    input.addEventListener("change", () => uploadMusicFiles(input.files));
  }

  bindMusicUpload();

  function setLibraryUploadMessage(text, className = "") {
    const node = $("libraryUploadMessage");
    if (!node) return;
    node.textContent = text || "";
    node.className = `form-message ${className}`.trim();
  }

  function libraryPreviewUrl(record) {
    const path = String(record?.preview_url || record?.preview_path || "").trim();
    if (path.startsWith("http")) return path;
    if (path) return `${apiBase}${path}`;
    return record?.id ? `${apiBase}/api/media-assets/${encodeURIComponent(record.id)}/preview` : "";
  }

  const LIBRARY_PAGE_SIZES = [5, 10, 20, 50];
  const LIBRARY_DEFAULT_PAGE_SIZE = 5;
  const LIBRARY_VIEW_KEY = "studioLibraryView";
  const LIBRARY_VIEWS = ["list", "thumbs", "grid"];
  let libraryPage = {
    index: 0,
    offsets: [null],
    nextOffset: null,
    hasMore: false,
    count: 0,
  };

  function libraryPageSize() {
    const raw = Number($("libraryPageSize")?.value || LIBRARY_DEFAULT_PAGE_SIZE);
    return LIBRARY_PAGE_SIZES.includes(raw) ? raw : LIBRARY_DEFAULT_PAGE_SIZE;
  }

  function libraryViewMode() {
    const raw = String($("libraryViewMode")?.value || "grid").trim();
    return LIBRARY_VIEWS.includes(raw) ? raw : "grid";
  }

  function applyLibraryViewMode() {
    const target = $("libraryList");
    const mode = libraryViewMode();
    if (target) target.className = libraryListClassName(mode);
    try { localStorage.setItem(LIBRARY_VIEW_KEY, mode); } catch { /* ignore */ }
  }

  function restoreLibraryViewMode() {
    let saved = "grid";
    try { saved = localStorage.getItem(LIBRARY_VIEW_KEY) || "grid"; } catch { /* ignore */ }
    const select = $("libraryViewMode");
    if (select && LIBRARY_VIEWS.includes(saved)) select.value = saved;
    applyLibraryViewMode();
  }

  function resetLibraryPage() {
    libraryPage = {
      index: 0,
      offsets: [null],
      nextOffset: null,
      hasMore: false,
      count: 0,
    };
  }

  function closeLibraryPreview() {
    const backdrop = $("libraryPreviewBackdrop");
    const video = $("libraryPreviewVideo");
    const image = $("libraryPreviewImage");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (video) {
      try { video.pause(); } catch {}
      video.removeAttribute("src");
      try { video.load(); } catch {}
    }
    if (image) image.removeAttribute("src");
    dialog?.classList.remove("is-video", "is-image");
    if (backdrop) backdrop.hidden = true;
  }

  function openLibraryPreview({ kind, src, name }) {
    const backdrop = $("libraryPreviewBackdrop");
    const video = $("libraryPreviewVideo");
    const image = $("libraryPreviewImage");
    const title = $("libraryPreviewTitle");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (!backdrop || !dialog) return;
    closeLibraryPreview();
    if (title) title.textContent = name || (kind === "video" ? "Clip" : "Photo");
    dialog.classList.toggle("is-video", kind === "video");
    dialog.classList.toggle("is-image", kind !== "video");
    if (kind === "video" && video && src) {
      video.src = src;
      video.play().catch(() => {});
    } else if (image && src) {
      image.src = src;
    }
    backdrop.hidden = false;
  }

  function bindLibraryPreview(target) {
    target.querySelectorAll("[data-library-preview]").forEach((node) => {
      node.addEventListener("click", () => {
        const kind = String(node.dataset.libraryPreview || "image");
        const src = kind === "video"
          ? String(node.dataset.libraryStream || "")
          : String(node.dataset.libraryImage || "");
        if (!src) return;
        openLibraryPreview({ kind, src, name: String(node.dataset.libraryName || "") });
      });
    });
  }

  function bindLibraryDeleteButtons(target) {
    target.querySelectorAll("[data-library-delete]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.libraryDelete;
        const name = button.dataset.libraryName || "this asset";
        if (!window.confirm(`Delete “${name}” from the asset library and Google Drive?\n\nThis is permanent. If a Production Request still has this asset attached, Studio will refuse.`)) {
          return;
        }
        button.disabled = true;
        try {
          await api(`/api/library/${encodeURIComponent(id)}`, { method: "DELETE", body: JSON.stringify({}) });
          setLibraryUploadMessage(`Deleted ${name}.`, "success");
          await loadLibrary();
        } catch (error) {
          setLibraryUploadMessage(error.message, "error-text");
          button.disabled = false;
        }
      });
    });
  }

  function publishedLibraryConfirmCopy(record) {
    const platform = String(record?.platform || "this").trim() || "this";
    const outputType = String(record?.platform_output_type || "output").trim() || "output";
    return `Remove the Google Drive copy of this published ${platform} ${outputType}? The Platform Output record, publish date, and live post link stay for reporting. Source library stills and clips are not affected.`;
  }

  function bindLibraryReleaseButtons(target) {
    target.querySelectorAll("[data-library-release]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.dataset.libraryRelease;
        const name = button.dataset.libraryName || "this published file";
        const platform = button.dataset.libraryPlatform || "this";
        const outputType = button.dataset.libraryOutputType || "output";
        if (!window.confirm(publishedLibraryConfirmCopy({ platform, platform_output_type: outputType }))) {
          return;
        }
        button.disabled = true;
        try {
          await api(`/api/library/published/${encodeURIComponent(id)}/release-file`, { method: "POST", body: JSON.stringify({}) });
          setLibraryUploadMessage(`Removed the Drive copy of ${name}. The live post link stays.`, "success");
          await loadLibrary();
        } catch (error) {
          setLibraryUploadMessage(error.message, "error-text");
          button.disabled = false;
        }
      });
    });
  }

  const libraryDurationPersistPending = new Set();

  function persistLibraryClipDuration(recordId, seconds, card) {
    const id = String(recordId || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id)) return;
    if (card && card.dataset.libraryRecordType === "platform_output") return;
    if (card && card.dataset.libraryNeedsDuration !== "1") return;
    const value = Math.round(Number(seconds));
    if (!Number.isFinite(value) || value <= 0) return;
    if (libraryDurationPersistPending.has(id)) return;
    libraryDurationPersistPending.add(id);
    if (card) card.dataset.libraryNeedsDuration = "0";
    api(`/api/library/${encodeURIComponent(id)}/duration`, {
      method: "POST",
      body: JSON.stringify({ duration_seconds: value }),
    }).catch(() => {
      libraryDurationPersistPending.delete(id);
      if (card) card.dataset.libraryNeedsDuration = "1";
    });
  }

  function libraryStreamUrl(record) {
    if (String(record?.record_type || "") === "platform_output") return "";
    const id = String(record?.id || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id)) return "";
    return `${apiBase}/api/media-assets/${encodeURIComponent(id)}/stream`;
  }

  function libraryPublicImageUrl(url) {
    const raw = String(url || "").trim();
    if (!raw) return "";
    if (/drive\.google\.com|googleapis\.com\/drive|\/uc\?id=/i.test(raw)) return "";
    if (/\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(raw)) return "";
    if (raw.startsWith("/")) return `${apiBase}${raw}`;
    if (!/^https?:\/\//i.test(raw)) return "";
    if (/\.(jpe?g|png|webp|gif)(\?|#|$)/i.test(raw)) return raw;
    return raw.startsWith("https://media.chicagoshining.com/") ? raw : "";
  }

  function publishedLibraryPosterUrl(record) {
    return libraryPublicImageUrl(record?.poster_url)
      || libraryPublicImageUrl(record?.thumbnail_url)
      || libraryPublicImageUrl(record?.studio_preview_url);
  }

  function publishedLibraryStreamUrl(record) {
    if (String(record?.media_kind || "").toLowerCase() !== "video") return "";
    const path = String(record?.preview_stream_url || "").trim();
    if (path.startsWith("/")) return `${apiBase}${path}`;
    const id = String(record?.id || "").trim();
    if (!/^rec[A-Za-z0-9]+$/.test(id)) return "";
    return `${apiBase}/api/outputs/${encodeURIComponent(id)}/preview`;
  }

  function libraryMissingPreviewHtml(label, detail = "Preview unavailable") {
    return `<div class="item4-heic-placeholder item4-image-placeholder"><strong>${escapeHtml(label)}</strong><span>${escapeHtml(detail)}</span></div>`;
  }

  function libraryKindFilterValue() {
    return String($("libraryKindFilter")?.value || "").trim();
  }

  function syncLibraryPublishedMode() {
    const published = libraryKindFilterValue() === "published";
    const add = $("libraryAddButton");
    const drop = $("libraryDropBlock");
    const eyebrow = $("libraryEyebrow");
    const blurb = $("libraryBlurb");
    const search = $("librarySearch");
    if (add) add.hidden = published;
    if (drop) drop.hidden = published;
    if (eyebrow) eyebrow.textContent = published ? "Published Platform Outputs" : "Photos and clips";
    if (blurb) {
      blurb.textContent = published
        ? "These are published Platform Outputs, not source stills or clips. Confirm the live post, then Remove Drive copy to trash the rendered Drive file. The Airtable row, publish date, and post link stay for reporting."
        : "Opens on the 5 most recent Drive stills and Raw Footage. Each card shows when it was added, file size when known, and clips show duration when known. Change how many show on the page, then use Previous and Next. Add photos or clips, or delete an unused Studio upload. Production and the wizard attach from this same library. Published files is a separate list of live Platform Outputs.";
    }
    if (search) search.placeholder = published ? "Title, platform, or filename" : "Name or location";
  }

  function renderPublishedLibraryCard(r) {
    const video = String(r.media_kind || "").toLowerCase() === "video";
    const poster = publishedLibraryPosterUrl(r);
    const stream = publishedLibraryStreamUrl(r);
    const duration = libraryDurationLine({
      media_kind: video ? "video" : "photo",
      duration_seconds: item4KnownClipDuration(r),
    });
    const size = librarySizeLine(r);
    const publishedLine = r.published_at ? `Published ${formatStudioDate(r.published_at)}` : "";
    const badge = r.file_released ? "File removed" : "Published";
    const badgeClass = r.file_released ? "is-released" : "is-published";
    let media = "";
    let playAttrs = "";
    if (video && stream) {
      media = item4ClipPlayerHtml({
        previewUrl: poster,
        streamUrl: stream,
        name: r.name || "Published file",
        durationSeconds: r.duration_seconds,
        asset: r,
        preload: false,
      });
    } else if (poster) {
      media = `<img src="${escapeHtml(poster)}" alt="" loading="lazy">`;
      playAttrs = ` data-library-preview="image" data-library-image="${escapeHtml(poster)}" data-library-name="${escapeHtml(r.name || "Published file")}"`;
    } else {
      media = libraryMissingPreviewHtml(video ? "VIDEO" : "IMAGE");
    }
    const meta = [
      `<span class="library-kind-text ${badgeClass}">${escapeHtml(badge)}</span>`,
      r.platform ? `<span>${escapeHtml(r.platform)}</span>` : "",
      r.platform_output_type ? `<span>${escapeHtml(r.platform_output_type)}</span>` : "",
      r.aspect_ratio ? `<span>${escapeHtml(r.aspect_ratio)}</span>` : "",
      publishedLine ? `<span>${escapeHtml(publishedLine)}</span>` : "",
      duration ? `<span data-library-duration>${escapeHtml(duration)}</span>` : (video ? `<span data-library-duration hidden></span>` : ""),
      size ? `<span>${escapeHtml(size)}</span>` : "",
      r.output_filename ? `<span>${escapeHtml(r.output_filename)}</span>` : "",
    ].filter(Boolean).join("");
    const live = r.platform_post_url
      ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.platform_post_url)}">Open live post</a>`
      : "";
    const drive = !r.file_released && r.final_file_url
      ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.final_file_url)}">Open in Drive</a>`
      : "";
    const release = r.file_released
      ? ""
      : `<button type="button" class="text-button danger" data-library-release="${escapeHtml(r.id)}" data-library-name="${escapeHtml(r.name || "this published file")}" data-library-platform="${escapeHtml(r.platform || "this")}" data-library-output-type="${escapeHtml(r.platform_output_type || "output")}">Remove Drive copy</button>`;
    return `<article class="library-card" data-library-id="${escapeHtml(r.id)}" data-library-record-type="platform_output"><div class="library-card-media"${playAttrs}>${media}<em class="library-kind ${badgeClass}">${badge}</em></div><h3>${value(r.name)}</h3><div class="library-meta">${meta}</div><div class="music-actions">${live}${drive}${release}</div></article>`;
  }

  function renderSourceLibraryCard(r) {
    const preview = libraryPreviewUrl(r);
    const video = String(r.media_kind || "").toLowerCase() === "video";
    const size = librarySizeLine(r);
    const duration = libraryDurationLine({
      media_kind: video ? "video" : "photo",
      duration_seconds: item4KnownClipDuration(r),
    });
    const added = r.intake_date ? `Added ${formatStudioDate(r.intake_date)}` : "";
    const needsDuration = video && !duration ? "1" : "0";
    let media = "";
    if (video) {
      const local = item4LocalClipPoster(r.name) || item4LocalClipPoster(r.id);
      media = item4ClipPlayerHtml({
        previewUrl: local || preview,
        streamUrl: libraryStreamUrl(r),
        name: r.name || "Clip",
        durationSeconds: r.duration_seconds,
        asset: r,
        preload: false,
      }) || libraryMissingPreviewHtml("CLIP", "Clip saved");
    } else if (preview) {
      media = `<img src="${escapeHtml(preview)}" alt="" loading="lazy">`;
    } else {
      media = libraryMissingPreviewHtml("IMAGE");
    }
    const playAttrs = video
      ? ""
      : (preview ? ` data-library-preview="image" data-library-image="${escapeHtml(preview)}" data-library-name="${escapeHtml(r.name || "Photo")}"` : "");
    const meta = [
      `<span class="library-kind-text">${video ? "Clip" : "Photo"}</span>`,
      added ? `<span>${escapeHtml(added)}</span>` : "",
      duration ? `<span data-library-duration>${escapeHtml(duration)}</span>` : (video ? `<span data-library-duration hidden></span>` : ""),
      size ? `<span>${escapeHtml(size)}</span>` : "",
      r.location ? `<span>${value(r.location)}</span>` : "",
    ].filter(Boolean).join("");
    return `<article class="library-card" data-library-id="${escapeHtml(r.id)}" data-library-record-type="media_asset" data-library-needs-duration="${needsDuration}"><div class="library-card-media"${playAttrs}>${media}<em class="library-kind">${video ? "Clip" : "Photo"}</em></div><h3>${value(r.name)}</h3><div class="library-meta">${meta}</div><div class="subtle">${value(r.description, "No description yet")}</div><div class="music-actions">${r.google_drive_url ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.google_drive_url)}">Open in Drive</a>` : ""}${r.studio_uploaded ? `<span class="badge ready-for-review">Studio upload</span>` : ""}<span class="badge ${r.do_not_use ? "failed" : "published"}">${r.do_not_use ? "Do not use" : "Available"}</span><button type="button" class="text-button" data-library-delete="${escapeHtml(r.id)}" data-library-name="${escapeHtml(r.name || "this asset")}">Delete</button></div></article>`;
  }

  function renderLibraryCards(records) {
    return records.map((r) => String(r.record_type || "") === "platform_output"
      ? renderPublishedLibraryCard(r)
      : renderSourceLibraryCard(r)).join("");
  }

  async function fillLibraryClipPosters(target) {
    const nodes = [...(target?.querySelectorAll("img[data-library-clip-id][data-library-stream]") || [])];
    for (const img of nodes) {
      if (!img.isConnected) return;
      const id = String(img.dataset.libraryClipId || "");
      const name = String(img.dataset.libraryClipName || "");
      const cached = item4LocalClipPoster(name) || item4LocalClipPoster(id);
      if (cached) {
        img.src = cached;
        img.removeAttribute("data-library-stream");
      }
    }
  }

  function updateLibraryPager() {
    const pager = $("libraryPager");
    const meta = $("libraryPageMeta");
    const prev = $("libraryPrevPage");
    const next = $("libraryNextPage");
    if (!pager) return;
    pager.hidden = false;
    if (prev) prev.disabled = libraryPage.index < 1;
    if (next) next.disabled = !libraryPage.hasMore;
    if (meta) {
      meta.textContent = libraryPage.count
        ? `Page ${libraryPage.index + 1} · ${libraryPage.count} of ${libraryPageSize()} on this page`
        : `Page ${libraryPage.index + 1}`;
    }
  }

  async function startLibraryBrowse() {
    resetLibraryPage();
    await loadLibrary();
  }

  async function loadLibrary() {
    const target = $("libraryList");
    if (!target) return;
    syncLibraryPublishedMode();
    applyLibraryViewMode();
    const query = String($("librarySearch")?.value || "").trim();
    const kind = libraryKindFilterValue();
    const published = kind === "published";
    const pager = $("libraryPager");
    if (pager) pager.hidden = true;
    target.innerHTML = '<div class="empty">Loading this page…</div>';
    const params = new URLSearchParams({ limit: String(libraryPageSize()) });
    if (query) params.set("q", query);
    if (kind) params.set("kind", kind);
    const offset = libraryPage.offsets[libraryPage.index];
    if (offset) params.set("offset", offset);
    try {
      const data = await api(`/api/library?${params.toString()}`);
      const records = data.records || [];
      libraryPage.nextOffset = data.offset || null;
      libraryPage.hasMore = Boolean(data.has_more);
      libraryPage.count = records.length;
      if (!records.length) {
        target.innerHTML = query
          ? (published
            ? '<div class="empty">No published files matched that search.</div>'
            : '<div class="empty">No library photos or clips matched that search.</div>')
          : (published
            ? '<div class="empty">No published Platform Outputs on this page.</div>'
            : '<div class="empty">No library photos or clips on this page.</div>');
        updateLibraryPager();
        return;
      }
      target.innerHTML = renderLibraryCards(records);
      bindLibraryDeleteButtons(target);
      bindLibraryReleaseButtons(target);
      bindLibraryPreview(target);
      item4BindClipPlayers(target);
      updateLibraryPager();
      if (!published) fillLibraryClipPosters(target);
    } catch (e) {
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
      if (pager) pager.hidden = true;
    }
  }

  const LIBRARY_PICKER_FLAG = "studioLibraryPicker";
  const LIBRARY_PHONE_RE = /iPhone|iPad|iPod|Android/i;

  function libraryPickerIsPhone() {
    return LIBRARY_PHONE_RE.test(navigator.userAgent || "");
  }

  function libraryArmPicker() {
    try { sessionStorage.setItem(LIBRARY_PICKER_FLAG, String(Date.now())); } catch { /* ignore */ }
  }

  function libraryDisarmPicker() {
    try { sessionStorage.removeItem(LIBRARY_PICKER_FLAG); } catch { /* ignore */ }
  }

  function libraryPickerWasAbandoned() {
    try {
      const raw = sessionStorage.getItem(LIBRARY_PICKER_FLAG);
      const started = Number(raw || 0);
      return Boolean(raw) && Number.isFinite(started) && Date.now() - started < 15 * 60 * 1000;
    } catch {
      return false;
    }
  }

  async function uploadLibraryFiles(fileList) {
    libraryDisarmPicker();
    let files = Array.from(fileList || []).filter((file) => {
      const name = String(file.name || "");
      const type = String(file.type || "");
      return /image\//i.test(type) || /video\//i.test(type) || /\.(jpe?g|png|webp|gif|heic|heif|mp4|mov|m4v|webm)$/i.test(name);
    });
    if (!files.length) {
      setLibraryUploadMessage(libraryPickerIsPhone()
        ? "Photo Library closed before Studio received a clip. Add one clip at a time and keep this tab open."
        : "Choose one or more photos or video clips.", "error-text");
      return;
    }
    const oversizedSplit = item4DropOversizedClips(files, { resetNotice: true, autoCompress: false });
    if (oversizedSplit.oversized.length) {
      files = oversizedSplit.allowed;
      setLibraryUploadMessage(item4OversizedClipNotice, "error-text");
      if (!files.length) return;
    }
    const zone = $("libraryUploadZone");
    const inputs = libraryFileInputs();
    const location = String($("libraryLocation")?.value || "").trim();
    if (zone) zone.dataset.busy = "true";
    inputs.forEach((input) => { input.disabled = true; });
    const errors = [];
    let uploaded = 0;
    try {
      for (let index = 0; index < files.length; index += 1) {
        const file = files[index];
        setLibraryUploadMessage(files.length === 1
          ? `Adding ${file.name}…`
          : `Adding ${index + 1} of ${files.length}: ${file.name}…`, "");
        const form = new FormData();
        form.append("files", file, file.name);
        if (location) form.append("location", location);
        if (item4FileLooksLikeVideo(file)) {
          try {
            const meta = await imageMetadataForFiles([file]);
            const seconds = Number(meta[0]?.duration_seconds || 0);
            if (Number.isFinite(seconds) && seconds > 0) {
              form.append("duration_seconds", String(Math.round(seconds)));
            }
          } catch {}
        }
        try {
          await api("/api/library", { method: "POST", body: form, timeoutMs: 180000, retries: 0 });
          uploaded += 1;
        } catch (error) {
          errors.push(`${file.name}: ${error.message || "upload failed"}`);
        }
      }
      inputs.forEach((input) => { input.value = ""; });
      if (uploaded) await startLibraryBrowse();
      if (item4OversizedClipNotice) {
        const extra = errors.length
          ? `${uploaded ? `${uploaded} added. ` : ""}${errors.join(" ")}`
          : (uploaded ? `${uploaded === 1 ? "The other asset was added" : `The other ${uploaded} assets were added`} to the library.` : "");
        setLibraryUploadMessage(extra ? `${item4OversizedClipNotice} ${extra}` : item4OversizedClipNotice, "error-text");
      } else if (uploaded && !errors.length) {
        setLibraryUploadMessage(uploaded === 1 ? "Asset added to the library." : `${uploaded} assets added to the library.`, "success");
      } else if (uploaded) {
        setLibraryUploadMessage(`${uploaded} added. ${errors.join(" ")}`, "error-text");
      } else {
        setLibraryUploadMessage(errors.join(" ") || "Could not add those assets.", "error-text");
      }
    } finally {
      if (zone) delete zone.dataset.busy;
      inputs.forEach((input) => { input.disabled = false; });
    }
  }

  function libraryFileInputs() {
    return ["libraryFileInput", "libraryZoneInput", "libraryChooseInput"]
      .map((id) => $(id))
      .filter(Boolean);
  }

  function bindLibraryUpload() {
    restoreLibraryViewMode();
    const zone = $("libraryUploadZone");
    const inputs = libraryFileInputs();
    if (!inputs.length || (zone && zone.dataset.bound)) return;
    if (zone) zone.dataset.bound = "true";
    const phone = libraryPickerIsPhone();
    inputs.forEach((input) => { input.multiple = !phone; });
    const hint = $("libraryUploadHint");
    if (hint && phone) {
      hint.textContent = "On iPhone add one clip at a time and keep this tab open. JPG, PNG, WEBP, HEIC, MP4, MOV · 25 MB photos · 100 MB clips";
    }
    if (libraryPickerWasAbandoned()) {
      libraryDisarmPicker();
      setLibraryUploadMessage("Photo Library closed before Studio received the clips. On iPhone add one clip at a time and keep this tab open.", "error-text");
    }
    zone?.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        $("libraryZoneInput")?.focus();
        $("libraryZoneInput")?.click();
      }
    });
    zone?.addEventListener("dragover", (event) => {
      event.preventDefault();
      zone.classList.add("dragging");
    });
    zone?.addEventListener("dragleave", () => zone.classList.remove("dragging"));
    zone?.addEventListener("drop", (event) => {
      event.preventDefault();
      zone.classList.remove("dragging");
      uploadLibraryFiles(event.dataTransfer?.files);
    });
    inputs.forEach((input) => {
      input.addEventListener("click", libraryArmPicker);
      input.addEventListener("change", () => uploadLibraryFiles(input.files));
    });
    let searchTimer = 0;
    $("librarySearch")?.addEventListener("input", () => {
      window.clearTimeout(searchTimer);
      searchTimer = window.setTimeout(() => {
        resetLibraryPage();
        loadLibrary();
      }, 300);
    });
    $("libraryKindFilter")?.addEventListener("change", () => {
      resetLibraryPage();
      syncLibraryPublishedMode();
      loadLibrary();
    });
    $("libraryPageSize")?.addEventListener("change", () => {
      resetLibraryPage();
      loadLibrary();
    });
    $("libraryViewMode")?.addEventListener("change", () => {
      applyLibraryViewMode();
    });
    $("libraryPreviewClose")?.addEventListener("click", () => closeLibraryPreview());
    $("libraryPreviewBackdrop")?.addEventListener("click", (event) => {
      if (event.target === $("libraryPreviewBackdrop")) closeLibraryPreview();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !$("libraryPreviewBackdrop")?.hidden) closeLibraryPreview();
    });
    $("libraryPrevPage")?.addEventListener("click", () => {
      if (libraryPage.index < 1) return;
      libraryPage.index -= 1;
      loadLibrary();
    });
    $("libraryNextPage")?.addEventListener("click", () => {
      if (!libraryPage.hasMore || !libraryPage.nextOffset) return;
      libraryPage.offsets[libraryPage.index + 1] = libraryPage.nextOffset;
      libraryPage.index += 1;
      loadLibrary();
    });
  }

  bindLibraryUpload();

  function setOperationsMessage(text, className = "") {
    const node = $("operationsMessage");
    if (!node) return;
    node.textContent = text || "";
    node.className = `form-message ${className}`.trim();
  }

  function opsKitText(record) {
    return [record?.output_title, record?.output_caption, record?.output_hashtags].filter(Boolean).join("\n\n");
  }

  function similarHeatLevel(posts, maxPosts) {
    if (!posts) return 0;
    if (!maxPosts) return 1;
    const ratio = posts / maxPosts;
    if (ratio >= 0.75) return 4;
    if (ratio >= 0.5) return 3;
    if (ratio >= 0.25) return 2;
    return 1;
  }

  function formatInsightsCount(value) {
    const n = Number(value) || 0;
    return n.toLocaleString("en-US");
  }

  function renderOperationsInsightsOverview(data) {
    const target = $("operationsInsightsOverview");
    if (!target) return;
    const overview = data?.overview || {
      posts: 0,
      accounts_timed: 0,
      accounts_timed_ok: 0,
      accounts_reference: 0,
      likes: 0,
      views: 0,
      avg_likes: 0,
      captions: 0,
      by_platform: {},
      top_window: null,
    };
    if (data && data.ok === false && !data.overview) {
      target.hidden = true;
      target.innerHTML = "";
      return;
    }
    const platformBits = Object.entries(overview.by_platform || {})
      .map(([platform, count]) => `${platform} ${formatInsightsCount(count)}`)
      .join(" · ");
    const top = overview.top_window
      ? `${overview.top_window.day} ${overview.top_window.window} (${formatInsightsCount(overview.top_window.posts)} posts)`
      : "—";
    const cards = [
      ["Similar posts found", formatInsightsCount(overview.posts)],
      ["Accounts timed", `${formatInsightsCount(overview.accounts_timed_ok)} / ${formatInsightsCount(overview.accounts_timed)}`],
      ["Reference only", formatInsightsCount(overview.accounts_reference)],
      ["Total likes", formatInsightsCount(overview.likes)],
      ["Total views", formatInsightsCount(overview.views)],
      ["Avg likes / post", formatInsightsCount(overview.avg_likes)],
      ["Captions stored", formatInsightsCount(overview.captions)],
      ["Top window", top],
    ];
    target.hidden = false;
    target.innerHTML = cards.map(([label, value]) => `
      <div class="insights-overview-card"><strong>${escapeHtml(String(value))}</strong><span>${escapeHtml(label)}</span></div>
    `).join("") + (platformBits
      ? `<div class="insights-overview-card"><strong>${escapeHtml(platformBits)}</strong><span>Posts by platform</span></div>`
      : "");
  }

  function renderOperationsSimilarTimes(data) {
    const meta = $("operationsSimilarTimesMeta");
    const caption = $("operationsInsightsCaptionMeta");
    const target = $("operationsSimilarHeatmap");
    renderOperationsInsightsOverview(data);
    if (meta) {
      const parts = [
        data?.profile_label || "Chicago",
        data?.season_label || studioInsightsSeasonLabel(selectedInsightsSeason()),
        data?.storage === "database" ? "historical database" : null,
        data?.sample_size ? `${data.sample_size} posts` : "no posts yet",
        data?.suggested?.label || null,
        data?.remaining_to_sweep ? `${data.remaining_to_sweep} still sweeping` : null,
      ].filter(Boolean);
      meta.textContent = data?.message || parts.join(" · ");
    }
    if (caption) {
      const captionData = data?.caption;
      caption.textContent = captionData?.label
        ? `${captionData.label}${captionData.sample_size ? ` · ${captionData.sample_size} captions in model` : ""}`
        : "Caption guidance fills in as historical posts accumulate in Studio Insights.";
    }
    if (!target) return;
    const buckets = data?.buckets || [];
    const ownBuckets = data?.own_schedule?.buckets || [];
    const windows = Array.isArray(data?.windows) && data.windows.length
      ? data.windows
      : ["00:00-06:00", "06:00-08:00", "08:00-10:00", "10:00-12:00", "12:00-14:00", "14:00-16:00", "16:00-18:00", "18:00-20:00", "20:00-22:00", "22:00-00:00"];
    if (!windows.length) {
      target.innerHTML = `<p class="similar-heatmap-empty">${escapeHtml(data?.message || "No similar-account times yet for this profile.")}</p>`;
      return;
    }
    const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
    const maxPosts = Math.max(...buckets.map((row) => Number(row.posts) || 0), 1);
    const lookup = new Map(buckets.map((row) => [`${row.day}|${row.window}`, row]));
    const yours = new Map(ownBuckets.map((row) => [`${row.day}|${row.window}`, row]));
    const yoursTotal = Number(data?.own_schedule?.total) || ownBuckets.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
    const body = days.map((day) => {
      const cells = windows.map((window) => {
        const row = lookup.get(`${day}|${window}`);
        const mine = yours.get(`${day}|${window}`);
        const posts = Number(row?.posts || 0);
        const mineCount = Number(mine?.count || 0);
        const platforms = mine?.platforms?.length ? ` · ${mine.platforms.join(", ")}` : "";
        const title = posts || mineCount
          ? `${posts} similar-account post${posts === 1 ? "" : "s"} found${mineCount ? ` · ${mineCount} of yours scheduled${platforms}` : ""}`
          : "No similar-account posts found in this window";
        return `<td class="similar-heat-cell${mineCount ? " has-yours" : ""}" data-heat="${similarHeatLevel(posts, maxPosts)}" data-yours="${mineCount ? "1" : "0"}" title="${escapeHtml(title)}"><span class="similar-heat-count">${posts || "·"}</span>${mineCount ? `<span class="similar-heat-yours">${mineCount}</span>` : ""}</td>`;
      }).join("");
      return `<tr><th>${day}</th>${cells}</tr>`;
    }).join("");
    target.innerHTML = `
      <div class="similar-heatmap-head">
        <p class="similar-heatmap-lead">Each teal number is how many <strong>similar-account posts</strong> we have stored for that weekday and two-hour window in Chicago time. Darker teal means more of those found posts, not more of yours.</p>
        <div class="similar-heatmap-legend" aria-label="Heatmap legend">
          <span><i class="similar-legend-swatch" data-heat="1"></i> Fewer found</span>
          <span><i class="similar-legend-swatch" data-heat="4"></i> More found</span>
          <span><i class="similar-legend-yours"></i> Your scheduled posts${yoursTotal ? ` · ${yoursTotal}` : ""}</span>
        </div>
      </div>
      <div class="similar-heatmap-scroll">
        <table>
          <thead><tr><th></th>${windows.map((window) => `<th>${escapeHtml(similarWindowLabel(window))}</th>`).join("")}</tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>`;
  }

  function similarWindowLabel(window) {
    const match = String(window || "").match(/^(\d{2}):00-(\d{2}):00$/);
    if (!match) return String(window || "");
    const fmt = (hour) => {
      const n = Number(hour);
      if (n === 0 || n === 24) return "12a";
      if (n === 12) return "12p";
      return n > 12 ? `${n - 12}p` : `${n}a`;
    };
    return `${fmt(match[1])}–${fmt(match[2])}`;
  }

  function similarAccountRunAllowed(platform) {
    const key = String(platform || "").trim().toLowerCase();
    return key === "youtube" || key === "instagram";
  }

  function operationsAnalyticsQueueForScope(scope) {
    const wanted = String(scope || "youtube").trim().toLowerCase();
    const order = wanted === "all" ? ["youtube", "instagram"] : [wanted];
    return order.flatMap((platform) =>
      (operationsAnalyticsAccounts || []).filter((row) => String(row.platform || "").toLowerCase() === platform)
    );
  }

  function setOperationsAnalyticsQueueUi(running) {
    const run = $("operationsRunAllAnalytics");
    const stop = $("operationsStopAnalytics");
    const scope = $("operationsAnalyticsRunScope");
    const refresh = $("operationsRefreshSimilarTimes");
    const discover = $("operationsDiscoverCreators");
    if (run) {
      run.disabled = running;
      run.textContent = running ? "Running…" : "Run sequentially";
    }
    if (stop) stop.hidden = !running;
    if (scope) scope.disabled = running;
    const season = $("operationsInsightsSeason");
    if (season) season.disabled = running;
    if (refresh) refresh.disabled = running;
    if (discover) discover.disabled = running;
    document.querySelectorAll("[data-watchlist-run-platform]").forEach((button) => {
      button.disabled = running;
    });
    document.querySelectorAll("[data-watchlist-run]").forEach((button) => {
      const account = operationsAnalyticsAccounts[Number(button.dataset.watchlistRun)];
      const timed = String(account?.platform || "").toLowerCase() === "youtube";
      button.disabled = running || !timed;
    });
    document.querySelectorAll("[data-watchlist-remove]").forEach((button) => {
      button.disabled = running;
    });
  }

  async function runOperationsAccountAnalytics(account) {
    return api("/api/insights/similar-times", {
      method: "POST",
      body: JSON.stringify({
        force: true,
        limit: 1,
        profile: account.profile || studioProfiles.find((item) => item.id === selectedProfileId)?.theme || "chicago",
        platform: account.platform,
        handle: account.handle,
        season: selectedInsightsSeason(),
      }),
      timeoutMs: 60000,
      retries: 1,
    });
  }

  async function runOperationsAnalyticsQueue(scope) {
    if (operationsAnalyticsQueue.running) return;
    const queue = operationsAnalyticsQueueForScope(scope);
    if (!queue.length) {
      setOperationsMessage("No handles to run for that platform.", "error-text");
      return;
    }
    operationsAnalyticsQueue.running = true;
    operationsAnalyticsQueue.stop = false;
    setOperationsAnalyticsQueueUi(true);
    let added = 0;
    let failed = 0;
    let processed = 0;
    try {
      for (let i = 0; i < queue.length; i += 1) {
        if (operationsAnalyticsQueue.stop) break;
        const account = queue[i];
        const platform = String(account.platform || "youtube").toLowerCase();
        setOperationsMessage(`Running ${platform} ${i + 1}/${queue.length}: @${account.handle}…`);
        try {
          const result = await runOperationsAccountAnalytics(account);
          processed += 1;
          renderOperationsSimilarTimes(result);
          if (result.updated) added += 1;
          else if (["error", "needs_permission", "needs_key", "unavailable"].includes(String(result.account?.status || ""))) failed += 1;
        } catch (error) {
          processed += 1;
          failed += 1;
          setOperationsMessage(`@${account.handle} failed (${error.message || "error"}). Continuing…`, "error-text");
        }
      }
      const stopped = operationsAnalyticsQueue.stop;
      const summary = stopped
        ? `Stopped after ${processed} of ${queue.length}. ${added} added posts${failed ? ` · ${failed} did not add posts` : ""}.`
        : `Finished ${processed} handle${processed === 1 ? "" : "s"}. ${added} added posts${failed ? ` · ${failed} did not add posts` : ""}.`;
      await loadOperations();
      setOperationsMessage(summary);
    } catch (error) {
      setOperationsMessage(error.message || "Sequential analytics run failed.", "error-text");
    } finally {
      operationsAnalyticsQueue.running = false;
      operationsAnalyticsQueue.stop = false;
      setOperationsAnalyticsQueueUi(false);
    }
  }

  function similarAccountStatusLabel(status) {
    const key = String(status || "").trim();
    if (key === "ok") return "timed";
    if (key === "reference") return "reference only";
    if (key === "needs_permission") return "needs Meta IG permission";
    if (key === "needs_key") return "needs YouTube API key";
    if (key === "unavailable") return "not publicly readable";
    if (key === "pending") return "waiting for sweep";
    if (key === "paused") return "paused pending Meta permission";
    if (key === "error") return "lookup failed";
    return key;
  }

  function similarAccountProfileUrl(account) {
    const platform = String(account?.platform || "").trim().toLowerCase();
    const handle = String(account?.handle || "").trim().replace(/^@/, "");
    if (!handle) return "";
    if (/^https?:\/\//i.test(handle)) return handle;
    if (platform === "instagram") return `https://www.instagram.com/${encodeURIComponent(handle)}/`;
    if (platform === "youtube") return `https://www.youtube.com/@${encodeURIComponent(handle)}`;
    if (platform === "tiktok") return `https://www.tiktok.com/@${encodeURIComponent(handle)}`;
    if (platform === "facebook") {
      const path = handle.split("/").filter(Boolean).map((part) => encodeURIComponent(part)).join("/");
      return `https://www.facebook.com/${path}`;
    }
    return "";
  }

  function renderOperationsWatchlist(accounts, canEdit) {
    const target = $("operationsWatchlist");
    const empty = $("operationsWatchlistEmpty");
    operationsAnalyticsAccounts = Array.isArray(accounts) ? accounts : [];
    if (empty) empty.hidden = Boolean(accounts?.length);
    if (!target) return;
    if (!accounts?.length) {
      target.innerHTML = "";
      return;
    }
    const order = ["instagram", "youtube", "tiktok", "facebook"];
    const groups = new Map();
    accounts.forEach((account, index) => {
      const platform = String(account.platform || "other").toLowerCase();
      if (!groups.has(platform)) groups.set(platform, []);
      groups.get(platform).push({ account, index });
    });
    const sections = order.filter((platform) => groups.has(platform)).concat(
      [...groups.keys()].filter((platform) => !order.includes(platform))
    );
    const queueBusy = operationsAnalyticsQueue.running;
    target.innerHTML = sections.map((platform) => {
      const rows = groups.get(platform) || [];
        const timed = platform === "youtube";
        const groupMode = platform === "youtube" ? "timed" : platform === "instagram" ? "paused" : "review only";
        const groupRun = canEdit && similarAccountRunAllowed(platform)
        ? `<button type="button" class="text-button" data-watchlist-run-platform="${escapeHtml(platform)}" ${queueBusy ? "disabled" : ""} title="Fetch every ${escapeHtml(platform)} handle one at a time">Run this platform</button>`
        : "";
      const cards = rows.map(({ account, index }) => {
        const profileUrl = similarAccountProfileUrl(account);
        const handle = profileUrl
          ? `<a class="table-link" href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener noreferrer">@${escapeHtml(account.handle)}</a>`
          : `@${escapeHtml(account.handle)}`;
        const status = String(account.status || "").trim();
        const statusClass = status === "ok"
          ? " is-sweep-success"
          : ["error", "needs_permission", "needs_key", "unavailable"].includes(status)
            ? " is-sweep-error"
            : "";
        return `
      <article class="ops-profile-card${statusClass}">
        <div><strong>${handle}</strong><div class="subtle" title="${escapeHtml(account.error || "")}">${escapeHtml(account.profile || "")}${account.source ? ` · ${escapeHtml(account.source)}` : ""}${account.status ? ` · ${escapeHtml(similarAccountStatusLabel(account.status))}` : ""}</div></div>
        <button type="button" class="secondary-button" data-watchlist-run="${index}" ${canEdit && timed && !queueBusy ? "" : "disabled"} title="${timed ? "Fetch this account now and add its public posts to analytics" : platform === "instagram" ? "Paused until Meta business_discovery permission is fixed" : "Public post analytics are unavailable for this platform"}">Run analytics</button>
        <button type="button" class="text-button" data-watchlist-remove="${index}" ${canEdit && !queueBusy ? "" : "disabled"}>Remove</button>
      </article>`;
      }).join("");
      return `<section class="ops-watchlist-group"><h4>${escapeHtml(platform)} · ${groupMode} · ${rows.length}${groupRun}</h4>${cards}</section>`;
    }).join("");
    target.querySelectorAll("[data-watchlist-remove]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!canEdit || operationsAnalyticsQueue.running) return;
        const next = accounts.filter((_, i) => i !== Number(button.dataset.watchlistRemove));
        try {
          await api("/api/insights/watchlist", { method: "POST", body: JSON.stringify({ accounts: next }) });
          setOperationsMessage("Watchlist updated.");
          loadOperations(true);
        } catch (error) {
          setOperationsMessage(error.message || "Could not update watchlist.", "error-text");
        }
      });
    });
    target.querySelectorAll("[data-watchlist-run-platform]").forEach((button) => {
      button.addEventListener("click", () => {
        if (!canEdit || operationsAnalyticsQueue.running) return;
        runOperationsAnalyticsQueue(button.dataset.watchlistRunPlatform);
      });
    });
    target.querySelectorAll("[data-watchlist-run]").forEach((button) => {
      button.addEventListener("click", async () => {
        if (!canEdit || operationsAnalyticsQueue.running) return;
        const account = accounts[Number(button.dataset.watchlistRun)];
        if (!account) return;
        const idleLabel = button.textContent;
        button.disabled = true;
        button.textContent = "Running…";
        try {
          setOperationsMessage(`Fetching @${account.handle} and adding its public posts to analytics…`);
          const result = await runOperationsAccountAnalytics(account);
          renderOperationsSimilarTimes(result);
          const stored = Number(result.account?.posts || 0);
          const status = similarAccountStatusLabel(result.account?.status);
          setOperationsMessage(
            result.updated
              ? `Added ${stored} public post${stored === 1 ? "" : "s"} from @${account.handle} to analytics.`
              : `@${account.handle}: ${status || "no public posts were added"}.`
          );
          await loadOperations(true);
        } catch (error) {
          setOperationsMessage(error.message || `Could not run analytics for @${account.handle}.`, "error-text");
        } finally {
          if (button.isConnected) {
            button.disabled = false;
            button.textContent = idleLabel;
          }
        }
      });
    });
  }

  function renderOperationsProfiles(profiles, canEdit) {
    const target = $("operationsProfiles");
    if (!target) return;
    if (!profiles.length) {
      target.innerHTML = '<div class="empty">No Content Profiles were returned.</div>';
      return;
    }
    target.innerHTML = profiles.map((profile) => `
      <article class="ops-profile-card" data-profile-id="${escapeHtml(profile.id)}">
        <div>
          <strong>${value(profile.name)}</strong>
          <div class="subtle">${profile.active ? "Active profile" : "Inactive profile"}</div>
        </div>
        <label><input type="checkbox" data-ops-idea-toggle ${profile.idea_generation_enabled ? "checked" : ""} ${canEdit ? "" : "disabled"}> Daily ideas</label>
        <label><input type="checkbox" data-ops-autonomous-toggle ${profile.autonomous_produce_enabled ? "checked" : ""} ${canEdit ? "" : "disabled"}> Autonomous produce</label>
        <label>Limit <input type="number" min="1" max="10" step="1" value="${escapeHtml(String(profile.daily_idea_limit || 5))}" data-ops-idea-limit ${canEdit ? "" : "disabled"}></label>
      </article>
    `).join("");
    target.querySelectorAll(".ops-profile-card").forEach((card) => {
      const save = async () => {
        if (!canEdit) return;
        try {
          await api(`/api/operations/profiles/${encodeURIComponent(card.dataset.profileId)}`, {
            method: "PATCH",
            body: JSON.stringify({
              idea_generation_enabled: Boolean(card.querySelector("[data-ops-idea-toggle]")?.checked),
              autonomous_produce_enabled: Boolean(card.querySelector("[data-ops-autonomous-toggle]")?.checked),
              daily_idea_limit: Number(card.querySelector("[data-ops-idea-limit]")?.value || 5),
            }),
          });
          setOperationsMessage("Profile cadence saved.");
        } catch (error) {
          setOperationsMessage(error.message || "Could not save profile cadence.", "error-text");
        }
      };
      card.querySelector("[data-ops-idea-toggle]")?.addEventListener("change", save);
      card.querySelector("[data-ops-autonomous-toggle]")?.addEventListener("change", save);
      card.querySelector("[data-ops-idea-limit]")?.addEventListener("change", save);
    });
  }

  function renderOperationsQueue(target, records, kind) {
    if (!target) return;
    if (!records.length) {
      target.innerHTML = `<div class="empty">${kind === "schedule" ? "Nothing waiting for a post date." : "Nothing is due to publish."}</div>`;
      return;
    }
    target.innerHTML = `<table class="data-table"><thead><tr><th>Output</th><th>Platform</th><th>Status</th><th>Action</th></tr></thead><tbody>${records.map((record) => {
      const links = [
        record.final_file_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(record.final_file_url)}">Final file</a>` : "",
        record.thumbnail_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(record.thumbnail_url)}">Thumbnail</a>` : "",
      ].filter(Boolean).join(" · ");
      const scheduledHint = record.scheduled_post_date
        ? `<div class="subtle">Current schedule: ${dateValue(record.scheduled_post_date)}</div>`
        : "";
      const inputValue = formatDateTimeLocalInput(record.scheduled_post_date);
      const action = kind === "schedule"
        ? `${scheduledHint}<form class="ops-inline-form" data-ops-schedule="${escapeHtml(record.id)}"><input type="datetime-local" required value="${escapeHtml(inputValue)}"><button type="submit" class="secondary-button">${record.scheduled_post_date ? "Update date" : "Set date"}</button></form>`
        : `<form class="ops-inline-form" data-ops-published="${escapeHtml(record.id)}"><input type="url" required placeholder="https://… live post URL"><button type="submit" class="secondary-button">Mark published</button></form>`;
      return `<tr><td><div class="title-cell">Output ${value(record.output_id)} · ${value(record.output_title)}</div><div class="subtle">${links || "No file links"}</div><div class="ops-kit">${escapeHtml(opsKitText(record) || "No caption yet")}</div></td><td>${value(record.platform)}</td><td>${badge(record.studio_state || record.publish_status)}</td><td>${action}</td></tr>`;
    }).join("")}</tbody></table>`;
    target.querySelectorAll("[data-ops-schedule]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("input");
        try {
          await api(`/api/operations/outputs/${encodeURIComponent(form.dataset.opsSchedule)}/schedule`, {
            method: "POST",
            body: JSON.stringify({ scheduled_post_date: input.value }),
          });
          setOperationsMessage("Schedule date saved.");
          loadOperations(true);
        } catch (error) {
          setOperationsMessage(error.message || "Could not save schedule.", "error-text");
        }
      });
    });
    target.querySelectorAll("[data-ops-published]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("input");
        try {
          await api(`/api/operations/outputs/${encodeURIComponent(form.dataset.opsPublished)}/published`, {
            method: "POST",
            body: JSON.stringify({ platform_post_url: input.value }),
          });
          setOperationsMessage("Marked published.");
          loadOperations(true);
        } catch (error) {
          setOperationsMessage(error.message || "Could not mark published.", "error-text");
        }
      });
    });
  }

  function renderOperationsOversized(records, canCompress, jobs) {
    const target = $("operationsOversizedList");
    const compressAll = $("operationsCompressAllOversized");
    operationsCanCompress = Boolean(canCompress);
    const incoming = Array.isArray(records) ? records : [];
    const jobsById = new Map((Array.isArray(jobs) ? jobs : incoming.map((row) => row.compression).filter(Boolean))
      .map((job) => [job.google_drive_file_id, job]));
    operationsOversizedCache = incoming.map((row) => ({
      ...row,
      compression: jobsById.get(row.google_drive_file_id) || null,
    }));
    const activeJobs = [...jobsById.values()];
    renderCompressionStatus(activeJobs, operationsOversizedCache.length);
    syncCompressionPoll(activeJobs.length > 0 || operationsOversizedCache.length > 0);
    const intakeCount = operationsOversizedCache.filter((record) => record.source === "intake_folder").length;
    if (compressAll) {
      compressAll.hidden = !(canCompress && intakeCount > 0);
      compressAll.textContent = intakeCount === 1
        ? "Compress intake folder video"
        : `Compress all in intake folder (${intakeCount})`;
    }
    if (!target) return;
    if (!operationsOversizedCache.length) {
      target.innerHTML = '<div class="empty">No oversized Drive videos are waiting.</div>';
      return;
    }
    target.innerHTML = `<table class="data-table"><thead><tr><th>Asset</th><th>Size</th><th>Location</th><th>Status</th><th>Action</th></tr></thead><tbody>${operationsOversizedCache.map((record) => {
      const job = record.compression || jobsById.get(record.google_drive_file_id);
      const status = job
        ? `<span class="badge rendering">${escapeHtml(job.label || "Compressing")}${Number.isFinite(Number(job.progress_percent)) ? ` ${Math.round(Number(job.progress_percent))}%` : ""}</span>`
        : `<span class="badge attention">Waiting</span>`;
      const action = !canCompress
        ? "Admin only"
        : job
          ? `<button type="button" class="secondary-button" disabled>In progress</button>`
          : `<button type="button" class="secondary-button" data-ops-compress="${escapeHtml(record.google_drive_file_id)}" data-ops-compress-name="${escapeHtml(record.name || "")}">Compress</button>`;
      return `
      <tr>
        <td><div class="title-cell">${value(record.name)}</div>${record.google_drive_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(record.google_drive_url)}">Open in Drive</a>` : ""}</td>
        <td>${value(record.file_size_mb)} MB</td>
        <td>${record.source === "intake_folder" ? "Ingestion folder" : "Asset library"}</td>
        <td>${status}</td>
        <td>${action}</td>
      </tr>`;
    }).join("")}</tbody></table>`;
    target.querySelectorAll("[data-ops-compress]").forEach((button) => {
      button.addEventListener("click", async () => {
        button.disabled = true;
        const fileName = button.dataset.opsCompressName || "video";
        renderCompressionStatus([{
          headline: `Starting ${fileName}`,
          tone: "waiting",
          notes: "Sending this file to A1S…",
          name: fileName,
          google_drive_file_id: button.dataset.opsCompress,
        }], operationsOversizedCache.length);
        startCompressionPoll();
        try {
          await api("/api/operations/compress", {
            method: "POST",
            body: JSON.stringify({ drive_file_id: button.dataset.opsCompress }),
          });
          setOperationsMessage(`Started compression for ${fileName}.`);
          pollCompressionStatus();
        } catch (error) {
          setOperationsMessage(error.message || "Could not start compression.", "error-text");
          button.disabled = false;
        }
      });
    });
  }

  async function loadOperations() {
    const meta = $("operationsIdeaMeta");
    initOperationsInsightsSeason();
    if (meta) meta.textContent = "Loading operations…";
    try {
      const data = await api("/api/operations");
      operationsTimezone = data.timezone || null;
      if (meta) {
        const tz = data.timezone || studioTimezone();
        const today = data.chicago_date ? formatStudioDate(data.chicago_date, { timeZone: tz, weekday: true }) : "—";
        const lastRun = data.last_daily_idea_date
          ? formatStudioDate(data.last_daily_idea_date, { timeZone: tz, weekday: true })
          : "not yet";
        meta.textContent = `Today: ${today}. Last daily ideas run: ${lastRun}. Times shown in ${studioTimezoneLabel(tz)}.`;
      }
      const autonomousMeta = $("operationsAutonomousMeta");
      if (autonomousMeta) {
        const lastAuto = data.last_autonomous_run || {};
        const parts = [];
        if (lastAuto.status) parts.push(lastAuto.status.replace(/_/g, " "));
        if (lastAuto.skip_reason) parts.push(lastAuto.skip_reason.replace(/_/g, " "));
        if (lastAuto.slot) parts.push(`slot ${lastAuto.slot}`);
        autonomousMeta.textContent = parts.length
          ? `Last autonomous run: ${parts.join(" · ")}.`
          : "Autonomous produce has not run yet. Enable a profile toggle, then wait for 8:00 a.m. / 4:00 p.m. Chicago or run now.";
      }
      renderOperationsProfiles(data.profiles || [], Boolean(data.can_edit_profiles));
      const watchlist = data.similar_accounts || [];
      renderOperationsWatchlist(watchlist, Boolean(data.can_edit_profiles));
      try {
        const similar = await api(`/api/insights/similar-times?profile=${encodeURIComponent(selectedProfileId || "chicago")}&season=${encodeURIComponent(selectedInsightsSeason())}`);
        renderOperationsSimilarTimes(similar);
        const statusByKey = new Map((similar.accounts || []).map((row) => [`${row.platform}:${String(row.handle || "").toLowerCase()}`, row]));
        renderOperationsWatchlist(watchlist.map((row) => ({
          ...row,
          status: statusByKey.get(`${row.platform}:${String(row.handle || "").toLowerCase()}`)?.status
            || (row.platform === "instagram" ? "paused" : row.platform === "tiktok" || row.platform === "facebook" ? "reference" : null),
        })), Boolean(data.can_edit_profiles));
      } catch (error) {
        const similarMeta = $("operationsSimilarTimesMeta");
        if (similarMeta) {
          similarMeta.textContent = `Analytics refresh failed; showing the last loaded calendar. ${error.message || ""}`.trim();
        }
      }
      renderOperationsQueue($("operationsScheduleList"), data.ready_to_schedule || [], "schedule");
      renderOperationsQueue($("operationsPublishList"), data.ready_to_publish || [], "publish");
      renderOperationsOversized(data.oversized_media || [], Boolean(data.can_edit_profiles), data.compression_jobs || []);
      renderLibraryIntakeNotice(data.library_intake || {});
      const run = $("operationsRunDailyIdeas");
      if (run) run.hidden = !data.can_edit_profiles;
      const runAuto = $("operationsRunAutonomous");
      if (runAuto) runAuto.hidden = !data.can_edit_profiles;
      const intake = $("operationsRunIntake");
      if (intake) intake.hidden = !data.can_edit_profiles;
      const capSilence = $("operationsCapAudioSilence");
      if (capSilence) capSilence.hidden = !data.can_edit_profiles;
      const resetUrls = $("operationsResetRenderUrls");
      if (resetUrls) resetUrls.hidden = !data.can_edit_profiles;
      const retryAssets = $("operationsRetryAssetSelection");
      if (retryAssets) retryAssets.hidden = !data.can_edit_profiles;
      const refreshSimilar = $("operationsRefreshSimilarTimes");
      if (refreshSimilar) refreshSimilar.hidden = !data.can_edit_profiles;
      const discoverCreators = $("operationsDiscoverCreators");
      if (discoverCreators) discoverCreators.hidden = !data.can_edit_profiles;
      const runAllAnalytics = $("operationsRunAllAnalytics");
      if (runAllAnalytics) runAllAnalytics.hidden = !data.can_edit_profiles;
      const analyticsScope = $("operationsAnalyticsRunScope");
      if (analyticsScope) analyticsScope.hidden = !data.can_edit_profiles;
      const analyticsScopeLabel = document.querySelector("label[for='operationsAnalyticsRunScope']");
      if (analyticsScopeLabel) analyticsScopeLabel.hidden = !data.can_edit_profiles;
      const stopAnalytics = $("operationsStopAnalytics");
      if (stopAnalytics && !data.can_edit_profiles) stopAnalytics.hidden = true;
    } catch (error) {
      setOperationsMessage(error.message || "Could not load operations.", "error-text");
      if (meta) meta.textContent = "Unable to load operations.";
    }
  }

  function updateOperationsBadge(count) {
    const badgeNode = $("navOperationsBadge");
    if (!badgeNode) return;
    const n = Number(count) || 0;
    badgeNode.hidden = n < 1;
    badgeNode.textContent = n > 99 ? "99+" : String(n);
  }

  function renderLibraryIntakeNotice(intake) {
    const notice = $("operationsIntakeNotice");
    const meta = $("operationsIntakeMeta");
    const actionRequired = Number(intake.action_required) || 0;
    updateOperationsBadge(actionRequired);
    if (notice) {
      notice.hidden = false;
      notice.dataset.tone = actionRequired ? "action" : "ok";
      notice.textContent = intake.notice || "No library assets currently require action.";
    }
    if (meta) {
      const names = (intake.needing_classification || []).map((row) => row.name).filter(Boolean).slice(0, 5);
      meta.textContent = names.length
        ? `Waiting on classification: ${names.join(", ")}${intake.needing_classification.length > 5 ? "…" : ""}`
        : "Classification queue is empty. Oversized videos still appear in the list below.";
    }
  }

  function hideIntakeProgress() {
    const wrap = $("operationsIntakeProgress");
    if (wrap) wrap.hidden = true;
  }

  function showIntakeProgress(status) {
    const wrap = $("operationsIntakeProgress");
    const bar = $("operationsIntakeBar");
    const label = $("operationsIntakeProgressLabel");
    const list = $("operationsIntakeStages");
    if (wrap) wrap.hidden = false;
    if (bar) bar.style.width = `${Math.max(0, Math.min(100, Number(status.percent) || 0))}%`;
    if (label) label.textContent = status.summary || status.a2?.detail || "Working…";
    if (list) {
      const stages = Array.isArray(status.stages) && status.stages.length
        ? status.stages
        : [
            { key: "A2", label: "Intake", detail: "Starting A2…" },
            { key: "A2B", label: "Video backfill", detail: "Queued" },
            { key: "A3", label: "Classification", detail: "Queued" },
            { key: "A4", label: "Reconciliation", detail: "Queued" },
          ];
      list.innerHTML = stages.map((stage) => {
        const state = stage.run?.state || stage.result || "";
        return `<li data-state="${escapeHtml(state)}"><span>${escapeHtml(stage.key)} · ${escapeHtml(stage.label)}</span><span>${escapeHtml(stage.detail || "Queued")}</span></li>`;
      }).join("");
    }
  }

  async function pollIntakeStatus() {
    if (!intakePollStartedAt) return;
    try {
      const status = await api(`/api/operations/intake?started_at=${encodeURIComponent(intakePollStartedAt)}`);
      showIntakeProgress(status);
      if (status.library_intake) renderLibraryIntakeNotice(status.library_intake);
      if (intakeIsFinished(status)) {
        stopIntakePoll();
        const button = $("operationsRunIntake");
        if (button) button.disabled = false;
        setOperationsMessage(status.summary || (status.failed ? "Intake finished with an error." : "Intake finished."));
        loadOperations();
        return true;
      }
      if (intakePollDeadline && Date.now() > intakePollDeadline) {
        stopIntakePoll();
        const button = $("operationsRunIntake");
        if (button) button.disabled = false;
        setOperationsMessage("A2 is still running on the Python runner. Open Operations again to check status.");
        return true;
      }
      return false;
    } catch (error) {
      stopIntakePoll();
      const button = $("operationsRunIntake");
      if (button) button.disabled = false;
      setOperationsMessage(error.message || "Could not read intake progress.", "error-text");
      return true;
    }
  }

  function loadPage(page) {
    if (page !== "operations") {
      stopIntakePoll();
      stopCompressionPoll();
    }
    if (page === "home" || page === "dashboard") return loadDashboard();
    if (page === "ideas") return loadIdeas();
    if (page === "content") return loadContent();
    if (page === "outputs") return loadOutputs();
    if (page === "music") return loadMusic();
    if (page === "library") return loadLibrary();
    if (page === "operations") return loadOperations();
    if (page === "support") return;
  }


  $("closeCreativeEditor")?.addEventListener("click", () => {
    if (!phase6ConfirmDiscardUnsaved("close the editor")) return;
    creativeHandoffPollToken += 1;
    $("creativeEditorPanel").hidden = true;
    $("creativeEditorPanel").classList.remove("story-teaser-mode", "simple-video-review", "no-voiceover-review", "native-still-review");
    activeCreativeOutputId = null;
    activeCreativeOutput = null;
    creativeSlides = [];
    creativeEditorDirty = false;
    creativeSavedFingerprint = "";
    const video = $("creativeRenderPreview");
    const drive = $("creativeRenderPreviewDrive");
    video?.pause();
    video?.removeAttribute("src");
    drive?.removeAttribute("src");
  });
  $("creativeRenderPreview")?.addEventListener("play", () => {
    if ($("creativeRenderBusy") && !$("creativeRenderBusy").hidden) $("creativeRenderPreview").pause();
  });
  $("reloadCreativeEditor")?.addEventListener("click", () => {
    if (!activeCreativeOutputId || !phase6ConfirmDiscardUnsaved("reset to the saved values")) return;
    openCreativeEditor(activeCreativeOutputId);
  });
  $("saveCreativeEditor")?.addEventListener("click", () => saveActiveCreative().catch(() => {}));
  $("creativeUnlockTitles")?.addEventListener("click", () => unlockCreativeTitles().catch(() => {}));
  $("creativeRequestChanges")?.addEventListener("click", () => {
    reviewActiveCreative(creativeWatchOnly() ? "apply_audio_mix" : "changes_requested");
  });
  $("pipelineApproveAll")?.addEventListener("click", () => {
    approveAllPipelineOutputs().catch((e) => setPipelineLiveHint(e.message || "Approve All failed"));
  });
  restorePipelineUseDefaultSchedules();
  $("pipelineUseDefaultSchedules")?.addEventListener("change", () => {
    persistPipelineUseDefaultSchedules();
    if (!pipelineUseDefaultSchedules()) return;
    applyDefaultSchedulesToReadyRows().catch(() => {});
  });
  $("pipelineFilterClear")?.addEventListener("click", () => {
    pipelineViewFilter = "all";
    pipelineOpenSingleOnLoad = false;
    const target = $("outputsList");
    if (target) renderOutputsTable(target, pipelineOutputs);
  });
  $("creativeUseSuggestedTime")?.addEventListener("click", () => {
    const input = $("creativeScheduleAt");
    if (!applySuggestedIsoToScheduleInput(input, creativeSuggestedIso)) return;
    document.querySelectorAll("input[name='creativeScheduleMode']").forEach((radio) => {
      radio.checked = radio.value === "schedule";
    });
  });
  $("creativeApprovePreview")?.addEventListener("click", () => {
    if (creativeWatchOnly()) {
      if (!creativeCanApproveForPublishing()) return;
      if (!window.confirm("Approve this output for publishing?\n\nInstagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft.")) return;
      reviewActiveCreative("approve_for_publishing");
      return;
    }
    if (window.confirm("Approve this preview? This records review approval and locks per-photo titles; it will not publish the output.")) reviewActiveCreative("approve");
  });
  $("creativeTiktokCompleteForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const record = activeCreativeOutput;
    const id = activeCreativeOutputId || record?.id;
    const input = $("creativeTiktokUrl");
    const button = $("creativeTiktokCompleteSave");
    if (!id || !input) return;
    if (button) button.disabled = true;
    try {
      phase6Message("Saving TikTok URL…");
      const result = await submitTiktokComplete(id, {
        url: input.value,
        musicCompleted: $("creativeTiktokMusic")?.value,
        record,
      });
      if (result?.record) {
        activeCreativeOutput = { ...record, ...result.record };
        renderCreativeOutputMeta(activeCreativeOutput);
        renderCreativeTiktokComplete(activeCreativeOutput);
      }
      pipelineTiktokUrlDrafts.delete(id);
      phase6Message("TikTok URL saved. This output is marked Published.");
      refreshPipelineOutputs({ silent: true }).catch(() => {});
    } catch (error) {
      phase6Message(error.message || "Could not save the TikTok URL.", "error-text");
    } finally {
      if (button) button.disabled = false;
    }
  });
  $("creativeDefaultVoicePreview")?.addEventListener("click", () => phase6PreviewSelectedVoice($("creativeDefaultVoice"), $("creativeDefaultVoicePreview")));
  $("creativeVoiceoverVolumeRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeVoiceoverVolumeRange", "creativeVoiceoverVolume"));
  $("creativeVoiceoverVolume")?.addEventListener("input", () => syncCreativeAudioPair("creativeVoiceoverVolume", "creativeVoiceoverVolumeRange"));
  $("creativeMusicNormalRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicNormalRange", "creativeMusicNormal"));
  $("creativeMusicNormal")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicNormal", "creativeMusicNormalRange"));
  $("creativeMusicDuckedRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicDuckedRange", "creativeMusicDucked"));
  $("creativeMusicDucked")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicDucked", "creativeMusicDuckedRange"));
  $("creativeDuckingEnabled")?.addEventListener("change", updateCreativeAudioSummary);

  $("creativeEditorPanel")?.addEventListener("input", (event) => {
    if (event.target.closest("input, textarea, select")) phase6MarkDirty();
  });
  $("creativeEditorPanel")?.addEventListener("change", (event) => {
    if (event.target.closest("input, textarea, select")) phase6MarkDirty();
  });
  $("clearCreativeReviewNotes")?.addEventListener("click", () => {
    if (!$("creativeReviewNotes")) return;
    $("creativeReviewNotes").value = "";
    phase6MarkDirty();
    $("creativeReviewNotes").focus();
  });
  $("collapseCreativeSlides")?.addEventListener("click", () => {
    creativeSlides.forEach((slide) => creativeSlideCollapsed.add(slide.id));
    renderCreativeSlides();
  });
  $("expandCreativeSlides")?.addEventListener("click", () => {
    creativeSlideCollapsed.clear();
    renderCreativeSlides();
  });
  document.querySelectorAll("[data-creative-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.creativeJump);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!creativeEditorDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      stopPipelinePoll();
      stopProductionPoll();
      if (pipelinePageActive()) setPipelineLiveHint("Paused while this tab is in the background");
      if (productionPageActive()) setProductionLiveHint("Paused while this tab is in the background");
      return;
    }
    if (pipelinePageActive()) refreshPipelineOutputs({ silent: true }).finally(schedulePipelinePoll);
    if (productionPageActive()) refreshProductionPage({ silent: true }).finally(scheduleProductionPoll);
  });

  phase6DecorateTooltips(document);
  productionDecorateTooltips($("page-content"));
  phase6BindTooltipTarget($("pipelineApproveAll"), PRODUCTION_BUTTON_HELP.pipelineApproveAll);
  phase6BindTooltipTarget($("pipelineUseDefaultSchedulesLabel"), PRODUCTION_BUTTON_HELP.pipelineUseDefaultSchedules);
  window.addEventListener("scroll", phase6HideTooltip, true);
  window.addEventListener("resize", phase6HideTooltip);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") phase6HideTooltip(); });

  checkHealth().finally(() => loadDashboard());
  $("studioProfileSelect")?.addEventListener("change", (event) => {
    const profile = studioProfiles.find((item) => item.id === event.target.value);
    if (profile) applyStudioProfile(profile, { reload: true });
  });
})();

// v0.6.17 display-text normalization startup
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => startDisplayTextRepair(), { once: true });
} else {
  startDisplayTextRepair();
}
