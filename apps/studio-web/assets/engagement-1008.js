(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    settings: null,
    capabilities: null,
    recommendations: [],
    history: [],
    insights: null,
    loading: false,
    selected: new Set(),
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function currentProfileId() {
    return String($("studioProfileSelect")?.value || "").trim();
  }

  function setStatus(message, isError = false) {
    const node = $("engagementStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("is-error", Boolean(isError));
  }

  async function fetchJson(path, options = {}) {
    const profileId = currentProfileId();
    const url = new URL(path, window.location.origin);
    if (profileId && !url.searchParams.has("content_profile_id")) {
      url.searchParams.set("content_profile_id", profileId);
    }
    const response = await fetch(url.toString(), {
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
      throw new Error(body?.error || body?.message || ("Engagement request failed (" + response.status + ")"));
    }
    return body || {};
  }

  function linesFromTextarea(id) {
    return String($(id)?.value || "")
      .split(/\n|,/)
      .map((row) => row.trim())
      .filter(Boolean);
  }

  function fillSettingsForm(settings) {
    state.settings = settings;
    if ($("engagementKeywords")) $("engagementKeywords").value = (settings.keywords || []).join("\n");
    if ($("engagementExclusions")) $("engagementExclusions").value = (settings.exclusions || []).join("\n");
    if ($("engagementThreshold")) $("engagementThreshold").value = settings.relevance_threshold ?? 0.45;
    if ($("engagementDailyComments")) $("engagementDailyComments").value = settings.daily_comment_limit ?? 5;
    if ($("engagementStageB")) $("engagementStageB").checked = settings.stage_b_enabled === true;
    if ($("engagementEnabled")) $("engagementEnabled").checked = settings.enabled !== false;
  }

  function renderCapabilityNote(capabilities) {
    state.capabilities = capabilities || {};
    const note = $("engagementCapabilityNote");
    if (!note) return;
    const bits = Object.entries(state.capabilities).map(([platform, row]) => {
      const comment = row.stage_b_comment ? "comment API" : "comment manual";
      const like = row.stage_b_like ? "like API" : "like manual";
      return `${platform}: discover=${row.discover}, ${comment}, ${like}`;
    });
    note.textContent = bits.join(" · ");
  }

  function renderKpis(insights) {
    const root = $("engagementKpis");
    if (!root) return;
    const cards = [
      ["Discovered", insights?.discovered ?? 0],
      ["Suggestions", insights?.suggestions_generated ?? 0],
      ["Approved", insights?.comments_approved ?? 0],
      ["Likes published", insights?.likes_completed ?? 0],
      ["Comments published", insights?.comments_published ?? 0],
      ["Failure %", insights?.failure_rate ?? 0],
    ];
    root.innerHTML = cards.map(([label, value]) => (
      `<div class="engagement-kpi"><strong>${esc(value)}</strong><span>${esc(label)}</span></div>`
    )).join("");
  }

  function renderInsights(insights) {
    state.insights = insights;
    renderKpis(insights);
    const root = $("engagementInsights");
    if (!root) return;
    const byPlatform = Object.entries(insights?.by_platform || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "None yet";
    const byProfile = Object.entries(insights?.by_profile || {}).map(([k, v]) => `${k}: ${v}`).join(", ") || "None yet";
    const creators = (insights?.top_creators || []).map((row) => `${row.creator} (${row.platform} ×${row.count})`).join(", ") || "None yet";
    root.innerHTML = `
      <div class="engagement-insights-grid">
        <div><strong>By platform</strong><p>${esc(byPlatform)}</p></div>
        <div><strong>By profile</strong><p>${esc(byProfile)}</p></div>
        <div><strong>Frequent creators</strong><p>${esc(creators)}</p></div>
        <div><strong>Rejection %</strong><p>${esc(insights?.rejection_rate ?? 0)}</p></div>
      </div>
      <p class="subtle">${esc(insights?.note || "")}</p>
    `;
  }

  function capabilityBadge(platform, action) {
    const row = state.capabilities?.[platform];
    if (!row) return "unknown";
    if (action === "comment") return row.stage_b_comment ? "API" : "Manual";
    if (action === "like") return row.stage_b_like ? "API" : "Manual";
    return row.discover || "unknown";
  }

  function renderRecommendations() {
    const root = $("engagementRecommendations");
    if (!root) return;
    if (!state.recommendations.length) {
      root.innerHTML = `<p class="subtle">No open recommendations. Run Discover now for the current profile.</p>`;
      return;
    }
    root.innerHTML = state.recommendations.map((row) => {
      const comments = Array.isArray(row.suggested_comments) ? row.suggested_comments : [];
      const selected = row.selected_comment || comments[0] || "";
      const checked = state.selected.has(row.target_id) ? "checked" : "";
      return `
        <article class="engagement-card" data-target-id="${esc(row.target_id)}">
          <header class="engagement-card-head">
            <label class="engagement-select"><input type="checkbox" data-select-target="${esc(row.target_id)}" ${checked}> Select</label>
            <div>
              <strong>${esc(row.creator_name || row.creator_id || "Creator")}</strong>
              <span class="engagement-meta">${esc(row.platform)} · score ${esc(row.relevance_score)} · ${esc(row.approval_status || row.eligibility_status)}</span>
            </div>
          </header>
          <p class="engagement-caption">${esc(row.content_summary || row.caption || "")}</p>
          <p class="subtle">${esc(row.recommend_reason || "")}</p>
          <p class="engagement-link"><a href="${esc(row.post_url)}" target="_blank" rel="noopener noreferrer">Open original post</a>
            · Comment path: ${esc(capabilityBadge(row.platform, "comment"))}
            · Like path: ${esc(capabilityBadge(row.platform, "like"))}</p>
          <label class="form-field"><span>Suggested comment</span>
            <textarea data-comment-for="${esc(row.target_id)}" rows="3">${esc(selected)}</textarea>
          </label>
          ${comments.length > 1 ? `<div class="engagement-alts">${comments.map((text, index) => (
            `<button type="button" class="chip-button" data-use-comment="${esc(row.target_id)}" data-comment-index="${index}">Use #${index + 1}</button>`
          )).join("")}</div>` : ""}
          <div class="engagement-actions">
            <button type="button" class="primary-button" data-action="approve" data-target-id="${esc(row.target_id)}">Approve Comment</button>
            <button type="button" class="secondary-button" data-action="edit" data-target-id="${esc(row.target_id)}">Edit Comment</button>
            <button type="button" class="secondary-button" data-action="like" data-target-id="${esc(row.target_id)}">Like</button>
            <button type="button" class="secondary-button" data-action="comment" data-target-id="${esc(row.target_id)}">Comment</button>
            <button type="button" class="secondary-button" data-action="open_post" data-target-id="${esc(row.target_id)}">Open Post</button>
            <button type="button" class="secondary-button" data-action="skip" data-target-id="${esc(row.target_id)}">Skip</button>
            <button type="button" class="danger-button" data-action="block_creator" data-target-id="${esc(row.target_id)}">Block Creator</button>
          </div>
        </article>
      `;
    }).join("");
  }

  function renderHistory() {
    const root = $("engagementHistory");
    if (!root) return;
    if (!state.history.length) {
      root.innerHTML = `<p class="subtle">No engagement actions yet.</p>`;
      return;
    }
    root.innerHTML = `<table class="engagement-table"><thead><tr><th>When</th><th>Channel</th><th>Type</th><th>Platform</th><th>Status</th><th>Post</th><th>Detail</th></tr></thead><tbody>${
      state.history.map((row) => {
        const channel = row.creator_name || row.creator_id || "—";
        const postUrl = String(row.post_url || "").trim();
        const postCell = postUrl
          ? `<a href="${esc(postUrl)}" target="_blank" rel="noopener noreferrer">Open post</a>`
          : "—";
        return `
        <tr>
          <td>${esc(String(row.executed_at || row.approved_at || row.created_at || "").replace("T", " ").slice(0, 16))}</td>
          <td>${esc(channel)}</td>
          <td>${esc(row.action_type)}</td>
          <td>${esc(row.platform)}</td>
          <td>${esc(row.execution_status || row.approval_status)}</td>
          <td>${postCell}</td>
          <td>${esc(row.error_details || row.edited_comment || row.suggested_comment || row.published_comment_id || "")}</td>
        </tr>`;
      }).join("")
    }</tbody></table>`;
  }

  function commentFor(targetId) {
    const area = document.querySelector(`textarea[data-comment-for="${targetId}"]`);
    return String(area?.value || "").trim();
  }

  function stageBChecked() {
    return Boolean($("engagementStageB")?.checked);
  }

  async function runAction(action, targetId) {
    const payload = {
      action,
      target_id: targetId,
      comment: commentFor(targetId),
      // Send checkbox state so Miami/etc Stage B is persisted even if Save was skipped.
      stage_b_enabled: stageBChecked(),
    };
    setStatus(`Running ${action}…`);
    const result = await fetchJson("/api/engagement/actions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    if (action === "open_post" && (result.post_url || result.target?.post_url)) {
      window.open(result.post_url || result.target.post_url, "_blank", "noopener,noreferrer");
    }
    // Platform-unsupported opens the post for manual work. Stage B off must not —
    // that looked like success while no YouTube API call ran.
    if (result.unsupported && !result.stage_b_disabled && (result.post_url || result.target?.post_url)) {
      window.open(result.post_url || result.target.post_url, "_blank", "noopener,noreferrer");
    }
    setStatus(result.message || "Done.", result.ok === false);
    await loadEngagement(true);
  }

  async function saveSettings() {
    const body = {
      keywords: linesFromTextarea("engagementKeywords"),
      exclusions: linesFromTextarea("engagementExclusions"),
      relevance_threshold: Number($("engagementThreshold")?.value || 0.45),
      daily_comment_limit: Number($("engagementDailyComments")?.value || 5),
      stage_b_enabled: Boolean($("engagementStageB")?.checked),
      enabled: Boolean($("engagementEnabled")?.checked),
      require_approval: true,
    };
    setStatus("Saving settings…");
    const result = await fetchJson("/api/engagement/settings", {
      method: "PATCH",
      body: JSON.stringify(body),
    });
    fillSettingsForm(result.settings || body);
    setStatus("Settings saved.");
  }

  async function discover() {
    setStatus("Discovering relevant posts…");
    const result = await fetchJson("/api/engagement/discover", {
      method: "POST",
      body: JSON.stringify({ force: true }),
    });
    setStatus(result.message || "Discovery finished.");
    await loadEngagement(true);
  }

  async function loadEngagement(force = false) {
    if (state.loading && !force) return;
    state.loading = true;
    const platform = String($("engagementPlatform")?.value || "all");
    const subtitle = $("engagementSubtitle");
    if (subtitle) subtitle.textContent = "Loading engagement queue…";
    try {
      const query = platform && platform !== "all" ? `?platform=${encodeURIComponent(platform)}` : "";
      const [bundle, insights, capabilities] = await Promise.all([
        fetchJson("/api/engagement/recommendations" + query),
        fetchJson("/api/engagement/insights"),
        fetchJson("/api/engagement/capabilities"),
      ]);
      fillSettingsForm(bundle.settings || {});
      renderCapabilityNote(capabilities.matrix || bundle.capabilities || {});
      state.recommendations = Array.isArray(bundle.recommendations) ? bundle.recommendations : [];
      state.history = Array.isArray(bundle.history) ? bundle.history : [];
      renderRecommendations();
      renderHistory();
      renderInsights(insights);
      if (subtitle) {
        subtitle.textContent = `${state.recommendations.length} open recommendation(s) · Stage ${bundle.settings?.stage_b_enabled ? "B" : "A"}`;
      }
      if (!force) setStatus("");
    } catch (error) {
      setStatus(error.message || String(error), true);
      if (subtitle) subtitle.textContent = "Could not load engagement data.";
    } finally {
      state.loading = false;
    }
  }

  function pageActive() {
    return $("page-engagement")?.classList.contains("active");
  }

  document.querySelectorAll('[data-page="engagement"]').forEach((button) => {
    button.addEventListener("click", () => setTimeout(() => loadEngagement(false), 0));
  });
  $("engagementRefresh")?.addEventListener("click", () => loadEngagement(true));
  $("engagementDiscover")?.addEventListener("click", () => discover().catch((error) => setStatus(error.message, true)));
  $("engagementSaveSettings")?.addEventListener("click", () => saveSettings().catch((error) => setStatus(error.message, true)));
  $("engagementStageB")?.addEventListener("change", () => {
    saveSettings().catch((error) => setStatus(error.message || String(error), true));
  });
  $("engagementPlatform")?.addEventListener("change", () => loadEngagement(true));
  $("studioProfileSelect")?.addEventListener("change", () => {
    if (pageActive()) loadEngagement(true);
  });

  $("engagementBulkSkip")?.addEventListener("click", async () => {
    const ids = [...state.selected];
    if (!ids.length) {
      setStatus("Select recommendations to skip.", true);
      return;
    }
    for (const targetId of ids) {
      await runAction("skip", targetId);
    }
    state.selected.clear();
  });

  document.addEventListener("click", (event) => {
    const select = event.target?.closest?.("[data-select-target]");
    if (select) {
      const id = select.getAttribute("data-select-target");
      if (select.checked) state.selected.add(id);
      else state.selected.delete(id);
      return;
    }
    const useComment = event.target?.closest?.("[data-use-comment]");
    if (useComment) {
      const targetId = useComment.getAttribute("data-use-comment");
      const index = Number(useComment.getAttribute("data-comment-index") || 0);
      const row = state.recommendations.find((item) => item.target_id === targetId);
      const text = row?.suggested_comments?.[index] || "";
      const area = document.querySelector(`textarea[data-comment-for="${targetId}"]`);
      if (area) area.value = text;
      return;
    }
    const button = event.target?.closest?.("[data-action][data-target-id]");
    if (!button || !pageActive()) return;
    const action = button.getAttribute("data-action");
    const targetId = button.getAttribute("data-target-id");
    runAction(action, targetId).catch((error) => setStatus(error.message || String(error), true));
  });

  window.StudioEngagement = {
    load: loadEngagement,
  };
})();
