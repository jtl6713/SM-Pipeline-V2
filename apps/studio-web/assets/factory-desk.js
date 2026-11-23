(() => {
  // Disposable caches must never prevent an approval request reaching the server.
  const localStorage = factoryStorage();
  function factoryStorage() {
    const memory = new Map();
    let disk; try { disk = window.localStorage; } catch {}
    const keys = () => {
      const found = new Set(memory.keys());
      try { for(let i=0;i<disk.length;i++) found.add(disk.key(i)); } catch {}
      return [...found];
    };
    return {
      get length() { return keys().length; }, key(i) { return keys()[i] ?? null; },
      getItem(key) { if(memory.has(key)) return memory.get(key); try{return disk.getItem(key);}catch{return null;} },
      setItem(key,value) {
        value=String(value);
        try { disk.setItem(key,value); memory.delete(key); return; } catch {}
        // Pipeline row snapshots can fill Safari's entire origin quota. They are
        // reloadable data, unlike the exact request IDs used for deduplication.
        try { for(const k of keys()) if(k?.startsWith('studio.pipelineOutputs.')) disk.removeItem(k); } catch {}
        try { disk.setItem(key,value); memory.delete(key); }
        catch { memory.set(key,value); } // Same-page retry remains available with storage disabled.
      },
      removeItem(key) { memory.delete(key); try{disk.removeItem(key);}catch{} },
    };
  }

  const $ = (id) => document.getElementById(id);
  const state = {
    loading: false,
    desk: null,
    expandedReviewGroup: null,
    needsEyesPage: 0,
    needsEyesSearch: "",
    metaRecoveryOnly: false,
    pendingFactoryFeedback: null,
    selectedOutputs: new Set(),
    submissionIntentIds: new Set(),
    heldCreativeAccepted: new Set(),
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
    batchSubmissionError: null,
    reconciledBatchDeskKey: "",
    reconcilingBatchDesk: false,
    batchDeskReconcileNextAttempt: 0,
    lastBatchFetchMs: 0,
    lastBatchFullFetchMs: 0,
    retryBatchNotice: null,
    lastBatchSuccessMs: 0,
    batchActivityError: "",
    batchActivityPartialError: "",
    batchRefreshRequested: false,
    submissionPreview: null,
    batchDiscoveryLoading: false,
    batchDiscoveryStartedMs: Date.now(),
  };
  const FACTORY_SELECTION_KEY = "studio.factory.batch-selection.v1";
  const FACTORY_LAST_BATCH_KEY = "studio.factory.last-batch.v1";
  const FACTORY_PENDING_REQUEST_KEY = "studio.factory.pending-approval-request.v1";
  const FACTORY_ACCEPTED_OUTPUTS_KEY = "studio.factory.accepted-output-ids.v1";
  const FACTORY_SUBMISSION_ERROR_KEY = "studio.factory.submission-error.v1";
  const FACTORY_PENDING_MISSING_GRACE_MS = 90 * 1000;
  // Exact original-request receipts for large submissions. A successful POST
  // accepts a *group*, not the entire selection; global history scans can time
  // out, so keep a bounded browser-side GET-only recovery index across reloads.
  const FACTORY_RECENT_GROUPS_KEY = "studio.factory.accepted-group-requests.v1";
  function recentFactoryGroupRequests(now = Date.now()) {
    try {
      const rows = JSON.parse(localStorage.getItem(FACTORY_RECENT_GROUPS_KEY) || "[]");
      return (Array.isArray(rows) ? rows : []).filter(row =>
        /^[A-Za-z0-9_-]{12,128}$/.test(String(row?.request_id || "")) &&
        Number(row.saved_ms) > 0 && now - Number(row.saved_ms) < 48 * 60 * 60 * 1000 &&
        now >= Number(row.saved_ms) - 60 * 1000
      ).slice(0, 24);
    } catch { return []; }
  }
  function rememberFactoryGroupRequest(batch) {
    const request_id = String(batch?.request_id || "");
    if (!batch?.job_id || !/^[A-Za-z0-9_-]{12,128}$/.test(request_id)) return;
    const group = batch.group === true;
    const profiles = [...new Set((batch.profile_ids ||
      (group ? (batch.items || []).map(item => item.profile_id) : [batch.profile_id]))
      .map(String).filter(id => /^rec[A-Za-z0-9]+$/.test(id)))];
    if (!profiles.length) return;
    const previous = recentFactoryGroupRequests();
    const rows = [{ request_id, group, profile_id: group ? null : batch.profile_id,
      profiles, saved_ms: Date.now() },
      ...previous.filter(row => row.request_id !== request_id)].slice(0, 24);
    try { localStorage.setItem(FACTORY_RECENT_GROUPS_KEY, JSON.stringify(rows)); } catch {}
  }
  function forgetFactoryGroupRequests(requestIds) {
    if (!requestIds?.length) return;
    const remove = new Set(requestIds.map(String));
    try { localStorage.setItem(FACTORY_RECENT_GROUPS_KEY, JSON.stringify(
      recentFactoryGroupRequests().filter(row => !remove.has(row.request_id)))); } catch {}
  }
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
  // Each interrupted request owns a separate durable entry. It must never be
  // overwritten by a newer selection or become a page-wide submission lock.
  const FACTORY_RECOVERY_PREFIX = "studio.factory.recovery.v2.";
  function factoryRecoveryEntries() {
    const rows = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(FACTORY_RECOVERY_PREFIX)) continue;
      try { const saved = JSON.parse(localStorage.getItem(key)); if (saved) rows.push({ key, saved }); } catch {}
    }
    return rows;
  }
  // A timed-out POST may already have committed a durable Factory parent. Its
  // original ID is persisted *before* the POST but isn't in accepted history.
  // Poll that exact ID by GET instead of depending on a slow global R2 scan.
  // These are UNCONFIRMED candidates, never fabricated accepted batches.
  function factoryPendingExactCandidates(pending, entries = []) {
    const found = [];
    for (const saved of [pending, ...(entries || []).map(entry => entry?.saved)]) {
      if (!saved || !Array.isArray(saved.ids)) continue;
      const global = saved.profile_id === "global";
      const profile = String(saved.profile_id || "");
      if (!global && !/^rec[A-Za-z0-9]+$/.test(profile)) continue;
      const plans = global ? saved.batches :
        [{ request_id: saved.request_id, ids: saved.ids }];
      if (!Array.isArray(plans)) continue;
      for (const plan of plans) {
        const request_id = String(plan?.request_id || "");
        const ids = plan?.ids;
        if (!/^[A-Za-z0-9_-]{12,128}$/.test(request_id) ||
            !Array.isArray(ids) || !ids.length ||
            ids.some(id => !/^rec[A-Za-z0-9]+$/.test(String(id)))) continue;
        const profiles = global
          ? [...new Set((Array.isArray(plan.payload?.items) ? plan.payload.items : [])
            .map(item => String(item?.profile_id || ""))
            .filter(id => /^rec[A-Za-z0-9]+$/.test(id)))]
          : [profile];
        found.push({
          request_id, group: global, profile_id: global ? null : profile,
          profiles, unconfirmed: true, expected_ids: ids.map(String).sort(),
        });
      }
    }
    return [...new Map(found.map(row => [row.request_id, row])).values()].slice(0, 24);
  }

  function archiveFactoryPending() {
    if (state.submittingBatch) return;
    const saved = pendingFactoryApproval();
    if (!saved) return;
    const identity = saved.request_id || saved.batches?.[0]?.request_id || "legacy";
    const key = FACTORY_RECOVERY_PREFIX + identity;
    // Write before removing the legacy slot: a storage failure loses no identity.
    localStorage.setItem(key, JSON.stringify(saved));
    localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY);
  }
  function factoryRecoveringIds() {
    return new Set(factoryRecoveryEntries().flatMap(({ saved }) => saved.ids || []));
  }

  // Submitted work belongs in Active Approvals, not the selectable Needs Eyes
  // lane. Include the click itself, saved/recovered requests and server Activity
  // so a slow Desk response or browser reload cannot resurrect checkboxes.
  function factorySubmittedApprovalIds() {
    const ids = new Set();
    const inFlight = new Set();
    const historical = new Set();
    const add = (target, values) => {
      for (const id of values || []) {
        if (/^rec[A-Za-z0-9]+$/.test(String(id))) target.add(String(id));
      }
    };
    add(inFlight, state.submissionIntentIds);
    add(inFlight, state.submittingOutputIds);
    add(inFlight, pendingFactoryApproval()?.ids);
    for (const { saved } of factoryRecoveryEntries()) add(inFlight, saved.ids);
    const accepted = recentFactoryAccepted();
    add(historical, Object.keys(accepted));
    for (const batch of factoryActivityRows(state.batch)) {
      const items = [...(batch?.items || []), ...(batch?.children || []).flatMap(child => child?.items || [])];
      for (const item of items) {
        const status = String(item?.status || "pending").toLowerCase();
        const target = ["approved", "already_satisfied", "failed",
          "skipped_removed", "superseded_duplicate"].includes(status) ? historical : inFlight;
        add(target, [item?.id]);
      }
    }
    add(ids, inFlight);
    add(ids, historical);
    // A terminal approval from the previous review cycle must not hide a
    // canonical item returned to Ready for Review after a gallery/creative
    // correction. Keep click intent, unresolved recovery requests and live
    // batch claims fenced. The server independently verifies the exact
    // slide package and atomically claims approval before any MAE scheduling.
    for (const card of state.desk?.lanes?.needs_eyes || []) {
      const id = String(card?.id || "");
      if (!historical.has(id) || inFlight.has(id)) continue;
      const age = Date.now() - Number(accepted[id] || 0);
      if (accepted[id] && (!Number.isFinite(age) || age < 5 * 60 * 1000)) continue;
      if (card?.kind !== "output"
          || String(card.output_status || "") !== "Ready for Review"
          || String(card.review_status || "") !== "Review Sent"
          || String(card.publish_status || "") !== "Not Ready"
          || !["Rendered", "Native Photo Route"].includes(String(card.render_status || ""))
          || card.do_not_publish !== false
          || card.auto_publish_enabled === true
          || card.review_package_ready === false
          || card.scheduled_post_date || card.studio_scheduled_at
          || card.youtube_scheduled_publish_at || card.published_at
          || card.platform_post_url) continue;
      ids.delete(id);
    }
    return ids;
  }

  // Only truly unresolved submissions block a new human approval. A terminal
  // historical Activity receipt is not proof that a freshly returned RFR output
  // still has a live approval in flight (#10855 / #2371).
  function factoryActiveSubmissionIds({ ignoreClickIntent = false } = {}) {
    const ids = new Set();
    const add = values => {
      for (const id of values || []) {
        if (/^rec[A-Za-z0-9]+$/.test(String(id))) ids.add(String(id));
      }
    };
    if (!ignoreClickIntent) add(state.submissionIntentIds);
    add(state.submittingOutputIds);
    add(pendingFactoryApproval()?.ids);
    for (const { saved } of factoryRecoveryEntries()) add(saved?.ids);
    for (const batch of factoryActivityRows(state.batch)) {
      const items = [...(batch?.items || []),
        ...(batch?.children || []).flatMap(child => child?.items || [])];
      for (const item of items) {
        if (!["approved", "already_satisfied", "failed",
          "skipped_removed", "superseded_duplicate"].includes(
            String(item?.status || "pending").toLowerCase())) add([item?.id]);
      }
    }
    return ids;
  }

  // A publication hold blocks *publishing approval*, not a separate human
  // creative review. Keep held rendered outputs with eligible review decisions
  // in Needs Eyes. They remain non-selectable for batch publishing approval.
  function factoryHasHumanReviewAction(card) {
    return canReviewActions(card) || canReviewHeldOutput(card) || canRejectHeldOutput(card);
  }

  // The canonical output has returned to a fresh, unheld review state. Browser
  // submission/history fences may require reconciliation, but must not make
  // the item itself invisible. Unresolved claims remain non-selectable.
  function factoryUnheldReviewCandidate(card) {
    return card?.kind === "output"
      && String(card.output_status || "") === "Ready for Review"
      && String(card.review_status || "") === "Review Sent"
      && String(card.publish_status || "") === "Not Ready"
      && ["Rendered", "Native Photo Route"].includes(String(card.render_status || ""))
      && card.do_not_publish === false && card.auto_publish_enabled !== true
      && card.review_hold_active !== true && card.safety_hold_active !== true
      && card.review_package_ready !== false
      && !card.scheduled_post_date && !card.studio_scheduled_at
      && !card.youtube_scheduled_publish_at && !card.published_at
      && !card.platform_post_url;
  }

  function factoryVisibleNeedsEyes(cards) {
    const submitted = factorySubmittedApprovalIds();
    return (cards || []).filter(card => {
      if (card?.kind !== "output") return false;
      // Historical accepted/batch receipts and 48-hour browser fences are NOT
      // evidence of a completed creative-only review. The authoritative Desk
      // may have returned an output to a publication-held Ready for Review
      // state; keep its safe held-review/rejection controls and preview visible.
      // These actions cannot schedule/publish, and batch selection still uses
      // the independent server/Do_Not_Publish eligibility gates.
      const heldReview = canReviewHeldOutput(card) || canRejectHeldOutput(card);
      if (heldReview) return true;
      // If an old accepted/recovery fence outlives the changed canonical state,
      // the unheld RFR stays visible for inspection. The active request fence
      // still disables approval/selection until its receipt is reconciled.
      if (typeof factoryUnheldReviewCandidate === "function" && factoryUnheldReviewCandidate(card)) return true;
      return !submitted.has(String(card.id || "")) && factoryHasHumanReviewAction(card);
    });
  }

  // Only genuinely unreviewable items move to Needs Attention. Moving safe
  // creative-only decisions there caused the Museum Mile Day Plan outputs
  // 10827–10832 to disappear from the main Factory review queue.
  function factoryReviewAttentionCards(cards) {
    const submitted = factorySubmittedApprovalIds();
    return (cards || []).filter(card => card?.kind === "output" &&
      !submitted.has(String(card?.id || "")) && !factoryHasHumanReviewAction(card))
      .map(card => ({ ...card, _factoryAttention: true }));
  }

  const FACTORY_WAITING_SELECTION_KEY = "studio.factory.waiting-selection.v1";
  function waitingFactorySelection() {
    try { return JSON.parse(localStorage.getItem(FACTORY_WAITING_SELECTION_KEY) || "[]"); } catch { return []; }
  }
  try {
    const saved = JSON.parse(localStorage.getItem(FACTORY_SELECTION_KEY) || "[]");
    state.selectedOutputs = new Set(Array.isArray(saved)
      ? saved.filter((id) => /^rec[A-Za-z0-9]+$/.test(String(id))).slice(0, 100)
      : []);
    const latest = JSON.parse(localStorage.getItem(FACTORY_LAST_BATCH_KEY) || "{}");
    state.lastBatchProfile = String(latest.profile_id || "");
    const savedError = JSON.parse(sessionStorage.getItem(FACTORY_SUBMISSION_ERROR_KEY) || "null");
    // A failure from an earlier UI session is not evidence of a current failed
    // request. Keep the error only while its exact-ID pending fence is present.
    // Once reconciliation has cleared that fence, historical HTTP 500 copy
    // must not survive a reload as though a fresh submit failed.
    if (!pendingFactoryApproval()) {
      sessionStorage.removeItem(FACTORY_SUBMISSION_ERROR_KEY);
    } else if (savedError?.message && Date.now() - Number(savedError.saved_ms || 0) < 30 * 60 * 1000) {
      state.batchSubmissionError = String(savedError.message);
    }
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

  function setBatchSubmissionError(message) {
    state.batchSubmissionError = message ? String(message) : null;
    try {
      if (state.batchSubmissionError) sessionStorage.setItem(FACTORY_SUBMISSION_ERROR_KEY, JSON.stringify({
        message: state.batchSubmissionError, saved_ms: Date.now(),
      }));
      else sessionStorage.removeItem(FACTORY_SUBMISSION_ERROR_KEY);
    } catch {}
    if (state.batchSubmissionError) {
      setStatus(state.batchSubmissionError, true);
      surfaceFactoryBlockingApproval(state.batchSubmissionError).catch(() => {});
    }
  }

  // Already-approved / permanently ineligible outputs must not keep a browser
  // recovery fence that re-paints "Submission not accepted yet" forever.
  // Live overlap / still-committing claim fences stay visible so the operator
  // can wait or inspect the blocking batch ID.
  function factoryTerminalEligibilityError(message) {
    const text = String(message || "");
    if (/\blive Factory approval\b|still committing\b|overlap another (live )?Factory approval\b/i.test(text)) {
      return false;
    }
    return /\bpast_review\b|no longer ready for approval|Approved for Publishing|already past review/i
      .test(text) || (/Native gallery publication blocked:\s*native_gallery_[a-z0-9_]+/i.test(text)
        && /No new batch was accepted[.!]?/i.test(text));
  }

  // Flood/deleted Platform Outputs return a durable 409 from global preflight.
  // Those browser recovery fences must not keep "awaiting server acceptance"
  // forever or starve a later Ready-for-Review selection.
  function factoryUnrecoverableSubmitError(message) {
    const text = String(message || "");
    return /could not be loaded for global batch approval/i.test(text)
      || /INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND/i.test(text)
      || /requested model was not found/i.test(text)
      || /record does not exist/i.test(text)
      || /Exact output absent/i.test(text);
  }

  function clearFactoryRecoveryFences(options) {
    const onlyUnrecoverable = Boolean(options && options.onlyUnrecoverable);
    let dropped = 0;
    for (const { key, saved } of factoryRecoveryEntries()) {
      const unrecoverable = factoryUnrecoverableSubmitError(saved?.last_error)
        || saved?.terminal_eligibility === true;
      if (onlyUnrecoverable && !unrecoverable) continue;
      if (onlyUnrecoverable) {
        // A stale member is not permission to discard the rest of a saved batch.
        // Continue only if the backend identified exactly which output failed
        // BEFORE acceptance; otherwise preserve the fence for inspection.
        const recovered = dropFactoryRecoveryEntry(key, saved,
          factoryTerminalEligibilityError(saved?.last_error) &&
          /Native gallery publication blocked:/i.test(String(saved?.last_error || ""))
            ? "Native gallery is missing verified slides. This output was not approved; its rejected request was retired. Other selected outputs remain available."
            : "The identified stale output was skipped; remaining approvals are preserved.");
        if (recovered.dropped) dropped += 1;
        continue;
      }
      try { localStorage.removeItem(key); } catch {}
      dropped += 1;
    }
    if (!onlyUnrecoverable) {
      try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
    } else {
      const pending = pendingFactoryApproval();
      if (pending && (factoryUnrecoverableSubmitError(pending.last_error)
          || pending.terminal_eligibility === true)) {
        const recovered = dropFactoryRecoveryEntry(FACTORY_PENDING_REQUEST_KEY, pending,
          factoryTerminalEligibilityError(saved?.last_error) &&
          /Native gallery publication blocked:/i.test(String(saved?.last_error || ""))
            ? "Native gallery is missing verified slides. This output was not approved; its rejected request was retired. Other selected outputs remain available."
            : "The identified stale output was skipped; remaining approvals are preserved.");
        if (recovered.dropped) dropped += 1;
      }
    }
    return dropped;
  }

  function pruneFactorySelectionToNeedsEyes() {
    const live = new Set((state.desk?.lanes?.needs_eyes || [])
      .filter((card) => card?.kind === "output" && /^rec[A-Za-z0-9]+$/.test(String(card.id || "")))
      .map((card) => String(card.id)));
    let removed = 0;
    for (const id of [...state.selectedOutputs]) {
      if (live.size && !live.has(id)) {
        state.selectedOutputs.delete(id);
        removed += 1;
      }
    }
    if (removed) saveFactorySelection();
    return removed;
  }

  function factoryBlockingRequestIdsFromMessage(message) {
    const match = String(message || "").match(/\(([A-Za-z0-9_,. -]{12,400})\)/);
    if (!match) return [];
    return [...new Set(match[1].split(",").map((part) => part.trim())
      .filter((id) => /^[A-Za-z0-9_-]{12,128}$/.test(id)))].slice(0, 3);
  }

  async function surfaceFactoryBlockingApproval(message) {
    const owners = factoryBlockingRequestIdsFromMessage(message);
    if (!owners.length || state.submittingBatch) return;
    for (const requestId of owners) {
      let status = null;
      try {
        status = await fetchJson(
          "/api/factory/approval-batches?scope=all&request_id=" + encodeURIComponent(requestId),
          { cache: "no-store" },
        );
      } catch { continue; }
      const batch = (status?.batches || []).find((row) =>
        String(row?.request_id || "") === requestId
        || String(row?.job_id || "") === `fg_${requestId}`
        || String(row?.job_id || "") === requestId) || (status?.batches || [])[0];
      if (!batch) {
        setStatus(`Blocking claim ${requestId} has no Activity ledger yet (ghost reservation). Wait ~90s if it is still committing, then retry Submit.`, true);
        continue;
      }
      state.completedOpen = false;
      state.activeApprovalsCollapsed = false;
      state.batchDetailsOpen = true;
      state.inspectedBatchKey = batch.job_id || `fg_${requestId}`;
      const current = state.batch || { batches: [], totals: {} };
      const batches = [batch, ...(current.batches || [])
        .filter((row) => row?.job_id && row.job_id !== batch.job_id)];
      renderFactoryBatchActivity({
        ...current,
        batches,
        totals: {
          ...(current.totals || {}),
          batches: batches.length,
          active: batches.filter((row) => ["queued", "running", "enqueuing"].includes(row.status)).length,
          approved: batches.reduce((sum, row) => sum + Number(row.approved_count || 0), 0),
          pending: batches.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
          failed: batches.reduce((sum, row) => sum + Number(row.failed_count || 0), 0),
        },
      });
      setStatus(`Blocking approval ${requestId} is ${batch.status || "stored"} · ${Number(batch.pending_count) || 0} pending · ${Number(batch.approved_count) || 0} approved. Active list hid completed ownership; inspect it above.`, true);
      return;
    }
  }

  // Only a *specific* pre-acceptance 409 proves that one member may be
  // excluded safely. Generic 409/503/timeouts and absent-record errors do not
  // prove which output failed or whether another batch was accepted.
  function factoryRejectedOutputId(saved, message = saved?.last_error) {
    const text = String(message || "");
    const ids = [...new Set((saved?.ids || []).filter(id =>
      /^rec[A-Za-z0-9]+$/.test(String(id))))];
    // Both errors are thrown by the global preflight before reserving any
    // batch claim. If there is only one selected ID, it is unambiguous even
    // when an old Worker returns the generic "could not be loaded" message.
    const definiteNoAccept = /No new batch was accepted[.!]?/i.test(text);
    const missingBeforeAccept = /At least one selected output could not be loaded for global batch approval/i.test(text);
    if (!definiteNoAccept && !missingBeforeAccept) return null;
    if (ids.length === 1) return ids[0];
    // For multi-output batches, only a single exact server-identified member
    // may be removed, and only when the server explicitly confirms that no
    // new batch was accepted. The Worker can report either a numeric Output #
    // or an Airtable record ID prefixed by "Output #". Never guess from order.
    if (!definiteNoAccept) return null;
    const recordMatches = [...text.matchAll(/Output #(rec[A-Za-z0-9]{14}):[^\n]*?No new batch was accepted[.!]?/gi)];
    if (recordMatches.length) {
      const recordId = recordMatches[0][1];
      return recordMatches.length === 1 && ids.includes(recordId) ? recordId : null;
    }
    const match = text.match(/Output #(\d+):[^\n]+?No new batch was accepted[.!]?/i);
    if (!match) return null;
    const member = (saved?.batches || []).flatMap(plan =>
      Array.isArray(plan?.payload?.items) ? plan.payload.items : [])
      .filter(item => String(item?.output_id || "") === match[1]
        && /^rec[A-Za-z0-9]+$/.test(String(item?.id || "")));
    if (member.length !== 1) return null;
    const id = String(member[0].id);
    return ids.includes(id) ? id : null;
  }

  function dropFactoryRecoveryEntry(recoveryKey, saved, reason) {
    const rejectedId = factoryRejectedOutputId(saved);
    if (!rejectedId) {
      return {
        resolved: false, dropped: false,
        message: "Factory could not identify a single rejected output before acceptance. " +
          "All saved output IDs and request IDs are preserved; inspect Activity rather than discarding or resubmitting the batch.",
      };
    }
    // Persist the surviving selection BEFORE releasing its old rejected
    // request ID. The next ordinary submission allocates a fresh idempotency
    // key; never reuse the invalid plan's original key for a different set.
    const survivors = (saved.ids || []).filter(id =>
      id !== rejectedId && state.selectedOutputs.has(id));
    const waiting = [...new Set([...waitingFactorySelection(), ...survivors])]
      .filter(id => id !== rejectedId);
    try {
      localStorage.setItem(FACTORY_WAITING_SELECTION_KEY, JSON.stringify(waiting));
      localStorage.removeItem(recoveryKey);
    } catch {
      return {
        resolved: false, dropped: false,
        message: "Could not preserve the remaining Factory approval selection in browser storage. No IDs were discarded.",
      };
    }
    state.selectedOutputs.delete(rejectedId);
    saveFactorySelection();
    if (!factoryRecoveryEntries().some(({ saved: row }) =>
      (row.ids || []).some(id => state.selectedOutputs.has(id)))) {
      setBatchSubmissionError(null);
    }
    return {
      resolved: true, count: 0, dropped: true, skipped_output_id: rejectedId,
      remaining: survivors.length,
      message: (reason || "A stale Factory approval was removed.") +
        " Preserved " + survivors.length + " other selected output(s) for automatic safe resubmission.",
    };
  }

  async function fetchJson(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(options.timeoutMs || 35000));
    try {
    const response = await fetch(path, {
      signal: controller.signal,
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
      const message = detail || (response.status === 503
        ? "Factory desk is busy (503). Wait a moment, check Activity, then retry."
        : response.status >= 500
          ? `Factory desk timed out or failed (${response.status}). Check Activity before retrying — the batch may not have been stored.`
          : `Factory desk failed (${response.status})`);
      const error = new Error(message);
      error.status = response.status;
      error.retryAfterSeconds = Number(response.headers.get("Retry-After") || 0) || 0;
      throw error;
    }
    return body || {};
    } catch (error) {
      if (error?.name === "AbortError") {
        const timeoutError = new Error("Factory request timed out; the saved submission will be checked automatically.");
        timeoutError.status = 504;
        throw timeoutError;
      }
      throw error;
    } finally { clearTimeout(timeout); }
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

  function canReviewActions(card, { pile = false, candidate = false, ignoreClickIntent = false } = {}) {
    if (pile || candidate || state.submittingOutputIds?.has(card?.id)) return false;
    if (typeof factoryActiveSubmissionIds === "function"
        && factoryActiveSubmissionIds({ ignoreClickIntent }).has(String(card?.id || ""))) return false;
    // A 48-hour local acceptance hint is not a saved approval. If the server
    // still reports Ready for Review, allow a fresh explicit operator action;
    // the canonical per-output lease prevents duplicate committed approvals.
    if (recentFactoryAccepted()[String(card?.id || "")] &&
        String(card?.output_status || "").trim().toLowerCase() !== "ready for review") return false;
    if (card?.kind !== "output") return false;
    if (card.creative_qa_hold === true) return false;
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
    // Recovery Source approved media is intentionally preserved. A generic
    // Delete button in Repair must not destroy the only source of the package.
    if (card?.protected_media_rework === true || card?.meta_repair_required === true
      || card?.creative_qa_hold === true) return false;
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

  // Exact-original-source, read-only carousel: these are not newly staged
  // Instagram public assets and must never imply fresh creative approval.
  function clearFactoryRecoveryGalleryControls() {
    $("factoryRecoveryGalleryControls")?.remove();
  }

  function showFactoryRecoverySourceGallery(card, image, dialog) {
    if (card?.protected_media_rework !== true) return false;
    const id = String(card.id || "");
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return false;
    const urls = card.recovery_original_image_previews;
    if (!Array.isArray(urls) || urls.length < 2 || urls.length > 10) return false;
    const pattern = new RegExp(
      "^https://media\\.chicagoshining\\.com/studio/previews/(?:lettered|watermarked)/"
      + id + "/([0-9])\\.jpg$", "i"
    );
    if (!urls.every((url, index) => typeof url === "string"
      && pattern.exec(url)?.[1] === String(index))) return false;

    const controls = document.createElement("div");
    controls.id = "factoryRecoveryGalleryControls";
    controls.className = "factory-recovery-gallery-controls";
    controls.setAttribute("role", "group");
    controls.setAttribute("aria-label", "Original recovery image gallery, not yet approved");
    controls.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:12px 4px";
    const back = document.createElement("button");
    back.type = "button";
    back.className = "secondary-button";
    back.textContent = "Previous image";
    const counter = document.createElement("span");
    counter.setAttribute("aria-live", "polite");
    const next = document.createElement("button");
    next.type = "button";
    next.className = "secondary-button";
    next.textContent = "Next image";
    controls.append(back, counter, next);
    let index = 0;
    function display(indexToShow) {
      index = indexToShow;
      image.src = urls[index];
      image.alt = `Verified original preview image ${index + 1} of ${urls.length}; not an approved or staged Instagram asset`;
      image.hidden = false;
      counter.textContent = `${index + 1} / ${urls.length} original images · review only`
        + (card.recovery_source_count_mismatch === true ? " · source count mismatch" : "");
      back.disabled = index === 0;
      next.disabled = index === urls.length - 1;
      setStatus(`Viewing original ${index + 1} of ${urls.length} for ${cardLabel(card)} · fresh approval and staging still required`);
    }
    back.addEventListener("click", () => display(index - 1));
    next.addEventListener("click", () => display(index + 1));
    dialog.appendChild(controls);
    display(0);
    return true;
  }

  let factoryGalleryPreviewEpoch = 0;
  function clearFactoryNativeGalleryControls() {
    $("factoryNativeGalleryControls")?.remove();
  }
  function isFactoryNativeGallery(card) {
    return /carousel|multi[\s-]?image|photo[\s-]?set/i.test(
      String(card?.studio_output_type || ""));
  }
  // Never infer a complete gallery from its one cover. Load the exact active
  // native Carousel Slides inventory through the authorized Supabase-only API.
  async function showFactoryNativeGallery(card, image, dialog, epoch) {
    try {
      const id = String(card?.id || "");
      if (!/^rec[A-Za-z0-9]{14}$/.test(id)) throw new Error("Invalid gallery output identity");
      const data = await fetchJson(`/api/factory/outputs/${encodeURIComponent(id)}/slides`, {
        timeoutMs: 18000,
      });
      if (epoch !== factoryGalleryPreviewEpoch) return;
      const slides = data?.slides;
      const draftOnly = data?.provisional === true
        && ["unverified-selected-source-images", "unverified-native-draft-slides"].includes(data?.source)
        && data?.do_not_publish === true && data?.publication_authorized === false;
      if (data?.provisional && !draftOnly) {
        throw new Error("Untrusted candidate gallery cannot be shown");
      }
      const trustedImage = /^https:\/\/media\.chicagoshining\.com\/studio\/previews\/[A-Za-z0-9_./-]+\.(?:jpg|jpeg|png|webp)$/i;
      if (data?.output_id !== id || !Array.isArray(slides) || slides.length < 2
          || slides.length > 10 || data.count !== slides.length
          || !slides.every((slide, i) => slide.order === i + 1
            && trustedImage.test(String(slide.image_url || "")))) {
        throw new Error("Full verified native gallery is not available");
      }
      const controls = document.createElement("div");
      controls.id = "factoryNativeGalleryControls";
      controls.className = "factory-recovery-gallery-controls";
      controls.setAttribute("role", "group");
      controls.setAttribute("aria-label", "Native photo gallery slide navigation");
      controls.style.cssText = "display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;padding:12px 4px";
      const back = document.createElement("button");
      back.type = "button";
      back.className = "secondary-button";
      back.textContent = "Previous image";
      const counter = document.createElement("span");
      counter.setAttribute("aria-live", "polite");
      const next = document.createElement("button");
      next.type = "button";
      next.className = "secondary-button";
      next.textContent = "Next image";
      controls.append(back, counter, next);
      if (draftOnly) {
        const hold = document.createElement("p");
        hold.setAttribute("role", "alert");
        hold.style.cssText = "flex-basis:100%;width:100%;font-weight:700;color:#9a6000;text-align:center";
        hold.textContent = data.source === "unverified-native-draft-slides"
          ? "Draft native slides linked — final creative approval still pending. Do not approve or publish."
          : "Unverified source images only — native carousel slides missing. Do not approve or publish.";
        controls.appendChild(hold);
      }
      dialog.appendChild(controls);
      let index = 0;
      const show = (nextIndex) => {
        index = nextIndex;
        image.src = slides[index].image_url;
        image.alt = draftOnly
          ? `UNAPPROVED draft/source image ${index + 1} of ${slides.length}`
          : `Verified native gallery slide ${index + 1} of ${slides.length}`;
        image.hidden = false;
        counter.textContent = draftOnly
          ? `${index + 1} / ${slides.length} draft images · NOT approved`
          : `${index + 1} / ${slides.length} native slides · review only`;
        back.disabled = index === 0;
        next.disabled = index === slides.length - 1;
        setStatus(draftOnly
          ? `UNVERIFIED source preview only — missing linked slides · ${cardLabel(card)}`
          : `Viewing native slide ${index + 1} of ${slides.length} · ${cardLabel(card)}`, draftOnly);
      };
      image.onerror = () => setStatus(
        `Native gallery slide ${index + 1} could not load · ${cardLabel(card)}`, true);
      back.addEventListener("click", () => show(index - 1));
      next.addEventListener("click", () => show(index + 1));
      show(0);
    } catch (error) {
      if (epoch !== factoryGalleryPreviewEpoch) return;
      setStatus(`Full gallery unavailable: ${String(error?.message || error)}. The cover alone is not approval evidence.`, true);
      const empty = $("factoryPreviewEmpty");
      if (empty) {
        empty.hidden = false;
        empty.textContent = "Cannot verify the individual native slides in Factory. Do not approve this output until the slide inventory loads.";
      }
      image.hidden = true;
    }
  }

  function closeFactoryPreview() {
    factoryGalleryPreviewEpoch += 1;
    clearFactoryNativeGalleryControls();
    clearFactoryRecoveryGalleryControls();
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
      image.onerror = null;
      image.removeAttribute("src");
      image.hidden = true;
    }
    if (empty) empty.hidden = true;
    dialog?.classList.remove("is-image");
    dialog?.classList.add("is-video");
    if (backdrop) backdrop.hidden = true;
  }

  function openFactoryPreview(card) {
    const galleryEpoch = ++factoryGalleryPreviewEpoch;
    clearFactoryNativeGalleryControls();
    clearFactoryRecoveryGalleryControls();
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
    // Server has already verified an exact-output R5 media.chicagoshining.com
    // MP4. Only use this if the authenticated Factory proxy cannot play.
    const publicPreviewUrl = String(card.public_preview_url || "").trim();
    let triedSavedR5 = false;
    const imageOnly = looksLikeImageOnly(card);

    // A recovery-marked, publishing-held gallery is NOT a video preview.
    // The generic /api/outputs/:id/preview route still resolves legacy
    // provider/Drive data. For protected repair use the exact trusted public
    // first image only, and never send a video request or a stale Airtable GET.
    if (card.protected_media_rework === true) {
      const safeSource = /^https:\/\/media\.chicagoshining\.com\/studio\/previews\/[A-Za-z0-9_\/-]+\.(jpg|jpeg|png|webp)$/i.test(thumb);
      dialog.classList.remove("is-video");
      dialog.classList.add("is-image");
      if (showFactoryRecoverySourceGallery(card, image, dialog)) {
        // Every displayed image is tied to this original output's audited
        // full 4:5 preview sequence; no legacy video/Drive lookup is made.
      } else if (safeSource) {
        image.src = thumb;
        image.hidden = false;
        setStatus(`Original held source image · ${cardLabel(card)} · not a complete approved gallery`);
      } else {
        empty.hidden = false;
        empty.textContent = "Original media needs reconstruction. No verified source preview exists yet.";
        setStatus(`No verified recovery preview for ${cardLabel(card)}`, true);
      }
      backdrop.hidden = false;
      return;
    }

    if (isFactoryNativeGallery(card)) {
      dialog.classList.remove("is-video");
      dialog.classList.add("is-image");
      if (thumb) {
        image.src = thumb;
        image.alt = "Gallery cover · loading verified individual slides";
        image.hidden = false;
      }
      backdrop.hidden = false;
      setStatus(`Loading verified native gallery slides · ${cardLabel(card)}`);
      void showFactoryNativeGallery(card, image, dialog, galleryEpoch);
      return;
    }

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
      if (galleryEpoch !== factoryGalleryPreviewEpoch || backdrop.hidden) return;
      // Native <video> cannot attach the API client's authenticated headers.
      // A proxy failure must not strand an otherwise valid saved R5 MP4.
      // One guarded fallback only: never invent a render or loop forever.
      if (!triedSavedR5 && publicPreviewUrl && publicPreviewUrl !== previewUrl) {
        triedSavedR5 = true;
        video.pause();
        video.src = publicPreviewUrl;
        video.hidden = false;
        empty.hidden = true;
        video.load();
        setStatus(`Factory stream unavailable; trying saved Studio MP4 · ${cardLabel(card)}`, true);
        video.play?.().catch(() => {
          if (!video.error) setStatus(`Saved MP4 ready · tap Play · ${cardLabel(card)}`);
        });
        return;
      }
      // A failed video is not a successful still render. Never silently
      // replace the movie with its cover image (Output 3129).
      video.pause();
      video.hidden = true;
      image.hidden = true;
      empty.hidden = false;
      empty.textContent = "Video playback failed — this cover is not the finished render. Open the output in Pipeline or its original video file to review the scenes.";
      setStatus(`Video preview failed for ${cardLabel(card)} — not a single-image render.`, true);
    };
    video.onplaying = () => setStatus(`${triedSavedR5 ? "Playing saved original Studio MP4" : "Playing video"} · ${cardLabel(card)}`);
    video.onloadedmetadata = () => {
      if (video.paused) setStatus(`${triedSavedR5 ? "Saved original Studio MP4" : "Video"} ready · tap Play to review all scenes of ${cardLabel(card)}`);
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

  function resolveFactoryCardProfileId(card) {
    const id = String(card?.profile_id || "").trim();
    if (/^rec[A-Za-z0-9]+$/.test(id)) return id;
    const name = String(card?.profile_name || "").trim().toLowerCase();
    if (!name) return "";
    const pools = [
      ...($("studioProfileSelect")?.options || []),
      ...($("factoryProfileFilter")?.options || []),
    ];
    for (const option of pools) {
      if (!/^rec[A-Za-z0-9]+$/.test(option.value)) continue;
      if (String(option.textContent || "").trim().toLowerCase() === name) return option.value;
    }
    return "";
  }

  function withResolvedFactoryProfile(card) {
    const profileId = resolveFactoryCardProfileId(card);
    if (!profileId || profileId === String(card?.profile_id || "").trim()) return card;
    return { ...card, profile_id: profileId };
  }

  function canSelectBatchOutput(card, { ignoreClickIntent = false } = {}) {
    if (typeof factoryActiveSubmissionIds === "function"
        && factoryActiveSubmissionIds({ ignoreClickIntent }).has(String(card?.id || ""))) return false;
    if (recentFactoryAccepted()[String(card?.id || "")] &&
        String(card?.output_status || "").trim().toLowerCase() !== "ready for review") return false;
    if (state.batchApprovalsEnabled === false) return false;
    if (state.batchGlobal?.enabled) {
      if (!resolveFactoryCardProfileId(card)) return false;
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
  function readyFactoryOutputs(includeOtherProfiles=false, includeClickIntent=false) {
    const submitted = factorySubmittedApprovalIds();
    return (state.desk?.lanes?.needs_eyes || [])
      .filter((card) => {
        if (!(includeOtherProfiles || factoryMatchesProfile(card)) || card?.kind !== "output") return false;
        if (submitted.has(String(card.id || ""))
            && !(includeClickIntent && state.submissionIntentIds.has(card.id))) return false;
        // The click hides rows immediately, but the same transient fence must
        // not invalidate the exact selection being submitted after policy read.
        // Ignore ONLY this tab's own click-intent marker. Pending persisted
        // requests, other claims, holds and backend eligibility remain blocked.
        return canReviewActions(card, { ignoreClickIntent: includeClickIntent }) &&
          canSelectBatchOutput(card, { ignoreClickIntent: includeClickIntent });
      })
      .map(withResolvedFactoryProfile);
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
    const recovering = factoryRecoveringIds();
    const approvalBusy = state.submittingBatch;
    const pendingNotice = $("factoryBatchPendingNotice");
    if (pendingNotice) {
      pendingNotice.hidden = !recovering.size;
      const entries = factoryRecoveryEntries();
      const problems = entries.map(({ saved }) => saved.last_error).filter(Boolean);
      const blocked = entries.some(({ saved }) => saved.retry_blocked);
      pendingNotice.textContent = `${recovering.size} output${recovering.size === 1 ? "" : "s"} awaiting server acceptance. ${blocked ? "Approval needs attention: " : "Saved; automatic retry is active. "}${problems.join(" ")} You can submit other selections.`;
    }
    const submit = $("factoryBatchSubmit");
    if (submit) {
      submit.disabled = !selectable || (!global && selectable > limit) ||
        approvalBusy || state.batchApprovalsEnabled === false;
      submit.title = state.batchApprovalsEnabled === false
        ? "Batch approvals are disabled for this profile; individual approvals remain available."
        : "Previously submitted outputs are checked automatically to prevent duplicates.";
      submit.textContent = approvalBusy ? "Submitting…" : `Submit Approvals${selectable ? ` (${selectable})` : ""}`;
    }
    const clear = $("factoryBatchClear");
    if (clear) {
      clear.disabled = !state.selectedOutputs.size || approvalBusy;
      clear.removeAttribute("title");
    }
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

  function updateFactoryBatchFreshness() {
    const updated = $("factoryBatchUpdated");
    if (!updated || state.completedOpen) return;
    if (!state.lastBatchSuccessMs) {
      updated.textContent = state.batchActivityError || "Waiting for first activity update…";
      return;
    }
    const ageSeconds = Math.floor((Date.now() - state.lastBatchSuccessMs) / 1000);
    const ageLabel = ageSeconds < 5 ? "just now" : ageSeconds + "s ago";
    if (state.batchActivityError || state.batchActivityPartialError || ageSeconds > 15) {
      updated.textContent = "Status delayed · last updated " + ageLabel +
        (state.batchActivityError ? " · retrying" : state.batchActivityPartialError ? " · partial update" : "");
    } else {
      updated.textContent = "Updated " + ageLabel + " · auto-refreshing";
    }
  }

  function factoryLiveElapsed(since, now = Date.now()) {
    const start = Date.parse(String(since || ""));
    if (!Number.isFinite(start)) return "unknown";
    const seconds = Math.floor(Math.max(0, now - start) / 1000);
    if (seconds < 60) return `${seconds}s`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    return `${Math.floor(seconds / 3600)}h ${Math.floor(seconds % 3600 / 60)}m`;
  }

  function factoryLivePhaseLabel(item, now = Date.now()) {
    const phase = String(item?.phase || (
      item?.status === "pending" ? "queued" :
      item?.status === "failed" ? "failed" :
      ["approved","already_satisfied","skipped_removed","superseded_duplicate"].includes(item?.status) ? "completed" : "processing"
    ));
    if (phase === "queued" && Number(item?.next_attempt_ms || 0) > now) return "Waiting to retry";
    if (item?.canonical_confirmed) return "Approved · ledger syncing";
    if (item?.status === "skipped_removed") return "Completed (removed)";
    if (item?.status === "already_satisfied") return "Completed (already approved)";
    if (item?.status === "superseded_duplicate") return "Completed (other batch owns approval)";
    return ({
      queued: "Queued", validating: "Validating", approving: "Approving",
      verifying: "Verifying", completed: "Completed", failed: "Failed",
      processing: "Processing",
    })[phase] || "Processing";
  }

  function factoryLiveCurrent(items) {
    const candidates = Array.isArray(items) ? items : [];
    const running = candidates.find(item => item.status === "processing");
    if (running) return { item: running, isCurrent: true };
    const pending = candidates.find(item => item.status === "pending");
    return pending ? { item: pending, isCurrent: false } : null;
  }

  function factoryLiveItemHtml(item, compact = false, now = Date.now()) {
    const phase = item?.local_preview
      ? (item.phase === "checking_acceptance" ? "Checking server acceptance" : "Submitting")
      : factoryLivePhaseLabel(item, now);
    if (item?.local_preview) return '<span class="factory-live-phase">' + esc(phase) +
      '</span><small class="factory-live-meta">Selected · not yet confirmed by server</small>';
    const running = item?.status === "processing";
    const nextRetry = Number(item?.next_attempt_ms || 0);
    const last = item?.last_progress_at || null;
    const lastMs = Date.parse(String(last || ""));
    const hasLast = Number.isFinite(lastMs);
    const latest = hasLast ? `Last update ${factoryLiveElapsed(last, now)} ago` : "Update time unavailable";
    const elapsed = running && item?.attempt_started_at
      ? ` · Elapsed ${factoryLiveElapsed(item.attempt_started_at, now)}` : "";
    const retry = item?.status === "pending" && nextRetry > now
      ? ` · Retry in ${factoryLiveElapsed(new Date(now - (nextRetry - now)).toISOString(), now)}` : "";
    const attempts = Number(item?.total_attempts || 0);
    const recovery = attempts > 1 && ["processing", "pending"].includes(item?.status)
      ? ` · Recovery attempt ${attempts}` : "";
    const slow = running && hasLast && now - lastMs > 60000
      ? " · No recent progress; recovery may be required" : "";
    const canonical = item?.canonical_confirmed ? " · Confirmed in Supabase" : "";
    return `<span class="factory-live-phase">${esc(phase)}</span>` +
      `<small class="factory-live-meta">${esc(latest + elapsed + retry + recovery + slow + canonical)}</small>`;
  }

  function factoryLiveSummaryHtml(items, now = Date.now()) {
    const selected = factoryLiveCurrent(items);
    if (!selected) return '<span class="factory-live-idle">No output currently processing</span>';
    const { item, isCurrent } = selected;
    const title = item?.output_id ? `Output #${item.output_id}` : "Selected output";
    return `<div class="factory-batch-live-summary">` +
      `<strong>${isCurrent ? "Current" : "Next"}: ${esc(title)}</strong>` +
      factoryLiveItemHtml(item, true, now) + `</div>`;
  }

  // Display-only projection: R2 bookkeeping can be behind the exact original
  // Supabase approval receipt. Never mutate the server job or trigger a retry.
  function factoryBatchDisplayCounts(items) {
    const approved = items.filter(item => item.status === "approved").length;
    const skipped = items.filter(item => [
      "already_satisfied", "skipped_removed", "superseded_duplicate",
    ].includes(item.status)).length;
    const failed = items.filter(item => item.status === "failed").length;
    return {
      approved_count: approved, skipped_count: skipped, failed_count: failed,
      pending_count: Math.max(0, items.length - approved - skipped - failed),
      done_count: approved + skipped + failed,
    };
  }

  function factoryBatchDisplayRow(row) {
    const proof = row?.progress_verification;
    const original = Array.isArray(row?.items) ? row.items : [];
    if (!row?.group || proof?.status !== "verified" ||
        original.length !== Number(row.total)) return row;
    const confirmed = new Set(proof.approved_item_ids || []);
    let awaitingLedger = 0;
    const items = original.map(item => {
      if (!confirmed.has(item.id) || item.status === "approved") return item;
      awaitingLedger++;
      return { ...item, status: "approved", phase: "completed", canonical_confirmed: true };
    });
    if (!awaitingLedger) return row;
    const counts = factoryBatchDisplayCounts(items);
    const children = (row.children || []).map(child => {
      const subset = items.filter(item => item.profile_id === child.profile_id);
      if (subset.length !== Number(child.total)) return child;
      return { ...child, ...factoryBatchDisplayCounts(subset),
        progress_lag: subset.filter(item => item.canonical_confirmed).length };
    });
    return { ...row, items, children, ...counts, progress_lag: awaitingLedger };
  }

  // POST/start_group returns a bare durable group, not the global Active feed
  // envelope. Preserve that original request as a pollable batch immediately:
  // otherwise the exact-ID fast path sees no state.batch.batches and a slow
  // global history discovery can strand visible progress at 0%.
  function factoryBatchActivityEnvelope(batch, profileFilter) {
    // Ordinary Active/Completed feed snapshots must remain untouched, including
    // light-weight rendering/test contexts without an active Factory filter.
    if (!batch?.job_id || Array.isArray(batch.batches)) return batch;
    const effectiveProfileFilter = profileFilter === undefined ? (factoryProfileId() || null) : profileFilter;
    const active = ["queued", "running", "enqueuing"].includes(batch.status)
      || Number(batch.pending_count || 0) > 0 || Number(batch.failed_count || 0) > 0;
    return {
      ...batch, view: "active", filter_profile_id: effectiveProfileFilter, batches: [batch],
      totals: {
        batches: 1, active: active ? 1 : 0,
        approved: Number(batch.approved_count || 0),
        pending: Number(batch.pending_count || 0),
        failed: Number(batch.failed_count || 0),
      },
    };
  }

  function factoryBatchActiveRow(row) {
    return ["queued", "running", "enqueuing"].includes(String(row?.status || "")) ||
      Number(row?.pending_count || 0) > 0 || Number(row?.failed_count || 0) > 0;
  }
  function factoryBatchRecountActive(activity, rows) {
    const batches = rows.slice(0, 40);
    const sum = key => batches.reduce((total, row) => total + Number(row?.[key] || 0), 0);
    return {
      ...activity, batches, totals: {
        ...(activity?.totals || {}), batches: batches.length,
        active: batches.filter(factoryBatchActiveRow).length,
        approved: sum("approved_count"), pending: sum("pending_count"),
        failed: sum("failed_count"),
      },
    };
  }
  // Each accepted POST is one sub-batch. Replacing Activity with its bare group
  // hid earlier accepted groups for selections >20, even while Supabase
  // committed those approvals. Accumulate identity-unique original groups.
  function factoryBatchMergeAcceptedActivity(previous, accepted) {
    const envelope = factoryBatchActivityEnvelope(accepted);
    if (!accepted?.job_id || !Array.isArray(envelope?.batches)) return envelope;
    const prior = previous?.filter_profile_id === envelope.filter_profile_id
      ? (previous.batches || []) : [];
    const rows = [accepted, ...prior.filter(row =>
      row?.request_id !== accepted.request_id && row?.job_id !== accepted.job_id)];
    return factoryBatchRecountActive({ ...previous, ...envelope }, rows);
  }
  // A bounded R2 discovery result is not proof a previously accepted group
  // disappeared; retain its last verified state until exact-ID GET confirms
  // terminal completion. This projection never retries POST or alters R2.
  function factoryBatchMergeDiscoveredActivity(previous, fetched) {
    if (!Array.isArray(fetched?.batches) || fetched?.view !== "active" ||
        previous?.filter_profile_id !== fetched.filter_profile_id) return fetched;
    const prior = new Map((previous.batches || []).map(row =>
      [String(row.request_id || row.job_id || ""), row]));
    // An expensive historical discovery may be older than the exact receipt.
    // It discovers other requests; it never overrides the last exact snapshot
    // of a known request, including a legitimate retry that resets progress.
    const rows = fetched.batches.map(row =>
      prior.get(String(row.request_id || row.job_id || "")) || row);
    const known = new Set(rows.map(row => String(row.request_id || row.job_id || "")));
    const pending = (previous.batches || []).filter(row =>
      row?.request_id && (row.group || row.profile_id) && factoryBatchActiveRow(row) &&
      !known.has(String(row.request_id)));
    return factoryBatchRecountActive(fetched, [...rows, ...pending]);
  }


  // A click is not a server receipt. Show what was selected immediately, then
  // replace it only after authoritative POST/GET acknowledgement of the items.
  function factorySubmissionPreview(cards) {
    const items = cards.map(card => ({
      id: String(card.id), output_id: card.output_id || null,
      profile_id: String(card.profile_id || ""), platform: card.platform || null,
      format: card.studio_output_type || null, title: card.title || null,
      status: "pending", phase: "submitting", local_preview: true,
    }));
    const byProfile = new Map();
    for (const item of items) {
      const existing = byProfile.get(item.profile_id) || [];
      existing.push(item);
      byProfile.set(item.profile_id, existing);
    }
    const children = [...byProfile].map(([profile_id, rows]) => ({
      profile_id, status: "submitting", total: rows.length,
      done_count: 0, approved_count: 0, failed_count: 0, pending_count: rows.length,
    }));
    return {
      preview_only: true, group: true, job_id: "client_" + newFactoryRequestId(),
      request_id: null, status: "submitting", total: items.length,
      done_count: 0, approved_count: 0, failed_count: 0, pending_count: items.length,
      profile_ids: [...byProfile.keys()], items, children,
    };
  }

  function factoryShowSubmissionPreview(cards) {
    if (!cards.length) return;
    state.submissionPreview = factorySubmissionPreview(cards);
    state.completedOpen = false;
    state.activeApprovalsCollapsed = false;
    state.inspectedBatchKey = state.submissionPreview.job_id;
    state.batchDetailsOpen = true;
    renderFactoryBatchActivity(state.batch);
  }

  function factoryDismissSubmissionPreview() {
    if (!state.submissionPreview) return;
    state.submissionPreview = null;
    renderFactoryBatchActivity(state.batch);
  }

  // A multi-group selection can contain both accepted and not-yet-accepted
  // outputs. Remove only authoritative matches to avoid duplicate progress.
  function factoryReconcileSubmissionPreview(serverRows) {
    const preview = state.submissionPreview;
    if (!preview) return null;
    const confirmed = new Set(serverRows.flatMap(row =>
      Array.isArray(row.items) && !row.preview_only ? row.items.map(item => item.id) : []));
    if (!confirmed.size) return preview;
    const remaining = preview.items.filter(item => !confirmed.has(item.id));
    if (remaining.length === preview.items.length) return preview;
    if (!remaining.length) {
      state.submissionPreview = null;
      return null;
    }
    const children = preview.children.map(child => {
      const count = remaining.filter(item => item.profile_id === child.profile_id).length;
      return { ...child, total: count, pending_count: count };
    }).filter(child => child.total > 0);
    state.submissionPreview = {
      ...preview, items: remaining, children, total: remaining.length,
      pending_count: remaining.length, profile_ids: children.map(child => child.profile_id),
    };
    return state.submissionPreview;
  }

  function factoryMarkSubmissionUnconfirmed() {
    if (!state.submissionPreview) return;
    const preview = state.submissionPreview;
    state.submissionPreview = {
      ...preview, status: "awaiting_acceptance",
      items: preview.items.map(item => ({ ...item, phase: "checking_acceptance" })),
    };
    renderFactoryBatchActivity(state.batch);
  }

  function renderFactoryBatchActivity(batch) {
    const snapshot = factoryBatchActivityEnvelope(batch);
    if (snapshot?.view === "completed") state.completedBatch = snapshot;
    else state.batch = snapshot || null;
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
    const serverRows = Array.isArray(viewed?.batches) ? viewed.batches :
      (viewed?.job_id ? [viewed] : []);
    const preview = !state.completedOpen ? factoryReconcileSubmissionPreview(serverRows) : null;
    const batches = [...serverRows, ...(preview ? [preview] : [])].map(factoryBatchDisplayRow);
    const activityUnknown = !state.completedOpen && (
      (!viewed && !preview) ||
      (Boolean(state.batchActivityError) && batches.length === 0));
    // The old metric read state.batch.totals.batches even when an active row
    // was on screen; always derive every number from the SAME visible snapshot.
    const totals = {
      batches: batches.length,
      active: batches.filter(row => ["queued", "running", "enqueuing"].includes(row.status) ||
        Number(row.pending_count || 0) > 0 || Number(row.failed_count || 0) > 0).length,
      approved: batches.reduce((sum, row) => sum + Number(row.approved_count || 0), 0),
      pending: batches.reduce((sum, row) => sum + Number(row.pending_count || 0), 0),
      failed: batches.reduce((sum, row) => sum + Number(row.failed_count || 0), 0),
    };
    if (count) count.textContent = activityUnknown ? "—" : String(state.completedOpen
      ? ((state.batch?.batches || []).filter(row => ["queued","running","enqueuing"].includes(row.status) ||
          Number(row.pending_count || 0) > 0 || Number(row.failed_count || 0) > 0).length)
      : totals.active);
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
    const ledgerLag = batches.reduce((sum, row) => sum + Number(row.progress_lag || 0), 0);
    const verificationUnavailable = batches.some(row => row.group &&
      row.progress_verification?.status === "unavailable");
    summary.textContent = activityUnknown
      ? (state.batchActivityError ? "Approval activity unavailable · retrying automatically"
        : "Loading latest approval activity…")
      : `${totals.active} active · ${totals.approved} approved · ${totals.pending} pending · ${totals.failed} failed`
        + (preview ? " · " + preview.total + " selected output(s) awaiting server acceptance" : "")
        + (ledgerLag ? ` · ${ledgerLag} verified approval(s) syncing to Activity` : "")
        + (verificationUnavailable ? " · Supabase verification unavailable; ledger-only view" : "");
    // Aggregate the selected batch snapshot, not the profile's output queue.
    // Failed/skipped outputs count as processed, never as successfully approved.
    const aggregateTotal = batches.reduce((sum, row) => sum + Math.max(0, Number(row.total) || 0), 0);
    const aggregateDone = batches.reduce((sum, row) => {
      const total = Math.max(0, Number(row.total) || 0);
      const pending = Math.max(0, Number(row.pending_count) || 0);
      return sum + Math.min(total, Math.max(0, Number(row.done_count ?? (total - pending)) || 0));
    }, 0);
    const aggregatePercent = aggregateTotal ? Math.round(100 * aggregateDone / aggregateTotal) : 0;
    let overall = $("factoryBatchOverallProgress");
    if (!overall) {
      overall = document.createElement("div");
      overall.id = "factoryBatchOverallProgress";
      overall.className = "factory-batch-overall-progress";
      summary.insertAdjacentElement("afterend", overall);
    }
    // A terminal 100% receipt is still useful until the next completed-history
    // reconciliation. Do not hide the bar at the exact moment the last item finishes.
    overall.hidden = !batches.length;
    overall.innerHTML = `<div class="factory-batch-progress-label"><strong>${state.completedOpen ? "Completed batch history" : totals.active ? "Overall active approval progress" : "Latest completed submission"}</strong><span>${aggregateDone} of ${aggregateTotal} processed · ${aggregatePercent}%</span></div>
      <progress max="${aggregateTotal || 1}" value="${aggregateDone}" aria-label="Overall approval batch processing progress">${aggregatePercent}%</progress>
      <small>${Number(totals.approved)||0} approved · ${Number(totals.pending)||0} pending · ${Number(totals.failed)||0} failed</small>
      ${factoryLiveSummaryHtml(batches.flatMap(row => row.items || []))}`;
    if (updated && state.completedOpen) updated.textContent =
      state.completedLoading ? "Loading completed batches…" : "Loaded only on request";
    else updateFactoryBatchFreshness();
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
        const stateLabel = row.preview_only
          ? (row.status === "awaiting_acceptance" ? "Checking acceptance" : "Submitting")
          : row.progress_lag ? "Syncing approvals" :
            active ? "Processing" : row.failed_count ? "Needs attention" : "Completed";
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
          ${factoryLiveSummaryHtml(row.items || [])}
          <span class="factory-batch-progress-caption">${completed} of ${Number(row.total)||0} processed · ${percent}%</span>
          <progress class="factory-batch-row-progress" max="${Number(row.total)||1}" value="${Math.min(Math.max(0,completed),Number(row.total)||1)}" aria-label="${esc(label)} processing progress">${percent}%</progress>
        </button>`;
      }).join("")
      : '<p class="subtle">' + (state.completedOpen
        ? (state.completedLoading ? "Loading completed batches…" : "No completed batches in this page.")
        : activityUnknown
          ? (state.batchActivityError
            ? "Approval history could not be verified. This is not an all-clear; original saved request IDs are checked automatically."
            : "Checking approval activity…")
          : "No active approval batches. All clear.") + '</p>';
    if (inspect) {
      inspect.hidden = !latest || listCollapsed;
      inspect.setAttribute("aria-expanded", String(state.batchDetailsOpen));
    }
    if (retry) {
      retry.hidden = listCollapsed || !(latest?.failed_count > 0 && latest?.can_retry);
      retry.disabled = state.submittingBatch;
      retry.textContent = state.submittingBatch ? "Checking retry…" : "Retry Failed";
    }
    details.hidden = listCollapsed || !state.batchDetailsOpen || !latest;
    const items = Array.isArray(latest?.items) ? latest.items : [];
    const children = Array.isArray(latest?.children) ? latest.children : [];
    const childrenHtml = children.length ? `<div class="factory-batch-child-grid">${children.map(child => {
      const done = Number(child.done_count ?? (Number(child.total||0)-Number(child.pending_count||0)));
      const percent = child.total ? Math.round(100*done/child.total) : 0;
      return `<section class="factory-batch-child">
        <strong>${esc(factoryProfileLabel(child.profile_id))}</strong>
        <span>${esc(child.progress_lag ? "Syncing approvals" :
          ["queued","running","enqueuing","missing"].includes(child.status) ? "Processing" :
          child.failed_count ? "Needs attention" : "Completed")}</span>
        <progress max="${Number(child.total)||1}" value="${done}">${percent}%</progress>
        <small>${Number(child.approved_count)||0} approved · ${Number(child.pending_count)||0} pending · ${Number(child.failed_count)||0} failed</small>
        ${factoryLiveSummaryHtml(items.filter(item => item.profile_id === child.profile_id))}
      </section>`;
    }).join("")}</div>` : "";
    const retryNotice = state.retryBatchNotice?.job_id === latest?.job_id ? state.retryBatchNotice : null;
    const failedItems = items.filter(item => item.status === "failed" || item.error && !["approved", "already_satisfied"].includes(item.status));
    details.innerHTML = latest ? `${retryNotice ? '<p class="factory-batch-retry-result" role="status">' + esc(retryNotice.message) + '</p>' : ""}
      ${failedItems.length ? '<section class="factory-batch-failed-details"><strong>Failed outputs (' + failedItems.length + ')</strong><ul>' +
        failedItems.map(item => '<li><strong>' + esc(item.title || "Output " + item.output_id) + '</strong> · ' +
          esc(factoryProfileLabel(item.profile_id)) + ' · Output ' + esc(item.output_id || item.id) +
          '<p>' + esc(item.error || "No error details were returned.") + '</p>' +
          (item.previous_failure_error ? '<small>Previous failure: ' + esc(item.previous_failure_error) + '</small>' : '') +
          '</li>').join('') + '</ul><p>Retry only after checking the failure. A retry is not proof of success.</p></section>' : ""}
      <div class="factory-batch-inspect-heading">
        <strong>${esc(latest.group ? "Global approval · per-profile progress" : factoryProfileLabel(latest.profile_id))}</strong>
        <span>${Number(latest.done_count)||0} / ${Number(latest.total)||0} processed</span>
      </div>
      ${childrenHtml}
      <ul class="factory-batch-item-list">${items.map(item =>
        `<li><strong>${esc(item.title || [item.platform, item.format].filter(Boolean).join(" ") || "Output")}</strong>
        <span>${esc(item.output_id ? `Output #${item.output_id}` : "Output")} · ${esc(item.profile_id ? factoryProfileLabel(item.profile_id)+" · " : "")}${factoryLiveItemHtml(item)}</span>
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

  function factoryActivityProvesPlanMissing(activity, plan) {
    return activity?.ok === true
      && String(activity.exact_request_id || "") === String(plan?.request_id || "")
      && Array.isArray(activity.batches)
      && activity.batches.length === 0;
  }

  function clearAuthoritativelyMissingGlobalPlans(requestIds, now = Date.now()) {
    const pending = pendingFactoryApproval();
    const savedAt = Number(pending?.saved_ms || 0);
    if (pending?.profile_id !== "global" || !Array.isArray(pending.batches)
        || !requestIds?.size || !Number.isFinite(savedAt)
        || now - savedAt < FACTORY_PENDING_MISSING_GRACE_MS) return 0;
    const remaining = pending.batches.filter((plan) => !requestIds.has(String(plan?.request_id || "")));
    const removed = pending.batches.length - remaining.length;
    if (!removed) return 0;
    try {
      if (remaining.length) {
        localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify({
          ...pending,
          profile_id: "global",
          ids: remaining.flatMap((row) => row.ids || []),
          batches: remaining,
          saved_ms: savedAt,
        }));
      } else {
        localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY);
      }
    } catch { return 0; }
    if (!pendingFactoryApproval()) setBatchSubmissionError(null);
    setStatus("Cleared an expired submission that Factory confirmed was never created. Your current selection is ready to submit.");
    return removed;
  }

  function reconcilePendingGlobalSelection(activity) {
    if (state.submittingBatch) return 0;
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
          ...pending,
          profile_id: "global",
          ids: remaining.flatMap((row) => row.ids || []),
          batches: remaining,
          saved_ms: Number(pending.saved_ms || Date.now()),
        }));
      } else {
        localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY);
      }
    } catch {}
    if (!pendingFactoryApproval()) {
      setBatchSubmissionError(null);
      setStatus("Previous Factory request verified in batch history. No duplicate approval was submitted.");
    }
    if (state.desk) renderDesk(state.desk);
    updateFactoryBatchToolbar();
    return recovered;
  }

  let factoryPendingReconcileAt = 0;
  let factoryPendingReconcileRunning = false;
  async function reconcilePersistedFactoryPending(force = false) {
    if (state.submittingBatch) return;
    if (factoryPendingReconcileRunning) {
      if (force) state.factoryRecoveryRequested = true;
      return;
    }
    if (!force && Date.now() - factoryPendingReconcileAt < 15000) return;
    factoryPendingReconcileAt = Date.now();
    factoryPendingReconcileRunning = true;
    try {
      archiveFactoryPending();
      // Flood/deleted IDs already stamped with an unrecoverable last_error must
      // leave the browser queue before any network reconcile. Otherwise the
      // toolbar keeps "N awaiting server acceptance" and a later RFR selection
      // looks permanently stuck even when Clear/Submit should work.
      const droppedPoison = clearFactoryRecoveryFences({ onlyUnrecoverable: true });
      if (droppedPoison) {
        setBatchSubmissionError(null);
        setStatus(`Resolved ${droppedPoison} saved Factory submission${droppedPoison === 1 ? "" : "s"} rejected before acceptance. Unapproved outputs are visible in Needs Eyes again.`);
        if (state.desk) renderDesk(state.desk);
      }
      pruneFactorySelectionToNeedsEyes();
      // Independent of Desk/Activity success; one failed request cannot starve others.
      const entries = factoryRecoveryEntries().sort((a,b) =>
        Number((b.saved.ids || []).some(id => state.selectedOutputs.has(id))) -
        Number((a.saved.ids || []).some(id => state.selectedOutputs.has(id))));
      for (const { key, saved } of entries) {
        let result;
        try { result = await reconcileFactorySubmissionFence(saved, key); }
        catch (error) { result = {resolved:false,message:String(error.message || error)}; }
        if (result?.dropped) {
          if (result.message) setStatus(result.message);
          if (state.desk) renderDesk(state.desk);
          continue;
        }
        const touchesSelection = (saved.ids || []).some(id => state.selectedOutputs.has(id));
        if (!result?.resolved && result?.message && factoryTerminalEligibilityError(result.message)) {
          dropFactoryRecoveryEntry(key, saved,
            "Output already left Ready for Review (" + result.message
            + "). Removed from the browser approval queue so other selections can submit.");
          continue;
        }
        if (!result?.resolved && result?.message && factoryUnrecoverableSubmitError(result.message)) {
          dropFactoryRecoveryEntry(key, saved,
            "Saved approval referenced outputs that are gone from Airtable (" + result.message
            + "). Cleared the browser queue so your current Ready for Review selection can submit.");
          continue;
        }
        if (!result?.resolved && result?.message && touchesSelection) {
          const message = "Submission not accepted yet: " + result.message;
          setBatchSubmissionError(message);
          setStatus(message, true);
        }
      }
      // A past failed recovery must not keep painting after the operator moves on.
      if (state.batchSubmissionError && !factoryRecoveryEntries().some(({ saved }) =>
        (saved.ids || []).some((id) => state.selectedOutputs.has(id)))) {
        setBatchSubmissionError(null);
      }
    } finally {
      factoryPendingReconcileRunning = false;
      updateFactoryBatchToolbar();
    }
    if (state.factoryRecoveryRequested) {
      state.factoryRecoveryRequested = false;
      return reconcilePersistedFactoryPending(true);
    }
    const waiting = waitingFactorySelection().filter(id => state.selectedOutputs.has(id));
    localStorage.setItem(FACTORY_WAITING_SELECTION_KEY, JSON.stringify(waiting));
    const recovering = factoryRecoveringIds();
    const eligible = new Set(readyFactoryOutputs(true).map(card => card.id));
    const available = waiting.filter(id => !recovering.has(id) && eligible.has(id) && state.selectedOutputs.has(id));
    if (available.length && !state.submittingBatch) await submitFactoryBatchApprovals(available);
  }

  function factorySavedPayloadMatchesPlan(saved, plan) {
    const payload = plan?.payload;
    return saved.auto_retry === true && payload?.action === "start_group"
      && payload.request_id === plan.request_id
      && Array.isArray(payload.record_ids) && Array.isArray(plan.ids)
      && JSON.stringify([...payload.record_ids].sort()) === JSON.stringify([...plan.ids].sort());
  }
  async function retrySavedFactoryPlan(saved, recoveryKey, plan) {
    if (!factorySavedPayloadMatchesPlan(saved, plan)) return null;
    if (saved.retry_blocked || Number(saved.next_retry_ms || 0) > Date.now()) return null;
    // Persist retry timing before the POST. Never discard or replace the original
    // idempotency key merely because its parent ledger was not created yet.
    saved.attempts = Number(saved.attempts || 0) + 1;
    saved.next_retry_ms = Date.now() + Math.min(60000, 15000 * saved.attempts);
    localStorage.setItem(recoveryKey, JSON.stringify(saved));
    try {
      const result = await fetchJson("/api/factory/approval-batches", {
        method: "POST", body: JSON.stringify(plan.payload),
      });
      const actual = (result.items || []).map(item => String(item.id)).sort();
      const expected = plan.ids.map(String).sort();
      if (result.accepted !== true || JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error("Factory has not returned a complete receipt for this saved selection.");
      }
      return result;
    } catch (error) {
      saved.last_error = String(error.message || error);
      saved.retry_blocked = [400, 401, 403, 409, 422].includes(Number(error.status));
      saved.next_retry_ms = Math.max(saved.next_retry_ms, Date.now() + Number(error.retryAfterSeconds || 0) * 1000);
      if (factoryTerminalEligibilityError(saved.last_error)
          || factoryUnrecoverableSubmitError(saved.last_error)) {
        saved.terminal_eligibility = true;
      }
      localStorage.setItem(recoveryKey, JSON.stringify(saved));
      return null;
    }
  }

  // Exact-ID recovery for interrupted global *and* legacy profile-local approvals.
  // Never infer durable absence from an empty Active Activity list.
  async function reconcileFactorySubmissionFence(saved = pendingFactoryApproval(), recoveryKey = FACTORY_PENDING_REQUEST_KEY) {
    if (!saved) {
      setBatchSubmissionError(null);
      setStatus("No saved approval request remains. Review the current selection before submitting.");
      updateFactoryBatchToolbar();
      return { resolved: true, count: 0 };
    }
    const isGlobal = saved.profile_id === "global";
    const isLocal = /^rec[A-Za-z0-9]+$/.test(String(saved.profile_id || ""));
    const plans = isGlobal && Array.isArray(saved.batches) ? saved.batches
      : isLocal ? [{ request_id: saved.request_id, ids: saved.ids }] : [];
    if (!plans.length || plans.some(plan =>
        !/^[A-Za-z0-9_-]{12,128}$/.test(String(plan?.request_id || ""))
        || !Array.isArray(plan.ids) || !plan.ids.length
        || plan.ids.some(id => !/^rec[A-Za-z0-9]+$/.test(String(id))))) {
      return { resolved: false, message: "Saved Factory approval identity is incomplete. Do not clear browser data or retry blindly." };
    }
    const ageMs = Date.now() - Number(saved.saved_ms || 0);
    const graceExpired = Number(saved.saved_ms) > 0
      && ageMs >= FACTORY_PENDING_MISSING_GRACE_MS;
    const committed = [];
    for (const plan of plans) {
      const requestId = String(plan.request_id);
      const url = isGlobal
        ? "/api/factory/approval-batches?scope=all&request_id=" + encodeURIComponent(requestId)
        : "/api/factory/approval-batches?profile=" + encodeURIComponent(saved.profile_id)
          + "&request_id=" + encodeURIComponent(requestId);
      let status;
      try { status = await fetchJson(url, { cache: "no-store" }); }
      catch (error) {
        return { resolved: false, message: "Saved approval " + requestId
          + " could not be verified (" + (error?.message || error) + "). Automatic verification will retry." };
      }
      if (status?.ok !== true) {
        return { resolved: false, message: "Authoritative status for saved approval " + requestId
          + " is unavailable. Existing request ID is preserved." };
      }
      const row = isGlobal ? factoryActivityMatchesPlan(status, plan)
        : (status.job_id ? status : null);
      if (row) {
        const actual = (Array.isArray(row.items) ? row.items : []).map(item => String(item.id)).sort();
        const expected = plan.ids.map(String).sort();
        const identityOk = isGlobal
          ? status.exact_request_id === requestId
          : String(row.request_id || "") === requestId
            && String(row.profile_id || "") === String(saved.profile_id)
            && String(row.job_id || "") === "fb_" + requestId;
        if (!identityOk || actual.length !== expected.length
            || !actual.every((id, index) => id === expected[index])) {
          return { resolved: false, message: "Saved approval " + requestId
            + " has a different profile or output set on the server. No replacement request was submitted." };
        }
        committed.push(...plan.ids);
      } else {
        const verifiedMissing = isGlobal
          ? factoryActivityProvesPlanMissing(status, plan)
          : status.batch === true && status.status === "idle"
            && status.job_id == null;
        if (!verifiedMissing) {
          return { resolved: false, message: "Saved approval " + requestId
            + " cannot yet be reconciled. Automatic verification will retry." };
        }
        if (factorySavedPayloadMatchesPlan(saved, plan)) {
          const accepted = await retrySavedFactoryPlan(saved, recoveryKey, plan);
          if (!accepted) {
            const failure = saved.last_error || "Submission is saved and will retry automatically.";
            if (saved.terminal_eligibility || factoryTerminalEligibilityError(failure)
              || factoryUnrecoverableSubmitError(failure)) {
              return dropFactoryRecoveryEntry(recoveryKey, saved,
                factoryUnrecoverableSubmitError(failure)
                  ? ("Saved approval referenced outputs that are gone from Airtable (" + failure
                    + "). Cleared the browser queue so your current Ready for Review selection can submit.")
                  : ("Output already left Ready for Review (" + failure
                    + "). Removed from the browser approval queue so other selections can submit."));
            }
            return { resolved: false, message: failure };
          }
          committed.push(...plan.ids);
          continue;
        }
        if (saved.terminal_eligibility || factoryTerminalEligibilityError(saved.last_error)
            || factoryUnrecoverableSubmitError(saved.last_error)) {
          return dropFactoryRecoveryEntry(recoveryKey, saved,
            factoryUnrecoverableSubmitError(saved.last_error)
              ? ("Saved approval referenced outputs that are gone from Airtable ("
                + (saved.last_error || "missing")
                + "). Cleared the browser queue so your current Ready for Review selection can submit.")
              : ("Output already left Ready for Review (" + (saved.last_error || "past_review")
                + "). Removed from the browser approval queue so other selections can submit."));
        }
        if (!graceExpired) {
          return { resolved: false, message: "Saved approval " + requestId
            + " is within its 90-second commit window. Automatic verification will retry shortly." };
        }
      }
    }
    // Do not erase a request changed by another tab while exact-ID reads ran.
    if (JSON.stringify(saved) !== localStorage.getItem(recoveryKey)) {
      return { resolved: false, message: "Saved submission changed during recovery. Refresh Activity first." };
    }
    try { localStorage.removeItem(recoveryKey); }
    catch {
      return { resolved: false, message: "The previous request was verified, but its browser lock could not be released." };
    }
    if (committed.length) {
      rememberFactoryAccepted(committed);
      committed.forEach(id => state.selectedOutputs.delete(id));
      saveFactorySelection();
    }
    if (!factoryRecoveryEntries().length) setBatchSubmissionError(null);
    if (state.desk) renderDesk(state.desk);
    updateFactoryBatchToolbar();
    const message = committed.length
      ? "Verified " + committed.length + " previously submitted outputs. Their original batches remain in history."
      : "Verified saved approval was never created; submission is unblocked.";
    setStatus(message);
    return { resolved: true, count: committed.length, message };
  }

  let factoryPolicyRequest = null;
  let factoryPolicyLoadedAt = 0;
  async function refreshFactoryApprovalPolicy() {
    if (factoryPolicyLoadedAt && Date.now() - factoryPolicyLoadedAt < 30000) return;
    if (factoryPolicyRequest) return factoryPolicyRequest;
    factoryPolicyRequest = (async () => {
      // Submission routing must never depend on scanning historical batches.
      const policy = await fetchJson("/api/factory/approval-batches?scope=all&status_only=1", { cache: "no-store" });
      if (policy.ok !== true || typeof policy.approvals_enabled !== "boolean") {
        throw new Error("Factory approval configuration is unavailable; your selection is saved.");
      }
      state.batchApprovalsEnabled = policy.approvals_enabled;
      state.batchRollout = policy.rollout || null;
      state.batchGlobal = policy.global_rollout || null;
      factoryPolicyLoadedAt = Date.now();
      if (state.desk) renderDesk(state.desk);
      updateFactoryBatchToolbar();
    })();
    try { return await factoryPolicyRequest; }
    finally { factoryPolicyRequest = null; }
  }

  function factoryBatchMergeExactActivity(previous, refreshed) {
    const byId = new Map(refreshed.map(row => [row.request_id, row]));
    const prior = previous?.batches || [];
    const known = new Set(prior.map(row => row.request_id));
    // Original-request GETs are authoritative even when processed counts go
    // backwards during a verified failed-only retry. Never suppress that reset.
    const batches = [...prior.map(row => byId.get(row.request_id) || row),
      ...refreshed.filter(row => !known.has(row.request_id))];
    // Show the exact verified terminal completion once before the next
    // full Active discovery removes it. Otherwise the user never sees 4/4.
    // Clean terminal groups are not polled again and move to Completed history.
    const base = previous || {
      ok: true, scope: "all", view: "active", filter_profile_id: factoryProfileId() || null,
      totals: {}, batches: [],
    };
    return factoryBatchRecountActive({
      ...base, ...(batches[0] || {}),
      quality_signals: batches.flatMap(row => row.quality_signals || []),
    }, batches);
  }
  // Fairly poll all accepted groups, four exact read-only GETs per refresh.
  // Without rotation, >80 outputs could strand later groups indefinitely.
  function factoryBatchPollWindow(groups, cursor = 0, limit = 4) {
    if (!groups.length) return { groups: [], next: 0 };
    const start = Math.max(0, Number(cursor) || 0) % groups.length;
    return {
      groups: [...groups.slice(start), ...groups.slice(0, start)].slice(0, limit),
      next: (start + Math.min(groups.length, limit)) % groups.length,
    };
  }

  function factoryBatchPreferExactProgress(groupCount, lastFullFetchMs, now, force) {
    // Known original requests take priority over expensive historical scans.
    return groupCount > 0;
  }

  // Slow global R2 history discovery must never suppress already-known exact
  // approval requests. Preserve every original request ID and fail closed if
  // neither authoritative GET succeeds; do not retry POST or mutate ledger.
  async function factoryBatchPollWithFallback({ preferExact, hasKnownGroups, readExact, readFull }) {
    if (preferExact) return readExact();
    try { return await readFull(); }
    catch (error) {
      if (!hasKnownGroups) throw error;
      return readExact();
    }
  }

  // The first exact status read is independent of an already-running slow
  // global history scan. A 12-second R2 discovery must not delay the first
  // server-confirmed progress after Submit. GET-only; no approval mutation.
  async function refreshFactoryAcceptedReceipt(accepted) {
    if (!accepted?.job_id || !accepted?.request_id) return null;
    const profileAtStart = factoryProfileId();
    const params = new URLSearchParams({
      request_id: String(accepted.request_id), fresh: String(Date.now()),
    });
    if (accepted.group === true) params.set("scope", "all");
    else if (/^rec[A-Za-z0-9]+$/.test(String(accepted.profile_id || ""))) {
      params.set("content_profile_id", accepted.profile_id);
    } else return null;
    try {
      const value = await fetchJson(`/api/factory/approval-batches?${params.toString()}`, {
        cache: "no-store", timeoutMs: 12000,
      });
      const row = accepted.group
        ? (value?.ok === true && value.batches?.length === 1 ? value.batches[0] : null)
        : value;
      if (row?.job_id !== accepted.job_id || row?.request_id !== accepted.request_id ||
          (!accepted.group && row?.profile_id !== accepted.profile_id)) {
        throw new Error("Original Factory receipt is not yet available");
      }
      if (factoryProfileId() !== profileAtStart) return null;
      // The first-receipt GET can complete after a newer ordinary exact GET.
      // It is for initial acceptance only (never retry); don't repaint 0%
      // over an already verified later result from the same request.
      const existing = (state.batch?.batches || []).find(item =>
        item?.request_id === accepted.request_id);
      const done = item => Number(item?.done_count ??
        (Number(item?.total || 0) - Number(item?.pending_count || 0)));
      if (existing && done(existing) > done(row)) return state.batch;
      const progress = factoryBatchMergeExactActivity(state.batch, [row]);
      state.lastBatchSuccessMs = Date.now();
      state.lastBatchFetchMs = Date.now();
      state.batchActivityError = "";
      state.batchActivityPartialError = "";
      renderFactoryBatchActivity(progress);
      document.dispatchEvent(new CustomEvent("factory:batch-status", {detail: progress}));
      return progress;
    } catch (error) {
      // Continue ordinary polling. This does not mean the submission failed.
      state.batchActivityPartialError = "First exact receipt delayed; auto-refreshing";
      updateFactoryBatchFreshness();
      return null;
    }
  }

  async function refreshFactoryBatchActivity(force = false) {
    if (state.batchActivityLoading) {
      if (force) state.batchRefreshRequested = true;
      return state.batch;
    }
    const now = Date.now();
    const hasPendingWork = Number(state.batch?.totals?.pending || 0) > 0 ||
      (state.batch?.batches || []).some(row => Number(row.pending_count || 0) > 0 ||
        ["queued", "running", "enqueuing"].includes(row.status));
    const minInterval = hasPendingWork ? 3000 : 15000;
    if (!force && state.batch && now - state.lastBatchFetchMs < minInterval) return state.batch;
    const params = new URLSearchParams({ scope: "all" });
    params.set("view", "active");
    if (factoryProfileId()) params.set("factory_profile", factoryProfileId());
    state.batchActivityLoading = true;
    try {
      const previousActive = (state.batch?.batches || []).filter(row => row?.job_id);
      // Frequent full-history scans can exceed the 12-second poll budget.
      // Once discovered, re-read at most four exact global groups from R2
      // every 3 seconds; run the complete active discovery at least every 18s.
      // No POST, approval, scheduling, publishing, or claim mutation occurs.
      const filterId = factoryProfileId() || null;
      const knownGroups = state.batch?.filter_profile_id === filterId
        ? (state.batch?.batches || []).filter(row => row.request_id &&
            (row.group || row.profile_id) && factoryBatchActiveRow(row)) : [];
      const knownIds = new Set(knownGroups.map(row => row.request_id));
      // After reload there may be no state.batch yet. An accepted group is
      // recoverable from the same original R2 request without re-submitting.
      // Unacknowledged saved requests are eligible for GET-only exact recovery
      // even if the submission POST timed out before an accepted receipt.
      const pendingExact = factoryPendingExactCandidates(
        pendingFactoryApproval(), factoryRecoveryEntries());
      const remembered = [...new Map([
        ...pendingExact, ...recentFactoryGroupRequests(),
      ].filter(row => (!filterId || row.profiles.includes(filterId)) &&
        !knownIds.has(row.request_id)).map(row => [row.request_id, row])).values()]
        .map(row => ({ group: row.group !== false, request_id: row.request_id,
          profile_id: row.profile_id || row.profiles[0] || null,
          unconfirmed: row.unconfirmed === true,
          expected_ids: row.expected_ids || null }));
      const window = factoryBatchPollWindow([...knownGroups, ...remembered],
        state.batchPollCursor || 0, 4);
      const fastGroups = window.groups;
      state.batchPollCursor = window.next;
      // A just-accepted group has not had a successful global discovery yet.
      // Exact original-request polling must work immediately and during full
      // active-history timeouts. It is always GET-only and identity checked.
      const preferExact = factoryBatchPreferExactProgress(fastGroups.length,
        state.lastBatchFullFetchMs, now, force);
      const readExact = async () => {
        const outcomes = await Promise.allSettled(fastGroups.map(async row => {
          const exactParams = new URLSearchParams({
            request_id: row.request_id, fresh: String(now),
          });
          if (row.group) exactParams.set("scope", "all");
          else exactParams.set("content_profile_id", row.profile_id);
          const value = await fetchJson(`/api/factory/approval-batches?${exactParams.toString()}`, {
            cache: "no-store", timeoutMs: 12000,
          });
          const verifiedRow = row.group ? (
            value?.ok === true && value.batches?.length === 1 ? value.batches[0] : null
          ) : value;
          if (verifiedRow?.request_id !== row.request_id ||
              (row.job_id && verifiedRow.job_id !== row.job_id) ||
              (!row.group && verifiedRow.profile_id !== row.profile_id)) {
            throw new Error("Exact Factory progress is unavailable; retaining prior snapshot");
          }
          // A saved-but-unacknowledged POST cannot become a confirmed UI row
          // unless the exact canonical output set matches its original plan.
          if (row.unconfirmed) {
            const actual = (verifiedRow.items || []).map(item => String(item.id)).sort();
            const expected = row.expected_ids || [];
            if (actual.length !== expected.length ||
                actual.some((id, index) => id !== expected[index])) {
              throw new Error("Saved Factory request identity mismatch; no approval was repeated");
            }
          }
          // Paint each completed GET as it arrives; one slow sibling status
          // cannot postpone another approved output until the 12s timeout.
          // Normalize blank All-Profiles filter to null, matching filterId.
          // A raw ""===null comparison skipped every incremental repaint on
          // the default global Factory view until the slowest GET had finished.
          if ((factoryProfileId() || null) === filterId) {
            const incremental = factoryBatchMergeExactActivity(state.batch, [verifiedRow]);
            state.lastBatchSuccessMs = Date.now();
            state.batchActivityError = "";
            renderFactoryBatchActivity(incremental);
            document.dispatchEvent(new CustomEvent("factory:batch-status", { detail: incremental }));
          }
          return verifiedRow;
        }));
        const updates = outcomes.filter(row => row.status === "fulfilled").map(row => row.value);
        const missing = outcomes.length - updates.length;
        state.batchActivityPartialError = missing
          ? String(missing) + " batch status request(s) delayed" : "";
        if (!updates.length) {
          throw outcomes.find(row => row.status === "rejected")?.reason ||
            new Error("Factory activity status is temporarily unavailable");
        }
        // Only a verified terminal clean group is forgotten. Failed groups
        // remain visible for explicit exception handling.
        forgetFactoryGroupRequests(updates.filter(row => row.status === "completed" &&
          !Number(row.pending_count || 0) && !Number(row.failed_count || 0))
          .map(row => row.request_id));
        return factoryBatchMergeExactActivity(state.batch, updates);
      };
      const readFull = async () => {
        const value = await fetchJson(`/api/factory/approval-batches?${params.toString()}&fresh=${now}`, {
          cache: "no-store", timeoutMs: 12000,
        });
        if (value?.ok === false || !Array.isArray(value?.batches)) {
          throw new Error("Approval activity response was incomplete");
        }
        state.lastBatchFullFetchMs = Date.now();
        return factoryBatchMergeDiscoveredActivity(state.batch, value);
      };
      const fetched = await factoryBatchPollWithFallback({
        preferExact, hasKnownGroups: fastGroups.length > 0, readExact, readFull,
      });
      if (!fastGroups.length) state.batchActivityPartialError = "";
      if (fetched?.ok === false || !Array.isArray(fetched?.batches)) {
        throw new Error("Approval activity response was incomplete");
      }
      if (factoryProfileId() !== (params.get("factory_profile") || "")) return state.batch;
      state.lastBatchSuccessMs = Date.now();
      state.batchActivityError = "";
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
        if ("rollout" in batch) state.batchRollout = batch.rollout || null;
        // quality_only / exact-id activity payloads omit global_rollout; do not
        // wipe an already-loaded Global Factory policy and block Submit Approvals.
        if ("global_rollout" in batch) state.batchGlobal = batch.global_rollout || null;
        updateFactoryBatchToolbar();
        if (state.desk && before !== JSON.stringify([state.batchRollout,state.batchGlobal])) renderDesk(state.desk);
      }
      const hiddenBefore = [...factorySubmittedApprovalIds()].sort().join("|");
      renderFactoryBatchActivity(batch);
      reconcilePendingGlobalSelection(batch);
      if (state.desk && hiddenBefore !== [...factorySubmittedApprovalIds()].sort().join("|")) {
        renderDesk(state.desk);
      }
      document.dispatchEvent(new CustomEvent("factory:batch-status", { detail: batch }));
      reconcileFinishedBatchDesk(batch?.batches?.[0] || batch).catch(() => {});
      reconcilePersistedFactoryPending().catch(() => {});
      // At most one slower discovery every 60 seconds, separate from exact
      // status reads. It must not block the current submission's updates.
      const discoveryAge = now - Math.max(
        state.lastBatchFullFetchMs || 0, state.batchDiscoveryStartedMs || 0);
      if (fastGroups.length && discoveryAge >= 60000 && !state.batchDiscoveryLoading) {
        // Throttle attempts, not just successes: a failed R2 global scan must
        // not be retried every 3 seconds under a database/memory incident.
        state.batchDiscoveryStartedMs = now;
        state.batchDiscoveryLoading = true;
        const discoveryProfile = params.get("factory_profile") || "";
        readFull().then(discovered => {
          if (factoryProfileId() !== discoveryProfile) return;
          const rebased = factoryBatchMergeDiscoveredActivity(state.batch, discovered);
          renderFactoryBatchActivity(rebased);
          document.dispatchEvent(new CustomEvent("factory:batch-status", { detail: rebased }));
        }).catch(() => {
          // Historical discovery failure is not a failed exact status read.
        }).finally(() => { state.batchDiscoveryLoading = false; });
      }
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
      state.batchActivityError = String(error?.message || error);
      // Keep the last verified counts and bars. A timed-out read is not
      // evidence that approvals stopped or that a batch disappeared.
      if (!state.batch && !state.submissionPreview) renderFactoryBatchActivity(null);
      else updateFactoryBatchFreshness();
      return null;
    } finally {
      state.batchActivityLoading = false;
      if (state.batchRefreshRequested) {
        state.batchRefreshRequested = false;
        Promise.resolve().then(() => refreshFactoryBatchActivity(true).catch(() => {}));
      }
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
    let selectionIds = ready.map(card => card.id);
    const planned = planFactoryApprovalBatches(ready, maxTotal, maxPerProfile).map((batch) => {
      const request_id = newFactoryRequestId();
      const ids = batch.map(card => card.id);
      return { ids, request_id, payload: {
        action: "start_group", request_id, record_ids: ids,
        notes: "Studio Factory Batch Approval",
        items: batch.map(card => ({ id: card.id, output_id: card.output_id || null,
          title: card.title || null, content_id: card.content_id || null,
          profile_id: card.profile_id || null, platform: card.platform || null,
          format: card.studio_output_type || null })),
      }};
    });
    const byId = new Map(ready.map((card) => [card.id, card]));
    const persistRemaining = (rows) => {
      if (!rows.length) {
        try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
        return;
      }
      const ids = rows.flatMap((row) => row.ids);
      localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify({
        profile_id: "global", ids, batches: rows, saved_ms: Date.now(), auto_retry: true,
      }));
    };
    persistRemaining(planned);
    setBatchSubmissionError(null);
    state.submittingBatch = true;
    state.submittingOutputIds = new Set(selectionIds);
    let acceptedOutputs = 0;
    let acceptedBatches = 0;
    try {
      setStatus(`Submitting ${ready.length} outputs…`);
      updateFactoryBatchToolbar();
      if (state.desk) renderDesk(state.desk);
      for (let index = 0; index < planned.length; index++) {
        const plan = planned[index];
        const chunk = plan.ids.map((id) => byId.get(id)).filter(Boolean);
        if (chunk.length !== plan.ids.length) throw new Error("Factory selection changed before all batches were submitted.");
        const profiles = [...new Set(chunk.map((card) => String(card.profile_id || "").trim()))];
        const requestBody = JSON.stringify(plan.payload);
        const submitPlan = () => fetchJson("/api/factory/approval-batches", {
          method: "POST", body: requestBody,
        });
        // One bounded foreground POST. A timeout or busy response moves the
        // saved envelope to background recovery, keeping other selections usable.
        const batch = await submitPlan();
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
        rememberFactoryGroupRequest(batch);
        state.inspectedBatchKey = batch.job_id;
        renderFactoryBatchActivity(factoryBatchMergeAcceptedActivity(state.batch, batch));
        refreshFactoryAcceptedReceipt(batch).catch(() => {});
        refreshFactoryBatchActivity(true).catch(() => {});
        setStatus(batch.duplicate_prevented
          ? `These outputs were already submitted. Original batch restored; no duplicate created. ${acceptedOutputs} of ${ready.length} reconciled.`
          : batch.recovered_after_error
            ? `Recovered a confirmed server submission after a connection error. Accepted ${acceptedOutputs} of ${ready.length} outputs; continuing automatically.`
            : `Accepted ${acceptedOutputs} of ${ready.length} outputs in ${acceptedBatches} batch${acceptedBatches === 1 ? "" : "es"}. Server processing continues in the background.`);
      }
      if (state.desk) renderDesk(state.desk);
      closeFactoryPreview();
      setBatchSubmissionError(null);
      setStatus(`All ${ready.length} outputs accepted as ${acceptedBatches} durable approval batch${acceptedBatches === 1 ? "" : "es"}. Server processing continues after leaving Factory.`);
      refreshFactoryBatchActivity(true).catch(() => {});
      // Never wait for all approvals in the click handler.
    } catch (error) {
      // Never report the global saved-selection size as the current batch's remaining count.
      // The selection can legitimately contain other profiles and hidden outputs.
      const remaining = ready.filter(card => state.selectedOutputs.has(card.id)).length;
      const saved = pendingFactoryApproval();
      if (saved) {
        saved.last_error = String(error.message || error);
        saved.retry_blocked = [400, 401, 403, 409, 422].includes(Number(error.status));
        saved.next_retry_ms = Date.now() + Math.max(15000, Number(error.retryAfterSeconds || 0) * 1000);
        localStorage.setItem(FACTORY_PENDING_REQUEST_KEY, JSON.stringify(saved));
      }
      factoryMarkSubmissionUnconfirmed();
      setBatchSubmissionError(`Confirmed ${acceptedOutputs} of ${ready.length} outputs accepted; ${remaining} from this attempt are unconfirmed. ${error.message || error} Unconfirmed outputs are checked automatically in the background.`);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingOutputIds = null;
      state.submittingBatch = false;
      archiveFactoryPending();
      reconcilePersistedFactoryPending(true).catch(() => {});
      if (state.desk) renderDesk(state.desk);
      updateFactoryBatchToolbar();
    }
  }

  async function submitFactoryBatchApprovals(requestedIds = null) {
    if (state.submittingBatch) return;
    archiveFactoryPending();
    // Preserve the click while the independent lightweight policy read runs.
    const submitIntent = new Set(waitingFactorySelection());
    for (const id of requestedIds || state.selectedOutputs) submitIntent.add(id);
    localStorage.setItem(FACTORY_WAITING_SELECTION_KEY, JSON.stringify([...submitIntent]));
    try { await refreshFactoryApprovalPolicy(); }
    catch (error) {
      factoryDismissSubmissionPreview();
      setBatchSubmissionError("Submission saved; approval configuration will be checked automatically. " + (error.message || error));
      setStatus(state.batchSubmissionError, true);
      return;
    }
    if (state.submittingBatch) return;
    if (state.batchApprovalsEnabled === false) {
      factoryDismissSubmissionPreview();
      setStatus("Batch approvals are not enabled yet; individual approvals still work.", true); return;
    }
    const selected = readyFactoryOutputs(true, true).filter(card => state.selectedOutputs.has(card.id)
      && (!requestedIds || requestedIds.includes(card.id)));
    const recovering = factoryRecoveringIds();
    if (!requestedIds) {
      for (const { key, saved } of factoryRecoveryEntries()) {
        if (saved.retry_blocked && selected.some(card => (saved.ids || []).includes(card.id))) {
          saved.retry_blocked = false;
          saved.next_retry_ms = 0;
          localStorage.setItem(key, JSON.stringify(saved));
        }
      }
    }
    const waiting = new Set(waitingFactorySelection());
    for (const card of selected) if (recovering.has(card.id)) waiting.add(card.id);
    localStorage.setItem(FACTORY_WAITING_SELECTION_KEY, JSON.stringify([...waiting]));
    const ready = selected.filter(card => !recovering.has(card.id)).map(withResolvedFactoryProfile);
    if (!ready.length) {
      factoryDismissSubmissionPreview();
      updateFactoryBatchToolbar();
      setStatus(selected.length ? "Your submission is saved. Previously submitted outputs are being checked automatically; any not yet accepted will continue automatically." : "Select one or more review-ready outputs.");
      await reconcilePersistedFactoryPending(true);
      return;
    }
    // Remove only the IDs this attempt owns; pending overlaps remain queued.
    ready.forEach(card => waiting.delete(card.id));
    localStorage.setItem(FACTORY_WAITING_SELECTION_KEY, JSON.stringify([...waiting]));
    const profiles = [...new Set(ready.map((card) => String(card.profile_id || "").trim()))];
    const global = state.batchGlobal?.enabled === true;
    const limit = Math.max(1, Number(global ? state.batchGlobal.max_total : (state.batchRollout?.max_items || 100)));
    const missingProfile = profiles.some((id) => !/^rec[A-Za-z0-9]+$/.test(id));
    if (missingProfile) {
      factoryDismissSubmissionPreview();
      setStatus("Some selected outputs are missing a Content Profile id, so multi-profile Submit Approvals cannot partition them safely. Refresh Factory, then reselect. Individual Approve still works.", true);
      return;
    }
    if (!global && profiles.length !== 1) {
      factoryDismissSubmissionPreview();
      setStatus("Global multi-profile approvals are not enabled for this selection. Choose one city profile, or wait for Global Factory to load, then submit again.", true);
      return;
    }
    if (global) {
      return submitFactoryGlobalApprovalBatches(ready);
    }
    if (ready.length > limit) {
      factoryDismissSubmissionPreview();
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
        factoryDismissSubmissionPreview();
        renderFactoryBatchActivity(batch);
        setStatus("A previous batch for this profile is still running. Selection is preserved; submit again after it completes.", true);
        return;
      }
      rememberFactoryAccepted(selectionIds);
      rememberFactoryGroupRequest(batch);
      state.lastBatchProfile = profiles[0];
      try { localStorage.setItem(FACTORY_LAST_BATCH_KEY, JSON.stringify({ job_id: batch.job_id, profile_id: profiles[0] })); } catch {}
      try { localStorage.removeItem(FACTORY_PENDING_REQUEST_KEY); } catch {}
      ready.forEach((card) => state.selectedOutputs.delete(card.id));
      saveFactorySelection();
      if (state.desk) renderDesk(state.desk);
      closeFactoryPreview();
      state.inspectedBatchKey = batch.job_id;
      renderFactoryBatchActivity(factoryBatchMergeAcceptedActivity(state.batch, batch));
      refreshFactoryAcceptedReceipt(batch).catch(() => {});
      refreshFactoryBatchActivity(true).catch(() => {});
      setStatus(`Batch accepted for ${ready.length} outputs. Server processing continues after leaving Factory.`);
      // Never wait for all approvals in the click handler.
    } catch (error) {
      factoryMarkSubmissionUnconfirmed();
      setStatus(`Batch submission not confirmed: ${error.message || error}. Check Activity before retrying.`, true);
      await refreshFactoryBatchActivity();
    } finally {
      state.submittingOutputIds = null;
      state.submittingBatch = false;
      archiveFactoryPending();
      reconcilePersistedFactoryPending(true).catch(() => {});
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
    // Expose the exact failed outputs before issuing a potentially expensive
    // recovery request. The server maintains the original group/request IDs.
    const beforeFailed = (batch.items || []).filter(item => item.status === "failed");
    state.inspectedBatchKey = batch.job_id;
    state.batchDetailsOpen = true;
    state.retryBatchNotice = { job_id: batch.job_id,
      message: "Retry requested for " + beforeFailed.length +
        " failed output(s). Checking the authoritative batch result…" };
    renderFactoryBatchActivity(viewed);
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
      if (result.accepted !== true) throw new Error("Retry was not confirmed as accepted by the server");
      state.inspectedBatchKey = result.job_id || batch.job_id;
      state.retryBatchNotice = { job_id: state.inspectedBatchKey,
        message: "Retry accepted for original batch. " + beforeFailed.length +
          " failed output(s) were eligible for recheck. Refreshing counts; failures are not resolved until verified." };
      setStatus(state.retryBatchNotice.message);
      await refreshFactoryBatchActivity(true);
    } catch (error) {
      state.retryBatchNotice = { job_id: batch.job_id,
        message: "Retry not confirmed: " + (error.message || error) +
          ". Check batch details before retrying again." };
      setStatus(state.retryBatchNotice.message, true);
      await refreshFactoryBatchActivity(true);
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
    if (card.creative_qa_hold === true) {
      return "Creative QA hold: " + (card.creative_qa_reason || "incorrect source imagery; publishing blocked");
    }
    if (typeof factoryActiveSubmissionIds === "function"
        && factoryActiveSubmissionIds().has(String(card?.id || ""))) {
      return "Previous approval request remains in flight or awaiting reconciliation. Check Active Approvals before retrying.";
    }
    if (card.review_package_ready === false) {
      return "Review package incomplete: " + ((card.review_package_missing || []).join(", ") || card.review_package_reason || "required assets not verified");
    }
    if (recentFactoryAccepted()[String(card?.id || "")] &&
        String(card?.output_status || "").trim().toLowerCase() !== "ready for review") {
      return "Already accepted for approval. Refresh Activity to verify the result.";
    }
    if (state.submittingOutputIds?.has(card?.id)) return "Approval is already being submitted. Check Activity.";
    if (card?.review_hold_active === true) return "Publishing approval is held for media QA. You can accept V2 creatively or request another revision.";
    if (card?.safety_hold_active === true) return "Safety hold: an unapproved publisher attempted to proceed. Preview is available; approval and release remain disabled.";
    if (card?.do_not_publish === true) return "Publishing hold is active for this output.";
    const render = String(card?.render_status || "").trim().toLowerCase();
    if (/^(failed|blocked)$/.test(render)) return `Render status is ${card.render_status}. Repair the render before approval.`;
    if (/ready for render|waiting in render queue|^rendering$/.test(render)) return "Render is still queued or running; wait for completion.";
    const output = String(card?.output_status || "").trim().toLowerCase();
    if (["in production", "rendering", "ready for render", "failed", "blocked"].includes(output)) {
      return `Output status is ${card.output_status}; not yet eligible for review.`;
    }
    if (!canReviewActions(card)) return "Not yet review-ready according to the authoritative output/review status.";
    if (state.batchApprovalsEnabled === false) return "Batch approvals are disabled by the server; individual approval is available.";
    if (canSelectBatchOutput(card)) return "";
    if (state.batchGlobal?.enabled) {
      if (!resolveFactoryCardProfileId(card)) {
        return "Content Profile is missing on this output; refresh Factory or use individual Approve.";
      }
      const platform = String(card?.platform || "").trim();
      const allowed = state.batchGlobal.allowed_platforms || [];
      if (!allowed.includes(platform)) return `${platform || "This platform"} is not enabled for batch approval; use individual Approve.`;
      return `${String(card?.studio_output_type || card?.format || "This output type").trim()} is outside the server-authorized ${platform} batch formats; use individual Approve.`;
    }
    return "This profile or output type is outside the current batch rollout; use individual Approve.";
  }

  function canReviewHeldOutput(card) {
    const output = String(card?.output_status || "").trim().toLowerCase();
    const review = String(card?.review_status || "").trim().toLowerCase();
    const render = String(card?.render_status || "").trim().toLowerCase();
    const publish = String(card?.publish_status || "").trim().toLowerCase();
    return card?.kind === "output"
      && card.creative_qa_hold !== true
      && card.do_not_publish === true
      && !card.held_review_decision
      && card.review_hold_active !== true
      && card.review_package_ready !== false
      && output === "ready for review"
      && ["", "review sent", "pending review", "pending"].includes(review)
      && ["rendered", "native photo route"].includes(render)
      && (["", "not ready"].includes(publish) ||
          (card.safety_hold_active === true && ["ready to publish", "publishing", "uploading"].includes(publish)))
      && card.auto_publish_enabled !== true
      && !card.scheduled_post_date && !card.studio_scheduled_at
      && !card.youtube_scheduled_publish_at && !card.published_at
      && !card.platform_post_url;
  }

  function canRejectHeldOutput(card) {
    // Rejection is allowed even when a caption/thumbnail is incomplete, so
    // the operator can request the necessary fixes without releasing a hold.
    const output = String(card?.output_status || "").trim().toLowerCase();
    const review = String(card?.review_status || "").trim().toLowerCase();
    const render = String(card?.render_status || "").trim().toLowerCase();
    const publish = String(card?.publish_status || "").trim().toLowerCase();
    return card?.kind === "output" && card.creative_qa_hold !== true
      && card.do_not_publish === true
      && !card.held_review_decision
      && card.review_hold_active !== true
      && output === "ready for review"
      && ["", "review sent", "pending review", "pending"].includes(review)
      && ["rendered", "native photo route"].includes(render)
      && (["", "not ready"].includes(publish) ||
          (card.safety_hold_active === true && ["ready to publish", "publishing", "uploading"].includes(publish)))
      && card.auto_publish_enabled !== true
      && !card.scheduled_post_date && !card.studio_scheduled_at
      && !card.youtube_scheduled_publish_at && !card.published_at
      && !card.platform_post_url;
  }

  function canReleaseForApproval(card) {
    const output = String(card?.output_status || "").trim().toLowerCase();
    const review = String(card?.review_status || "").trim().toLowerCase();
    const render = String(card?.render_status || "").trim().toLowerCase();
    const publish = String(card?.publish_status || "").trim().toLowerCase();
    return card?.kind === "output"
      && card.creative_qa_hold !== true
      && card.do_not_publish === true
      && card.review_hold_active !== true
      && card.safety_hold_active !== true
      && card.review_package_ready !== false
      && output === "ready for review"
      && ["", "review sent", "pending review"].includes(review)
      && ["rendered", "native photo route"].includes(render)
      && !["scheduled", "publishing", "published", "uploading", "platform processing", "draft delivered"].includes(publish);
  }

  function renderCard(card, { pile = false, candidate = false, lane = "" } = {}) {
    const actions = [];
    actions.push(`<button type="button" class="text-button" data-factory-open="${esc(card.id)}" aria-label="Open ${esc(card.output_id ? `output number ${card.output_id}` : cardLabel(card))}">${card.meta_repair_required === true ? "Open output" : "Open"}</button>`);
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
    const attentionOutput = card._factoryAttention === true && card.kind === "output";
    const reviewActionOutput = needsEyesOutput || attentionOutput;
    const batchReason = reviewActionOutput ? factoryBatchSelectionReason(card) : "";
    const reasonId = batchReason ? `factory-batch-reason-${card.id}` : "";
    if (card.kind === "output" && (reviewAllowed || reviewActionOutput)) {
      // Remediation outputs do not offer a disabled or unsafe approval action.
      if (reviewAllowed || needsEyesOutput) {
        actions.push(`<button type="button" class="primary-button" data-factory-approve="${esc(card.id)}" ${reviewAllowed ? "" : `disabled title="${esc(batchReason || "Not yet eligible for approval")}"`}>Approve</button>`);
      }
      if(reviewActionOutput && card.review_hold_active===true && card.do_not_publish===true) {
        // This is a separate protected handoff of an already-approved revision,
        // not a publishing approval. The server enforces the exact V2/session hold.
        actions.push(`<button type="button" class="secondary-button factory-held-handoff-action" data-factory-handoff-held="${esc(card.id)}" title="Verify approved V2 and release only its original owned review hold. Does not approve, schedule or publish.">Complete V2 Factory handoff</button>`);
        // Human review can be accepted without releasing the publishing hold.
        // Server verifies the actual saved creative approval before accepting.
        if(state.heldCreativeAccepted?.has(card.id)){
          actions.push(`<button type="button" class="secondary-button factory-held-creative-action" disabled title="Factory creative acceptance confirmed; publishing remains on hold for QA.">V2 accepted · QA pending</button>`);
        }else{
          actions.push(`<button type="button" class="secondary-button factory-held-creative-action" data-factory-accept-held="${esc(card.id)}" title="Accept the selected V2 creatively. Keeps watermark QA, scheduling and publishing on hold.">Accept V2 (QA hold)</button>`);
        }
      }
      if (reviewActionOutput && card.held_review_decision && card.do_not_publish === true) {
        actions.push(`<span class="factory-batch-unavailable" role="status">Creative ${esc(card.held_review_decision)} · publishing safety hold retained</span>`);
      }
      if (reviewActionOutput && canReviewHeldOutput(card)) {
        actions.push(`<button type="button" class="primary-button" data-factory-held-review="approve:${esc(card.id)}" title="Approve creative review only; publishing stays blocked.">Approve review (publish held)</button>`);
      }
      if (reviewActionOutput && canRejectHeldOutput(card)) {
        actions.push(`<button type="button" class="secondary-button" data-factory-held-review="reject:${esc(card.id)}" title="Reject or request changes while preserving the publishing hold.">Reject / Request Changes</button>`);
      }
      if (reviewActionOutput && canReleaseForApproval(card)) {
        actions.push(`<button type="button" class="secondary-button" data-factory-release-approval="${esc(card.id)}" title="Operator-controlled release only. Does not approve, schedule, or publish.">Release for Approval</button>`);
      }
      actions.push(`<button type="button" class="secondary-button" data-factory-send-back="${esc(card.id)}">Request Changes</button>`);
    }
    if (attentionOutput) {
      actions.push(`<button type="button" class="primary-button" data-factory-make-ready="${esc(card.id)}" title="Open the exact output in Pipeline to correct its blocking condition. Does not bypass holds or approve publishing.">Fix / Make Ready</button>`);
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
    const stateLabel = card.creative_qa_hold === true
      ? "Creative correction required · Publishing held"
      : card.meta_repair_required === true
      ? "Studio repair required · Publishing held"
      : card.protected_media_rework === true
      ? (card.recovery_source_inventory_verified === true
        ? "Source verified · Needs creative review"
        : "Media repair · Source unresolved")
      : (card.review_package_ready === false
        ? (card.review_package_readiness === "IN_PROGRESS" ? "Preparing Assets" : "Review blocked")
        : (card.studio_state || (alert ? "Needs repair" : "—")));
    const reviewReason = (card.review_package_missing || []).join(", ") || card.review_package_reason || "";
    const cell = (value) => `<span class="factory-line-cell">${esc(value || "—")}</span>`;
    // Every Repair row (output, production request, or idea) gets the same
    // exact-record navigation as its Open action. Some held repairs are not
    // platform outputs, so restricting linked titles to kind=output hid the
    // interaction on most rows. Never infer a parent output for requests.
    const titleMarkup = lane === "manual"
      ? `<button type="button" class="factory-repair-title-link" data-factory-open="${esc(card.id)}" aria-label="Open ${esc(card.kind === "output" ? "output" : card.kind === "request" ? "production request" : card.kind === "idea" ? "idea" : "record")} ${esc(card.output_id || card.id)}: ${esc(card.title || cardLabel(card))}">${esc(card.title || cardLabel(card))}</button>`
      : esc(card.title || cardLabel(card));
    return `<div class="factory-line" data-factory-id="${esc(card.id)}" data-factory-kind="${esc(card.kind || "")}" data-lane="${esc(lane)}" title="${esc(cardLabel(card))}">
      ${needsEyesOutput
        ? `<span class="factory-media-select"><label class="factory-output-select" title="${esc(batchReason || "Select for batch approval")}"><input type="checkbox" data-factory-select-output="${esc(card.id)}" aria-label="${esc(batchReason ? `Batch selection unavailable for ${cardLabel(card)}` : `Select ${cardLabel(card)}`)}" ${reasonId ? `aria-describedby="${esc(reasonId)}"` : ""} ${batchReason ? "disabled" : (state.selectedOutputs.has(card.id) ? "checked" : "")}></label></span>`
        : media}
      <span class="factory-line-title">
        ${needsEyesOutput
          ? `<span class="factory-output-heading">${outputVisual}<span class="factory-output-title-copy"><span class="factory-output-title-name">${esc(card.title || cardLabel(card))}</span>${card.output_id ? `<small class="factory-output-number">Output #${esc(card.output_id)}</small>` : ""}</span></span>`
          : `${titleMarkup}${card.output_id ? `<small class="factory-output-number">Output #${esc(card.output_id)}</small>` : ""}`}
        ${reviewActionOutput && batchReason ? `<span id="${esc(reasonId)}" class="factory-batch-unavailable" role="status"><strong>${card.review_hold_active===true ? "Publishing approval held:" : "Needs attention:"}</strong> ${esc(batchReason)}</span>` : ""}
        ${card.creative_qa_hold === true
          ? `<span class="factory-batch-unavailable factory-creative-qa" role="status"><strong>Creative QA: incorrect media · Publishing held</strong><br>
              ${esc(card.creative_qa_reason || "Location/season or source image needs replacement and verification.")}
              <small>Open this exact output for media correction. Prior approval or provisional schedule does not authorize publication. No automatic approval, retry, deletion or hold release.</small></span>`
          : ""}
        ${card.meta_repair_required === true
          ? `<span class="factory-batch-unavailable factory-meta-repair" role="status"><strong>Studio repair required · ${esc(card.meta_repair_reason || "Recovery")}</strong> · Publishing held<br>
              ${esc(card.meta_repair_next_step || "Studio must diagnose and repair this output.")}
              <span class="factory-meta-asset-detail"><strong>Asset check:</strong> ${esc(card.meta_repair_asset_message || "Media verification pending.")}</span><br>
          <small><strong>Owner:</strong> ${esc(card.meta_repair_owner || "Studio")} · ${card.meta_repair_user_action_required === true ? "Your action is required; open the output and review the flagged media." : "No user action requested. Studio must repair and verify."} · Tracked in issue #2563</small></span>`
          : ""}
        ${card.protected_media_rework === true
          ? `<span class="factory-batch-unavailable" role="status" title="${esc(card.recovery_next_step || "")}"><strong>Creative repair:</strong> ${card.recovery_source_inventory_verified === true ? "Original images verified · Rebuild/stage and review" : "Inspect and rebuild media"} · Publishing held</span>`
          : ""}
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
    // A completed Safety-Held render is visible in Needs eyes but cannot
    // be selected/approved. Count the actual reviewable video previews
    // separately from operator-approvable outputs (LA Content 2212: six
    // rendered, zero eligible). Never equate "0 ready" with a failed render.
    const safetyHeld = (group.cards || []).filter(card =>
      card?.kind === "output" && card.safety_hold_active === true && card.do_not_publish === true);
    const heldRendered = safetyHeld.filter(card =>
      ["rendered", "native photo route"].includes(String(card.render_status || "").trim().toLowerCase()) && canPreview(card));
    const pendingLabel = heldRevisions.length ? "Review-held V2 — preview only" : pendingSiblingMeta(pending);
    const first = group.cards[0] || {};
    const contentId = String(first.content_id || "").trim();
    const title = first.title || "Untitled";
    const bits = [];
    if (contentId) bits.push(`Content ${contentId}`);
    if (safetyHeld.length) {
      if (first.profile_name) bits.push(String(first.profile_name));
      const creativeReviewReady = (group.cards || []).filter(card =>
        canReviewHeldOutput(card) || canRejectHeldOutput(card)).length;
      bits.push(`${heldRendered.length} rendered for preview`);
      if (creativeReviewReady) bits.push(`${creativeReviewReady} ready for creative review`);
      bits.push(`${ready.length} publishing-approvable`);
      bits.push("Publishing safety hold");
    } else {
      const heldForReview = (group.cards || []).filter(canRejectHeldOutput);
      if (ready.length) bits.push(`${ready.length} ready`);
      if (heldForReview.length) bits.push(`${heldForReview.length} ready for your review · publishing held`);
      if (!ready.length && !heldForReview.length) bits.push("0 approvable · inspect hold or render status");
    }
    if (pendingLabel) bits.push(pendingLabel);
    const meta = bits.join(" · ");
    // Each Platform Output is independently approvable. A held or unfinished
    // sibling must not disable selection of review-ready outputs in this content.
    // The approval endpoint still revalidates every submitted output.
    const approveAll = ready.length > 1
      ? `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}">Approve eligible (${ready.length})</button>`
      : "";
    const batchReady = ready.filter(canSelectBatchOutput);
    const contentSelected = batchReady.length > 0 && batchReady.every((card) => state.selectedOutputs.has(card.id));
    const selectContent = `<label class="factory-content-batch-select">
      <input type="checkbox" data-factory-select-content="${esc(group.key)}"
        aria-label="Select all review-ready outputs for ${esc(title)}"
        ${contentSelected ? "checked" : ""} ${!batchReady.length ? "disabled" : ""}>
      ${safetyHeld.length && !batchReady.length ? "Preview only — approval held" : "Select eligible outputs"}</label>`;
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

  async function readHeldFactoryReview(card) {
    if(card?.kind!=="output" || !/^rec[A-Za-z0-9]{14}$/.test(String(card.id||"")))
      throw new Error("Exact Platform Output required for held review.");
    const response=await fetch("/api/rendering-review/outputs/"+encodeURIComponent(card.id),{
      credentials:"same-origin",cache:"no-store",headers:{Accept:"application/json"}
    });
    if(!response.ok)throw new Error("Could not verify saved V2 review ("+response.status+").");
    const data=await response.json();
    const session=data?.session;
    if(data?.ok!==true||!session||
       session.output_id!==card.id||session.state!=="approved"||
       session.review_hold?.active!==true||data.publication_hold_verified!==true||
       session.current_attempt_id!==session.approved_attempt_id)
      throw new Error("This output is not a creatively approved, safely held V2.");
    if(session.factory_review?.status==="accepted_pending_qa")
      return {session,alreadyAccepted:true};
    return {session,alreadyAccepted:false};
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

  // Source/compatible-output discovery is strictly read-only. An inventory is
  // never permission to generate, select an unrequested output or publish.
  async function loadFactoryCorrectionReadOnlyPreview(pending) {
    const panel=$("factoryReadOnlyInventory");
    const status=$("factoryReadOnlyInventoryStatus");
    const rows=$("factoryReadOnlyInventoryRows");
    if(!panel||!status||!rows)return;
    panel.hidden=true;
    rows.replaceChildren();
    const payload=pending?.payload||{};
    const id=String(payload.id||"");
    const requestId=String(payload.production_request_id||"");
    if(payload.kind!=="output"||!/^rec[A-Za-z0-9]{14}$/.test(id))return;
    panel.hidden=false;
    status.textContent="Checking compatible outputs and original source media (read-only)…";
    const current=()=>state.pendingFactoryFeedback===pending;
    // Separate requests: unavailable/unmapped Factory match information
    // must NEVER suppress a legitimate photo/carousel source inventory.
    const readMatches=async()=>{
      if(!/^rec[A-Za-z0-9]{14}$/.test(requestId))
        return "Compatible-output matching requires an exact Production Request.";
      try{
        const match=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
          "/correction-matches?production_request_id="+encodeURIComponent(requestId));
        if(!current())return "";
        if(match?.source_output_id!==id||match?.production_request_id!==requestId||
           match?.batch_enabled!==false)
          throw new Error("Correction matching identity or disabled write gate could not be verified");
        const outputs=Array.isArray(match.matching_outputs)?match.matching_outputs:[];
        for(const output of outputs.slice(0,40)){
          const li=document.createElement("li");
          li.textContent=[output.platform,output.output_type,
            output.review_render_supported===true?"render capability detected":
              "revision unavailable: "+(output.review_render_reason||"unsupported")]
              .filter(Boolean).join(" · ");
          rows.appendChild(li);
        }
        return outputs.length+" compatible review-ready output(s). Batch correction remains disabled.";
      }catch(error){
        return "Compatible-output preview unavailable: "+String(error?.message||error)+".";
      }
    };
    const canSaveWithoutAutoRender = pending?.payload?.action !== "request_changes_content";
    const readGallery=async()=>{
      // The server advertises independent protected request gates. Neither
      // this metadata inventory nor a preview authorizes a render or publish.
      let galleryActions=null;
      try{
        const inventory=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
          "/gallery-inventory");
        if(!current())return "";
        if(inventory?.output_id!==id||inventory?.can_generate!==false||
           inventory?.publication_authorized!==false||
           inventory?.source_kind!=="airtable_metadata_only")
          throw new Error("Original gallery source verification contract is unavailable");
        // Read only authoritative attempt history. A status is not proof
        // of generated Drive media and cannot grant creative acceptance.
        try{
          const revision=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
            "/gallery-revision-status");
          if(!current())return "";
          if(revision?.ok!==true||revision.output_id!==id||
             revision.profile_id!==inventory.profile_id||
             revision.can_generate!==false||revision.can_publish!==false||
             !Array.isArray(revision.jobs))
            throw new Error("Gallery history authority mismatch");
          galleryActions={
            holdEnrollment:revision.hold_enrollment_request_enabled===true,
            generationRequest:revision.generation_request_enabled===true,
            holdActive:revision.hold_active===true,
            jobCount:revision.jobs.length,
          };
          const history=document.createElement("li");
          history.textContent=revision.jobs.length?
            "Gallery job history: "+revision.jobs.slice(0,10)
              .map(item=>String(item.status||"unknown")+" ("+
                String(item.job_id||"unknown")+")").join("; ")+
              ". Revised artifacts are not verified for acceptance.":
            "Gallery job history: no native-gallery revision jobs recorded.";
          rows.appendChild(history);
          // This is the authoritative Airtable LEDGER count only, not a
          // verified media-byte or generation completion percentage.
          for(const job of revision.jobs.slice(0,10)){
            const total=job.total_slides,completed=job.completed_slides;
            if(job.progress_source!=="airtable_ledger_unverified"||
               !Number.isSafeInteger(total)||total<1||total>20||
               !Number.isSafeInteger(completed)||completed<0||completed>total)
              continue;
            const line=document.createElement("li");
            const title=document.createElement("div");
            title.textContent="Private correction · "+String(job.status||"unknown")+
              (job.stage?" · "+String(job.stage):"")+
              " · "+completed+" of "+total+" slide slots recorded";
            const meter=document.createElement("progress");
            meter.min=0;meter.max=total;meter.value=completed;
            meter.setAttribute("aria-label","Airtable slide-slot ledger progress");
            meter.style.display="block";
            meter.style.maxWidth="260px";
            const qualifier=document.createElement("small");
            qualifier.textContent="Airtable ledger only — generated Drive media not independently verified by this count.";
            line.append(title,meter,qualifier);
            rows.appendChild(line);
          }
          // Side-by-side V1/V2 images are fetched through authenticated
          // Studio, never public Drive links. The Runner rechecks original
          // and revised private Drive bytes on EVERY image request.
          if(revision.private_preview_available===true){
            const reviewable=revision.jobs.filter(job=>
              ["ready_for_review","creative_accepted","rejected"].includes(
                String(job.status||""))&&job.revised_manifest_stored===true);
            for(const job of reviewable.slice(0,2)){
              const title=document.createElement("li");
              title.textContent="Private gallery comparison · "+job.job_id+
                " · "+job.status+" (view only; Factory approval separate)";
              rows.appendChild(title);
              for(const slide of inventory.slides.slice(0,20)){
                if(!/^rec[A-Za-z0-9]{14}$/.test(String(slide.slide_id||"")))continue;
                const item=document.createElement("li");
                const label=document.createElement("div");
                label.textContent="Slide "+slide.order;
                item.appendChild(label);
                const pair=document.createElement("div");
                pair.style.display="flex";
                pair.style.flexWrap="wrap";
                pair.style.gap="12px";
                for(const version of ["original","revised"]){
                  const picture=document.createElement("figure");
                  picture.style.margin="0";
                  picture.style.width="min(190px, 45%)";
                  const note=document.createElement("figcaption");
                  note.textContent=version==="original"?"Original V1":"Revised V2";
                  const image=document.createElement("img");
                  image.alt="Private "+version+" image for gallery slide "+slide.order;
                  image.loading="lazy";
                  image.style.width="100%";
                  image.style.maxHeight="250px";
                  image.style.objectFit="contain";
                  image.src="/api/factory/outputs/"+encodeURIComponent(id)+
                    "/gallery/jobs/"+encodeURIComponent(job.job_id)+
                    "/slides/"+encodeURIComponent(slide.slide_id)+"/"+version;
                  image.addEventListener("error",()=>{
                    note.textContent=(version==="original"?"Original":"Revised")+
                      " unavailable — verification or hold may have changed";
                  });
                  picture.appendChild(image);picture.appendChild(note);
                  pair.appendChild(picture);
                }
                item.appendChild(pair);rows.appendChild(item);
              }
              if(job.status==="creative_accepted"&&
                 revision.factory_preflight_available===true){
                const verifyRow=document.createElement("li");
                const verifyFactory=document.createElement("button");
                verifyFactory.type="button";
                verifyFactory.textContent="Verify private Factory review packet";
                verifyRow.appendChild(verifyFactory);rows.appendChild(verifyRow);
                verifyFactory.addEventListener("click",async()=>{
                  if(!current())return;
                  verifyFactory.disabled=true;
                  status.textContent="Rechecking exact V2 Drive bytes, rights, ownership and active review hold…";
                  try{
                    const packet=await fetchJson("/api/factory/outputs/"+
                      encodeURIComponent(id)+"/gallery/jobs/"+
                      encodeURIComponent(job.job_id)+"/factory-preflight");
                    if(!current())return;
                    if(packet?.ok!==true||packet.output_id!==id||
                       packet.job_id!==job.job_id||
                       packet.revised_manifest_sha256!==job.revision_manifest_sha256||
                       packet.ready_for_factory_review!==true||
                       packet.drive_rights_and_pixels_verified!==true||
                       packet.hold_active!==true||
                       packet.creative_approved!==true||
                       packet.factory_approved!==false||
                       packet.handoff_performed!==false||
                       packet.can_publish!==false||
                       packet.publication_authorized!==false||
                       packet.requires_separate_factory_approval!==true)
                      throw new Error("Private Factory verification did not return an exact held receipt");
                    status.textContent="Private revised gallery independently verified for Factory review ("+
                      packet.selected_slide_count+" of "+packet.total_slide_count+
                      " slides replaced). The output stays held; Factory approval and publication remain separate.";
                    if(revision.factory_handoff_available===true&&
                       job.stage!=="factory_review_pending"){
                      // A SECOND deliberate human action records a private,
                      // held inbox receipt. The preflight alone never writes.
                      const consent=document.createElement("label");
                      const checkbox=document.createElement("input");
                      checkbox.type="checkbox";
                      checkbox.style.marginRight="8px";
                      consent.appendChild(checkbox);
                      consent.appendChild(document.createTextNode(
                        "Send this exact creatively accepted revision to private Factory review only. Do not publish."));
                      const send=document.createElement("button");
                      send.type="button";
                      send.textContent="Send to private Factory review";
                      send.disabled=true;
                      checkbox.addEventListener("change",()=>{send.disabled=!checkbox.checked;});
                      verifyRow.appendChild(consent);verifyRow.appendChild(send);
                      send.addEventListener("click",async()=>{
                        if(!current()||!checkbox.checked||send.disabled)return;
                        send.disabled=true;checkbox.disabled=true;
                        status.textContent="Recording protected private Factory handoff in Airtable…";
                        try{
                          const moved=await fetchJson("/api/factory/outputs/"+
                            encodeURIComponent(id)+"/gallery/jobs/"+
                            encodeURIComponent(job.job_id)+"/factory-handoff",{
                            method:"POST",body:JSON.stringify({
                              manifest_sha256:packet.revised_manifest_sha256,
                              confirm_private_factory_handoff:true,
                            }),
                          });
                          if(!current())return;
                          if(moved?.ok!==true||moved.output_id!==id||
                             moved.job_id!==job.job_id||
                             moved.revised_manifest_sha256!==packet.revised_manifest_sha256||
                             moved.private_factory_review_handoff!==true||
                             moved.stage!=="factory_review_pending"||
                             moved.hold_active!==true||
                             moved.hold_released!==false||
                             moved.factory_approved!==false||
                             moved.publication_authorized!==false||
                             moved.can_publish!==false||
                             moved.media_quarantined!==true||
                             moved.requires_separate_factory_approval!==true)
                            throw new Error("Airtable private Factory handoff receipt was not verified");
                          consent.remove();send.remove();
                          status.textContent="Revision transferred to private Factory review inbox. "+
                            "Original output remains on publication hold; separate Factory approval is still required.";
                        }catch(error){
                          if(current()){
                            checkbox.disabled=false;
                            send.disabled=!checkbox.checked;
                            status.textContent="Private Factory handoff blocked: "+
                              String(error?.message||error);
                          }
                        }
                      });
                    }
                  }catch(error){
                    if(current())status.textContent="Factory preflight blocked: "+
                      String(error?.message||error);
                  }finally{if(current())verifyFactory.disabled=false;}
                });
              }
              if(revision.creative_review_available===true&&
                 job.status==="ready_for_review"&&
                 /^[a-f0-9]{64}$/.test(String(job.revision_manifest_sha256||""))){
                const approval=document.createElement("li");
                const confirmLabel=document.createElement("label");
                const confirmBox=document.createElement("input");
                confirmBox.type="checkbox";
                confirmBox.style.marginRight="8px";
                confirmLabel.appendChild(confirmBox);
                confirmLabel.appendChild(document.createTextNode(
                  "I have inspected the revised images and want to record a creative decision."));
                approval.appendChild(confirmLabel);
                const buttons=document.createElement("div");
                buttons.style.display="flex";
                buttons.style.flexWrap="wrap";
                buttons.style.gap="8px";
                buttons.style.marginTop="8px";
                const accept=document.createElement("button");
                accept.type="button";accept.textContent="Accept creative revision";
                const reject=document.createElement("button");
                reject.type="button";reject.textContent="Reject revision";
                accept.disabled=true;reject.disabled=true;
                confirmBox.addEventListener("change",()=>{
                  accept.disabled=!confirmBox.checked;
                  reject.disabled=!confirmBox.checked;
                });
                for(const [button,decision] of [[accept,"accept"],[reject,"reject"]]){
                  button.addEventListener("click",async()=>{
                    if(!current()||!confirmBox.checked)return;
                    accept.disabled=true;reject.disabled=true;confirmBox.disabled=true;
                    status.textContent="Checking the exact private Drive revision and recording "+
                      decision+" in Airtable…";
                    try{
                      const result=await fetchJson("/api/factory/outputs/"+
                        encodeURIComponent(id)+"/gallery/jobs/"+
                        encodeURIComponent(job.job_id)+"/creative-decision",{
                        method:"POST",body:JSON.stringify({
                          decision,manifest_sha256:job.revision_manifest_sha256,
                          confirm_reviewed:true,
                        }),
                      });
                      if(!current())return;
                      if(result?.ok!==true||result.decision!==decision||
                         result.publication_authorized!==false||
                         result.factory_approved!==false)
                        throw new Error("The creative decision receipt was not independently verified");
                      status.textContent="Gallery creative decision saved: "+decision+
                        ". Factory approval and publication remain separate.";
                    }catch(error){
                      if(current()){
                        confirmBox.disabled=false;
                        accept.disabled=!confirmBox.checked;
                        reject.disabled=!confirmBox.checked;
                        status.textContent="Creative decision blocked: "+
                          String(error?.message||error);
                      }
                    }
                  });
                  buttons.appendChild(button);
                }
                approval.appendChild(buttons);
                rows.appendChild(approval);
              }
            }
          }
        }catch(error){
          if(current()){
            const history=document.createElement("li");
            history.textContent="Gallery attempt history unavailable: "+
              String(error?.message||error);
            rows.appendChild(history);
          }
        }
        if(inventory.source_byte_preflight_available===true){
          const checkRow=document.createElement("li");
          const verifyButton=document.createElement("button");
          verifyButton.type="button";
          verifyButton.textContent="Verify original image bytes and rights (private)";
          verifyButton.className="factory-gallery-source-byte-check";
          checkRow.appendChild(verifyButton);
          rows.appendChild(checkRow);
          verifyButton.addEventListener("click",async()=>{
            if(!current())return;
            verifyButton.disabled=true;
            status.textContent="Independently reading Airtable source links and Google Drive image bytes…";
            try{
              const evidence=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
                "/gallery-source-preflight");
              if(!current())return;
              if(evidence?.ok!==true||evidence.output_id!==id||
                 evidence.profile_id!==inventory.profile_id||
                 evidence.sources_byte_verified!==true||
                 evidence.can_generate!==false||
                 evidence.publication_authorized!==false)
                throw new Error("The independent source verification receipt was not trusted");
              status.textContent=evidence.slide_count+
                " original slide(s): Drive bytes and source ownership verified. "+
                (evidence.original_artifact_watermark_verified===true?
                  "Official logo pixels also verified. ":
                  "Original logo placement remains unverified. ")+
                "The durable render hold and generation gates remain disabled. "+
                "Generation and publishing remain unavailable.";
            }catch(error){
              if(current())status.textContent="Original source verification blocked: "+
                String(error?.message||error)+". No render or media change occurred.";
            }finally{verifyButton.disabled=false;}
          });
        }
        // An exact slide-selection proposal is available without changing
        // existing Factory feedback or enabling unverified media rendering.
        // This preview never creates a job, modifies Airtable, or publishes.
        const selectable=[];
        for(const slide of (inventory.slides||[]).slice(0,80)){
          const li=document.createElement("li");
          const label=document.createElement("label");
          const checkbox=document.createElement("input");
          checkbox.type="checkbox";
          checkbox.className="factory-gallery-select-slide";
          checkbox.dataset.slideId=String(slide.slide_id||"");
          checkbox.disabled=Boolean(slide.blockers?.length);
          const name=document.createElement("span");
          name.textContent="Slide "+slide.order+" · "+
            (slide.blockers?.length?slide.blockers.join(", "):
             "Source metadata present; Drive/branding still unverified");
          label.append(checkbox," ",name);
          li.appendChild(label);
          const instruction=document.createElement("textarea");
          instruction.className="factory-gallery-slide-instruction";
          instruction.placeholder="Describe the change to this selected slide (preview only)";
          instruction.setAttribute("aria-label","Correction instructions for slide "+slide.order);
          instruction.maxLength=3000;
          instruction.rows=2;
          instruction.disabled=true;
          instruction.hidden=true;
          checkbox.addEventListener("change",()=>{
            instruction.disabled=!checkbox.checked;
            instruction.hidden=!checkbox.checked;
            if(checkbox.checked)instruction.focus();
          });
          li.appendChild(instruction);
          rows.appendChild(li);
          if(!checkbox.disabled)selectable.push({slide,checkbox,instruction});
        }
        if(selectable.length && canSaveWithoutAutoRender){
          const li=document.createElement("li");
          const button=document.createElement("button");
          button.type="button";
          button.className="factory-gallery-preview-selection";
          button.textContent="Validate selected photo changes (no render)";
          li.appendChild(button);
          rows.appendChild(li);
          button.addEventListener("click",async()=>{
            if(!current())return;
            const selected=selectable.filter(x=>x.checkbox.checked).map(x=>({
              slide_id:x.slide.slide_id,instruction:x.instruction.value.trim(),
            }));
            if(!selected.length){
              status.textContent="Select at least one eligible slide to preview a proposed correction.";
              return;
            }
            button.disabled=true;
            status.textContent="Verifying selected slide identity against current Airtable records…";
            try{
              const proposal=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
                "/gallery-selection-preview",{
                  method:"POST",
                  body:JSON.stringify({
                    client_request_id:"gallery_preview_"+Date.now().toString(36)+
                      "_"+Math.random().toString(36).slice(2,12),
                    selected_slides:selected,
                  }),
                });
              if(!current())return;
              if(proposal?.ok!==true||proposal.output_id!==id||
                 proposal.can_generate!==false||
                 proposal.publication_authorized!==false)
                throw new Error("Protected selection preview was not verified");
              status.textContent="Selected slide(s): "+
                proposal.selected.map(x=>x.order).join(", ")+
                ". Unchanged: "+proposal.unchanged.map(x=>x.order).join(", ")+
                ". Exact selection verified. To save these directions, use Send back with notes. "+
                "No render is authorized; Drive, branding and release gates remain required.";
            }catch(error){
              if(current())status.textContent="Slide preview blocked: "+
                String(error?.message||error)+". No changes were generated.";
            }finally{button.disabled=false;}
          });
        }
        if(canSaveWithoutAutoRender&&galleryActions?.holdEnrollment===true&&
           galleryActions.holdActive===false&&galleryActions.jobCount===0&&selectable.length){
          const li=document.createElement("li");
          const confirmation=document.createElement("label");
          const confirm=document.createElement("input");
          confirm.type="checkbox";
          confirmation.append(confirm,document.createTextNode(
            " Prepare an exact, unpublished, unscheduled gallery correction hold. No image will be generated."));
          const hold=document.createElement("button");
          hold.type="button";hold.textContent="Prepare private correction hold";
          hold.disabled=true;
          confirm.addEventListener("change",()=>{hold.disabled=!confirm.checked;});
          li.append(confirmation,hold);rows.appendChild(li);
          hold.addEventListener("click",async()=>{
            if(!current()||!confirm.checked||hold.disabled)return;
            hold.disabled=true;confirm.disabled=true;
            status.textContent="Recording the exact private gallery publication hold in Airtable…";
            const client_request_id="gallery_hold_"+Date.now().toString(36)+
              "_"+Math.random().toString(36).slice(2,12);
            try{
              const receipt=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
                "/gallery-enroll",{method:"POST",body:JSON.stringify({client_request_id})});
              if(!current())return;
              if(receipt?.ok!==true||receipt.output_id!==id||
                 receipt.profile_id!==inventory.profile_id||
                 receipt.hold_verified!==true||receipt.generation_queued!==false||
                 receipt.publication_authorized!==false)
                throw new Error("Airtable hold receipt was not verified");
              status.textContent="Private gallery hold saved; loading current job eligibility. No image generated.";
              void loadFactoryCorrectionReadOnlyPreview(pending);
            }catch(error){
              if(current())status.textContent="Hold could not be independently confirmed: "+
                String(error?.message||error)+". Refresh gallery history before another request; do not retry blindly.";
            }
          });
        }
        if(canSaveWithoutAutoRender&&galleryActions?.generationRequest===true&&
           galleryActions.holdActive===true&&galleryActions.jobCount===0&&selectable.length){
          const li=document.createElement("li");
          const confirmation=document.createElement("label");
          const confirm=document.createElement("input");
          confirm.type="checkbox";
          confirmation.append(confirm,document.createTextNode(
            " Generate only the selected images into PRIVATE staging. Keep original media, schedule, Factory approval and publishing unchanged."));
          const generate=document.createElement("button");
          generate.type="button";generate.textContent="Generate private image corrections";
          generate.disabled=true;
          confirm.addEventListener("change",()=>{generate.disabled=!confirm.checked;});
          li.append(confirmation,generate);rows.appendChild(li);
          generate.addEventListener("click",async()=>{
            if(!current()||!confirm.checked||generate.disabled)return;
            const selected=selectable.filter(x=>x.checkbox.checked).map(x=>({
              slide_id:x.slide.slide_id,instruction:x.instruction.value.trim(),
            }));
            if(!selected.length||selected.length>20||
               selected.some(x=>x.instruction.length<8||x.instruction.length>3000)){
              status.textContent="Select 1–20 eligible slides and enter 8–3000 characters of correction instructions for each.";
              return;
            }
            generate.disabled=true;confirm.disabled=true;
            // Exactly one request ID per human click, used in both the
            // nonmutating verification and durable one-shot job submission.
            const client_request_id="gallery_generate_"+Date.now().toString(36)+
              "_"+Math.random().toString(36).slice(2,12);
            status.textContent="Revalidating selected images against authoritative Airtable before creating ONE private job…";
            try{
              const proposal=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
                "/gallery-selection-preview",{method:"POST",body:JSON.stringify({
                  client_request_id,selected_slides:selected,
                })});
              if(!current())return;
              if(proposal?.ok!==true||proposal.output_id!==id||
                 proposal.profile_id!==inventory.profile_id||
                 proposal.client_request_id!==client_request_id||
                 proposal.can_generate!==false||proposal.publication_authorized!==false||
                 !Array.isArray(proposal.selected)||proposal.selected.length!==selected.length||
                 selected.some(x=>!proposal.selected.some(y=>
                   y.slide_id===x.slide_id&&y.instruction===x.instruction&&
                   Array.isArray(y.blockers)&&y.blockers.length===0)))
                throw new Error("Exact private slide selection could not be verified");
              const receipt=await fetchJson("/api/factory/outputs/"+encodeURIComponent(id)+
                "/gallery-generate",{method:"POST",body:JSON.stringify({
                  client_request_id,selected_slides:selected,
                })});
              if(!current())return;
              if(receipt?.ok!==true||receipt.output_id!==id||
                 !/^[A-Za-z0-9_-]{8,120}$/.test(String(receipt.job_id||""))||
                 receipt.state!=="held_queued"||
                 receipt.publication_authorized!==false||
                 receipt.creative_approved!==false||receipt.factory_approved!==false)
                throw new Error("Private gallery job receipt could not be independently verified");
              status.textContent="One private image correction job queued: "+receipt.job_id+
                ". Not yet rendered, approved or published; reloading Airtable status.";
              void loadFactoryCorrectionReadOnlyPreview(pending);
            }catch(error){
              if(current())status.textContent="Private generation request could not be confirmed: "+
                String(error?.message||error)+
                ". Check authoritative Gallery job history before another request. No automatic retry will occur.";
            }
          });
        }
        if(!canSaveWithoutAutoRender) {
          for(const entry of selectable)entry.checkbox.disabled=true;
          return "Original image inventory: "+inventory.slide_count+
            " slide(s). This Producer request may auto-start production; photo-by-photo "+
            "selection is disabled until an explicit non-rendering review path is available.";
        }
        return "Original image inventory: "+inventory.slide_count+
          " slide(s). Select slides for an exact correction preview. "+
          (galleryActions?.generationRequest===true?
            "Private Generate requests are available only after an independently verified hold, source rights and Runner checks.":
            "Private generation remains disabled until release and rights gates pass.");
      }catch(error){
        // The source is often video or an unpublished/non-gallery output;
        // this cannot block sending normal Factory review comments.
        return "Native image inventory not ready for this output.";
      }
    };
    const [matching,gallery]=await Promise.all([readMatches(),readGallery()]);
    if(!current())return;
    status.textContent=[matching,gallery].filter(Boolean).join(" ");
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
    void loadFactoryCorrectionReadOnlyPreview(state.pendingFactoryFeedback);
    const heading = $("factoryFeedbackTarget");
    const detail = $("factoryFeedbackScope");
    const error = $("factoryFeedbackError");
    if (heading) heading.textContent = title || "Untitled content";
    if (detail) detail.textContent = scope || "Review changes";
    const returnReview = ["return_to_review","return_to_review_held","start_render_review"].includes(payload?.action);
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
    const readOnly=$("factoryReadOnlyInventory");
    if(readOnly)readOnly.hidden=true;
    if (origin?.isConnected) origin.focus?.();
  }

  async function submitFactoryFeedback(event) {
    event.preventDefault();
    const pending = state.pendingFactoryFeedback;
    if (!pending) return;
    const freeformNotes = String($("factoryFeedbackNotes")?.value || "").trim();
    const error = $("factoryFeedbackError");
    const selectedGallerySlides = [...document.querySelectorAll(
      "#factoryReadOnlyInventoryRows .factory-gallery-select-slide:checked"
    )].map(input=>{
      const li=input.closest("li");
      const instruction=String(li?.querySelector(".factory-gallery-slide-instruction")?.value||"").trim();
      const id=String(input.dataset.slideId||"");
      const order=String(li?.querySelector("label span")?.textContent||"")
        .match(/^Slide (\d+) /)?.[1]||"";
      return {id,order,instruction};
    });
    if(selectedGallerySlides.length && pending.payload?.action==="request_changes_content") {
      if(error){error.hidden=false;error.textContent=
        "Photo-by-photo changes cannot auto-start production. Use manual review first.";}
      return;
    }
    if(selectedGallerySlides.some(item=>
      !/^rec[A-Za-z0-9]{14}$/.test(item.id)||
      !/^\d{1,2}$/.test(item.order)||
      item.instruction.length<8||item.instruction.length>3000)){
      if(error){error.hidden=false;error.textContent=
        "Each selected photo needs a correction description of 8–3000 characters.";}
      return;
    }
    const photoNotes=selectedGallerySlides.length
      ? "Selected photo corrections (slide-specific reviewer instructions; no render authorized):\n"+
        selectedGallerySlides.map(x=>"- Slide "+x.order+" ["+x.id+"]: "+x.instruction).join("\n")
      : "";
    const notes=[freeformNotes,photoNotes].filter(Boolean).join("\n\n");
    if (!notes) {
      if (error) { error.hidden = false; error.textContent = "Describe the changes needed before sending back."; }
      $("factoryFeedbackNotes")?.focus();
      return;
    }
    if (notes.length > 3000) {
      if (error) { error.hidden = false; error.textContent =
        "Combined review notes are too long (3,000 characters maximum). Shorten the slide instructions."; }
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
      if (["return_to_review","return_to_review_held","start_render_review"].includes(pending.payload?.action)) {
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
    root.querySelectorAll("[data-factory-make-ready]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = byId.get(button.getAttribute("data-factory-make-ready"));
        if (!card) { setStatus("Output is no longer in the review snapshot. Refresh Factory.", true); return; }
        button.disabled = true;
        try {
          setStatus("Opening the exact output for remediation. Resolve the shown issue, then refresh Factory; no approval or publication occurs automatically.");
          await openStudioTarget(card);
        } finally { button.disabled = false; }
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
    root.querySelectorAll("[data-factory-handoff-held]").forEach((button) => {
      button.addEventListener("click", async () => {
        const id = button.getAttribute("data-factory-handoff-held");
        const card = byId.get(id);
        if (!card || card.review_hold_active !== true || card.do_not_publish !== true) {
          setStatus("V2 review hold changed. Refresh Factory before proceeding.", true);
          return;
        }
        if (!window.confirm("Complete the protected handoff of the already-approved V2?\\n\\nThis verifies the selected media and releases only its original review hold. It will NOT approve, schedule, or publish the output.")) return;
        button.disabled = true;
        const prior = button.textContent;
        button.textContent = "Verifying protected V2 handoff…";
        button.setAttribute("aria-busy", "true");
        try {
          const receipt = await fetchJson("/api/rendering-review/outputs/" + encodeURIComponent(id) + "/factory-handoff", {
            method: "POST", body: JSON.stringify({ confirm: "PROMOTE-APPROVED-V2-TO-FACTORY" }),
          });
          if (receipt?.ok !== true || receipt?.factory_ready !== true ||
              receipt?.output_id !== id || receipt?.review_hold_active !== false ||
              receipt?.approved_for_publishing !== false ||
              receipt?.scheduled !== false || receipt?.public_post_created !== false) {
            throw new Error("Server did not verify the exact V2 handoff and hold release.");
          }
          state.selectedOutputs.delete(id);
          saveFactorySelection();
          setStatus("Approved V2 handoff verified. Refreshing Factory eligibility; no publishing approval was submitted.");
          await loadFactoryDesk(true);
        } catch (error) {
          setStatus("Protected V2 handoff not completed: " + String(error?.message || error), true);
        } finally {
          button.removeAttribute("aria-busy");
          button.textContent = prior;
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-factory-accept-held]").forEach((button) => {
      button.addEventListener("click",async()=>{
        const id=button.getAttribute("data-factory-accept-held");
        const card=byId.get(id);
        if(!card){setStatus("Held review output not found; refresh Factory.",true);return;}
        button.disabled=true;
        const originalLabel=button.textContent;
        button.textContent="Verifying saved V2…";
        button.setAttribute("aria-busy","true");
        try{
          const reviewed=await readHeldFactoryReview(card);
          if(reviewed.alreadyAccepted){
            state.heldCreativeAccepted.add(card.id);
            if(state.desk)renderDesk(state.desk);
            setStatus("Factory V2 creative acceptance is already saved. Publishing remains held for QA.");
            return;
          }
          if(!window.confirm("Accept the selected V2 creatively in Factory?\\n\\nThis does NOT authorize publishing, release the watermark QA hold, schedule or upload anything."))return;
          button.textContent="Saving creative acceptance…";
          const receipt=await mutateDesk({
            action:"accept_held_creative",kind:"output",id:card.id,
            expected_version:reviewed.session.version,
            client_request_id:"factorycreative_"+crypto.randomUUID().replace(/-/g,""),
          });
          const result=receipt?.result;
          if(result?.factory_creative_accepted!==true||result.qa_pending!==true||
             result.review_hold_active!==true||result.publishing_authorized!==false||
             result.scheduled!==false||result.public_post_created!==false)
            throw new Error("Factory creative acceptance was not verified.");
          state.heldCreativeAccepted.add(card.id);
          if(state.desk)renderDesk(state.desk);
          setStatus("V2 accepted for Factory creative review. Watermark QA and publishing remain held.");
        }catch(error){
          const message=error?.message||String(error);
          setStatus("Factory creative acceptance needs attention: "+message,true);
          window.alert("Factory creative acceptance not confirmed:\\n"+message);
        }finally{
          button.removeAttribute("aria-busy");
          button.textContent=originalLabel;
          button.disabled=false;
        }
      });
    });
    root.querySelectorAll("[data-factory-held-review]").forEach((button) => {
      button.addEventListener("click", async () => {
        const [decision, id] = String(button.getAttribute("data-factory-held-review") || "").split(":");
        const card = byId.get(id);
        if (!card || !(decision === "reject" ? canRejectHeldOutput(card) : canReviewHeldOutput(card))) {
          setStatus("Held output status changed. Refresh Factory before deciding.", true);
          return;
        }
        let note = "";
        if (decision === "reject") {
          const answer = window.prompt("Why are you rejecting this output? Describe the changes needed:");
          if (answer == null || !answer.trim()) return;
          note = answer.trim();
        } else if (!window.confirm(`Approve the creative review of "${cardLabel(card)}"?\\n\\nThe publishing hold remains active. Nothing will be scheduled or posted.`)) {
          return;
        }
        button.disabled = true;
        try {
          await mutateDesk({ action: decision === "approve" ? "approve_held_review" : "reject_held_review",
            id: card.id, kind: "output", note });
          setStatus(decision === "approve"
            ? "Creative review approved. Publishing remains blocked."
            : "Changes requested. Publishing remains blocked.");
        } catch (error) {
          const message = String(error?.message || error);
          setStatus("Held review was not committed: " + message, true);
          window.alert("Held review failed:\\n" + message);
        } finally {
          button.disabled = false;
        }
      });
    });
    root.querySelectorAll("[data-factory-release-approval]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = byId.get(button.getAttribute("data-factory-release-approval"));
        if (!card || !canReleaseForApproval(card)) {
          setStatus("This output is not eligible for a review-hold release. Refresh Factory.", true);
          return;
        }
        if (!window.confirm(`Release the publishing hold on "${cardLabel(card)}" for formal review?\\n\\nThis does NOT approve, schedule, or publish the output. You must separately review the media and click Approve or Request Changes. Protected V2/QA holds cannot be released here.`)) return;
        button.disabled = true;
        try {
          await mutateDesk({ action: "release_for_approval", id: card.id, kind: "output" });
        } catch (error) {
          const message = String(error?.message || error);
          setStatus(message, true);
          window.alert("Release for Approval failed:\\n" + message);
        } finally {
          button.disabled = false;
        }
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
          if(card.review_hold_active===true&&card.do_not_publish===true){
            const reviewed=await readHeldFactoryReview(card);
            openFactoryFeedback({
              title:card.title||cardLabel(card),
              scope:[card.platform,card.studio_output_type,"Held V2 creative redo"].filter(Boolean).join(" · "),
              payload:{action:"return_to_review_held",id:card.id,kind:"output",
                expected_version:reviewed.session.version,
                client_request_id:"factoryreview_"+crypto.randomUUID().replace(/-/g,"")},
            });
            return;
          }
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
    const searching = Boolean(String(state.needsEyesSearch || "").trim());
    // Display exactly the still-selectable review queue, excluding every
    // submitted output while durable Activity owns its progress and failures.
    const visibleNeedsEyes = factoryVisibleNeedsEyes(desk.lanes?.needs_eyes);
    // Operators should see the very small actionable unheld review cohort
    // before long publication-held preview queues, even with 12-group paging.
    // Display order cannot grant approval or change the canonical Factory state.
    visibleNeedsEyes.sort((a, b) => Number(factoryUnheldReviewCandidate(b))
      - Number(factoryUnheldReviewCandidate(a)));
    const attentionCards = factoryReviewAttentionCards(desk.lanes?.needs_eyes);
    const manualCards = [...(desk.lanes?.manual || [])];
    const inManual = new Set(manualCards.map(card => String(card.id || "")));
    for (const card of attentionCards) {
      if (!inManual.has(String(card.id || ""))) manualCards.push(card);
    }
    const filtered = (cards) => (cards || []).filter(card =>
      searching || factoryMatchesProfile(card));
    const visibleDesk = desk;
    // Global counts come from the authoritative Desk summary. With a Factory
    // filter, only rows in the returned snapshot are counted and labelled.
    const summary = factoryProfileId() ? {
      auto_high: filtered(desk.lanes?.auto_high).length,
      needs_eyes: filtered(visibleNeedsEyes).length,
      needs_assets_pile: filtered(desk.lanes?.needs_assets).length,
      needs_assets_max: desk.summary?.needs_assets_max || 3,
      manual: filtered(manualCards).length,
    } : { ...desk.summary,
      needs_eyes: filtered(visibleNeedsEyes).length,
      manual: filtered(manualCards).length,
    };
    // #2563: show the exact Meta repair inventory on the first Factory screen,
    // not beneath the long Producer Progress and approval-activity sections.
    // This is a view-only filter, never an approval or publishing action.
    // #2563: keep Studio-owned blocked repairs visible even while the Repair
    // accordion is collapsed. The user should not have to hunt for 118 holds.
    const metaRepairs = filtered(manualCards).filter(card => card.meta_repair_required === true);
    const metaCount = metaRepairs.length;
    const missingCount = metaRepairs.filter(card => (card.meta_repair_missing_assets || []).length > 0).length;
    const needsUserCount = metaRepairs.filter(card => card.meta_repair_user_action_required === true).length;
    const providerCount = metaRepairs.filter(card => /Meta publication verification|Meta dispatch preflight/.test(String(card.meta_repair_reason || ""))).length;
    const fbCount = metaRepairs.filter(card => card.platform === "Facebook").length;
    const igCount = metaRepairs.filter(card => card.platform === "Instagram").length;
    if (!metaCount) state.metaRecoveryOnly = false;
    if (state.metaRecoveryOnly) summary.manual = metaCount;
    renderSummary(summary);
    const factoryRoot = $("page-factory");
    const statusBar = $("factoryDeskStatus");
    const fallbackLanes = factoryRoot?.querySelector(".factory-lanes");
    if (statusBar || fallbackLanes) {
      let notice = $("factoryMetaRepairNotice");
      if (!notice) {
        notice = document.createElement("section");
        notice.id = "factoryMetaRepairNotice";
        notice.className = "factory-meta-repair-notice";
        notice.setAttribute("role", "status");
      }
      // The old insertion point was inside .factory-lanes, far below
      // Producer Change Request Progress, activity and several toolbars.
      // Move an existing notice as well as newly created ones.
      if (statusBar) statusBar.insertAdjacentElement("afterend", notice);
      else fallbackLanes.prepend(notice);
      notice.hidden = metaCount === 0;
      if (metaCount) {
        notice.innerHTML = `<div class="factory-meta-repair-copy">
            <strong>${metaCount} Instagram/Facebook outputs awaiting repair — not Producer change requests</strong>
            <span>${fbCount} Facebook · ${igCount} Instagram · ${missingCount} with missing-media evidence · ${providerCount} requiring provider verification</span>
            <small>These outputs are in Repair → Needs Attention, not the Producer Change Request Progress panel. ${needsUserCount} currently require your action; the remaining recovery work is Studio-owned.</small>
          </div>
          <button type="button" class="secondary-button">${state.metaRecoveryOnly ? "Show all Repair items" : "View affected outputs"} (${metaCount})</button>`;
        notice.querySelector("button")?.addEventListener("click", () => {
          state.metaRecoveryOnly = !state.metaRecoveryOnly;
          renderDesk(state.desk);
          const band = $("factoryBandBodyManual")?.closest(".factory-band");
          if (band?.classList.contains("is-collapsed")) {
            band.querySelector("[data-factory-band-toggle]")?.click();
          }
          band?.scrollIntoView?.({ behavior: "smooth", block: "start" });
        });
      }
    }
    const visibleNote = $("factoryProfileScopeNote");
    if (visibleNote) visibleNote.textContent = factoryProfileId()
      ? "Filtered counts show visible queue rows." : "Global counts from the Factory queue.";
    renderLane("factoryLaneAutoHigh", filtered(desk.lanes?.auto_high), "Nothing in active produce/render right now.", { lane: "auto_high" });
    renderLane("factoryLaneNeedsEyes", filtered(visibleNeedsEyes), "No Ready for Review items waiting on eyes.", { lane: "needs_eyes", groupContent: true });
    renderLane("factoryLaneNeedsAssets", filtered(desk.lanes?.needs_assets), "Pile empty — add up to 3 from candidates below.", { pile: true, lane: "needs_assets" });
    renderLane("factoryLaneManual", filtered(state.metaRecoveryOnly
      ? manualCards.filter(card => card.meta_repair_required === true)
      : manualCards), "No outputs need remediation.", { lane: "manual" });
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
    if (ready.length < 2) {
      setStatus("This content does not have multiple outputs waiting for approval.", true);
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
    if(payload?.action==="return_to_review_held"){
      // A held, creatively accepted version has an EXISTING review session.
      // Resume that conversation; never try to enroll a second session.
      const receipt=await fetchJson("/api/rendering-review/outputs/"+
        encodeURIComponent(payload.id)+"/request-redo",{
        method:"POST",
        body:JSON.stringify({note:payload.note,
          client_request_id:payload.client_request_id,
          expected_version:payload.expected_version}),
      });
      if(receipt?.redo_requested!==true||receipt.review_hold_active!==true||
         receipt.render_queued!==false||receipt.public_post_created!==false)
        throw new Error("Held revision request was not durably verified");
      state.heldCreativeAccepted.delete(payload.id);
      const message="Creative revision requested in the existing Producer conversation. V2 is preserved; nothing was rendered or published.";
      return {ok:true,result:{...receipt,review_notes_saved:true,message},message};
    }
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
    } else if (desk.ok && payload.action === "accept_held_creative") {
      // The exact-version acceptance POST is already committed and includes
      // a checked receipt. The click handler updates its row immediately.
      // Do NOT start a second expensive Desk read that can mask success
      // with an unrelated "Loading Factory Desk" status.
      setStatus(savedMessage);
      return desk;
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
    refreshFactoryApprovalPolicy().catch(() => {});
    reconcilePersistedFactoryPending(true).catch(() => {});
    setStatus("Loading Factory Desk…");
    try {
      // Fetch independently of the expensive Factory queue; activity remains visible during a slow desk refresh.
      refreshFactoryBatchActivity().catch(() => {});
      if (!state.batchTimer) state.batchTimer = setInterval(() => {
        if (!document.hidden && $("page-factory")?.classList.contains("active")) {
          updateFactoryBatchFreshness();
          reconcilePersistedFactoryPending().catch(() => {});
          refreshFactoryBatchActivity().catch(() => {});
        }
      }, 3000);
      const desk = await fetchJson("/api/factory/desk", { cache: "no-store" });
      renderDesk(desk);
      if (state.batchSubmissionError) setStatus(state.batchSubmissionError, true);
      else setStatus(desk.warning || "Factory Desk ready.");
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

  $("factoryBatchSubmit")?.addEventListener("click", () => {
    if (state.submittingBatch) return;
    // Do this synchronously on click, before the policy fetch or approval POST.
    // If preflight definitively refuses the request, the finally block restores
    // the selectable rows. Accepted/uncertain batches remain hidden via the
    // durable pending, recovery, accepted and Activity fences.
    const clickedCards = readyFactoryOutputs(true)
      .filter(card => state.selectedOutputs.has(card.id));
    const clicked = clickedCards.map(card => card.id);
    factoryShowSubmissionPreview(clickedCards);
    for (const id of clicked) state.submissionIntentIds.add(id);
    if (clicked.length && state.desk) renderDesk(state.desk);
    submitFactoryBatchApprovals()
      .catch((error) => setBatchSubmissionError(error.message || String(error)))
      .finally(() => {
        for (const id of clicked) state.submissionIntentIds.delete(id);
        if (state.desk) renderDesk(state.desk);
      });
  });
  $("factoryBatchClear")?.addEventListener("click", () => {
    if (state.submittingBatch) return;
    localStorage.removeItem(FACTORY_WAITING_SELECTION_KEY);
    state.selectedOutputs.clear();
    const dropped = clearFactoryRecoveryFences({ onlyUnrecoverable: false });
    // Clear selection does not cancel a server-owned approval. Never restore
    // accepted outputs to Needs Eyes just by clearing the checkbox selection.
    setBatchSubmissionError(null);
    setStatus(dropped
      ? `Selection cleared. Removed ${dropped} stuck saved submission${dropped === 1 ? "" : "s"} from this browser.`
      : "Selection cleared.");
    saveFactorySelection();
    updateFactoryBatchToolbar();
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
      refreshFactoryBatchActivity(true).catch(() => {});
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
  renderFactoryBatchActivity(state.batch);
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
