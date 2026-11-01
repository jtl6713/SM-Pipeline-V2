(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    loading: false,
    desk: null,
    expandedReviewGroup: null,
    needsEyesPage: 0,
    needsEyesSearch: "",
    pendingFactoryFeedback: null,
    selectedOutputs: new Set(),
    submittingBatch: false,
    batch: null,
    completedBatch: null,
    completedOpen: false,
    activeApprovalsCollapsed: false,
    completedOffset: 0,
    completedLoading: false,
    batchTimer: null,
    batchDetailsOpen: false,
    inspectedBatchKey: "",
    lastBatchProfile: "",
    batchApprovalsEnabled: null,
    batchRollout: null,
    batchGlobal: null,
    reconciledBatchDeskKey: "",
    reconcilingBatchDesk: false,
    batchDeskReconcileNextAttempt: 0,
    lastBatchFetchMs: 0,
  };
  const FACTORY_SELECTION_KEY = "studio.factory.batch-selection.v1";
  const FACTORY_LAST_BATCH_KEY = "studio.factory.last-batch.v1";
  const FACTORY_PENDING_REQUEST_KEY = "studio.factory.pending-approval-request.v1";
  const FACTORY_ACCEPTED_OUTPUTS_KEY = "studio.factory.accepted-output-ids.v1";
  // Reuse the one global missing-asset image; do not borrow another profile's media.
  const NEEDS_ASSET_THUMB = "/assets/needs-asset.svg";
  document.addEventListener("error", (event) => {
    const image = event.target;
    if (!(image instanceof HTMLImageElement) ||
        !image.matches("#page-factory .factory-line-thumb img") ||
        image.getAttribute("src") === NEEDS_ASSET_THUMB) return;
    image.src = NEEDS_ASSET_THUMB;
    image.alt = "NEEDS ASSET";
    const label = image.closest(".factory-output-visual")?.querySelector(".factory-output-visual-label");
    if (label) label.textContent = "Needs asset";
  }, true);

  // A successful accept must remain visible even if the Desk still has an old
  // Ready-for-Review snapshot. This is a UX fence; R2 claims are authoritative.
  function recentFactoryAccepted() {
    try {
      const raw = JSON.parse(localStorage.getItem(FACTORY_ACCEPTED_OUTPUTS_KEY) || "{}");
      const now = Date.now();
      return Object.fromEntries(Object.entries(raw || {}).filter(([id, at]) =>
        /^rec[A-Za-z0-9]+$/.test(id) && now - Number(at) < 48 * 60 * 60 * 1000));
    } catch { return {}; }
  }
  function rememberFactoryAccepted(ids) {
    const entries = recentFactoryAccepted();
    for (const id of ids || []) if (/^rec[A-Za-z0-9]+$/.test(String(id))) entries[id] = Date.now();
    try { localStorage.setItem(FACTORY_ACCEPTED_OUTPUTS_KEY, JSON.stringify(entries)); } catch {}
  }
  function pendingFactoryApproval() {
    try { return JSON.parse(localStorage.getItem(FACTORY_PENDING_REQUEST_KEY) || "null"); }
    catch { return null; }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(FACTORY_SELECTION_KEY) || "[]");
    state.selectedOutputs = new Set(Array.isArray(saved)
      ? saved.filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id))).slice(0, 100)
      : []);
    const latest = JSON.parse(localStorage.getItem(FACTORY_LAST_BATCH_KEY) || "{}");
    state.lastBatchProfile = String(latest.profile_id || "");
  } catch { /* storage disabled: selection still persists while page is open */ }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, isError = false) {
    const node = $("factoryDeskStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error-text", Boolean(isError));
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: {
        Accept: "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      const detail = body?.error || body?.message || "";
      if (detail) throw new Error(detail);
      if (response.status === 503) {
        throw new Error("Factory desk is busy (503). Wait a moment, check Activity, then retry.");
      }
      if (response.status >= 500) {
        throw new Error(`Factory desk timed out or failed (${response.status}). Check Activity before retrying — the batch may not have been stored.`);
      }
      throw new Error(`Factory desk failed (${response.status})`);
    }
    return body || {};
  }

  function cardLabel(card) {
    const bits = [];
    if (card.content_id) bits.push(`C${card.content_id}`);
    if (card.output_id) bits.push(`Output #${card.output_id}`);
    if (card.production_request_number) bits.push(`PR${card.production_request_number}`);
    return bits.length ? `${bits.join(" · ")} — ${card.title || "Untitled"}` : (card.title || "Untitled");
  }

  function selectFactoryProfile(profileId) {
    const id = String(profileId || "").trim();
    const select = $("studioProfileSelect");
    if (!id || !select || select.value === id) return;
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fallbackOpenPage(page) {
    document.querySelector(`.nav-item[data-page="${page}"]`)?.click();
  }

  async function openStudioTarget(card) {
    const target = window.FactoryOpenTargets?.resolve?.(card) || {
      entity: card?.kind === "output" ? "output" : (card?.kind === "idea" ? "idea" : "production_request"),
      id: String(card?.production_request_id || card?.id || "").trim(),
      page: card?.kind === "output" ? "outputs" : (card?.kind === "idea" ? "ideas" : "content"),
      profileId: String(card?.profile_id || "").trim(),
    };
    selectFactoryProfile(target.profileId);

    try {
      if (target.entity === "production_request" && typeof window.StudioOpenProductionRequestById === "function") {
        await window.StudioOpenProductionRequestById(target.id);
        return;
      }
      if (target.entity === "output" && typeof window.StudioOpenPipelineOutputById === "function") {
        await window.StudioOpenPipelineOutputById(target.id);
        return;
      }
      if (target.entity === "idea" && typeof window.StudioOpenIdeaById === "function") {
        await window.StudioOpenIdeaById(target.id);
        return;
      }
      fallbackOpenPage(target.page);
    } catch (error) {
      // Keep a usable destination even if an exact record fetch fails. Production
      // requests never fall back to Ideas, because promoted/stale ideas may be absent.
      fallbackOpenPage(target.page);
      setStatus(`Opened ${target.page === "content" ? "Production" : (target.page === "outputs" ? "Pipeline" : "Ideas")}, but the exact item could not be loaded: ${error.message || error}`, true);
    }
  }

  function canReviewActions(card, { pile = false, candidate = false } = {}) {
    if (pile || candidate || state.submittingOutputIds?.has(card?.id) || recentFactoryAccepted()[String(card?.id || "")]) return false;
    if (card?.kind !== "output") return false;
    if (card.review_package_ready === false) return false;
    // Held revisions must be discoverable and previewable, never approvable
    // from Factory until their separate review and QA handoff completes.
    if (card.review_hold_active === true || card.do_not_publish === true) return false;
    // studio_state can paint Ready for Review while Output_Status is still
    // In Production. Approve all must only claim Airtable-ready rows.
    const output = String(card.output_status || "").trim().toLowerCase();
    const review = String(card.review_status || "").trim().toLowerCase();
    const render = String(card.render_status || "").trim().toLowerCase();
    if (/ready for render|waiting in render queue|^rendering$|^failed$|^blocked$/.test(render)) return false;
    if (["in production", "rendering", "ready for render", "failed", "blocked"].includes(output)) return false;
    if (output === "ready for review") return true;
    if (review === "review sent" || review === "ready for review") return true;
    return /ready for review/i.test(String(card.studio_state || ""));
  }

  function canDelete(card, { candidate = false } = {}) {
    if (candidate) return false;
    if (card?.kind === "idea") return true;
    if (card?.kind === "output") return true;
    return false;
  }

  function canPreview(card) {
    if (card?.kind !== "output") return false;
    if (card.can_preview) return true;
    return Boolean(card.preview_url || card.final_file_url || card.thumbnail_url);
  }

  function looksLikeImageOnly(card) {
    const type = `${card.studio_output_type || ""} ${card.platform || ""}`.toLowerCase();
    if (/carousel|single image|single photo|feed post/.test(type) && !/reel|story|short|tiktok|video/.test(type)) {
      return Boolean(card.thumbnail_url) && !card.final_file_url;
    }
    return false;
  }

  function closeFactoryPreview() {
    const backdrop = $("factoryPreviewBackdrop");
    const video = $("factoryPreviewVideo");
    const image = $("factoryPreviewImage");
    const empty = $("factoryPreviewEmpty");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
    }
    if (image) {
      image.removeAttribute("src");
      image.hidden = true;
    }
    if (empty) empty.hidden = true;
    dialog?.classList.remove("is-image");
    dialog?.classList.add("is-video");
    if (backdrop) backdrop.hidden = true;
  }

  function openFactoryPreview(card) {
    const backdrop = $("factoryPreviewBackdrop");
    const video = $("factoryPreviewVideo");
    const image = $("factoryPreviewImage");
    const empty = $("factoryPreviewEmpty");
    const title = $("factoryPreviewTitle");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (!backdrop || !video || !image || !dialog) {
      setStatus("Preview UI is missing from this page build.", true);
      return;
    }
    if (title) title.textContent = cardLabel(card);
    empty.hidden = true;
    image.hidden = true;
    image.removeAttribute("src");
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");

    const thumb = String(card.thumbnail_url || "").trim();
    const previewUrl = String(card.preview_url || "").trim()
      || (/^rec[A-Za-z0-9]+$/.test(String(card.id || "")) ? `/api/outputs/${card.id}/preview` : "");
    const imageOnly = looksLikeImageOnly(card);

    if (imageOnly && thumb) {
      dialog.classList.remove("is-video");
      dialog.classList.add("is-image");
      image.src = thumb;
      image.hidden = false;
      backdrop.hidden = false;
      setStatus(`Previewing still · ${cardLabel(card)}`);
      return;
    }

    if (!previewUrl && !thumb) {
      dialog.classList.add("is-video");
      dialog.classList.remove("is-image");
      empty.hidden = false;
      empty.textContent = "No preview file yet for this output.";
      backdrop.hidden = false;
      setStatus("No preview file yet.", true);
      return;
    }

    dialog.classList.add("is-video");
    dialog.classList.remove("is-image");
    if (thumb) video.setAttribute("poster", thumb);
    video.onerror = () => {
      // A failed video is not a successful still render. Never silently
      // replace the movie with its cover image (Output 3129).
      video.pause();
      video.hidden = true;
      image.hidden = true;
      empty.hidden = false;
      empty.textContent = "Video playback failed — this cover is not the finished render. Open the output in Pipeline or its original video file to review the scenes.";
      setStatus(`Video preview failed for ${cardLabel(card)} — not a single-image render.`, true);
    };
    video.onplaying = () => setStatus(`Playing video · ${cardLabel(card)}`);
    video.onloadedmetadata = () => {
      if (video.paused) setStatus(`Video ready · tap Play to review all scenes of ${cardLabel(card)}`);
    };
    video.controls = true;
    video.src = previewUrl;
    video.hidden = false;
    video.load();
    backdrop.hidden = false;
    setStatus(`Video loading · tap Play if it does not start automatically · ${cardLabel(card)}`);
    video.play?.().catch(() => {
      // Unmuted autoplay is blocked on iOS. Explain why a poster is visible.
      if (!video.error) setStatus(`Video ready · tap Play to watch the full render · ${cardLabel(card)}`);
    });
  }


  function saveFactorySelection() {
    try { localStorage.setItem(FACTORY_SELECTION_KEY, JSON.stringify([...state.selectedOutputs])); } catch {}
    updateFactoryBatchToolbar();
  }

  function canSelectBatchOutput(card) {
    if (recentFactoryAccepted()[String(card?.id || "")]) return false;
    if (state.batchApprovalsEnabled === false) return false;
    if (state.batchGlobal?.enabled) {
      const platform = String(card?.platform || "").trim();
      // A lean Desk card may carry the output type in format while its
      // studio_output_type is a stale display alias. Accept either only when
      // the server-signed platform matrix explicitly permits it.
      const typesOnCard = [...new Set([card?.studio_output_type, card?.format]
        .map((value) => String(value || "").trim()).filter(Boolean))];
      const platforms = Array.isArray(state.batchGlobal.allowed_platforms)
        ? state.batchGlobal.allowed_platforms : ["Instagram"];
      if (!platforms.includes(platform)) return false;
      const byPlatform = state.batchGlobal.allowed_output_types_by_platform || {};
      const types = Array.isArray(byPlatform[platform]) ? byPlatform[platform]
        : (Array.isArray(state.batchGlobal.allowed_formats)
          ? state.batchGlobal.allowed_formats : ["Reel","Story"]);
      return typesOnCard.some((type) => types.includes(type));
    }
    const rollout = state.batchRollout;
    if (!rollout) return state.batchApprovalsEnabled !== false;
    if (rollout.mode === "isolated_staging") return true;
    if (!["chicago_ig_reel_v1", "chicago_ig_reels_v2",
      "chicago_ig_reel_story_v3"].includes(rollout.mode)) return false;
    const type = String(card?.studio_output_type || card?.format || "").trim();
    return String(card?.profile_id || "") === String(rollout.profile_id || "")
      && String(card?.platform || "") === "Instagram"
      && (type === "Reel" || (rollout.mode === "chicago_ig_reel_story_v3" && type === "Story"));
  }

  function factoryProfileId() {
    return String($("factoryProfileFilter")?.value || "").trim();
  }
  function factoryProfileLabel(profileId) {
    const id = String(profileId || "");
    if (!id) return "All Profiles";
    const option = [...($("factoryProfileFilter")?.options || [])].find(row => row.value === id);
    return option?.textContent?.trim() || "City profile";
  }
  // Make the Factory-specific scope visible beside the review queue.
  // Explicit Needs eyes search currently spans all city profiles.
  function renderFactoryProfileFilterNotice() {
    const notice = $("factoryActiveProfileFilter");
    if (!notice) return;
    const id = factoryProfileId();
    notice.hidden = !id;
    if (!id) return;
    const label = factoryProfileLabel(id);
    const searchingAll = Boolean(String(state.needsEyesSearch || "").trim());
    const scope = $("factoryActiveProfileScope");
    if (scope) scope.textContent = searchingAll
      ? `Searching all profiles (Factory filter: ${label})`
      : `Showing ${label} only`;
    const context = $("factoryActiveProfileContext");
    if (context) context.textContent = searchingAll
      ? "Search temporarily includes all profiles; clearing search restores this profile filter."
      : "Other profiles are hidden from Factory queues.";
  }
  function syncFactoryFilterOptions() {
    const select = $("factoryProfileFilter");
    if (!select) return;
    const prior = select.value;
    const profiles = new Map();
    for (const option of $("studioProfileSelect")?.options || []) {
      if (/^rec[A-Za-z0-9]+$/.test(option.value)) profiles.set(option.value, option.textContent.trim());
    }
    for (const card of Object.values(state.desk?.lanes || {}).flat()
      .concat(state.desk?.needs_assets_candidates || [])) {
      if (/^rec[A-Za-z0-9]+$/.test(card?.profile_id || "")) {
        profiles.set(card.profile_id, card.profile_name || profiles.get(card.profile_id) || "City profile");
      }
    }
    select.innerHTML = '<option value="">All Profiles</option>' +
      [...profiles.entries()].sort((a, b) => a[1].localeCompare(b[1]))
        .map(([id, name]) => `<option value="${esc(id)}">${esc(name)}</option>`).join("");
    select.value = profiles.has(prior) ? prior : "";
    renderFactoryProfileFilterNotice();
  }
  function factoryMatchesProfile(card) {
    return !factoryProfileId() || String(card?.profile_id || "") === factoryProfileId();
  }
  function readyFactoryOutputs(includeOtherProfiles=false) {
    const hidden = new Set([...Object.keys(recentFactoryAccepted()), ...(state.submittingOutputIds || [])]);
    return (state.desk?.lanes?.needs_eyes || [])
      .filter((card) => !hidden.has(card.id) && (includeOtherProfiles || factoryMatchesProfile(card)) && card?.kind === "output"
        && canReviewActions(card) && canSelectBatchOutput(card));
  }

  function planFactoryApprovalBatches(cards, maxTotal, maxPerProfile) {
    const totalLimit = Math.max(1, Math.floor(Number(maxTotal) || 1));
    const profileLimit = Math.max(1, Math.floor(Number(maxPerProfile) || totalLimit));
    let remaining = [...cards];
    const batches = [];
    while (remaining.length) {
      const batch = [];
      const deferred = [];
      const perProfile = new Map();
      for (const card of remaining) {
        const profileId = String(card?.profile_id || "").trim();
        const used = perProfile.get(profileId) || 0;
        if (batch.length < totalLimit && used < profileLimit) {
          batch.push(card);
          perProfile.set(profileId, used + 1);
        } else {
          deferred.push(card);
        }
      }
      if (!batch.length) throw new Error("Unable to partition Factory approval selection safely.");
      batches.push(batch);
      remaining = deferred;
    }
    return batches;
  }

  function newFactoryRequestId() {
    return (typeof window.crypto?.randomUUID === "function"
      ? window.crypto.randomUUID()
      : `factory_${Date.now()}_${Math.random().toString(36).slice(2)}`)
      .replace(/[^A-Za-z0-9_-]/g, "");
  }

  function updateFactoryBatchToolbar() {
    const readyCards = readyFactoryOutputs(true);
    const ready = new Set(readyCards.map((card) => card.id));
    const selectedCards = readyCards.filter((card) => state.selectedOutputs.has(card.id));
    const selectable = selectedCards.length;
    const global = state.batchGlobal?.enabled === true;
    const limit = Math.max(1, Number(global ? state.batchGlobal.max_total : (state.batchRollout?.max_items || 100)));
    const perProfile = Math.max(1, Number(state.batchGlobal?.max_per_profile || limit));
    const planned = global && selectable
      ? planFactoryApprovalBatches(selectedCards, limit, perProfile).length : (selectable ? 1 : 0);
    const count = $("factoryBatchSelectionCount");
    if (count) count.textContent = `${selectable} output${selectable === 1 ? "" : "s"} selected${planned > 1 ? ` · will submit as ${planned} batches` : ""}`;
    const submit = $("factoryBatchSubmit");
    if (submit) {
      const pending = pendingFactoryApproval();
      const pendingIds = pending?.profile_id === "global" && Array.isArray(pending.ids)
        ? pending.ids : null;
      const pendingMismatch = pendingIds && (pendingIds.length !== selectable ||
        pendingIds.some(id => !selectedCards.some(card => card.id === id)));
      submit.disabled = !selectable || (!global && selectable > limit) ||
        state.submittingBatch || state.batchApprovalsEnabled === false || Boolean(pendingMismatch);
      submit.title = state.batchApprovalsEnabled === false
        ? "Batch approval rollout is disabled for this profile; individual approvals remain available."
        : global && planned > 1
          ? `This selection will be submitted as ${planned} durable batches, each within the ${limit}-total / ${perProfile}-per-profile safety limits.`
          : selectable > limit ? `Select at most ${limit} output${limit === 1 ? "" : "s"} for this rollout.` : "";
      submit.textContent = state.submittingBatch ? "Submitting…"
        : pendingIds ? "Resume previous submission (same request)"
        : `Submit Approvals${selectable ? ` (${selectable})` : ""}`;
      if (pendingMismatch) submit.title = "An earlier submission is still unresolved. Refresh Activity; a different request is blocked until reconciliation.";
    }
    const clear = $("factoryBatchClear");
    if (clear) clear.disabled = !state.selectedOutputs.size || state.submittingBatch;
    const rolloutNotice = $("factoryBatchRolloutNotice");
    if (rolloutNotice) {
      const rollout = state.batchRollout;
      if (state.batchGlobal?.enabled) {
        rolloutNotice.hidden = false;
        const platforms = Array.isArray(state.batchGlobal.allowed_platforms) && state.batchGlobal.allowed_platforms.length
          ? state.batchGlobal.allowed_platforms.join(", ") : "Instagram";
        rolloutNotice.textContent = `Global Factory (${state.batchGlobal.stage === "pilot" ? "pilot" : "expanded"}): up to ${state.batchGlobal.max_total} supported outputs per backend batch, maximum ${state.batchGlobal.max_per_profile} per profile, across ${platforms}. Larger selections are automatically split into safe batches. Profile-local scheduling remains authoritative.`;
      } else if (["chicago_ig_reel_v1", "chicago_ig_reels_v2",
        "chicago_ig_reel_story_v3"].includes(rollout?.mode)) {
        rolloutNotice.hidden = false;
        rolloutNotice.textContent = state.batchApprovalsEnabled
          ? (rollout.mode === "chicago_ig_reel_story_v3"
            ? "Chicago Instagram pilot: select up to five Reels or Stories per batch. Other formats and profiles remain blocked."
            : rollout.mode === "chicago_ig_reels_v2"
              ? "Chicago Reel pilot: select up to five Instagram Reels per batch. Other formats and profiles remain blocked."
              : "Limited production pilot: approve one Chicago Instagram Reel at a time. Stories, YouTube and other platforms are not available for batch approval yet.")
          : "Limited production pilot: only Chicago Instagram Reels are eligible. Select Chicago to submit; individual approvals remain available elsewhere.";
      } else {
        rolloutNotice.hidden = true;
        rolloutNotice.textContent = "";
      }
    }
  }

  function renderFactoryBatchActivity(batch) {
    if (batch?.view === "completed") state.completedBatch = batch;
    else state.batch = batch || null;
    const viewed = state.completedOpen ? state.completedBatch : state.batch;
    const summary = $("factoryBatchSummary");
    const count = $("factoryBatchMetricValue");
    const recent = $("factoryBatchRecentList");
    const inspect = $("factoryBatchInspect");
    const retry = $("factoryBatchRetry");
    const details = $("factoryBatchDetails");
    const updated = $("factoryBatchUpdated");
    const listHeading = $("factoryBatchListHeading");
    const toggle = $("factoryBatchCompletedToggle");
    const collapse = $("factoryBatchActiveCollapse");
    const close = $("factoryBatchCompletedClose");
    const prev = $("factoryBatchCompletedPrev");
    const next = $("factoryBatchCompletedNext");
    const page = $("factoryBatchCompletedPage");
    if (!summary || !details) return;
    // Activity is split into active and completed snapshots. Always render the
    // selected snapshot: using 'batch.batches' here silently replaced completed
    // history with the (often empty) active list.
    const batches = Array.isArray(viewed?.batches) ? viewed.batches :
      (viewed?.job_id ? [viewed] : []);
    const totals = viewed?.totals || {
      batches: batches.length,
      active: batches.filter(row => ["queued", "running", "enqueuing"].includes(row.status)).length,
      approved: batches.reduce((sum, row) => sum + Number(row.approved_count || 0), 0),
      pending: batches.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
      failed: batches.reduce((sum, row) => sum + Number(row.failed_count || 0), 0),
    };
    if (count) count.textContent = String(state.batch?.totals?.batches || 0);
    if (listHeading) listHeading.textContent = state.completedOpen ? "Completed approvals" : "Active approvals";
    if (toggle) {
      toggle.hidden = state.completedOpen;
      toggle.textContent = "Completed Batches";
      toggle.setAttribute("aria-pressed", String(state.completedOpen));
    }
    const listCollapsed = !state.completedOpen && state.activeApprovalsCollapsed;
    if (collapse) {
      collapse.hidden = state.completedOpen;
      collapse.textContent = listCollapsed ? "Expand list" : "Collapse list";
      collapse.setAttribute("aria-expanded", String(!listCollapsed));
    }
    if (close) close.hidden = !state.completedOpen;
    if (prev) prev.hidden = !state.completedOpen || state.completedOffset === 0;
    if (next) next.hidden = !state.completedOpen || !viewed?.has_more;
    if (page) {
      page.hidden = !state.completedOpen || !viewed || !(state.completedOffset > 0 || viewed.has_more);
      page.textContent = "Page " + (1 + Math.floor(state.completedOffset / 20));
    }
    summary.textContent = `${Number(totals.active) || 0} active · ${Number(totals.approved) || 0} approved · ${Number(totals.pending) || 0} pending · ${Number(totals.failed) || 0} failed`;
    if (updated) updated.textContent = state.completedOpen
      ? (state.completedLoading ? "Loading completed batches…" : "Loaded only on request")
      : "Live · batches needing action";
    const latest = batches.find(row => row.job_id === state.inspectedBatchKey) || batches[0] || null;
    if (state.inspectedBatchKey && !batches.some(row => row.job_id === state.inspectedBatchKey)) {
      state.inspectedBatchKey = latest?.job_id || "";
    }
    if (recent) recent.hidden = listCollapsed;
    if (recent) recent.innerHTML = batches.length
      ? batches.slice(0, state.completedOpen ? 20 : 40).map(row => {
        const item = (row.items || [])[0] || {};
        const groupLabel = row.group ? `${row.profile_ids?.length || 1} profiles`
          : factoryProfileLabel(row.profile_id);
        const outputLabel = row.group ? `${row.total || 0} outputs`
          : item.output_id ? `Output #${item.output_id}` : `${row.total || 0} outputs`;
        const label = row.group ? `Global approval · ${groupLabel}`
          : item.title || [item.platform, item.format].filter(Boolean).join(" ") || "Approval batch";
        const active = ["running", "queued", "enqueuing"].includes(row.status);
        const stateLabel = active ? "Processing" : row.failed_count ? "Needs attention" : "Completed";
        const completed = Number(row.done_count ?? (Number(row.total||0)-Number(row.pending_count||0)));
        const percent = row.total ? Math.round(100 * completed / row.total) : 0;
        const picked = state.batchDetailsOpen && latest?.job_id === row.job_id;
        return `<button type="button" class="factory-batch-recent-row factory-batch-activity-choice${picked ? " is-selected" : ""}"
          data-factory-activity-key="${esc(row.job_id)}" aria-pressed="${picked}"
          aria-expanded="${picked}" aria-controls="factoryBatchDetails"
          aria-label="${picked ? "Collapse" : "Inspect"} ${esc(label)}">
          <span class="factory-batch-recent-info">
            <strong>${esc(label)}</strong>
            <span>${esc(outputLabel)} · ${Number(row.approved_count)||0} approved · ${Number(row.pending_count)||0} pending</span>
          </span>
          <span class="factory-batch-recent-result">
            <strong>${esc(stateLabel)}</strong><span>${Number(row.failed_count)||0} failed</span>
          </span>
          <span class="factory-batch-mini-progress" aria-hidden="true"><span style="width:${percent}%"></span></span>
        </button>`;
      }).join("")
      : '<p class="subtle">' + (state.completedOpen
        ? (state.completedLoading ? "Loading completed batches…" : "No completed batches in this page.")
        : "No active approval batches. All clear.") + '</p>';
    if (inspect) {
      inspect.hidden = !latest || listCollapsed;
      inspect.setAttribute("aria-expanded", String(state.batchDetailsOpen));
    }
    if (retry) {
      retry.hidden = listCollapsed || !(latest?.failed_count > 0 && latest?.can_retry);
      retry.disabled = state.submittingBatch;
    }
    details.hidden = listCollapsed || !state.batchDetailsOpen || !latest;
    const items = Array.isArray(latest?.items) ? latest.items : [];
    const children = Array.isArray(latest?.children) ? latest.children : [];
    const childrenHtml = children.length ? `<div class="factory-batch-child-grid">${children.map(child => {
      const done = Number(child.done_count ?? (Number(child.total||0)-Number(child.pending_count||0)));
      const percent = child.total ? Math.round(100*done/child.total) : 0;
      return `<section class="factory-batch-child">
        <strong>${esc(factoryProfileLabel(child.profile_id))}</strong>
        <span>${esc(["queued","running","enqueuing","missing"].includes(child.status) ? "Processing" : child.failed_count ? "Needs attention" : "Completed")}</span>
        <progress max="${Number(child.total)||1}" value="${done}">${percent}%</progress>
        <small>${Number(child.approved_count)||0} approved · ${Number(child.pending_count)||0} pending · ${Number(child.failed_count)||0} failed</small>
      </section>`;
    }).join("")}</div>` : "";
    details.innerHTML = latest ? `<div class="factory-batch-inspect-heading">
        <strong>${esc(latest.group ? "Global approval · per-profile progress" : factoryProfileLabel(latest.profile_id))}</strong>
        <span>${Number(latest.done_count)||0} / ${Number(latest.total)||0} processed</span>
      </div>
      ${childrenHtml}
      <ul class="factory-batch-item-list">${items.map(item =>
        `<li><strong>${esc(item.title || [item.platform, item.format].filter(Boolean).join(" ") || "Output")}</strong>
        <span>${esc(item.output_id ? `Output #${item.output_id}` : "Output")} · ${esc(item.profile_id ? factoryProfileLabel(item.profile_id)+" · " : "")}${esc(item.status || "pending")}</span>
        ${item.error ? `<small>${esc(item.error)}</small>` : ""}</li>`).join("")}</ul>
      <details class="factory-batch-technical"><summary>Technical reference</summary>
      <code>${esc(latest.job_id)}</code> <button type="button" class="secondary-button"
      data-factory-copy-batch="${esc(latest.job_id)}">Copy batch ID</button></details>` : "";
    details.querySelector("[data-factory-copy-batch]")?.addEventListener("click", () => {
      const value = String(latest?.job_id || "");
      if (value) navigator.clipboard?.writeText(value).catch(() => {});
    });
    recent?.querySelectorAll("[data-factory-activity-key]").forEach(button => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-factory-activity-key") || "";
        // The selected batch is a toggle: clicking it again hides its details.
        // Selecting a different batch opens that batch without losing its status.
        const alreadyOpen = state.batchDetailsOpen && latest?.job_id === key;
        state.inspectedBatchKey = key;
        state.batchDetailsOpen = !alreadyOpen;
        renderFactoryBatchActivity(state.completedOpen ? state.completedBatch : state.batch);
      });
    });
  }

  // Batch status is independently polled, but the Needs Eyes list is not.
  // Once the durable batch finishes, fetch an authoritative Desk snapshot so
  // approved outputs disappear from Needs Eyes without a page reload.
  async function reconcileFinishedBatchDesk(batch) {
    if (!batch?.job_id || !["completed", "failed"].includes(batch.status)) return;
    const confirmed = (Array.isArray(batch.items) ? batch.items : [])
      .filter((item) => item.status === "approved" || item.status === "already_satisfied")
      .map((item) => String(item.id || ""));
    if (!confirmed.length || !state.desk || state.loading || state.reconcilingBatchDesk) return;
    if (document.hidden || !$("page-factory")?.classList.contains("active")) return;
    const key = String(batch.job_id);
    if (state.reconciledBatchDeskKey === key || Date.now() < state.batchDeskReconcileNextAttempt) return;
    state.reconcilingBatchDesk = true;
    state.batchDeskReconcileNextAttempt = Date.now() + 10000;
    try {
      const desk = await fetchJson("/api/factory/desk", { cache: "no-store" });
      if (!(state.batch?.batches || [state.batch]).some(row => row?.job_id === key)) return;
      renderDesk(desk);
      const stillReviewing = new Set((desk.lanes?.needs_eyes || [])
        .filter((card) => card?.kind === "output").map((card) => String(card.id || "")));
      // A lagging read copy must not suppress later reconciliation attempts.
      if (confirmed.every((id) => !stillReviewing.has(id))) state.reconciledBatchDeskKey = key;
    } catch (error) {
      setStatus("Batch completed, but Factory list refresh failed. Refresh Factory to reconcile the list.", true);
    } finally {
      state.reconcilingBatchDesk = false;
    }
  }

  function factoryActivityRows(activity) {
    return Array.isArray(activity?.batches) ? activity.batches
      : (activity?.job_id ? [activity] : []);
  }

  function factoryActivityMatchesPlan(activity, plan) {
    const expected = [...(plan?.ids || [])].map(String).sort();
    if (!plan?.request_id || !expected.length) return null;
    for (const row of factoryActivityRows(activity)) {
      if (String(row?.request_id || "") !== String(plan.request_id)
          && String(row?.job_id || "") !== `fg_${plan.request_id}`) continue;
      const actual = (Array.isArray(row?.items) ? row.items : [])
        .map((item) => String(item?.id || "")).filter(Boolean).sort();
      if (actual.length === expected.length
          && actual.every((id, index) => id === expected[index])) return row;
    }
    return null;
  }

  function reconcilePendingGlobalSelection(activity) {
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(FACTORY_PENDING_REQUEST_KEY) || "null"); } catch {}
    if (pending?.profile_id !== "global" || !Array.isArray(pending?.batches) || !pending.batches.length) return 0;
    const remaining = [];
    let recovered = 0;
    for (const plan of pending.batches) {
      if (factoryActivityMatchesPlan(activity, plan)) {
        rememberFactoryAccepted(plan.ids || []);
        recovered += (plan.ids || []).length;
        for (const id of plan.ids || []) {
          state.selectedOutputs.delete(id);
        }
      } else {
        remaining.push(plan);
      }
    }
    if (!recovered) return 0;
    saveFactorySelection();
    try {
      if (remaining.length) {
        localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify({
          profile_id: "global",
          ids: remaining.flatMap((row) => row.ids || []),
          batches: remaining,
          saved_ms: Number(pending.saved_ms || Date.now()),
        }));
      } else {
        localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY);
      }
    } catch {}
    if (state.desk) renderDesk(state.desk);
    updateFactoryBatchToolbar();
    return recovered;
  }

  let factoryPendingReconcileAt = 0;
  let factoryPendingReconcileRunning = false;
  async function reconcilePersistedFactoryPending(force = false) {
    const pending = pendingFactoryApproval();
    if (state.submittingBatch || factoryPendingReconcileRunning ||
        pending?.profile_id !== "global" || !Array.isArray(pending.batches) ||
        !pending.batches.length) return;
    if (!force && Date.now() - factoryPendingReconcileAt < 15000) return;
    factoryPendingReconcileAt = Date.now();
    factoryPendingReconcileRunning = true;
    try {
      // Active Activity intentionally excludes completed batches. Read each
      // pending request by exact ID, including after reload or mobile timeout.
      for (const plan of pending.batches) {
        try {
          const activity = await fetchJson("/api/factory/approval-batches?scope=all&request_id=" +
            encodeURIComponent(plan.request_id), { cache: "no-store" });
          const confirmed = factoryActivityMatchesPlan(activity, plan);
          if (confirmed) reconcilePendingGlobalSelection({ batches: [confirmed] });
        } catch { /* Preserve unresolved request identity; never create a new one. */ }
      }
    } finally {
      factoryPendingReconcileRunning = false;
      updateFactoryBatchToolbar();
    }
  }

  async function recoverSubmittedFactoryPlan(plan, originalError) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt) await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
      // Exact-id read avoids querying historical completed batches when a
      // POST response was lost and the job finished before our next poll.
      const activity = await fetchJson("/api/factory/approval-batches?scope=all&request_id=" +
        encodeURIComponent(plan.request_id), { cache: "no-store" });
      const found = factoryActivityMatchesPlan(activity, plan);
      if (found) {
        refreshFactoryBatchActivity(true).catch(() => {});
        return { ...found, accepted: true, recovered_after_error: true };
      }
    }
    throw originalError;
  }

  async function refreshFactoryBatchActivity(force = false) {
    const now = Date.now();
    const minInterval = Number(state.batch?.totals?.active || 0) ? 5000 : 30000;
    if (!force && state.batch && now - state.lastBatchFetchMs < minInterval) return state.batch;
    const params = new URLSearchParams({ scope: "all" });
    params.set("view", "active");
    if (factoryProfileId()) params.set("factory_profile", factoryProfileId());
    try {
      const previousActive = (state.batch?.batches || []).filter(row => row?.job_id);
      const fetched = await fetchJson(`/api/factory/approval-batches?${params.toString()}`, { cache: "no-store" });
      // An empty polling response is not proof that a running batch vanished.
      // Hold the last nonempty activity snapshot until two consecutive empty polls;
      // the authoritative Desk will still be reconciled on the confirmed transition.
      const emptyActive = previousActive.length > 0 && !(fetched.batches || []).length;
      state.emptyActivityPolls = emptyActive ? (state.emptyActivityPolls || 0) + 1 : 0;
      const batch = emptyActive && state.emptyActivityPolls < 2 ? state.batch : fetched;
      state.lastBatchFetchMs = Date.now();
      if (typeof batch.approvals_enabled === "boolean") {
        const before = JSON.stringify([state.batchRollout,state.batchGlobal]);
        state.batchApprovalsEnabled = batch.approvals_enabled;
        state.batchRollout = batch.rollout || null;
        state.batchGlobal = batch.global_rollout || null;
        updateFactoryBatchToolbar();
        if (state.desk && before !== JSON.stringify([state.batchRollout,state.batchGlobal])) renderDesk(state.desk);
      }
      renderFactoryBatchActivity(batch);
      reconcilePendingGlobalSelection(batch);
      document.dispatchEvent(new CustomEvent("factory:batch-status", { detail: batch }));
      reconcileFinishedBatchDesk(batch?.batches?.[0] || batch).catch(() => {});
      reconcilePersistedFactoryPending().catch(() => {});
      // The API intentionally omits completed jobs from the active feed.
      // When a running batch disappears, refresh the authoritative Desk once,
      // without fetching terminal batch history or leaving stale Needs Eyes rows.
      const liveIds = new Set((fetched.batches || []).map(row => row.job_id));
      if (batch === fetched && previousActive.some(row => !liveIds.has(row.job_id)) &&
          !state.loading && !state.reconcilingBatchDesk) {
        state.reconcilingBatchDesk = true;
        fetchJson("/api/factory/desk", { cache: "no-store" })
          .then(desk => { state.desk = desk; renderDesk(desk); })
          .catch(() => {})
          .finally(() => { state.reconcilingBatchDesk = false; });
      }
      return batch;
    } catch (error) {
      const summary = $("factoryBatchSummary");
      if (summary) summary.textContent = `Batch status temporarily unavailable: ${error.message || error}. Retry status refresh; do not resubmit blindly.`;
      return null;
    }
  }

  // Terminal history is never fetched by Factory's load, refresh, or status timer.
  // An explicit Completed Batches click is the only entry point here.
  async function refreshFactoryCompletedBatches(offset = 0) {
    if (!state.completedOpen || state.completedLoading) return;
    state.completedLoading = true;
    const profileAtRequest = factoryProfileId();
    state.completedOffset = offset;
    renderFactoryBatchActivity(state.batch);
    const params = new URLSearchParams({ scope: "all", view: "completed", offset: String(offset) });
    if (profileAtRequest) params.set("factory_profile", profileAtRequest);
    try {
      const completed = await fetchJson(`/api/factory/approval-batches?${params.toString()}`, { cache: "no-store" });
      if (!state.completedOpen || factoryProfileId() !== profileAtRequest) return;
      renderFactoryBatchActivity(completed);
    } catch (error) {
      const node = $("factoryBatchUpdated");
      if (node && state.completedOpen) node.textContent = "Completed history unavailable: " + (error.message || error);
    } finally {
      state.completedLoading = false;
      if (state.completedOpen) renderFactoryBatchActivity(state.batch);
    }
  }

  async function submitFactoryGlobalApprovalBatches(ready) {
    const maxTotal = Math.max(1, Number(state.batchGlobal?.max_total || 20));
    const maxPerProfile = Math.max(1, Number(state.batchGlobal?.max_per_profile || 10));
    const selectionIds = ready.map((card) => card.id);
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(FACTORY_PENDING_REQUEST_KEY) || "null"); } catch {}
    const reusable = pending?.profile_id === "global"
      && Array.isArray(pending?.ids)
      && JSON.stringify(pending.ids) === JSON.stringify(selectionIds)
      && Array.isArray(pending?.batches)
      && pending.batches.every((row) => Array.isArray(row?.ids) && row?.request_id);
    if (pending && !reusable) {
      throw new Error("A previous approval remains unresolved. Refresh Activity before starting any different submission.");
    }
    const planned = reusable
      ? pending.batches
      : planFactoryApprovalBatches(ready, maxTotal, maxPerProfile).map((batch) => ({
          ids: batch.map((card) => card.id), request_id: newFactoryRequestId(),
        }));
    const byId = new Map(ready.map((card) => [card.id, card]));
    const persistRemaining = (rows) => {
      if (!rows.length) {
        try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
        return;
      }
      const ids = rows.flatMap((row) => row.ids);
      try { localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify({
        profile_id: "global", ids, batches: rows, saved_ms: Date.now(),
      })); } catch {}
    };
    persistRemaining(planned);
    state.submittingBatch = true;
    state.submittingOutputIds = new Set(selectionIds);
    if (state.desk) renderDesk(state.desk);
    updateFactoryBatchToolbar();
    let acceptedOutputs = 0;
    let acceptedBatches = 0;
    try {
      for (let index = 0; index < planned.length; index++) {
        const plan = planned[index];
        const chunk = plan.ids.map((id) => byId.get(id)).filter(Boolean);
        if (chunk.length !== plan.ids.length) throw new Error("Factory selection changed before all batches were submitted.");
        const profiles = [...new Set(chunk.map((card) => String(card.profile_id || "").trim()))];
        let batch;
        try {
          batch = await fetchJson("/api/factory/approval-batches", {
            method: "POST",
            body: JSON.stringify({
              action: "start_group",
              request_id: plan.request_id,
              notes: "Studio Factory Batch Approval",
              record_ids: chunk.map((card) => card.id),
              items: chunk.map((card) => ({
                id: card.id, output_id: card.output_id || null,
                title: card.title || null, content_id: card.content_id || null,
                profile_id: card.profile_id || null,
                platform: card.platform || null, format: card.studio_output_type || null,
              })),
            }),
          });
        } catch (error) {
          // The POST may have committed even if iOS/networking lost the response.
          // Prove the exact request ID + output set exists in authoritative Activity
          // before treating it as accepted and continuing to the next chunk.
          batch = await recoverSubmittedFactoryPlan(plan, error);
        }
        if (!batch.accepted) throw new Error("Approval queue did not acknowledge the batch.");
        acceptedOutputs += chunk.length;
        acceptedBatches++;
        rememberFactoryAccepted(plan.ids);
        chunk.forEach((card) => state.selectedOutputs.delete(card.id));
        saveFactorySelection();
        if (state.desk) renderDesk(state.desk);
        const remaining = planned.slice(index + 1);
        persistRemaining(remaining);
        state.lastBatchProfile = "global";
        try { localStorage.setItem(FACTORY_LAST_BATCH_KEY, JSON.stringify({
          job_id: batch.job_id, profile_id: "global",
        })); } catch {}
        renderFactoryBatchActivity(batch);
        setStatus(batch.duplicate_prevented
          ? `These outputs were already submitted. Original batch restored; no duplicate created. ${acceptedOutputs} of ${ready.length} reconciled.`
          : batch.recovered_after_error
            ? `Recovered a confirmed server submission after a connection error. Accepted ${acceptedOutputs} of ${ready.length} outputs; continuing automatically.`
            : `Accepted ${acceptedOutputs} of ${ready.length} outputs in ${acceptedBatches} batch${acceptedBatches === 1 ? "" : "es"}. Server processing continues in the background.`);
      }
      if (state.desk) renderDesk(state.desk);
      closeFactoryPreview();
      setStatus(`All ${ready.length} outputs accepted as ${acceptedBatches} durable approval batch${acceptedBatches === 1 ? "" : "es"}. Server processing continues after leaving Factory.`);
      refreshFactoryBatchActivity(true).catch(() => {});
      // Never wait for all approvals in the click handler.
    } catch (error) {
      const remaining = state.selectedOutputs.size;
      setStatus(`Submitted ${acceptedOutputs} of ${ready.length} outputs. ${remaining} remain selected. ${error.message || error} Check Activity before retrying.`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingOutputIds = null;
      state.submittingBatch = false;
      if (state.desk) renderDesk(state.desk);
      updateFactoryBatchToolbar();
    }
  }

  async function submitFactoryBatchApprovals() {
    if (state.submittingBatch) return;
    const unresolved = pendingFactoryApproval();
    if (unresolved?.profile_id === "global") {
      setStatus("Resuming the saved Factory submission using its original request ID; no new request will be created.");
    }
    if (state.batchApprovalsEnabled === false) { setStatus("Batch approvals are not enabled yet; individual approvals still work.", true); return; }
    const ready = readyFactoryOutputs(true).filter((card) => state.selectedOutputs.has(card.id));
    if (!ready.length) { updateFactoryBatchToolbar(); setStatus("Select one or more review-ready outputs.", true); return; }
    const profiles = [...new Set(ready.map((card) => String(card.profile_id || "").trim()))];
    const global = state.batchGlobal?.enabled === true;
    const limit = Math.max(1, Number(global ? state.batchGlobal.max_total : (state.batchRollout?.max_items || 100)));
    if (profiles.some(id=>!/^rec[A-Za-z0-9]+$/.test(id)) || (!global && profiles.length!==1)) {
      setStatus("Global approvals are not enabled for this selection; select one authorized profile.", true);
      return;
    }
    if (global) {
      return submitFactoryGlobalApprovalBatches(ready);
    }
    if (ready.length > limit) {
      setStatus(`The current rollout permits at most ${limit} eligible outputs.`, true);
      return;
    }
    // Each child owns profile-local scheduling.
    // Refuse to mix profiles rather than stamp an output in the wrong timezone.
    state.submittingBatch = true;
    state.submittingOutputIds = new Set(ready.map(card => card.id));
    if (state.desk) renderDesk(state.desk);
    updateFactoryBatchToolbar();
    const selectionIds = ready.map((card) => card.id);
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(FACTORY_PENDING_REQUEST_KEY) || "null"); } catch {}
    const reuseRequest = pending && pending.profile_id === profiles[0]
      && JSON.stringify(pending.ids) === JSON.stringify(selectionIds)
;
    const requestId = reuseRequest ? pending.request_id : newFactoryRequestId();
    try { localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify({
      request_id: requestId, profile_id: profiles[0], ids: selectionIds, saved_ms: Date.now(),
    })); } catch {}
    try {
      const batch = await fetchJson("/api/factory/approval-batches", {
        method: "POST",
        body: JSON.stringify({
          action: "start",
          request_id: requestId,
          content_profile_id: profiles[0],
          notes: "Studio Factory Batch Approval",
          record_ids: ready.map((card) => card.id),
          items: ready.map((card) => ({
            id: card.id, output_id: card.output_id || null,
            title: card.title || null, content_id: card.content_id || null,
            platform: card.platform || null, format: card.studio_output_type || null,
          })),
        }),
      });
      if (!batch.accepted) throw new Error("Approval queue did not acknowledge the batch.");
      if (batch.already_running && !batch.already_submitted) {
        renderFactoryBatchActivity(batch);
        setStatus("A previous batch for this profile is still running. Selection is preserved; submit again after it completes.", true);
        return;
      }
      rememberFactoryAccepted(selectionIds);
      state.lastBatchProfile = profiles[0];
      try { localStorage.setItem(FACTORY_LAST_BATCH_KEY, JSON.stringify({ job_id: batch.job_id, profile_id: profiles[0] })); } catch {}
      try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
      ready.forEach((card) => state.selectedOutputs.delete(card.id));
      saveFactorySelection();
      if (state.desk) renderDesk(state.desk);
      closeFactoryPreview();
      renderFactoryBatchActivity(batch);
      setStatus(`Batch accepted for ${ready.length} outputs. Server processing continues after leaving Factory.`);
      // Never wait for all approvals in the click handler.
    } catch (error) {
      setStatus(`Batch submission not confirmed: ${error.message || error}. Check Activity before retrying.`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingOutputIds = null;
      state.submittingBatch = false;
      if (state.desk) renderDesk(state.desk);
      updateFactoryBatchToolbar();
    }
  }

  async function retryFactoryBatchFailures() {
    const viewed = state.completedOpen ? state.completedBatch : state.batch;
    const batches = Array.isArray(viewed?.batches) ? viewed.batches : (viewed?.job_id ? [viewed] : []);
    const selected = batches.find(row => row.job_id === state.inspectedBatchKey);
    // The toolbar renders the first visible batch when none is selected. Retry
    // must use that same visible batch, not the first active-snapshot row.
    const batch = selected || batches[0] || null;
    if (state.submittingBatch) return;
    if (!batch?.job_id || !batch.can_retry) {
      setStatus("Select the batch showing failed outputs, then retry. No approvals were resubmitted.", true);
      return;
    }
    state.submittingBatch = true;
    updateFactoryBatchToolbar();
    try {
      const result = await fetchJson("/api/factory/approval-batches", {
        method: "POST",
        body: JSON.stringify({
          action: batch.group ? "retry_group" : "retry", request_id: batch.request_id,
          ...(!batch.group ? {content_profile_id: batch.profile_id} : {}),
        }),
      });
      state.inspectedBatchKey = result.job_id || batch.job_id;
      setStatus(result.message || "Failed items sent for retry.");
      await refreshFactoryBatchActivity(true);
    } catch (error) {
      setStatus(`Retry not confirmed: ${error.message || error}`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingBatch = false;
      updateFactoryBatchToolbar();
    }
  }

  // A Needs Eyes card is not necessarily authorized for batch approval.
  // Always show the selection control and explain the policy/readiness outcome
  // instead of silently omitting the checkbox while leaving Approve active.
  function factoryBatchSelectionReason(card) {
    if (card?.kind !== "output") return "Only platform outputs can be batch approved.";
    if (card.review_package_ready === false) {
      return "Review package incomplete: " + ((card.review_package_missing || []).join(", ") || card.review_package_reason || "required assets not verified");
    }
    if (recentFactoryAccepted()[String(card?.id || "")]) return "Already accepted for approval. Refresh Activity to verify the result.";
    if (state.submittingOutputIds?.has(card?.id)) return "Approval is already being submitted. Check Activity.";
    if (card?.review_hold_active === true) return "Review-held revision: complete QA handoff before approval.";
    if (card?.do_not_publish === true) return "Publishing hold is active for this output.";
    const render = String(card?.render_status || "").trim().toLowerCase();
    if (/^(failed|blocked)$/.test(render)) return `Render status is ${card.render_status}. Repair the render before approval.`;
    if (/ready for render|waiting in render queue|^rendering$/.test(render)) return "Render is still queued or running; wait for completion.";
    const output = String(card?.output_status || "").trim().toLowerCase();
    if (["in production", "rendering", "ready for render", "failed", "blocked"].includes(output)) {
      return `Airtable Output Status is ${card.output_status}; not yet approved for review.`;
    }
    if (!canReviewActions(card)) return "Not yet review-ready according to the authoritative output/review status.";
    if (state.batchApprovalsEnabled === false) return "Batch approvals are disabled by the server; individual approval is available.";
    if (canSelectBatchOutput(card)) return "";
    if (state.batchGlobal?.enabled) {
      const platform = String(card?.platform || "").trim();
      const allowed = state.batchGlobal.allowed_platforms || [];
      if (!allowed.includes(platform)) return `${platform || "This platform"} is not enabled for batch approval; use individual Approve.`;
      return `${String(card?.studio_output_type || card?.format || "This output type").trim()} is outside the server-authorized ${platform} batch formats; use individual Approve.`;
    }
    return "This profile or output type is outside the current batch rollout; use individual Approve.";
  }

  function renderCard(card, { pile = false, candidate = false, lane = "" } = {}) {
    const actions = [];
    actions.push(`<button type="button" class="text-button" data-factory-open="${esc(card.id)}">Open</button>`);
    if (pile) {
      actions.push(`<button type="button" class="secondary-button" data-factory-unpin="${esc(card.id)}">Remove</button>`);
    } else if (candidate) {
      actions.push(`<button type="button" class="primary-button" data-factory-pin="${esc(card.id)}">Add</button>`);
    }
    if (canPreview(card) && (lane === "needs_eyes" || canReviewActions(card, { pile, candidate }) || lane === "auto_high" || lane === "manual")) {
      actions.push(`<button type="button" class="secondary-button" data-factory-preview="${esc(card.id)}">Preview</button>`);
    }
    const reviewAllowed = canReviewActions(card, { pile, candidate });
    const needsEyesOutput = lane === "needs_eyes" && card.kind === "output";
    const batchReason = needsEyesOutput ? factoryBatchSelectionReason(card) : "";
    const reasonId = batchReason ? `factory-batch-reason-${card.id}` : "";
    if (card.kind === "output" && (reviewAllowed || needsEyesOutput)) {
      // A stale review badge/held revision must never present a live Approve
      // action merely because the server grouped the row under Needs Eyes.
      actions.push(`<button type="button" class="primary-button" data-factory-approve="${esc(card.id)}" ${reviewAllowed ? "" : `disabled title="${esc(batchReason || "Not yet eligible for approval")}"`}>Approve</button>`);
      actions.push(`<button type="button" class="secondary-button" data-factory-send-back="${esc(card.id)}">Request Changes</button>`);
    }
    if (canDelete(card, { candidate })) {
      actions.push(`<button type="button" class="secondary-button factory-delete" data-factory-delete="${esc(card.id)}">Delete</button>`);
    }
    const thumb = String(card.thumbnail_url || "").trim();
    const hasSharedCover = Boolean(needsEyesOutput && card.content_item_id && thumb.includes(
      "/studio/previews/thumbnails/" + String(card.content_item_id) + "/"));
    const outputLabel = card.output_id ? "Output #" + card.output_id : "this output";
    const thumbImage = thumb
      ? `<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async">`
      : `<img src="/assets/needs-asset.svg" alt="NEEDS ASSET" loading="lazy">`;
    const media = canPreview(card)
      ? `<button type="button" class="factory-line-thumb" data-factory-preview="${esc(card.id)}" aria-label="Preview ${esc(outputLabel)}: ${esc(cardLabel(card))}" title="Preview ${esc(outputLabel)}">
          ${thumbImage}
        </button>`
      : `<span class="factory-line-thumb factory-line-thumb-empty" role="img" aria-label="NEEDS ASSET">${thumbImage}</span>`;
    // The preview button opens the exact Platform Output. A cover sourced from
    // the Content Item is not an output-specific video frame: label it honestly.
    const outputVisual = needsEyesOutput
      ? `<span class="factory-output-visual">${media}<small class="factory-output-visual-label">${hasSharedCover ? "Shared cover" : (thumb ? "Output image" : "Needs asset")}</small></span>`
      : media;
    const alert = card.stuck_kind || card.produce_error || "";
    const stateLabel = card.review_package_ready === false
      ? (card.review_package_readiness === "IN_PROGRESS" ? "Preparing Assets" : "Review blocked")
      : (card.studio_state || (alert ? "Needs repair" : "—"));
    const reviewReason = (card.review_package_missing || []).join(", ") || card.review_package_reason || "";
    const cell = (value) => `<span class="factory-line-cell">${esc(value || "—")}</span>`;
    return `<div class="factory-line" data-factory-id="${esc(card.id)}" data-factory-kind="${esc(card.kind || "")}" data-lane="${esc(lane)}" title="${esc(cardLabel(card))}">
      ${needsEyesOutput
        ? `<span class="factory-media-select"><label class="factory-output-select" title="${esc(batchReason || "Select for batch approval")}"><input type="checkbox" data-factory-select-output="${esc(card.id)}" aria-label="${esc(batchReason ? `Batch selection unavailable for ${cardLabel(card)}` : `Select ${cardLabel(card)}`)}" ${reasonId ? `aria-describedby="${esc(reasonId)}"` : ""} ${batchReason ? "disabled" : (state.selectedOutputs.has(card.id) ? "checked" : "")}></label></span>`
        : media}
      <span class="factory-line-title">
        ${needsEyesOutput
          ? `<span class="factory-output-heading">${outputVisual}<span class="factory-output-title-copy"><span class="factory-output-title-name">${esc(card.title || cardLabel(card))}</span>${card.output_id ? `<small class="factory-output-number">Output #${esc(card.output_id)}</small>` : ""}</span></span>`
          : `${esc(card.title || cardLabel(card))}${card.output_id ? `<small class="factory-output-number">Output #${esc(card.output_id)}</small>` : ""}`}
        ${needsEyesOutput && batchReason ? `<span id="${esc(reasonId)}" class="factory-batch-unavailable" role="status"><strong>Approval unavailable:</strong> ${esc(batchReason)}</span>` : ""}
      </span>
      ${cell(card.profile_name)}
      ${cell(card.platform)}
      ${cell(card.studio_output_type)}
      <span class="factory-line-cell factory-line-state"${alert || reviewReason ? ` title="${esc([alert, reviewReason].filter(Boolean).join("; "))}"` : ""}>${esc(stateLabel)}</span>
      <div class="factory-line-actions">${actions.join("")}</div>
    </div>`;
  }

  function contentGroupKey(card) {
    // Lean queue rows may omit numeric Content_ID but retain the authoritative
    // Airtable parent record. Group every platform by this immutable identity.
    const parentId = String(card?.content_item_id || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(parentId)) return `content:${parentId}`;
    // Legacy projections sometimes put that same linked record in content_id.
    const contentId = String(card?.content_id || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(contentId)) return `content:${contentId}`;
    if (/^[0-9]+$/.test(contentId)) return `legacy-content:${contentId}`;
    // No title-based guesses: two separate packages can legitimately share a title.
    return `solo:${card?.id || ""}`;
  }

  function groupByContent(cards) {
    const groups = [];
    const index = new Map();
    for (const card of cards || []) {
      const key = contentGroupKey(card);
      if (!index.has(key)) {
        const group = { key, cards: [] };
        index.set(key, group);
        groups.push(group);
      }
      index.get(key).cards.push(card);
    }
    return groups;
  }

  function reviewGroupMatchesSearch(group, raw) {
    const terms = String(raw || "").toLowerCase().replace(/[#]/g,"").match(/[a-z0-9]+/g) || [];
    const meaningful = terms.filter(word => !["content","output","items","review","video"].includes(word) && (word.length >= 5 || /^[0-9]{3,}$/.test(word)));
    if (!meaningful.length) return !terms.length;
    const haystack = (group.cards || []).map(card=> [
      card.title,card.content_id,card.output_id,card.content_item_id,
      card.platform,card.studio_output_type,
    ].filter(Boolean).join(" ")).join(" ").toLowerCase();
    return meaningful.every(term => haystack.includes(term));
  }

  function readyContentCards(group) {
    return (group?.cards || []).filter((card) => card?.kind === "output" && canReviewActions(card) && /^rec[A-Za-z0-9]+$/.test(String(card.id || "")));
  }

  function isStoryOutputCard(card) {
    return /story/i.test(String(card?.studio_output_type || card?.format || ""));
  }

  /**
   * A content package is identified by its Airtable Content Item record, not
   * its human-facing Content_ID number. The old numeric-only cross-lane scan
   * counted unrelated/stale cards as "still rendering" and disabled Approve all
   * after both Stories had actually finished (Content 924 / outputs 5047-48).
   *
   * A sibling blocks group approval only if it is a distinct, current output
   * for that same authoritative Content Item and has not reached review.
   * Incomplete genuine siblings still block; approval endpoints revalidate.
   */
  function pendingSiblingOutputsForGroup(group) {
    const cards = group?.cards || [];
    const contentItemId = String(cards.find((card) => card?.content_item_id)?.content_item_id || "").trim();
    const contentId = String(cards[0]?.content_id || "").trim();
    const profileId = String(cards.find((card) => card?.profile_id)?.profile_id || "").trim();
    if ((!contentItemId && !contentId) || !state.desk?.lanes) return [];
    const readyIds = new Set(cards.map((card) => String(card?.id || "").trim()).filter(Boolean));
    const readyNumbers = new Set(cards.map((card) => String(card?.output_id || "").trim()).filter(Boolean));
    const elsewhere = [
      ...(state.desk.lanes.auto_high || []),
      ...(state.desk.lanes.manual || []),
    ];
    const seen = new Set();
    return elsewhere.filter((card) => {
      if (card?.kind !== "output") return false;
      const id = String(card.id || "").trim();
      if (!/^rec[A-Za-z0-9]+$/.test(id) || readyIds.has(id) || seen.has(id)) return false;
      // No numeric Content_ID guess when a canonical Airtable link is available.
      if (contentItemId) {
        if (String(card.content_item_id || "").trim() !== contentItemId) return false;
      } else if (String(card.content_id || "").trim() !== contentId) {
        return false;
      }
      if (profileId && String(card.profile_id || "").trim() !== profileId) return false;
      // Prevent a stale synthetic projection of a ready output being counted twice.
      if (readyNumbers.has(String(card.output_id || "").trim())) return false;
      const status = String(card.output_status || "").trim().toLowerCase();
      const publish = String(card.publish_status || "").trim().toLowerCase();
      if (/^(approved|approved for publishing|ready to schedule|ready to publish|scheduled|publishing|published|skipped)$/.test(status)
        || /^(scheduled|publishing|published|skipped)$/.test(publish)) return false;
      if (canReviewActions(card)) return false;
      seen.add(id);
      return true;
    });
  }

  function pendingSiblingMeta(pending) {
    if (!pending.length) return "";
    const stories = pending.filter(isStoryOutputCard).length;
    const active = pending.filter((card) => {
      const render = String(card.render_status || "").toLowerCase();
      const stateLabel = String(card.studio_state || "").toLowerCase();
      return /ready for render|waiting in render queue|rendering/.test(render)
        || /ready for render|waiting in render queue|rendering/.test(stateLabel);
    });
    const requiresRepair = pending.filter((card) =>
      /failed|blocked|error|needs repair/i.test(`${card.output_status || ""} ${card.render_status || ""} ${card.studio_state || ""} ${card.stuck_kind || ""}`));
    if (requiresRepair.length) return `${requiresRepair.length} sibling output${requiresRepair.length === 1 ? " needs" : "s need"} attention`;
    if (active.length === pending.length) {
      if (stories === pending.length) return `${stories} Stor${stories === 1 ? "y" : "ies"} still rendering`;
      return `${pending.length} sibling${pending.length === 1 ? "" : "s"} still rendering`;
    }
    return `${pending.length} sibling output${pending.length === 1 ? "" : "s"} awaiting review readiness`;
  }

  function renderContentBar(group, expanded) {
    const ready = readyContentCards(group);
    const pending = pendingSiblingOutputsForGroup(group);
    const heldRevisions = (group.cards || []).filter(card => card.review_hold_active === true);
    const pendingLabel = heldRevisions.length ? "Review-held V2 — preview only" : pendingSiblingMeta(pending);
    const first = group.cards[0] || {};
    const contentId = String(first.content_id || "").trim();
    const title = first.title || "Untitled";
    const bits = [];
    if (contentId) bits.push(`Content ${contentId}`);
    bits.push(`${ready.length} ready`);
    if (pendingLabel) bits.push(pendingLabel);
    const meta = bits.join(" · ");
    const approveAll = ready.length > 1
      ? (pending.length || heldRevisions.length
        ? `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}" disabled title="${heldRevisions.length ? "Review-held V2 is not yet eligible for publishing" : "Wait until sibling Stories finish rendering, then Approve all together"}">${esc(`Approve all (${ready.length}) — ${heldRevisions.length ? "review held" : "wait for Stories"}`)}</button>`
        : `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}">Approve all (${ready.length})</button>`)
      : "";
    const batchReady = ready.filter(canSelectBatchOutput);
    const contentSelected = batchReady.length > 0 && batchReady.every((card) => state.selectedOutputs.has(card.id));
    const selectContent = `<label class="factory-content-batch-select">
      <input type="checkbox" data-factory-select-content="${esc(group.key)}"
        aria-label="Select all review-ready outputs for ${esc(title)}"
        ${contentSelected ? "checked" : ""} ${(!batchReady.length || pending.length || heldRevisions.length) ? "disabled" : ""}>
      Select eligible outputs</label>`;
    return `<div class="factory-content-bar" data-factory-content="${esc(group.key)}">
      ${selectContent}
      <button type="button" class="factory-content-toggle" data-factory-toggle-content="${esc(group.key)}" aria-expanded="${expanded}" aria-controls="factory-review-${esc(group.key.replace(/[^a-zA-Z0-9_-]/g, "-"))}">
        <span class="factory-content-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
        <span class="factory-content-label"><strong class="factory-content-title">${esc(title)}</strong><span class="factory-content-meta">${esc(meta)}</span></span>
      </button>
      ${ready.length ? `<button type="button" class="secondary-button factory-content-send-back" data-factory-send-back-content="${esc(group.key)}">Request Changes</button>` : ""}
      ${approveAll}
    </div>`;
  }

  function renderLane(listId, cards, emptyCopy, options = {}) {
    const node = $(listId);
    if (!node) return;
    if (!cards?.length) {
      node.innerHTML = `<p class="subtle factory-lane-empty">${esc(emptyCopy)}</p>`;
      return;
    }
    if (options.groupContent) {
      const allGroups = groupByContent(cards);
      const search = String(state.needsEyesSearch || "").trim();
      const groups = search ? allGroups.filter(group => reviewGroupMatchesSearch(group,search)) : allGroups;
      if (!groups.length) {
        node.innerHTML = '<p class="subtle factory-lane-empty">No matching review content. Try Michigan, 1869 or 9593.</p>';
        return;
      }
      const FACTORY_REVIEW_GROUPS_PER_PAGE = 12;
      // Bound the iPad DOM: rendering hundreds of off-screen accordions made
      // Safari show one row followed by a large apparently empty review list.
      const pages = Math.max(1, Math.ceil(groups.length / FACTORY_REVIEW_GROUPS_PER_PAGE));
      state.needsEyesPage = Math.min(pages - 1, Math.max(0, Number(state.needsEyesPage) || 0));
      const start = state.needsEyesPage * FACTORY_REVIEW_GROUPS_PER_PAGE;
      const pageGroups = groups.slice(start, start + FACTORY_REVIEW_GROUPS_PER_PAGE);
      // "" means the operator explicitly collapsed every content item.
      // Choose a default only if the previously opened group is no longer on this page.
      if (state.expandedReviewGroup !== "" && !pageGroups.some((group) => group.key === state.expandedReviewGroup)) {
        state.expandedReviewGroup = pageGroups[0]?.key || null;
      }
      const pageLabel = `Showing ${start + 1}–${start + pageGroups.length} of ${groups.length} ${search ? "matching" : ""} content items · ${cards.length} outputs in queue`;
      const pager = `<nav class="factory-review-pagination" aria-label="Needs eyes queue pages">
        <span class="factory-review-page-count">${esc(pageLabel)}</span>
        <span class="factory-review-page-actions">
          <button type="button" class="secondary-button" data-factory-review-page="prev" ${state.needsEyesPage === 0 ? "disabled" : ""}>Previous items</button>
          <span>Page ${state.needsEyesPage + 1} of ${pages}</span>
          <button type="button" class="secondary-button" data-factory-review-page="next" ${state.needsEyesPage + 1 >= pages ? "disabled" : ""}>Next items</button>
        </span>
      </nav>`;
      node.innerHTML = pager + pageGroups.map((group) => {
        const expanded = group.key === state.expandedReviewGroup;
        const id = `factory-review-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        return renderContentBar(group, expanded) +
          `<div id="${esc(id)}" class="factory-content-rows" ${expanded ? "" : "hidden"}>${group.cards.map((card) => renderCard(card, options)).join("")}</div>`;
      }).join("") + (pages > 1 ? pager : "");
      node.querySelectorAll("[data-factory-toggle-content]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.factoryToggleContent;
          state.expandedReviewGroup = state.expandedReviewGroup === key ? "" : key;
          renderDesk(state.desk);
        });
      });
      node.querySelectorAll("[data-factory-review-page]").forEach((button) => {
        button.addEventListener("click", () => {
          const delta = button.dataset.factoryReviewPage === "next" ? 1 : -1;
          const target = state.needsEyesPage + delta;
          if (target < 0 || target >= pages) return;
          state.needsEyesPage = target;
          state.expandedReviewGroup = null;
          renderDesk(state.desk);
          const lane = $(listId);
          if (lane) lane.scrollTop = 0;
        });
      });
      return;
    }
    node.innerHTML = cards.map((card) => renderCard(card, options)).join("");
  }

  function setCount(id, text) {
    const node = $(id);
    if (node) node.textContent = text;
  }

  function renderSummary(summary) {
    if (!summary) return;
    setCount("factoryCountAutoHigh", String(Number(summary.auto_high) || 0));
    setCount("factoryCountNeedsEyes", String(Number(summary.needs_eyes) || 0));
    const used = Number(summary.needs_assets_pile) || 0;
    const max = Number(summary.needs_assets_max) || 3;
    setCount("factoryCountNeedsAssets", `${used}/${max}`);
    setCount("factoryCountManual", String(Number(summary.manual) || 0));
  }

  async function reviewedFactoryRevision(card) {
    if(card?.kind!=="output" || !/^rec[A-Za-z0-9]{14}$/.test(String(card.id||"")))return false;
    let response;
    try {
      response=await fetch("/api/rendering-review/outputs/"+encodeURIComponent(card.id),{
        credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
      });
    } catch(error) { throw new Error("Cannot verify Post Production Edits handoff: "+error.message); }
    if(response.status===404)return false;
    if(!response.ok)throw new Error("Could not verify this revision's review session ("+response.status+")");
    const data=await response.json().catch(()=>null);
    const s=data?.session;
    return Boolean(data?.ok===true && s?.state==="approved" &&
      s?.factory_handoff?.status==="ready_for_factory_approval" &&
      s?.factory_handoff?.attempt_id===s?.approved_attempt_id &&
      s?.current_attempt_id===s?.approved_attempt_id &&
      s?.review_hold?.active===false);
  }

  function isConversationalReviewCandidate(card) {
    const type=String(card?.studio_output_type||card?.output_type||"").trim().toLowerCase();
    return card?.kind==="output" &&
      String(card?.profile_id||"")==="recT2rbKX3MF7cVFU" &&
      String(card?.platform||"").trim().toLowerCase()==="instagram" &&
      (type==="instagram reel" || type==="reel");
  }

  // Review feedback is entered before any state-changing request is sent.
  function openFactoryFeedback({ title, scope, payload }) {
    const backdrop = $("factoryFeedbackBackdrop");
    const textarea = $("factoryFeedbackNotes");
    if (!backdrop || !textarea) {
      setStatus("Review notes window is unavailable. Refresh Studio before sending back.", true);
      return;
    }
    state.pendingFactoryFeedback = { payload, title: title || "Production change request", focusedElement: document.activeElement };
    const heading = $("factoryFeedbackTarget");
    const detail = $("factoryFeedbackScope");
    const error = $("factoryFeedbackError");
    if (heading) heading.textContent = title || "Untitled content";
    if (detail) detail.textContent = scope || "Review changes";
    const returnReview = payload?.action === "return_to_review" || payload?.action === "start_render_review";
    const auto = payload?.action === "request_changes_content";
    const intro = $("factoryFeedbackIntro");
    const hints = document.querySelector("#factoryFeedbackHintsText");
    if (intro) intro.textContent = returnReview
      ? payload?.action === "start_render_review"
        ? "Describe what you want changed. Your comments are required, and they will start a Post Production Edits conversation with your Producer."
        : "Tell your Producer what needs to change in everyday language. Your comments will be added to the existing Post Production Edits conversation."
      : auto
      ? "Tell the Producer what to change in everyday language. Precise caption, narration, duration and uniquely identified photo/clip instructions can restart production automatically. Other creative requests are saved for guided editing."
      : "Describe exactly what needs to change. Studio saves these review notes with the linked Production Request.";
    if (hints) hints.textContent = returnReview
      ? payload?.action === "start_render_review"
        ? "Your current render is preserved and publishing is held. After submitting, continue with your Producer in Post Production Edits. No new render starts until you authorize it."
        : "Your selected V2 stays preserved and publishing is held while you continue with the Producer. No new render starts until you authorize it."
      : auto
      ? "Examples: Please make it 20 seconds. · Add the photo named Chicago River Night. · Replace narration with: Welcome to Chicago. Unresolved photos/clips stay on hold for selection."
      : "This send-back opens Production for manual editing and approval.";
    if (error) { error.hidden = true; error.textContent = ""; }
    textarea.value = "";
    const count = $("factoryFeedbackCount");
    if (count) count.textContent = "0 / 3000";
    const submit = $("factoryFeedbackSubmit");
    if (submit) { submit.disabled = false; submit.textContent = returnReview ? "Send to Post Production Edits" : payload?.action === "request_changes_content" ? "Submit to Producer" : "Send back with notes"; }
    backdrop.hidden = false;
    const transcript = $("factoryProducerTranscript");
    if (transcript) transcript.hidden = !auto;
    if (auto && /^rec[A-Za-z0-9]+$/.test(String(payload?.production_request_id || ""))) {
      window.StudioProducerConversation?.showFactoryHistory(payload.production_request_id);
    }
    textarea.focus();
  }

  function closeFactoryFeedback() {
    const backdrop = $("factoryFeedbackBackdrop");
    if (backdrop) backdrop.hidden = true;
    const origin = state.pendingFactoryFeedback?.focusedElement;
    state.pendingFactoryFeedback = null;
    if (origin?.isConnected) origin.focus?.();
  }

  async function submitFactoryFeedback(event) {
    event.preventDefault();
    const pending = state.pendingFactoryFeedback;
    if (!pending) return;
    const notes = String($("factoryFeedbackNotes")?.value || "").trim();
    const error = $("factoryFeedbackError");
    if (!notes) {
      if (error) { error.hidden = false; error.textContent = "Describe the changes needed before sending back."; }
      $("factoryFeedbackNotes")?.focus();
      return;
    }
    const submit = $("factoryFeedbackSubmit");
    if (submit) { submit.disabled = true; submit.textContent = "Sending back…"; }
    if (error) { error.hidden = true; error.textContent = ""; }
    const tracked = pending.payload?.action === "request_changes_content";
    const trackingRequestId = String(pending.payload?.production_request_id || "").trim();
    if (tracked) window.StudioFactoryProducerProgress?.begin({
      requestId: trackingRequestId, title: pending.title,
    });
    try {
      closeFactoryPreview();
      const desk = await mutateDesk({ ...pending.payload, note: notes });
      const requestId = String(desk?.result?.production_request_id || pending.payload.production_request_id || "").trim();
      if (tracked) window.StudioFactoryProducerProgress?.accept({
        requestId, title: pending.title, result: desk?.result,
      });
      closeFactoryFeedback();
      if (pending.payload?.action === "return_to_review" || pending.payload?.action === "start_render_review") {
        if (desk?.result?.review_notes_saved!==true || desk?.result?.review_hold_active!==true)
          throw new Error("Review notes or publication hold could not be verified.");
        const notice = desk.result.message || "Request received. Continue the conversation with your Producer in Post Production Edits.";
        setStatus(notice);
        window.alert(notice);
        if (typeof window.StudioRenderingReview?.openOutputById === "function") {
          await window.StudioRenderingReview.openOutputById(pending.payload.id);
        } else {
          document.getElementById("navRenderingReview")?.click();
        }
        return;
      }
      if (desk?.result?.producer_queued) {
        setStatus(desk.result.message || "Producer revision accepted. Production continues without this page.");
        return;
      }
      if (requestId && typeof window.StudioOpenProductionRequestById === "function") {
        try {
          await window.StudioOpenProductionRequestById(requestId);
          setStatus("Review feedback saved in Production. Edit, then Approve to rerender.");
        } catch (openingError) {
          setStatus("Review notes saved. Open Production to view feedback: " + (openingError.message || openingError), true);
        }
      } else {
        setStatus("Review notes saved. Open the returned item in Production for changes.");
      }
    } catch (err) {
      if (tracked) window.StudioFactoryProducerProgress?.uncertain({
        requestId: trackingRequestId, title: pending.title, message: err?.message || String(err),
      });
      if (submit) { submit.disabled = false; submit.textContent = ["return_to_review","start_render_review"].includes(pending.payload?.action) ? "Send to Post Production Edits" : pending.payload?.action === "request_changes_content" ? "Submit to Producer" : "Send back with notes"; }
      if (error) { error.hidden = false; error.textContent = String(err?.message || err); }
      setStatus("Could not send back: " + (err?.message || err), true);
    }
  }

  function bindCardActions(desk) {
    const byId = new Map();
    for (const lane of Object.values(desk?.lanes || {})) {
      for (const card of lane || []) byId.set(card.id, card);
    }
    for (const card of desk?.needs_assets_candidates || []) byId.set(card.id, card);

    const root = $("page-factory");
    if (!root) return;

    root.querySelectorAll("[data-factory-open]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = byId.get(button.getAttribute("data-factory-open"));
        if (!card) {
          setStatus("Open failed: card not found in desk payload.", true);
          return;
        }
        button.disabled = true;
        const idleText = button.textContent || "Open";
        button.textContent = "Opening…";
        try {
          await openStudioTarget(card);
        } finally {
          button.disabled = false;
          button.textContent = idleText;
        }
      });
    });
    root.querySelectorAll("[data-factory-preview]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-preview"));
        if (!card) {
          setStatus("Preview failed: card not found in desk payload.", true);
          return;
        }
        openFactoryPreview(card);
      });
    });
    root.querySelectorAll("[data-factory-pin]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-pin"));
        if (!card) return;
        mutateDesk({
          action: "pin_needs_assets",
          item: {
            id: card.id,
            kind: card.kind,
            title: card.title,
            profile_name: card.profile_name,
            studio_state: card.studio_state,
          },
        }).catch((error) => setStatus(error.message || String(error), true));
      });
    });
    root.querySelectorAll("[data-factory-unpin]").forEach((button) => {
      button.addEventListener("click", () => {
        mutateDesk({
          action: "unpin_needs_assets",
          id: button.getAttribute("data-factory-unpin"),
        }).catch((error) => setStatus(error.message || String(error), true));
      });
    });
    root.querySelectorAll("[data-factory-send-back-content]").forEach((button) => {
      button.addEventListener("click", async () => {
        const key = button.getAttribute("data-factory-send-back-content");
        const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
        const ready = readyContentCards({ cards });
        if (!ready.length) {
          setStatus("No reviewable outputs were found for this content.", true);
          return;
        }
        if(ready.length===1){
          try {
            if(await reviewedFactoryRevision(ready[0])){
              openFactoryFeedback({
                title:ready[0].title||cardLabel(ready[0]),
                scope:"Selected revised output · Continue with Producer",
                payload:{action:"return_to_review",id:ready[0].id,kind:"output",
                  client_request_id:"factoryreview_"+crypto.randomUUID().replace(/-/g,"")}
              });
              return;
            }
          }catch(error){
            setStatus("Post Production Edits lookup failed: "+(error.message||error),true);
            return;
          }
        }
        if(ready.length===1 && isConversationalReviewCandidate(ready[0])){
          openFactoryFeedback({
            title:ready[0].title||cardLabel(ready[0]),
            scope:"Selected Reel · Send to conversational Producer review",
            payload:{action:"start_render_review",id:ready[0].id,kind:"output",
              client_request_id:"factoryreview_"+crypto.randomUUID().replace(/-/g,"")}
          });
          return;
        }
        const productionRequestId = String(ready.find((card) => /^rec[A-Za-z0-9]+$/.test(String(card.production_request_id || "")))?.production_request_id || "").trim();
        if (!productionRequestId) {
          setStatus("The linked Production Request could not be resolved.", true);
          return;
        }
        const title = ready[0].title || "this content";
        openFactoryFeedback({
          title,
          scope: `Entire content package · ${ready.length} ready output${ready.length === 1 ? "" : "s"}`,
          payload: {
            action: "request_changes_content",
            kind: "output",
            id: ready[0].id,
            production_request_id: productionRequestId,
            output_ids: ready.map((card) => card.id),
          },
        });
      });
    });
    root.querySelectorAll("[data-factory-select-output]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const id = checkbox.getAttribute("data-factory-select-output");
        if (checkbox.checked) state.selectedOutputs.add(id);
        else state.selectedOutputs.delete(id);
        saveFactorySelection();
        updateFactoryBatchToolbar();
        // Sync content-level checked state without closing review groups.
        const group = checkbox.closest(".factory-content-rows")?.previousElementSibling;
        const groupBox = group?.querySelector("[data-factory-select-content]");
        if (groupBox) {
          const ids = [...checkbox.closest(".factory-content-rows").querySelectorAll("[data-factory-select-output]:not(:disabled)")];
          groupBox.checked = ids.length > 0 && ids.every((input) => input.checked);
          groupBox.indeterminate = ids.some((input) => input.checked) && !groupBox.checked;
        }
      });
    });
    root.querySelectorAll("[data-factory-select-content]").forEach((checkbox) => {
      const key = checkbox.getAttribute("data-factory-select-content");
      const ids = readyContentCards({ cards: (desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key) })
        .filter(canSelectBatchOutput).map((card) => card.id);
      checkbox.indeterminate = ids.some((id) => state.selectedOutputs.has(id))
        && !ids.every((id) => state.selectedOutputs.has(id));
      checkbox.addEventListener("change", () => {
        ids.forEach((id) => checkbox.checked ? state.selectedOutputs.add(id) : state.selectedOutputs.delete(id));
        saveFactorySelection();
        updateFactoryBatchToolbar();
        const rows = checkbox.closest(".factory-content-bar")?.nextElementSibling;
        rows?.querySelectorAll("[data-factory-select-output]:not(:disabled)").forEach((input) => { input.checked = checkbox.checked; });
        checkbox.indeterminate = false;
      });
    });
    root.querySelectorAll("[data-factory-approve-content]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-factory-approve-content");
        approveContentGroup(key, button).catch((error) => {
          button.disabled = false;
          const message = error.message || String(error);
          setStatus(message, true);
          window.alert(`Factory Approve all failed:\n${message}`);
        });
      });
    });
    root.querySelectorAll("[data-factory-approve]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-factory-approve");
        const card = byId.get(id);
        if (!card) {
          setStatus(`Approve failed: card ${id || "(missing)"} not found in desk payload.`, true);
          return;
        }
        if (!window.confirm(`Approve “${cardLabel(card)}” for publishing?\n\nStudio will use the next open morning, afternoon, or evening. It will not publish immediately. TikTok stays a draft.`)) return;
        button.disabled = true;
        closeFactoryPreview();
        mutateDesk({ action: "approve", id: card.id, kind: card.kind || "output" })
          .catch((error) => {
            button.disabled = false;
            const message = error.message || String(error);
            setStatus(message, true);
            window.alert(`Factory Approve failed:\n${message}`);
          });
      });
    });
    root.querySelectorAll("[data-factory-send-back]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = byId.get(button.getAttribute("data-factory-send-back"));
        if (!card) {
          setStatus("Send back failed: card not found in desk payload.", true);
          return;
        }
        try {
          if(await reviewedFactoryRevision(card)) {
            const clientKey = "factoryreview_" + crypto.randomUUID().replace(/-/g,"");
            openFactoryFeedback({
              title:card.title||cardLabel(card),
              scope:[card.platform,card.studio_output_type,"Selected revision only"].filter(Boolean).join(" · "),
              payload:{action:"return_to_review",id:card.id,kind:"output",client_request_id:clientKey}
            });
            return;
          }
        } catch(error) {
          setStatus("Could not verify Post Production Edits handoff: "+(error.message||error),true);
          return;
        }
        if(isConversationalReviewCandidate(card)){
          openFactoryFeedback({
            title:card.title||cardLabel(card),
            scope:[card.platform,card.studio_output_type,"Selected output only"].filter(Boolean).join(" · "),
            payload:{action:"start_render_review",id:card.id,kind:"output",
              client_request_id:"factoryreview_"+crypto.randomUUID().replace(/-/g,"")}
          });
          return;
        }
        // A content revision changes the shared render; the individual-row
        // review button must invoke the same durable Producer contract as
        // the grouped Request Changes action whenever a linked PR exists.
        const requestId = String(card.production_request_id || "").trim();
        const siblingCards = (state.desk?.lanes?.needs_eyes || [])
          .filter((item) => contentGroupKey(item) === contentGroupKey(card));
        const ready = readyContentCards({ cards: siblingCards });
        const producerAvailable = /^rec[A-Za-z0-9]+$/.test(requestId) && ready.length > 0;
        openFactoryFeedback({
          title: card.title || cardLabel(card),
          scope: producerAvailable
            ? `Entire content package · ${ready.length} ready output${ready.length === 1 ? "" : "s"}`
            : [card.platform, card.studio_output_type, "Selected output only"].filter(Boolean).join(" · "),
          payload: producerAvailable
            ? {
                action: "request_changes_content",
                id: card.id,
                kind: "output",
                production_request_id: requestId,
                output_ids: ready.map((item) => item.id),
              }
            : {
                action: "send_back",
                id: card.id,
                kind: card.kind || "output",
                production_request_id: card.production_request_id || null,
              },
        });
      });
    });
    root.querySelectorAll("[data-factory-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-delete"));
        if (!card) {
          setStatus("Delete failed: card not found in desk payload.", true);
          return;
        }
        const copy = card.kind === "idea"
          ? `Delete idea “${cardLabel(card)}” permanently from Airtable?`
          : `Mark “${cardLabel(card)}” as Skipped and remove it from Factory queues?`;
        if (!window.confirm(copy)) return;
        button.disabled = true;
        closeFactoryPreview();
        mutateDesk({ action: "delete", id: card.id, kind: card.kind || "output" })
          .catch((error) => {
            button.disabled = false;
            const message = error.message || String(error);
            setStatus(message, true);
            window.alert(`Factory Delete failed:\n${message}`);
          });
      });
    });
  }

  function renderDesk(desk) {
    state.desk = desk;
    syncFactoryFilterOptions();
    const hiddenApprovals = new Set([...Object.keys(recentFactoryAccepted()), ...(state.submittingOutputIds || [])]);
    const searching = Boolean(String(state.needsEyesSearch || "").trim());
    // An explicit search should find reviewable items across profiles and should
    // not silently conceal records due to a stale browser-only acceptance fence.
    const filtered = (cards) => (cards || []).filter(card =>
      (searching || factoryMatchesProfile(card)) &&
      !(card?.kind === "output" && hiddenApprovals.has(card.id) && !searching));
    const visibleDesk = { ...desk, lanes: { ...desk.lanes,
      needs_eyes: (desk.lanes?.needs_eyes || []).filter(card => !hiddenApprovals.has(card.id)) } };
    // Global counts come from the authoritative Desk summary. With a Factory
    // filter, only rows in the returned snapshot are counted and labelled.
    const summary = factoryProfileId() ? {
      auto_high: filtered(desk.lanes?.auto_high).length,
      needs_eyes: filtered(desk.lanes?.needs_eyes).length,
      needs_assets_pile: filtered(desk.lanes?.needs_assets).length,
      needs_assets_max: desk.summary?.needs_assets_max || 3,
      manual: filtered(desk.lanes?.manual).length,
    } : { ...desk.summary,
      needs_eyes: filtered(desk.lanes?.needs_eyes).length,
    };
    renderSummary(summary);
    const visibleNote = $("factoryProfileScopeNote");
    if (visibleNote) visibleNote.textContent = factoryProfileId()
      ? "Filtered counts show visible queue rows." : "Global counts from the Factory queue.";
    renderLane("factoryLaneAutoHigh", filtered(desk.lanes?.auto_high), "Nothing in active produce/render right now.", { lane: "auto_high" });
    renderLane("factoryLaneNeedsEyes", filtered(desk.lanes?.needs_eyes), "No Ready for Review items waiting on eyes.", { lane: "needs_eyes", groupContent: true });
    renderLane("factoryLaneNeedsAssets", filtered(desk.lanes?.needs_assets), "Pile empty — add up to 3 from candidates below.", { pile: true, lane: "needs_assets" });
    renderLane("factoryLaneManual", filtered(desk.lanes?.manual), "No stuck or failed work in view.", { lane: "manual" });
    renderLane(
      "factoryNeedsAssetsCandidates",
      filtered(desk.needs_assets_candidates),
      "No photo-wait / assets-needed candidates.",
      { candidate: true, lane: "needs_assets" },
    );
    const pileMeta = $("factoryNeedsAssetsMeta");
    if (pileMeta) {
      const used = summary?.needs_assets_pile || 0;
      const max = desk.summary?.needs_assets_max || 3;
      pileMeta.textContent = `Working pile ${used}/${max}. Pin candidates below.`;
    }
    bindCardActions(visibleDesk);
    updateFactoryBatchToolbar();
  }

  const ACTION_STATUS = {
    pin_needs_assets: "Added to needs-assets pile.",
    unpin_needs_assets: "Removed from needs-assets pile.",
    approve: "Approved for publishing.",
    send_back: "Sent back to production.",
    send_back_content: "Content sent back to Production.",
    request_changes_content: "Producer revision submitted.",
    delete: "Deleted / skipped.",
  };

  function approveAllProgressText(result) {
    if (result?.message) return String(result.message);
    const approved = Number(result?.approved_count || 0);
    const failed = Number(result?.failed_count || 0);
    const total = Number(result?.total || 0);
    return `${approved} of ${total} approved · ${failed} failed`;
  }

  async function watchApproveAll(result, profileId) {
    let latest = result || {};
    let jobId = String(latest.job_id || "").trim();
    const started = Date.now();
    // Soft ceiling only: the Worker keeps stamping in the background via
    // waitUntil / cron. Do not fail the click — reload the desk and show progress.
    const softMs = 600000;
    while (jobId && (latest.status === "queued" || latest.status === "running")) {
      setStatus(approveAllProgressText(latest));
      if (Date.now() - started > softMs) {
        return {
          ...latest,
          status: "running",
          message: `${approveAllProgressText(latest)} · still running in background — refresh Factory in a minute`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const params = new URLSearchParams({ job_id: jobId });
      if (profileId) params.set("profile", profileId);
      latest = await fetchJson(`/api/outputs/approve-all?${params.toString()}`);
      jobId = String(latest?.job_id || jobId).trim();
    }
    return latest;
  }

  async function approveContentGroup(key, button) {
    // Never submit group approval from a stale desk snapshot. Changes in R4/R5
    // or other approvals must be observed before computing sibling membership.
    if (state.loading) {
      setStatus("Factory is refreshing output readiness. Try Approve all again shortly.", true);
      return;
    }
    const fresh = await loadFactoryDesk(true);
    if (!fresh) {
      setStatus("Cannot verify current sibling readiness. Refresh Factory and retry.", true);
      return;
    }
    const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
    const ready = readyContentCards({ cards });
    if (cards.some(card => card.review_hold_active === true)) {
      setStatus("This content has a protected V2 review hold. Preview it first; Factory cannot approve this group.", true);
      return;
    }
    if (ready.length < 2) {
      setStatus("This content does not have multiple outputs waiting for approval.", true);
      return;
    }
    const pending = pendingSiblingOutputsForGroup({ cards });
    if (pending.length) {
      const pendingLabel = pendingSiblingMeta(pending);
      setStatus(`Approve all is waiting — ${pendingLabel}. Approve when the whole content is Ready for Review so Stories do not come back alone.`, true);
      window.alert(
        `Approve all is held until sibling outputs finish.\n\n${pendingLabel}.\n\nStories usually land in Needs eyes a few minutes after Reels/Shorts. Wait, then Approve all together.`,
      );
      return;
    }
    const title = ready[0].title || "this content";
    const contentId = String(ready[0].content_id || "").trim();
    const heading = contentId ? `Content ${contentId} · ${title}` : title;
    const list = ready.map((card) => `• ${[card.platform, card.studio_output_type].filter(Boolean).join(" ") || cardLabel(card)}`).join("\n");
    const confirmed = window.confirm(
      `Approve ${ready.length} outputs for “${heading}”?\n\nOnly this content item is included. Each output gets the next open morning, afternoon, or evening for its platform. Nothing publishes immediately. TikTok stays a draft.\n\n${list}`
    );
    if (!confirmed) return;
    if (button) {
      button.disabled = true;
      button.textContent = "Approving…";
    }
    closeFactoryPreview();
    const profileId = String(ready.find((card) => /^rec[A-Za-z0-9]+$/.test(String(card.profile_id || "")))?.profile_id || "").trim();
    const body = {
      notes: "Studio Factory Approve Content",
      record_ids: ready.map((card) => card.id),
      items: ready.map((card) => ({
        id: card.id,
        output_id: card.output_id || null,
        platform: card.platform || null,
        format: card.studio_output_type || null,
      })),
    };
    if (profileId) body.content_profile_id = profileId;
    setStatus(`Approve all started · 0 of ${ready.length} approved · 0 failed`);
    const result = await fetchJson("/api/outputs/approve-all", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const finished = await watchApproveAll(result, profileId);
    await loadFactoryDesk(true);
    const failed = Number(finished?.failed_count || 0);
    const leftover = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
    const leftoverStories = leftover.filter(isStoryOutputCard).length;
    let message = approveAllProgressText(finished);
    if (leftover.length) {
      const failedItems = Array.isArray(finished?.failed) ? finished.failed : [];
      const leftoverFailed = leftover.filter((card) => failedItems.some((row) => row.id === card.id)).length;
      if (leftoverFailed) {
        message += leftoverStories
          ? ` · ${leftoverStories} Stor${leftoverStories === 1 ? "y" : "ies"} still need eyes (approval did not stick)`
          : ` · ${leftover.length} still need eyes (approval did not stick)`;
      } else {
        message += leftoverStories
          ? ` · ${leftoverStories} Stor${leftoverStories === 1 ? "y" : "ies"} still need eyes (not ready yet — wait, then Approve all again)`
          : ` · ${leftover.length} sibling${leftover.length === 1 ? "" : "s"} still need eyes`;
      }
    }
    setStatus(message, failed > 0 || leftover.length > 0);
    if (failed > 0) {
      const failedItems = Array.isArray(finished?.failed) ? finished.failed : [];
      const reasons = [...new Set(failedItems.map((row) => String(row?.error || "").trim()).filter(Boolean))];
      const reasonText = reasons.length
        ? `\n\n${reasons.slice(0, 3).map((err) => `• ${err}`).join("\n")}${reasons.length > 3 ? `\n• …and ${reasons.length - 3} more` : ""}`
        : "";
      window.alert(`Factory Approve all finished with failures:\n${approveAllProgressText(finished)}${reasonText}`);
    }
  }

  async function mutateDesk(payload) {
    setStatus("Saving…");
    if(payload?.action==="start_render_review"){
      // The Factory dialog is the only new-session UI. Direct enrollment
      // from Post Production Edits is absent and the server requires the note.
      const receipt=await fetchJson("/api/rendering-review/factory/outputs/"+
        encodeURIComponent(payload.id)+"/request-changes",{
        method:"POST",
        body:JSON.stringify({note:payload.note,client_request_id:payload.client_request_id}),
      });
      return {ok:true,result:receipt,message:receipt.message};
    }
    const desk = await fetchJson("/api/factory/desk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // A successful approval is a durable mutation, not a full Desk read.
    // A subsequent refresh error must never be reported as approval failure.
    const savedMessage = desk.message || ACTION_STATUS[payload.action] || "Updated.";
    if (desk.lanes) {
      renderDesk(desk);
    } else if (desk.ok && (payload.action === "request_changes_content" || payload.action === "return_to_review")) {
      // The Airtable write is already committed; do not block acceptance on
      // a slow Factory queue read or convert a successful POST into an error.
      setStatus(savedMessage);
      loadFactoryDesk(true).catch(() => {});
      return desk;
    } else if (desk.ok) {
      const refreshed = await loadFactoryDesk(true);
      if (!refreshed) {
        setStatus(savedMessage + " Desk refresh failed; tap Refresh.", false);
        return desk;
      }
    }
    setStatus(savedMessage);
    return desk;
  }

  async function loadFactoryDesk(force = false) {
    // Producer progress lives in its own durable panel, not the disposable
    // Factory Desk status line. Refresh both independently.
    window.StudioFactoryProducerProgress?.refresh(true).catch(() => {});
    // One authoritative Desk snapshot at a time, including forced refreshes.
    if (state.loading) return state.desk;
    state.loading = true;
    setStatus("Loading Factory Desk…");
    try {
      // Fetch independently of the expensive Factory queue; activity remains visible during a slow desk refresh.
      refreshFactoryBatchActivity().catch(() => {});
      if (!state.batchTimer) state.batchTimer = setInterval(() => {
        if (!document.hidden && $("page-factory")?.classList.contains("active")) refreshFactoryBatchActivity(true).catch(() => {});
      }, 5000);
      const desk = await fetchJson("/api/factory/desk", { cache: "no-store" });
      renderDesk(desk);
      setStatus(desk.warning || "Factory Desk ready.");
      reconcilePersistedFactoryPending(true).catch(() => {});
      return desk;
    } catch (error) {
      setStatus(error.message || String(error), true);
      return null;
    } finally {
      state.loading = false;
    }
  }

  $("factoryFeedbackForm")?.addEventListener("submit", submitFactoryFeedback);
  $("factoryFeedbackCancel")?.addEventListener("click", closeFactoryFeedback);
  $("factoryFeedbackClose")?.addEventListener("click", closeFactoryFeedback);
  $("factoryFeedbackBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("factoryFeedbackBackdrop") && !$("factoryFeedbackSubmit")?.disabled) closeFactoryFeedback();
  });
  $("factoryFeedbackNotes")?.addEventListener("input", (event) => {
    const node = $("factoryFeedbackCount");
    if (node) node.textContent = `${event.target.value.length} / 3000`;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("factoryFeedbackBackdrop")?.hidden && !$("factoryFeedbackSubmit")?.disabled) {
      event.preventDefault();
      closeFactoryFeedback();
    }
  });

  $("factoryBatchSubmit")?.addEventListener("click", () => { submitFactoryBatchApprovals().catch((error) => setStatus(error.message || String(error), true)); });
  $("factoryBatchClear")?.addEventListener("click", () => {
    state.selectedOutputs.clear();
    saveFactorySelection();
    if (state.desk) renderDesk(state.desk);
  });
  $("factoryBatchRefresh")?.addEventListener("click", () => { refreshFactoryBatchActivity(true).catch(() => {}); });
  function setFactoryCompletedOpen(open) {
    if (state.completedOpen === open) return;
    state.completedOpen = open;
    state.batchDetailsOpen = false;
    state.inspectedBatchKey = "";
    if (open) {
      state.completedBatch = null;
      state.completedOffset = 0;
      refreshFactoryCompletedBatches(0).catch(() => {});
    } else renderFactoryBatchActivity(state.batch);
  }
  $("factoryBatchCompletedToggle")?.addEventListener("click", () => setFactoryCompletedOpen(!state.completedOpen));
  $("factoryBatchActiveCollapse")?.addEventListener("click", () => {
    if (state.completedOpen) return;
    state.activeApprovalsCollapsed = !state.activeApprovalsCollapsed;
    renderFactoryBatchActivity(state.batch);
  });
  $("factoryBatchCompletedClose")?.addEventListener("click", () => setFactoryCompletedOpen(false));
  $("factoryBatchCompletedPrev")?.addEventListener("click", () => {
    refreshFactoryCompletedBatches(Math.max(0, state.completedOffset - 20)).catch(() => {});
  });
  $("factoryBatchCompletedNext")?.addEventListener("click", () => {
    if (state.completedBatch?.has_more) refreshFactoryCompletedBatches(state.completedOffset + 20).catch(() => {});
  });
  $("factoryBatchRetry")?.addEventListener("click", () => { retryFactoryBatchFailures().catch(() => {}); });
  $("factoryBatchInspect")?.addEventListener("click", () => {
    state.batchDetailsOpen = !state.batchDetailsOpen;
    renderFactoryBatchActivity(state.batch);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && $("page-factory")?.classList.contains("active")) {
      refreshFactoryBatchActivity().catch(() => {});
      loadFactoryDesk(true).catch(() => {});
    }
  });
  // Rendering continues in the background: Factory must refresh actual output
  // readiness, not just its separate batch-status widget, while the page is open.
  setInterval(() => {
    if (!document.hidden && $("page-factory")?.classList.contains("active")) {
      loadFactoryDesk(true).catch(() => {});
    }
  }, 45000);
  // Populate the Factory filter as soon as this lightweight page module loads.
  // Waiting for /api/factory/desk makes an already-available profile list
  // appear empty while the much more expensive queue request is in flight.
  syncFactoryFilterOptions();
  // The topbar may hydrate from /api/profiles after Factory opens. Observe
  // only its option list; never tie Factory's profile choices to Desk latency.
  const studioProfileOptions = $("studioProfileSelect");
  if (studioProfileOptions && typeof MutationObserver !== "undefined") {
    const profileOptionsObserver = new MutationObserver(() => syncFactoryFilterOptions());
    profileOptionsObserver.observe(studioProfileOptions, {
      childList: true, subtree: true, characterData: true,
    });
  }
  function applyFactoryProfileScopeChange() {
    state.completedOpen = false;
    state.completedBatch = null;
    state.completedOffset = 0;
    state.inspectedBatchKey = "";
    if (state.desk) renderDesk(state.desk);
    else renderFactoryProfileFilterNotice();
    refreshFactoryBatchActivity(true).catch(() => {});
    window.StudioFactoryBatchQuality?.refresh?.(true);
  }
  $("factoryProfileFilter")?.addEventListener("change", () => {
    applyFactoryProfileScopeChange();
  });
  $("factoryClearProfileFilter")?.addEventListener("click", () => {
    const select = $("factoryProfileFilter");
    if (!select || !select.value) return;
    select.value = "";
    applyFactoryProfileScopeChange();
    select.focus?.();
  });
  // Studio profile changes must not alter global Factory monitoring.
  $("factoryNeedsEyesSearch")?.addEventListener("input", (event) => {
    state.needsEyesSearch = String(event.target.value || "").slice(0,120);
    state.needsEyesPage = 0;
    state.expandedReviewGroup = null;
    if (state.needsEyesSearch.trim()) {
      const body=$("factoryBandBodyNeedsEyes");
      const band=body?.closest(".factory-band");
      band?.classList.remove("is-collapsed");
      band?.querySelector("[data-factory-band-toggle]")?.setAttribute("aria-expanded","true");
      const chevron=band?.querySelector(".factory-band-chevron");
      if(chevron) chevron.textContent="▾";
    }
    if (state.desk) renderDesk(state.desk);
    else renderFactoryProfileFilterNotice();
  });
  $("factoryDeskRefresh")?.addEventListener("click", () => {
    loadFactoryDesk(true).catch(() => {});
  });
  // Explicit entry point: all Factory streams default to collapsed, so a
  // contextual Request Changes action alone was easy to miss.
  $("factoryProducerOpen")?.addEventListener("click", () => {
    const body = $("factoryBandBodyNeedsEyes");
    const band = body?.closest(".factory-band");
    if (!band) {
      setStatus("Factory review is unavailable. Reload Studio and try again.", true);
      return;
    }
    band.classList.remove("is-collapsed");
    const toggle = band.querySelector("[data-factory-band-toggle]");
    toggle?.setAttribute("aria-expanded", "true");
    const chevron = toggle?.querySelector(".factory-band-chevron");
    if (chevron) chevron.textContent = "▾";
    band.scrollIntoView?.({ behavior: "smooth", block: "start" });
    const reviewCount = Number($("factoryCountNeedsEyes")?.textContent || 0);
    setStatus(reviewCount > 0
      ? "Choose a content item under Needs eyes, then select Request Changes to instruct the Producer."
      : "No Ready for Review content is available yet. Request Changes appears when a content item reaches Needs eyes.");
  });
  $("factoryPreviewClose")?.addEventListener("click", () => closeFactoryPreview());
  $("factoryPreviewBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("factoryPreviewBackdrop")) closeFactoryPreview();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("factoryPreviewBackdrop")?.hidden) closeFactoryPreview();
  });

  // Four streams start collapsed; operators expand only the queue they need.
  $("factoryLanes")?.addEventListener("click", (event) => {
    const toggle = event.target.closest?.("[data-factory-band-toggle]");
    if (!toggle || !$("factoryLanes").contains(toggle)) return;
    const band = toggle.closest(".factory-band");
    if (!band) return;
    const open = band.classList.toggle("is-collapsed") === false;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const chevron = toggle.querySelector(".factory-band-chevron");
    if (chevron) chevron.textContent = open ? "▾" : "▸";
  });

  window.StudioFactoryDesk = {
    load: loadFactoryDesk,
  };
})();
