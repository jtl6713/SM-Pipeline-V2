(() => {
  const host = document.getElementById("allProfilesOverview");
  if (!host) return;
  const esc = (value) => String(value ?? "").replace(/[&<>"']/g, (ch) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));
  const platformOrder = ["Facebook","Instagram","TikTok","YouTube"];
  const state = { rows: [], timer: 0, loading: false };

  function normalizedState(row) {
    return String(row?.studio_state || row?.normalized_state || row?.state || row?.output_status || "").trim();
  }
  function scheduledCounts(outputs) {
    const counts = Object.fromEntries(platformOrder.map((p) => [p, 0]));
    for (const row of outputs || []) {
      const platform = String(row?.platform || "").trim();
      if (!(platform in counts)) continue;
      const publishStatus = String(row?.publish_status || "");
      const youtubePrivacy = String(
        row?.youtube_privacy_status
        || row?.youtube_privacy
        || row?.privacy_status
        || row?.privacyStatus
        || row?.youtube_status?.privacyStatus
        || ""
      ).trim().toLowerCase();
      // YouTube uploads are created private before their scheduled public release.
      // Keep private/unlisted uploads in the non-public scheduled count until public.
      const youtubeNotPublic = platform === "YouTube" && /^(private|unlisted)$/.test(youtubePrivacy);
      const published = !youtubeNotPublic && (Boolean(row?.published_at) || /published/i.test(publishStatus));
      const scheduled = Boolean(row?.scheduled_post_date || row?.youtube_scheduled_publish_at || row?.studio_scheduled_at)
        || /scheduled|ready to publish|publishing/i.test(publishStatus)
        || youtubeNotPublic;
      if (!published && scheduled) counts[platform] += 1;
    }
    return counts;
  }
  function operationalCounts(data) {
    const outputs = Array.isArray(data?.outputs) && data.outputs.length ? data.outputs : (data?.recent_outputs || []);
    const metrics = data?.metrics || {};
    const states = outputs.map(normalizedState);
    return {
      manual: Number(metrics.manual_action_required ?? states.filter((s) => s === "Manual Action Required").length) || 0,
      failed: Number(metrics.failed_outputs ?? metrics.failed ?? states.filter((s) => s === "Failed").length) || 0,
      approval: Number(metrics.awaiting_approval ?? states.filter((s) => s === "Ready for Review" || s === "Awaiting Approval").length) || 0,
      ideas: Number(metrics.ideas_not_in_production ?? metrics.ideas ?? 0) || 0,
      scheduled: scheduledCounts(outputs),
    };
  }
  function scheduledTotal(row) {
    return platformOrder.reduce((sum, platform) => sum + (Number(row?.scheduled?.[platform]) || 0), 0);
  }
  async function json(url) {
    const response = await fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" }, cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return response.json();
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
    const profile = document.getElementById("studioProfileSelect");
    if (profile && profile.value !== profileId) {
      profile.value = profileId;
      profile.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (kind === "ideas") {
      document.querySelector('[data-page="ideas"]')?.click();
      activateStudioPage("ideas");
      document.getElementById("page-ideas")?.scrollIntoView({ block: "start" });
      return;
    }
    const nav = document.querySelector('[data-page="outputs"]');
    nav?.click();
    // Normalize page state after profile switching so Dashboard can reliably
    // restore the global overview instead of inheriting a stale active page.
    activateStudioPage("outputs");
    const view = kind === "approval" ? "approval" : kind === "failed" ? "failed" : "attention";
    const openView = () => {
      const button = document.querySelector(`[data-pipeline-quick-view="${view}"]`);
      if (button) button.click();
    };
    window.setTimeout(openView, 150);
    window.setTimeout(openView, 700);
  }
  function render() {
    if (!state.rows.length) {
      host.innerHTML = '<div class="all-profiles-loading">Loading all profiles…</div>';
      return;
    }
    const total = { scheduled:Object.fromEntries(platformOrder.map((p)=>[p,0])), manual:0, failed:0, approval:0, ideas:0 };
    for (const row of state.rows) {
      platformOrder.forEach((p)=> total.scheduled[p] += row.scheduled[p] || 0);
      total.manual += row.manual; total.failed += row.failed; total.approval += row.approval; total.ideas += row.ideas;
    }
    const rowHtml = (row, isTotal=false) => `<tr class="${isTotal ? "all-profiles-total" : ""}">
      <th scope="row">${esc(row.name)}${isTotal ? "" : ` (${scheduledTotal(row)})`}</th>
      ${platformOrder.map((p)=>`<td data-label="${p}">${row.scheduled[p] || 0}</td>`).join("")}
      <td data-label="Manual" class="overview-tone-${tone(row.manual,"manual")}">${actionCount(row, "manual", "manual action")}</td>
      <td data-label="Failed" class="overview-tone-${tone(row.failed,"failed")}">${actionCount(row, "failed", "failed")}</td>
      <td data-label="Approval" class="overview-tone-${tone(row.approval,"approval")}">${actionCount(row, "approval", "awaiting approval")}</td>
      <td data-label="Ideas" class="overview-tone-${tone(row.ideas,"ideas")}">${actionCount(row, "ideas", "ideas")}</td>
    </tr>`;
    host.innerHTML = `<div class="all-profiles-heading"><div><p class="studio-hub-kicker">ALL PROFILES</p><h1>Studio overview</h1></div><button type="button" class="secondary-button" id="allProfilesRefresh">Refresh</button></div>
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
    if (!state.rows.length) render();
    try {
      const profilesData = await json("/api/profiles");
      const profiles = Array.isArray(profilesData?.records) ? profilesData.records : [];
      const rows = await Promise.all(profiles.map(async (profile) => {
        const data = await json(`/api/dashboard?profile=${encodeURIComponent(profile.id)}&all_profiles_overview=1&_${Date.now()}`);
        const counts = operationalCounts(data);
        return { id: profile.id, name: profile.city_label || profile.name || profile.id, ...counts };
      }));
      state.rows = rows;
      render();
    } catch (error) {
      if (!state.rows.length) host.innerHTML = `<div class="all-profiles-loading error">All Profiles Overview could not load: ${esc(error.message)}</div>`;
    } finally {
      state.loading = false;
    }
  }
  load();
  state.timer = window.setInterval(() => {
    if (!document.hidden && document.getElementById("page-dashboard")?.classList.contains("active")) load();
  }, 30000);
})();
