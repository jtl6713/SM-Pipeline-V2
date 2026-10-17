/**
 * Factory Batch V2 — read-only Quality Agent signals from the authoritative
 * R2-backed GET /api/factory/approval-batches endpoint.
 *
 * This is NOT the Quality Agent ticket inventory. It is an operational health
 * panel scoped to the currently selected Content Profile's latest batch.
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

  const state = { sequence: 0, profile: "", lastRequest: 0, inFlight: false };
  const esc = (value) => String(value == null ? "" : value)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  const panelIds = ["factoryBatchQualitySignals", "operationsFactoryBatchQualitySignals"];
  function selectedProfile() { return String($("studioProfileSelect")?.value || "").trim(); }
  function isVisible(id) {
    const node = $(id);
    if (!node) return false;
    if (id === "factoryBatchQualitySignals") return $("page-factory")?.classList.contains("active") || false;
    return $("operationsAgentView")?.hidden === false
      && ($("page-operations")?.classList.contains("active") || false);
  }
  function panelMarkup({ profileId, data, error }) {
    if (!/^rec[A-Za-z0-9]+$/.test(profileId)) {
      return '<p class="subtle">Select a Content Profile to check Factory batches.</p>';
    }
    if (error) {
      return `<p class="factory-batch-quality-unavailable">Factory batch monitoring temporarily unavailable: ${esc(error)}. Refresh to retry; do not resubmit an uncertain approval.</p>`;
    }
    if (!data || !Array.isArray(data.quality_signals)) {
      return '<p class="factory-batch-quality-unavailable">Worker has not supplied Quality Agent batch signals. Do not assume there are no findings.</p>';
    }
    if (!data.job_id) return '<p class="subtle">No recent Factory batch for the selected Content Profile.</p>';
    const total = Number(data.total) || 0;
    const pending = Number(data.pending_count) || 0;
    const failed = Number(data.failed_count) || 0;
    const countMismatch = total !== (
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
        <span class="factory-batch-quality-code">${esc(key)}</span>
        ${signal?.detail ? `<p>${esc(signal.detail)}</p>` : ""}
        <p class="factory-batch-quality-action">${esc(catalog.guidance)}</p>
      </li>`;
    }).join("");
    return `<p class="factory-batch-quality-meta">Batch ${esc(data.job_id)} · ${total} outputs · ${pending} pending · ${failed} failed · ${esc(data.updated_at ? new Date(data.updated_at).toLocaleString() : "Status available")}</p>
      ${countMismatch ? '<p class="factory-batch-quality-unavailable">Batch totals disagree: investigate status reconciliation.</p>' : ""}
      ${signals.length ? `<p class="factory-batch-quality-heading">${signals.length} Quality Agent finding${signals.length === 1 ? "" : "s"} for this batch</p>
        <ul class="factory-batch-quality-list">${rowMarkup}</ul>`
        : '<p class="factory-batch-quality-clear">No Quality Agent findings in the latest batch.</p>'}`;
  }

  function render(profileId, data, error = "") {
    const html = panelMarkup({ profileId, data, error });
    for (const id of panelIds) {
      const node = $(id);
      if (node) node.innerHTML = html;
    }
  }

  async function refresh(force = false) {
    const profileId = selectedProfile();
    const now = Date.now();
    if (!force && state.profile === profileId && now - state.lastRequest < 3000) return;
    if (!force && !panelIds.some(isVisible)) return;
    const sequence = ++state.sequence;
    state.profile = profileId;
    state.lastRequest = now;
    if (!/^rec[A-Za-z0-9]+$/.test(profileId)) { render(profileId, null); return; }
    state.inFlight = true;
    try {
      const query = new URLSearchParams({ profile: profileId });
      const response = await fetch("/api/factory/approval-batches?" + query, {
        method: "GET", credentials: "same-origin", cache: "no-store",
        headers: { Accept: "application/json" }
      });
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (sequence !== state.sequence || selectedProfile() !== profileId) return;
      render(profileId, data);
    } catch (error) {
      if (sequence !== state.sequence || selectedProfile() !== profileId) return;
      render(profileId, null, error?.message || String(error));
    } finally {
      if (sequence === state.sequence) state.inFlight = false;
    }
  }

  function refreshSoon() { window.setTimeout(() => { refresh(true).catch(() => {}); }, 0); }
  $("factoryBatchQualityRefresh")?.addEventListener("click", refreshSoon);
  $("operationsFactoryBatchQualityRefresh")?.addEventListener("click", refreshSoon);
  $("studioProfileSelect")?.addEventListener("change", refreshSoon);
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
  }, 15000);
  refreshSoon();
  window.StudioFactoryBatchQuality = Object.freeze({ refresh });
})();
