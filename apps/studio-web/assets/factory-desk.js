(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    loading: false,
    desk: null,
    expandedReviewGroup: null,
    pendingFactoryFeedback: null,
    selectedOutputs: new Set(),
    submittingBatch: false,
    batch: null,
    batchTimer: null,
    batchDetailsOpen: false,
    lastBatchProfile: "",
    batchApprovalsEnabled: null,
    batchRollout: null,
    reconciledBatchDeskKey: "",
    reconcilingBatchDesk: false,
    batchDeskReconcileNextAttempt: 0,
    lastBatchFetchMs: 0,
  };
  const FACTORY_SELECTION_KEY = "studio.factory.batch-selection.v1";
  const FACTORY_LAST_BATCH_KEY = "studio.factory.last-batch.v1";
  const FACTORY_PENDING_REQUEST_KEY = "studio.factory.pending-approval-request.v1";
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
      throw new Error(body?.error || body?.message || (`Factory desk failed (${response.status})`));
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
    if (pile || candidate) return false;
    if (card?.kind !== "output") return false;
    // studio_state can paint Ready for Review while Output_Status is still
    // In Production. Approve all must only claim Airtable-ready rows.
    const output = String(card.output_status || "").trim().toLowerCase();
    const review = String(card.review_status || "").trim().toLowerCase();
    if (output === "in production" || output === "rendering" || output === "ready for render") return false;
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
      if (thumb) {
        dialog.classList.remove("is-video");
        dialog.classList.add("is-image");
        image.src = thumb;
        image.hidden = false;
        video.removeAttribute("src");
        setStatus(`Video stream failed — showing cover for ${cardLabel(card)}.`, true);
        return;
      }
      empty.hidden = false;
      empty.textContent = "Preview stream failed. Open Pipeline review for this output.";
      setStatus("Preview stream failed.", true);
    };
    video.src = previewUrl;
    video.hidden = false;
    video.load();
    backdrop.hidden = false;
    setStatus(`Previewing · ${cardLabel(card)}`);
    video.play?.().catch(() => {});
  }


  function saveFactorySelection() {
    try { localStorage.setItem(FACTORY_SELECTION_KEY, JSON.stringify([...state.selectedOutputs])); } catch {}
    updateFactoryBatchToolbar();
  }

  function canSelectBatchOutput(card) {
    const rollout = state.batchRollout;
    if (!rollout || rollout.mode !== "chicago_ig_reel_v1") return true;
    return String(card?.profile_id || "") === String(rollout.profile_id || "")
      && String(card?.platform || "") === "Instagram"
      && String(card?.studio_output_type || card?.format || "") === "Reel";
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
  }
  function factoryMatchesProfile(card) {
    return !factoryProfileId() || String(card?.profile_id || "") === factoryProfileId();
  }
  function readyFactoryOutputs() {
    return (state.desk?.lanes?.needs_eyes || [])
      .filter((card) => factoryMatchesProfile(card) && card?.kind === "output"
        && canReviewActions(card) && canSelectBatchOutput(card));
  }

  function updateFactoryBatchToolbar() {
    const ready = new Set(readyFactoryOutputs().map((card) => card.id));
    const selectable = [...state.selectedOutputs].filter((id) => ready.has(id)).length;
    const missing = state.selectedOutputs.size - selectable;
    const count = $("factoryBatchSelectionCount");
    if (count) count.textContent = `${selectable} output${selectable === 1 ? "" : "s"} selected${missing ? ` · ${missing} outside current pilot or no longer ready` : ""}`;
    const submit = $("factoryBatchSubmit");
    if (submit) {
      const limit = Math.max(1, Number(state.batchRollout?.max_items || 100));
      submit.disabled = !selectable || selectable > limit || state.submittingBatch || state.batchApprovalsEnabled === false;
      submit.title = state.batchApprovalsEnabled === false
        ? "Batch approval rollout is disabled for this profile; individual approvals remain available."
        : selectable > limit ? `Select at most ${limit} output${limit === 1 ? "" : "s"} for this rollout.` : "";
      submit.textContent = state.submittingBatch ? "Submitting…" : `Submit Approvals${selectable ? ` (${selectable})` : ""}`;
    }
    const clear = $("factoryBatchClear");
    if (clear) clear.disabled = !state.selectedOutputs.size || state.submittingBatch;
    const rolloutNotice = $("factoryBatchRolloutNotice");
    if (rolloutNotice) {
      const rollout = state.batchRollout;
      if (rollout?.mode === "chicago_ig_reel_v1") {
        rolloutNotice.hidden = false;
        rolloutNotice.textContent = state.batchApprovalsEnabled
          ? "Limited production pilot: approve one Chicago Instagram Reel at a time. Stories, YouTube and other platforms are not available for batch approval yet."
          : "Limited production pilot: only Chicago Instagram Reels are eligible. Select Chicago to submit; individual approvals remain available elsewhere.";
      } else {
        rolloutNotice.hidden = true;
        rolloutNotice.textContent = "";
      }
    }
  }

  function renderFactoryBatchActivity(batch) {
    state.batch = batch || null;
    const summary = $("factoryBatchSummary");
    const count = $("factoryBatchMetricValue");
    const recent = $("factoryBatchRecentList");
    const inspect = $("factoryBatchInspect");
    const retry = $("factoryBatchRetry");
    const details = $("factoryBatchDetails");
    const updated = $("factoryBatchUpdated");
    if (!summary || !details) return;
    const batches = Array.isArray(batch?.batches) ? batch.batches :
      (batch?.job_id ? [batch] : []);
    const totals = batch?.totals || {
      batches: batches.length,
      active: batches.filter(row => ["queued", "running"].includes(row.status)).length,
      approved: batches.reduce((sum, row) => sum + Number(row.approved_count || 0), 0),
      failed: batches.reduce((sum, row) => sum + Number(row.failed_count || 0), 0),
    };
    if (count) count.textContent = String(Number(totals.batches) || 0);
    summary.textContent = `${Number(totals.active) || 0} active · ${Number(totals.approved) || 0} approved · ${Number(totals.failed) || 0} failed`;
    if (updated) updated.textContent = batch?.history_complete === false
      ? "Recent history (bounded window)" : "Latest activity · all matching profiles";
    if (recent) recent.innerHTML = batches.length
      ? batches.slice(0, 8).map(row => {
        const item = (row.items || [])[0] || {};
        const label = item.title || [item.platform, item.format].filter(Boolean).join(" ") || "Approval batch";
        const outputLabel = item.output_id ? `Output #${item.output_id}` : `${row.total || 0} outputs`;
        const stateLabel = ["running", "queued"].includes(row.status) ? "Processing"
          : row.failed_count ? "Needs attention" : "Completed";
        const passed = Number(row.approved_count || 0);
        return `<div class="factory-batch-recent-row">
          <div class="factory-batch-recent-info">
            <strong>${esc(label)}</strong>
            <span>${esc(factoryProfileLabel(row.profile_id))} · ${esc(outputLabel)} · ${esc([item.platform, item.format].filter(Boolean).join(" "))}</span>
          </div>
          <div class="factory-batch-recent-result">
            <strong>${esc(stateLabel)}</strong><span>${passed} approved · ${Number(row.failed_count) || 0} failed</span>
          </div>
        </div>`;
      }).join("")
      : '<p class="subtle">No recent approval batches in this Factory view.</p>';
    const latest = batches[0] || null;
    if (inspect) {
      inspect.hidden = !latest;
      inspect.setAttribute("aria-expanded", String(state.batchDetailsOpen));
    }
    if (retry) {
      retry.hidden = !(latest?.failed_count > 0 && latest?.can_retry);
      retry.disabled = state.submittingBatch;
    }
    details.hidden = !state.batchDetailsOpen || !latest;
    const items = Array.isArray(latest?.items) ? latest.items : [];
    details.innerHTML = latest ? `<ul class="factory-batch-item-list">${items.map(item =>
      `<li><strong>${esc(item.title || [item.platform, item.format].filter(Boolean).join(" ") || "Output")}</strong>
      <span>${esc(item.output_id ? `Output #${item.output_id}` : "Output")} · ${esc(item.status || "pending")}</span>
      ${item.error ? `<small>${esc(item.error)}</small>` : ""}</li>`).join("")}</ul>
      <details class="factory-batch-technical"><summary>Technical reference</summary>
      <code>${esc(latest.job_id)}</code> <button type="button" class="secondary-button"
      data-factory-copy-batch="${esc(latest.job_id)}">Copy batch ID</button></details>` : "";
    details.querySelector("[data-factory-copy-batch]")?.addEventListener("click", () => {
      const value = String(latest?.job_id || "");
      if (value) navigator.clipboard?.writeText(value).catch(() => {});
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
      if (state.batch?.job_id !== key) return;
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

  async function refreshFactoryBatchActivity(force = false) {
    const now = Date.now();
    const minInterval = Number(state.batch?.totals?.active || 0) ? 5000 : 30000;
    if (!force && state.batch && now - state.lastBatchFetchMs < minInterval) return state.batch;
    const params = new URLSearchParams({ scope: "all" });
    if (factoryProfileId()) params.set("factory_profile", factoryProfileId());
    try {
      const batch = await fetchJson(`/api/factory/approval-batches?${params.toString()}`, { cache: "no-store" });
      state.lastBatchFetchMs = Date.now();
      if (typeof batch.approvals_enabled === "boolean") {
        const before = JSON.stringify(state.batchRollout);
        state.batchApprovalsEnabled = batch.approvals_enabled;
        state.batchRollout = batch.rollout || null;
        updateFactoryBatchToolbar();
        if (state.desk && before !== JSON.stringify(state.batchRollout)) renderDesk(state.desk);
      }
      renderFactoryBatchActivity(batch);
      document.dispatchEvent(new CustomEvent("factory:batch-status", { detail: batch }));
      reconcileFinishedBatchDesk(batch).catch(() => {});
      return batch;
    } catch (error) {
      const summary = $("factoryBatchSummary");
      if (summary) summary.textContent = `Batch status temporarily unavailable: ${error.message || error}. Retry status refresh; do not resubmit blindly.`;
      return null;
    }
  }

  async function submitFactoryBatchApprovals() {
    if (state.submittingBatch) return;
    if (state.batchApprovalsEnabled === false) { setStatus("Batch approvals are not enabled yet; individual approvals still work.", true); return; }
    const ready = readyFactoryOutputs().filter((card) => state.selectedOutputs.has(card.id));
    if (!ready.length) { updateFactoryBatchToolbar(); setStatus("Select one or more review-ready outputs.", true); return; }
    const profiles = [...new Set(ready.map((card) => String(card.profile_id || "").trim()))];
    if (ready.length > Math.max(1, Number(state.batchRollout?.max_items || 100))) {
      setStatus("The current pilot permits only one Instagram Reel at a time.", true);
      return;
    }
    if (profiles.length !== 1 || !/^rec[A-Za-z0-9]+$/.test(profiles[0])) {
      setStatus("Select outputs from a single known profile per batch. Other selections have been preserved.", true);
      return;
    }
    // The existing canonical Approve All engine owns profile-local scheduling.
    // Refuse to mix profiles rather than stamp an output in the wrong timezone.
    state.submittingBatch = true;
    updateFactoryBatchToolbar();
    const selectionIds = ready.map((card) => card.id);
    let pending = null;
    try { pending = JSON.parse(localStorage.getItem(FACTORY_PENDING_REQUEST_KEY) || "null"); } catch {}
    const reuseRequest = pending && pending.profile_id === profiles[0]
      && JSON.stringify(pending.ids) === JSON.stringify(selectionIds)
      && Date.now() - Number(pending.saved_ms || 0) < 24 * 60 * 60 * 1000;
    const requestId = reuseRequest
      ? pending.request_id
      : (typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID() : `factory_${Date.now()}_${Math.random().toString(36).slice(2)}`).replace(/[^A-Za-z0-9_-]/g, "");
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
      state.lastBatchProfile = profiles[0];
      try { localStorage.setItem(FACTORY_LAST_BATCH_KEY, JSON.stringify({ job_id: batch.job_id, profile_id: profiles[0] })); } catch {}
      try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
      ready.forEach((card) => state.selectedOutputs.delete(card.id));
      saveFactorySelection();
      // Repaint row checkboxes immediately; a toolbar count of zero must not
      // leave an old checked DOM checkbox visible after durable enqueue.
      if (state.desk) renderDesk(state.desk);
      closeFactoryPreview();
      renderFactoryBatchActivity(batch);
      setStatus(`Batch ${batch.job_id} accepted. You can leave Factory; processing continues on the server.`);
      // Never wait for all approvals in the click handler.
    } catch (error) {
      setStatus(`Batch submission not confirmed: ${error.message || error}. Check Activity before retrying.`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingBatch = false;
      updateFactoryBatchToolbar();
    }
  }

  async function retryFactoryBatchFailures() {
    const batch = state.batch;
    if (!batch?.job_id || !batch.can_retry || state.submittingBatch) return;
    state.submittingBatch = true;
    updateFactoryBatchToolbar();
    try {
      const result = await fetchJson("/api/factory/approval-batches", {
        method: "POST",
        body: JSON.stringify({
          action: "retry", request_id: batch.request_id,
          content_profile_id: batch.profile_id,
        }),
      });
      renderFactoryBatchActivity(result);
      setStatus(result.message || "Failed items sent for retry.");
    } catch (error) {
      setStatus(`Retry not confirmed: ${error.message || error}`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingBatch = false;
      updateFactoryBatchToolbar();
    }
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
    if (card.kind === "output" && (canReviewActions(card, { pile, candidate }) || lane === "needs_eyes")) {
      actions.push(`<button type="button" class="primary-button" data-factory-approve="${esc(card.id)}">Approve</button>`);
      actions.push(`<button type="button" class="secondary-button" data-factory-send-back="${esc(card.id)}">Send back</button>`);
    }
    if (canDelete(card, { candidate })) {
      actions.push(`<button type="button" class="secondary-button factory-delete" data-factory-delete="${esc(card.id)}">Delete</button>`);
    }
    const thumb = String(card.thumbnail_url || "").trim();
    const media = canPreview(card)
      ? `<button type="button" class="factory-line-thumb" data-factory-preview="${esc(card.id)}" aria-label="Preview ${esc(cardLabel(card))}">
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : `<span class="factory-line-play">▶</span>`}
        </button>`
      : `<span class="factory-line-thumb factory-line-thumb-empty" aria-hidden="true"></span>`;
    const alert = card.stuck_kind || card.produce_error || "";
    const stateLabel = card.studio_state || (alert ? "Needs repair" : "—");
    const cell = (value) => `<span class="factory-line-cell">${esc(value || "—")}</span>`;
    return `<div class="factory-line" data-factory-id="${esc(card.id)}" data-factory-kind="${esc(card.kind || "")}" data-lane="${esc(lane)}" title="${esc(cardLabel(card))}">
      ${lane === "needs_eyes" && card.kind === "output" && canReviewActions(card) && canSelectBatchOutput(card)
        ? `<span class="factory-media-select"><input type="checkbox" data-factory-select-output="${esc(card.id)}" aria-label="Select ${esc(cardLabel(card))}" ${state.selectedOutputs.has(card.id) ? "checked" : ""}>${media}</span>`
        : media}
      <span class="factory-line-title">${esc(card.title || cardLabel(card))}${card.output_id ? `<small class="factory-output-number">Output #${esc(card.output_id)}</small>` : ""}</span>
      ${cell(card.profile_name)}
      ${cell(card.platform)}
      ${cell(card.studio_output_type)}
      <span class="factory-line-cell factory-line-state"${alert ? ` title="${esc(alert)}"` : ""}>${esc(stateLabel)}</span>
      <div class="factory-line-actions">${actions.join("")}</div>
    </div>`;
  }

  function contentGroupKey(card) {
    const contentId = String(card?.content_id || "").trim();
    if (contentId) return `content:${contentId}`;
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

  function readyContentCards(group) {
    return (group?.cards || []).filter((card) => card?.kind === "output" && canReviewActions(card) && /^rec[A-Za-z0-9]+$/.test(String(card.id || "")));
  }

  function isStoryOutputCard(card) {
    return /story/i.test(String(card?.studio_output_type || card?.format || ""));
  }

  /**
   * Same-content outputs still in Auto-high / Manual (usually Stories still
   * rendering). Approve all only sees Needs eyes, so without this gate mains
   * approve first and Stories reappear alone as Ready for Review.
   */
  function pendingSiblingOutputsForGroup(group) {
    const contentId = String(group?.cards?.[0]?.content_id || "").trim();
    if (!contentId || !state.desk?.lanes) return [];
    const readyIds = new Set((group?.cards || []).map((card) => String(card?.id || "")).filter(Boolean));
    const elsewhere = [
      ...(state.desk.lanes.auto_high || []),
      ...(state.desk.lanes.manual || []),
    ];
    return elsewhere.filter((card) => {
      if (card?.kind !== "output") return false;
      if (String(card.content_id || "").trim() !== contentId) return false;
      if (readyIds.has(String(card.id || ""))) return false;
      return true;
    });
  }

  function pendingSiblingMeta(pending) {
    if (!pending.length) return "";
    const stories = pending.filter(isStoryOutputCard).length;
    if (stories && stories === pending.length) {
      return `${stories} Stor${stories === 1 ? "y" : "ies"} still rendering`;
    }
    if (stories) {
      return `${pending.length} still rendering (${stories} Stor${stories === 1 ? "y" : "ies"})`;
    }
    return `${pending.length} sibling${pending.length === 1 ? "" : "s"} still rendering`;
  }

  function renderContentBar(group, expanded) {
    const ready = readyContentCards(group);
    const pending = pendingSiblingOutputsForGroup(group);
    const pendingLabel = pendingSiblingMeta(pending);
    const first = group.cards[0] || {};
    const contentId = String(first.content_id || "").trim();
    const title = first.title || "Untitled";
    const bits = [];
    if (contentId) bits.push(`Content ${contentId}`);
    bits.push(`${ready.length} ready`);
    if (pendingLabel) bits.push(pendingLabel);
    const meta = bits.join(" · ");
    const approveAll = ready.length > 1
      ? (pending.length
        ? `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}" disabled title="Wait until sibling Stories finish rendering, then Approve all together">${esc(`Approve all (${ready.length}) — wait for Stories`)}</button>`
        : `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}">Approve all (${ready.length})</button>`)
      : "";
    const batchReady = ready.filter(canSelectBatchOutput);
    const contentSelected = batchReady.length > 0 && batchReady.every((card) => state.selectedOutputs.has(card.id));
    const selectContent = `<label class="factory-content-batch-select">
      <input type="checkbox" data-factory-select-content="${esc(group.key)}"
        aria-label="Select all review-ready outputs for ${esc(title)}"
        ${contentSelected ? "checked" : ""} ${(!batchReady.length || pending.length) ? "disabled" : ""}>
      ${state.batchRollout?.mode === "chicago_ig_reel_v1" ? "Select pilot Reel" : "Select content"}</label>`;
    return `<div class="factory-content-bar" data-factory-content="${esc(group.key)}">
      ${selectContent}
      <button type="button" class="factory-content-toggle" data-factory-toggle-content="${esc(group.key)}" aria-expanded="${expanded}" aria-controls="factory-review-${esc(group.key.replace(/[^a-zA-Z0-9_-]/g, "-"))}">
        <span class="factory-content-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
        <span class="factory-content-label"><strong class="factory-content-title">${esc(title)}</strong><span class="factory-content-meta">${esc(meta)}</span></span>
      </button>
      ${ready.length ? `<button type="button" class="secondary-button factory-content-send-back" data-factory-send-back-content="${esc(group.key)}">Send back to Production</button>` : ""}
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
      const groups = groupByContent(cards);
      if (!groups.some((group) => group.key === state.expandedReviewGroup)) state.expandedReviewGroup = groups[0]?.key || null;
      node.innerHTML = groups.map((group) => {
        const expanded = group.key === state.expandedReviewGroup;
        const id = `factory-review-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        return renderContentBar(group, expanded) +
          `<div id="${esc(id)}" class="factory-content-rows" ${expanded ? "" : "hidden"}>${group.cards.map((card) => renderCard(card, options)).join("")}</div>`;
      }).join("");
      node.querySelectorAll("[data-factory-toggle-content]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.factoryToggleContent;
          state.expandedReviewGroup = state.expandedReviewGroup === key ? "" : key;
          renderDesk(state.desk);
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

  // Review feedback is entered before any state-changing request is sent.
  function openFactoryFeedback({ title, scope, payload }) {
    const backdrop = $("factoryFeedbackBackdrop");
    const textarea = $("factoryFeedbackNotes");
    if (!backdrop || !textarea) {
      setStatus("Review notes window is unavailable. Refresh Studio before sending back.", true);
      return;
    }
    state.pendingFactoryFeedback = { payload, focusedElement: document.activeElement };
    const heading = $("factoryFeedbackTarget");
    const detail = $("factoryFeedbackScope");
    const error = $("factoryFeedbackError");
    if (heading) heading.textContent = title || "Untitled content";
    if (detail) detail.textContent = scope || "Review changes";
    if (error) { error.hidden = true; error.textContent = ""; }
    textarea.value = "";
    const count = $("factoryFeedbackCount");
    if (count) count.textContent = "0 / 3000";
    const submit = $("factoryFeedbackSubmit");
    if (submit) { submit.disabled = false; submit.textContent = "Send back with notes"; }
    backdrop.hidden = false;
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
    try {
      closeFactoryPreview();
      const desk = await mutateDesk({ ...pending.payload, note: notes });
      const requestId = String(desk?.result?.production_request_id || pending.payload.production_request_id || "").trim();
      closeFactoryFeedback();
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
      if (submit) { submit.disabled = false; submit.textContent = "Send back with notes"; }
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
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-factory-send-back-content");
        const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
        const ready = readyContentCards({ cards });
        if (!ready.length) {
          setStatus("No reviewable outputs were found for this content.", true);
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
            action: "send_back_content",
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
          const ids = [...checkbox.closest(".factory-content-rows").querySelectorAll("[data-factory-select-output]")];
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
        rows?.querySelectorAll("[data-factory-select-output]").forEach((input) => { input.checked = checkbox.checked; });
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
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-send-back"));
        if (!card) {
          setStatus("Send back failed: card not found in desk payload.", true);
          return;
        }
        openFactoryFeedback({
          title: card.title || cardLabel(card),
          scope: [card.platform, card.studio_output_type, "Selected output only"].filter(Boolean).join(" · "),
          payload: {
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
    const filtered = (cards) => (cards || []).filter(factoryMatchesProfile);
    // Global counts come from the authoritative Desk summary. With a Factory
    // filter, only rows in the returned snapshot are counted and labelled.
    const summary = factoryProfileId() ? {
      auto_high: filtered(desk.lanes?.auto_high).length,
      needs_eyes: filtered(desk.lanes?.needs_eyes).length,
      needs_assets_pile: filtered(desk.lanes?.needs_assets).length,
      needs_assets_max: desk.summary?.needs_assets_max || 3,
      manual: filtered(desk.lanes?.manual).length,
    } : desk.summary;
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
    bindCardActions(desk);
    updateFactoryBatchToolbar();
  }

  const ACTION_STATUS = {
    pin_needs_assets: "Added to needs-assets pile.",
    unpin_needs_assets: "Removed from needs-assets pile.",
    approve: "Approved for publishing.",
    send_back: "Sent back to production.",
    send_back_content: "Content sent back to Production.",
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
    const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
    const ready = readyContentCards({ cards });
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
    const desk = await fetchJson("/api/factory/desk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // A successful approval is a durable mutation, not a full Desk read.
    // A subsequent refresh error must never be reported as approval failure.
    const savedMessage = desk.message || ACTION_STATUS[payload.action] || "Updated.";
    if (desk.lanes) {
      renderDesk(desk);
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
    if (state.loading && !force) return state.desk;
    state.loading = true;
    setStatus("Loading Factory Desk…");
    try {
      // Fetch independently of the expensive Factory queue; activity remains visible during a slow desk refresh.
      refreshFactoryBatchActivity().catch(() => {});
      if (!state.batchTimer) state.batchTimer = setInterval(() => {
        if (!document.hidden && $("page-factory")?.classList.contains("active")) refreshFactoryBatchActivity(true).catch(() => {});
      }, 5000);
      const desk = await fetchJson("/api/factory/desk");
      renderDesk(desk);
      setStatus(desk.warning || "Factory Desk ready.");
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
  $("factoryBatchRetry")?.addEventListener("click", () => { retryFactoryBatchFailures().catch(() => {}); });
  $("factoryBatchInspect")?.addEventListener("click", () => {
    state.batchDetailsOpen = !state.batchDetailsOpen;
    renderFactoryBatchActivity(state.batch);
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && $("page-factory")?.classList.contains("active")) refreshFactoryBatchActivity().catch(() => {});
  });
  $("factoryProfileFilter")?.addEventListener("change", () => {
    if (state.desk) renderDesk(state.desk);
    refreshFactoryBatchActivity(true).catch(() => {});
    window.StudioFactoryBatchQuality?.refresh?.(true);
  });
  // Studio profile changes must not alter global Factory monitoring.
  $("factoryDeskRefresh")?.addEventListener("click", () => {
    loadFactoryDesk(true).catch(() => {});
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
