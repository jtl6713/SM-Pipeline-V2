(() => {
  const host = document.getElementById("allProfilesOverview");
  if (!host) return;

  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const platformOrder = ["Facebook","Instagram","TikTok","YouTube"];
  const CACHE_KEY = "studio.allProfilesOverview.v2";
  const REFRESH_KEY = "studio.allProfilesOverview.refresh.v1";
  const POLL_MS = 5000;
  const REFRESH_POLL_MS = 1800;
  const state = {
    rows: [],
    timer: 0,
    refreshTimer: 0,
    loading: false,
    deferred: false,
    followUp: false,
    cacheAt: 0,
    snapshotGeneration: "",
    ideasAt: 0,
    manualRefreshing: false,
    refreshOperationId: "",
    refreshMessage: "",
    refreshTone: "",
  };

  function scheduledTotal(row) {
    return platformOrder.reduce((sum, platform) => sum + (Number(row?.scheduled?.[platform]) || 0), 0);
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY) || sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.rows) ? {
        rows: parsed.rows,
        at: Number(parsed.at) || 0,
        generation: String(parsed.generation || ""),
        ideasAt: Number(parsed.ideasAt || 0),
      } : null;
    } catch {
      return null;
    }
  }

  function writeCache(rows, metadata = {}) {
    const authoritativeAt = Number(metadata.snapshotAt || 0);
    if (authoritativeAt > 0) state.cacheAt = authoritativeAt;
    if (metadata.generation != null) state.snapshotGeneration = String(metadata.generation || "");
    if (metadata.ideasAt != null) state.ideasAt = Number(metadata.ideasAt || 0);
    const payload = JSON.stringify({
      rows,
      at: state.cacheAt,
      generation: state.snapshotGeneration,
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
      return parsed?.operationId ? {
        operationId: String(parsed.operationId),
        requestedAt: String(parsed.requestedAt || ""),
      } : null;
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

  function actionCount(row, kind, label) {
    const value = Number(row?.[kind]) || 0;
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
    const view = kind === "approval" ? "approval" : kind === "failed" ? "failed" : "attention";
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

    const total = { scheduled:Object.fromEntries(platformOrder.map((p)=>[p,0])), manual:0, failed:0, approval:0, ideas:0 };
    for (const row of state.rows) {
      platformOrder.forEach((p)=> total.scheduled[p] += row.scheduled?.[p] || 0);
      total.manual += row.manual;
      total.failed += row.failed;
      total.approval += row.approval;
      total.ideas += row.ideas;
    }

    const rowHtml = (row, isTotal=false) => `<tr class="${isTotal ? "all-profiles-total" : ""}">
      <th scope="row">${esc(row.name)}${isTotal ? "" : ` (${scheduledTotal(row)})`}</th>
      ${platformOrder.map((p)=>`<td data-label="${p}">${row.scheduled?.[p] || 0}</td>`).join("")}
      <td data-label="Manual" class="overview-tone-${tone(row.manual,"manual")}">${actionCount(row, "manual", "manual action")}</td>
      <td data-label="Failed" class="overview-tone-${tone(row.failed,"failed")}">${actionCount(row, "failed", "failed")}</td>
      <td data-label="Approval" class="overview-tone-${tone(row.approval,"approval")}">${actionCount(row, "approval", "awaiting approval")}</td>
      <td data-label="Ideas" class="overview-tone-${tone(row.ideas,"ideas")}">${actionCount(row, "ideas", "ideas")}</td>
    </tr>`;

    const statusText = refreshStatusText({ stale, error, cooling });
    const statusNote = statusText
      ? `<p class="subtle all-profiles-stale" aria-live="polite">${esc(statusText)}</p>`
      : "";
    const refreshText = state.manualRefreshing ? "Refreshing…" : "Refresh";
    const disabled = state.manualRefreshing ? " disabled aria-disabled=\"true\"" : "";

    host.innerHTML = `<div class="all-profiles-heading"><div><p class="studio-hub-kicker">ALL PROFILES</p><h1>Studio overview</h1>${statusNote}</div><button type="button" class="secondary-button" id="allProfilesRefresh"${disabled}>${refreshText}</button></div>
      <div class="all-profiles-table-wrap"><table class="all-profiles-table"><thead><tr class="all-profiles-group-row"><th rowspan="2">Profile</th><th colspan="4" class="all-profiles-scheduled-group">Scheduled posts</th><th rowspan="2">Manual action</th><th rowspan="2">Failed</th><th rowspan="2">Awaiting approval</th><th rowspan="2">Ideas</th></tr><tr class="all-profiles-platform-row">${platformOrder.map((p)=>`<th class="all-profiles-scheduled-col">${p}</th>`).join("")}</tr></thead>
      <tbody>${state.rows.map((r)=>rowHtml(r)).join("")}${rowHtml({name:"Total",...total},true)}</tbody></table></div>`;

    document.getElementById("allProfilesRefresh")?.addEventListener("click", forceRefresh);
    host.querySelectorAll(".overview-action-count").forEach((button) => button.addEventListener("click", () => {
      openOverviewAction(button.dataset.overviewProfile || "", button.dataset.overviewAction || "");
    }));
  }

  function mapRows(rows) {
    return (rows || []).map((row) => ({
      id: row.id,
      name: row.city_label || row.name || row.id,
      scheduled: row.scheduled || Object.fromEntries(platformOrder.map((p) => [p, 0])),
      manual: Number(row.manual) || 0,
      failed: Number(row.failed) || 0,
      approval: Number(row.approval) || 0,
      ideas: Number(row.ideas) || 0,
    }));
  }

  function adoptOverview(data) {
    const rows = Array.isArray(data?.records) ? data.records : [];
    if (!rows.length) return false;
    state.rows = mapRows(rows);
    const snapshotAt = Number(data?.snapshot_at || 0);
    if (snapshotAt > 0) state.cacheAt = snapshotAt;
    if (data?.snapshot_generation != null) state.snapshotGeneration = String(data.snapshot_generation || "");
    if (data?.ideas_at != null) state.ideasAt = Number(data.ideas_at || 0);
    if (snapshotAt > 0) {
      writeCache(state.rows, {
        snapshotAt,
        generation: state.snapshotGeneration,
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
        const intended = state.refreshOperationId || readRefreshIntent()?.operationId || "";
        if (!intended || intended === operationId) {
          state.refreshOperationId = operationId || intended;
          await finishVerifiedRefresh(refresh);
        }
        return;
      }

      if (status === "failed") {
        const intended = state.refreshOperationId || readRefreshIntent()?.operationId || "";
        if (!intended || intended === operationId) {
          state.manualRefreshing = false;
          state.refreshOperationId = "";
          state.refreshMessage = `Refresh failed · Showing previous data (${cacheAgeLabel()})`;
          state.refreshTone = "error";
          clearRefreshIntent();
          render({ stale: true });
        }
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
      if (state.manualRefreshing || readRefreshIntent()) {
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
  start();

  // Five-second Home polling remains cheap snapshot reads only. Durable refresh
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
