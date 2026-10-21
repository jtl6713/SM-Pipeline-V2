/**
 * Factory Batch V2 — read-only Quality Agent signals from the authoritative
 * R2-backed GET /api/factory/approval-batches endpoint.
 *
 * This is NOT the Quality Agent ticket inventory. It is an operational health
 * panel scoped to Factory's optional city filter or the Operations profile.
 * No approval POST or publishing action is performed here.
 */
(() => {
  const $ = (id) => document.getElementById(id);
  const CODES = Object.freeze({
    "QA-FACTORY-BATCH-STALLED": {
      title: "Approval batch stalled",
      guidance: "Background recovery may resume after the lease expires. Refresh status before intervening.",
      severity: "warning"
    },
    "QA-FACTORY-BATCH-RECOVERY-FAILED": {
      title: "Approval recovery needs attention",
      guidance: "No successful approval after 30 minutes. Inspect the Factory processor and outstanding queue.",
      severity: "critical"
    },
    "QA-FACTORY-BATCH-STATE-MISMATCH": {
      title: "Batch status needs reconciliation",
      guidance: "The stored status and item results disagree. Check whether background reconciliation has completed.",
      severity: "warning"
    },
    "QA-FACTORY-BATCH-DUPLICATE-ITEM": {
      title: "Duplicate output IDs in batch",
      guidance: "Stop and inspect this batch. Do not retry until the duplicate ledger is investigated.",
      severity: "critical"
    },
    "QA-FACTORY-BATCH-TRANSIENT-WAIT": {
      title: "Waiting for a scheduled retry",
      guidance: "Backoff is active. Do not manually bypass the next-attempt time.",
      severity: "info"
    },
    "QA-FACTORY-BATCH-FAILED-ITEM": {
      title: "Approval item failed",
      guidance: "Inspect failed items in Factory. Only use Retry Failed after resolving the cause.",
      severity: "warning"
    }
  });

  const state = { sequence: 0, profile: "", lastRequest: 0, inFlight: false, failures: [], recovering: false, actionSummary: "" };
  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const panelIds = ["factoryBatchQualitySignals", "operationsFactoryBatchQualitySignals"];
  function isFactoryView() { return $("page-factory")?.classList.contains("active") || false; }
  function selectedProfile() { return String((isFactoryView() ? $("factoryProfileFilter") : $("studioProfileSelect"))?.value || "").trim(); }
  function isVisible(id) {
    const node = $(id);
    if (!node) return false;
    if (id === "factoryBatchQualitySignals") return $("page-factory")?.classList.contains("active") || false;
    return $("operationsAgentView")?.hidden === false
      && ($("page-operations")?.classList.contains("active") || false);
  }
  function panelMarkup({ profileId, data, error }) {
    if (data?.scope !== "all" && !/^rec[A-Za-z0-9]+$/.test(profileId)) {
      return '<p class="subtle">Select a Content Profile to check Factory batches.</p>';
    }
    if (error) {
      return `<p class="factory-batch-quality-unavailable">Factory batch monitoring temporarily unavailable: ${esc(error)}. Refresh to retry; do not resubmit an uncertain approval.</p>`;
    }
    if (data?.quality_status === "unavailable" || data?.ok === false) {
      return '<p class="factory-batch-quality-unavailable">Quality Agent cannot verify authoritative batch status right now. Factory approvals are not blocked. Refresh monitoring later; do not resubmit uncertain approvals.</p>';
    }
    if (!data || !Array.isArray(data.quality_signals)) {
      return '<p class="factory-batch-quality-unavailable">Worker has not supplied Quality Agent batch signals. Do not assume there are no findings.</p>';
    }
    // Failed platform outputs are a separate census, not Factory approval batches.
    const failures = data.output_failures;
    const allFailures = failures?.status === "ok" && Array.isArray(failures.items) ? failures.items : [];
    const eligible = allFailures.filter(item => item.can_return_to_approved && /^rec[A-Za-z0-9]+$/.test(item.record_id || ""));
    const failureMarkup = !failures || failures.status !== "ok"
      ? '<p class="factory-batch-quality-unavailable">Failed-output Quality Agent status unavailable. Unresolved output count is unknown; do not treat this as zero.</p>'
      : `<p class="factory-batch-quality-heading">Unresolved output failures across all profiles: ${Number(failures.count) || 0}</p>
        ${eligible.length ? '<p class="factory-quality-bulk"><button type="button" class="secondary-button" data-qa-reapprove-all>Return all ' + eligible.length + ' eligible to Approved</button><small>48-hour Facebook cooldown, MAE rescheduling, no immediate posting</small></p>' : ''}
        ${state.actionSummary ? '<p class="factory-quality-result" role="status">' + esc(state.actionSummary) + '</p>' : ''}
        ${allFailures.length ? '<ul class="factory-batch-quality-list">' +
          allFailures.map(item => `<li class="factory-batch-quality-item" data-qa-output="${esc(item.record_id || "")}" data-qa-profile="${esc(item.profile_id || "")}">
            <button type="button" class="factory-quality-open" data-qa-open="${esc(item.record_id || "")}" title="Open exact output in Pipeline">${esc(item.profile_name || item.profile_id || "Profile not linked")} · Output ${esc(item.output_id || item.record_id)} · ${esc(item.platform || "Unknown platform")} ${esc(item.output_type || "")} ↗</button>
            <p>${esc(item.error || "No diagnostic provided")}</p>
            <p class="factory-batch-quality-action">${esc(item.action || "Review the failure.")}</p>
            <small>Recovery: ${esc(item.recovery || "needs_attention")}</small>
            ${item.can_return_to_approved ? `<p><button type="button" class="secondary-button" data-qa-reapprove="${esc(item.record_id || "")}">Return to Approved</button></p>` : ""}
            ${item.return_to_approved_blocked && item.return_to_approved_blocked !== "not_facebook" && item.return_to_approved_blocked !== "not_rate_limited" ? `<small class="factory-quality-blocked">Manual reset blocked: ${esc(item.return_to_approved_blocked)}</small>` : ""}
          </li>`).join("") + '</ul>' : '<p>No unresolved output failures found in the completed scan.</p>'}`;
    if (!data.job_id) {
      return data?.quality_status === "partial"
        ? failureMarkup + '<p class="factory-batch-quality-unavailable">Partial batch monitoring window. No findings were returned from the scanned records; older activity was not verified.</p>'
        : failureMarkup + '<p class="subtle">No active Factory batches requiring attention in the checked window.</p>';
    }
    const global = data.scope === "all";
    const partialNotice = data?.quality_status === "partial"
      ? '<p class="factory-batch-quality-unavailable">Partial monitoring snapshot: not all older batches were checked.</p>'
      : "";
    const total = Number(data.total) || 0;
    const pending = Number(global ? data.totals?.pending : data.pending_count) || 0;
    const failed = Number(global ? data.totals?.failed : data.failed_count) || 0;
    const countMismatch = !global && total !== (
      (Number(data.approved_count) || 0) +
      (Number(data.skipped_count) || 0) + pending + failed
    );
    const signals = data.quality_signals.slice(0, 20);
    const rowMarkup = signals.map((signal) => {
      const key = String(signal?.code || "");
      const catalog = CODES[key] || {
        title: key || "Unknown Factory batch finding",
        guidance: "Inspect the batch details before attempting any manual recovery.",
        severity: "warning"
      };
      return `<li class="factory-batch-quality-item factory-batch-quality-${esc(catalog.severity)}">
        <strong>${esc(catalog.title)}</strong>
        <details class="factory-batch-quality-tech"><summary>Technical code</summary><code>${esc(key)}</code></details>
        ${signal?.detail ? `<p>${esc(signal.detail)}</p>` : ""}
        <p class="factory-batch-quality-action">${esc(catalog.guidance)}</p>
      </li>`;
    }).join("");
    return `${failureMarkup}${partialNotice}<p class="factory-batch-quality-meta">${global ? `${Number(data.totals?.batches)||0} active Factory batches` : `${total} latest batch outputs`} · ${pending} pending · ${failed} failed</p>
      ${countMismatch ? '<p class="factory-batch-quality-unavailable">Batch totals disagree: investigate status reconciliation.</p>' : ""}
      ${signals.length ? `<p class="factory-batch-quality-heading">${signals.length} Quality Agent finding${signals.length === 1 ? "" : "s"} for this batch</p>
        <ul class="factory-batch-quality-list">${rowMarkup}</ul>`
         : `<p class="factory-batch-quality-clear">No Quality Agent findings in ${global ? "recent Factory batches" : "the latest batch"} (approval batches only).</p>`}`;
  }

  function render(profileId, data, error = "") {
    if (data?.output_failures?.status === "ok") state.failures = data.output_failures.items || [];
    const metric = $("factoryBatchQualityMetric");
    if (metric) metric.textContent = error || data?.quality_status !== "ok" || data?.output_failures?.status !== "ok"
      ? "!" : String((data?.quality_signals?.length || 0) + (data?.output_failures?.count || 0));
    const html = panelMarkup({ profileId, data, error });
    for (const id of panelIds) {
      const node = $(id);
      if (node) node.innerHTML = html;
    }
  }

  async function refresh(force = false) {
    const profileId = selectedProfile();
    const global = isFactoryView();
    const now = Date.now();
    const scopeKey = (global ? "all:" : "profile:") + profileId;
    if (!force && state.inFlight && state.profile === scopeKey) return;
    if (!force && state.profile === scopeKey && now - state.lastRequest < 12000) return;
    if (!force && !panelIds.some(isVisible)) return;
    const sequence = ++state.sequence;
    state.profile = (global ? "all:" : "profile:") + profileId;
    state.lastRequest = now;
    if (!global && !/^rec[A-Za-z0-9]+$/.test(profileId)) { render(profileId, null); return; }
    state.inFlight = true;
    try {
      const query = global ? new URLSearchParams({ scope: "all" }) : new URLSearchParams({ profile: profileId });
      if (global && profileId) query.set("factory_profile", profileId);
      if (global) query.set("quality_only", "1");
      if (global && force) query.set("fresh_output_failures", "1");
      const response = await fetch("/api/factory/approval-batches?" + query, {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (sequence !== state.sequence || selectedProfile() !== profileId || isFactoryView() !== global) return;
      render(profileId, data);
    } catch (error) {
      if (sequence !== state.sequence || selectedProfile() !== profileId || isFactoryView() !== global) return;
      render(profileId, null, error?.message || String(error));
    } finally {
      if (sequence === state.sequence) state.inFlight = false;
    }
  }

  async function openQualityOutput(recordId, profileId) {
    if (!/^rec[A-Za-z0-9]+$/.test(recordId)) return;
    const select = $("studioProfileSelect");
    if (select && /^rec[A-Za-z0-9]+$/.test(profileId) && select.value !== profileId) {
      select.value = profileId;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    }
    try {
      if (typeof window.StudioOpenPipelineOutputById === "function") {
        await window.StudioOpenPipelineOutputById(recordId);
        return;
      }
    } catch (error) {
      state.actionSummary = "Exact-output navigation could not complete: " + (error.message || error);
    }
    document.querySelector('.nav-item[data-page="outputs"]')?.click();
  }

  async function recoverQualityOutputs(items, bulk) {
    if (state.recovering) return;
    const allowed = (items || []).filter(item => item.can_return_to_approved && /^rec[A-Za-z0-9]+$/.test(item.record_id || ""));
    if (!allowed.length) return;
    if (bulk && !window.confirm("Return " + allowed.length + " eligible Facebook rate-limit failures to Approved? Each will receive a cooldown-paced MAE slot; nothing publishes immediately.")) return;
    state.recovering = true;
    state.actionSummary = "Rescheduling " + allowed.length + " eligible output(s) after Facebook cooldown…";
    render(selectedProfile(), { quality_status: "ok", quality_signals: [], output_failures: { status: "ok", count: state.failures.length, items: state.failures } });
    const results = [];
    try {
      // Sequential requests are deliberate. With the legacy non-atomic scheduling
      // flag, simultaneous resets could select the same available Facebook slot.
      for (const item of allowed) {
        try {
          const res = await fetch("/api/operations/outputs/" + encodeURIComponent(item.record_id) + "/schedule", {
            method: "POST", credentials: "same-origin", cache: "no-store",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ quality_rate_limit_recovery: true }),
          });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || body.ok === false) throw new Error(body.error || body.message || "HTTP " + res.status);
          results.push({ id: item.output_id || item.record_id, ok: true });
        } catch (error) {
          results.push({ id: item.output_id || item.record_id, ok: false, error: error.message || String(error) });
        }
      }
      const successes = results.filter(result => result.ok).length;
      const failures = results.filter(result => !result.ok);
      state.actionSummary = successes + " returned to Approved with paced MAE schedules; " +
        failures.length + " blocked or unsuccessful." + (failures.length
          ? " " + failures.slice(0, 6).map(result => result.id + ": " + result.error).join("; ")
          : "");
      await refresh(true);
    } finally {
      state.recovering = false;
      const summaries = document.querySelectorAll(".factory-quality-result");
      for (const el of summaries) el.textContent = state.actionSummary;
    }
  }

  document.addEventListener("click", (event) => {
    const bulk = event.target.closest?.("[data-qa-reapprove-all]");
    if (bulk) {
      event.preventDefault();
      recoverQualityOutputs(state.failures, true).catch(error => { state.actionSummary = String(error); state.recovering = false; });
      return;
    }
    const single = event.target.closest?.("[data-qa-reapprove]");
    if (single) {
      event.preventDefault();
      const item = state.failures.find(row => row.record_id === single.dataset.qaReapprove);
      if (item) recoverQualityOutputs([item], false).catch(error => { state.actionSummary = String(error); state.recovering = false; });
      return;
    }
    const title = event.target.closest?.("[data-qa-open]");
    const card = event.target.closest?.("[data-qa-output]");
    if (title || card) {
      const id = title?.dataset.qaOpen || card?.dataset.qaOutput;
      const profile = card?.dataset.qaProfile || "";
      openQualityOutput(id, profile).catch(() => {});
    }
  });

  function refreshSoon() { window.setTimeout(() => { refresh(true).catch(() => {}); }, 0); }
  $("factoryBatchQualityRefresh")?.addEventListener("click", refreshSoon);
  $("operationsFactoryBatchQualityRefresh")?.addEventListener("click", refreshSoon);
  $("studioProfileSelect")?.addEventListener("change", () => { if (!isFactoryView()) refreshSoon(); });
  $("factoryProfileFilter")?.addEventListener("change", refreshSoon);
  document.addEventListener("click", (event) => {
    if (event.target.closest?.("#operationsViewAgent, #navFactory, #navOperations, [data-ops-tab]")) refreshSoon();
    if (event.target.closest?.("#factoryBatchRefresh, #factoryBatchRetry, #factoryBatchSubmit")) refreshSoon();
  });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && panelIds.some(isVisible)) refreshSoon();
  });
  window.addEventListener("focus", () => {
    if (panelIds.some(isVisible)) refreshSoon();
  });
  window.setInterval(() => {
    if (!document.hidden && panelIds.some(isVisible)) refresh().catch(() => {});
  }, 30000);
  refreshSoon();
  window.StudioFactoryBatchQuality = Object.freeze({ refresh });
})();
