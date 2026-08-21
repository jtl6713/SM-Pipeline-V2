(() => {
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const configuredBase = String(config.apiBase || "").replace(/\/$/, "");
  const apiBase = configuredBase || window.location.origin;
  const $ = (id) => document.getElementById(id);
  let activeIdea = null;
  let ideasCache = [];
  let activeIdeaGenerationBatchId = null;
  let ideaGenerationPollTimer = null;
  let ideaGenerationInFlight = false;
  let activeProductionRequest = null;
  let productionRequestMusic = [];
  let productionRequestOutputs = [];
  let productionOutputMatrixLoaded = false;
  let item4Workspace = null;
  let item4BridgePreflight = null;
  let item4WorkspaceRetryTimer = 0;
  let item4PlanOverrides = {};
  let ezIntakeKind = null;
  let ezStagedFiles = [];
  let ezEntryPath = null;
  let ezLocalPreviews = new Map();
  let ezSelectedVoiceId = "xVQH621DS3eyBYrseRt5";
  const DEFAULT_VOICE_ID = "xVQH621DS3eyBYrseRt5";
  const DEFAULT_VOICE_NAME = "Kate";
  let ezStarting = false;
  let ezAutoPlanAfterUpload = false;
  let ezPlanInFlight = false;
  const ezCaptionDrafts = new Map();
  const ezCaptionModes = new Map();
  let ezCaptionDefault = "ai";
  let ezCaptionSaveTimer = null;
  let ezPinnedExtraOutputs = [];
  let ezConfigSaveTimer = null;
  let ezIdeaIdentitySaveTimer = null;
  let item4Uploading = false;
  let item4PreparingVariants = false;
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
  const ITEM4_POLL_EXTRA_WINDOWS = 2;
  const ITEM4_POLL_EXTRA_MS = 15000;
  let item4MasterExtraWindows = 0;
  let item4VariantExtraWindows = 0;
  const item4PreviewFailures = new Map();
  const item4CropDrafts = new Map();
  let item4CropRequestId = null;
  let pipelineOutputs = [];
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

  const BUILD_ID = "item4-0.6.79-pipeline-review-facts";
  let pipelinePollTimer = null;
  let pipelineCountdownTimer = null;
  let pipelineNextRefreshAt = 0;
  let pipelinePollInFlight = false;
  const PIPELINE_POLL_MS = 8000;
  const pipelineProgressHighWater = new Map();

  function pipelineDisplayPercent(record) {
    const raw = record?.studio_progress_percent ?? record?.youtube_processing_progress_percent ?? record?.youtube_upload_progress_percent;
    const n = Number(raw);
    if (!Number.isFinite(n)) return raw;
    if (record?.studio_state === "Failed") {
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

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!phase6ConfirmDiscardUnsaved("leave this editor")) return;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      button.classList.add("active");
      $(`page-${button.dataset.page}`).classList.add("active");
      if (button.dataset.page !== "outputs") stopPipelinePoll();
      loadPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => loadPage(button.dataset.refresh, true));
  });

  $("refreshDashboard").addEventListener("click", () => loadDashboard(true));

  async function api(path, options = {}) {
    const { timeoutMs = 25000, signal: explicitSignal, ...fetchOptions } = options;
    const timeoutSignal =
      !explicitSignal && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : explicitSignal;

    const response = await fetch(`${apiBase}${path}`, {
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
      throw new Error(body.error || body.message || `Request failed (${response.status})`);
    }
    return body;
  }

  function isTimeoutError(error) {
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || error || "").toLowerCase();
    return name.includes("timeout") || name.includes("abort") || message.includes("signal timed out") || message.includes("timed out");
  }

  function stateClass(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function badge(value) {
    const safe = escapeHtml(value || "Unknown");
    return `<span class="badge ${stateClass(value)}">${safe}</span>`;
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

  async function loadDashboard(force = false) {
    const metrics = $("metrics");
    const list = $("recentOutputs");
    metrics.innerHTML = '<div class="metric"><div class="metric-label">Loading</div><div class="metric-value">…</div></div>';
    list.innerHTML = '<div class="empty">Loading pipeline data…</div>';
    try {
      const data = await api("/api/dashboard");
      const m = data.metrics || {};
      const cards = [
        ["Ideas", m.ideas], ["Content items", m.content_items], ["Platform outputs", m.platform_outputs],
        ["Active outputs", m.active_outputs], ["Needs attention", m.attention_outputs], ["Published", m.published_outputs]
      ];
      metrics.innerHTML = cards.map(([label, number]) => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${number ?? 0}</div></div>`).join("");
      renderOutputsTable(list, data.recent_outputs || []);
    } catch (e) {
      metrics.innerHTML = "";
      list.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
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
      if (hint) hint.textContent = "The Idea Candidates queue has no open ideas right now. Enter a new idea manually, or wait for I1–I4 to produce one.";
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
    if (hint) hint.textContent = "Shows unpromoted Idea Candidates from the pipeline. Open one to manage, configure production, or promote.";
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
    return idea?.is_on_hold ? "On Hold" : (idea?.status || "Unknown");
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

  function ideaCanPromote(idea) {
    return !ideaIsPromoted(idea) && !idea?.is_on_hold;
  }

  function setSelectValue(id, value, fallback) {
    const el = $(id);
    const desired = String(value || fallback || "");
    const exists = Array.from(el.options).some((option) => option.value === desired);
    el.value = exists ? desired : (fallback || "");
  }

  function syncPromotionPanels() {
    const contentType = $("promoteContentType").value;
    $("videoPromotionOptions").hidden = !["Vertical Short Video", "Longform Video"].includes(contentType);
    $("carouselPromotionOptions").hidden = contentType !== "Carousel";
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
    setSelectValue("promoteCarouselImageMode", idea?.carousel_image_mode, "Make AI Generated");
    $("promoteProductionNotes").value = "";
    syncPromotionPanels();

    const snapshot = [
      ["Type", idea?.content_type],
      ["Platforms", Array.isArray(idea?.platforms) && idea.platforms.length ? idea.platforms.join(", ") : null],
      ["Slides", idea?.carousel_slide_count],
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
      configureButton.textContent = promoted ? "Production locked" : "Add photos";
    }
    $("holdIdeaButton").hidden = Boolean(idea?.is_on_hold);
    $("restoreIdeaButton").hidden = !idea?.is_on_hold;
    $("holdIdeaButton").disabled = !modifiable;
    $("restoreIdeaButton").disabled = ideaIsPromoted(idea);

    const promotable = ideaCanPromote(idea);
    const waitingForI4 = idea?.status === "Approved" && !promoted;
    const libraryPromote = $("ideaLibraryPromote");
    if (libraryPromote) {
      libraryPromote.hidden = Boolean(idea?.is_on_hold) || promoted;
      libraryPromote.open = waitingForI4;
    }
    $("promoteIdeaButton").disabled = !promotable;
    $("ideaPromotionZone").classList.toggle("promotion-disabled", !promotable);
    $("ideaPromotionZone").querySelectorAll("select,input,textarea").forEach((control) => { control.disabled = !promotable; });

    if (ideaIsPromoted(idea)) {
      $("promoteIdeaButton").textContent = "Already promoted";
      setManageMessage("Promotion is complete. This Idea Candidate is intentionally locked; there is no background save or promotion task running.", "success");
    } else if (idea?.is_on_hold) {
      setManageMessage("Restore this idea before approving and promoting it.", "");
    } else if (idea?.status === "Approved") {
      setManageMessage("This idea is Approved but not yet linked to a Content Item. Open Promote without photos to retry the I3 → I4 handoff.", "");
    } else {
      $("promoteIdeaButton").textContent = "Approve & Promote";
      setManageMessage();
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

  function openIdeaDrawer(idea) {
    updateIdeaDrawer(idea);
    $("ideaDrawerBackdrop").hidden = false;
    $("ideaManageDrawer").classList.add("open");
    $("ideaManageDrawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    setTimeout(() => $("editIdeaTitle").focus(), 80);
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
      setManageMessage("Add a summary and save it before promotion. The existing I4 promotion gate requires Idea_Summary.", "error-text");
      return;
    }

    const label = activeIdea.title || `Candidate ${activeIdea.candidate_id || activeIdea.id}`;
    const confirmed = window.confirm(
      `Approve and promote "${label}"?\n\nStudio will submit the selected production configuration to the existing I3 approval workflow. I3 will then trigger the existing I4 promotion workflow to create the Content Item.`
    );
    if (!confirmed) return;

    const button = $("promoteIdeaButton");
    button.disabled = true;
    button.textContent = "Promoting…";
    setManageMessage("Sending approval through I3 → I4…", "");

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
      carousel_image_mode: $("promoteCarouselImageMode").value,
      production_notes: $("promoteProductionNotes").value.trim(),
    };

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/promote`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let record = result.record;
      if (!ideaIsPromoted(record)) {
        setManageMessage("I3 accepted the approval. Waiting for I4 to finish promotion…", "");
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
        setManageMessage(`Approved through I3 and promoted through I4. Content Item: ${contentRecordId}.`, "success");
      } else {
        setManageMessage("I3 accepted the approval and the candidate is Approved. I4 is still processing; use Refresh if the Content Item does not appear shortly.", "success");
      }
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Approve & Promote";
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
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    $(`page-${page}`).classList.add("active");
    loadPage(page);
  }

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

  function applyEzPlanOverrides(photoCount, platforms) {
    const planned = ezPlanApi()?.ezPlanFromPhotoCount({ photoCount, platforms }) || { overrides: {}, platforms: platforms || [] };
    item4PlanOverrides = { ...planned.overrides, ...item4PlanOverrides };
    return planned;
  }

  function ezPlanPlatforms(count, selected) {
    const usingEz = usingEzPlatforms() || ezStarting || ezAutoPlanAfterUpload;
    if (!usingEz) {
      const planned = applyEzPlanOverrides(count, selected);
      return planned.platforms.length ? planned.platforms : selected;
    }
    const defaults = ezPlanApi()?.ezPlanFromPhotoCount({ photoCount: count })?.platforms
      || ["Instagram", "Facebook", "TikTok"];
    const boxes = Array.from(document.querySelectorAll("[data-ez-platform]"));
    const platforms = boxes.length
      ? defaults.filter((platform) => {
          const box = boxes.find((input) => input.value === platform);
          return box ? (box.checked && !box.disabled) : true;
        })
      : defaults;
    applyEzPlanOverrides(count, platforms);
    return platforms;
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
    if (ezIntakeKind === "multiple-photos" || count > 1) return true;
    const parsed = ezPlanApi()?.parseEzOriginNotes(activeProductionRequest?.production_notes);
    return parsed?.inputKind === "multiple-photos";
  }

  function ezManualCaptionsEnabled() {
    return ezCaptionMode() === "manual";
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
    const nextKind = kind === "multiple-photos" ? "multiple-photos" : kind === "single-photo" ? "single-photo" : null;
    ezIntakeKind = nextKind;
    document.querySelectorAll("[data-pr-input]").forEach((button) => {
      button.classList.toggle("selected", Boolean(nextKind) && button.dataset.prInput === nextKind);
    });
    const input = $("item4MediaInput");
    if (input) input.multiple = nextKind === "multiple-photos";
    const title = $("item4UploadTitle");
    const hint = $("item4UploadHint");
    if (nextKind === "multiple-photos") {
      if (title) title.textContent = "Drop several photos here or choose files";
      if (hint) hint.textContent = "At least 2 photos · up to 20 · HEIC/HEIF supported · originals are preserved";
    } else if (nextKind === "single-photo") {
      if (title) title.textContent = "Drop one photo here or choose a file";
      if (hint) hint.textContent = "One photo · HEIC/HEIF supported · original is preserved";
    } else {
      if (title) title.textContent = "Drop photos here or choose files";
      if (hint) hint.textContent = "Up to 20 photos · HEIC/HEIF supported · originals are preserved";
    }
    syncPrMediaKindUi();
    if (!quiet && nextKind) setRequestMessage();
  }

  function syncPrMediaKindUi() {
    const grid = $("item4MediaKindGrid");
    const hint = $("item4MediaKindHint");
    const zone = $("item4UploadZone");
    const assetCount = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets.length : 0;
    const hasAssets = assetCount > 0;
    if (!ezIntakeKind && hasAssets) {
      ezIntakeKind = assetCount > 1 ? "multiple-photos" : "single-photo";
      document.querySelectorAll("[data-pr-input]").forEach((button) => {
        button.classList.toggle("selected", button.dataset.prInput === ezIntakeKind);
      });
      const input = $("item4MediaInput");
      if (input) input.multiple = ezIntakeKind === "multiple-photos";
    }
    const parsed = ezPlanApi()?.parseEzOriginNotes(activeProductionRequest?.production_notes);
    if (!ezIntakeKind && (parsed?.inputKind === "single-photo" || parsed?.inputKind === "multiple-photos")) {
      selectPrMediaKind(parsed.inputKind, { quiet: true });
    }
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
      else if (!hasAssets) hint.textContent = "Multiple photos selected. Upload at least two images.";
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

  function revokeEzLocalPreviews() {
    ezLocalPreviews.forEach((url) => {
      try { URL.revokeObjectURL(url); } catch {}
    });
    ezLocalPreviews.clear();
  }

  function stageEzLocalPreviews(files) {
    revokeEzLocalPreviews();
    (files || []).forEach((file, index) => {
      const heic = item4IsHeicAsset({ name: file.name, mime_type: file.type });
      if (heic) return;
      try { ezLocalPreviews.set(index, URL.createObjectURL(file)); } catch {}
    });
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
    const list = Array.from(files || []);
    ezStagedFiles = list;
    stageEzLocalPreviews(list);
    const optimistic = {
      ...(item4Workspace || {}),
      assets: item4OptimisticAssetsFromFiles(list, item4Workspace?.assets || []),
      assets_status: uploading ? "Uploading" : (item4Workspace?.assets_status || "Uploading"),
    };
    item4Workspace = optimistic;
    renderItem4Assets(optimistic);
    renderItem4Variants(optimistic);
    renderEzPhotoStrip();
    updateItem4MasterProgress(optimistic);
  }

  function ezLocalPreviewFor(index, name) {
    if (ezLocalPreviews.has(index)) return ezLocalPreviews.get(index);
    const match = ezStagedFiles.findIndex((file) => file.name === name);
    return match >= 0 ? (ezLocalPreviews.get(match) || "") : "";
  }

  function renderEzPhotoStrip() {
    const host = $("ezPhotoStrip");
    if (!host) return;
    const files = Array.isArray(ezStagedFiles) ? ezStagedFiles : [];
    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const count = Math.max(files.length, assets.length);
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
      const name = file?.name || asset.name || `Photo ${index + 1}`;
      const id = String(asset.id || `staged:${index}`);
      const localUrl = ezLocalPreviewFor(index, name);
      const remoteUrl = asset.id ? item4AssetPreviewUrl(asset) : "";
      const previewUrl = localUrl || remoteUrl;
      const heic = item4IsHeicAsset(file || asset);
      const visual = previewUrl
        ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(name)}" draggable="false">`
        : item4AssetPlaceholder(file || asset, heic ? "HEIC original" : "Preview");
      cards.push(`<article class="ez-photo-card" data-item4-asset="${escapeHtml(id)}">
        ${visual}
        <div class="item4-asset-meta"><strong>${escapeHtml(name)}</strong><span>Photo ${index + 1}</span></div>
        ${item4CaptionField(id)}
      </article>`);
    }
    host.innerHTML = cards.join("");
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

  function isAudioYes(value) {
    return String(value || "") === "Yes";
  }

  function alignAudioSelect(fromEl, toEl) {
    if (!fromEl || !toEl) return;
    if (fromEl.value === "Yes") toEl.value = "Yes";
    else if (fromEl.value === "No" && toEl.value !== "Use Profile Default") toEl.value = "No";
  }

  function syncRequestAudioUi({ fromEz = false } = {}) {
    const ezVo = $("ezAudioVoiceover");
    const prVo = $("prVoiceover");
    const ezMu = $("ezAudioMusic");
    const prMu = $("prMusicMode");
    if (fromEz) {
      alignAudioSelect(ezVo, prVo);
      alignAudioSelect(ezMu, prMu);
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
    } else {
      if ($("ezAudioTrack")) $("ezAudioTrack").value = "";
      if ($("prMusicAsset")) $("prMusicAsset").value = "";
    }
    const audioWarning = "Music and voiceover play on video outputs (Reels, Slideshow Reels, TikTok video drafts, YouTube). They are not used on native stills such as Instagram Carousel, Facebook Multi-Image Post, or TikTok Multi-Photo.";
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
      inputKind: parsed.inputKind,
      captionMode: parsed.captionMode,
    }) || "";
    if (origin && text.startsWith(origin)) return text.slice(origin.length).replace(/^\s+/, "");
    const lines = text.split(/\n/);
    if (lines[0]?.includes("origin=")) return lines.slice(1).join("\n").replace(/^\s+/, "");
    return text;
  }

  function mergeEzProductionNotes() {
    const origin = ezPlanApi()?.ezOriginNotes({
      inputKind: ezIntakeKind || "single-photo",
      captionMode: ezCaptionMode(),
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

  function syncEzConfigFields() {
    copySelectValue("ezTitleMode", "prTitleMode");
    if ($("prRequestedTitle")) $("prRequestedTitle").value = $("ezRequestedTitle")?.value || "";
    if ($("ezTitle")) $("ezTitle").value = String($("ezRequestedTitle")?.value || "").trim().slice(0, 160);
    copySelectValue("ezScriptMode", "prScriptMode");
    if ($("prRequestedScript")) $("prRequestedScript").value = $("ezRequestedScript")?.value || "";
    copySelectValue("ezThumbnail", "prThumbnail");
    if ($("prVoiceoverTail")) $("prVoiceoverTail").value = $("ezVoiceoverTail")?.value || "2";
    if ($("prVideoDuration")) $("prVideoDuration").value = $("ezVideoDuration")?.value || "30";
    copySelectValue("ezVideoClipMode", "prVideoClipMode");
    if ($("prVideoClipExact")) $("prVideoClipExact").value = $("ezVideoClipExact")?.value || "";
    if ($("prVideoClipMin")) $("prVideoClipMin").value = $("ezVideoClipMin")?.value || "";
    if ($("prVideoClipMax")) $("prVideoClipMax").value = $("ezVideoClipMax")?.value || "";
    copySelectValue("ezCarouselSlideMode", "prCarouselSlideMode");
    if ($("prCarouselSlideExact")) $("prCarouselSlideExact").value = $("ezCarouselSlideExact")?.value || "";
    if ($("prCarouselSlideMin")) $("prCarouselSlideMin").value = $("ezCarouselSlideMin")?.value || "";
    if ($("prCarouselSlideMax")) $("prCarouselSlideMax").value = $("ezCarouselSlideMax")?.value || "";
    copySelectValue("ezCarouselImageMode", "prCarouselImageMode");
    mergeEzProductionNotes();
    syncEzStructureCounts();
    if ($("prVideoClipMode") && $("prCarouselSlideMode")) syncAllStructureControls();
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
    if (!record) {
      syncEzStructureCounts();
      return;
    }
    if ($("ezAudioVoiceover")) {
      $("ezAudioVoiceover").value = record.voiceover_mode === "Yes" ? "Yes" : "No";
    }
    if (record.voiceover_mode === "Yes") {
      applyVoiceToSelects(record.voice_id || DEFAULT_VOICE_ID, record.voice_name || DEFAULT_VOICE_NAME);
    }
    if ($("ezAudioMusic")) {
      $("ezAudioMusic").value = record.background_music_mode === "Yes" ? "Yes" : "No";
    }
    const musicId = Array.isArray(record.selected_music_asset_links) ? record.selected_music_asset_links[0] : "";
    if ($("ezAudioTrack") && musicId) $("ezAudioTrack").value = musicId;
    syncEzAudioFields();
    if ($("ezTitleMode")) {
      const titleText = String(record.requested_title || "").trim();
      const titleMode = !titleText && (record.title_mode === "Force exact" || record.title_mode === "Leave blank")
        ? "AI decides"
        : record.title_mode;
      setSelectValue("ezTitleMode", titleMode, "AI decides");
    }
    if ($("ezRequestedTitle")) $("ezRequestedTitle").value = String(record.requested_title || "").trim();
    if ($("ezTitle")) $("ezTitle").value = String(record.requested_title || "").trim().slice(0, 160);
    if ($("ezScriptMode")) {
      const scriptText = String(record.requested_script || "").trim();
      const scriptMode = !scriptText && (record.script_mode === "Force exact" || record.script_mode === "Leave blank")
        ? "AI decides"
        : record.script_mode;
      setSelectValue("ezScriptMode", scriptMode, "AI decides");
    }
    if ($("ezRequestedScript")) $("ezRequestedScript").value = record.requested_script || "";
    if ($("ezThumbnail")) setSelectValue("ezThumbnail", record.thumbnail_mode, "Use Profile Default");
    if ($("ezVoiceoverTail")) $("ezVoiceoverTail").value = record.voiceover_tail_seconds ?? 2;
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
    syncEzStructureCounts();
    hydrateEzOutputsFromMatrix();
  }

  function queueEzConfigSave() {
    syncEzAudioFields();
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
    if (ezEntryPath === "content") syncEzAudioFields();
    else syncRequestVoiceUi({ fromEz: false });
  }

  function hydrateEzCaptionDrafts(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const parts = String(activeProductionRequest?.requested_caption || "").split(/\n\n+/);
    assets.forEach((asset, index) => {
      const id = String(asset?.id || "");
      const staged = ezCaptionDrafts.get(`staged:${index}`);
      const stagedMode = ezCaptionModes.get(`staged:${index}`);
      if (id && staged && !ezCaptionDrafts.has(id)) ezCaptionDrafts.set(id, staged);
      if (id && stagedMode && !ezCaptionModes.has(id)) ezCaptionModes.set(id, stagedMode);
      if (id && !ezCaptionDrafts.has(id) && parts[index]) ezCaptionDrafts.set(id, parts[index]);
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
    const id = String(assetId || "");
    if (!id) return "";
    const mode = ezCaptionModeFor(id);
    const value = ezCaptionDrafts.get(id) || "";
    const locked = ezCaptionsLocked();
    const lockAttr = locked ? " disabled" : "";
    return `<div class="item4-asset-caption-field item4-variant-caption">
      <label><span>Caption</span>
        <select data-ez-caption-mode="${escapeHtml(id)}"${lockAttr}>
          <option value="ai"${mode === "ai" ? " selected" : ""}>AI</option>
          <option value="manual"${mode === "manual" ? " selected" : ""}>Manual</option>
          <option value="none"${mode === "none" ? " selected" : ""}>None</option>
        </select>
      </label>
      <textarea data-ez-asset-caption="${escapeHtml(id)}" rows="2" maxlength="2000" placeholder="Write the caption"${mode === "manual" ? "" : " hidden"}${locked ? " readonly" : ""}>${escapeHtml(value)}</textarea>
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
  }

  function syncEzPlanChrome() {
    const button = $("item4BuildPlan");
    const hint = $("item4PlanHint");
    const ez = ezIsOriginRecord() || ezStarting || ezAutoPlanAfterUpload;
    if (!button) return;
    if (ez) {
      button.hidden = true;
      if (hint) {
        if (item4Workspace?.plan_status === "Ready" && item4Workspace?.plan?.items?.length) {
          hint.textContent = "Platform plan built automatically. Change a format below if you need a different output.";
        } else if (item4Workspace?.assets?.length) {
          hint.textContent = "Studio is building the platform plan from these photos.";
        } else {
          hint.textContent = "Drop photos and Studio will build the platform plan.";
        }
      }
    } else {
      button.hidden = false;
    }
  }

  async function maybeAutoEzPlan(force = false) {
    if (!activeProductionRequest?.id) return;
    if (!ezIsOriginRecord() && !ezAutoPlanAfterUpload && !ezStarting) return;
    if (!item4Workspace?.assets?.length) return;
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

  function collectEzManualCaptions() {
    const byAsset = new Map();
    document.querySelectorAll("[data-ez-asset-caption]").forEach((input) => {
      const id = String(input.dataset.ezAssetCaption || "");
      if (!id || input.hidden || ezCaptionModeFor(id) !== "manual") return;
      const current = String(byAsset.get(id) || "");
      const next = String(input.value || "");
      if (!byAsset.has(id) || (!current.trim() && next.trim())) byAsset.set(id, next);
    });

    const assets = Array.isArray(item4Workspace?.assets) ? item4Workspace.assets : [];
    const ordered = assets
      .map((asset) => String(asset?.id || ""))
      .filter((id) => byAsset.has(id))
      .map((id) => byAsset.get(id));
    return ordered.length ? ordered : Array.from(byAsset.values());
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
    syncEzAudioFields();
    syncEzConfigFields();
    const record = activeProductionRequest || {};
    const requestedPlatforms = selectedRequestPlatforms();
    const recordPlatforms = Array.isArray(record.platforms) ? record.platforms : [];
    const payload = {
      content_type: syncHiddenMasterContentType() || ezControlValue("prContentType", record.content_type || "Photo Set"),
      platforms: requestedPlatforms.length ? requestedPlatforms : (recordPlatforms.length ? recordPlatforms : item4SelectedPlatforms()),
      voiceover_mode: ezControlValue("prVoiceover", record.voiceover_mode || "No"),
      background_music_mode: ezControlValue("prMusicMode", record.background_music_mode || "No"),
      thumbnail_mode: ezControlValue("prThumbnail", record.thumbnail_mode || "Use Profile Default"),
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
      voiceover_tail_seconds: ezControlValue("prVoiceoverTail", record.voiceover_tail_seconds ?? 2),
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
    const mode = ezCaptionMode();
    const captions = collectEzManualCaptions();
    if (mode === "manual" && !captions.some((value) => String(value || "").trim())) return;
    const fields = ezPlanApi()?.ezCaptionFields(mode, { captions }) || {};
    const payload = ezCaptionSavePayload(fields);
    if ($("prRequestedCaption")) $("prRequestedCaption").value = payload.requested_caption || "";
    if ($("prCaptionMode") && Array.from($("prCaptionMode").options).some((option) => option.value === payload.caption_mode)) {
      $("prCaptionMode").value = payload.caption_mode;
    }
    if ($("prTitleMode") && Array.from($("prTitleMode").options).some((option) => option.value === payload.title_mode)) {
      $("prTitleMode").value = payload.title_mode;
    }
    if ($("prRequestedTitle")) $("prRequestedTitle").value = payload.requested_title || "";
    if ($("prProductionNotes")) $("prProductionNotes").value = payload.production_notes || "";
    const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}`, {
      method: "PATCH",
      body: JSON.stringify(payload),
    });
    if (result.record) activeProductionRequest = result.record;
  }

  function renderEzCaptionUi() {
    const mode = ezCaptionMode();
    const hint = $("ezCaptionHint");
    if (hint) {
      if (mode === "manual") hint.textContent = "Write a caption under each photo. Studio saves as you type.";
      else if (mode === "none") hint.textContent = "No AI text and no overlay titles.";
      else hint.textContent = "Studio writes captions. Switch to Manual to caption each photo yourself.";
    }
    renderEzPerPhotoCaptions();
    renderEzPhotoStrip();
    const continueBtn = $("ezContinue");
    if (continueBtn) continueBtn.hidden = true;
    if (item4Workspace?.assets?.length) renderItem4Assets(item4Workspace);
  }

  function syncEzYouTubeAvailability(resetChecked = true) {
    const youtube = $("ezYouTube");
    const single = ezIntakeKind !== "multiple-photos";
    if (!youtube) return;
    youtube.disabled = single;
    if (single) youtube.checked = false;
    else if (resetChecked) youtube.checked = true;
  }

  function selectEzInput(kind, { resetPlatforms = true } = {}) {
    if (kind === "video-clips" || kind === "finished-video") return;
    const nextKind = kind === "multiple-photos" ? "multiple-photos" : "single-photo";
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
    const input = $("ezMediaInput");
    if (input) input.multiple = ezIntakeKind === "multiple-photos";
    const title = $("ezUploadTitle");
    const hint = $("ezUploadHint");
    if (title) title.textContent = ezIntakeKind === "multiple-photos" ? "Drop several photos here" : "Drop one photo here";
    if (hint) hint.textContent = ezIntakeKind === "multiple-photos"
      ? "Drop several photos. They show up here immediately."
      : "Drop one photo. It shows up here immediately.";
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

  async function startEzFromFiles(fileList) {
    const apiHelpers = ezPlanApi();
    if (!apiHelpers) throw new Error("EZ plan helper did not load");
    const supported = Array.from(fileList || []).filter(item4IsSupportedPhotoFile);
    if (!supported.length) {
      setEzMessage("Choose one or more photo files. HEIC and HEIF are supported.", "error-text");
      return;
    }
    if (!ezIntakeKind) {
      selectEzInput(supported.length > 1 ? "multiple-photos" : "single-photo", { resetPlatforms: false });
    }
    if (ezIntakeKind === "single-photo" && supported.length > 1) {
      setEzMessage("Single photo uses the first image. Choose Multiple photos for a set.", "");
    }
    const files = ezIntakeKind === "single-photo" ? supported.slice(0, 1) : supported;
    if (ezIntakeKind === "multiple-photos" && files.length < 2) {
      setEzMessage("Drop at least two photos, or choose Single photo.", "error-text");
      return;
    }
    ezStagedFiles = files;
    stageEzLocalPreviews(files);
    renderEzPhotoStrip();
    const captionMode = ezCaptionMode();
    const captions = collectEzManualCaptions();
    if (ezStarting) return;
    ezStarting = true;
    const continueBtn = $("ezContinue");
    if (continueBtn) continueBtn.disabled = true;
    setEzMessage("Saving in the background…");
    try {
      item4PlanOverrides = {};
      const planned = applyEzPlanOverrides(files.length, ezSelectedPlatforms());
      syncItem4PlatformsFromEz();
      syncEzAudioFields();
      syncEzConfigFields();
      const extras = ezExtraOutputSnapshot();
      let captionFields = apiHelpers.ezCaptionFields(captionMode, { captions });
      if (captionFields.caption_mode === "Force exact" && !String(captionFields.requested_caption || "").trim()) {
        captionFields = { ...captionFields, caption_mode: "AI decides", requested_caption: "" };
      }
      const idea = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({
          title: titleFromFiles(files),
          summary: ezIdeaSummaryValue(ezIntakeKind),
        }),
      });
      activeIdea = idea.record;
      if ($("ezIdeaTitle") && !String($("ezIdeaTitle").value || "").trim()) {
        $("ezIdeaTitle").value = activeIdea.title || "";
      }
      if ($("ezIdeaSummary") && !String($("ezIdeaSummary").value || "").trim()) {
        $("ezIdeaSummary").value = userIdeaSummaryFromStored(activeIdea.summary);
      }
      syncEzIdeaIdentityFields();
      setEzIdeaIdentityHint("Saved. You can keep editing.");
      const slideMode = $("ezCarouselSlideMode")?.value || "Exact";
      const requestPayload = {
        content_type: planned.master_content_type,
        platforms: planned.platforms,
        voiceover_mode: $("ezAudioVoiceover")?.value || "No",
        background_music_mode: $("ezAudioMusic")?.value || "No",
        thumbnail_mode: $("ezThumbnail")?.value || "Use Profile Default",
        video_duration_seconds: $("ezVideoDuration")?.value || 30,
        video_clip_count_mode: $("ezVideoClipMode")?.value || "AI decides",
        video_clip_count_exact: $("ezVideoClipExact")?.value || "",
        video_clip_count_min: $("ezVideoClipMin")?.value || "",
        video_clip_count_max: $("ezVideoClipMax")?.value || "",
        voiceover_tail_seconds: $("ezVoiceoverTail")?.value || 2,
        title_mode: ezTitleIsCustomized() ? ($("ezTitleMode")?.value || "AI decides") : (captionFields.title_mode || "AI decides"),
        requested_title: ezTitleIsCustomized() ? String($("ezRequestedTitle")?.value || "").trim() : (captionFields.requested_title || ""),
        caption_mode: captionFields.caption_mode,
        requested_caption: captionFields.requested_caption || "",
        script_mode: ezScriptIsCustomized() ? ($("ezScriptMode")?.value || "AI decides") : (captionFields.script_mode || "AI decides"),
        requested_script: ezScriptIsCustomized() ? String($("ezRequestedScript")?.value || "") : (captionFields.requested_script || ""),
        carousel_image_mode: $("ezCarouselImageMode")?.value || "Manual Upload",
        carousel_slide_count_mode: slideMode,
        carousel_slide_count_exact: $("ezCarouselSlideExact")?.value || (slideMode === "Exact" ? files.length : ""),
        carousel_slide_count_min: $("ezCarouselSlideMin")?.value || "",
        carousel_slide_count_max: $("ezCarouselSlideMax")?.value || "",
        selected_music_asset_id: $("ezAudioTrack")?.value || "",
        production_notes: mergeEzProductionNotes(),
        ...selectedRequestVoice(),
      };
      await ensureProductionRequestMusic();
      const created = await createEzProductionRequest(activeIdea.id, requestPayload);
      setEzAdvancedOpen(false);
      populateProductionRequestForm(created.record, { reveal: false });
      await loadProductionRequestOutputs(created.record);
      applyEzExtraOutputs(extras);
      if (extras.length) await saveProductionRequestOutputs(created.record);
      await loadItem4Workspace(created.record);
      await loadProductionRequests();
      ezAutoPlanAfterUpload = true;
      setEzMessage("Uploading originals…");
      await uploadItem4Files(files);
      renderEzPhotoStrip();
    } catch (error) {
      const saved = Boolean(activeProductionRequest?.id);
      const message = saved
        ? `Your photos are still here, but Studio could not finish saving (${error.message}). You can keep editing captions.`
        : error.message;
      setEzMessage(message, "error-text");
      setRequestMessage(error.message, "error-text");
    } finally {
      ezStarting = false;
      if (continueBtn) continueBtn.disabled = false;
    }
  }

  function bindEzIntake() {
    $("ezStartContent")?.addEventListener("click", () => enterEzContentPath());
    $("ezStartIdea")?.addEventListener("click", () => enterEzIdeaPath());
    $("ezStartOver")?.addEventListener("click", () => {
      revokeEzLocalPreviews();
      ezStagedFiles = [];
      ezIntakeKind = null;
      ezCaptionDefault = "ai";
      ezCaptionModes.clear();
      ezCaptionDrafts.clear();
      if ($("ezIdeaTitle")) $("ezIdeaTitle").value = "";
      if ($("ezIdeaSummary")) $("ezIdeaSummary").value = "";
      if ($("ezTitle")) $("ezTitle").value = "";
      setEzIdeaIdentityHint("You can edit these anytime. Photos do not lock the name.");
      document.querySelectorAll("[data-ez-input]").forEach((button) => button.classList.remove("selected"));
      renderEzPhotoStrip();
      setEzMessage();
      goHome();
    });
    ["ezIdeaTitle", "ezIdeaSummary"].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("input", queueEzIdeaIdentitySave);
      el.addEventListener("change", queueEzIdeaIdentitySave);
    });
    $("ezAudioTrack")?.addEventListener("change", () => {
      if ($("ezAudioTrack")?.value) clearPreviewPickMessage();
    });
    $("ezAudioVoice")?.addEventListener("change", () => {
      if ($("ezAudioVoice")?.value) clearPreviewPickMessage();
    });
    ["ezAudioVoiceover", "ezAudioMusic", "ezAudioTrack", "ezAudioVoice"].forEach((id) => {
      $(id)?.addEventListener("change", () => {
        stopStudioAudioPreview();
        syncEzAudioFields();
        if (activeProductionRequest?.id) saveActiveProductionRequest({ quiet: true }).catch(() => {});
      });
    });
    [
      "ezTitleMode", "ezRequestedTitle", "ezScriptMode", "ezRequestedScript",
      "ezThumbnail", "ezVoiceoverTail", "ezVideoDuration", "ezVideoClipMode",
      "ezVideoClipExact", "ezVideoClipMin", "ezVideoClipMax", "ezCarouselSlideMode",
      "ezCarouselSlideExact", "ezCarouselSlideMin", "ezCarouselSlideMax",
      "ezCarouselImageMode", "ezProductionNotes",
    ].forEach((id) => {
      const el = $(id);
      if (!el) return;
      el.addEventListener("change", queueEzConfigSave);
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") el.addEventListener("input", queueEzConfigSave);
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
    document.querySelectorAll('input[name="ezCaptionMode"]').forEach((input) => {
      input.addEventListener("change", renderEzCaptionUi);
    });
    document.querySelectorAll("[data-ez-platform]").forEach((input) => {
      input.addEventListener("change", () => {
        syncItem4PlatformsFromEz();
        if ((ezIsOriginRecord() || ezStarting) && item4Workspace?.assets?.length) {
          maybeAutoEzPlan(true);
        }
      });
    });
    $("ezChooseMedia")?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      $("ezMediaInput")?.click();
    });
    $("ezMediaInput")?.addEventListener("change", (event) => {
      startEzFromFiles(event.target.files);
      event.target.value = "";
    });
    $("ezContinue")?.addEventListener("click", () => startEzFromFiles(ezStagedFiles));
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
    const v = String(value || fallback || "").trim();
    return v || fallback || "—";
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

  function item4AssetPreviewCandidates(asset) {
    try {
      const candidates = [];
      const name = String(asset?.name || "");
      const local = ezLocalPreviewFor(Number(asset?.order || 0) - 1, name);
      const cdn = String(asset?.preview_url || "").trim();
      // Keep the dropped file on screen for this session while Drive/CDN copies
      // catch up. Durable URLs remain fallbacks for reload and HEIC originals.
      if (local) candidates.push(local);
      if (cdn) candidates.push(cdn);
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

  function item4AssetPlaceholder(asset, label = "Preview unavailable") {
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const format = ext || (item4IsHeicAsset(asset) ? "HEIC" : "IMAGE");
    return `<div class="item4-heic-placeholder item4-image-placeholder"><strong>${escapeHtml(format)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function item4AssetThumb(asset) {
    const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : "Original";
    const isHeic = item4IsHeicAsset(asset);
    const candidates = item4AssetPreviewCandidates(asset);
    const previewUrl = candidates[0] || "";
    const visual = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(asset.name || "Master photo")}" loading="lazy" data-item4-preview-image data-preview-src="${escapeHtml(previewUrl)}" data-preview-failure-key="${escapeHtml(String(asset.id || asset.media_asset_record_id || previewUrl))}">`
      : item4AssetPlaceholder(asset, isHeic ? "Original preserved" : "Preview unavailable");
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const formatNote = ext ? ` · ${ext} original` : (isHeic ? " · HEIC original" : "");
    const showCaption = ezManualCaptionsEnabled() && (ezPhotoSetActive() || ezIntakeKind === "single-photo");
    const captionField = showCaption ? item4CaptionField(asset.id) : "";
    return `<article class="item4-asset-card${showCaption ? " with-caption" : ""}" data-item4-asset="${escapeHtml(asset.id)}">
      <div class="item4-thumb">${visual}</div>
      <div class="item4-asset-meta"><strong>${escapeHtml(asset.name || "Photo")}</strong><span>Photo ${escapeHtml(asset.order || "")} · ${escapeHtml(dims)}${formatNote}</span></div>
      ${captionField}
      <button type="button" class="item4-remove-asset" data-remove-item4-asset="${escapeHtml(asset.id)}" title="Remove this master photo">×</button>
    </article>`;
  }

  function renderItem4Assets(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const host = $("item4AssetStrip");
    const badge = $("item4AssetStatus");
    const authority = String(status?.assets_status || "None");
    if (authority === "Ready") item4PreviewFailures.clear();
    if (badge) {
      badge.textContent = !assets.length
        ? "No media yet"
        : authority === "Ready"
          ? `${assets.length} photo${assets.length === 1 ? "" : "s"} ready`
          : authority === "Error"
            ? "Master media needs attention"
            : `${assets.length} photo${assets.length === 1 ? "" : "s"} processing`;
    }
    if (!host) return;
    hydrateEzCaptionDrafts(status);
    if (!assets.length && (item4Uploading || ezStagedFiles.length || String(status?.assets_status || "") === "Uploading")) {
      host.innerHTML = '<div class="empty compact-empty">Photos are loading into the system. You can keep working or leave this screen.</div>';
    } else {
      host.innerHTML = assets.length ? assets.map(item4AssetThumb).join("") : '<div class="empty compact-empty">No master photos uploaded yet.</div>';
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
    bindEzCaptionInputs(host);
    productionDecorateTooltips(host);
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
    if (!host) return;
    if (!plan?.items?.length) {
      host.innerHTML = '<div class="empty compact-empty">Your platform recommendations will appear here.</div>';
      if (gate) gate.hidden = true;
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
        if (button) button.textContent = "Update platform plan";
      });
    });
    if (gate) gate.hidden = status?.plan_status !== "Ready";
    productionDecorateTooltips(host);
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
    const variantRows = item4VariantRows(status?.variants, ratio);
    if (variantRows.length) {
      return variantRows.map((row) => ({
        asset: item4MasterAsset(row.asset?.id) || row.asset,
        variant: row.variant,
      }));
    }
    return (Array.isArray(status?.assets) ? status.assets : []).map((asset) => ({ asset, variant: null }));
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

  function item4VariantThumb(row, ratio) {
    const master = item4MasterAsset(row.asset?.id) || row.asset;
    const previewUrl = item4AssetPreviewUrl(master) || item4VariantPreviewUrl(row.variant);
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
        <strong>Photo ${escapeHtml(row.asset?.order || "")}</strong>
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
    const variantStatus = status?.variant_status || "None";
    const manifest = status?.variants || null;
    const readyCount = Number(manifest?.ready_count || 0);
    const targetCount = Number(manifest?.target_count || manifest?.source_asset_count || 0);
    if (badge) badge.textContent = variantStatus === "Ready"
      ? `${readyCount} variants ready`
      : variantStatus === "Preparing"
        ? `Preparing… ${readyCount}/${targetCount || "?"} ready`
        : variantStatus === "Error" ? "Needs attention" : "Not prepared";
    if (error) {
      error.hidden = !status?.variant_error;
      error.textContent = status?.variant_error || "";
    }
    if (button) {
      button.disabled = status?.plan_status !== "Ready" || item4PreparingVariants || variantStatus === "Preparing";
      button.textContent = variantStatus === "Ready"
        ? "Rebuild platform media"
        : (item4PreparingVariants || variantStatus === "Preparing")
          ? `Preparing… ${readyCount}/${targetCount || "?"}`
          : "Prepare platform media";
    }
    if (hint) {
      hint.textContent = status?.plan_status !== "Ready"
        ? "Build the platform plan first."
        : variantStatus === "Preparing"
          ? `Studio is preparing platform media in the background. This page updates automatically (${readyCount}/${targetCount || "?"} ready).`
          : variantStatus === "Error"
            ? "Preparation stopped at the failed transformation. The originals are still safe."
            : variantStatus === "Ready"
              ? "Rebuild if you change the crop."
              : "Click Prepare when the framing looks right.";
    }
    if (!host) return;
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
    const assetsReady = Array.isArray(status?.assets) && status.assets.length;
    if (!ratios.length || !assetsReady) {
      host.innerHTML = variantStatus === "Ready"
        ? '<div class="empty compact-empty">Platform variants are prepared. Preview details are being reconciled from the media manifest.</div>'
        : '<div class="empty compact-empty">Prepared 4:5, 9:16, 1:1, or 16:9 versions will appear here only when required by the selected outputs.</div>';
      return;
    }
    host.innerHTML = ratios.map(ratio => {
      const rows = item4CropRows(status, ratio);
      const spec = rows[0]?.variant || {};
      const safeNote = ratio === "9:16" ? '<span class="item4-safe-note">Dashed box = centered 4:5 critical-content zone</span>' : "";
      return `<section class="item4-ratio-group"><div class="item4-ratio-heading"><div><strong>${escapeHtml(ratio)}</strong><span>${escapeHtml(spec.width || "")}${spec.width ? "×" : ""}${escapeHtml(spec.height || "")}${spec.width ? " · " : ""}${rows.length} photo${rows.length === 1 ? "" : "s"} · drag to reframe</span></div>${safeNote}</div><div class="item4-variant-strip">${rows.map(row => item4VariantThumb(row,ratio)).join("")}</div></section>`;
    }).join("");
    host.querySelectorAll(".item4-crop-frame img[data-item4-preview-image]").forEach((img) => {
      const frame = img.closest(".item4-crop-frame");
      const assetId = frame?.dataset.item4CropAsset;
      const master = item4MasterAsset(assetId) || {};
      item4BindPreviewImage(img, {
        candidates: item4AssetPreviewCandidates(master),
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

  function item4MasterProgressMarkup(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const ready = item4MasterReadyCount(status);
    const target = assets.length || ezStagedFiles.length;
    const state = String(status?.assets_status || (item4Uploading ? "Uploading" : "None"));
    const loading = item4Uploading || state === "Uploading" || state === "Processing" || (target && state !== "Ready" && state !== "Error");
    if (!target && !loading) return null;
    if (state === "Ready") {
      return {
        heal: "ready",
        title: "Photos are loaded into the system.",
        body: `${target} photo${target === 1 ? "" : "s"} saved to Google Drive. You can keep editing or leave this screen anytime.`,
      };
    }
    if (state === "Error") {
      return {
        heal: "error",
        title: "Master photos need attention.",
        body: `${ready} of ${target} saved. Your originals remain in Studio. You can keep working or leave this screen.`,
      };
    }
    const count = target ? ` ${ready} of ${target} saved so far.` : "";
    return {
      heal: "uploading",
      title: "Photos are loading into the system.",
      body: `You can keep working on this screen, or leave and come back. Your photos stay in Studio while Google Drive copies finish in the background.${count}`,
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
        return;
      }
      progress.hidden = false;
      progress.dataset.heal = markup.heal;
      progress.innerHTML = `<strong>${escapeHtml(markup.title)}</strong><span>${escapeHtml(markup.body)}</span>`;
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
      if (state === "Ready") {
        stopItem4MasterPolling();
        setRequestMessage("Photos are loaded into the system. You can keep working or leave this screen anytime.", "success");
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
        setRequestMessage("Photos are still loading into the system. You can keep working or leave this screen; Studio will finish Drive copies in the background.", "success");
        return;
      }
      if (decision.mode === "revalidate") {
        item4MasterExtraWindows = decision.extra_windows_used;
        setRequestMessage(`Photos are still loading into the system. You can keep working or leave. Automatic retry ${item4MasterExtraWindows}/${ITEM4_POLL_EXTRA_WINDOWS}.`, "success");
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
    if (item4VariantPollTimer) clearTimeout(item4VariantPollTimer);
    item4VariantPollTimer = null;
    item4VariantPollStartedAt = 0;
  }

  async function pollItem4Variants() {
    if (!activeProductionRequest?.id) { stopItem4VariantPolling(); return; }
    if (!item4VariantPollStartedAt) item4VariantPollStartedAt = Date.now();
    try {
      await loadItem4Workspace(activeProductionRequest);
      const state = item4Workspace?.variant_status || "None";
      if (state === "Ready") {
        stopItem4VariantPolling();
        setRequestMessage("Platform-ready media is complete. Review the prepared crops below.", "success");
        return;
      }
      if (state === "Error") {
        stopItem4VariantPolling();
        setRequestMessage(item4Workspace?.variant_error || "Platform-media preparation needs attention.", "error-text");
        return;
      }
      const decision = item4NextStatusPoll(Date.now() - item4VariantPollStartedAt, ITEM4_VARIANT_POLL_TIMEOUT_MS, item4VariantExtraWindows);
      if (!decision.continue) {
        stopItem4VariantPolling();
        setRequestMessage("Platform media is still reconciling. Studio will recheck automatically; no refresh or second click is needed.", "success");
        return;
      }
      if (decision.mode === "revalidate") {
        item4VariantExtraWindows = decision.extra_windows_used;
        setRequestMessage(`Platform media is still preparing. Automatic retry ${item4VariantExtraWindows}/${ITEM4_POLL_EXTRA_WINDOWS}. No refresh needed.`, "success");
        item4VariantPollTimer = setTimeout(pollItem4Variants, decision.delay_ms);
        return;
      }
    } catch (error) {
      // Transient polling errors should not convert a valid background job into a user-facing failure.
      console.warn("Item 4 variant status poll deferred", error);
    }
    item4VariantPollTimer = setTimeout(pollItem4Variants, ITEM4_VARIANT_POLL_MS);
  }

  function startItem4VariantPolling() {
    stopItem4VariantPolling();
    item4VariantPollStartedAt = Date.now();
    item4VariantExtraWindows = 0;
    item4VariantPollTimer = setTimeout(pollItem4Variants, 800);
  }

  function item4PreparingInBackgroundMessage() {
    return "Platform media is preparing in the background. Progress updates automatically; no refresh or second click is needed.";
  }

  function item4IsRetryablePrepareFailure(error, status) {
    const variantStatus = String(status?.variant_status || "");
    if (variantStatus === "Preparing") return true;
    if (variantStatus === "Error") return false;
    const message = String(error?.message || error || "");
    return /request failed \(5\d{2}\)/i.test(message)
      || isTimeoutError(error)
      || /platform media preparation is still running/i.test(message);
  }

  async function prepareItem4Variants() {
    if (!activeProductionRequest?.id || item4PreparingVariants) return;
    item4PreparingVariants = true;
    if (item4Workspace) {
      item4Workspace = {
        ...item4Workspace,
        variant_status: item4Workspace.variant_status === "Ready" ? "Ready" : "Preparing",
      };
    }
    renderItem4Variants(item4Workspace || {});
    startItem4VariantPolling();
    setRequestMessage("Starting platform-media preparation…", "success");
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/variants`, {method:"POST",body:JSON.stringify({ crops: collectItem4Crops() }),timeoutMs:45000});
      if (result.production_request) activeProductionRequest = result.production_request;
      await loadItem4Workspace(activeProductionRequest);
      if (item4Workspace?.variant_status === "Ready") {
        setRequestMessage(result.message || "Platform-ready media prepared. Review the crops below.", "success");
      } else {
        setRequestMessage(item4PreparingInBackgroundMessage(), "success");
        startItem4VariantPolling();
      }
    } catch (error) {
      await loadItem4Workspace(activeProductionRequest).catch(()=>{});
      if (item4IsRetryablePrepareFailure(error, item4Workspace)) {
        setRequestMessage(item4PreparingInBackgroundMessage(), "success");
        startItem4VariantPolling();
      } else {
        setRequestMessage(error.message, "error-text");
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
    const hint = $("item4PlanHint");
    const button = $("item4BuildPlan");
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    if (button) button.disabled = !assets.length || item4Uploading;
    if (hint) hint.textContent = !assets.length ? "Upload photos first, then build the plan." : status?.plan_status === "Ready" ? "Recommendations are saved. Change a format and choose Update platform plan if needed." : "Ready to recommend the best output for each selected platform.";
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
    if (status?.variant_status === "Preparing" && !item4VariantPollTimer) startItem4VariantPolling();
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

  async function loadItem4BridgePreflight(record = activeProductionRequest) {
    if (!record?.id) return null;
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/bridge-preflight`);
      item4BridgePreflight = result;
      setProductionRequestControlState(activeProductionRequest || record);
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

  function item4IsSupportedPhotoFile(file) {
    const mime = String(file?.type || "").toLowerCase();
    const ext = item4UploadFileExtension(file?.name);
    return mime.startsWith("image/") || ext === "heic" || ext === "heif";
  }

  async function imageMetadataForFiles(files) {
    const result = [];
    for (const file of files) {
      let width = null, height = null;
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width; height = bitmap.height; bitmap.close();
      } catch {}
      result.push({ name: file.name, width, height });
    }
    return result;
  }

  async function uploadItem4Files(fileList) {
    if (!activeProductionRequest?.id || item4Uploading) return;
    if (!ezIntakeKind) {
      setRequestMessage("Choose Single photo or Multiple photos before uploading.", "error-text");
      syncPrMediaKindUi();
      return;
    }
    let files = Array.from(fileList || []).filter(item4IsSupportedPhotoFile);
    if (!files.length) { setRequestMessage("Choose one or more photo files. HEIC and HEIF are supported.", "error-text"); return; }
    if (ezIntakeKind === "single-photo" && files.length > 1) {
      setRequestMessage("Single photo uses the first image. Choose Multiple photos for a set.", "");
      files = files.slice(0, 1);
    }
    if (ezIntakeKind === "multiple-photos" && files.length < 2) {
      setRequestMessage("Multiple photos needs at least two images, or choose Single photo.", "error-text");
      return;
    }
    item4Uploading = true;
    const progress = $("item4UploadProgress");
    const button = $("item4BuildPlan");
    paintItem4LocalPreviews(files, { uploading: true });
    if (button) button.disabled = true;
    setRequestMessage("Photos are loading into the system. You can keep working on this screen, or leave and come back — Drive copies finish in the background.", "success");
    try {
      mergeEzProductionNotes();
      const metadata = await imageMetadataForFiles(files);
      const form = new FormData();
      files.forEach(file => form.append("files", file, file.name));
      form.append("metadata", JSON.stringify(metadata));
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets`, { method: "POST", body: form, timeoutMs: 90000 });
      if (result.record) activeProductionRequest = result.record;
      await loadItem4Workspace(activeProductionRequest);
      syncPrMediaKindUi();
      if (item4Workspace?.assets_status === "Ready") {
        updateItem4MasterProgress(item4Workspace);
        setRequestMessage("Photos are loaded into the system. You can keep working or leave this screen anytime.", "success");
      } else {
        updateItem4MasterProgress(item4Workspace || {});
        setRequestMessage("Photos are loading into the system. You can keep working or leave this screen — Drive copies finish in the background.", "success");
        startItem4MasterPolling();
      }
      await maybeAutoEzPlan();
      renderEzCaptionUi();
      renderEzPhotoStrip();
    } catch (error) {
      ezAutoPlanAfterUpload = false;
      if (progress) {
        progress.hidden = false;
        progress.dataset.heal = "error";
        progress.innerHTML = `<strong>Photo upload needs attention.</strong><span>${escapeHtml(error.message)}</span>`;
      }
      setRequestMessage(error.message, "error-text");
    } finally {
      item4Uploading = false;
      if (button) button.disabled = !(item4Workspace?.assets?.length);
    }
  }

  async function removeItem4Asset(assetId) {
    if (!activeProductionRequest?.id || !assetId) return;
    if (!window.confirm("Remove this photo from the master source set? The other originals will be preserved.")) return;
    try {
      await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(assetId)}`, {method:"DELETE", body:JSON.stringify({})});
      await loadItem4Workspace(activeProductionRequest);
      setRequestMessage("Master photo removed. Rebuild the platform plan before production.", "success");
      if (ezIsOriginRecord()) await maybeAutoEzPlan(true);
    } catch (error) { setRequestMessage(error.message, "error-text"); }
  }

  async function buildItem4Plan() {
    if (!activeProductionRequest?.id) return;
    syncItem4PlatformsFromEz();
    const selected = ezSelectedPlatforms().length ? ezSelectedPlatforms() : item4SelectedPlatforms();
    const count = item4Workspace?.assets?.length || 0;
    const platforms = ezPlanPlatforms(count, selected);
    if (!platforms.length) { setRequestMessage("Choose at least one platform.", "error-text"); return; }
    const button = $("item4BuildPlan");
    if (button) { button.disabled = true; button.textContent = "Building plan…"; }
    setRequestMessage();
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/plan`, {method:"POST", body:JSON.stringify({platforms,overrides:item4PlanOverrides,extras:item4EnabledExtraPairs()}), timeoutMs:30000});
      if (result.production_request) activeProductionRequest = result.production_request;
      productionRequestOutputs = Array.isArray(result.outputs) ? result.outputs : productionRequestOutputs;
      populateProductionRequestForm(activeProductionRequest);
      renderProductionRequestOutputCards();
      await loadItem4Workspace(activeProductionRequest);
      await loadProductionRequestOutputs(activeProductionRequest);
      setRequestMessage(result.message || "Platform plan ready.", "success");
    } catch (error) { setRequestMessage(error.message, "error-text"); }
    finally {
      if (button) {
        button.textContent = item4Workspace?.plan?.items?.length ? "Update platform plan" : "Recommend platform plan";
        button.disabled = !(item4Workspace?.assets?.length);
      }
      syncEzPlanChrome();
    }
  }

  function selectedRequestPlatforms() {
    return Array.from(document.querySelectorAll('input[name="prPlatform"]:checked')).map(input => input.value);
  }

  function setRequestMessage(text = "", type = "") {
    const target = $("productionRequestMessage");
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

  async function ensureProductionRequestMusic() {
    if (productionRequestMusic.length) return productionRequestMusic;
    const { records = [] } = await api("/api/music?limit=100");
    productionRequestMusic = records.filter(record => !record.do_not_use);
    const select = $("prMusicAsset");
    select.innerHTML = '<option value="">AI / profile chooses track</option>' + productionRequestMusic.map(record => {
      const preview = record.preview_url || (record.preview_available ? `/api/music/${record.id}/preview` : "");
      return `<option value="${escapeHtml(record.id)}" data-preview="${escapeHtml(preview)}">${escapeHtml(record.display_name || record.name || record.id)}</option>`;
    }).join("");
    return productionRequestMusic;
  }

  const OUTPUT_DEFAULTS_BY_CONTENT_TYPE = {
    "Vertical Short Video": {Instagram:"Reel", Facebook:"Reel", TikTok:"Video Draft", YouTube:"Short"},
    "Story": {Instagram:"Story", Facebook:"Story", TikTok:"Story"},
    "Carousel": {Instagram:"Carousel", Facebook:"Multi-Image Post", TikTok:"Multi-Photo"},
    "Feed Post": {Instagram:"Single Image", Facebook:"Single Image", TikTok:"Multi-Photo"},
    "Photo Set": {Instagram:"Reel", Facebook:"Slideshow Reel", TikTok:"Video Draft", YouTube:"Short"},
    "Longform Video": {YouTube:"Standard Video"},
  };

  function outputMatrixInputs() {
    return Array.from(document.querySelectorAll("[data-pr-output]"));
  }

  function selectedOutputMatrix() {
    return outputMatrixInputs().filter(input => input.checked).map(input => ({
      platform: input.dataset.platform,
      output_type: input.value,
      enabled: true,
    }));
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
        const text = "TikTok Story is not a posting destination. Instagram and Facebook Stories are 15-second 9:16 teasers from the first photo, with a slight zoom and music. After the main post is live, the Story can link through to it.";
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
    select.innerHTML = '<option value="">Inherit master track</option>' + productionRequestMusic.map(track =>
      `<option value="${escapeHtml(track.id)}">${escapeHtml(track.display_name || track.name || track.id)}</option>`
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
    setOverrideValue("prOverrideScheduledAt", row.scheduled_at ? new Date(row.scheduled_at).toISOString().slice(0,16) : "");

    fillOverrideMusicChoices(row);
    $("prOverrideClipSection").hidden = !isVideoClipOutput(row.output_type);
    $("prOverrideSlideSection").hidden = !isSlideOutput(row.output_type);
    $("prOverrideDurationField").hidden = !isVideoClipOutput(row.output_type) && !["Slideshow Reel","Slideshow Video"].includes(row.output_type);
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
    const count = item4Workspace?.assets?.length || (usingEzPlatforms() ? ezStagedFiles.length : 0);
    if (count > 0 || usingEzPlatforms()) {
      const planned = ezPlanApi()?.ezPlanFromPhotoCount({
        photoCount: count,
        platforms: [platform],
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
    const status = String(record?.status || "Draft");
    const editable = status === "Draft" || status === "Ready";
    const form = $("productionRequestForm");

    if (form) {
      form.querySelectorAll("input, select, textarea").forEach((control) => {
        if (control.matches("[data-ez-asset-caption], [data-ez-caption-mode], #ezIdeaTitle, #ezIdeaSummary")) return;
        control.disabled = !editable;
      });
    }
    syncEzIdeaIdentityFields();
    syncEzCaptionLock();

    const save = $("saveProductionRequest");
    if (save) {
      save.disabled = !editable;
      save.textContent = editable ? "Save draft" : (status === "Promoted" ? "Draft locked" : "Submitted");
    }

    const promote = $("promoteProductionRequest");
    if (promote) {
      if (status === "Promoted") {
        promote.disabled = true;
        promote.textContent = "Promoted";
      } else if (status === "Submitted") {
        promote.disabled = false;
        promote.textContent = "Check promotion status";
      } else if (item4Workspace?.assets?.length) {
        const planReady = item4Workspace?.plan_status === "Ready";
        const variantsReady = item4Workspace?.variant_status === "Ready";
        const bridgeReady = Boolean(item4BridgePreflight?.ready);
        const bridgePending = Boolean(item4BridgePreflight?.pending) || item4BridgePreflight === null;
        const bridgeBlocked = item4BridgePreflight && !bridgeReady && !bridgePending;
        promote.disabled = item4Uploading || item4PreparingVariants || (planReady && variantsReady && bridgeBlocked);
        promote.textContent = !planReady
          ? "Build platform plan first"
          : (!variantsReady
              ? "Prepare platform media next"
              : (bridgeReady || bridgePending ? "Approve & Promote" : "Approve & Promote"));
        promote.title = !planReady
          ? "Save the platform plan first."
          : (!variantsReady
              ? "Prepare the platform crops next."
              : (bridgeReady
                  ? "Approve this request and start production."
                  : "Studio is finishing a quick check. You can approve when it completes."));
      } else {
        promote.disabled = false;
        promote.textContent = "Approve & Promote";
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
      let text = "Photos, plan, and platform crops need to be ready before you approve.";
      if (status === "Promoted") {
        kind = "success";
        text = "Approved. This request is in production.";
      } else if (status === "Submitted") {
        text = "This request was sent. Use Check promotion status if you need an update.";
      } else if (item4Workspace?.assets?.length) {
        if (item4Workspace?.plan_status !== "Ready") {
          text = "Photos are saved. Next: save the platform plan.";
        } else if (item4Workspace?.variant_status !== "Ready") {
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
    $("productionRequestTitle").textContent = activeIdea?.title || record.production_request_id || "Production request";
    $("productionRequestSubtitle").textContent = `${record.production_request_id || "Draft"} · Creative configuration remains editable until submission.`;
    $("productionRequestStatus").textContent = record.status || "Draft";
    $("productionRequestStatus").className = `badge ${stateClass(record.status || "Draft")}`;

    setSelectValue("prContentType", record.content_type, "");
    syncHiddenMasterContentType();
    document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
      input.checked = Array.isArray(record.platforms) && record.platforms.includes(input.value);
    });
    setSelectValue("prVoiceover", record.voiceover_mode, "No");
    setSelectValue("prMusicMode", record.background_music_mode, "No");
    setSelectValue("prThumbnail", record.thumbnail_mode, "Use Profile Default");
    if (record.voiceover_mode === "Yes") {
      applyVoiceToSelects(record.voice_id || DEFAULT_VOICE_ID, record.voice_name || DEFAULT_VOICE_NAME);
    }
    syncRequestVoiceUi();
    $("prVideoDuration").value = record.video_duration_seconds ?? 30;
    setSelectValue("prVideoClipMode", record.video_clip_count_mode, "AI decides");
    $("prVideoClipExact").value = record.video_clip_count_exact ?? "";
    $("prVideoClipMin").value = record.video_clip_count_min ?? "";
    $("prVideoClipMax").value = record.video_clip_count_max ?? "";
    setSelectValue("prCarouselSlideMode", record.carousel_slide_count_mode, "AI decides");
    $("prCarouselSlideExact").value = record.carousel_slide_count_exact ?? "";
    $("prCarouselSlideMin").value = record.carousel_slide_count_min ?? "";
    $("prCarouselSlideMax").value = record.carousel_slide_count_max ?? "";
    setSelectValue("prCarouselImageMode", record.carousel_image_mode, "Make AI Generated");
    $("prVoiceoverTail").value = record.voiceover_tail_seconds ?? 2;
    setSelectValue("prTitleMode", record.title_mode, "AI decides");
    $("prRequestedTitle").value = record.requested_title || "";
    setSelectValue("prCaptionMode", record.caption_mode, "AI decides");
    $("prRequestedCaption").value = record.requested_caption || "";
    setSelectValue("prScriptMode", record.script_mode, "AI decides");
    $("prRequestedScript").value = record.requested_script || "";
    $("prProductionNotes").value = record.production_notes || "";
    const musicId = Array.isArray(record.selected_music_asset_links) ? record.selected_music_asset_links[0] : "";
    $("prMusicAsset").value = musicId || "";
    syncAllStructureControls();
    setProductionRequestControlState(record);
    setRequestMessage();
    const parsed = ezPlanApi()?.parseEzOriginNotes(record.production_notes);
    if (ezEntryPath === "content" && (parsed?.inputKind === "multiple-photos" || parsed?.inputKind === "single-photo")) {
      selectEzInput(parsed.inputKind, { resetPlatforms: false });
      document.querySelectorAll("[data-ez-platform]").forEach((input) => {
        input.checked = Array.isArray(record.platforms) && record.platforms.includes(input.value);
      });
      syncEzYouTubeAvailability(false);
      if (parsed.captionMode) {
        ezCaptionDefault = parsed.captionMode;
        renderEzCaptionUi();
      }
    }
    if (ezEntryPath === "content") hydrateEzConfigFromRequest(record);
    // Always start collapsed; operators can expand when they need the matrix.
    setEzAdvancedOpen(false);
    loadEzAudioOptions().catch(() => {});
  }

  async function openProductionRequestForIdea(idea) {
    if (!idea?.id) return;
    const button = $("configureProductionButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Opening…";
    }
    setManageMessage("Opening Phase 2B Production Request…", "");

    try {
      await Promise.all([ensureProductionRequestMusic(), loadEzAudioOptions()]);
      const result = await api(`/api/ideas/${encodeURIComponent(idea.id)}/production-request`, {
        method: "POST",
        body: JSON.stringify({}),
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
      if (!assetCount) selectPrMediaKind(null, { quiet: true });
      else syncPrMediaKindUi();
      await loadProductionRequests();
      setEzAdvancedOpen(false);
      setRequestMessage(result.created ? "Production Request draft created. Choose Single or Multiple photos, then upload." : "Existing Production Request draft opened.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      if (button && activeIdea && !ideaIsPromoted(activeIdea) && !activeIdea.is_on_hold) {
        button.disabled = false;
        button.textContent = "Add photos";
      }
    }
  }

  $("item4ChooseMedia")?.addEventListener("click", () => $("item4MediaInput")?.click());
  $("item4MediaInput")?.addEventListener("change", (event) => { uploadItem4Files(event.target.files); event.target.value = ""; });
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
        button.textContent = "Add photos";
      }
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
      if ($("prVoiceover")?.value === "Yes" && $("ezAudioVoiceover")) $("ezAudioVoiceover").value = "Yes";
      if ($("prMusicMode")?.value === "Yes" && $("ezAudioMusic")) $("ezAudioMusic").value = "Yes";
      syncEzAudioFields();
      syncEzConfigFields();
    }
    const requestedPlatforms = selectedRequestPlatforms();
    const planPlatforms = item4SelectedPlatforms();
    const payload = {
      content_type: syncHiddenMasterContentType(),
      platforms: requestedPlatforms.length ? requestedPlatforms : planPlatforms,
      voiceover_mode: $("prVoiceover").value,
      background_music_mode: $("prMusicMode").value,
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
      selected_music_asset_id: $("prMusicAsset").value,
      ...selectedRequestVoice(),
      title_mode: $("prTitleMode").value,
      requested_title: $("prRequestedTitle").value.trim(),
      caption_mode: $("prCaptionMode").value,
      requested_caption: $("prRequestedCaption").value.trim(),
      script_mode: $("prScriptMode").value,
      requested_script: $("prRequestedScript").value.trim(),
      production_notes: $("prProductionNotes").value.trim(),
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
    $(id)?.addEventListener("change", () => {
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

  $("promoteProductionRequest")?.addEventListener("click", async () => {
    if (!activeProductionRequest?.id) return;

    if (item4Workspace?.assets?.length && item4Workspace?.plan_status !== "Ready") {
      await buildItem4Plan();
      return;
    }
    if (item4Workspace?.assets?.length && item4Workspace?.plan_status === "Ready" && item4Workspace?.variant_status !== "Ready") {
      await prepareItem4Variants();
      return;
    }
    if (item4Workspace?.assets?.length && item4Workspace?.plan_status === "Ready" && item4Workspace?.variant_status === "Ready") {
      const bridge = item4BridgePreflight?.ready ? item4BridgePreflight : await loadItem4BridgePreflight(activeProductionRequest);
      if (!bridge?.ready) {
        const copy = item4BridgeIssueCopy(bridge?.issues);
        setRequestMessage(
          copy.length ? copy.join(" ") : "Still finishing a quick check. Try Approve again in a moment.",
          copy.length ? "error-text" : ""
        );
        return;
      }
    }

    const status = String(activeProductionRequest.status || "Draft");
    const promoteButton = $("promoteProductionRequest");

    if (status !== "Submitted") {
      const confirmed = window.confirm(
        "Approve this request and start production?\n\nThis locks the request after it is sent."
      );
      if (!confirmed) return;
    }

    if (promoteButton) {
      promoteButton.disabled = true;
      promoteButton.dataset.busy = "true";
      promoteButton.textContent = status === "Submitted" ? "Checking…" : "Submitting…";
    }
    setRequestMessage();

    try {
      // Save the visible form first so the handoff always uses the latest draft.
      if (status === "Draft" || status === "Ready") {
        await saveActiveProductionRequest({ quiet: true });
      }

      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/promote`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (result.production_request) {
        populateProductionRequestForm(result.production_request);
      }

      await Promise.all([loadProductionRequests(), loadContent(), loadIdeas(), loadDashboard()]);

      if (result.promoted) {
        const content = result.content_item_record_id ? ` Content Item: ${result.content_item_record_id}.` : "";
        setRequestMessage(`${result.message || "Promotion complete."}${content}`, "success");
      } else {
        setRequestMessage(result.message || "Promotion is processing.", "");
      }
    } catch (e) {
      setRequestMessage(e.message, "error-text");
    } finally {
      if (promoteButton) delete promoteButton.dataset.busy;
      setProductionRequestControlState(activeProductionRequest);
    }
  });

  async function loadProductionRequests() {
    const target = $("productionRequestList");
    target.innerHTML = '<div class="empty">Loading production requests…</div>';
    try {
      const { records = [] } = await api("/api/production-requests?limit=100");
      if (!records.length) {
        target.innerHTML = '<div class="empty"><strong>No Production Request drafts yet.</strong><br><span class="subtle">Start from Home, or open an Idea Candidate and choose Add photos.</span></div>';
        return;
      }
      target.innerHTML = `<table class="data-table"><thead><tr><th>Request</th><th>Status</th><th>Type</th><th>Platforms</th><th>Structure</th><th></th></tr></thead><tbody>${records.map(r => {
        let structure = "AI decides";
        if (r.video_clip_count_mode === "Exact") structure = `${value(r.video_clip_count_exact)} clips`;
        if (r.video_clip_count_mode === "Target range") structure = `${value(r.video_clip_count_min)}–${value(r.video_clip_count_max)} clips`;
        if (r.carousel_slide_count_mode === "Exact") structure = `${value(r.carousel_slide_count_exact)} slides`;
        if (r.carousel_slide_count_mode === "Target range") structure = `${value(r.carousel_slide_count_min)}–${value(r.carousel_slide_count_max)} slides`;
        return `<tr><td><div class="title-cell">${value(r.production_request_id)}</div><div class="subtle">Updated ${value(r.updated_at)}</div></td><td>${badge(r.status)}</td><td>${value(r.content_type)}</td><td>${join(r.platforms)}</td><td>${structure}</td><td><button type="button" class="manage-button" data-pr-id="${escapeHtml(r.id)}">Open</button></td></tr>`;
      }).join("")}</tbody></table>`;

      const byId = new Map(records.map(record => [record.id, record]));
      target.querySelectorAll("[data-pr-id]").forEach(button => {
        button.addEventListener("click", async () => {
          const record = byId.get(button.dataset.prId);

          if (!record) {
            setRequestMessage("Production Request not found in the current list. Click Refresh and try again.", "error-text");
            return;
          }

          // Open immediately from the Production Request record already loaded
          // into the drafts table. Do not block opening on a second API call.
          activeIdea = null;
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


  async function loadIdeas() {
    const target = $("ideasList");
    target.innerHTML = '<div class="empty">Loading ideas…</div>';
    try {
      const { records = [] } = await api("/api/ideas?limit=100");
      ideasCache = records;
      populateIdeaExistingSelect(records);
      if (!records.length) return target.innerHTML = '<div class="empty"><strong>No ideas are currently in the intake queue.</strong><br><span class="subtle">Studio is connected; the Idea Candidates table is simply empty after the recent reset/test cycle.</span></div>';

      target.innerHTML = `<table class="data-table idea-table"><thead><tr><th>Idea</th><th>Status</th><th>Type</th><th>Platforms</th><th>Structure</th><th>Production</th><th></th></tr></thead><tbody>${records.map((r) => `<tr class="${r.is_on_hold ? "idea-row-held" : ""}"><td><div class="title-cell">${value(r.title)}</div><div class="subtle">${value(r.summary, "")}</div></td><td>${badge(ideaStatusLabel(r))}</td><td>${value(r.content_type)}</td><td>${join(r.platforms)}</td><td>${r.carousel_slide_count ? `${value(r.carousel_slide_count)} slides` : r.video_clip_count ? `${value(r.video_clip_count)} clips` : "AI / default"}</td><td><div class="subtle">VO: ${value(r.include_voiceover)} · Music: ${value(r.include_background_music)} · Thumbnail: ${value(r.include_thumbnail)}</div></td><td><button type="button" class="manage-button" data-idea-id="${escapeHtml(r.id)}">Manage</button></td></tr>`).join("")}</tbody></table>`;

      const byId = new Map(records.map((record) => [record.id, record]));
      target.querySelectorAll("[data-idea-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const idea = byId.get(button.dataset.ideaId);
          if (idea) openIdeaDrawer(idea);
        });
      });
    } catch (e) {
      ideasCache = [];
      populateIdeaExistingSelect([]);
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
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
    loadProductionRequests();
    const target = $("contentList");
    target.innerHTML = '<div class="empty">Loading content items…</div>';
    try {
      const { records = [] } = await api("/api/content?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty"><strong>No content items are currently in production.</strong><br><span class="subtle">Studio is connected; new promoted ideas will appear here as production begins.</span></div>';
      target.innerHTML = `<table class="data-table"><thead><tr><th>Content</th><th>Studio stage</th><th>Assets</th><th>Render</th><th>Review</th><th>Outputs</th></tr></thead><tbody>${records.map((r) => `<tr><td><div class="title-cell">${value(r.title)}</div><div class="subtle">Content ${value(r.content_id)} · ${value(r.content_type)}</div></td><td>${badge(r.studio_stage)}</td><td>${value(r.asset_match_status)}</td><td>${value(r.render_status)}</td><td>${value(r.review_status || r.carousel_review_status)}</td><td>${Array.isArray(r.output_links) ? r.output_links.length : 0}</td></tr>`).join("")}</tbody></table>`;
    } catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
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
    const included = Array.isArray(creativeSlides) ? creativeSlides.filter((slide) => slide?.include !== false) : [];
    const photos = included.length;
    const slideSeconds = included.reduce((total, slide) => total + Number(slide?.duration_seconds || 0), 0);
    const duration = kind === "story"
      ? "15 seconds"
      : (slideSeconds > 0
        ? `${Math.round(slideSeconds)} seconds`
        : `${Number($("creativeDefaultDuration")?.value || output?.creative_settings?.default_slide_duration_seconds || 30)} seconds`);
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
        ["Change mix", "Use Audio below, then Apply mix & rerender"],
      ],
      short: [
        ["Length", duration],
        ["Photos", photos ? `${photos} in sequence` : "Uploaded set"],
        ["Ratio", output?.aspect_ratio || "9:16"],
        ["Voiceover", creativeVoiceoverOn(output) ? "On" : "Off"],
        ["Music", creativeMusicLabel(output, kind)],
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
    const panel = $("creativeEditorPanel");
    if (panel) {
      panel.classList.toggle("simple-video-review", Boolean(kind));
      panel.classList.toggle("story-teaser-mode", story);
      panel.classList.toggle("native-still-review", still);
      panel.classList.toggle("no-voiceover-review", Boolean(kind) && !still && !voiceOn);
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
      story: ["This Story", "Fixed 15-second teaser. Music volume is the useful control."],
      reel: ["This Reel", "Photo sequence with your audio settings. Music volume is the useful control."],
      slideshow: ["This Facebook Reel", "Photo sequence with your audio settings. Music volume is the useful control."],
      tiktok: ["This TikTok video", "Photo sequence saved as a TikTok draft. Music volume is the useful control."],
      short: ["This YouTube Short", "Photo sequence with your audio settings. Music volume is the useful control."],
      still: ["This photo post", "These photos publish as stills. There is no video mix to edit."],
      video: [`This ${String(output?.platform || "video").trim()} ${creativeOutputTypeLabel(output) || "output"}`.replace(/\s+/g, " ").trim(), "Play the render. Music volume is the useful control."],
    };
    if (heading) heading.textContent = kind ? titles[kind][0] : "This output";
    if (copy) {
      copy.textContent = kind
        ? titles[kind][1]
        : "Play the render. Music volume is the useful control.";
    }
    const audioHeading = document.querySelector("#creativeAudioSection .creative-section-heading h3");
    const audioCopy = document.querySelector("#creativeAudioSection .creative-section-heading p");
    if (audioHeading) audioHeading.textContent = still ? "Audio" : (voiceOn ? "Audio mix" : "Music");
    if (audioCopy) {
      audioCopy.textContent = still
        ? "Photo posts do not use a video mix."
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
    if (handoff?.completed || handoff?.overall_status === "complete") return false;
    const render = String(output?.render_status || "").trim();
    const status = String(output?.output_status || "").trim();
    if (["Ready for Render", "Rendering"].includes(render) || status === "In Production") return true;
    return Boolean(handoff?.active && handoff?.overall_status === "active");
  }

  function phase6UpdateSaveState() {
    const badge = $("creativeSaveState");
    const reset = $("reloadCreativeEditor");
    if (badge) {
      if (creativeWatchOnly() && !creativeEditorDirty && !creativeMixInProgress()) {
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
    const busy = Boolean(
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
    creativeApprovePreview: "Approve this output for publishing. Instagram, Facebook, and YouTube auto-publish publicly. TikTok is created as a draft. You can also approve from the review email.",
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
  };

  const PRODUCTION_CONTROL_HELP = {
    ezIdeaTitle: "Name this content. You can change it later — dropping photos does not lock the title.",
    ezIdeaSummary: "Optional description for the idea. Helps the pipeline write captions and scripts.",
    ezAudioVoiceover: "Turn spoken narration on or off. Voiceover is used on video outputs, not native still carousels.",
    ezAudioVoice: "ElevenLabs voice used when narration is generated. Kate is the default.",
    ezAudioMusic: "Turn background music on or off. Music is used on video outputs, not native still carousels.",
    ezAudioTrack: "Pick a specific music bed, or leave it so AI / the brand profile chooses.",
    ezTitleMode: "AI decides writes the on-post title. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    ezRequestedTitle: "The on-post title. Separate from the idea name at the top of this screen.",
    ezScriptMode: "AI decides writes the spoken script. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    ezRequestedScript: "Paste spoken words here only if you want to control the voiceover. Leave blank to let AI write it.",
    ezThumbnail: "Whether Studio should generate a thumbnail or cover still for video outputs.",
    ezVoiceoverTail: "Extra seconds of picture after narration ends, so the last word is not cut off.",
    ezVideoDuration: "Requested video length in seconds for video outputs.",
    ezVideoClipMode: "How many clips Studio should aim for in a video. AI decides unless you force a count or range.",
    ezVideoClipExact: "Exact number of clips to use in the video.",
    ezVideoClipMin: "Minimum clip count when using a target range.",
    ezVideoClipMax: "Maximum clip count when using a target range.",
    ezCarouselSlideMode: "How many slides Studio should aim for in a carousel or photo sequence.",
    ezCarouselSlideExact: "Exact number of slides in the carousel.",
    ezCarouselSlideMin: "Minimum slide count when using a target range.",
    ezCarouselSlideMax: "Maximum slide count when using a target range.",
    ezCarouselImageMode: "Use the photos you uploaded, or let Make generate additional images.",
    ezProductionNotes: "Anything extra for pacing, style, or execution. Saved with the production request.",
    prVideoDuration: "Requested video length in seconds for video outputs.",
    prVideoClipMode: "How many clips Studio should aim for in a video.",
    prVideoClipExact: "Exact number of clips to use in the video.",
    prVideoClipMin: "Minimum clip count when using a target range.",
    prVideoClipMax: "Maximum clip count when using a target range.",
    prCarouselSlideMode: "How many slides Studio should aim for in a carousel or photo sequence.",
    prCarouselSlideExact: "Exact number of slides in the carousel.",
    prCarouselSlideMin: "Minimum slide count when using a target range.",
    prCarouselSlideMax: "Maximum slide count when using a target range.",
    prCarouselImageMode: "Use uploaded photos, or let Make generate additional images.",
    prVoiceover: "Turn spoken narration on or off for video outputs. Native stills ignore this.",
    prMusicMode: "Turn background music on or off for video outputs. Native stills ignore this.",
    prVoice: "ElevenLabs voice used when narration is generated. Kate is the default.",
    prMusicAsset: "Pick a specific music bed, or leave it so AI / the brand profile chooses.",
    prThumbnail: "Whether Studio should generate a thumbnail or cover still for video outputs.",
    prVoiceoverTail: "Extra seconds of picture after narration ends, so the last word is not cut off.",
    prTitleMode: "AI decides writes the on-post title. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    prRequestedTitle: "The on-post title. Separate from the idea name.",
    prCaptionMode: "AI decides writes captions. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    prRequestedCaption: "Shared caption direction for requested outputs unless a photo has its own caption.",
    prScriptMode: "AI decides writes the spoken script. Force exact uses your wording. AI improve keeps your draft and rewrites it.",
    prRequestedScript: "Paste spoken words here only if you want to control the voiceover.",
    prProductionNotes: "Anything extra for pacing, style, or execution.",
    prOverrideVoiceover: "Override voiceover for this one output, or inherit the master setting.",
    prOverrideMusicMode: "Override background music for this one output, or inherit the master setting.",
    prOverrideThumbnail: "Override thumbnail / cover for this one output, or inherit the master setting.",
    prOverrideMusicAsset: "Override the music track for this one output, or inherit the master track.",
    prOverrideDuration: "Override duration for this one output. Leave blank to inherit.",
    prOverrideVoiceoverTail: "Override extra seconds after narration for this one output.",
    prOverrideClipMode: "Override video clip count for this one output, or inherit the master setting.",
    prOverridePublishMode: "Override whether this output auto-publishes, waits for review, or stays unpublished.",
    prOverrideScheduledAt: "Optional publish time for this one output.",
    prOverrideNotes: "Notes that apply only to this output, not the whole request.",
  };

  const PRODUCTION_BUTTON_HELP = {
    ezStartOver: "Return to the Production home without deleting photos that already uploaded.",
    ezChooseMedia: "Open a file picker. Dropping photos onto the dashed box does the same thing.",
    ezContinue: "Save these photos into a production request and continue to platform planning.",
    ezAudioVoicePreview: "Play a short sample of the selected voice. This does not generate your script.",
    ezAudioTrackPreview: "Play a preview of the selected music track.",
    item4ChooseMedia: "Open a file picker for master photos. You can also drop files onto the dashed box.",
    item4BuildPlan: "Recommend the strongest format for each selected platform from the photos you uploaded.",
    item4PrepareVariants: "Create the cropped 4:5, 9:16, 1:1, or 16:9 versions required by the plan. Drag each photo to keep the important part in frame first.",
    closeProductionRequest: "Close this request and return to the draft list. Saved photos stay in Studio.",
    saveProductionRequest: "Save the current draft without promoting it into the pipeline.",
    syncProductionRequestDirectives: "Copy advanced options from this form onto the requested platform outputs.",
    promoteProductionRequest: "Approve this request and send it into the production pipeline. Publishing stays a later step.",
    prVoicePreview: "Play a short sample of the selected voice. This does not generate your script.",
    prMusicPreview: "Play a preview of the selected music track.",
    savePrOverride: "Save overrides for this one platform output without changing the master defaults.",
    closePrOverride: "Close the per-output override editor without promoting the request.",
  };

  const PRODUCTION_TARGET_HELP = {
    ezUploadZone: "Drop photos here. They appear immediately. Drive copies can finish in the background — you can keep working or leave this screen.",
    item4UploadZone: "Drop master photos here. They appear immediately. You can keep working or leave while Google Drive copies finish.",
    ezUploadProgress: "Photos are still copying into Google Drive. You can keep editing or leave this screen; nothing is lost.",
    item4UploadProgress: "Photos are still copying into Google Drive. You can keep editing or leave this screen; nothing is lost.",
    item4AssetStatus: "Shows whether master photos are still loading into Drive or already saved.",
    item4PlanStatus: "Shows whether Studio has recommended a format for each selected platform.",
    item4VariantStatus: "Shows whether cropped platform versions have been prepared.",
    productionRequestStatus: "Draft means you can still edit. Promoted means it has entered the pipeline.",
    item4PlanHint: "Build the plan after photos are on screen. You do not have to wait for Drive copies to finish.",
    item4VariantHint: "Prepare crops after the platform plan is ready. Drag each photo to keep the important part in frame.",
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

  function phase6HideTooltip() {
    if (!phase6TooltipPopover) return;
    phase6TooltipPopover.classList.remove("visible", "above");
    phase6TooltipPopover.setAttribute("aria-hidden", "true");
    if (phase6TooltipActive) phase6TooltipActive.removeAttribute("aria-describedby");
    phase6TooltipActive = null;
  }

  function phase6ShowTooltip(target, text) {
    if (!target || !text) return;
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
    if (!target || !text || target.dataset.phase6TooltipBound === "1") return;
    target.dataset.phase6TooltipBound = "1";
    target.dataset.phase6Tooltip = text;
    target.classList.add("phase6-tooltip-target");
    if (!target.getAttribute("title")) target.setAttribute("title", text);
    target.addEventListener("mouseenter", () => phase6ShowTooltip(target, text));
    target.addEventListener("mouseleave", phase6HideTooltip);
    target.addEventListener("focus", () => phase6ShowTooltip(target, text));
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
      phase6BindTooltipTarget(card, "A set of photos. Studio plans carousel, album, TikTok photo draft, or YouTube Short from the same originals.");
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
          ? `Add a companion 15-second 9:16 ${platform} Story from the first photo, with a slight zoom and music. After the main ${platform} post is live, the Story can link through to it.`
          : `Add ${platform} ${type} as an extra output beyond the recommended plan.`.replace(/\s+/g, " ").trim();
      phase6BindTooltipTarget(label, text);
    });
    searchRoot.querySelectorAll?.("[data-remove-item4-asset]").forEach((button) => {
      phase6BindTooltipTarget(button, "Remove this photo from the master set. Other originals stay in Studio.");
    });
    searchRoot.querySelectorAll?.("[data-ez-caption-mode]").forEach((select) => {
      phase6BindTooltipTarget(select, "AI writes a caption, Manual uses your wording, None skips a caption for this photo.");
    });
    searchRoot.querySelectorAll?.("[data-ez-asset-caption]").forEach((box) => {
      phase6BindTooltipTarget(box, "Write the caption for this photo. Saved with the production request.");
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
    dot.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); phase6ShowTooltip(dot, text); });
    labelSpan.appendChild(dot);
    phase6BindTooltipTarget(dot, text);
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
    const rows = [
      ["Platform", output.platform || "—"],
      ["Output type", output.platform_output_type || output.format || "—"],
      ["Ratio", output.aspect_ratio || "—"],
      ["Render", output.render_status || "—"],
      ["Review", output.review_status || "—"],
      ["Publish safety", output.do_not_publish ? "Do Not Publish" : "Publishing enabled"],
    ];
    if (output.output_caption) rows.push(["Caption", output.output_caption]);
    if (output.output_hashtags) rows.push(["Hashtags", output.output_hashtags]);
    target.innerHTML = rows.map(([label, v]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(v)}</b></div>`).join("")
      + (watchUrl ? `<div><span>File</span><b><a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(watchUrl)}">Open rendered file ↗</a></b></div>` : "");
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
    const normal = phase6Percent(output.music?.normal_volume, 24);
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
      } else if (storyOutput) {
        heading.textContent = "Story teaser";
        copy.textContent = "A 15-second 9:16 clip from the first photo, with a slight zoom and the selected music.";
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
    if (!storyOutput && (phase6IsNativeStillPreview(output) || (stillUrl && phase6PreviewLooksLikeImage(output?.studio_preview_url || stillUrl) && !output?.final_file_url && !output?.final_file_id))) {
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

    const fileId = output.final_file_id || phase6DriveFileId(output.final_file_url) || phase6DriveFileId(output.output_url);
    const directPreview = phase6PreviewLooksLikeImage(output.studio_preview_url) ? "" : (output.studio_preview_url || "");
    if (!fileId && !output.final_file_url && !directPreview) {
      empty.textContent = String(output.render_status || "").toLowerCase().includes("native photo")
        ? "Native photo route — review the stills below. No Remotion MP4."
        : (String(output.render_status || "").toLowerCase().includes("render") || /story/i.test(String(output.studio_output_type || output.platform_output_type || ""))
          ? (/story/i.test(String(output.studio_output_type || output.platform_output_type || ""))
            ? "The 15-second Story teaser is still rendering. Open Review will show the zoom-and-music clip when the MP4 is ready."
            : "The video is still rendering. Open Review will unlock when the MP4 is ready.")
          : "No rendered preview is available yet.");
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const fallbackToDrive = () => {
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
      video.src = playableSrc;
      video.hidden = false;
      video.onerror = fallbackToDrive;
      video.onloadedmetadata = () => {
        drive.removeAttribute("src");
        drive.hidden = true;
        video.hidden = false;
      };
      video.load();
      return;
    }

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
    $("creativeEditorSubtitle").textContent = `${output.platform_output_type || output.format || "Photo sequence"}${output.aspect_ratio ? ` · ${output.aspect_ratio}` : ""} · creative review`;
    $("creativeSafetyBadge").textContent = output.do_not_publish
      ? (titleLocked ? "Titles locked" : "Publishing locked")
      : (creativeCanApproveForPublishing(output) ? "Ready to approve" : "Watch-only review");
    $("creativeSafetyBadge").className = "badge ready-for-review";
    $("creativeSafetyBanner").innerHTML = !output.do_not_publish
      ? (creativeMixInProgress(data.handoff || creativeHandoffStatus, output)
        ? "<strong>Rendering a new mix.</strong> This page will show Processing, then Ready when the new preview is available. Approve stays locked until then."
        : (creativeCanApproveForPublishing(output)
        ? (phase6IsNativeStillPreview(output)
          ? "<strong>Final publish approval.</strong> Review the still, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft."
          : (creativeSimpleVideoKind(output)
            ? "<strong>Final publish approval.</strong> Play the render, change music volume under Audio if you want, then Approve for publishing."
            : "<strong>Final publish approval.</strong> Adjust music and voiceover if needed, play the render, then Approve for publishing. Instagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft."))
        : "<strong>Review mix.</strong> Adjust music and voiceover, then Apply mix &amp; rerender. Play the new preview before approving."))
      : titleLocked
        ? '<strong>Titles locked.</strong> The approved preview locked per-photo titles. Unlock titles to start a new version. Publishing stays locked.'
        : '<strong>Review mode.</strong> Edit, save, rerender, and approve the preview here. Approving locks per-photo titles. Publishing stays locked until the later publishing step.';

    showCreativeRenderedPreview(output);
    renderCreativeOutputMeta(output);
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
      const handoff = data?.handoff || await refreshCreativeChangeProgress();
      const resumable = Boolean(handoff?.active && !handoff?.completed && handoff?.overall_status !== "error")
        || creativeMixInProgress(handoff, data?.output);
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

    const normalPct = Math.max(0, Math.min(100, phase6NumberFromInput("creativeMusicNormal", 24)));
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
    if (platform === "TikTok" && /multi-photo|slideshow/i.test(type)) return true;
    if (platform === "Instagram" && /carousel/i.test(type) && !/story/i.test(type)) return true;
    if (platform === "Facebook" && /multi-image\s*post|photo\s*set/i.test(type) && !/story/i.test(type)) return true;
    return false;
  }

  function creativeCanApproveForPublishing(output = activeCreativeOutput) {
    if (!output || output.do_not_publish) return false;
    const review = String(output.review_status || "").trim();
    const status = String(output.output_status || "").trim();
    if (review === "Approved" || status === "Approved for Publishing") return false;
    const hasFile = Boolean(String(output.final_file_url || "").trim() || String(output.studio_preview_url || "").trim());
    if (!hasFile && !creativeIsNativePhotoPackage(output)) return false;
    return status === "Ready for Review" || review === "Review Sent";
  }

  async function reviewActiveCreative(action) {
    if (!activeCreativeOutputId) return;
    try {
      if (!creativeWatchOnly() || action === "changes_requested" || action === "apply_audio_mix") await saveActiveCreative({ quiet: true });
      const publishing = action === "approve_for_publishing" || (action === "approve" && creativeWatchOnly());
      phase6Message(publishing ? "Saving publish approval…" : (action === "approve" ? "Saving review approval…" : "Applying mix and starting render…"));
      setCreativeBusy(true);
      const reviewBody = { action, notes: $("creativeReviewNotes").value || "" };
      if (action === "apply_audio_mix" || action === "changes_requested") {
        const collected = collectCreativePayload();
        reviewBody.audio = collected.audio;
        reviewBody.notes = collected.review_notes || reviewBody.notes;
      }
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative/review`, {
        method: "POST",
        body: JSON.stringify(reviewBody),
        timeoutMs: 30000,
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


  function renderOutputsTable(target, records) {
    if (!records.length) return target.innerHTML = '<div class="empty">No Platform Output records were returned.</div>';
    const isPipeline = target?.id === "outputsList";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Output</th><th>Platform</th>${isPipeline ? "<th>Type / ratio</th>" : ""}<th>Studio state</th><th>Render</th><th>Review</th><th>Publish</th><th>Progress</th>${isPipeline ? "<th>Creative</th>" : ""}</tr></thead><tbody>${records.map((r) => {
      const pct = pipelineDisplayPercent(r);
      const postLink = r.platform_post_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(r.platform_post_url)}">Open post ↗</a>` : "";
      const typeCell = isPipeline ? `<td><div>${value(r.platform_output_type || r.format)}</div><div class="subtle">${value(r.aspect_ratio)}</div></td>` : "";
      const canOpen = Boolean(r.creative_available);
      const creativeCell = isPipeline ? `<td class="creative-output-action-cell"><button type="button" class="creative-button" data-creative-output-id="${escapeHtml(r.id)}" ${canOpen ? "" : "disabled"}>${canOpen ? "Open review" : "Not ready yet"}</button></td>` : "";
      const rowOpen = isPipeline && canOpen ? ` class="pipeline-open-row" data-open-output-id="${escapeHtml(r.id)}" tabindex="0"` : "";
      return `<tr${rowOpen}><td><div class="title-cell">Output ${value(r.output_id)}</div><div class="subtle">${value(r.publish_method)}</div>${postLink}</td><td>${value(r.platform)}</td>${typeCell}<td>${badge(r.studio_state)}</td><td>${value(r.render_status)}</td><td>${value(r.review_status)}</td><td>${value(r.platform_publish_status || r.publish_status)}</td><td>${pct === null || pct === undefined ? "—" : `<div>${value(pct)}%</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(pct)||0))}%"></span></div>`}</td>${creativeCell}</tr>`;
    }).join("")}</tbody></table>`;
    if (isPipeline) {
      target.querySelectorAll("[data-creative-output-id]").forEach((button) => {
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          openCreativeEditor(button.dataset.creativeOutputId);
        });
      });
      target.querySelectorAll("[data-open-output-id]").forEach((row) => {
        row.addEventListener("click", (event) => {
          if (event.target.closest("a, button")) return;
          openCreativeEditor(row.dataset.openOutputId);
        });
        row.addEventListener("keydown", (event) => {
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
      r.creative_available,
      r.final_file_url,
      r.studio_preview_url,
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
      if (!unchanged) {
        const scrollTop = target.scrollTop;
        renderOutputsTable(target, records);
        target.scrollTop = scrollTop;
      }
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

  async function loadMusic() {
    const target = $("musicList");
    target.innerHTML = '<div class="empty">Loading music library…</div>';
    try {
      const { records = [] } = await api("/api/music?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty">No Music assets were returned.</div>';
      target.innerHTML = records.map((r) => {
        const preview = r.preview_url || r.google_drive_url;
        return `<article class="music-card"><h3>${value(r.display_name || r.name)}</h3>${r.display_name && r.display_name !== r.name ? `<div class="raw-filename">${value(r.name)}</div>` : ""}<div class="music-meta">${value(r.mime_type)} · ${value(r.file_size_mb)} MB · ${value(r.rights_status)}</div><div class="subtle">${value(r.description, "No description yet")}</div>${preview ? `<audio class="music-preview" controls preload="metadata" src="${escapeHtml(preview)}"></audio>` : `<div class="subtle">No preview URL available.</div>`}<div class="music-actions">${r.google_drive_url ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.google_drive_url)}">Open source</a>` : ""}<span class="badge ${r.do_not_use ? "failed" : "published"}">${r.do_not_use ? "Do not use" : "Available"}</span></div></article>`;
      }).join("");

      const players = Array.from(target.querySelectorAll("audio.music-preview"));
      players.forEach((player) => player.load());
      players.forEach((player) => player.addEventListener("play", () => {
        players.forEach((other) => { if (other !== player) other.pause(); });
      }));
    } catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  }

  function loadPage(page) {
    if (page === "home") return;
    if (page === "dashboard") return loadDashboard();
    if (page === "ideas") return loadIdeas();
    if (page === "content") return loadContent();
    if (page === "outputs") return loadOutputs();
    if (page === "music") return loadMusic();
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
  $("creativeApprovePreview")?.addEventListener("click", () => {
    if (creativeWatchOnly()) {
      if (!creativeCanApproveForPublishing()) return;
      if (!window.confirm("Approve this output for publishing?\n\nInstagram, Facebook, and YouTube will auto-publish publicly. TikTok will be saved as a draft.")) return;
      reviewActiveCreative("approve_for_publishing");
      return;
    }
    if (window.confirm("Approve this preview? This records review approval and locks per-photo titles; it will not publish the output.")) reviewActiveCreative("approve");
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
      if (pipelinePageActive()) setPipelineLiveHint("Paused while this tab is in the background");
      return;
    }
    if (!pipelinePageActive()) return;
    refreshPipelineOutputs({ silent: true }).finally(schedulePipelinePoll);
  });

  phase6DecorateTooltips(document);
  productionDecorateTooltips($("page-content"));
  window.addEventListener("scroll", phase6HideTooltip, true);
  window.addEventListener("resize", phase6HideTooltip);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") phase6HideTooltip(); });

  checkHealth();
  loadDashboard();
})();

// v0.6.17 display-text normalization startup
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => startDisplayTextRepair(), { once: true });
} else {
  startDisplayTextRepair();
}
