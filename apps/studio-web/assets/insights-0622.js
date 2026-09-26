(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    outputs: [],
    content: [],
    enriched: [],
    filtered: [],
    published: [],
    sampled: [],
    loading: false,
    loadedAt: null,
    connections: null,
  };

  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const TIME_BUCKETS = [
    { label: "12a–6a", start: 0, end: 6 },
    { label: "6a–10a", start: 6, end: 10 },
    { label: "10a–2p", start: 10, end: 14 },
    { label: "2p–6p", start: 14, end: 18 },
    { label: "6p–10p", start: 18, end: 22 },
    { label: "10p–12a", start: 22, end: 24 },
  ];

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function maybeNum(value) {
    if (value === null || value === undefined || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function num(value) {
    return maybeNum(value) ?? 0;
  }

  function metricCompact(value) {
    const n = maybeNum(value);
    return n == null ? "—" : compact(n);
  }

  function compact(value) {
    const n = num(value);
    try {
      return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);
    } catch {
      return String(Math.round(n));
    }
  }

  function percent(value, digits = 1) {
    const n = Number(value);
    return Number.isFinite(n) ? n.toFixed(digits) + "%" : "—";
  }

  function dateLabel(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }

  function dateTimeLabel(value) {
    const d = value ? new Date(value) : null;
    if (!d || Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  }

  function currentProfileId() {
    return String($("studioProfileSelect")?.value || "").trim();
  }

  function profileLabel() {
    const select = $("studioProfileSelect");
    const option = select?.options?.[select.selectedIndex];
    return String(option?.textContent || "Current profile").trim();
  }

  async function fetchJson(path, options = {}) {
    const profileId = currentProfileId();
    const url = new URL(path, window.location.origin);
    if (profileId && !url.searchParams.has("content_profile_id")) url.searchParams.set("content_profile_id", profileId);
    const response = await fetch(url.toString(), {
      credentials: "same-origin",
      headers: {
        "Accept": "application/json",
        ...(options.body ? { "Content-Type": "application/json" } : {}),
        ...(options.headers || {}),
      },
      ...options,
    });
    let body = null;
    try { body = await response.json(); } catch { body = null; }
    if (!response.ok) {
      throw new Error(body?.error || body?.message || ("Insights request failed (" + response.status + ")"));
    }
    return body || {};
  }

  function analyticsPresent(row) {
    return Boolean(
      row.insights_as_of ||
      row.insights_source ||
      num(row.insights_views) ||
      num(row.insights_likes) ||
      num(row.insights_comments) ||
      num(row.insights_shares) ||
      num(row.insights_reach) ||
      num(row.insights_saves) ||
      num(row.insights_watch_time_sec)
    );
  }

  function normalizeChoice(value) {
    if (value && typeof value === "object" && !Array.isArray(value)) return value.name || value.value || "";
    return String(value || "");
  }

  function enrichRows() {
    const contentById = new Map(state.content.map((row) => [row.id, row]));
    state.enriched = state.outputs.map((row) => {
      const content = row.content || contentById.get(row.content_item_id) || {};
      const viewsMetric = maybeNum(row.insights_views);
      const reachMetric = maybeNum(row.insights_reach);
      const likesMetric = maybeNum(row.insights_likes);
      const commentsMetric = maybeNum(row.insights_comments);
      const sharesMetric = maybeNum(row.insights_shares);
      const savesMetric = maybeNum(row.insights_saves);
      const totalInteractionsMetric = maybeNum(row.insights_total_interactions);
      const views = viewsMetric ?? 0;
      const reach = reachMetric ?? 0;
      const likes = likesMetric ?? 0;
      const comments = commentsMetric ?? 0;
      const shares = sharesMetric ?? 0;
      const saves = savesMetric ?? 0;
      const interactions = totalInteractionsMetric ?? (likesMetric != null || commentsMetric != null || sharesMetric != null || savesMetric != null
        ? [likesMetric, commentsMetric, sharesMetric, savesMetric].filter((value) => value != null).reduce((sum, value) => sum + value, 0)
        : 0);
      const interactionsKnown = totalInteractionsMetric != null || likesMetric != null || commentsMetric != null || sharesMetric != null || savesMetric != null;
      const denominator = viewsMetric != null && views > 0 ? views : (reachMetric != null && reach > 0 ? reach : 0);
      const engagementRate = denominator > 0 && interactionsKnown ? interactions / denominator * 100 : null;
      const published = row.published_at ? new Date(row.published_at) : null;
      const themes = Array.isArray(content.content_themes)
        ? content.content_themes.map(normalizeChoice).filter(Boolean)
        : [];
      return {
        ...row,
        content,
        views,
        reach,
        likes,
        comments,
        shares,
        saves,
        interactions,
        viewsKnown: viewsMetric != null,
        reachKnown: reachMetric != null,
        likesKnown: likesMetric != null,
        commentsKnown: commentsMetric != null,
        sharesKnown: sharesMetric != null,
        savesKnown: savesMetric != null,
        interactionsKnown,
        engagementRate,
        milestones: row.insights_milestones || {},
        analyticsPresent: analyticsPresent(row),
        publishedDate: published && !Number.isNaN(published.getTime()) ? published : null,
        contentType: normalizeChoice(content.content_type) || row.platform_output_type || "Unknown",
        location: String(content.primary_location || content.neighborhood_or_area || "").trim(),
        themes,
        voiceover: normalizeChoice(content.include_voiceover),
        music: normalizeChoice(content.include_background_music),
        duration: num(content.duration),
        title: String(row.output_title || content.title || ("Output " + (row.output_id || ""))).trim(),
      };
    });
  }

  function applyFilters() {
    const daysValue = String($("insightsDateRange")?.value || "all");
    const platform = String($("insightsPlatform")?.value || "all").toLowerCase();
    const now = Date.now();
    const dayMs = 86400000;
    state.published = state.enriched.filter((row) => {
      if (!row.publishedDate) return false;
      if (platform !== "all" && String(row.platform || "").toLowerCase() !== platform) return false;
      if (daysValue !== "all") {
        const days = Number(daysValue);
        if (Number.isFinite(days) && now - row.publishedDate.getTime() > days * dayMs) return false;
      }
      return true;
    });
    state.sampled = state.published.filter((row) => row.analyticsPresent);
    state.filtered = state.sampled;
  }

  function metricValue(row, metric) {
    if (metric === "interactions") return row.interactionsKnown ? row.interactions : null;
    if (metric === "engagement") return Number.isFinite(row.engagementRate) ? row.engagementRate : null;
    if (metric === "reach") return row.reachKnown ? row.reach : null;
    return row.viewsKnown ? row.views : null;
  }

  function metricLabel(metric) {
    if (metric === "interactions") return "Interactions";
    if (metric === "engagement") return "Engagement rate";
    if (metric === "reach") return "Reach";
    return "Views";
  }

  function groupRows(rows, getter) {
    const map = new Map();
    rows.forEach((row) => {
      const keys = getter(row);
      const list = Array.isArray(keys) ? keys : [keys];
      list.filter(Boolean).forEach((key) => {
        const clean = String(key).trim();
        if (!clean) return;
        if (!map.has(clean)) map.set(clean, []);
        map.get(clean).push(row);
      });
    });
    return map;
  }

  function groupStats(rows, getter, metric = "views") {
    const groups = groupRows(rows, getter);
    return [...groups.entries()].map(([name, items]) => {
      const metricRows = items.map((row) => ({ row, value: metricValue(row, metric) })).filter((entry) => entry.value != null);
      const total = metricRows.reduce((sum, entry) => sum + entry.value, 0);
      const viewRows = items.filter((row) => row.viewsKnown);
      const interactionRows = items.filter((row) => row.interactionsKnown && row.viewsKnown);
      const views = viewRows.reduce((sum, row) => sum + row.views, 0);
      const interactions = interactionRows.reduce((sum, row) => sum + row.interactions, 0);
      const engagementViews = interactionRows.reduce((sum, row) => sum + row.views, 0);
      return {
        name,
        count: metricRows.length,
        group_count: items.length,
        total,
        average: metricRows.length ? total / metricRows.length : null,
        views,
        views_count: viewRows.length,
        interactions,
        engagementRate: engagementViews > 0 ? interactions / engagementViews * 100 : null,
      };
    }).filter((row) => row.count > 0).sort((a, b) => (b.average ?? -Infinity) - (a.average ?? -Infinity));
  }

  function renderCoverage() {
    const node = $("insightsCoverageNote");
    if (!node) return;
    const published = state.published.length;
    const sampled = state.sampled.length;
    const platforms = groupRows(state.sampled, (row) => row.platform);
    const labels = [...platforms.entries()]
      .map(([name, rows]) => name + " " + rows.length)
      .join(" · ");
    const coverage = published ? sampled / published * 100 : 0;
    node.className = "insights-coverage " + (coverage >= 60 ? "is-good" : coverage >= 25 ? "is-partial" : "is-limited");
    node.innerHTML =
      "<strong>Analytics coverage: " + esc(sampled) + " of " + esc(published) + " published outputs (" + esc(percent(coverage, 0)) + ")</strong>" +
      "<span>" + (labels ? esc(labels) + ". " : "") +
      "Missing analytics are treated as unknown, never as zero performance.</span>";
  }

  function renderConnections() {
    const target = $("insightsConnections");
    if (!target) return;
    if (!state.connections) {
      target.innerHTML = "<div class='insights-empty'>Connection status is loading.</div>";
      return;
    }
    if (state.connections.error) {
      target.innerHTML = "<div class='insights-empty'>" + esc(state.connections.error) + "</div>";
      return;
    }
    const connections = state.connections.connections || {};
    const order = ["instagram", "facebook", "youtube", "tiktok"];
    target.innerHTML = order.map((key) => {
      const item = connections[key] || {};
      const status = String(item.status || "error");
      const label = status === "connected" ? "Connected" : status === "needs_authorization" ? "Needs authorization" : "Error";
      const account = item.account_name || item.account_id || "Account not confirmed";
      const sync = item.last_successful_sync ? "Last sync " + dateTimeLabel(item.last_successful_sync) : "No successful analytics sync yet";
      const error = item.last_error || item.error || "";
      const reconnect = status !== "connected" && item.reconnect_url
        ? "<a class='secondary-button insights-reconnect' target='_blank' rel='noopener' href='" + esc(item.reconnect_url) + "'>Reconnect</a>"
        : (status === "needs_authorization" ? "<span class='insights-action-note'>Authorization required</span>" : "");
      return "<article class='insights-connection " + esc(status) + "'>" +
        "<div class='insights-connection-head'><strong>" + esc(item.platform || key) + "</strong><span>" + esc(label) + "</span></div>" +
        "<div class='insights-connection-account'>" + esc(account) + "</div>" +
        "<small>" + esc(sync) + "</small>" +
        (error ? "<p>" + esc(error) + "</p>" : "") +
        reconnect +
        "</article>";
    }).join("");
  }

  function renderKpis() {
    const target = $("insightsKpis");
    if (!target) return;
    const rows = state.sampled;
    const viewRows = rows.filter((row) => row.viewsKnown);
    const interactionRows = rows.filter((row) => row.interactionsKnown);
    const reachRows = rows.filter((row) => row.reachKnown);
    const views = viewRows.reduce((sum, row) => sum + row.views, 0);
    const interactions = interactionRows.reduce((sum, row) => sum + row.interactions, 0);
    const reach = reachRows.reduce((sum, row) => sum + row.reach, 0);
    const rateRows = rows.filter((row) => Number.isFinite(row.engagementRate));
    const rate = rateRows.length
      ? rateRows.reduce((sum, row) => sum + row.engagementRate, 0) / rateRows.length
      : null;
    const fresh = rows
      .map((row) => Date.parse(row.insights_as_of || ""))
      .filter(Number.isFinite)
      .sort((a, b) => b - a)[0];
    const cards = [
      { label: "Posts sampled", value: compact(rows.length), hint: state.published.length + " published in filter" },
      { label: "Views", value: viewRows.length ? compact(views) : "—", hint: "Known on " + viewRows.length + " post" + (viewRows.length === 1 ? "" : "s") + (reachRows.length ? " · reach known on " + reachRows.length : "") },
      { label: "Interactions", value: interactionRows.length ? compact(interactions) : "—", hint: "Known likes/comments/shares/saves · n=" + interactionRows.length },
      { label: "Avg engagement", value: rate == null ? "—" : percent(rate), hint: "Known interactions ÷ known views/reach · n=" + rateRows.length },
      { label: "Latest metric pull", value: fresh ? dateLabel(new Date(fresh)) : "—", hint: fresh ? dateTimeLabel(new Date(fresh)) : "No sampled timestamp" },
    ];
    target.innerHTML = cards.map((card) =>
      "<article class='insights-kpi'><span>" + esc(card.label) + "</span><strong>" + esc(card.value) +
      "</strong><small>" + esc(card.hint) + "</small></article>"
    ).join("");
  }

  function renderTrend() {
    const target = $("insightsTrendChart");
    if (!target) return;
    const metric = String($("insightsMetric")?.value || "views");
    const byDate = new Map();
    state.sampled.forEach((row) => {
      if (!row.publishedDate) return;
      const value = metricValue(row, metric);
      if (value == null) return;
      const key = row.publishedDate.toISOString().slice(0, 10);
      byDate.set(key, (byDate.get(key) || 0) + value);
    });
    const points = [...byDate.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!points.length) {
      target.innerHTML = "<div class='insights-empty'>No sampled posts in this filter yet.</div>";
      return;
    }
    const width = 760;
    const height = 250;
    const pad = 36;
    const max = Math.max(...points.map(([, value]) => value), 1);
    const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
    const coords = points.map(([label, value], i) => {
      const x = points.length === 1 ? width / 2 : pad + i * step;
      const y = height - pad - (value / max) * (height - pad * 2);
      return { label, value, x, y };
    });
    const path = coords.map((p, i) => (i ? "L" : "M") + p.x.toFixed(1) + " " + p.y.toFixed(1)).join(" ");
    const first = coords[0];
    const mid = coords[Math.floor((coords.length - 1) / 2)];
    const last = coords[coords.length - 1];
    const labels = [...new Set([first, mid, last])].map((p) =>
      "<text x='" + p.x + "' y='" + (height - 8) + "' text-anchor='middle'>" + esc(dateLabel(p.label)) + "</text>"
    ).join("");
    const dots = coords.map((p) =>
      "<circle cx='" + p.x + "' cy='" + p.y + "' r='4'><title>" + esc(dateLabel(p.label) + ": " + (metric === "engagement" ? percent(p.value) : compact(p.value))) + "</title></circle>"
    ).join("");
    target.innerHTML =
      "<div class='insights-chart-title'>" + esc(metricLabel(metric)) + " by publish date</div>" +
      "<svg class='insights-line-chart' viewBox='0 0 " + width + " " + height + "' role='img' aria-label='" + esc(metricLabel(metric) + " trend") + "'>" +
      "<line class='gridline' x1='" + pad + "' y1='" + (height - pad) + "' x2='" + (width - pad) + "' y2='" + (height - pad) + "'></line>" +
      "<line class='gridline' x1='" + pad + "' y1='" + pad + "' x2='" + (width - pad) + "' y2='" + pad + "'></line>" +
      "<text x='8' y='" + (pad + 4) + "'>" + esc(metric === "engagement" ? percent(max) : compact(max)) + "</text>" +
      "<text x='8' y='" + (height - pad + 4) + "'>0</text>" +
      "<path d='" + path + "'></path>" + dots + labels + "</svg>";
  }

  function barRows(stats, options = {}) {
    if (!stats.length) return "<div class='insights-empty'>Not enough sampled data yet.</div>";
    const max = Math.max(...stats.map((row) => options.total ? row.total : row.average), 1);
    return stats.slice(0, options.limit || 8).map((row) => {
      const value = options.total ? row.total : row.average;
      const width = Math.max(2, value / max * 100);
      const formatted = options.percent ? percent(value) : compact(value);
      return "<div class='insights-bar-row'>" +
        "<div class='insights-bar-label'><strong>" + esc(row.name) + "</strong><small>n=" + esc(row.count) + "</small></div>" +
        "<div class='insights-bar-track'><span style='width:" + width.toFixed(1) + "%'></span></div>" +
        "<b>" + esc(formatted) + "</b></div>";
    }).join("");
  }

  function renderPlatform() {
    const target = $("insightsPlatformChart");
    if (!target) return;
    const metric = String($("insightsMetric")?.value || "views");
    const stats = groupStats(state.sampled, (row) => row.platform || "Unknown", metric);
    target.innerHTML =
      "<div class='insights-chart-title'>Average " + esc(metricLabel(metric).toLowerCase()) + " per sampled post</div>" +
      barRows(stats, { percent: metric === "engagement", limit: 8 });
  }

  function renderTopPosts() {
    const target = $("insightsTopPosts");
    if (!target) return;
    const metric = String($("insightsMetric")?.value || "views");
    const rows = [...state.sampled]
      .filter((row) => metricValue(row, metric) != null)
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric))
      .slice(0, 8);
    if (!rows.length) {
      target.innerHTML = "<div class='insights-empty'>No sampled posts yet.</div>";
      return;
    }
    const max = Math.max(...rows.map((row) => metricValue(row, metric)), 1);
    target.innerHTML = rows.map((row, index) => {
      const value = metricValue(row, metric);
      const width = Math.max(2, value / max * 100);
      const link = row.platform_post_url
        ? "<a target='_blank' rel='noopener' href='" + esc(row.platform_post_url) + "'>Open post ↗</a>"
        : "";
      return "<article class='insights-top-post'>" +
        "<div class='insights-rank'>" + (index + 1) + "</div>" +
        "<div class='insights-top-main'><strong>" + esc(row.title) + "</strong>" +
        "<small>" + esc(row.platform || "Unknown") + " · " + esc(dateLabel(row.published_at)) + " " + link + "</small>" +
        "<div class='insights-bar-track'><span style='width:" + width.toFixed(1) + "%'></span></div></div>" +
        "<b>" + esc(metric === "engagement" ? percent(value) : compact(value)) + "</b></article>";
    }).join("");
  }

  function renderOpportunityMatrix() {
    const target = $("insightsOpportunity");
    if (!target) return;
    const rows = state.sampled.filter((row) => row.views > 0 && Number.isFinite(row.engagementRate));
    if (rows.length < 2) {
      target.innerHTML = "<div class='insights-empty'>Need at least two posts with views and interactions for the opportunity matrix.</div>";
      return;
    }
    const width = 700;
    const height = 330;
    const pad = 48;
    const maxViews = Math.max(...rows.map((row) => row.views), 1);
    const maxRate = Math.max(...rows.map((row) => row.engagementRate), 1);
    const sortedViews = [...rows].map((r) => r.views).sort((a, b) => a - b);
    const sortedRate = [...rows].map((r) => r.engagementRate).sort((a, b) => a - b);
    const medianViews = sortedViews[Math.floor(sortedViews.length / 2)];
    const medianRate = sortedRate[Math.floor(sortedRate.length / 2)];
    const xFor = (v) => pad + (v / maxViews) * (width - pad * 2);
    const yFor = (v) => height - pad - (v / maxRate) * (height - pad * 2);
    const midX = xFor(medianViews);
    const midY = yFor(medianRate);
    const dots = rows.map((row) => {
      const x = xFor(row.views);
      const y = yFor(row.engagementRate);
      return "<circle cx='" + x.toFixed(1) + "' cy='" + y.toFixed(1) + "' r='7' tabindex='0'>" +
        "<title>" + esc(row.title + " · " + compact(row.views) + " views · " + percent(row.engagementRate) + " engagement") + "</title></circle>";
    }).join("");
    target.innerHTML =
      "<div class='insights-chart-title'>Reach vs response · each dot is one sampled post</div>" +
      "<svg class='insights-scatter' viewBox='0 0 " + width + " " + height + "' role='img' aria-label='Opportunity matrix'>" +
      "<rect x='" + pad + "' y='" + pad + "' width='" + (width - pad * 2) + "' height='" + (height - pad * 2) + "'></rect>" +
      "<line class='matrix-mid' x1='" + midX + "' y1='" + pad + "' x2='" + midX + "' y2='" + (height - pad) + "'></line>" +
      "<line class='matrix-mid' x1='" + pad + "' y1='" + midY + "' x2='" + (width - pad) + "' y2='" + midY + "'></line>" +
      "<text class='matrix-label' x='" + (pad + 8) + "' y='" + (pad + 18) + "'>Engaging niche</text>" +
      "<text class='matrix-label' x='" + (midX + 8) + "' y='" + (pad + 18) + "'>Replicate</text>" +
      "<text class='matrix-label' x='" + (pad + 8) + "' y='" + (height - pad - 10) + "'>Rework</text>" +
      "<text class='matrix-label' x='" + (midX + 8) + "' y='" + (height - pad - 10) + "'>Reach, low response</text>" +
      dots +
      "<text class='axis-label' x='" + (width / 2) + "' y='" + (height - 10) + "' text-anchor='middle'>Views →</text>" +
      "<text class='axis-label' transform='translate(14 " + (height / 2) + ") rotate(-90)' text-anchor='middle'>Engagement rate →</text>" +
      "</svg>";
  }

  function renderDna() {
    const metric = String($("insightsMetric")?.value || "views");
    const typeTarget = $("insightsDnaType");
    const locationTarget = $("insightsDnaLocation");
    const themeTarget = $("insightsDnaTheme");
    const voiceTarget = $("insightsDnaVoice");
    if (typeTarget) {
      const stats = groupStats(state.sampled, (row) => row.contentType, metric);
      typeTarget.innerHTML = "<h4>Content type</h4>" + barRows(stats, { percent: metric === "engagement", limit: 6 });
    }
    if (locationTarget) {
      const stats = groupStats(state.sampled.filter((r) => r.location), (row) => row.location, metric);
      locationTarget.innerHTML = "<h4>Location</h4>" + barRows(stats, { percent: metric === "engagement", limit: 6 });
    }
    if (themeTarget) {
      const stats = groupStats(state.sampled.filter((r) => r.themes.length), (row) => row.themes, metric);
      themeTarget.innerHTML = "<h4>Theme</h4>" + barRows(stats, { percent: metric === "engagement", limit: 6 });
    }
    if (voiceTarget) {
      const rows = state.sampled.filter((r) => r.voiceover);
      const stats = groupStats(rows, (row) => row.voiceover, metric);
      voiceTarget.innerHTML = "<h4>Voiceover</h4>" + barRows(stats, { percent: metric === "engagement", limit: 4 });
    }
  }

  function renderTiming() {
    const target = $("insightsTiming");
    if (!target) return;
    const timingRows = state.sampled.filter((row) => row.viewsKnown);
    if (!timingRows.length) {
      target.innerHTML = "<div class='insights-empty'>No timing data with known views in the current filter.</div>";
      return;
    }
    const cells = [];
    let maxAvg = 0;
    DAY_NAMES.forEach((day, dayIndex) => {
      TIME_BUCKETS.forEach((bucket) => {
        const rows = timingRows.filter((row) => {
          if (!row.publishedDate) return false;
          const d = row.publishedDate;
          return d.getDay() === dayIndex && d.getHours() >= bucket.start && d.getHours() < bucket.end;
        });
        const avg = rows.length ? rows.reduce((sum, row) => sum + row.views, 0) / rows.length : 0;
        maxAvg = Math.max(maxAvg, avg);
        cells.push({ day, dayIndex, bucket, rows, avg });
      });
    });
    const header = "<div class='heatmap-corner'></div>" + TIME_BUCKETS.map((b) => "<div class='heatmap-head'>" + esc(b.label) + "</div>").join("");
    const body = DAY_NAMES.map((day, dayIndex) => {
      const dayCells = cells.filter((cell) => cell.dayIndex === dayIndex);
      return "<div class='heatmap-day'>" + esc(day) + "</div>" + dayCells.map((cell) => {
        const opacity = cell.rows.length && maxAvg ? 0.16 + (cell.avg / maxAvg) * 0.74 : 0.04;
        return "<div class='heatmap-cell' style='--heat:" + opacity.toFixed(2) + "' title='" +
          esc(day + " " + cell.bucket.label + " · n=" + cell.rows.length + " · avg " + compact(cell.avg) + " views") + "'>" +
          (cell.rows.length ? "<b>" + esc(compact(cell.avg)) + "</b><small>n=" + cell.rows.length + "</small>" : "—") + "</div>";
      }).join("");
    }).join("");
    target.innerHTML = "<div class='insights-heatmap'>" + header + body + "</div>" +
      "<p class='insights-footnote'>Timing cells show average stored views. Small samples are descriptive, not a recommendation.</p>";
  }

  function renderPostsTable() {
    const target = $("insightsPostsTable");
    if (!target) return;
    const rows = [...state.sampled].sort((a, b) => (b.viewsKnown ? b.views : -1) - (a.viewsKnown ? a.views : -1)).slice(0, 40);
    if (!rows.length) {
      target.innerHTML = "<div class='insights-empty'>No posts with stored analytics in this filter.</div>";
      return;
    }
    const growth = (row) => {
      const m = row.milestones || {};
      const piece = (label, value) => label + " " + metricCompact(value?.views);
      return [piece("24h", m.h24), piece("7d", m.d7), piece("30d", m.d30)].join(" · ");
    };
    target.innerHTML = "<table class='insights-table'><thead><tr><th>Post</th><th>Platform</th><th>Views</th><th>Interactions</th><th>Engagement</th><th>Growth snapshots</th><th>Data as of</th></tr></thead><tbody>" +
      rows.map((row) => {
        const title = row.platform_post_url
          ? "<a target='_blank' rel='noopener' href='" + esc(row.platform_post_url) + "'>" + esc(row.title) + " ↗</a>"
          : esc(row.title);
        return "<tr><td><strong>" + title + "</strong><small>" + esc(dateLabel(row.published_at)) + "</small></td>" +
          "<td>" + esc(row.platform || "—") + "</td><td>" + esc(row.viewsKnown ? compact(row.views) : "—") + "</td>" +
          "<td>" + esc(row.interactionsKnown ? compact(row.interactions) : "—") + "</td><td>" + esc(row.engagementRate == null ? "—" : percent(row.engagementRate)) + "</td>" +
          "<td><small>" + esc(growth(row)) + "</small></td>" +
          "<td>" + esc(dateTimeLabel(row.insights_as_of)) + "</td></tr>";
      }).join("") + "</tbody></table>";
  }

  function evidenceGroups() {
    const byPlatform = groupStats(state.sampled, (r) => r.platform || "Unknown", "views");
    const byType = groupStats(state.sampled, (r) => r.contentType, "views");
    const byLocation = groupStats(state.sampled.filter((r) => r.location), (r) => r.location, "views");
    const byTheme = groupStats(state.sampled.filter((r) => r.themes.length), (r) => r.themes, "views");
    const byVoice = groupStats(state.sampled.filter((r) => r.voiceover), (r) => r.voiceover, "views");
    const topPosts = [...state.sampled].sort((a, b) => b.views - a.views).slice(0, 12);
    return { byPlatform, byType, byLocation, byTheme, byVoice, topPosts };
  }

  function analystContext() {
    const evidence = evidenceGroups();
    const viewRows = state.sampled.filter((r) => r.viewsKnown);
    const interactionRows = state.sampled.filter((r) => r.interactionsKnown);
    const views = viewRows.reduce((sum, r) => sum + r.views, 0);
    const interactions = interactionRows.reduce((sum, r) => sum + r.interactions, 0);
    const coverage = state.published.length ? state.sampled.length / state.published.length * 100 : 0;
    const compactGroup = (rows) => rows.slice(0, 10).map((r) => ({
      name: r.name,
      sample_size: r.count,
      average_views: Math.round(r.views / Math.max(r.count, 1)),
      total_views: Math.round(r.views),
      engagement_rate: r.engagementRate == null ? null : Number(r.engagementRate.toFixed(2)),
    }));
    return {
      profile: profileLabel(),
      filters: {
        date_range: $("insightsDateRange")?.value || "all",
        platform: $("insightsPlatform")?.value || "all",
      },
      coverage: {
        published_outputs: state.published.length,
        sampled_outputs: state.sampled.length,
        coverage_percent: Number(coverage.toFixed(1)),
        note: "Missing analytics are unknown, not zero.",
      },
      totals: {
        views: viewRows.length ? Math.round(views) : null,
        views_sample_size: viewRows.length,
        interactions: interactionRows.length ? Math.round(interactions) : null,
        interactions_sample_size: interactionRows.length,
      },
      platforms: compactGroup(evidence.byPlatform),
      content_types: compactGroup(evidence.byType),
      locations: compactGroup(evidence.byLocation),
      themes: compactGroup(evidence.byTheme),
      voiceover: compactGroup(evidence.byVoice),
      top_posts: evidence.topPosts.map((r) => ({
        title: r.title,
        platform: r.platform,
        published_at: r.published_at,
        views: r.viewsKnown ? r.views : null,
        reach: r.reachKnown ? r.reach : null,
        likes: r.likesKnown ? r.likes : null,
        comments: r.commentsKnown ? r.comments : null,
        shares: r.sharesKnown ? r.shares : null,
        saves: r.savesKnown ? r.saves : null,
        interactions: r.interactionsKnown ? r.interactions : null,
        milestones: r.milestones || {},
        engagement_rate: r.engagementRate == null ? null : Number(r.engagementRate.toFixed(2)),
        content_type: r.contentType,
        location: r.location || null,
        themes: r.themes,
        voiceover: r.voiceover || null,
        duration_seconds: r.duration || null,
      })),
      bottom_mature_posts: [...state.sampled]
        .filter((r) => {
          const published = r.publishedDate?.getTime();
          const asOf = Date.parse(r.insights_as_of || "");
          return published && Number.isFinite(asOf) && asOf - published >= 12 * 3600000;
        })
        .sort((a, b) => a.views - b.views)
        .slice(0, 10)
        .map((r) => ({
          title: r.title,
          platform: r.platform,
          published_at: r.published_at,
          views: r.views,
          interactions: r.interactions,
          engagement_rate: r.engagementRate == null ? null : Number(r.engagementRate.toFixed(2)),
          content_type: r.contentType,
          location: r.location || null,
          themes: r.themes,
        })),
      timing_windows: groupStats(
        state.sampled.filter((r) => r.publishedDate),
        (r) => {
          const d = r.publishedDate;
          const bucket = TIME_BUCKETS.find((b) => d.getHours() >= b.start && d.getHours() < b.end);
          return DAY_NAMES[d.getDay()] + " " + (bucket?.label || "");
        },
        "views"
      ).slice(0, 10).map((r) => ({
        window: r.name,
        sample_size: r.count,
        average_views: Math.round(r.views / Math.max(r.count, 1)),
      })),
    };
  }

  function addChatMessage(role, content, extras = null) {
    const target = $("insightsChatMessages");
    if (!target) return null;
    const article = document.createElement("article");
    article.className = "insights-chat-message " + role;
    const heading = role === "user" ? "You" : "Performance Analyst";
    article.innerHTML = "<div class='chat-role'>" + esc(heading) + "</div><div class='chat-copy'>" + esc(content).replace(/\n/g, "<br>") + "</div>";
    if (extras?.evidence?.length) {
      article.innerHTML += "<div class='chat-evidence'><strong>Evidence</strong><ul>" +
        extras.evidence.slice(0, 6).map((x) => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    }
    if (extras?.caveats?.length) {
      article.innerHTML += "<div class='chat-caveat'><strong>Watch-outs:</strong> " + esc(extras.caveats.slice(0, 4).join(" · ")) + "</div>";
    }
    if (extras?.follow_ups?.length) {
      article.innerHTML += "<div class='chat-followups'>" +
        extras.follow_ups.slice(0, 4).map((x) => "<button type='button' data-insights-followup='" + esc(x) + "'>" + esc(x) + "</button>").join("") +
        "</div>";
    }
    target.appendChild(article);
    target.scrollTop = target.scrollHeight;
    article.querySelectorAll("[data-insights-followup]").forEach((button) => {
      button.addEventListener("click", () => askAnalyst(button.dataset.insightsFollowup || ""));
    });
    return article;
  }

  function localAnalystAnswer(question) {
    const q = String(question || "").toLowerCase();
    const evidence = evidenceGroups();
    const top = evidence.topPosts[0];
    const mature = state.sampled.filter((r) => {
      const published = r.publishedDate?.getTime();
      const asOf = Date.parse(r.insights_as_of || "");
      return published && Number.isFinite(asOf) && asOf - published >= 12 * 3600000;
    });
    const bottom = [...mature].sort((a, b) => a.views - b.views)[0];
    const caveats = [];
    if (state.sampled.length < 8) caveats.push("The sample is still small (" + state.sampled.length + " posts).");
    if (state.sampled.length < state.published.length) caveats.push("Only " + state.sampled.length + " of " + state.published.length + " published outputs have stored analytics.");
    if (!state.sampled.length) {
      return { answer: "There is not enough stored post analytics in this filter to make a performance assessment yet.", evidence: [], caveats };
    }
    if (/platform|instagram|facebook|tiktok|youtube/.test(q)) {
      const rows = evidence.byPlatform;
      if (rows.length < 2) {
        return { answer: "I only have meaningful sampled data for " + (rows[0]?.name || "one platform") + " in this view, so a cross-platform comparison would be misleading.", evidence: rows.map((r) => r.name + ": n=" + r.count + ", avg " + compact(r.views / r.count) + " views"), caveats };
      }
      return { answer: rows[0].name + " has the highest average stored views in the current sample. I would treat that as a directional signal until each platform has a comparable number of sampled posts.", evidence: rows.slice(0, 4).map((r) => r.name + ": n=" + r.count + ", avg " + compact(r.views / r.count) + " views"), caveats };
    }
    if (/location|place|neighborhood/.test(q) && evidence.byLocation.length) {
      const best = evidence.byLocation[0];
      return { answer: best.name + " is the strongest observed location by average views in the current filter. The sample size matters: I would only turn this into a production rule after we see the pattern repeat.", evidence: evidence.byLocation.slice(0, 5).map((r) => r.name + ": n=" + r.count + ", avg " + compact(r.views / r.count) + " views"), caveats };
    }
    if (/theme|topic|architecture|food|content/.test(q) && evidence.byTheme.length) {
      const best = evidence.byTheme[0];
      return { answer: best.name + " is the strongest observed theme by average views in this sample. I would test another few posts in the same theme before assuming causation.", evidence: evidence.byTheme.slice(0, 5).map((r) => r.name + ": n=" + r.count + ", avg " + compact(r.views / r.count) + " views"), caveats };
    }
    if (/voice|voiceover|music/.test(q) && evidence.byVoice.length) {
      return { answer: "Here is the observed voiceover split. If one side has only one or two posts, it is too early to say voiceover caused the difference.", evidence: evidence.byVoice.map((r) => r.name + ": n=" + r.count + ", avg " + compact(r.views / r.count) + " views"), caveats };
    }
    if (/worst|weak|underperform|not performing|poor/.test(q) && bottom) {
      return { answer: bottom.title + " is the weakest mature sampled post by stored views in this filter. I would inspect its hook, topic, first frame, and distribution before deciding the subject itself failed.", evidence: [bottom.platform + " · " + compact(bottom.views) + " views · " + compact(bottom.interactions) + " interactions"], caveats };
    }
    if (/what should|post more|recommend|next|make more/.test(q)) {
      const type = evidence.byType.find((r) => r.count >= 2) || evidence.byType[0];
      const loc = evidence.byLocation.find((r) => r.count >= 2) || evidence.byLocation[0];
      const pieces = [];
      if (type) pieces.push(type.name + " is the strongest observed content type");
      if (loc) pieces.push(loc.name + " is the strongest observed location");
      return { answer: "Based on the current sample, I would run a controlled repeat of what is already working rather than chase a new pattern: " + pieces.join(", ") + ". Keep the creative structure similar, then change one variable at a time so the next analytics pull teaches us something.", evidence: top ? [top.title + ": " + compact(top.views) + " views"] : [], caveats };
    }
    return {
      answer: top
        ? "Your clearest positive signal right now is " + top.title + ", which leads the sampled posts on stored views. " + (bottom ? "At the other end, " + bottom.title + " is the weakest mature sampled post. " : "") + "The more important story is coverage: I will avoid calling unsampled posts failures."
        : "I have sampled analytics, but no clear top post under this filter.",
      evidence: top ? [top.platform + " · " + compact(top.views) + " views · " + compact(top.interactions) + " interactions"] : [],
      caveats,
    };
  }

  async function askAnalyst(question) {
    const clean = String(question || "").trim();
    if (!clean) return;
    addChatMessage("user", clean);
    const input = $("insightsChatInput");
    if (input) input.value = "";
    const waiting = addChatMessage("assistant", "Analyzing the current filtered performance data…");
    try {
      const result = await fetchJson("/api/insights/chat", {
        method: "POST",
        body: JSON.stringify({ question: clean, context: analystContext() }),
      });
      waiting?.remove();
      addChatMessage("assistant", result.answer || "I analyzed the current data.", {
        evidence: Array.isArray(result.evidence) ? result.evidence : [],
        caveats: Array.isArray(result.caveats) ? result.caveats : [],
        follow_ups: Array.isArray(result.follow_ups) ? result.follow_ups : [],
      });
    } catch (error) {
      waiting?.remove();
      const local = localAnalystAnswer(clean);
      addChatMessage("assistant", local.answer, {
        evidence: local.evidence || [],
        caveats: [...(local.caveats || []), "Live AI analysis was unavailable, so this answer was calculated locally from the same dashboard data."],
      });
    }
  }

  function renderAll() {
    applyFilters();
    renderCoverage();
    renderConnections();
    renderKpis();
    renderTrend();
    renderPlatform();
    renderTopPosts();
    renderOpportunityMatrix();
    renderDna();
    renderTiming();
    renderPostsTable();
    const subtitle = $("insightsSubtitle");
    if (subtitle) {
      subtitle.textContent = profileLabel() + " · " + state.sampled.length + " sampled post" + (state.sampled.length === 1 ? "" : "s") + " in the current filter";
    }
  }

  async function loadInsights(force = false) {
    if (state.loading) return;
    if (state.loadedAt && !force && Date.now() - state.loadedAt < 30000) {
      renderAll();
      return;
    }
    state.loading = true;
    const status = $("insightsStatus");
    if (status) status.textContent = "Loading performance data…";
    try {
      const [postsResult, connectionsResult] = await Promise.allSettled([
        fetchJson("/api/insights/posts?limit=500"),
        fetchJson("/api/insights/connections"),
      ]);
      const posts = postsResult.status === "fulfilled" ? postsResult.value : null;
      state.connections = connectionsResult.status === "fulfilled"
        ? connectionsResult.value
        : { error: connectionsResult.reason?.message || "Could not load account connection status." };
      if (posts && Array.isArray(posts.records)) {
        state.outputs = posts.records;
        state.content = [];
      } else {
        const [outputs, content] = await Promise.all([
          fetchJson("/api/outputs?limit=100"),
          fetchJson("/api/content?limit=100"),
        ]);
        state.outputs = Array.isArray(outputs.records) ? outputs.records : [];
        state.content = Array.isArray(content.records) ? content.records : [];
      }
      enrichRows();
      state.loadedAt = Date.now();
      renderAll();
      if (status) status.textContent = "Updated " + dateTimeLabel(new Date());
    } catch (error) {
      if (status) status.textContent = error.message || "Could not load insights.";
      const coverage = $("insightsCoverageNote");
      if (coverage) coverage.innerHTML = "<strong>Insights unavailable</strong><span>" + esc(error.message || "Could not load data.") + "</span>";
    } finally {
      state.loading = false;
    }
  }

  function insightsPageActive() {
    return $("page-insights")?.classList.contains("active");
  }

  document.querySelectorAll('[data-page="insights"]').forEach((button) => {
    button.addEventListener("click", () => setTimeout(() => loadInsights(false), 0));
  });
  $("insightsRefresh")?.addEventListener("click", () => loadInsights(true));
  ["insightsDateRange", "insightsPlatform", "insightsMetric"].forEach((id) => {
    $(id)?.addEventListener("change", () => renderAll());
  });
  $("insightsChatForm")?.addEventListener("submit", (event) => {
    event.preventDefault();
    askAnalyst($("insightsChatInput")?.value || "");
  });
  document.querySelectorAll("[data-insights-prompt]").forEach((button) => {
    button.addEventListener("click", () => askAnalyst(button.dataset.insightsPrompt || ""));
  });
  $("studioProfileSelect")?.addEventListener("change", () => {
    state.loadedAt = null;
    if (insightsPageActive()) setTimeout(() => loadInsights(true), 100);
  });

  window.ChicagoShiningInsights = {
    load: loadInsights,
    ask: askAnalyst,
    getContext: analystContext,
  };
})();