(() => {
  const host = document.getElementById("allProfilesOverview");
  if (!host) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const platformOrder = ["Facebook","Instagram","TikTok","YouTube"];
  const CACHE_KEY = "studio.allProfilesOverview.v1";
  const state = { rows: [], timer: 0, loading: false, deferred: false };

  function scheduledTotal(row) {
    return platformOrder.reduce((sum, platform) => sum + (Number(row?.scheduled?.[platform]) || 0), 0);
  }
  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed?.rows) ? parsed.rows : null;
    } catch {
      return null;
    }
  }
  function writeCache(rows) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ rows, at: Date.now() }));
    } catch {
      /* ignore quota */
    }
  }
  function isOverviewSoftFailure(error) {
    const name = String(error?.name || "");
    const message = String(error?.message || error || "");
    return name === "AbortError"
      || name === "TimeoutError"
      || /timed?\s*out|timeout after|aborted|HTTP 429|cooling down|rate.?limit|too many requests/i.test(message);
  }
  async function json(url, { timeoutMs = 8000 } = {}) {
    const controller = typeof AbortController === "function" ? new AbortController() : null;
    const timer = controller ? window.setTimeout(() => controller.abort(), timeoutMs) : 0;
    try {
      const response = await fetch(url, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
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
    if (kind === "ideas") return n === 0 ? "ok" : n <= 4 ? "warn" : "critical";
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
    const openView = () => {
      const button = document.querySelector(`[data-pipeline-quick-view="${view}"]`);
      if (button) button.click();
    };
    window.setTimeout(openView, 150);
    window.setTimeout(openView, 700);
  }
  function render({ stale = false, error = "", cooling = false } = {}) {
    if (!state.rows.length) {
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
      total.manual += row.manual; total.failed += row.failed; total.approval += row.approval; total.ideas += row.ideas;
    }
    const rowHtml = (row, isTotal=false) => `<tr class="${isTotal ? "all-profiles-total" : ""}">
      <th scope="row">${esc(row.name)}${isTotal ? "" : ` (${scheduledTotal(row)})`}</th>
      ${platformOrder.map((p)=>`<td data-label="${p}">${row.scheduled?.[p] || 0}</td>`).join("")}
      <td data-label="Manual" class="overview-tone-${tone(row.manual,"manual")}">${actionCount(row, "manual", "manual action")}</td>
      <td data-label="Failed" class="overview-tone-${tone(row.failed,"failed")}">${actionCount(row, "failed", "failed")}</td>
      <td data-label="Approval" class="overview-tone-${tone(row.approval,"approval")}">${actionCount(row, "approval", "awaiting approval")}</td>
      <td data-label="Ideas" class="overview-tone-${tone(row.ideas,"ideas")}">${actionCount(row, "ideas", "ideas")}</td>
    </tr>`;
    const staleNote = stale || error
      ? `<p class="subtle all-profiles-stale">${esc(error ? `Showing last good overview (${error}).` : "Showing cached overview.")}</p>`
      : "";
    host.innerHTML = `<div class="all-profiles-heading"><div><p class="studio-hub-kicker">ALL PROFILES</p><h1>Studio overview</h1>${staleNote}</div><button type="button" class="secondary-button" id="allProfilesRefresh">Refresh</button></div>
      <div class="all-profiles-table-wrap"><table class="all-profiles-table"><thead><tr class="all-profiles-group-row"><th rowspan="2">Profile</th><th colspan="4" class="all-profiles-scheduled-group">Scheduled posts</th><th rowspan="2">Manual action</th><th rowspan="2">Failed</th><th rowspan="2">Awaiting approval</th><th rowspan="2">Ideas</th></tr><tr class="all-profiles-platform-row">${platformOrder.map((p)=>`<th class="all-profiles-scheduled-col">${p}</th>`).join("")}</tr></thead>
      <tbody>${state.rows.map((r)=>rowHtml(r)).join("")}${rowHtml({name:"Total",...total},true)}</tbody></table></div>`;
    document.getElementById("allProfilesRefresh")?.addEventListener("click", () => load(true));
    host.querySelectorAll(".overview-action-count").forEach((button) => button.addEventListener("click", () => {
      openOverviewAction(button.dataset.overviewProfile || "", button.dataset.overviewAction || "");
    }));
  }
  async function load(force=false) {
    if (state.loading) return;
    state.loading = true;
    if (!state.rows.length) {
      const cached = readCache();
      if (cached?.length) {
        state.rows = cached;
        render({ stale: true });
      } else {
        render();
      }
    }
    try {
      // One Worker request replaces N× /api/dashboard (+ /api/profiles) fan-out
      // that was 429ing the home page on every paint. Worker soft-200s on cooldown
      // and budgets the build so this never waits 60s.
      const data = await json(`/api/profiles/overview?_=${Date.now()}`, { timeoutMs: 8000 });
      const rows = Array.isArray(data?.records) ? data.records : [];
      if (!rows.length) {
        if (data?.cooling) {
          render({ cooling: true, stale: Boolean(state.rows.length) });
          return;
        }
        if (!state.rows.length) host.innerHTML = '<div class="all-profiles-loading">No Content Profiles returned yet.</div>';
        return;
      }
      state.rows = rows.map((row) => ({
        id: row.id,
        name: row.city_label || row.name || row.id,
        scheduled: row.scheduled || Object.fromEntries(platformOrder.map((p) => [p, 0])),
        manual: Number(row.manual) || 0,
        failed: Number(row.failed) || 0,
        approval: Number(row.approval) || 0,
        ideas: Number(row.ideas) || 0,
      }));
      writeCache(state.rows);
      render({ stale: Boolean(data?.stale || data?.cooling), error: data?.cooling ? "Airtable busy" : "" });
    } catch (error) {
      // Timeouts and 429s are soft — never paint a red "unavailable" banner on home.
      const cooling = isOverviewSoftFailure(error);
      const cached = state.rows.length ? state.rows : readCache();
      if (cached?.length) {
        state.rows = cached;
        render({ stale: true, cooling, error: cooling ? "Airtable busy" : String(error?.message || error || "") });
      } else {
        render({ cooling: true, error: "" });
      }
    } finally {
      state.loading = false;
    }
  }
  // Let selected-profile health + home dashboard claim Airtable slots first.
  const start = () => {
    if (state.deferred) return;
    state.deferred = true;
    load();
  };
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(start, { timeout: 4500 });
  } else {
    window.setTimeout(start, 3200);
  }
  // Poll less often — overview is cached on the Worker but still shares the Airtable slot.
  state.timer = window.setInterval(() => {
    if (!document.hidden && document.getElementById("page-dashboard")?.classList.contains("active")) load();
  }, 120000);
})();
