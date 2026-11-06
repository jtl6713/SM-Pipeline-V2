(() => {
  const host = document.getElementById("allProfilesOverview");
  if (!host) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const platformOrder = ["Facebook","Instagram","TikTok","YouTube"];
  // V6 caches approved per-output calendar dates so future/past-due boundaries
  // move with the clock, including while a durable snapshot stays cached.
  const CACHE_KEY = "studio.allProfilesOverview.v6";
  const REFRESH_KEY = "studio.allProfilesOverview.refresh.v1";
  const POLL_MS = 12000;
  const REFRESH_POLL_MS = 1800;
  // The Worker expires abandoned refresh operations after 120s. Keep a small
  // client grace period, then stop painting "Refreshing…" if browser storage
  // contains an orphaned operation from another tab/session.
  const REFRESH_INTENT_MAX_MS = 150000;
  const state = {
    rows: [],
    timer: 0,
    refreshTimer: 0,
    loading: false,
    deferred: false,
    followUp: false,
    cacheAt: 0,
    snapshotGeneration: "",
    summaryVersion: 0,
    ideasAt: 0,
    manualRefreshing: false,
    refreshOperationId: "",
    refreshMessage: "",
    refreshTone: "",
  };

  function approvedCalendarCounts(row, now = Date.now()) {
    const byPlatform = {};
    let future = 0, pastDue = 0;
    for (const platform of platformOrder) {
      const slots = row?.approved_calendar_slots?.[platform] || [];
      byPlatform[platform] = slots.filter((due) => due > now).length;
      future += byPlatform[platform];
      pastDue += slots.length - byPlatform[platform];
    }
    const awaitingByPlatform = row?.awaiting_final_by_platform || {};
    const pipelineByPlatform = Object.fromEntries(platformOrder.map((platform) => [
      platform, byPlatform[platform] + (Number(awaitingByPlatform[platform]) || 0),
    ]));
    const awaiting = platformOrder.reduce((sum, platform) => sum + (Number(awaitingByPlatform[platform]) || 0), 0);
    const pipelineTotal = future + awaiting;
    return {
      byPlatform, future, pastDue, awaiting, pipelineByPlatform,
      pipelineTotal, ideasNeeded: Math.ceil(Math.max(0, 500 - pipelineTotal) / 5),
      missingDate: Number(row?.approved_missing_date) || 0,
    };
  }

  function validOverviewRows(rows) {
    if (!Array.isArray(rows) || !rows.length) return false;
    const ids = new Set();
    const cities = new Set();
    for (const row of rows) {
      const id = String(row?.id || "").trim();
      const city = String(row?.city_label || row?.name || "").trim().toLowerCase();
      if (!/^rec[A-Za-z0-9]{14}$/.test(id) || !city || ids.has(id) || cities.has(city)) return false;
      ids.add(id);
      cities.add(city);
      for (const platform of platformOrder) {
        if (!Number.isFinite(Number(row?.scheduled?.[platform]))) return false;
      }
      for (const kind of ["manual", "failed", "approval", "ideas", "approved_unpublished", "overdue_unpublished", "approved_future", "approved_past_due", "approved_missing_date", "pipeline_total"]) {
        if (typeof row?.[kind] !== "number" || !Number.isFinite(row[kind]) || row[kind] < 0) return false;
      }
      for (const platform of platformOrder) {
        const dates = row?.approved_calendar_slots?.[platform];
        if (!Array.isArray(dates) || dates.some((due) => !Number.isFinite(due) || due <= 0)) return false;
        if (!Number.isInteger(row?.approved_future_by_platform?.[platform])) return false;
        if (!Number.isInteger(row?.awaiting_final_by_platform?.[platform])) return false;
        if (row?.pipeline_by_platform?.[platform] !== row.approved_future_by_platform[platform] + row.awaiting_final_by_platform[platform]) return false;
      }
    }
    return true;
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!validOverviewRows(parsed?.rows)) {
        localStorage.removeItem(CACHE_KEY);
        sessionStorage.removeItem(CACHE_KEY);
        return null;
      }
      return {
        rows: parsed.rows,
        at: Number(parsed.at) || 0,
        generation: String(parsed.generation || ""),
        summaryVersion: Number(parsed.summaryVersion || 0),
        ideasAt: Number(parsed.ideasAt || 0),
      };
    } catch {
      return null;
    }
  }

  function writeCache(rows, metadata = {}) {
    if (!validOverviewRows(rows)) return;
    const authoritativeAt = Number(metadata.snapshotAt || 0);
    if (authoritativeAt > 0) state.cacheAt = authoritativeAt;
    if (metadata.generation != null) state.snapshotGeneration = String(metadata.generation || "");
    if (metadata.summaryVersion != null) state.summaryVersion = Number(metadata.summaryVersion) || 0;
    if (metadata.ideasAt != null) state.ideasAt = Number(metadata.ideasAt || 0);
    const payload = JSON.stringify({
      rows,
      at: state.cacheAt,
      generation: state.snapshotGeneration,
      summaryVersion: state.summaryVersion,
      ideasAt: state.ideasAt,
    });
    try { localStorage.setItem(CACHE_KEY, payload); } catch { /* ignore quota */ }
    try { sessionStorage.setItem(CACHE_KEY, payload); } catch { /* ignore quota */ }
  }

  function readRefreshIntent() {
    try {
      const raw = localStorage.getItem(REFRESH_KEY) || sessionStorage.getItem(REFRESH_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.operationId) return null;
      const intent = {
        operationId: String(parsed.operationId),
        requestedAt: String(parsed.requestedAt || ""),
      };
      const requestedMs = Date.parse(intent.requestedAt);
      if (!Number.isFinite(requestedMs) || Date.now() - requestedMs >= REFRESH_INTENT_MAX_MS) {
        clearRefreshIntent();
        return null;
      }
      return intent;
    } catch {
      return null;
    }
  }

  function writeRefreshIntent(operationId, requestedAt = "") {
    const payload = JSON.stringify({ operationId: String(operationId || ""), requestedAt: String(requestedAt || "") });
    try { localStorage.setItem(REFRESH_KEY, payload); } catch { /* ignore quota */ }
    try { sessionStorage.setItem(REFRESH_KEY, payload); } catch { /* ignore quota */ }
  }

  function clearRefreshIntent() {
    try { localStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
    try { sessionStorage.removeItem(REFRESH_KEY); } catch { /* ignore */ }
  }

  function cacheAgeLabel() {
    if (!state.cacheAt || !Number.isFinite(state.cacheAt)) return "age unavailable";
    const seconds = Math.max(0, Math.floor((Date.now() - state.cacheAt) / 1000));
    if (seconds < 60) return `${seconds}s old`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m old`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m old`;
    return `${Math.floor(seconds / 86400)}d ${Math.floor((seconds % 86400) / 3600)}h old`;
  }

  function snapshotUpdateLabel() {
    if (!state.cacheAt) return "Updated";
    const seconds = Math.max(0, Math.floor((Date.now() - state.cacheAt) / 1000));
    const age = seconds < 60 ? "Updated just now" : `Updated ${cacheAgeLabel().replace(/ old$/, "")} ago`;
    try {
      const clock = new Date(state.cacheAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
      return clock ? `${age} · ${clock}` : age;
    } catch {
      return age;
    }
  }

  function isOverviewSoftFailure(error) {
    const name = String(error?.name || "");
    const message = String(error?.message || error || "");
    return name === "AbortError"
      || name === "TimeoutError"
      || /timed?\s*out|timeout after|aborted|HTTP 429|cooling down|rate.?limit|too many requests/i.test(message);
  }

  async function json(url, { timeoutMs = 8000, method = "GET", body } = {}) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    const headers = { Accept: "application/json" };
    if (method !== "GET" && method !== "HEAD") headers["Content-Type"] = "application/json";
    try {
      const response = await fetch(url, {
        method,
        credentials: "same-origin",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
        signal: controller?.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (error) {
      if (error?.name === "AbortError" || error?.name === "TimeoutError") {
        const soft = new Error(`Timeout after ${timeoutMs}ms`);
        soft.name = "TimeoutError";
        soft.soft = true;
        throw soft;
      }
      throw error;
    } finally {
      if (timer) window.clearTimeout(timer);
    }
  }

  function tone(value, kind) {
    const n = Number(value) || 0;
    if (kind === "approval") return n === 0 ? "ok" : n <= 5 ? "warn" : "critical";
    if ("ideas" === kind) return n === 0 ? "ok" : n <= 4 ? "warn" : "critical";
    return n === 0 ? "ok" : n <= 2 ? "warn" : "critical";
  }

  function actionCount(row, kind, label, countOverride = row?.[kind]) {
    const value = Number(countOverride) || 0;
    if (!value || !row?.id) return String(value);
    return `<button type="button" class="overview-action-count" data-overview-profile="${esc(row.id)}" data-overview-action="${esc(kind)}" aria-label="Open ${esc(label)} for ${esc(row.name)}">${value}</button>`;
  }

  function activateStudioPage(pageName) {
    document.querySelectorAll(".nav-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.page === pageName);
    });
    document.querySelectorAll(".page").forEach((page) => page.classList.remove("active"));
    document.getElementById(`page-${pageName}`)?.classList.add("active");
  }

  function openOverviewAction(profileId, kind) {
    if (kind === "ideas") {
      const profile = document.getElementById("studioProfileSelect");
      if (profile && profileId && profile.value !== profileId) {
        profile.value = profileId;
        profile.dispatchEvent(new Event("change", { bubbles: true }));
      }
      document.querySelector('[data-page="ideas"]')?.click();
      activateStudioPage("ideas");
      document.getElementById("page-ideas")?.scrollIntoView({ block: "start" });
      return;
    }
    const view = ["approved_past_due", "approved_missing_date"].includes(kind) ? kind
      : kind === "approval" ? "approval" : kind === "failed" ? "failed" : "attention";
    if (typeof window.studioOpenPipelineFilter === "function") {
      window.studioOpenPipelineFilter(view, { profileId: profileId || "" });
      return;
    }
    const profile = document.getElementById("studioProfileSelect");
    if (profile && profileId && profile.value !== profileId) {
      profile.value = profileId;
      profile.dispatchEvent(new Event("change", { bubbles: true }));
    }
    const nav = document.querySelector('[data-page="outputs"]');
    nav?.click();
    activateStudioPage("outputs");
    const openView = () => document.querySelector(`[data-pipeline-quick-view="${view}"]`)?.click();
    window.setTimeout(openView, 150);
    window.setTimeout(openView, 700);
  }

  function refreshStatusText({ stale = false, error = "", cooling = false } = {}) {
    if (state.manualRefreshing) return "Refreshing…";
    if (state.refreshTone === "ok" && state.cacheAt) return snapshotUpdateLabel();
    if (state.refreshMessage) return state.refreshMessage;
    if (error) return `Showing last good overview (${cacheAgeLabel()}; ${error}).`;
    if (cooling) return `Showing previous data (${cacheAgeLabel()}).`;
    if (stale) return `Showing cached overview (${cacheAgeLabel()}).`;
    return "";
  }

  function render({ stale = false, error = "", cooling = false } = {}) {
    if (!state.rows.length) {
      if (state.manualRefreshing) {
        host.innerHTML = '<div class="all-profiles-loading">Refreshing All Profiles overview…</div>';
        return;
      }
      if (cooling) {
        host.innerHTML = '<div class="all-profiles-loading">All Profiles overview is waiting on Airtable — retrying shortly…</div>';
        return;
      }
      host.innerHTML = error
        ? `<div class="all-profiles-loading error">All Profiles Overview unavailable: ${esc(error)}</div>`
        : '<div class="all-profiles-loading">Loading all profiles…</div>';
      return;
    }

    const now = Date.now();
    const total = {
      scheduled: Object.fromEntries(platformOrder.map((p) => [p, 0])),
      approved_calendar_slots: Object.fromEntries(platformOrder.map((p) => [p, []])),
      approved_missing_date: 0,
      awaiting_final_by_platform: Object.fromEntries(platformOrder.map((p) => [p, 0])),
      manual: 0, failed: 0, approval: 0, ideas: 0,
    };
    for (const row of state.rows) {
      for (const platform of platformOrder) {
        total.scheduled[platform] += row.scheduled?.[platform] || 0;
        total.approved_calendar_slots[platform].push(...row.approved_calendar_slots[platform]);
        total.awaiting_final_by_platform[platform] += row.awaiting_final_by_platform[platform];
      }
      total.approved_missing_date += row.approved_missing_date;
      total.manual += row.manual;
      total.failed += row.failed;
      total.approval += row.approval;
      total.ideas += row.ideas;
    }

    const rowHtml = (row, isTotal = false) => {
      const calendar = approvedCalendarCounts(row, now);
      return `<tr class="${isTotal ? "all-profiles-total" : ""}">
      <th scope="row">${esc(row.name)}</th>
      <td data-label="Pipeline total">${calendar.pipelineTotal}</td>
      ${platformOrder.map((p) => `<td data-label="${p} future and review outputs">${calendar.pipelineByPlatform[p]}</td>`).join("")}
      <td data-label="Approved future" class="overview-tone-ok">${calendar.future}</td>
      <td data-label="Ideas needed">${calendar.ideasNeeded}</td>
      <td data-label="Approved past due" class="overview-tone-${tone(calendar.pastDue, "failed")}">${actionCount(isTotal ? null : row, "approved_past_due", "approved past due", calendar.pastDue)}</td>
      <td data-label="Approved no date" class="overview-tone-${tone(calendar.missingDate, "failed")}">${actionCount(isTotal ? null : row, "approved_missing_date", "approved with no date", calendar.missingDate)}</td>
      <td data-label="Manual" class="overview-tone-${tone(row.manual, "manual")}">${actionCount(row, "manual", "manual action")}</td>
      <td data-label="Failed" class="overview-tone-${tone(row.failed, "failed")}">${actionCount(row, "failed", "failed")}</td>
      <td data-label="Approval" class="overview-tone-${tone(row.approval, "approval")}">${actionCount(row, "approval", "awaiting approval")}</td>
      <td data-label="Ideas" class="overview-tone-${tone(row.ideas, "ideas")}">${actionCount(row, "ideas", "ideas")}</td>
    </tr>`;
    };

    const statusText = refreshStatusText({ stale, error, cooling });
    const statusNote = statusText
      ? `<p class="subtle all-profiles-stale" aria-live="polite">${esc(statusText)}</p>`
      : "";
    const refreshText = state.manualRefreshing ? "Refreshing…" : "Refresh";
    const disabled = state.manualRefreshing ? " disabled aria-disabled=\"true\"" : "";


    // Preserve the existing mobile horizontal scrollport through automatic snapshot
    // polls and force-refresh status changes. Rebuilding host.innerHTML here used
    // to reset scrollLeft to zero and cancel taps on right-hand action counts.
    const visibleBody = host.querySelector(".all-profiles-table-wrap tbody");
    const visibleHeading = host.querySelector(".all-profiles-heading");
    const bodyHtml = state.rows.map((r) => rowHtml(r)).join("") + rowHtml({ name: "Total", ...total }, true);
    if (visibleBody && visibleHeading && visibleBody.rows.length === state.rows.length + 1) {
      const updatedBody = document.createElement("tbody");
      updatedBody.innerHTML = bodyHtml;
      const oldRows = Array.from(visibleBody.rows);
      const newRows = Array.from(updatedBody.rows);
      for (let rowIndex = 0; rowIndex < oldRows.length; rowIndex += 1) {
        const oldCells = Array.from(oldRows[rowIndex].cells);
        const newCells = Array.from(newRows[rowIndex].cells);
        if (oldCells.length !== newCells.length) {
          visibleBody.replaceWith(updatedBody);
          break;
        }
        for (let cellIndex = 0; cellIndex < oldCells.length; cellIndex += 1) {
          if (oldCells[cellIndex].innerHTML !== newCells[cellIndex].innerHTML) {
            oldCells[cellIndex].innerHTML = newCells[cellIndex].innerHTML;
          }
          if (oldCells[cellIndex].className !== newCells[cellIndex].className) {
            oldCells[cellIndex].className = newCells[cellIndex].className;
          }
        }
      }
      const currentStatus = visibleHeading.querySelector(".all-profiles-stale");
      if (!statusText) currentStatus?.remove();
      else if (currentStatus) {
        if (currentStatus.textContent !== statusText) currentStatus.textContent = statusText;
      } else {
        const status = document.createElement("p");
        status.className = "subtle all-profiles-stale";
        status.setAttribute("aria-live", "polite");
        status.textContent = statusText;
        visibleHeading.firstElementChild?.appendChild(status);
      }
      const refreshButton = visibleHeading.querySelector("#allProfilesRefresh");
      if (refreshButton) {
        if (refreshButton.textContent !== refreshText) refreshButton.textContent = refreshText;
        refreshButton.disabled = state.manualRefreshing;
        if (state.manualRefreshing) refreshButton.setAttribute("aria-disabled", "true");
        else refreshButton.removeAttribute("aria-disabled");
      }
      return;
    }

    host.innerHTML = `<div class="all-profiles-heading"><div><p class="studio-hub-kicker">ALL PROFILES</p><h1>Studio overview</h1>${statusNote}</div><button type="button" class="secondary-button" id="allProfilesRefresh"${disabled}>${refreshText}</button></div>
      <div class="all-profiles-table-wrap"><table class="all-profiles-table"><thead><tr class="all-profiles-group-row"><th rowspan="2" title="City profile. Counts represent individual platform outputs associated with this city.">Profile</th><th rowspan="2" title="Total of Facebook, Instagram, TikTok and YouTube: approved unpublished outputs scheduled in the future, plus rendered outputs awaiting final human approval.">Pipeline · Total</th><th colspan="4" class="all-profiles-scheduled-group" title="Each platform counts individual unpublished outputs that are approved and scheduled after now, plus fully rendered outputs awaiting final human approval. An output is counted only once.">Future + Review platform outputs</th><th rowspan="2" title="Fully approved, not yet published platform outputs with a scheduled date and time later than now. Excludes outputs still awaiting approval.">Approved · Future</th><th rowspan="2" title="Estimated additional ideas: round up (500 minus Pipeline Total) divided by 5, with a minimum of 0. Assumes 5 platform outputs per idea; creation remains subject to hourly limits.">Ideas Needed</th><th rowspan="2" title="Fully approved outputs that are still unpublished after their scheduled date and time. Publishing exceptions; not part of the future Pipeline Total.">Approved · Past Due</th><th rowspan="2" title="Fully approved, unpublished outputs without a valid Scheduled Post Date. Scheduling exceptions; not part of the future Pipeline Total.">Approved · No Date</th><th rowspan="2" title="Platform outputs in Manual Action Required status. These need a person to complete a workflow or publishing action.">Manual action</th><th rowspan="2" title="Platform outputs in Failed status that require investigation or retry.">Failed</th><th rowspan="2" title="Fully rendered platform outputs with Ready for Review / Awaiting Approval status. May be higher than Factory Needs eyes: that gate counts package-ready Approve items only; incomplete packages sit in Repair. Already included in Pipeline Total, not counted again.">Awaiting approval</th><th rowspan="2" title="Existing idea candidates that have not been promoted into production. Different from the Ideas Needed estimate.">Ideas</th></tr><tr class="all-profiles-platform-row">${platformOrder.map((p)=>`<th class="all-profiles-scheduled-col" title="${p}: individual approved, unpublished outputs scheduled after now, plus fully rendered outputs awaiting final human approval. Counts every output format once.">${p}</th>`).join("")}</tr></thead>
      <tbody>${state.rows.map((r)=>rowHtml(r)).join("")}${rowHtml({name:"Total",...total},true)}</tbody></table></div>`;

  }

  // Delegate once: unchanged action buttons survive the periodic in-place updates.
  host.addEventListener("click", (event) => {
    const button = event.target?.closest?.("button");
    if (!button || !host.contains(button)) return;
    if (button.id === "allProfilesRefresh") {
      forceRefresh();
    } else if (button.classList.contains("overview-action-count")) {
      openOverviewAction(button.dataset.overviewProfile || "", button.dataset.overviewAction || "");
    }
  });

  function mapRows(rows) {
    return (rows || []).map((row) => ({
      id: row.id,
      name: row.city_label || row.name || row.id,
      scheduled: row.scheduled || Object.fromEntries(platformOrder.map((p) => [p, 0])),
      manual: Number(row.manual) || 0,
      failed: Number(row.failed) || 0,
      approval: Number(row.approval) || 0,
      approved_unpublished: Number(row.approved_unpublished) || 0,
      overdue_unpublished: Number(row.overdue_unpublished) || 0,
      approved_future: Number(row.approved_future) || 0,
      approved_past_due: Number(row.approved_past_due) || 0,
      approved_missing_date: Number(row.approved_missing_date) || 0,
      pipeline_total: Number(row.pipeline_total) || 0,
      awaiting_final_by_platform: row.awaiting_final_by_platform,
      pipeline_by_platform: row.pipeline_by_platform,
      approved_future_by_platform: row.approved_future_by_platform,
      approved_calendar_slots: row.approved_calendar_slots,
      ideas: Number(row.ideas) || 0,
    }));
  }

  function adoptOverview(data) {
    const rows = Array.isArray(data?.records) ? data.records : [];
    // Reject invalid server snapshots instead of caching four fake Chicago rows.
    if (!validOverviewRows(rows)) return false;
    const nextVersion = Number(data?.summary_version || 0);
    // Reject out-of-order summary requests; legacy snapshots retain their own fallback.
    if (nextVersion > 0 && state.summaryVersion > nextVersion) return false;
    const snapshotAt = Number(data?.snapshot_at || 0);
    // Overlapping Home polls can finish out of order. Never replace a newer
    // authoritative snapshot (and its approval totals) with older cached data.
    // Match versions first; for versionless legacy snapshots use the timestamp.
    if (snapshotAt > 0 && state.cacheAt > 0 && snapshotAt < state.cacheAt
        && (nextVersion === 0 || nextVersion === state.summaryVersion)) return false;
    state.summaryVersion = nextVersion;
    state.rows = mapRows(rows);
    if (snapshotAt > 0) state.cacheAt = snapshotAt;
    if (data?.snapshot_generation != null) state.snapshotGeneration = String(data.snapshot_generation || "");
    if (data?.ideas_at != null) state.ideasAt = Number(data.ideas_at || 0);
    if (snapshotAt > 0) {
      writeCache(state.rows, {
        snapshotAt,
        generation: state.snapshotGeneration,
        summaryVersion: state.summaryVersion,
        ideasAt: state.ideasAt,
      });
    }
    return true;
  }

  function retrySoon() {
    if (state.followUp) return;
    state.followUp = true;
    window.setTimeout(() => {
      state.followUp = false;
      load();
    }, POLL_MS);
  }

  function overviewViewActive() {
    if (document.hidden) return false;
    const page = document.getElementById("page-dashboard");
    if (!page) return true;
    return page.classList.contains("active");
  }

  function refreshMatchesSnapshot(refresh) {
    const generation = String(refresh?.snapshot_generation || "");
    const at = Number(refresh?.snapshot_at || 0);
    if (generation) return generation === state.snapshotGeneration;
    return at > 0 && state.cacheAt >= at;
  }

  function scheduleRefreshStatusPoll(delay = REFRESH_POLL_MS) {
    if (state.refreshTimer) window.clearTimeout(state.refreshTimer);
    state.refreshTimer = window.setTimeout(() => {
      state.refreshTimer = 0;
      syncRefreshStatus();
    }, Math.max(250, Number(delay) || REFRESH_POLL_MS));
  }

  async function finishVerifiedRefresh(refresh) {
    await load(true, String(refresh?.snapshot_generation || ""));
    if (!refreshMatchesSnapshot(refresh)) {
      state.manualRefreshing = true;
      state.refreshMessage = "";
      render({ stale: true });
      scheduleRefreshStatusPoll();
      return;
    }
    state.manualRefreshing = false;
    state.refreshOperationId = "";
    state.refreshMessage = "";
    state.refreshTone = "ok";
    clearRefreshIntent();
    render();
  }

  async function syncRefreshStatus({ quiet = false } = {}) {
    try {
      const data = await json(`/api/profiles/overview/refresh-status?_=${Date.now()}`, { timeoutMs: 8000 });
      const refresh = data?.refresh || {};
      const status = String(refresh.status || data?.status || "idle");
      const operationId = String(refresh.operation_id || "");

      if (status === "refreshing") {
        state.manualRefreshing = true;
        state.refreshMessage = "";
        state.refreshOperationId = operationId || state.refreshOperationId;
        if (state.refreshOperationId) writeRefreshIntent(state.refreshOperationId, refresh.requested_at || "");
        render({ stale: true });
        scheduleRefreshStatusPoll();
        return;
      }

      if (status === "completed") {
        // Durable server state is authoritative across tabs and browser restores.
        // A stale local operation id must never leave Home stuck on "Refreshing…".
        state.refreshOperationId = operationId || state.refreshOperationId;
        await finishVerifiedRefresh(refresh);
        return;
      }

      if (status === "failed") {
        state.manualRefreshing = false;
        state.refreshOperationId = "";
        state.refreshMessage = `Refresh failed · Showing previous data (${cacheAgeLabel()})`;
        state.refreshTone = "error";
        clearRefreshIntent();
        render({ stale: true });
        return;
      }

      if (status === "cooling_down") {
        state.manualRefreshing = false;
        state.refreshOperationId = "";
        state.refreshMessage = `Refreshing temporarily unavailable · Showing previous data (${cacheAgeLabel()})`;
        state.refreshTone = "warn";
        clearRefreshIntent();
        render({ stale: true, cooling: true });
        return;
      }

      if (!quiet && state.manualRefreshing) {
        state.manualRefreshing = false;
        state.refreshOperationId = "";
        state.refreshMessage = `Refresh failed · Showing previous data (${cacheAgeLabel()})`;
        clearRefreshIntent();
        render({ stale: true });
      }
    } catch (error) {
      const intent = readRefreshIntent();
      if (state.manualRefreshing || intent) {
        if (!intent && state.manualRefreshing) {
          state.manualRefreshing = false;
          state.refreshOperationId = "";
          state.refreshMessage = `Refresh status unavailable · Showing previous data (${cacheAgeLabel()})`;
          state.refreshTone = "warn";
          clearRefreshIntent();
          render({ stale: true });
          return;
        }
        state.manualRefreshing = true;
        render({ stale: true });
        scheduleRefreshStatusPoll(3000);
      }
    }
  }

  async function forceRefresh() {
    if (state.manualRefreshing) return;
    state.manualRefreshing = true;
    state.refreshMessage = "";
    state.refreshTone = "";
    render({ stale: Boolean(state.cacheAt) });
    try {
      const data = await json("/api/profiles/overview/refresh", {
        timeoutMs: 10000,
        method: "POST",
        body: {},
      });
      const refresh = data?.refresh || {};
      const status = String(refresh.status || data?.status || "");
      if (status === "cooling_down") {
        state.manualRefreshing = false;
        state.refreshMessage = `Refreshing temporarily unavailable · Showing previous data (${cacheAgeLabel()})`;
        state.refreshTone = "warn";
        clearRefreshIntent();
        render({ stale: true, cooling: true });
        return;
      }
      if (status === "completed") {
        await finishVerifiedRefresh(refresh);
        return;
      }
      const operationId = String(refresh.operation_id || "");
      if (!operationId) throw new Error("Refresh operation was not accepted");
      state.refreshOperationId = operationId;
      writeRefreshIntent(operationId, refresh.requested_at || new Date().toISOString());
      scheduleRefreshStatusPoll(500);
    } catch (error) {
      state.manualRefreshing = false;
      state.refreshOperationId = "";
      state.refreshMessage = `Refresh failed · Showing previous data (${cacheAgeLabel()})`;
      state.refreshTone = "error";
      clearRefreshIntent();
      render({ stale: true, error: isOverviewSoftFailure(error) ? "refresh request timed out" : String(error?.message || error || "") });
    }
  }

  async function load(force = false, minGeneration = "") {
    if (state.loading) return;
    if (!force && !overviewViewActive()) return;
    state.loading = true;

    if (!state.rows.length) {
      const cached = readCache();
      if (cached?.rows?.length) {
        state.rows = cached.rows;
        state.cacheAt = cached.at;
        state.snapshotGeneration = cached.generation;
        state.summaryVersion = cached.summaryVersion || 0;
        state.ideasAt = cached.ideasAt;
        render({ stale: true });
      } else {
        render();
      }
    }

    try {
      // Automatic polling remains a read-only snapshot GET. It never triggers the
      // manual force-refresh route; expired snapshots are rebuilt by Worker policy.
      const minGenerationQuery = minGeneration
        ? `&min_generation=${encodeURIComponent(minGeneration)}`
        : "";
      const data = await json(`/api/profiles/overview?_=${Date.now()}${minGenerationQuery}`, { timeoutMs: 8000 });
      const adopted = adoptOverview(data);
      if (!adopted) {
        if (data?.cooling || data?.refreshing) {
          render({ cooling: Boolean(data?.cooling), stale: Boolean(state.rows.length) });
          retrySoon();
          return;
        }
        if (!state.rows.length) host.innerHTML = '<div class="all-profiles-loading">No Content Profiles returned yet.</div>';
        return;
      }

      if (data?.refreshing && !state.manualRefreshing) {
        // A different browser/tab may have started the durable manual operation.
        // Resolve its operation id/status instead of treating a cached GET as success.
        syncRefreshStatus({ quiet: true });
      }
      render({
        stale: Boolean(data?.stale || data?.cooling || state.manualRefreshing),
        error: data?.cooling ? "Airtable busy" : "",
        cooling: Boolean(data?.cooling),
      });
      if (data?.refreshing && !state.followUp) retrySoon();
    } catch (error) {
      // Timeouts and rate limits are soft: never paint a red unavailable banner when last-good data exists.
      const cooling = isOverviewSoftFailure(error);
      const cached = state.rows.length
        ? { rows: state.rows, at: state.cacheAt, generation: state.snapshotGeneration, ideasAt: state.ideasAt }
        : readCache();
      if (cached?.rows?.length) {
        state.rows = cached.rows;
        state.cacheAt = cached.at;
        state.snapshotGeneration = cached.generation || state.snapshotGeneration;
        state.ideasAt = cached.ideasAt || state.ideasAt;
        render({ stale: true, cooling, error: cooling ? "Airtable busy" : String(error?.message || error || "") });
      } else {
        render({ cooling: true, error: "" });
        if (cooling) retrySoon();
      }
    } finally {
      state.loading = false;
    }
  }

  const cachedNow = readCache();
  if (cachedNow?.rows?.length) {
    state.rows = cachedNow.rows;
    state.cacheAt = cachedNow.at;
    state.snapshotGeneration = cachedNow.generation;
    state.summaryVersion = cachedNow.summaryVersion || 0;
    state.ideasAt = cachedNow.ideasAt;
    render({ stale: true });
  }

  const intent = readRefreshIntent();
  if (intent?.operationId) {
    state.manualRefreshing = true;
    state.refreshOperationId = intent.operationId;
    render({ stale: Boolean(state.rows.length) });
  }

  const start = () => {
    if (state.deferred) return;
    state.deferred = true;
    load();
    syncRefreshStatus({ quiet: true });
  };
  // Paint the last verified snapshot before any network request starts.
  const initialCache = readCache();
  if (initialCache?.rows?.length) {
    state.rows = initialCache.rows;
    state.cacheAt = initialCache.at;
    state.snapshotGeneration = initialCache.generation;
    state.summaryVersion = initialCache.summaryVersion || 0;
    state.ideasAt = initialCache.ideasAt;
    render({ stale: true });
  }
  start();

  // Twelve-second Home polling uses read-only snapshot reads, not forced rebuilds. Durable refresh
  // status polling is independent, so leaving Home does not cancel a refresh.
  state.timer = window.setInterval(() => {
    if (overviewViewActive()) load();
  }, POLL_MS);

  document.addEventListener?.("visibilitychange", () => {
    if (overviewViewActive()) {
      load();
      syncRefreshStatus({ quiet: true });
    }
  });
})();
