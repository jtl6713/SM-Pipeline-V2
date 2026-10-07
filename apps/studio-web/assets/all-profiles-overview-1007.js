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
      const published = Boolean(row?.published_at) || /published/i.test(String(row?.publish_status || ""));
      const scheduled = Boolean(row?.scheduled_post_date || row?.youtube_scheduled_publish_at || row?.studio_scheduled_at)
        || /scheduled|ready to publish|publishing/i.test(String(row?.publish_status || ""));
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
      failed: Number(metrics.failed ?? states.filter((s) => s === "Failed").length) || 0,
      approval: Number(metrics.awaiting_approval ?? states.filter((s) => s === "Awaiting Approval").length) || 0,
      ideas: Number(metrics.ideas_not_in_production ?? metrics.ideas ?? 0) || 0,
      scheduled: scheduledCounts(outputs),
    };
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
      <th scope="row">${esc(row.name)}</th>
      ${platformOrder.map((p)=>`<td data-label="${p}">${row.scheduled[p] || 0}</td>`).join("")}
      <td data-label="Manual" class="overview-tone-${tone(row.manual,"manual")}">${row.manual}</td>
      <td data-label="Failed" class="overview-tone-${tone(row.failed,"failed")}">${row.failed}</td>
      <td data-label="Approval" class="overview-tone-${tone(row.approval,"approval")}">${row.approval}</td>
      <td data-label="Ideas" class="overview-tone-${tone(row.ideas,"ideas")}">${row.ideas}</td>
    </tr>`;
    host.innerHTML = `<div class="all-profiles-heading"><div><p class="studio-hub-kicker">ALL PROFILES</p><h1>Studio overview</h1></div><button type="button" class="secondary-button" id="allProfilesRefresh">Refresh</button></div>
      <div class="all-profiles-table-wrap"><table class="all-profiles-table"><thead><tr><th>Profile</th>${platformOrder.map((p)=>`<th>${p}</th>`).join("")}<th>Manual action</th><th>Failed</th><th>Awaiting approval</th><th>Ideas</th></tr></thead>
      <tbody>${state.rows.map((r)=>rowHtml(r)).join("")}${rowHtml({name:"Total",...total},true)}</tbody></table></div>`;
    document.getElementById("allProfilesRefresh")?.addEventListener("click", () => load(true));
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