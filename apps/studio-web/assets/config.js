window.CHICAGOSHINING_STUDIO_CONFIG = {
  // Empty means use the current origin. /api/* is routed to the Studio API Worker.
  apiBase: ""
};

// Global Studio tooltip layer.
// Keeps explanatory help consistent across static controls and controls rendered
// later by Dashboard, Ideas, Production, Pipeline, Music, Operations, and Support.
(() => {
  const TOOLTIP_ID = "studioGlobalTooltip";
  const TOOLTIP_ATTR = "studioTooltip";

  const explicitTooltips = {
    apiStatus: "Studio API connection status. If this reports an error, data refreshes and admin actions may not work until the API is reachable again.",
    studioProfileSelect: "Choose the content profile/city used for new work, branding, defaults, and library filtering. Changing profiles does not modify existing records.",
    refreshDashboard: "Reload dashboard counts and recent output states from the Studio API without changing any records.",
    generateIdeasButton: "Open AI idea generation. You can choose how many ideas to create and the generation quality before anything is added.",
    newIdeaButton: "Open the idea form. Creating an idea does not start production or publishing.",
    ideaGenerateCount: "Number of new AI idea candidates to create in this batch. This does not promote them into production.",
    ideaGenerateQuality: "Controls the quality-versus-quantity preference for AI idea generation.",
    ideaGenerateSubmit: "Start the AI idea batch using the count and quality settings above.",
    ideaGenerateCancel: "Close idea generation without starting a new batch.",
    ideaGenerateView: "Show the newly generated idea candidates in the Ideas list.",
    ideaGenerateMore: "Start another AI idea-generation batch without promoting the current ideas.",
    createIdeaButton: "Continue with the selected or newly entered idea. This still does not publish anything.",
    holdIdeaButton: "Put this idea on hold so it stays out of the active working queue without deleting it.",
    restoreIdeaButton: "Return this held idea to the active idea queue.",
    deleteIdeaButton: "Permanently delete this unpromoted Idea Candidate. Use Hold instead if you may want the idea later.",
    configureProductionButton: "Create an empty Production request and upload new stills from this device.",
    useExistingLibraryButton: "Pick classified library stills already on Google Drive, including today’s intake, then continue to Production.",
    ideaLibraryContinueButton: "Attach the selected library stills to a Production request and open customize.",
    ezWizardBack: "Go back one wizard answer without changing any existing production records.",
    ezWizardReset: "Clear the current wizard answers and restart the publishing wizard from the beginning.",
    ezStartOver: "Return to Home and leave the current start-with-content path.",
    ezChooseMedia: "Choose photos from this device. Files are staged for the current content item and are not published by this action.",
    ezAudioVoicePreview: "Play a short preview of the selected voice. This does not render or save a production output.",
    ezAudioTrackPreview: "Preview the selected background music track. This does not render or save a production output.",
    prVoicePreview: "Play a short preview of the selected production-request voice.",
    prMusicPreview: "Preview the selected production-request music track.",
    closePrOverride: "Close the per-output override editor. Unsaved override changes are not applied.",
    savePrOverride: "Save settings that apply only to this platform output. Blank or Inherit values continue using the master Production Request.",
    collapseCreativeSlides: "Collapse every slide card so you can scan the sequence and order more quickly.",
    expandCreativeSlides: "Expand every slide card so all per-photo controls are visible.",
    clearCreativeReviewNotes: "Clear the current review-notes field. Save afterward if you want the cleared value stored.",
    reloadCreativeEditor: "Discard unsaved editor changes and reload the last saved creative settings.",
    creativeUnlockTitles: "Allow title fields that were intentionally locked to be edited for this review cycle.",
    saveCreativeEditor: "Save the current creative edits without requesting a new render or publishing anything.",
    creativeRequestChanges: "Save the current creative edits and request a new preview render. Publishing does not start until the new preview is approved.",
    creativeApprovePreview: "Approve this output for publishing. Immediate is the default. Choose Schedule and a local date/time to override. TikTok remains a draft.",
    pipelineFilterClear: "Remove the current Pipeline filter and show all platform-output rows again.",
    operationsRunDailyIdeas: "Run today's enabled daily-idea batches immediately. Only profiles whose Daily Ideas toggle is enabled are included.",
    operationsRunIntake: "Start the library intake chain for files waiting in the configured Drive intake folder. This can classify, reconcile, or compress eligible assets.",
    operationsCapAudioSilence: "Rewrite existing catalog audio on Google Drive so leading silence is no longer than 0.5 seconds. Already processed tracks are skipped.",
    operationsResetRenderUrls: "Repair stale Remotion render URLs on eligible failed/waiting records. Use this after the renderer URL or tunnel has changed.",
    operationsRetryAssetSelection: "Retry asset selection for outputs that previously failed at the asset-selection stage. It does not rerun healthy outputs.",
    operationsMakeAdminBridge: "Run the pending Make admin queue now. Use this only for commands intentionally placed in that queue.",
    operationsRefreshSimilarTimes: "Look up public Instagram and YouTube post times for the current profile watchlist. Suggested times never auto-apply; Now stays the default.",
    operationsIdeaMeta: "Shows the current Daily Ideas timing/profile summary returned by the Operations API.",
    operationsIntakeMeta: "Shows the latest library-intake summary returned by the Operations API.",
    operationsIntakeProgress: "Live progress for the current library-intake run, including intake, video backfill, classification, and reconciliation stages."
  };

  const fieldTooltips = {
    ezAudioVoiceover: "Choose whether video outputs should include generated voiceover. Native still/carousel outputs do not use voiceover audio.",
    ezAudioVoice: "Choose the ElevenLabs voice used when voiceover is enabled.",
    ezAudioMusic: "Choose whether video outputs should include background music. Native still/carousel outputs do not use this audio track.",
    ezAudioTrack: "Choose a specific music asset, or leave AI/profile selection enabled to use the configured default behavior.",
    ezTitleMode: "AI decides writes the title; Force exact uses your wording; AI improve rewrites your draft while preserving its intent.",
    ezRequestedTitle: "Optional post-title direction. It becomes required when Title control is set to Force exact.",
    ezCaptionMode: "AI decides writes the post caption; Force exact uses your wording; AI improve rewrites your draft.",
    ezRequestedCaption: "Post-level caption used by platform outputs. This is separate from per-photo labels/captions.",
    ezScriptMode: "Controls how the spoken script is produced: AI-written, exact wording, or AI-improved wording.",
    ezRequestedScript: "Voiceover/script direction for video outputs. With Force exact, the text here becomes the spoken script.",
    prVideoDuration: "Target video duration in seconds for outputs that inherit the master Production Request.",
    prVideoClipMode: "Choose whether AI selects the clip count, you force an exact count, or you provide a target range.",
    prCarouselSlideMode: "Choose whether AI selects the photo/slide count, you force an exact count, or you provide a target range.",
    prCarouselImageMode: "Choose whether the photo sequence uses AI-generated images or manually uploaded images.",
    prVoiceover: "Master voiceover setting for outputs that do not have a per-output override.",
    prMusicMode: "Master background-music setting for outputs that do not have a per-output override.",
    prThumbnail: "Master thumbnail/cover strategy. Individual outputs can override this when a platform needs a different cover.",
    prVoiceoverTail: "Extra video time, in seconds, left after the voiceover ends so the final visual/audio beat is not cut off.",
    prTitleMode: "Master title-writing mode for outputs that do not override title direction.",
    prRequestedTitle: "Master title text/direction inherited by platform outputs unless overridden.",
    prCaptionMode: "Master caption-writing mode for outputs that do not override caption direction.",
    prRequestedCaption: "Master post caption/direction inherited by platform outputs unless overridden.",
    prScriptMode: "Master script-writing mode for video outputs that do not override script direction.",
    prRequestedScript: "Master voiceover/script direction inherited by video outputs unless overridden.",
    prOverrideVoiceover: "Override voiceover for this output only. Inherit leaves the master Production Request unchanged.",
    prOverrideMusicMode: "Override background music for this output only. Inherit leaves the master setting in effect.",
    prOverrideThumbnail: "Override thumbnail/cover behavior for this output only.",
    prOverrideMusicAsset: "Choose a specific track for this output only, or inherit the master track selection.",
    prOverrideDuration: "Override video duration for this output only. Leave blank to inherit the master duration.",
    prOverrideVoiceoverTail: "Override the post-voiceover tail for this output only. Leave blank to inherit the master value.",
    prOverridePublishMode: "Control publishing behavior for this output only: inherit, auto publish, require manual review, or do not publish.",
    prOverrideScheduledAt: "Set a platform-output-specific scheduled date/time. Leave blank to use the master/default schedule behavior.",
    prOverrideNotes: "Instructions that apply only to this platform output and should not change the master Production Request."
  };

  const actionExact = {
    "refresh": "Reload the current page data from the Studio API without changing records.",
    "back": "Go back one step without saving a new change.",
    "cancel": "Close this action without applying the pending change.",
    "close": "Close this panel without starting another action.",
    "manage": "Open this record's management/editor view.",
    "open": "Open this record for details and available actions.",
    "review": "Open this output in the creative review editor.",
    "edit": "Open this record's editable fields.",
    "save": "Save the current changes without starting publishing unless this screen explicitly says otherwise.",
    "preview": "Preview the selected media or setting without publishing it.",
    "retry": "Retry only this eligible failed/waiting operation rather than restarting the whole pipeline.",
    "schedule": "Set or update the post date/time used by the publishing queue.",
    "compress": "Start compression for this oversized library video only; it does not scan the entire intake folder.",
    "mark published": "Use only after this output was posted manually. This records it as published without posting it again.",
    "approve all": "Approve all review-ready outputs in this content group. Eligible public platforms can enter publishing queues; TikTok remains a draft where required."
  };

  const actionContains = [
    ["mark published", "Use only after this output was posted manually. This records the published state/URL without republishing it."],
    ["save schedule", "Save this output's post date/time. Publishing workflows use that due time when deciding when the row is ready."],
    ["scheduled", "Set or update the date/time that controls when this output becomes due for publishing."],
    ["approve all", "Approve every review-ready output in this group. Eligible public-platform outputs may enter their publish queues."],
    ["approve", "Approve this review-ready output so it can move into its configured publishing path."],
    ["rerender", "Save the requested creative change and start a new preview render. This does not publish the output."],
    ["prepare", "Prepare the current content for the next production stage using the saved inputs and selected settings."],
    ["promote", "Promote the prepared request into the downstream production/render pipeline. Review and publishing happen later."],
    ["generate", "Run the requested AI generation action using the values currently shown on this screen."],
    ["choose photo", "Choose image files from this device for the current record; selecting files does not publish them."],
    ["choose file", "Choose a file from this device for the current record; selecting it does not publish it."],
    ["upload", "Add the selected media to the current Studio record. Uploading media does not publish the content."],
    ["delete", "Permanently remove the selected eligible record/item. Use a hold/cancel option instead when you may need it later."],
    ["restore", "Return this held/inactive item to the active workflow."],
    ["hold", "Remove this item from the active queue without deleting it."],
    ["collapse", "Collapse the related section so you can scan the page more quickly."],
    ["expand", "Expand the related section to show its full controls and details."],
    ["clear", "Clear the current value or filter. Save afterward if this screen requires saving to persist the change."],
    ["reset", "Restore this area to its saved/default state; unsaved changes in the affected area may be discarded."],
    ["start over", "Clear the current guided-path answers and restart from the beginning."],
    ["run today", "Run the enabled daily-idea jobs now instead of waiting for the normal overnight schedule."],
    ["process intake", "Start the library intake workflow for eligible files waiting in the configured Drive intake folder."],
    ["compress", "Start compression for this oversized library video only; it does not scan the entire intake folder."],
    ["retry", "Retry the eligible failed/waiting item without intentionally rerunning unrelated healthy records."],
    ["refresh", "Reload the latest data from the Studio API without intentionally changing records."]
  ];

  const pageHelp = {
    home: "Home / publishing wizard",
    dashboard: "Dashboard",
    ideas: "Ideas",
    content: "Production",
    outputs: "Pipeline",
    music: "Music Library",
    operations: "Operations",
    support: "Support"
  };

  function cleanText(value) {
    return String(value || "").replace(/\s+/g, " ").trim();
  }

  function pageNameFor(element) {
    const page = element.closest?.(".page");
    if (!page) return "Studio";
    const key = String(page.id || "").replace(/^page-/, "");
    return pageHelp[key] || cleanText(page.querySelector("h1")?.textContent) || "Studio";
  }

  function controlLabel(element) {
    const aria = cleanText(element.getAttribute?.("aria-label"));
    if (aria) return aria;
    if (element.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(element.id)}"]`);
      const labelText = cleanText(explicitLabel?.textContent);
      if (labelText) return labelText;
    }
    const wrappingLabel = element.closest?.("label");
    if (wrappingLabel) {
      const span = wrappingLabel.querySelector(":scope > span");
      if (span) return cleanText(span.textContent);
      const text = Array.from(wrappingLabel.childNodes)
        .filter((node) => node.nodeType === Node.TEXT_NODE)
        .map((node) => node.textContent)
        .join(" ");
      if (cleanText(text)) return cleanText(text);
    }
    return cleanText(element.getAttribute?.("placeholder"));
  }

  function actionTooltip(element) {
    const text = cleanText(element.textContent || element.value).toLowerCase();
    if (!text) return "Use this control for the current Studio workflow.";
    if (actionExact[text]) return actionExact[text];
    const match = actionContains.find(([needle]) => text.includes(needle));
    if (match) return match[1];
    return `Use “${cleanText(element.textContent || element.value)}” for the current ${pageNameFor(element)} workflow.`;
  }

  function fieldTooltip(element) {
    if (fieldTooltips[element.id]) return fieldTooltips[element.id];
    const label = controlLabel(element) || "value";
    const page = pageNameFor(element);
    const type = String(element.type || element.tagName || "").toLowerCase();
    if (type === "checkbox") return `Turn “${label}” on or off for the current ${page} workflow.`;
    if (type === "radio") return `Choose “${label}” for the current ${page} workflow.`;
    if (type === "file") return `Choose media for “${label}”. Selecting a file does not publish the content.`;
    if (type === "datetime-local" || /schedule|date|time/i.test(label)) return `Set the date/time for “${label}”. This can affect when the related output becomes due.`;
    if (element.tagName === "SELECT") return `Choose the “${label}” setting used by the current ${page} workflow.`;
    if (element.tagName === "TEXTAREA") return `Enter “${label}” text for the current ${page} workflow. The field is not published until the workflow reaches its publish stage.`;
    if (type === "number") return `Set the numeric “${label}” value used by the current ${page} workflow.`;
    return `Enter or edit “${label}” for the current ${page} workflow.`;
  }

  function descriptionFor(element) {
    if (!element) return "";
    const existingTitle = cleanText(element.getAttribute?.("title"));
    if (existingTitle) return existingTitle;
    if (explicitTooltips[element.id]) return explicitTooltips[element.id];
    if (element.classList?.contains("nav-item")) {
      const page = pageHelp[element.dataset.page] || cleanText(element.textContent);
      if (element.dataset.page === "content") {
        return "Open Production to add photos, choose platforms, and frame each post.";
      }
      return `Open the ${page} page. This does not change any records.`;
    }
    if (element.matches?.("[data-refresh]")) return "Reload the latest data for this admin page without intentionally changing any records.";
    if (element.matches?.("[data-open-page]")) {
      const page = pageHelp[element.dataset.openPage] || element.dataset.openPage;
      return `Open the ${page} page from Support without changing any records.`;
    }
    if (element.classList?.contains("metric-card") || element.matches?.("[data-dashboard-view]")) {
      return "Filter the dashboard list below to the status represented by this card. The underlying records are not changed.";
    }
    if (element.tagName === "BUTTON" || element.getAttribute?.("role") === "button") return actionTooltip(element);
    if (["INPUT", "SELECT", "TEXTAREA"].includes(element.tagName)) return fieldTooltip(element);
    if (element.id === "operationsIdeaMeta") return explicitTooltips.operationsIdeaMeta;
    if (element.id === "operationsIntakeMeta") return explicitTooltips.operationsIntakeMeta;
    if (element.id === "apiStatus") return explicitTooltips.apiStatus;
    return "";
  }

  function decorateElement(element) {
    if (!(element instanceof Element)) return;
    if (element.closest?.(`#${TOOLTIP_ID}`)) return;
    if (element.id === "phase6ControlTooltip") return;
    if (element.dataset.studioTooltipLocked === "1") return;
    const description = cleanText(descriptionFor(element));
    if (!description) return;
    element.dataset[TOOLTIP_ATTR] = description;
    if (element.hasAttribute("title")) element.removeAttribute("title");
  }

  function lockTooltip(element, text) {
    if (!(element instanceof Element)) return;
    const description = cleanText(text);
    if (!description) return;
    element.dataset.studioTooltipLocked = "1";
    element.dataset[TOOLTIP_ATTR] = description;
    if (element.hasAttribute("title")) element.removeAttribute("title");
  }

  function decorate(root = document) {
    const selector = [
      "button",
      "input",
      "select",
      "textarea",
      "[role='button']",
      ".metric-card",
      "#apiStatus",
      "#operationsIdeaMeta",
      "#operationsIntakeMeta",
      "#operationsIntakeProgress"
    ].join(",");
    if (root instanceof Element && root.matches(selector)) decorateElement(root);
    root.querySelectorAll?.(selector).forEach(decorateElement);
  }

  function injectStyles() {
    if (document.getElementById("studioTooltipStyles")) return;
    const style = document.createElement("style");
    style.id = "studioTooltipStyles";
    style.textContent = `
      .studio-global-tooltip {
        position: fixed;
        z-index: 2147483646;
        max-width: min(340px, calc(100vw - 24px));
        padding: 9px 11px;
        border-radius: 8px;
        background: rgba(24, 24, 27, .97);
        color: #fff;
        font: 500 12px/1.45 system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        box-shadow: 0 8px 28px rgba(0, 0, 0, .24);
        pointer-events: none;
        opacity: 0;
        transform: translateY(-3px);
        transition: opacity .12s ease, transform .12s ease;
      }
      .studio-global-tooltip.is-visible { opacity: 1; transform: translateY(0); }
      @media (prefers-reduced-motion: reduce) {
        .studio-global-tooltip { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTooltip() {
    let tooltip = document.getElementById(TOOLTIP_ID);
    if (tooltip) return tooltip;
    tooltip = document.createElement("div");
    tooltip.id = TOOLTIP_ID;
    tooltip.className = "studio-global-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.hidden = true;
    document.body.appendChild(tooltip);
    return tooltip;
  }

  let activeTarget = null;
  let previousDescribedBy = null;

  function hideTooltip() {
    const tooltip = document.getElementById(TOOLTIP_ID);
    if (!tooltip) return;
    tooltip.classList.remove("is-visible");
    tooltip.hidden = true;
    if (activeTarget) {
      if (previousDescribedBy) activeTarget.setAttribute("aria-describedby", previousDescribedBy);
      else activeTarget.removeAttribute("aria-describedby");
    }
    activeTarget = null;
    previousDescribedBy = null;
  }

  function positionTooltip(target, tooltip) {
    const rect = target.getBoundingClientRect();
    const tip = tooltip.getBoundingClientRect();
    const margin = 8;
    let left = rect.left + (rect.width - tip.width) / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - tip.width - 12));
    let top = rect.top - tip.height - margin;
    if (top < 8) top = Math.min(window.innerHeight - tip.height - 8, rect.bottom + margin);
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
  }

  function hidePhase6TooltipLayer() {
    const tip = document.getElementById("phase6ControlTooltip");
    if (!tip) return;
    tip.classList.remove("visible", "above");
    tip.setAttribute("aria-hidden", "true");
  }

  function tooltipsEnabled(event) {
    if (event?.type === "focusin" || event?.type === "click") return true;
    if (event?.pointerType === "mouse") return true;
    return !window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  }

  function showTooltip(target, event) {
    if (!tooltipsEnabled(event)) return;
    if (!(target instanceof Element)) return;
    if (target.id === "phase6ControlTooltip" || target.closest?.("#phase6ControlTooltip")) return;
    const described = target.closest?.("[data-studio-tooltip]");
    if (!described) {
      hideTooltip();
      return;
    }
    const text = cleanText(described.dataset.studioTooltip);
    if (!text) return;
    hidePhase6TooltipLayer();
    const tooltip = ensureTooltip();
    if (activeTarget && activeTarget !== described) hideTooltip();
    activeTarget = described;
    previousDescribedBy = described.getAttribute("aria-describedby");
    described.setAttribute("aria-describedby", TOOLTIP_ID);
    tooltip.textContent = text;
    tooltip.hidden = false;
    tooltip.style.visibility = "hidden";
    tooltip.classList.add("is-visible");
    positionTooltip(described, tooltip);
    tooltip.style.visibility = "visible";
  }

  function initTooltips() {
    injectStyles();
    ensureTooltip();
    decorate(document);

    document.addEventListener("pointerover", (event) => showTooltip(event.target, event), true);
    document.addEventListener("pointerout", (event) => {
      if (!activeTarget) return;
      const related = event.relatedTarget;
      if (related instanceof Node && activeTarget.contains(related)) return;
      hideTooltip();
    }, true);
    document.addEventListener("focusin", (event) => showTooltip(event.target, event), true);
    document.addEventListener("focusout", (event) => {
      if (activeTarget && !activeTarget.contains(event.relatedTarget)) hideTooltip();
    }, true);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") hideTooltip();
    }, true);
    window.addEventListener("scroll", hideTooltip, true);
    window.addEventListener("resize", hideTooltip);

    let pending = false;
    const observer = new MutationObserver((mutations) => {
      if (pending) return;
      if (!mutations.some((mutation) => mutation.addedNodes.length)) return;
      pending = true;
      requestAnimationFrame(() => {
        pending = false;
        mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
          if (node instanceof Element) decorate(node);
        }));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  window.studioHideGlobalTooltip = hideTooltip;
  window.studioShowGlobalTooltip = showTooltip;
  window.studioLockTooltip = lockTooltip;

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initTooltips, { once: true });
  else initTooltips();
})();

// Manual idea-generation progress helper.
// The main Studio bundle already renders generated_count when it sees it. This
// lightweight hook starts at 0/N immediately and polls once per second so users
// can see 1/N, 2/N, etc. as each generated idea lands in the table.
(() => {
  const nativeFetch = window.fetch.bind(window);
  let batchRecordId = null;
  let requestedCount = 0;
  let pollTimer = null;

  function renderProgress(generated, requested) {
    if (!requested) return;
    const message = document.getElementById("ideaGenerateMessage");
    if (!message) return;
    const current = String(message.textContent || "");
    if (/unable|failed|error/i.test(current)) return;
    message.textContent = `${Math.max(0, Number(generated) || 0)} of ${requested} complete`;
  }

  async function pollBatch() {
    if (!batchRecordId) return;
    try {
      const response = await nativeFetch(`/api/ideas/generate/${encodeURIComponent(batchRecordId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok) {
        const body = await response.json();
        const batch = body?.batch || {};
        requestedCount = Number(batch.requested_count || requestedCount || 0);
        renderProgress(batch.generated_count, requestedCount);
        const status = String(batch.status || "").toLowerCase();
        if (["completed", "failed"].includes(status)) {
          batchRecordId = null;
          pollTimer = null;
          return;
        }
      }
    } catch (_) {
      // The primary Studio poller remains authoritative and handles user-facing errors.
    }
    pollTimer = setTimeout(pollBatch, 1000);
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const options = args[1] || {};
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(options.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();
      const pathname = new URL(url, window.location.origin).pathname;
      if (pathname === "/api/ideas/generate" && method === "POST" && response.ok) {
        response.clone().json().then((body) => {
          batchRecordId = body?.batch_record_id || null;
          requestedCount = Number(body?.requested_count || 0);
          if (!batchRecordId || !requestedCount) return;
          renderProgress(0, requestedCount);
          if (pollTimer) clearTimeout(pollTimer);
          pollTimer = setTimeout(pollBatch, 250);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };
})();
