(() => {
  const config = window.CHICAGOSHINING_STUDIO_CONFIG || {};
  const configuredBase = String(config.apiBase || "").replace(/\/$/, "");
  const apiBase = configuredBase || window.location.origin;
  const $ = (id) => document.getElementById(id);
  let activeIdea = null;
  let activeProductionRequest = null;
  let productionRequestMusic = [];
  let productionRequestOutputs = [];
  let productionOutputMatrixLoaded = false;
  let item4Workspace = null;
  let item4BridgePreflight = null;
  let item4PlanOverrides = {};
  let item4Uploading = false;
  let item4PreparingVariants = false;
  let item4VariantPollTimer = null;
  let item4VariantPollStartedAt = 0;
  let item4MasterPollTimer = null;
  let item4MasterPollStartedAt = 0;
  const ITEM4_VARIANT_POLL_MS = 3000;
  const ITEM4_VARIANT_POLL_TIMEOUT_MS = 900000;
  const ITEM4_MASTER_POLL_MS = 3000;
  const ITEM4_MASTER_POLL_TIMEOUT_MS = 180000;
  let pipelineOutputs = [];
  let activeCreativeOutputId = null;
  let activeCreativeOutput = null;
  let creativeSlides = [];
  let creativeOptions = {};
  let creativeHandoffPollToken = 0;
  let creativeHandoffStatus = null;
  let creativeEditorDirty = false;
  let creativeSavedFingerprint = "";
  let creativeDirtyTimer = null;
  const creativeSlideCollapsed = new Set();

  const BUILD_ID = "item4-0.6.18-master-authority-live-poll";

  const startupStatus = $("apiStatus");
  if (startupStatus) {
    startupStatus.textContent = "Connecting…";
    startupStatus.title = `${BUILD_ID}: JavaScript loaded`;
  }

  window.addEventListener("error", (event) => {
    const status = $("apiStatus");
    if (status) {
      status.textContent = "Studio UI error";
      status.title = `${BUILD_ID}: ${event.message || "JavaScript error"}`;
    }
  });

  window.addEventListener("unhandledrejection", (event) => {
    const status = $("apiStatus");
    if (status) {
      status.textContent = "Studio UI error";
      status.title = `${BUILD_ID}: ${event.reason?.message || event.reason || "Unhandled promise rejection"}`;
    }
  });

  document.querySelectorAll(".nav-item").forEach((button) => {
    button.addEventListener("click", () => {
      if (!phase6ConfirmDiscardUnsaved("leave this editor")) return;
      document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
      document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
      button.classList.add("active");
      $(`page-${button.dataset.page}`).classList.add("active");
      loadPage(button.dataset.page);
    });
  });

  document.querySelectorAll("[data-refresh]").forEach((button) => {
    button.addEventListener("click", () => loadPage(button.dataset.refresh, true));
  });

  $("refreshDashboard").addEventListener("click", () => loadDashboard(true));

  async function api(path, options = {}) {
    const { timeoutMs = 25000, signal: explicitSignal, ...fetchOptions } = options;
    const timeoutSignal =
      !explicitSignal && typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
        ? AbortSignal.timeout(timeoutMs)
        : explicitSignal;

    const response = await fetch(`${apiBase}${path}`, {
      credentials: "same-origin",
      cache: "no-store",
      ...fetchOptions,
      ...(timeoutSignal ? { signal: timeoutSignal } : {}),
      headers: {
        ...(fetchOptions.body && !(typeof FormData !== "undefined" && fetchOptions.body instanceof FormData) ? { "Content-Type": "application/json" } : {}),
        ...(fetchOptions.headers || {}),
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || body.ok === false) throw new Error(body.error || `Request failed (${response.status})`);
    return body;
  }

  function isTimeoutError(error) {
    const name = String(error?.name || "").toLowerCase();
    const message = String(error?.message || error || "").toLowerCase();
    return name.includes("timeout") || name.includes("abort") || message.includes("signal timed out") || message.includes("timed out");
  }

  function stateClass(value) {
    return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  }

  function badge(value) {
    const safe = escapeHtml(value || "Unknown");
    return `<span class="badge ${stateClass(value)}">${safe}</span>`;
  }

  function normalizeDisplayText(value) {
    let s = String(value ?? "");
    if (!s) return s;

    // API/session/Airtable values can arrive already mojibaked even when this JS bundle is UTF-8 clean.
    // Normalize only at the display boundary so IDs, URLs, webhook payloads, and write-back data remain untouched.
    const pairs = [
      ["â€¦", "…"], ["â€”", "—"], ["â€“", "–"], ["Â·", "·"],
      ["â†’", "→"], ["â†—", "↗"], ["â€¢", "•"], ["âœ“", "✓"],
      ["â‹®â‹®", "⋮⋮"], ["Ã—", "×"], ["â–¶", "▶"],
      ["â€˜", "‘"], ["â€™", "’"], ["â€œ", "“"], ["â€", "”"]
    ];
    for (const [bad, good] of pairs) s = s.split(bad).join(good);

    // Common three-byte UTF-8 sequences that were decoded as Windows-1252.
    // This branch is deliberately display-only.
    if (/[ÃÂâ]/.test(s)) {
      try {
        const cp1252 = {
          0x20AC:0x80,0x201A:0x82,0x0192:0x83,0x201E:0x84,0x2026:0x85,0x2020:0x86,0x2021:0x87,
          0x02C6:0x88,0x2030:0x89,0x0160:0x8A,0x2039:0x8B,0x0152:0x8C,0x017D:0x8E,
          0x2018:0x91,0x2019:0x92,0x201C:0x93,0x201D:0x94,0x2022:0x95,0x2013:0x96,0x2014:0x97,
          0x02DC:0x98,0x2122:0x99,0x0161:0x9A,0x203A:0x9B,0x0153:0x9C,0x017E:0x9E,0x0178:0x9F
        };
        const bytes = [];
        for (const ch of s) {
          const code = ch.codePointAt(0);
          if (code <= 0xFF) bytes.push(code);
          else if (cp1252[code] !== undefined) bytes.push(cp1252[code]);
          else { bytes.length = 0; break; }
        }
        if (bytes.length) {
          const decoded = new TextDecoder("utf-8", {fatal:true}).decode(new Uint8Array(bytes));
          if (decoded && !/[ÃÂâ]/.test(decoded)) s = decoded;
        }
      } catch (_) {}
    }
    return s;
  }

  function escapeHtml(value) {
    return normalizeDisplayText(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
  }

  function value(v, fallback = "—") { return v === null || v === undefined || v === "" ? fallback : escapeHtml(v); }
  function join(v) { return Array.isArray(v) && v.length ? v.map(escapeHtml).join(", ") : "—"; }

  function repairRenderedText(root = document.body) {
    if (!root) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      const fixed = normalizeDisplayText(node.nodeValue);
      if (fixed !== node.nodeValue) node.nodeValue = fixed;
    }
  }

  const displayTextObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === "characterData") {
        const fixed = normalizeDisplayText(mutation.target.nodeValue);
        if (fixed !== mutation.target.nodeValue) mutation.target.nodeValue = fixed;
      }
      for (const added of mutation.addedNodes || []) {
        if (added.nodeType === Node.TEXT_NODE) {
          const fixed = normalizeDisplayText(added.nodeValue);
          if (fixed !== added.nodeValue) added.nodeValue = fixed;
        } else if (added.nodeType === Node.ELEMENT_NODE) {
          repairRenderedText(added);
        }
      }
    }
  });

  function startDisplayTextRepair() {
    repairRenderedText(document.body);
    displayTextObserver.observe(document.body, {subtree:true, childList:true, characterData:true});
  }

  async function checkHealth() {
    try {
      const [health, session] = await Promise.all([api("/api/health"), api("/api/session")]);
      if (!health.airtable_configured) {
        $("apiStatus").textContent = "API needs Airtable configuration";
      } else if (session.authorized && session.user?.display_name) {
        $("apiStatus").textContent = normalizeDisplayText(`${session.user.display_name} · ${session.role || "Member"} · ${session.brand?.name || "Studio"}`);
        $("apiStatus").title = "Authenticated by Cloudflare Access and authorized by Studio membership";
      } else if (session.authenticated && session.email) {
        $("apiStatus").textContent = `Signed in · ${session.email}`;
        $("apiStatus").title = "Authenticated by Cloudflare Access; same-origin Studio API connected";
      } else {
        $("apiStatus").textContent = "API connected";
      }
    } catch (e) {
      $("apiStatus").textContent = "API unavailable";
    }
  }

  async function loadDashboard(force = false) {
    const metrics = $("metrics");
    const list = $("recentOutputs");
    metrics.innerHTML = '<div class="metric"><div class="metric-label">Loading</div><div class="metric-value">…</div></div>';
    list.innerHTML = '<div class="empty">Loading pipeline data…</div>';
    try {
      const data = await api("/api/dashboard");
      const m = data.metrics || {};
      const cards = [
        ["Ideas", m.ideas], ["Content items", m.content_items], ["Platform outputs", m.platform_outputs],
        ["Active outputs", m.active_outputs], ["Needs attention", m.attention_outputs], ["Published", m.published_outputs]
      ];
      metrics.innerHTML = cards.map(([label, number]) => `<div class="metric"><div class="metric-label">${label}</div><div class="metric-value">${number ?? 0}</div></div>`).join("");
      renderOutputsTable(list, data.recent_outputs || []);
    } catch (e) {
      metrics.innerHTML = "";
      list.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  }

  function setIdeaFormOpen(open) {
    const panel = $("ideaCreatePanel");
    panel.hidden = !open;
    $("ideaFormMessage").textContent = "";
    $("ideaFormMessage").className = "form-message";
    if (open) setTimeout(() => $("ideaTitle").focus(), 0);
  }

  $("newIdeaButton").addEventListener("click", () => setIdeaFormOpen(true));
  $("cancelIdeaButton").addEventListener("click", () => {
    $("ideaCreateForm").reset();
    setIdeaFormOpen(false);
  });

  $("ideaCreateForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = $("createIdeaButton");
    const message = $("ideaFormMessage");
    const title = $("ideaTitle").value.trim();
    const summary = $("ideaSummary").value.trim();
    if (!title) return;

    button.disabled = true;
    button.textContent = "Creating…";
    message.className = "form-message";
    message.textContent = "";

    try {
      const result = await api("/api/ideas", {
        method: "POST",
        body: JSON.stringify({ title, summary }),
      });
      message.className = "form-message success";
      message.textContent = `Created idea ${result.record?.candidate_id ? `#${result.record.candidate_id}` : "successfully"}.`;
      $("ideaCreateForm").reset();
      await Promise.all([loadIdeas(), loadDashboard()]);
      setTimeout(() => setIdeaFormOpen(false), 900);
    } catch (e) {
      message.className = "form-message error-text";
      message.textContent = e.message;
    } finally {
      button.disabled = false;
      button.textContent = "Create idea";
    }
  });


  function ideaStatusLabel(idea) {
    return idea?.is_on_hold ? "On Hold" : (idea?.status || "Unknown");
  }

  function ideaIsPromoted(idea) {
    return Boolean(
      idea?.promoted_content_record_id ||
      (Array.isArray(idea?.content_item_links) && idea.content_item_links.length)
    );
  }

  function ideaCanModify(idea) {
    return !ideaIsPromoted(idea) && idea?.status !== "Approved";
  }

  function ideaCanPromote(idea) {
    return !ideaIsPromoted(idea) && !idea?.is_on_hold;
  }

  function setSelectValue(id, value, fallback) {
    const el = $(id);
    const desired = String(value || fallback || "");
    const exists = Array.from(el.options).some((option) => option.value === desired);
    el.value = exists ? desired : (fallback || "");
  }

  function syncPromotionPanels() {
    const contentType = $("promoteContentType").value;
    $("videoPromotionOptions").hidden = !["Vertical Short Video", "Longform Video"].includes(contentType);
    $("carouselPromotionOptions").hidden = contentType !== "Carousel";
  }

  function selectedPromotionPlatforms() {
    return Array.from(document.querySelectorAll('input[name="promotePlatform"]:checked')).map((input) => input.value);
  }

  function setManageMessage(text = "", type = "") {
    const target = $("ideaManageMessage");
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function updateIdeaDrawer(idea) {
    activeIdea = idea;
    $("ideaDrawerHeading").textContent = idea?.title || "Manage idea";
    $("ideaDetailStatus").innerHTML = badge(ideaStatusLabel(idea));
    $("ideaDetailCandidate").textContent = idea?.candidate_id ? `#${idea.candidate_id}` : idea?.id || "—";
    $("editIdeaTitle").value = idea?.title || "";
    $("editIdeaSummary").value = idea?.summary || "";

    setSelectValue("promoteContentType", idea?.content_type, "");
    document.querySelectorAll('input[name="promotePlatform"]').forEach((input) => {
      input.checked = Array.isArray(idea?.platforms) && idea.platforms.includes(input.value);
    });
    setSelectValue("promoteVoiceover", idea?.include_voiceover, "Use Profile Default");
    setSelectValue("promoteMusic", idea?.include_background_music, "Use Profile Default");
    setSelectValue("promoteThumbnail", idea?.include_thumbnail, "Use Profile Default");
    setSelectValue("promoteVideoDuration", idea?.video_duration ? String(idea.video_duration) : "30", "30");
    setSelectValue("promoteVideoClipCount", idea?.video_clip_count ? String(idea.video_clip_count) : "Auto", "Auto");
    setSelectValue("promoteVoiceoverTail", idea?.voiceover_tail_seconds !== null && idea?.voiceover_tail_seconds !== undefined ? String(idea.voiceover_tail_seconds) : "2", "2");
    $("promoteCarouselSlideCount").value = idea?.carousel_slide_count || 5;
    setSelectValue("promoteCarouselImageMode", idea?.carousel_image_mode, "Make AI Generated");
    $("promoteProductionNotes").value = "";
    syncPromotionPanels();

    const snapshot = [
      ["Type", idea?.content_type],
      ["Platforms", Array.isArray(idea?.platforms) && idea.platforms.length ? idea.platforms.join(", ") : null],
      ["Slides", idea?.carousel_slide_count],
      ["Clips", idea?.video_clip_count],
      ["Voiceover", idea?.include_voiceover],
      ["Music", idea?.include_background_music],
      ["Thumbnail", idea?.include_thumbnail],
      ["Duration", idea?.video_duration ? `${idea.video_duration}s` : null],
    ];
    $("ideaProductionSnapshot").innerHTML = snapshot.map(([label, val]) =>
      `<div><span>${escapeHtml(label)}</span><strong>${value(val)}</strong></div>`
    ).join("");

    const promoted = ideaIsPromoted(idea);
    const modifiable = ideaCanModify(idea);
    $("saveIdeaButton").disabled = !modifiable;
    $("saveIdeaButton").textContent = promoted ? "Locked after promotion" : "Save changes";
    $("editIdeaTitle").disabled = !modifiable;
    $("editIdeaSummary").disabled = !modifiable;
    $("deleteIdeaButton").disabled = !modifiable;
    const configureButton = $("configureProductionButton");
    if (configureButton) {
      configureButton.disabled = promoted || Boolean(idea?.is_on_hold);
      configureButton.textContent = promoted ? "Production locked" : "Configure Production";
    }
    $("holdIdeaButton").hidden = Boolean(idea?.is_on_hold);
    $("restoreIdeaButton").hidden = !idea?.is_on_hold;
    $("holdIdeaButton").disabled = !modifiable;
    $("restoreIdeaButton").disabled = ideaIsPromoted(idea);

    const promotable = ideaCanPromote(idea);
    $("promoteIdeaButton").disabled = !promotable;
    $("ideaPromotionZone").classList.toggle("promotion-disabled", !promotable);
    $("ideaPromotionZone").querySelectorAll("select,input,textarea").forEach((control) => { control.disabled = !promotable; });

    if (ideaIsPromoted(idea)) {
      $("promoteIdeaButton").textContent = "Already promoted";
      setManageMessage("Promotion is complete. This Idea Candidate is intentionally locked; there is no background save or promotion task running.", "success");
    } else if (idea?.is_on_hold) {
      setManageMessage("Restore this idea before approving and promoting it.", "");
    } else if (idea?.status === "Approved") {
      setManageMessage("This idea is Approved but not yet linked to a Content Item. Approve & Promote can safely retry the existing I3 → I4 handoff.", "");
    } else {
      $("promoteIdeaButton").textContent = "Approve & Promote";
      setManageMessage();
    }
  }

  function openIdeaDrawer(idea) {
    updateIdeaDrawer(idea);
    $("ideaDrawerBackdrop").hidden = false;
    $("ideaManageDrawer").classList.add("open");
    $("ideaManageDrawer").setAttribute("aria-hidden", "false");
    document.body.classList.add("drawer-open");
    setTimeout(() => $("editIdeaTitle").focus(), 80);
  }

  function closeIdeaDrawer() {
    $("ideaManageDrawer").classList.remove("open");
    $("ideaManageDrawer").setAttribute("aria-hidden", "true");
    $("ideaDrawerBackdrop").hidden = true;
    document.body.classList.remove("drawer-open");
    activeIdea = null;
    setManageMessage();
  }

  $("closeIdeaDrawer").addEventListener("click", closeIdeaDrawer);
  $("ideaDrawerBackdrop").addEventListener("click", closeIdeaDrawer);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && $("ideaManageDrawer").classList.contains("open")) closeIdeaDrawer();
  });

  async function refreshManagedIdea(recordId) {
    const { record } = await api(`/api/ideas/${encodeURIComponent(recordId)}`);
    updateIdeaDrawer(record);
    await Promise.all([loadIdeas(), loadDashboard()]);
    return record;
  }

  $("ideaEditForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeIdea?.id) return;

    const button = $("saveIdeaButton");
    button.disabled = true;
    button.textContent = "Saving…";
    setManageMessage();

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`, {
        method: "PATCH",
        body: JSON.stringify({
          title: $("editIdeaTitle").value.trim(),
          summary: $("editIdeaSummary").value.trim(),
        }),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard()]);
      setManageMessage("Changes saved.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.disabled = !ideaCanModify(activeIdea);
      button.textContent = "Save changes";
    }
  });

  $("holdIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const button = $("holdIdeaButton");
    button.disabled = true;
    button.textContent = "Holding…";
    setManageMessage();

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/hold`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard()]);
      setManageMessage("Idea is on hold. It cannot satisfy the existing Approved promotion gate.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Hold idea";
      if (activeIdea && !activeIdea.is_on_hold && ideaCanModify(activeIdea)) {
        button.disabled = false;
      }
    }
  });

  $("restoreIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const button = $("restoreIdeaButton");
    button.disabled = true;
    button.textContent = "Restoring…";
    setManageMessage();

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/restore`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      updateIdeaDrawer(result.record);
      await Promise.all([loadIdeas(), loadDashboard()]);
      setManageMessage("Idea restored to its pre-hold status.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Restore idea";
      if (activeIdea && activeIdea.is_on_hold && !ideaIsPromoted(activeIdea)) {
        button.disabled = false;
      }
    }
  });


  $("promoteContentType").addEventListener("change", syncPromotionPanels);

  $("promoteIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id || !ideaCanPromote(activeIdea)) return;

    const contentType = $("promoteContentType").value;
    const platforms = selectedPromotionPlatforms();
    if (!contentType) {
      setManageMessage("Choose a master content type before promotion.", "error-text");
      return;
    }
    if (!platforms.length) {
      setManageMessage("Choose at least one target platform before promotion.", "error-text");
      return;
    }
    if (!$('editIdeaSummary').value.trim()) {
      setManageMessage("Add a summary and save it before promotion. The existing I4 promotion gate requires Idea_Summary.", "error-text");
      return;
    }

    const label = activeIdea.title || `Candidate ${activeIdea.candidate_id || activeIdea.id}`;
    const confirmed = window.confirm(
      `Approve and promote "${label}"?\n\nStudio will submit the selected production configuration to the existing I3 approval workflow. I3 will then trigger the existing I4 promotion workflow to create the Content Item.`
    );
    if (!confirmed) return;

    const button = $("promoteIdeaButton");
    button.disabled = true;
    button.textContent = "Promoting…";
    setManageMessage("Sending approval through I3 → I4…", "");

    const payload = {
      content_type: contentType,
      platforms,
      include_voiceover: $("promoteVoiceover").value,
      include_background_music: $("promoteMusic").value,
      include_thumbnail: $("promoteThumbnail").value,
      video_duration: Number($("promoteVideoDuration").value || 30),
      video_clip_count: $("promoteVideoClipCount").value,
      voiceover_tail_seconds: Number($("promoteVoiceoverTail").value || 2),
      carousel_slide_count: Number($("promoteCarouselSlideCount").value || 5),
      carousel_image_mode: $("promoteCarouselImageMode").value,
      production_notes: $("promoteProductionNotes").value.trim(),
    };

    try {
      const result = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}/promote`, {
        method: "POST",
        body: JSON.stringify(payload),
      });

      let record = result.record;
      if (!ideaIsPromoted(record)) {
        setManageMessage("I3 accepted the approval. Waiting for I4 to finish promotion…", "");
        for (let attempt = 0; attempt < 8 && !ideaIsPromoted(record); attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 1250));
          const refreshed = await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`);
          record = refreshed.record;
        }
      }

      updateIdeaDrawer(record);
      await Promise.all([loadIdeas(), loadDashboard(), loadContent()]);

      if (ideaIsPromoted(record)) {
        const contentRecordId = record.promoted_content_record_id || (record.content_item_links || [])[0] || "created Content Item";
        setManageMessage(`Approved through I3 and promoted through I4. Content Item: ${contentRecordId}.`, "success");
      } else {
        setManageMessage("I3 accepted the approval and the candidate is Approved. I4 is still processing; use Refresh if the Content Item does not appear shortly.", "success");
      }
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      button.textContent = "Approve & Promote";
      if (activeIdea && ideaCanPromote(activeIdea)) button.disabled = false;
    }
  });

  $("deleteIdeaButton").addEventListener("click", async () => {
    if (!activeIdea?.id) return;
    const label = activeIdea.title || `Candidate ${activeIdea.candidate_id || activeIdea.id}`;
    const confirmed = window.confirm(
      `Permanently delete "${label}"?\n\nThis removes the unpromoted Idea Candidate record from Airtable and cannot be undone.`
    );
    if (!confirmed) return;

    const button = $("deleteIdeaButton");
    button.disabled = true;
    button.textContent = "Deleting…";
    setManageMessage();

    try {
      await api(`/api/ideas/${encodeURIComponent(activeIdea.id)}`, {
        method: "DELETE",
        body: JSON.stringify({}),
      });
      closeIdeaDrawer();
      await Promise.all([loadIdeas(), loadDashboard()]);
    } catch (e) {
      setManageMessage(e.message, "error-text");
      button.disabled = false;
      button.textContent = "Delete";
    }
  });

  function switchToPage(page) {
    document.querySelectorAll(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.page === page));
    document.querySelectorAll(".page").forEach((p) => p.classList.remove("active"));
    $(`page-${page}`).classList.add("active");
    loadPage(page);
  }

  function item4SelectedPlatforms() {
    return Array.from(document.querySelectorAll("[data-item4-platform]:checked")).map(el => el.value);
  }

  function item4StateLabel(value, fallback) {
    const v = String(value || fallback || "").trim();
    return v || fallback || "—";
  }

  function item4AssetExtension(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function item4IsHeicAsset(asset) {
    const mime = String(asset?.mime_type || "").toLowerCase();
    const ext = item4AssetExtension(asset?.name);
    return mime.includes("heic") || mime.includes("heif") || ext === "heic" || ext === "heif";
  }

  function item4DriveThumbnailUrl(fileId) {
    const id = String(fileId || "").trim();
    return id ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(id)}&sz=w640` : "";
  }

  function item4AssetPreviewUrl(asset) {
    try {
      const recordId = String(asset?.media_asset_record_id || "").trim();
      if (/^rec[A-Za-z0-9]+$/.test(recordId)) {
        return `${apiBase}/api/media-assets/${encodeURIComponent(recordId)}/preview`;
      }
      return String(asset?.preview_url || "").trim()
        || item4DriveThumbnailUrl(asset?.google_drive_file_id)
        || (!item4IsHeicAsset(asset) ? String(asset?.url || "").trim() : "");
    } catch {
      return "";
    }
  }

  function item4AssetPlaceholder(asset, label = "Preview unavailable") {
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const format = ext || (item4IsHeicAsset(asset) ? "HEIC" : "IMAGE");
    return `<div class="item4-heic-placeholder item4-image-placeholder"><strong>${escapeHtml(format)}</strong><span>${escapeHtml(label)}</span></div>`;
  }

  function item4AssetThumb(asset) {
    const dims = asset.width && asset.height ? `${asset.width}×${asset.height}` : "Original";
    const isHeic = item4IsHeicAsset(asset);
    const previewUrl = item4AssetPreviewUrl(asset);
    const visual = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(asset.name || "Master photo")}" loading="lazy" data-item4-preview-image>`
      : item4AssetPlaceholder(asset, isHeic ? "Original preserved" : "Preview unavailable");
    const ext = item4AssetExtension(asset?.name).toUpperCase();
    const formatNote = ext ? ` · ${ext} original` : (isHeic ? " · HEIC original" : "");
    return `<article class="item4-asset-card" data-item4-asset="${escapeHtml(asset.id)}">
      <div class="item4-thumb">${visual}</div>
      <div class="item4-asset-meta"><strong>${escapeHtml(asset.name || "Photo")}</strong><span>Photo ${escapeHtml(asset.order || "")} · ${escapeHtml(dims)}${formatNote}</span></div>
      <button type="button" class="item4-remove-asset" data-remove-item4-asset="${escapeHtml(asset.id)}" title="Remove this master photo">×</button>
    </article>`;
  }

  function renderItem4Assets(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const host = $("item4AssetStrip");
    const badge = $("item4AssetStatus");
    if (badge) {
      const authority = String(status?.assets_status || "None");
      badge.textContent = !assets.length
        ? "No media yet"
        : authority === "Ready"
          ? `${assets.length} photo${assets.length === 1 ? "" : "s"} ready`
          : authority === "Error"
            ? "Master media needs attention"
            : `${assets.length} photo${assets.length === 1 ? "" : "s"} processing`;
    }
    if (!host) return;
    host.innerHTML = assets.length ? assets.map(item4AssetThumb).join("") : '<div class="empty compact-empty">No master photos uploaded yet.</div>';
    host.querySelectorAll("[data-item4-preview-image]").forEach(img => {
      img.addEventListener("error", () => {
        const card = img.closest("[data-item4-asset]");
        const asset = assets.find(row => String(row?.id || "") === String(card?.dataset?.item4Asset || ""));
        const thumb = img.closest(".item4-thumb");
        if (thumb) thumb.innerHTML = item4AssetPlaceholder(asset || {}, item4IsHeicAsset(asset) ? "Original preserved" : "Preview unavailable");
      }, { once: true });
    });
    host.querySelectorAll("[data-remove-item4-asset]").forEach(button => button.addEventListener("click", () => removeItem4Asset(button.dataset.removeItem4Asset)));
  }

  function item4PlanCard(item) {
    const options = Array.isArray(item.available_output_types) ? item.available_output_types : [item.output_type];
    const ratio = item.aspect_ratio || "Needs review";
    const count = Number(item.source_asset_count || item4Workspace?.assets?.length || 0);
    const rationale = String(item.rationale || "").replace(/five photos/ig, `${count} photo${count === 1 ? "" : "s"}`);
    return `<article class="item4-plan-card" data-item4-plan-platform="${escapeHtml(item.platform)}">
      <div class="item4-plan-card-top"><strong>${escapeHtml(item.platform)}</strong><span class="item4-ratio-chip">${escapeHtml(ratio)}</span></div>
      <label class="form-field"><span>Format</span><select data-item4-format="${escapeHtml(item.platform)}">${options.map(x => `<option${x === item.output_type ? " selected" : ""}>${escapeHtml(x)}</option>`).join("")}</select></label>
      <div class="item4-plan-why">${escapeHtml(rationale)}</div>
      <div class="item4-plan-source">${item.aspect_ratio ? `Ratio authority: ${escapeHtml(item.ratio_source || "Platform Output Mappings")}` : "Ratio mapping needs review before production."}</div>
    </article>`;
  }

  function renderItem4Plan(status) {
    const plan = status?.plan || null;
    const host = $("item4OutputPlan");
    const badge = $("item4PlanStatus");
    const gate = $("item4ProductionGate");
    if (badge) badge.textContent = item4StateLabel(status?.plan_status, "Needs plan");
    if (!host) return;
    if (!plan?.items?.length) {
      host.innerHTML = '<div class="empty compact-empty">Your platform recommendations will appear here.</div>';
      if (gate) gate.hidden = true;
      return;
    }
    host.innerHTML = plan.items.map(item4PlanCard).join("");
    item4PlanOverrides = Object.fromEntries(plan.items.map(item => [item.platform, item.output_type]));
    host.querySelectorAll("[data-item4-format]").forEach(select => {
      select.addEventListener("change", () => {
        item4PlanOverrides[select.dataset.item4Format] = select.value;
        const button = $("item4BuildPlan");
        if (button) button.textContent = "Update platform plan";
      });
    });
    if (gate) gate.hidden = status?.plan_status !== "Ready";
  }

  function item4MediaAssetPreviewUrl(recordId) {
    const id = String(recordId || "").trim();
    return /^rec[A-Za-z0-9]+$/.test(id)
      ? `${apiBase}/api/media-assets/${encodeURIComponent(id)}/preview`
      : "";
  }

  function item4VariantPreviewUrl(variant) {
    if (!variant) return "";
    return item4MediaAssetPreviewUrl(variant.media_asset_record_id) || variant.preview_url || variant.url || "";
  }

  function item4VariantAssets(manifest) {
    if (Array.isArray(manifest?.assets)) return manifest.assets;
    if (Array.isArray(manifest?.asset_manifest)) return manifest.asset_manifest;
    if (Array.isArray(manifest?.items)) return manifest.items;
    return [];
  }

  function item4RequiredRatios(manifest) {
    if (Array.isArray(manifest?.required_ratios) && manifest.required_ratios.length) return manifest.required_ratios;
    const ratios = new Set();
    item4VariantAssets(manifest).forEach(asset => {
      Object.keys(asset?.variants || {}).forEach(ratio => ratios.add(ratio));
    });
    return [...ratios];
  }

  function item4VariantRows(manifest, ratio) {
    return item4VariantAssets(manifest)
      .map(asset => ({ asset, variant: asset?.variants?.[ratio] }))
      .filter(row => Boolean(row.variant));
  }

  function item4VariantThumb(row, ratio) {
    const variant = row.variant;
    const previewUrl = item4VariantPreviewUrl(variant);
    const safe = ratio === "9:16" ? '<span class="item4-safe-overlay" title="Centered 4:5 critical-content safe zone"></span>' : "";
    const visual = previewUrl
      ? `<img src="${escapeHtml(previewUrl)}" alt="${escapeHtml(row.asset?.name || "Platform-ready photo")}" loading="lazy">`
      : `<div class="item4-heic-placeholder"><strong>${escapeHtml(ratio)}</strong><span>Variant ready</span></div>`;
    return `<article class="item4-variant-thumb">
      <div class="item4-variant-image-wrap">${visual}${safe}</div>
      <div class="item4-variant-meta"><strong>Photo ${escapeHtml(row.asset?.order || "")}</strong><span>${escapeHtml(row.asset?.name || "")}</span></div>
    </article>`;
  }

  function renderItem4Variants(status) {
    const badge = $("item4VariantStatus");
    const hint = $("item4VariantHint");
    const error = $("item4VariantError");
    const host = $("item4VariantGallery");
    const button = $("item4PrepareVariants");
    const variantStatus = status?.variant_status || "None";
    const manifest = status?.variants || null;
    const readyCount = Number(manifest?.ready_count || 0);
    const targetCount = Number(manifest?.target_count || manifest?.source_asset_count || 0);
    if (badge) badge.textContent = variantStatus === "Ready"
      ? `${readyCount} variants ready`
      : variantStatus === "Preparing"
        ? `Preparing… ${readyCount}/${targetCount || "?"} ready`
        : variantStatus === "Error" ? "Needs attention" : "Not prepared";
    if (error) {
      error.hidden = !status?.variant_error;
      error.textContent = status?.variant_error || "";
    }
    if (button) {
      button.disabled = status?.plan_status !== "Ready" || item4PreparingVariants || variantStatus === "Preparing";
      button.textContent = variantStatus === "Ready"
        ? "Rebuild platform media"
        : (item4PreparingVariants || variantStatus === "Preparing")
          ? `Preparing… ${readyCount}/${targetCount || "?"}`
          : "Prepare platform media";
    }
    if (hint) {
      hint.textContent = status?.plan_status !== "Ready"
        ? "Build the platform plan first."
        : variantStatus === "Ready"
          ? "Platform media is ready. Review the crops below; the preserved originals remain unchanged."
          : variantStatus === "Preparing"
            ? `Studio is preparing platform media in the background. This page updates automatically (${readyCount}/${targetCount || "?"} ready).`
            : variantStatus === "Error"
              ? "Preparation stopped at the failed transformation. The originals are still safe."
              : "Create only the ratios required by the selected platform outputs.";
    }
    if (!host) return;
    const ratios = item4RequiredRatios(manifest);
    if (!ratios.length || !item4VariantAssets(manifest).length) {
      host.innerHTML = variantStatus === "Ready"
        ? '<div class="empty compact-empty">Platform variants are prepared. Preview details are being reconciled from the media manifest.</div>'
        : '<div class="empty compact-empty">Prepared 4:5, 9:16, 1:1, or 16:9 versions will appear here only when required by the selected outputs.</div>';
      return;
    }
    host.innerHTML = ratios.map(ratio => {
      const rows = item4VariantRows(manifest, ratio);
      const spec = rows[0]?.variant || {};
      const safeNote = ratio === "9:16" ? '<span class="item4-safe-note">Dashed box = centered 4:5 critical-content zone</span>' : "";
      return `<section class="item4-ratio-group"><div class="item4-ratio-heading"><div><strong>${escapeHtml(ratio)}</strong><span>${escapeHtml(spec.width || "")}×${escapeHtml(spec.height || "")} · ${rows.length}/${manifest.source_asset_count || rows.length} ready</span></div>${safeNote}</div><div class="item4-variant-strip">${rows.map(row => item4VariantThumb(row,ratio)).join("")}</div></section>`;
    }).join("");
  }

  function stopItem4MasterPolling() {
    if (item4MasterPollTimer) clearTimeout(item4MasterPollTimer);
    item4MasterPollTimer = null;
    item4MasterPollStartedAt = 0;
  }

  function item4MasterReadyCount(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    return assets.filter(asset =>
      String(asset?.google_drive_file_id || "").trim() &&
      String(asset?.media_asset_record_id || "").trim()
    ).length;
  }

  function updateItem4MasterProgress(status) {
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    const progress = $("item4UploadProgress");
    if (!progress || !assets.length) return;
    progress.hidden = false;
    const ready = item4MasterReadyCount(status);
    const target = assets.length;
    const state = String(status?.assets_status || "None");
    if (state === "Ready") {
      progress.textContent = `${target} photo${target === 1 ? "" : "s"} saved to Google Drive and ready.`;
    } else if (state === "Error") {
      progress.textContent = `Master media needs attention (${ready}/${target} ready).`;
    } else {
      progress.textContent = `Saving master photos to Google Drive… ${ready}/${target} ready. Previews update automatically.`;
    }
  }

  async function pollItem4MasterAssets() {
    if (!activeProductionRequest?.id) { stopItem4MasterPolling(); return; }
    if (!item4MasterPollStartedAt) item4MasterPollStartedAt = Date.now();
    try {
      await loadItem4Workspace(activeProductionRequest);
      const state = String(item4Workspace?.assets_status || "None");
      updateItem4MasterProgress(item4Workspace || {});
      if (state === "Ready") {
        stopItem4MasterPolling();
        setRequestMessage("Master photos are saved to Google Drive and previews are ready. No refresh was required.", "success");
        return;
      }
      if (state === "Error") {
        stopItem4MasterPolling();
        setRequestMessage("Master-media preparation needs attention. Your uploaded originals remain preserved.", "error-text");
        return;
      }
      if (Date.now() - item4MasterPollStartedAt >= ITEM4_MASTER_POLL_TIMEOUT_MS) {
        stopItem4MasterPolling();
        setRequestMessage("Master media is still processing in the background. Use Refresh status if it does not complete shortly; you do not need to upload the photos again.", "success");
        return;
      }
    } catch (error) {
      console.warn("Item 4 master-media status poll deferred", error);
    }
    item4MasterPollTimer = setTimeout(pollItem4MasterAssets, ITEM4_MASTER_POLL_MS);
  }

  function startItem4MasterPolling() {
    stopItem4MasterPolling();
    item4MasterPollStartedAt = Date.now();
    item4MasterPollTimer = setTimeout(pollItem4MasterAssets, 800);
  }

  function stopItem4VariantPolling() {
    if (item4VariantPollTimer) clearTimeout(item4VariantPollTimer);
    item4VariantPollTimer = null;
    item4VariantPollStartedAt = 0;
  }

  async function pollItem4Variants() {
    if (!activeProductionRequest?.id) { stopItem4VariantPolling(); return; }
    if (!item4VariantPollStartedAt) item4VariantPollStartedAt = Date.now();
    try {
      await loadItem4Workspace(activeProductionRequest);
      const state = item4Workspace?.variant_status || "None";
      if (state === "Ready") {
        stopItem4VariantPolling();
        setRequestMessage("Platform-ready media is complete. Review the prepared crops below.", "success");
        return;
      }
      if (state === "Error") {
        stopItem4VariantPolling();
        setRequestMessage(item4Workspace?.variant_error || "Platform-media preparation needs attention.", "error-text");
        return;
      }
      if (Date.now() - item4VariantPollStartedAt >= ITEM4_VARIANT_POLL_TIMEOUT_MS) {
        // Do not silently stop while the backend still reports Preparing. Reset
        // the observation window and continue polling so queued work can self-heal
        // and the UI remains live without a manual refresh.
        item4VariantPollStartedAt = Date.now();
        setRequestMessage("Platform media is still preparing. Studio will keep checking automatically; no refresh or second click is needed.", "success");
      }
    } catch (error) {
      // Transient polling errors should not convert a valid background job into a user-facing failure.
      console.warn("Item 4 variant status poll deferred", error);
    }
    item4VariantPollTimer = setTimeout(pollItem4Variants, ITEM4_VARIANT_POLL_MS);
  }

  function startItem4VariantPolling() {
    stopItem4VariantPolling();
    item4VariantPollStartedAt = Date.now();
    item4VariantPollTimer = setTimeout(pollItem4Variants, 800);
  }

  async function prepareItem4Variants() {
    if (!activeProductionRequest?.id || item4PreparingVariants) return;
    item4PreparingVariants = true;
    renderItem4Variants(item4Workspace || {});
    setRequestMessage("Starting platform-media preparation…", "success");
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/variants`, {method:"POST",body:JSON.stringify({}),timeoutMs:180000});
      if (result.production_request) activeProductionRequest = result.production_request;
      await loadItem4Workspace(activeProductionRequest);
      if (item4Workspace?.variant_status === "Ready") {
        setRequestMessage(result.message || "Platform-ready media prepared. Review the crops below.", "success");
      } else {
        setRequestMessage("Platform media is preparing in the background. Progress updates automatically; no refresh or second click is needed.", "success");
        startItem4VariantPolling();
      }
    } catch (error) {
      await loadItem4Workspace(activeProductionRequest).catch(()=>{});
      if (item4Workspace?.variant_status === "Preparing") {
        setRequestMessage("Platform media is preparing in the background. Progress updates automatically; no refresh or second click is needed.", "success");
        startItem4VariantPolling();
      } else {
        setRequestMessage(error.message, "error-text");
      }
    } finally {
      item4PreparingVariants = false;
      renderItem4Variants(item4Workspace || {});
    }
  }

  function renderItem4Workspace(status) {
    item4Workspace = status || null;
    renderItem4Assets(status);
    renderItem4Plan(status);
    renderItem4Variants(status);
    const hint = $("item4PlanHint");
    const button = $("item4BuildPlan");
    const assets = Array.isArray(status?.assets) ? status.assets : [];
    if (button) button.disabled = !assets.length || item4Uploading;
    if (hint) hint.textContent = !assets.length ? "Upload photos first, then build the plan." : status?.plan_status === "Ready" ? "Recommendations are saved. Change a format and choose Update platform plan if needed." : "Ready to recommend the best output for each selected platform.";
    document.querySelectorAll("[data-item4-platform]").forEach(input => {
      const planPlatforms = status?.plan?.items?.map(x => x.platform) || [];
      if (planPlatforms.length) input.checked = planPlatforms.includes(input.value);
    });
    setProductionRequestControlState(activeProductionRequest);
    updateItem4MasterProgress(status || {});
    if (status?.assets?.length && status?.assets_status === "Uploading" && !item4MasterPollTimer) startItem4MasterPolling();
    if (status?.assets_status === "Ready" || status?.assets_status === "Error") stopItem4MasterPolling();
    if (status?.variant_status === "Preparing" && !item4VariantPollTimer) startItem4VariantPolling();
    if (status?.variant_status === "Ready" || status?.variant_status === "Error") stopItem4VariantPolling();
  }

  async function loadItem4BridgePreflight(record = activeProductionRequest) {
    if (!record?.id) return null;
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/bridge-preflight`);
      item4BridgePreflight = result;
      setProductionRequestControlState(activeProductionRequest || record);
      return result;
    } catch (error) {
      item4BridgePreflight = {
        ready: false,
        issues: [error.message || "Source bridge validation failed."],
        warnings: [],
      };
      setProductionRequestControlState(activeProductionRequest || record);
      return item4BridgePreflight;
    }
  }

  async function loadItem4Workspace(record = activeProductionRequest) {
    if (!record?.id) return;
    try {
      const status = await api(`/api/production-requests/${encodeURIComponent(record.id)}/item4`);
      item4BridgePreflight = null;
      renderItem4Workspace(status);
      if (status?.assets?.length && status?.plan_status === "Ready" && status?.variant_status === "Ready") {
        Promise.resolve().then(() => loadItem4BridgePreflight(record));
      }
      // Preview enrichment must never be allowed to invalidate the loaded production request.
      Promise.resolve().then(async () => {
        if (status?.variant_status !== "Ready") return;
        try {
          const variantStatus = await api(`/api/production-requests/${encodeURIComponent(record.id)}/variants`);
          if (!variantStatus?.manifest) return;
          const enriched = {
            ...status,
            variant_status: variantStatus.status || status.variant_status,
            variant_updated_at: variantStatus.updated_at || status.variant_updated_at,
            variant_error: variantStatus.error || null,
            variants: variantStatus.manifest
          };
          item4Workspace = enriched;
          try { renderItem4Variants(enriched); } catch (error) {
            console.warn("Item 4 variant preview rendering failed without affecting workspace state", error);
          }
        } catch (error) {
          console.warn("Item 4 variant preview enrichment failed without affecting workspace state", error);
        }
      });
    } catch (error) {
      setRequestMessage(`Item 4 media workspace: ${error.message}`, "error-text");
    }
  }

  function item4UploadFileExtension(name) {
    const match = String(name || "").toLowerCase().match(/\.([a-z0-9]+)$/);
    return match ? match[1] : "";
  }

  function item4IsSupportedPhotoFile(file) {
    const mime = String(file?.type || "").toLowerCase();
    const ext = item4UploadFileExtension(file?.name);
    return mime.startsWith("image/") || ext === "heic" || ext === "heif";
  }

  async function imageMetadataForFiles(files) {
    const result = [];
    for (const file of files) {
      let width = null, height = null;
      try {
        const bitmap = await createImageBitmap(file);
        width = bitmap.width; height = bitmap.height; bitmap.close();
      } catch {}
      result.push({ name: file.name, width, height });
    }
    return result;
  }

  async function uploadItem4Files(fileList) {
    if (!activeProductionRequest?.id || item4Uploading) return;
    const files = Array.from(fileList || []).filter(item4IsSupportedPhotoFile);
    if (!files.length) { setRequestMessage("Choose one or more photo files. HEIC and HEIF are supported.", "error-text"); return; }
    item4Uploading = true;
    const progress = $("item4UploadProgress");
    const button = $("item4BuildPlan");
    if (progress) { progress.hidden = false; progress.textContent = `Uploading ${files.length} master photo${files.length === 1 ? "" : "s"}…`; }
    if (button) button.disabled = true;
    setRequestMessage();
    try {
      const metadata = await imageMetadataForFiles(files);
      const form = new FormData();
      files.forEach(file => form.append("files", file, file.name));
      form.append("metadata", JSON.stringify(metadata));
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets`, { method: "POST", body: form, timeoutMs: 90000 });
      if (result.record) activeProductionRequest = result.record;
      if (progress) progress.textContent = `${result.uploaded || files.length} photo${(result.uploaded || files.length) === 1 ? "" : "s"} uploaded. Originals preserved.`;
      await loadItem4Workspace(activeProductionRequest);
      if (item4Workspace?.assets_status === "Ready") {
        updateItem4MasterProgress(item4Workspace);
        setRequestMessage("Master photos uploaded and saved to Google Drive. Previews are ready.", "success");
      } else {
        updateItem4MasterProgress(item4Workspace || {});
        setRequestMessage("Master photos uploaded. Studio is saving them to Google Drive and preparing previews; this page updates automatically.", "success");
        startItem4MasterPolling();
      }
    } catch (error) {
      if (progress) progress.textContent = `Upload failed: ${error.message}`;
      setRequestMessage(error.message, "error-text");
    } finally {
      item4Uploading = false;
      if (button) button.disabled = !(item4Workspace?.assets?.length);
    }
  }

  async function removeItem4Asset(assetId) {
    if (!activeProductionRequest?.id || !assetId) return;
    if (!window.confirm("Remove this photo from the master source set? The other originals will be preserved.")) return;
    try {
      await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/assets/${encodeURIComponent(assetId)}`, {method:"DELETE", body:JSON.stringify({})});
      await loadItem4Workspace(activeProductionRequest);
      setRequestMessage("Master photo removed. Rebuild the platform plan before production.", "success");
    } catch (error) { setRequestMessage(error.message, "error-text"); }
  }

  async function buildItem4Plan() {
    if (!activeProductionRequest?.id) return;
    const platforms = item4SelectedPlatforms();
    if (!platforms.length) { setRequestMessage("Choose at least one platform.", "error-text"); return; }
    const button = $("item4BuildPlan");
    if (button) { button.disabled = true; button.textContent = "Building plan…"; }
    setRequestMessage();
    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/plan`, {method:"POST", body:JSON.stringify({platforms,overrides:item4PlanOverrides}), timeoutMs:30000});
      if (result.production_request) activeProductionRequest = result.production_request;
      productionRequestOutputs = Array.isArray(result.outputs) ? result.outputs : productionRequestOutputs;
      populateProductionRequestForm(activeProductionRequest);
      renderProductionRequestOutputCards();
      await loadItem4Workspace(activeProductionRequest);
      await loadProductionRequestOutputs(activeProductionRequest);
      setRequestMessage(result.message || "Platform plan ready.", "success");
    } catch (error) { setRequestMessage(error.message, "error-text"); }
    finally { if (button) { button.textContent = item4Workspace?.plan?.items?.length ? "Update platform plan" : "Recommend platform plan"; button.disabled = !(item4Workspace?.assets?.length); } }
  }

  function selectedRequestPlatforms() {
    return Array.from(document.querySelectorAll('input[name="prPlatform"]:checked')).map(input => input.value);
  }

  function setRequestMessage(text = "", type = "") {
    const target = $("productionRequestMessage");
    target.textContent = text;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function syncCountInputs(modeId, containerId) {
    const mode = $(modeId).value;
    const container = $(containerId);
    container.querySelectorAll(".exact-count").forEach(el => el.hidden = mode !== "Exact");
    container.querySelectorAll(".range-count").forEach(el => el.hidden = mode !== "Target range");
  }

  function syncAllStructureControls() {
    syncCountInputs("prVideoClipMode", "prVideoStructure");
    syncCountInputs("prCarouselSlideMode", "prCarouselStructure");
  }

  $("prVideoClipMode")?.addEventListener("change", syncAllStructureControls);
  $("prCarouselSlideMode")?.addEventListener("change", syncAllStructureControls);

  async function ensureProductionRequestMusic() {
    if (productionRequestMusic.length) return productionRequestMusic;
    const { records = [] } = await api("/api/music?limit=100");
    productionRequestMusic = records.filter(record => !record.do_not_use);
    const select = $("prMusicAsset");
    select.innerHTML = '<option value="">AI / profile chooses track</option>' + productionRequestMusic.map(record =>
      `<option value="${escapeHtml(record.id)}">${escapeHtml(record.display_name || record.name || record.id)}</option>`
    ).join("");
    return productionRequestMusic;
  }

  const OUTPUT_DEFAULTS_BY_CONTENT_TYPE = {
    "Vertical Short Video": {Instagram:"Reel", Facebook:"Reel", TikTok:"Video Draft", YouTube:"Short"},
    "Story": {Instagram:"Story", Facebook:"Story", TikTok:"Story"},
    "Carousel": {Instagram:"Carousel", Facebook:"Multi-Image Post", TikTok:"Multi-Photo"},
    "Feed Post": {Instagram:"Single Image", Facebook:"Single Image", TikTok:"Single Photo"},
    "Photo Set": {Instagram:"Reel", Facebook:"Slideshow Reel", TikTok:"Multi-Photo", YouTube:"Slideshow Video"},
    "Longform Video": {YouTube:"Standard Video"},
  };

  function outputMatrixInputs() {
    return Array.from(document.querySelectorAll("[data-pr-output]"));
  }

  function selectedOutputMatrix() {
    return outputMatrixInputs().filter(input => input.checked).map(input => ({
      platform: input.dataset.platform,
      output_type: input.value,
      enabled: true,
    }));
  }

  function updateOutputMatrixSummary() {
    const outputs = selectedOutputMatrix();
    const target = $("prOutputMatrixSummary");
    if (!target) return;
    target.textContent = outputs.length
      ? `${outputs.length} requested output${outputs.length === 1 ? "" : "s"}: ${outputs.map(o => `${o.platform} ${o.output_type}`).join(" · ")}`
      : "No custom outputs selected. Studio will use the recommended output for each selected platform.";
  }

  function outputRecordKey(row) {
    return `${row?.platform || ""}::${row?.output_type || ""}`;
  }

  function enabledProductionRequestOutputs() {
    return productionRequestOutputs
      .filter(row => row.enabled !== false)
      .sort((a, b) => Number(a.output_order || 0) - Number(b.output_order || 0));
  }

  function overrideCount(row) {
    const keys = [
      "voiceover_mode_override","background_music_mode_override","thumbnail_mode_override",
      "video_duration_seconds_override","video_clip_count_mode_override","video_clip_count_exact_override",
      "video_clip_count_min_override","video_clip_count_max_override","carousel_slide_count_mode_override",
      "carousel_slide_count_exact_override","carousel_slide_count_min_override","carousel_slide_count_max_override",
      "carousel_image_mode_override","voiceover_tail_seconds_override","requested_title_override",
      "requested_caption_override","requested_script_override","output_notes","scheduled_at"
    ];
    let count = keys.filter(key => {
      const v = row?.[key];
      return v !== null && v !== undefined && v !== "" && v !== "Inherit";
    }).length;
    if (Array.isArray(row?.selected_music_asset_override_links) && row.selected_music_asset_override_links.length) count++;
    if (row?.title_mode_override && row.title_mode_override !== "Inherit") count++;
    if (row?.caption_mode_override && row.caption_mode_override !== "Inherit") count++;
    if (row?.script_mode_override && row.script_mode_override !== "Inherit") count++;
    if (row?.publish_mode && row.publish_mode !== "Inherit") count++;
    return count;
  }

  function renderProductionRequestOutputCards() {
    const host = $("prOutputCards");
    if (!host) return;
    const rows = enabledProductionRequestOutputs();
    if (!rows.length) {
      host.innerHTML = '<div class="empty compact-empty">Recommended outputs will be created automatically when the draft is saved. Use Section 5 only for additional or alternative outputs.</div>';
      return;
    }

    host.innerHTML = rows.map(row => {
      const count = overrideCount(row);
      const effective = row.effective || {};
      const detail = [
        effective.video_duration_seconds ? `${effective.video_duration_seconds}s` : null,
        effective.video_clip_count_mode && ["Reel","Story","Video Draft","Short","Standard Video"].includes(row.output_type)
          ? `${effective.video_clip_count_mode} clips` : null,
        effective.carousel_slide_count_mode && ["Carousel","Multi-Image Post","Multi-Photo","Slideshow Reel","Slideshow Video"].includes(row.output_type)
          ? `${effective.carousel_slide_count_mode} slides` : null,
        effective.voiceover_mode ? `VO ${effective.voiceover_mode}` : null,
      ].filter(Boolean).join(" · ");

      return `<div class="requested-output-card">
        <div>
          <div class="requested-output-title">${escapeHtml(row.platform)} · ${escapeHtml(row.output_type)}</div>
          <div class="requested-output-detail">${escapeHtml(detail || "Inherits master request")}</div>
        </div>
        <div class="requested-output-actions">
          ${count ? `<span class="override-count">${count} override${count === 1 ? "" : "s"}</span>` : '<span class="inherit-pill">Inherits master</span>'}
          <button type="button" class="button secondary small" data-edit-pr-output="${escapeHtml(row.id)}">Override</button>
        </div>
      </div>`;
    }).join("");

    host.querySelectorAll("[data-edit-pr-output]").forEach(button => {
      button.addEventListener("click", () => openProductionRequestOutputOverride(button.dataset.editPrOutput));
    });
  }

  function setOverrideSelect(id, value, fallback = "Inherit") {
    const el = $(id);
    if (!el) return;
    const desired = String(value || fallback);
    el.value = Array.from(el.options).some(o => o.value === desired) ? desired : fallback;
  }

  function setOverrideValue(id, value) {
    const el = $(id);
    if (el) el.value = value === null || value === undefined ? "" : value;
  }

  function isVideoClipOutput(outputType) {
    return ["Reel","Story","Video Draft","Short","Standard Video"].includes(outputType);
  }

  function isSlideOutput(outputType) {
    return ["Carousel","Multi-Image Post","Multi-Photo","Slideshow Reel","Slideshow Video"].includes(outputType);
  }

  function fillOverrideMusicChoices(row) {
    const select = $("prOverrideMusicAsset");
    if (!select) return;
    const selected = Array.isArray(row?.selected_music_asset_override_links) && row.selected_music_asset_override_links.length
      ? row.selected_music_asset_override_links[0] : "";
    select.innerHTML = '<option value="">Inherit master track</option>' + productionRequestMusic.map(track =>
      `<option value="${escapeHtml(track.id)}">${escapeHtml(track.display_name || track.name || track.id)}</option>`
    ).join("");
    select.value = selected || "";
  }

  function effectivePreviewHtml(row) {
    const e = row?.effective || {};
    const bits = [
      ["Voiceover", e.voiceover_mode],
      ["Music", e.background_music_mode],
      ["Thumbnail", e.thumbnail_mode],
      ["Duration", e.video_duration_seconds ? `${e.video_duration_seconds}s` : null],
      ["Clip count", isVideoClipOutput(row?.output_type) ? e.video_clip_count_mode : null],
      ["Slide count", isSlideOutput(row?.output_type) ? e.carousel_slide_count_mode : null],
      ["Title", e.title_mode],
      ["Caption", e.caption_mode],
      ["Script", e.script_mode],
      ["Publish", e.publish_mode],
    ].filter(([,v]) => v !== null && v !== undefined && v !== "");

    return `<strong>Effective settings after inheritance</strong>
      <div class="effective-preview-grid">${bits.map(([k,v]) =>
        `<div><span>${escapeHtml(k)}</span><b>${escapeHtml(v)}</b></div>`).join("")}</div>`;
  }

  function openProductionRequestOutputOverride(recordId) {
    const row = productionRequestOutputs.find(r => r.id === recordId);
    if (!row) return;

    $("prOverrideRecordId").value = row.id;
    $("prOverrideHeading").textContent = `${row.platform} · ${row.output_type}`;
    $("prOverrideInheritedNote").textContent = "Use Inherit or leave numeric/text fields blank to use the master Production Request.";

    setOverrideSelect("prOverrideVoiceover", row.voiceover_mode_override);
    setOverrideSelect("prOverrideMusicMode", row.background_music_mode_override);
    setOverrideSelect("prOverrideThumbnail", row.thumbnail_mode_override);
    setOverrideValue("prOverrideDuration", row.video_duration_seconds_override);
    setOverrideValue("prOverrideVoiceoverTail", row.voiceover_tail_seconds_override);

    setOverrideSelect("prOverrideClipMode", row.video_clip_count_mode_override);
    setOverrideValue("prOverrideClipExact", row.video_clip_count_exact_override);
    setOverrideValue("prOverrideClipMin", row.video_clip_count_min_override);
    setOverrideValue("prOverrideClipMax", row.video_clip_count_max_override);

    setOverrideSelect("prOverrideSlideMode", row.carousel_slide_count_mode_override);
    setOverrideValue("prOverrideSlideExact", row.carousel_slide_count_exact_override);
    setOverrideValue("prOverrideSlideMin", row.carousel_slide_count_min_override);
    setOverrideValue("prOverrideSlideMax", row.carousel_slide_count_max_override);
    setOverrideSelect("prOverrideImageMode", row.carousel_image_mode_override);

    setOverrideSelect("prOverrideTitleMode", row.title_mode_override);
    setOverrideValue("prOverrideTitle", row.requested_title_override);
    setOverrideSelect("prOverrideCaptionMode", row.caption_mode_override);
    setOverrideValue("prOverrideCaption", row.requested_caption_override);
    setOverrideSelect("prOverrideScriptMode", row.script_mode_override);
    setOverrideValue("prOverrideScript", row.requested_script_override);
    setOverrideValue("prOverrideNotes", row.output_notes);
    setOverrideSelect("prOverridePublishMode", row.publish_mode);
    setOverrideValue("prOverrideScheduledAt", row.scheduled_at ? new Date(row.scheduled_at).toISOString().slice(0,16) : "");

    fillOverrideMusicChoices(row);
    $("prOverrideClipSection").hidden = !isVideoClipOutput(row.output_type);
    $("prOverrideSlideSection").hidden = !isSlideOutput(row.output_type);
    $("prOverrideDurationField").hidden = !isVideoClipOutput(row.output_type) && !["Slideshow Reel","Slideshow Video"].includes(row.output_type);
    $("prOverrideEffectivePreview").innerHTML = effectivePreviewHtml(row);
    $("prOverrideMessage").textContent = "";
    $("prOverrideMessage").className = "form-message";

    $("prOutputOverrideEditor").hidden = false;
    $("prOutputOverrideEditor").scrollIntoView({behavior:"smooth", block:"start"});
  }

  function nullableNumberFromInput(id) {
    const raw = String($(id)?.value || "").trim();
    return raw === "" ? null : Number(raw);
  }

  async function saveProductionRequestOutputOverride() {
    const recordId = $("prOverrideRecordId").value;
    if (!recordId) return;

    const button = $("savePrOverride");
    const message = $("prOverrideMessage");
    button.disabled = true;
    button.textContent = "Saving…";
    message.textContent = "";
    message.className = "form-message";

    try {
      const scheduledRaw = String($("prOverrideScheduledAt").value || "").trim();
      const payload = {
        voiceover_mode_override: $("prOverrideVoiceover").value,
        background_music_mode_override: $("prOverrideMusicMode").value,
        thumbnail_mode_override: $("prOverrideThumbnail").value,
        selected_music_asset_override_id: $("prOverrideMusicAsset").value || "",
        video_duration_seconds_override: nullableNumberFromInput("prOverrideDuration"),
        voiceover_tail_seconds_override: nullableNumberFromInput("prOverrideVoiceoverTail"),

        video_clip_count_mode_override: $("prOverrideClipMode").value,
        video_clip_count_exact_override: nullableNumberFromInput("prOverrideClipExact"),
        video_clip_count_min_override: nullableNumberFromInput("prOverrideClipMin"),
        video_clip_count_max_override: nullableNumberFromInput("prOverrideClipMax"),

        carousel_slide_count_mode_override: $("prOverrideSlideMode").value,
        carousel_slide_count_exact_override: nullableNumberFromInput("prOverrideSlideExact"),
        carousel_slide_count_min_override: nullableNumberFromInput("prOverrideSlideMin"),
        carousel_slide_count_max_override: nullableNumberFromInput("prOverrideSlideMax"),
        carousel_image_mode_override: $("prOverrideImageMode").value,

        title_mode_override: $("prOverrideTitleMode").value,
        requested_title_override: $("prOverrideTitle").value.trim(),
        caption_mode_override: $("prOverrideCaptionMode").value,
        requested_caption_override: $("prOverrideCaption").value.trim(),
        script_mode_override: $("prOverrideScriptMode").value,
        requested_script_override: $("prOverrideScript").value.trim(),
        output_notes: $("prOverrideNotes").value.trim(),

        publish_mode: $("prOverridePublishMode").value,
        scheduled_at: scheduledRaw ? new Date(scheduledRaw).toISOString() : "",
      };

      const result = await api(`/api/production-request-outputs/${encodeURIComponent(recordId)}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });

      const idx = productionRequestOutputs.findIndex(r => r.id === recordId);
      if (idx >= 0) productionRequestOutputs[idx] = result.record;
      renderProductionRequestOutputCards();
      openProductionRequestOutputOverride(recordId);

      message.textContent = "Output override saved.";
      message.className = "form-message success";
    } catch (e) {
      message.textContent = e.message;
      message.className = "form-message error-text";
    } finally {
      button.disabled = false;
      button.textContent = "Save output override";
    }
  }

  function syncLegacyPlatformsFromOutputMatrix() {
    const selectedPlatforms = new Set(selectedOutputMatrix().map(o => o.platform));
    document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
      if (["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) {
        input.checked = selectedPlatforms.has(input.value);
      }
    });
  }

  function clearOutputMatrix() {
    outputMatrixInputs().forEach(input => { input.checked = false; });
    updateOutputMatrixSummary();
  }

  function recommendedOutputFor(platform) {
    const contentType = $("prContentType")?.value || "";
    return OUTPUT_DEFAULTS_BY_CONTENT_TYPE[contentType]?.[platform] || "";
  }

  function seedOutputMatrixFromLegacyPlatforms(record) {
    clearOutputMatrix();
    if ($("prOutputCards")) $("prOutputCards").innerHTML = "";
    if ($("prOutputOverrideEditor")) $("prOutputOverrideEditor").hidden = true;
    for (const platform of (Array.isArray(record?.platforms) ? record.platforms : [])) {
      const recommended = recommendedOutputFor(platform);
      const input = outputMatrixInputs().find(x => x.dataset.platform === platform && x.value === recommended);
      if (input) input.checked = true;
    }
    updateOutputMatrixSummary();
  }

  async function loadProductionRequestOutputs(record = activeProductionRequest) {
    if (!record?.id) return;
    productionOutputMatrixLoaded = false;
    const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/outputs`);
    productionRequestOutputs = Array.isArray(result.records) ? result.records : [];
    clearOutputMatrix();

    if (productionRequestOutputs.length) {
      const selected = new Set(
        productionRequestOutputs.filter(row => row.enabled !== false).map(row => `${row.platform}::${row.output_type}`)
      );
      outputMatrixInputs().forEach(input => {
        input.checked = selected.has(`${input.dataset.platform}::${input.value}`);
      });
    } else {
      seedOutputMatrixFromLegacyPlatforms(record);
    }

    syncLegacyPlatformsFromOutputMatrix();
    updateOutputMatrixSummary();
    productionOutputMatrixLoaded = true;
    renderProductionRequestOutputCards();
    setProductionRequestControlState(activeProductionRequest);
  }

  function defaultOutputsForPlatforms(platforms) {
    return Array.from(new Set(Array.isArray(platforms) ? platforms : []))
      .map(platform => ({ platform, output_type: recommendedOutputFor(platform), enabled: true }))
      .filter(row => row.output_type);
  }

  async function saveProductionRequestOutputs(record = activeProductionRequest) {
    if (!record?.id || !productionOutputMatrixLoaded) return null;
    let outputs = selectedOutputMatrix();
    if (!outputs.length) {
      const planPlatforms = item4SelectedPlatforms();
      const requestPlatforms = selectedRequestPlatforms();
      const savedPlatforms = Array.isArray(record?.platforms) ? record.platforms : [];
      outputs = defaultOutputsForPlatforms(planPlatforms.length ? planPlatforms : (requestPlatforms.length ? requestPlatforms : savedPlatforms));
    }
    if (!outputs.length) return null;

    const result = await api(`/api/production-requests/${encodeURIComponent(record.id)}/outputs`, {
      method: "PUT",
      body: JSON.stringify({ outputs }),
    });

    productionRequestOutputs = Array.isArray(result.records) ? result.records : [];
    if (result.production_request) activeProductionRequest = result.production_request;
    syncLegacyPlatformsFromOutputMatrix();
    updateOutputMatrixSummary();
    renderProductionRequestOutputCards();
    return result;
  }

  function setProductionRequestControlState(record) {
    const status = String(record?.status || "Draft");
    const editable = status === "Draft" || status === "Ready";
    const form = $("productionRequestForm");

    if (form) {
      form.querySelectorAll("input, select, textarea").forEach((control) => {
        control.disabled = !editable;
      });
    }

    const save = $("saveProductionRequest");
    if (save) {
      save.disabled = !editable;
      save.textContent = editable ? "Save draft" : (status === "Promoted" ? "Draft locked" : "Submitted");
    }

    const promote = $("promoteProductionRequest");
    if (promote) {
      if (status === "Promoted") {
        promote.disabled = true;
        promote.textContent = "Promoted";
      } else if (status === "Submitted") {
        promote.disabled = false;
        promote.textContent = "Check promotion status";
      } else if (item4Workspace?.assets?.length) {
        const planReady = item4Workspace?.plan_status === "Ready";
        const variantsReady = item4Workspace?.variant_status === "Ready";
        const bridgeReady = Boolean(item4BridgePreflight?.ready);
        const bridgeChecked = item4BridgePreflight !== null;
        promote.disabled = item4Uploading || item4PreparingVariants || (planReady && variantsReady && bridgeChecked && !bridgeReady);
        promote.textContent = !planReady
          ? "Build platform plan first"
          : (!variantsReady
              ? "Prepare platform media next"
              : (bridgeReady ? "Approve & Promote" : (bridgeChecked ? "Source bridge blocked" : "Validating source bridge…")));
        promote.title = !planReady
          ? "Build the recommended platform plan from the selected destinations."
          : (!variantsReady
              ? "Prepare the platform-specific media required by the saved plan."
              : (bridgeReady
                  ? "Source-to-production bridge validated. Ready to start the existing I3 → I4 production handoff."
                  : "Studio is validating master-media authority, output mappings, platform variants, and downstream work-item routing."));
      } else {
        promote.disabled = false;
        promote.textContent = "Approve & Promote";
      }
    }

    const sync = $("syncProductionRequestDirectives");
    if (sync) {
      sync.hidden = status !== "Promoted";
      sync.disabled = false;
      sync.textContent = "Sync advanced directives";
    }

    const compatibility = $("productionPromotionCompatibility");
    if (compatibility) {
      compatibility.className = `form-message${status === "Promoted" ? " success" : ""}`;
      compatibility.textContent = status === "Promoted"
        ? "Promotion complete. This Production Request is locked and linked to the existing production pipeline."
        : status === "Submitted"
          ? "The request has been submitted to I3. Use Check promotion status; Studio will not send a duplicate I3 trigger."
          : item4Workspace?.assets?.length
            ? (item4Workspace?.plan_status !== "Ready"
                ? "Master media is saved. Build and review the platform plan before production."
                : item4Workspace?.variant_status !== "Ready"
                  ? "Platform plan is ready. Prepare the required platform media before production."
                  : item4BridgePreflight?.ready
                    ? `Source-to-production bridge validated. ${item4BridgePreflight.enabled_output_count || 0} output route(s) are ready for Approve & Promote.${item4BridgePreflight.idea_summary_mode === "derive-on-promotion" ? " Studio will derive the minimal I4 summary automatically." : ""}`
                    : item4BridgePreflight
                      ? `Source bridge blocked: ${(item4BridgePreflight.issues || []).join(" ")}`
                      : "Validating the source-to-production bridge…")
            : "The existing I3 → I4 promotion path remains available for legacy requests. Item 4 adds master-media planning without weakening the hardened production path.";
    }
  }

  function populateProductionRequestForm(record) {
    activeProductionRequest = record;
    productionOutputMatrixLoaded = false;
    $("productionRequestWorkspace").hidden = false;
    $("productionRequestTitle").textContent = activeIdea?.title || record.production_request_id || "Production request";
    $("productionRequestSubtitle").textContent = `${record.production_request_id || "Draft"} · Creative configuration remains editable until submission.`;
    $("productionRequestStatus").textContent = record.status || "Draft";
    $("productionRequestStatus").className = `badge ${stateClass(record.status || "Draft")}`;

    setSelectValue("prContentType", record.content_type, "");
    document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
      input.checked = Array.isArray(record.platforms) && record.platforms.includes(input.value);
    });
    setSelectValue("prVoiceover", record.voiceover_mode, "Use Profile Default");
    setSelectValue("prMusicMode", record.background_music_mode, "Use Profile Default");
    setSelectValue("prThumbnail", record.thumbnail_mode, "Use Profile Default");
    $("prVideoDuration").value = record.video_duration_seconds ?? 30;
    setSelectValue("prVideoClipMode", record.video_clip_count_mode, "AI decides");
    $("prVideoClipExact").value = record.video_clip_count_exact ?? "";
    $("prVideoClipMin").value = record.video_clip_count_min ?? "";
    $("prVideoClipMax").value = record.video_clip_count_max ?? "";
    setSelectValue("prCarouselSlideMode", record.carousel_slide_count_mode, "AI decides");
    $("prCarouselSlideExact").value = record.carousel_slide_count_exact ?? "";
    $("prCarouselSlideMin").value = record.carousel_slide_count_min ?? "";
    $("prCarouselSlideMax").value = record.carousel_slide_count_max ?? "";
    setSelectValue("prCarouselImageMode", record.carousel_image_mode, "Make AI Generated");
    $("prVoiceoverTail").value = record.voiceover_tail_seconds ?? 2;
    setSelectValue("prTitleMode", record.title_mode, "AI decides");
    $("prRequestedTitle").value = record.requested_title || "";
    setSelectValue("prCaptionMode", record.caption_mode, "AI decides");
    $("prRequestedCaption").value = record.requested_caption || "";
    setSelectValue("prScriptMode", record.script_mode, "AI decides");
    $("prRequestedScript").value = record.requested_script || "";
    $("prProductionNotes").value = record.production_notes || "";
    const musicId = Array.isArray(record.selected_music_asset_links) ? record.selected_music_asset_links[0] : "";
    $("prMusicAsset").value = musicId || "";
    syncAllStructureControls();
    setProductionRequestControlState(record);
    setRequestMessage();
  }

  async function openProductionRequestForIdea(idea) {
    if (!idea?.id) return;
    const button = $("configureProductionButton");
    if (button) {
      button.disabled = true;
      button.textContent = "Opening…";
    }
    setManageMessage("Opening Phase 2B Production Request…", "");

    try {
      await ensureProductionRequestMusic();
      const result = await api(`/api/ideas/${encodeURIComponent(idea.id)}/production-request`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      closeIdeaDrawer();
      activeIdea = idea;
      switchToPage("content");
      populateProductionRequestForm(result.record);
      await loadProductionRequestOutputs(result.record);
      await loadItem4Workspace(result.record);
      await loadProductionRequests();
      setRequestMessage(result.created ? "Production Request draft created." : "Existing Production Request draft opened.", "success");
    } catch (e) {
      setManageMessage(e.message, "error-text");
    } finally {
      if (button && activeIdea && !ideaIsPromoted(activeIdea) && !activeIdea.is_on_hold) {
        button.disabled = false;
        button.textContent = "Configure Production";
      }
    }
  }

  $("item4ChooseMedia")?.addEventListener("click", () => $("item4MediaInput")?.click());
  $("item4MediaInput")?.addEventListener("change", (event) => { uploadItem4Files(event.target.files); event.target.value = ""; });
  $("item4BuildPlan")?.addEventListener("click", buildItem4Plan);
  $("item4PrepareVariants")?.addEventListener("click", prepareItem4Variants);
  const item4Drop = $("item4UploadZone");
  if (item4Drop) {
    ["dragenter","dragover"].forEach(type => item4Drop.addEventListener(type, event => { event.preventDefault(); item4Drop.classList.add("dragging"); }));
    ["dragleave","drop"].forEach(type => item4Drop.addEventListener(type, event => { event.preventDefault(); item4Drop.classList.remove("dragging"); }));
    item4Drop.addEventListener("drop", event => uploadItem4Files(event.dataTransfer?.files));
    item4Drop.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("item4MediaInput")?.click(); } });
  }

  $("configureProductionButton")?.addEventListener("click", () => {
    if (activeIdea) openProductionRequestForIdea(activeIdea);
  });

  $("closeProductionRequest")?.addEventListener("click", () => {
    stopItem4MasterPolling();
    stopItem4VariantPolling();
    const workspace = $("productionRequestWorkspace");
    if (workspace) workspace.hidden = true;
    activeProductionRequest = null;
    productionRequestOutputs = [];
    productionOutputMatrixLoaded = false;
    item4Workspace = null;
    item4PlanOverrides = {};
    item4PreparingVariants = false;
    stopItem4VariantPolling();
    clearOutputMatrix();
    setRequestMessage();
  });

  function productionRequestPayload() {
    const requestedPlatforms = selectedRequestPlatforms();
    const planPlatforms = item4SelectedPlatforms();
    return {
      content_type: $("prContentType").value,
      platforms: requestedPlatforms.length ? requestedPlatforms : planPlatforms,
      voiceover_mode: $("prVoiceover").value,
      background_music_mode: $("prMusicMode").value,
      thumbnail_mode: $("prThumbnail").value,
      video_duration_seconds: $("prVideoDuration").value,
      video_clip_count_mode: $("prVideoClipMode").value,
      video_clip_count_exact: $("prVideoClipExact").value,
      video_clip_count_min: $("prVideoClipMin").value,
      video_clip_count_max: $("prVideoClipMax").value,
      carousel_slide_count_mode: $("prCarouselSlideMode").value,
      carousel_slide_count_exact: $("prCarouselSlideExact").value,
      carousel_slide_count_min: $("prCarouselSlideMin").value,
      carousel_slide_count_max: $("prCarouselSlideMax").value,
      carousel_image_mode: $("prCarouselImageMode").value,
      voiceover_tail_seconds: $("prVoiceoverTail").value,
      selected_music_asset_id: $("prMusicAsset").value,
      title_mode: $("prTitleMode").value,
      requested_title: $("prRequestedTitle").value.trim(),
      caption_mode: $("prCaptionMode").value,
      requested_caption: $("prRequestedCaption").value.trim(),
      script_mode: $("prScriptMode").value,
      requested_script: $("prRequestedScript").value.trim(),
      production_notes: $("prProductionNotes").value.trim(),
    };
  }

  async function saveActiveProductionRequest({ quiet = false } = {}) {
    if (!activeProductionRequest?.id) throw new Error("No Production Request is open");
    if (!["Draft", "Ready"].includes(String(activeProductionRequest.status || "Draft"))) {
      return activeProductionRequest;
    }

    const button = $("saveProductionRequest");
    if (button) {
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = "Saving draft…";
    }
    if (!quiet) setRequestMessage();

    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}`, {
        method: "PATCH",
        body: JSON.stringify(productionRequestPayload()),
      });
      activeProductionRequest = result.record;
      await saveProductionRequestOutputs(result.record);
      populateProductionRequestForm(activeProductionRequest);
      await loadProductionRequestOutputs(activeProductionRequest);
      await loadItem4Workspace(activeProductionRequest);
      await loadProductionRequests();
      if (!quiet) setRequestMessage("Production Request draft and requested platform outputs saved.", "success");
      return activeProductionRequest;
    } finally {
      if (button) {
        delete button.dataset.busy;
        setProductionRequestControlState(activeProductionRequest);
      }
    }
  }

  outputMatrixInputs().forEach(input => {
    input.addEventListener("change", () => {
      syncLegacyPlatformsFromOutputMatrix();
      updateOutputMatrixSummary();
    });
  });

  document.querySelectorAll('input[name="prPlatform"]').forEach(input => {
    input.addEventListener("change", () => {
      if (!["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) return;
      const platformInputs = outputMatrixInputs().filter(x => x.dataset.platform === input.value);
      if (!input.checked) {
        platformInputs.forEach(x => { x.checked = false; });
      } else if (!platformInputs.some(x => x.checked)) {
        const target = platformInputs.find(x => x.value === recommendedOutputFor(input.value));
        if (target) target.checked = true;
      }
      updateOutputMatrixSummary();
    });
  });

  $("prContentType")?.addEventListener("change", () => {
    document.querySelectorAll('input[name="prPlatform"]:checked').forEach(input => {
      if (!["Instagram","Facebook","TikTok","YouTube"].includes(input.value)) return;
      const platformInputs = outputMatrixInputs().filter(x => x.dataset.platform === input.value);
      if (!platformInputs.some(x => x.checked)) {
        const target = platformInputs.find(x => x.value === recommendedOutputFor(input.value));
        if (target) target.checked = true;
      }
    });
    updateOutputMatrixSummary();
  });

  $("closePrOverride")?.addEventListener("click", () => {
    $("prOutputOverrideEditor").hidden = true;
    $("prOverrideRecordId").value = "";
  });

  $("savePrOverride")?.addEventListener("click", saveProductionRequestOutputOverride);

  $("productionRequestForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await saveActiveProductionRequest();
    } catch (e) {
      setRequestMessage(e.message, "error-text");
      setProductionRequestControlState(activeProductionRequest);
    }
  });

  $("syncProductionRequestDirectives")?.addEventListener("click", async () => {
    if (!activeProductionRequest?.id) return;

    const button = $("syncProductionRequestDirectives");
    if (button) {
      button.disabled = true;
      button.dataset.busy = "true";
      button.textContent = "Syncing…";
    }
    setRequestMessage();

    try {
      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/sync-directives`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRequestMessage(
        `${result.message || "Advanced directives synchronized."} Content Item: ${result.content_item_record_id}.`,
        "success"
      );
    } catch (e) {
      setRequestMessage(e.message, "error-text");
    } finally {
      if (button) {
        delete button.dataset.busy;
        button.disabled = false;
        button.textContent = "Sync advanced directives";
      }
    }
  });

  $("promoteProductionRequest")?.addEventListener("click", async () => {
    if (!activeProductionRequest?.id) return;

    if (item4Workspace?.assets?.length && item4Workspace?.plan_status !== "Ready") {
      await buildItem4Plan();
      return;
    }
    if (item4Workspace?.assets?.length && item4Workspace?.plan_status === "Ready" && item4Workspace?.variant_status !== "Ready") {
      await prepareItem4Variants();
      return;
    }
    if (item4Workspace?.assets?.length && item4Workspace?.plan_status === "Ready" && item4Workspace?.variant_status === "Ready") {
      const bridge = item4BridgePreflight?.ready ? item4BridgePreflight : await loadItem4BridgePreflight(activeProductionRequest);
      if (!bridge?.ready) {
        setRequestMessage(`Source bridge blocked: ${(bridge?.issues || ["Validation did not pass."]).join(" ")}`, "error-text");
        return;
      }
    }

    const status = String(activeProductionRequest.status || "Draft");
    const promoteButton = $("promoteProductionRequest");

    if (status !== "Submitted") {
      const confirmed = window.confirm(
        "Approve and promote this saved Production Request through the existing I3 → I4 workflow?\n\nThis starts the real production pipeline and locks this Production Request after promotion."
      );
      if (!confirmed) return;
    }

    if (promoteButton) {
      promoteButton.disabled = true;
      promoteButton.dataset.busy = "true";
      promoteButton.textContent = status === "Submitted" ? "Checking…" : "Submitting…";
    }
    setRequestMessage();

    try {
      // Save the visible form first so the handoff always uses the latest draft.
      if (status === "Draft" || status === "Ready") {
        await saveActiveProductionRequest({ quiet: true });
      }

      const result = await api(`/api/production-requests/${encodeURIComponent(activeProductionRequest.id)}/promote`, {
        method: "POST",
        body: JSON.stringify({}),
      });

      if (result.production_request) {
        populateProductionRequestForm(result.production_request);
      }

      await Promise.all([loadProductionRequests(), loadContent(), loadIdeas(), loadDashboard()]);

      if (result.promoted) {
        const content = result.content_item_record_id ? ` Content Item: ${result.content_item_record_id}.` : "";
        setRequestMessage(`${result.message || "Promotion complete."}${content}`, "success");
      } else {
        setRequestMessage(result.message || "Promotion is processing.", "");
      }
    } catch (e) {
      setRequestMessage(e.message, "error-text");
    } finally {
      if (promoteButton) delete promoteButton.dataset.busy;
      setProductionRequestControlState(activeProductionRequest);
    }
  });

  async function loadProductionRequests() {
    const target = $("productionRequestList");
    target.innerHTML = '<div class="empty">Loading production requests…</div>';
    try {
      const { records = [] } = await api("/api/production-requests?limit=100");
      if (!records.length) {
        target.innerHTML = '<div class="empty"><strong>No Production Request drafts yet.</strong><br><span class="subtle">Open an Idea Candidate and choose Configure Production.</span></div>';
        return;
      }
      target.innerHTML = `<table class="data-table"><thead><tr><th>Request</th><th>Status</th><th>Type</th><th>Platforms</th><th>Structure</th><th></th></tr></thead><tbody>${records.map(r => {
        let structure = "AI decides";
        if (r.video_clip_count_mode === "Exact") structure = `${value(r.video_clip_count_exact)} clips`;
        if (r.video_clip_count_mode === "Target range") structure = `${value(r.video_clip_count_min)}–${value(r.video_clip_count_max)} clips`;
        if (r.carousel_slide_count_mode === "Exact") structure = `${value(r.carousel_slide_count_exact)} slides`;
        if (r.carousel_slide_count_mode === "Target range") structure = `${value(r.carousel_slide_count_min)}–${value(r.carousel_slide_count_max)} slides`;
        return `<tr><td><div class="title-cell">${value(r.production_request_id)}</div><div class="subtle">Updated ${value(r.updated_at)}</div></td><td>${badge(r.status)}</td><td>${value(r.content_type)}</td><td>${join(r.platforms)}</td><td>${structure}</td><td><button type="button" class="manage-button" data-pr-id="${escapeHtml(r.id)}">Open</button></td></tr>`;
      }).join("")}</tbody></table>`;

      const byId = new Map(records.map(record => [record.id, record]));
      target.querySelectorAll("[data-pr-id]").forEach(button => {
        button.addEventListener("click", async () => {
          const record = byId.get(button.dataset.prId);

          if (!record) {
            setRequestMessage("Production Request not found in the current list. Click Refresh and try again.", "error-text");
            return;
          }

          // Open immediately from the Production Request record already loaded
          // into the drafts table. Do not block opening on a second API call.
          activeIdea = null;
          populateProductionRequestForm(record);
          await loadProductionRequestOutputs(record);
          await loadItem4Workspace(record);

          // Refresh music choices only after the workspace is visible.
          try {
            await ensureProductionRequestMusic();
            const musicId = Array.isArray(record.selected_music_asset_links)
              ? record.selected_music_asset_links[0]
              : "";
            if ($("prMusicAsset")) $("prMusicAsset").value = musicId || "";
          } catch (e) {
            setRequestMessage(
              `Production Request opened. Music catalogue refresh failed: ${e.message}`,
              "error-text"
            );
          }

          $("productionRequestWorkspace")?.scrollIntoView({
            behavior: "smooth",
            block: "start"
          });
        });
      });
    } catch (e) {
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  }


  async function loadIdeas() {
    const target = $("ideasList");
    target.innerHTML = '<div class="empty">Loading ideas…</div>';
    try {
      const { records = [] } = await api("/api/ideas?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty"><strong>No ideas are currently in the intake queue.</strong><br><span class="subtle">Studio is connected; the Idea Candidates table is simply empty after the recent reset/test cycle.</span></div>';

      target.innerHTML = `<table class="data-table idea-table"><thead><tr><th>Idea</th><th>Status</th><th>Type</th><th>Platforms</th><th>Structure</th><th>Production</th><th></th></tr></thead><tbody>${records.map((r) => `<tr class="${r.is_on_hold ? "idea-row-held" : ""}"><td><div class="title-cell">${value(r.title)}</div><div class="subtle">${value(r.summary, "")}</div></td><td>${badge(ideaStatusLabel(r))}</td><td>${value(r.content_type)}</td><td>${join(r.platforms)}</td><td>${r.carousel_slide_count ? `${value(r.carousel_slide_count)} slides` : r.video_clip_count ? `${value(r.video_clip_count)} clips` : "AI / default"}</td><td><div class="subtle">VO: ${value(r.include_voiceover)} · Music: ${value(r.include_background_music)} · Thumbnail: ${value(r.include_thumbnail)}</div></td><td><button type="button" class="manage-button" data-idea-id="${escapeHtml(r.id)}">Manage</button></td></tr>`).join("")}</tbody></table>`;

      const byId = new Map(records.map((record) => [record.id, record]));
      target.querySelectorAll("[data-idea-id]").forEach((button) => {
        button.addEventListener("click", () => {
          const idea = byId.get(button.dataset.ideaId);
          if (idea) openIdeaDrawer(idea);
        });
      });
    } catch (e) {
      target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`;
    }
  }

  async function loadContent() {
    loadProductionRequests();
    const target = $("contentList");
    target.innerHTML = '<div class="empty">Loading content items…</div>';
    try {
      const { records = [] } = await api("/api/content?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty"><strong>No content items are currently in production.</strong><br><span class="subtle">Studio is connected; new promoted ideas will appear here as production begins.</span></div>';
      target.innerHTML = `<table class="data-table"><thead><tr><th>Content</th><th>Studio stage</th><th>Assets</th><th>Render</th><th>Review</th><th>Outputs</th></tr></thead><tbody>${records.map((r) => `<tr><td><div class="title-cell">${value(r.title)}</div><div class="subtle">Content ${value(r.content_id)} · ${value(r.content_type)}</div></td><td>${badge(r.studio_stage)}</td><td>${value(r.asset_match_status)}</td><td>${value(r.render_status)}</td><td>${value(r.review_status || r.carousel_review_status)}</td><td>${Array.isArray(r.output_links) ? r.output_links.length : 0}</td></tr>`).join("")}</tbody></table>`;
    } catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  }

  function phase6OptionList(values, current, { label = (v) => v, emptyLabel = null } = {}) {
    const items = Array.isArray(values) ? [...values] : [];
    if (current !== null && current !== undefined && current !== "" && !items.includes(current)) items.unshift(current);
    const options = [];
    if (emptyLabel !== null) options.push(`<option value="">${escapeHtml(emptyLabel)}</option>`);
    for (const item of items) {
      options.push(`<option value="${escapeHtml(item)}" ${String(item) === String(current) ? "selected" : ""}>${escapeHtml(label(item))}</option>`);
    }
    return options.join("");
  }

  function phase6Percent(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n * 1000) / 10)) : fallback;
  }

  function phase6NumberFromInput(id, fallback = null) {
    const n = Number($(id)?.value);
    return Number.isFinite(n) ? n : fallback;
  }

  function phase6RatioClass(ratio) {
    if (ratio === "9:16") return "ratio-9x16";
    if (ratio === "1:1") return "ratio-1x1";
    if (ratio === "16:9") return "ratio-16x9";
    return "";
  }

  function phase6FitLabel(value) {
    const labels = {
      fill_crop: "Fill / crop",
      full_with_blur: "Full image + blurred background",
      full_with_solid_background: "Full image + solid background",
    };
    return labels[value] || value;
  }

  function phase6MotionLabel(value) {
    const labels = {
      none: "None",
      slowZoom: "Slow zoom in",
      slowZoomOut: "Slow zoom out",
      panLeft: "Pan left",
      panRight: "Pan right",
      panUp: "Pan up",
      panDown: "Pan down",
      kenBurnsLeft: "Ken Burns left",
      kenBurnsRight: "Ken Burns right",
    };
    return labels[value] || value;
  }

  function phase6TransitionLabel(value) {
    const labels = { none: "None", fade: "Fade", slideLeft: "Slide left", slideRight: "Slide right", zoom: "Zoom" };
    return labels[value] || value;
  }


  let phase6VoicePreviewAudio = null;
  let phase6VoicePreviewButton = null;

  function phase6NormalizeVoices(values) {
    return (Array.isArray(values) ? values : []).map((voice) => {
      if (typeof voice === "string") return { id: voice, name: voice, preview_url: null };
      return {
        id: String(voice?.id || voice?.voice_id || voice?.name || "").trim(),
        name: String(voice?.name || voice?.id || "").trim(),
        preview_url: voice?.preview_url || null,
        category: voice?.category || null,
        accent: voice?.accent || null,
        gender: voice?.gender || null,
        age: voice?.age || null,
        use_case: voice?.use_case || null,
        description: voice?.description || null,
        is_default: Boolean(voice?.is_default),
      };
    }).filter((voice) => voice.id && voice.name);
  }

  function phase6VoiceLabel(voice) {
    const meta = [voice.gender, voice.accent, voice.age, voice.use_case].filter(Boolean).slice(0, 3);
    return meta.length ? `${voice.name} · ${meta.join(" · ")}` : voice.name;
  }

  function phase6VoiceOptionList(values, selectedId = "", selectedName = "") {
    const voices = phase6NormalizeVoices(values);
    let selectedFound = false;
    const options = voices.map((voice) => {
      const selected = voice.id === selectedId || (!selectedId && voice.name === selectedName);
      if (selected) selectedFound = true;
      return `<option value="${escapeHtml(voice.id)}" data-name="${escapeHtml(voice.name)}" data-preview="${escapeHtml(voice.preview_url || "")}" ${selected ? "selected" : ""}>${escapeHtml(phase6VoiceLabel(voice))}</option>`;
    });
    if (!selectedFound && (selectedId || selectedName)) {
      const fallbackId = selectedId || selectedName;
      const fallbackName = selectedName || selectedId;
      options.unshift(`<option value="${escapeHtml(fallbackId)}" data-name="${escapeHtml(fallbackName)}" selected>${escapeHtml(fallbackName)} · current</option>`);
    }
    return options.join("");
  }

  function phase6SelectedVoice(select) {
    const option = select?.selectedOptions?.[0];
    return {
      id: String(select?.value || "").trim(),
      name: String(option?.dataset?.name || option?.textContent?.split(" · ")?.[0] || "").trim(),
      preview_url: String(option?.dataset?.preview || "").trim() || null,
    };
  }

  function phase6PreviewSelectedVoice(select, button = null) {
    const voice = phase6SelectedVoice(select);
    if (!voice.preview_url) {
      phase6Message(`No ElevenLabs preview is available for ${voice.name || "this voice"}.`, "error-text");
      return;
    }
    try {
      // A second click on the currently playing preview is a true Stop.
      // Clicking a different Preview button stops the old sample first, then starts the new one.
      if (phase6VoicePreviewAudio) {
        const clickedActiveButton = !!button && button === phase6VoicePreviewButton;
        const oldAudio = phase6VoicePreviewAudio;
        oldAudio.pause();
        try { oldAudio.currentTime = 0; } catch (_) {}
        if (phase6VoicePreviewButton) phase6VoicePreviewButton.textContent = "▶ Preview";
        phase6VoicePreviewAudio = null;
        phase6VoicePreviewButton = null;
        if (clickedActiveButton) return;
      }

      const audio = new Audio(voice.preview_url);
      phase6VoicePreviewAudio = audio;
      phase6VoicePreviewButton = button || null;
      audio.preload = "auto";
      if (button) button.textContent = "■ Stop";

      const restore = () => {
        if (phase6VoicePreviewAudio !== audio) return;
        if (phase6VoicePreviewButton) phase6VoicePreviewButton.textContent = "▶ Preview";
        phase6VoicePreviewAudio = null;
        phase6VoicePreviewButton = null;
      };
      audio.addEventListener("ended", restore, { once: true });
      audio.addEventListener("error", () => { restore(); phase6Message("That ElevenLabs voice preview could not be played.", "error-text"); }, { once: true });
      audio.play().catch(() => { restore(); phase6Message("Browser playback was blocked. Click Preview again.", "error-text"); });
    } catch (e) {
      phase6Message(e.message || "Voice preview failed.", "error-text");
    }
  }

  function phase6Message(message = "", type = "") {
    const target = $("creativeEditorMessage");
    if (!target) return;
    target.textContent = message;
    target.className = `form-message${type ? ` ${type}` : ""}`;
  }

  function phase6CreativeFingerprint() {
    try { return JSON.stringify(collectCreativePayload()); } catch { return ""; }
  }

  function phase6SavedRevisionNeedsRender(output = activeCreativeOutput) {
    const savedAt = Date.parse(String(output?.creative_settings?.savedAt || ""));
    const previewAt = Date.parse(String(output?.studio_preview_updated_at || ""));
    if (!Number.isFinite(savedAt)) return false;
    return !Number.isFinite(previewAt) || savedAt > previewAt;
  }

  function phase6UpdatePreviewFreshness() {
    const target = $("creativePreviewFreshness");
    if (!target) return;
    let text = "Current rendered preview";
    let state = "current";
    if (creativeEditorDirty) {
      text = "Preview does not include your unsaved edits";
      state = "unsaved";
    } else if (creativeHandoffStatus?.active && !creativeHandoffStatus?.completed) {
      text = `${creativeHandoffStatus.current_stage_label || "New preview"} in progress`;
      state = "active";
    } else if (phase6SavedRevisionNeedsRender()) {
      text = "Saved edits are not in this preview yet";
      state = "stale";
    } else if (creativeHandoffStatus?.completed) {
      text = "Preview includes the latest saved revision";
      state = "current";
    }
    target.textContent = text;
    target.className = `creative-preview-freshness ${state}`;
  }

  function phase6UpdateSaveState() {
    const badge = $("creativeSaveState");
    const reset = $("reloadCreativeEditor");
    if (badge) {
      badge.textContent = creativeEditorDirty ? "Unsaved changes" : "Saved";
      badge.className = `creative-save-state ${creativeEditorDirty ? "dirty" : "saved"}`;
    }
    if (reset && reset.dataset.busy !== "true") reset.disabled = !creativeEditorDirty;
    phase6UpdatePreviewFreshness();
  }

  function phase6MarkDirty() {
    if (!activeCreativeOutputId) return;
    clearTimeout(creativeDirtyTimer);
    creativeDirtyTimer = setTimeout(() => {
      const current = phase6CreativeFingerprint();
      creativeEditorDirty = Boolean(current && creativeSavedFingerprint && current !== creativeSavedFingerprint);
      phase6UpdateSaveState();
    }, 100);
  }

  function phase6MarkSaved() {
    clearTimeout(creativeDirtyTimer);
    creativeSavedFingerprint = phase6CreativeFingerprint();
    creativeEditorDirty = false;
    phase6UpdateSaveState();
  }

  function phase6ConfirmDiscardUnsaved(action = "continue") {
    if (!creativeEditorDirty) return true;
    return window.confirm(`You have unsaved creative edits. Discard them and ${action}?`);
  }

  const PHASE6_PROGRESS_STAGE_ORDER = ["saved", "voice_prep", "rendering", "final_upload", "preview_ready"];
  const PHASE6_PROGRESS_STAGE_LABELS = {
    saved: "Saved",
    voice_prep: "Voice Prep",
    rendering: "Rendering",
    final_upload: "Final Upload",
    preview_ready: "Preview Ready",
  };

  function phase6ProgressIcon(status) {
    if (status === "complete") return "✓";
    if (status === "error") return "!";
    if (status === "active") return "•";
    return "";
  }

  function renderCreativeChangeProgress(handoff = null) {
    creativeHandoffStatus = handoff || null;
    const panel = $("creativeChangeProgress");
    const stepsTarget = $("creativeChangeProgressSteps");
    const title = $("creativeChangeProgressTitle");
    const state = $("creativeChangeProgressState");
    const detail = $("creativeChangeProgressDetail");
    if (!panel || !stepsTarget || !title || !state || !detail) return;

    const byKey = new Map((Array.isArray(handoff?.stages) ? handoff.stages : []).map((stage) => [stage.key, stage]));
    stepsTarget.innerHTML = PHASE6_PROGRESS_STAGE_ORDER.map((key) => {
      const stage = byKey.get(key) || { key, label: PHASE6_PROGRESS_STAGE_LABELS[key], status: "pending" };
      const status = stage.status || "pending";
      const errorText = stage.error ? `<div class="creative-change-stage-error">${escapeHtml(stage.error)}</div>` : "";
      return `<div class="creative-change-stage ${escapeHtml(status)}" data-stage="${escapeHtml(key)}">
        <div class="creative-change-stage-marker">${escapeHtml(phase6ProgressIcon(status))}</div>
        <div class="creative-change-stage-copy"><b>${escapeHtml(stage.label || PHASE6_PROGRESS_STAGE_LABELS[key])}</b><span>${escapeHtml(stage.detail || "Waiting")}</span>${errorText}</div>
      </div>`;
    }).join("");

    const overall = handoff?.overall_status || "idle";
    panel.dataset.status = overall;
    state.textContent = overall === "complete" ? "Complete" : overall === "error" ? "Needs attention" : overall === "active" ? "In progress" : "Idle";
    state.className = `creative-change-progress-state ${overall}`;
    title.textContent = handoff?.completed
      ? "Creative change is ready for review"
      : handoff?.error_stage
        ? `${handoff.current_stage_label || "Creative change"} needs attention`
        : handoff?.active
          ? `${handoff.current_stage_label || "Creative change"} in progress`
          : "No change request in progress";
    detail.textContent = handoff?.message || "Save and rerender the preview to begin a new revision.";
    phase6UpdatePreviewFreshness();
  }

  async function refreshCreativeChangeProgress({ updateMessage = false } = {}) {
    if (!activeCreativeOutputId) return null;
    const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative/handoff/status`, { timeoutMs: 25000 });
    const handoff = result?.handoff || null;
    renderCreativeChangeProgress(handoff);
    if (result?.output) activeCreativeOutput = { ...(activeCreativeOutput || {}), ...result.output };
    if (updateMessage && handoff?.message) {
      if (handoff.overall_status === "error") phase6Message(handoff.message, "error-text");
      else phase6Message("");
    }
    return handoff;
  }

  function setCreativeBusy(busy) {
    ["saveCreativeEditor", "creativeRequestChanges", "creativeApprovePreview", "reloadCreativeEditor"].forEach((id) => {
      const button = $(id);
      if (button) {
        button.disabled = Boolean(busy);
        button.dataset.busy = busy ? "true" : "false";
      }
    });
    if (!busy) phase6UpdateSaveState();
  }

  function phase6FormatPercent(value) {
    const n = Math.max(0, Math.min(125, Number(value) || 0));
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, "");
  }

  function updateCreativeAudioSummary() {
    const voice = Math.max(0, Math.min(125, Number($("creativeVoiceoverVolume")?.value || 100)));
    const normal = Math.max(0, Math.min(100, Number($("creativeMusicNormal")?.value || 0)));
    const ducked = Math.max(0, Math.min(100, Number($("creativeMusicDucked")?.value || 0)));
    const enabled = Boolean($("creativeDuckingEnabled")?.checked);
    $("creativeAudioSummary").textContent = enabled
      ? `VO ${phase6FormatPercent(voice)}% · music ${phase6FormatPercent(normal)}% · ${phase6FormatPercent(ducked)}% under narration`
      : `VO ${phase6FormatPercent(voice)}% · music ${phase6FormatPercent(normal)}% · ducking off`;
  }

  function syncCreativeAudioPair(sourceId, targetId) {
    const source = $(sourceId);
    const target = $(targetId);
    if (!source || !target) return;
    let n = Number(source.value);
    if (!Number.isFinite(n)) n = 0;
    const maxValue = sourceId.includes("VoiceoverVolume") ? 125 : 100;
    n = Math.max(0, Math.min(maxValue, Math.round(n * 10) / 10));
    source.value = phase6FormatPercent(n);
    target.value = phase6FormatPercent(n);
    updateCreativeAudioSummary();
  }


  const PHASE6_CONTROL_HELP = {
    creativeStyleStrategy: "Controls how visual styles are chosen across the sequence: let AI vary them naturally, keep one campaign look, or manage each slide manually.",
    creativeDefaultDuration: "Default requested slide duration in seconds. A slide can override this. If narration plus the voiceover tail is longer, the render may extend the slide so speech is not cut off.",
    creativeDefaultMotion: "Default image movement for slides that do not override it, such as slow zoom or pan.",
    creativeDefaultTransition: "Default visual transition used between slides unless a slide specifies a different transition.",
    creativeDefaultTransitionFrames: "Default transition length in video frames. At 30 fps, 12 frames is about 0.4 seconds.",
    creativeDefaultVoice: "Default ElevenLabs voice used when narration is generated or regenerated for a slide that does not choose its own voice. The saved voice ID is the generation authority.",
    creativeDefaultVoicePreview: "Plays the ElevenLabs sample for the currently selected default voice. This does not change or regenerate your content.",
    creativeVoiceoverTail: "Extra visual time after narration finishes before the slide ends. This prevents the cut from landing immediately on the last spoken word.",
    creativeVariantPolicy: "Controls whether Studio prefers exact pre-sized image variants or may use the source image with crop/fill when an exact variant is not prepared.",
    creativeOpeningTreatment: "Controls how the first slide is treated: automatic choice, title card, plain image, or no text.",
    creativeClosingTreatment: "Controls how the last slide is treated: automatic choice, end card, plain image, or no text.",
    creativeVoiceoverVolumeRange: "Global narration level for the sequence. 100% is the proven level used before this control was added. Individual slides can override it.",
    creativeVoiceoverVolume: "Global narration level for the sequence. 100% is the proven level used before this control was added. Individual slides can override it.",
    creativeMusicNormalRange: "Background-music level when narration is not playing.",
    creativeMusicNormal: "Background-music level when narration is not playing.",
    creativeMusicDuckedRange: "Background-music level while narration is playing. This should normally be lower than the normal music level.",
    creativeMusicDucked: "Background-music level while narration is playing. This should normally be lower than the normal music level.",
    creativeDuckingEnabled: "When enabled, music automatically moves from the normal level to the narration level while voiceover is active.",
    creativeDuckFadeFrames: "How quickly music ramps between normal and ducked levels. At 30 fps, 6 frames is about 0.2 seconds.",
    creativeReviewNotes: "Notes for this review cycle. Use this to record what should change or why the current preview is being accepted.",
    reloadCreativeEditor: "Discard unsaved edits and reload the latest saved values from Studio.",
    creativeRequestChanges: "Save the current controls and create a new rendered preview. Publishing stays locked.",
    saveCreativeEditor: "Save these edits as a draft without creating a new rendered preview.",
    creativeApprovePreview: "Approve the current preview. This records review approval only and does not publish the output.",
    closeCreativeEditor: "Close the creative editor. Unsaved changes are not preserved.",
  };

  const PHASE6_SLIDE_HELP = {
    include: "Include or exclude this slide from the rendered sequence without deleting the slide record.",
    duration_seconds: "Requested slide duration in seconds. If narration plus the configured voiceover tail is longer, the effective render duration can extend so narration is not cut off.",
    focal_point: "Sets the visual anchor used when the source image must be cropped to the target aspect ratio.",
    fit_mode: "Controls how the source image fills the target frame. Fill/crop covers the frame and may crop edges; other modes preserve more of the source.",
    safe_area_aware: "Shows and honors the platform-safe area so important text and composition stay away from edges and common app UI overlays.",
    overlay_enabled: "Turn the text treatment for this slide on or off.",
    overlay_style: "Selects the visual text preset, such as Chicago Editorial, Glass Card, or Black Gold Arched.",
    overlay_role: "Describes the purpose of the text treatment, such as title card, callout, or end card, so the renderer can apply the appropriate treatment.",
    overlay_position: "Controls where the text treatment is positioned within the safe area.",
    overlay_text: "The main on-screen text for this slide. This is separate from the spoken narration script.",
    overlay_size: "Text size used for the primary overlay treatment on this slide.",
    voiceover_enabled: "Turn narration for this slide on or off.",
    voiceover_voice: "ElevenLabs voice to use when this slide narration is generated or regenerated. Studio saves the underlying voice ID, so names can change without breaking generation.",
    voiceover_voice_preview: "Plays the ElevenLabs sample for this slide selected voice without changing the saved narration.",
    voiceover_volume_override: "Optional narration-volume override for this slide. Leave blank to use the global voiceover volume above. 100% matches the original proven level.",
    voiceover_text: "The narration script spoken for this slide. Editing the script can require a regenerated voiceover before the next render.",
    motion_type: "Image movement during this slide, such as a slow zoom or pan.",
    transition_type: "Visual transition from this slide into the next slide.",
    transition_frames: "Length of this slide's transition in frames. At 30 fps, 12 frames is about 0.4 seconds.",
  };

  const PHASE6_BUTTON_HELP = {
    "Open editor": "Open the Phase 6 creative review editor for this output.",
    "Not editable here": "This output does not currently have a photo/slide package available in the creative editor.",
  };

  let phase6TooltipPopover = null;
  let phase6TooltipActive = null;

  function phase6TooltipElement() {
    if (phase6TooltipPopover) return phase6TooltipPopover;
    const tip = document.createElement("div");
    tip.className = "phase6-tooltip-popover";
    tip.id = "phase6ControlTooltip";
    tip.setAttribute("role", "tooltip");
    tip.setAttribute("aria-hidden", "true");
    document.body.appendChild(tip);
    phase6TooltipPopover = tip;
    return tip;
  }

  function phase6HideTooltip() {
    if (!phase6TooltipPopover) return;
    phase6TooltipPopover.classList.remove("visible", "above");
    phase6TooltipPopover.setAttribute("aria-hidden", "true");
    if (phase6TooltipActive) phase6TooltipActive.removeAttribute("aria-describedby");
    phase6TooltipActive = null;
  }

  function phase6ShowTooltip(target, text) {
    if (!target || !text) return;
    const tip = phase6TooltipElement();
    phase6TooltipActive = target;
    tip.textContent = text;
    tip.classList.remove("above");
    tip.classList.add("visible");
    tip.setAttribute("aria-hidden", "false");
    target.setAttribute("aria-describedby", tip.id);
    const r = target.getBoundingClientRect();
    const margin = 10;
    const width = Math.min(330, window.innerWidth - 24);
    tip.style.width = `${width}px`;
    tip.style.left = "12px";
    tip.style.top = "12px";
    const tr = tip.getBoundingClientRect();
    let left = r.left + Math.min(r.width / 2, 22) - 20;
    left = Math.max(10, Math.min(left, window.innerWidth - tr.width - 10));
    let top = r.bottom + 8;
    let above = false;
    if (top + tr.height > window.innerHeight - 10 && r.top - tr.height - 8 >= 10) {
      top = r.top - tr.height - 8;
      above = true;
    }
    tip.style.left = `${left}px`;
    tip.style.top = `${Math.max(10, top)}px`;
    tip.style.setProperty("--tip-arrow-left", `${Math.max(12, Math.min(tr.width - 16, r.left + r.width / 2 - left - 4))}px`);
    tip.classList.toggle("above", above);
  }

  function phase6BindTooltipTarget(target, text) {
    if (!target || !text || target.dataset.phase6TooltipBound === "1") return;
    target.dataset.phase6TooltipBound = "1";
    target.dataset.phase6Tooltip = text;
    target.classList.add("phase6-tooltip-target");
    if (!target.getAttribute("title")) target.setAttribute("title", text);
    target.addEventListener("mouseenter", () => phase6ShowTooltip(target, text));
    target.addEventListener("mouseleave", phase6HideTooltip);
    target.addEventListener("focus", () => phase6ShowTooltip(target, text));
    target.addEventListener("blur", phase6HideTooltip);
  }

  function phase6AttachHelpDot(label, text) {
    if (!label || !text || label.dataset.phase6HelpDecorated === "1") return;
    label.dataset.phase6HelpDecorated = "1";
    const labelSpan = label.querySelector(":scope > span") || label.querySelector("span");
    if (!labelSpan) return;
    labelSpan.classList.add("control-label-with-help");
    const dot = document.createElement("span");
    dot.className = "control-help-dot";
    dot.textContent = "?";
    dot.tabIndex = 0;
    dot.setAttribute("role", "button");
    dot.setAttribute("aria-label", `Help: ${labelSpan.textContent.trim()}`);
    dot.addEventListener("click", (e) => { e.preventDefault(); e.stopPropagation(); phase6ShowTooltip(dot, text); });
    labelSpan.appendChild(dot);
    phase6BindTooltipTarget(dot, text);
  }

  function phase6DecorateTooltips(root = document) {
    const scope = root || document;
    scope.querySelectorAll?.("input, select, textarea").forEach((control) => {
      if (!control.closest("#creativeEditorPanel")) return;
      const text = PHASE6_CONTROL_HELP[control.id] || PHASE6_SLIDE_HELP[control.dataset.field];
      if (!text) return;
      phase6AttachHelpDot(control.closest("label"), text);
    });
    scope.querySelectorAll?.("button").forEach((button) => {
      if (!button.closest("#creativeEditorPanel")) return;
      const text = PHASE6_CONTROL_HELP[button.id] || PHASE6_BUTTON_HELP[button.textContent.trim()];
      if (text) phase6BindTooltipTarget(button, text);
    });
    scope.querySelectorAll?.(".slide-drag-handle").forEach((handle) => phase6BindTooltipTarget(handle, "Drag this slide to change its order in the rendered sequence."));
    scope.querySelectorAll?.(".variant-chip").forEach((chip) => phase6BindTooltipTarget(chip, "Shows whether this slide has an exact pre-sized image for the ratio. Source/crop or source-ready means Studio can still render it from the original image."));
    scope.querySelectorAll?.(".ratio-summary-item").forEach((tile) => phase6BindTooltipTarget(tile, "Ratio readiness shows whether the output can render at this aspect ratio. An exact variant is optional; source + fill/crop means Studio will render from the source image and crop as needed."));
    scope.querySelectorAll?.("[data-creative-output-id]").forEach((button) => {
      const text = PHASE6_BUTTON_HELP[button.textContent.trim()] || "Open the Phase 6 creative review editor for this output.";
      phase6BindTooltipTarget(button, text);
    });
  }

  function renderCreativeOutputMeta(output) {
    const target = $("creativeOutputMeta");
    target.innerHTML = [
      ["Platform", output.platform || "—"],
      ["Output type", output.platform_output_type || output.format || "—"],
      ["Ratio", output.aspect_ratio || "—"],
      ["Render", output.render_status || "—"],
      ["Review", output.review_status || "—"],
      ["Publish safety", output.do_not_publish ? "Do Not Publish" : "Publishing enabled"],
    ].map(([label, v]) => `<div><span>${escapeHtml(label)}</span><b>${escapeHtml(v)}</b></div>`).join("");
  }

  function renderCreativeRatioPanel() {
    const target = $("creativeRatioPanel");
    if (!activeCreativeOutput) return target.innerHTML = "";
    const targetRatio = String(activeCreativeOutput.aspect_ratio || "");
    const canvases = creativeOptions.ratio_canvases || { "9:16": "1080x1920", "4:5": "1080x1350", "1:1": "1080x1080", "16:9": "1920x1080" };
    const ratios = ["9:16", "4:5", "1:1", "16:9"];
    const total = creativeSlides.length;
    target.innerHTML = `<div class="creative-ratio-summary">${ratios.map((ratio) => {
      const exact = creativeSlides.filter((slide) => Boolean(slide.variants?.[ratio])).length;
      const current = ratio === targetRatio;
      let status = "Renderable from source if targeted";
      if (!total) status = "No linked slides";
      else if (current && exact === total) status = `${exact}/${total} exact variants ready · others use source`;
      else if (current) status = `${total}/${total} renderable · source + fill/crop`;
      else if (exact > 0) status = `${exact}/${total} exact variants ready · others use source`;
      return `<div class="ratio-summary-item ${current ? "active" : ""}"><span>${escapeHtml(ratio)}${current ? " · target" : ""}</span><b>${escapeHtml(canvases[ratio] || "")}</b><small>${escapeHtml(status)}</small></div>`;
    }).join("")}</div>`;
    phase6DecorateTooltips(target);
  }

  function renderCreativeSlides() {
    const target = $("creativeSlidesList");
    $("creativeSlideCount").textContent = `${creativeSlides.length} slide${creativeSlides.length === 1 ? "" : "s"}`;
    if (!creativeSlides.length) {
      target.innerHTML = '<div class="creative-no-slides">This output does not currently have linked Carousel Slides. Audio and shared creative settings can still be reviewed, but there are no per-slide controls to edit.</div>';
      renderCreativeRatioPanel();
      return;
    }

    const targetRatio = String(activeCreativeOutput?.aspect_ratio || "4:5");
    const styles = creativeOptions.style_presets || [];
    const roles = creativeOptions.text_roles || [];
    const positions = creativeOptions.positions || [];
    const focalPoints = creativeOptions.focal_points || [];
    const fits = creativeOptions.fit_modes || [];
    const motions = creativeOptions.motions || [];
    const transitions = creativeOptions.transitions || [];
    const voices = phase6NormalizeVoices(creativeOptions.voices || []);

    target.innerHTML = creativeSlides.map((slide, index) => {
      const overlay = slide.overlay || {};
      const voiceover = slide.voiceover || {};
      const variants = slide.variants || {};
      const preview = slide.preview_url;
      const variantChips = ["4:5", "9:16", "1:1", "16:9"].map((ratio) => {
        const exact = Boolean(variants[ratio]);
        const current = ratio === targetRatio;
        const label = current ? (exact ? `${ratio} target · exact` : `${ratio} target · source/crop`) : (exact ? `${ratio} exact` : `${ratio} source-ready`);
        return `<span class="variant-chip ${exact ? "ready" : ""} ${current ? "target" : ""}">${escapeHtml(label)}</span>`;
      }).join("");
      const previewHtml = preview
        ? `<img src="${escapeHtml(preview)}" alt="${escapeHtml(slide.name || `Slide ${index + 1}`)}">`
        : '<div class="slide-preview-placeholder">No preview image available</div>';
      const tiktokProof = targetRatio === "9:16" && slide.tiktok_safe_zone_status
        ? `<div class="subtle">TikTok safe zone: ${escapeHtml(slide.tiktok_safe_zone_status)}</div>` : "";

      const collapsed = creativeSlideCollapsed.has(slide.id);
      const slideSummary = `${Number(slide.duration_seconds ?? 4).toFixed(1)}s · ${overlay.style_preset || "No style"} · ${voiceover.enabled === false ? "No voiceover" : (voiceover.voice || "Voiceover")}`;
      return `<article class="creative-slide-card ${slide.include === false ? "excluded" : ""} ${collapsed ? "collapsed" : ""}" draggable="true" data-slide-id="${escapeHtml(slide.id)}">
        <div class="creative-slide-header">
          <div class="creative-slide-title-wrap"><span class="slide-drag-handle" title="Drag to reorder">⋮⋮</span><div><div class="creative-slide-title">${escapeHtml(slide.name || `Slide ${index + 1}`)}</div><div class="creative-slide-subtitle">Order ${index + 1}${slide.is_cover ? " · Cover" : ""}${slide.review_status ? ` · ${escapeHtml(slide.review_status)}` : ""} · ${escapeHtml(slideSummary)}</div></div></div>
          <div class="creative-slide-header-actions"><button type="button" class="slide-collapse-button" aria-expanded="${collapsed ? "false" : "true"}">${collapsed ? "Expand" : "Collapse"}</button><label class="slide-include-control"><input type="checkbox" data-field="include" ${slide.include !== false ? "checked" : ""}> Include</label></div>
        </div>
        <div class="creative-slide-body">
          <div class="creative-slide-visual">
            <div class="slide-preview-canvas ${phase6RatioClass(targetRatio)}">${previewHtml}<div class="safe-zone-overlay ${slide.safe_area_aware !== false ? "on" : ""}"></div></div>
            <div class="variant-chips">${variantChips}</div>${tiktokProof}
          </div>
          <div class="creative-slide-controls">
            <div class="slide-control-section">
              <div class="slide-control-section-title">Timing & framing</div>
              <div class="slide-control-row">
                <label class="form-field"><span>Duration (sec)</span><input data-field="duration_seconds" type="number" min="0.5" max="60" step="0.1" value="${escapeHtml(slide.duration_seconds ?? 4)}"></label>
                <label class="form-field"><span>Focal point</span><select data-field="focal_point">${phase6OptionList(focalPoints, slide.focal_point || "center")}</select></label>
                <label class="form-field"><span>Fit mode</span><select data-field="fit_mode">${phase6OptionList(fits, slide.fit_mode || "fill_crop", { label: phase6FitLabel })}</select></label>
                <label class="toggle-control"><input data-field="safe_area_aware" type="checkbox" ${slide.safe_area_aware !== false ? "checked" : ""}><span>Show / honor safe area</span></label>
              </div>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">Text overlay</div>
              <div class="slide-control-row">
                <label class="toggle-control"><input data-field="overlay_enabled" type="checkbox" ${overlay.enabled !== false ? "checked" : ""}><span>Text on this slide</span></label>
                <label class="form-field"><span>Style</span><select data-field="overlay_style">${phase6OptionList(styles, overlay.style_preset || "Chicago Editorial")}</select></label>
                <label class="form-field"><span>Role</span><select data-field="overlay_role">${phase6OptionList(roles, overlay.role || "overlay")}</select></label>
                <label class="form-field"><span>Placement</span><select data-field="overlay_position">${phase6OptionList(positions, overlay.position || "center")}</select></label>
              </div>
              <div class="slide-control-row two">
                <label class="form-field"><span>Overlay text</span><textarea class="slide-overlay-text" data-field="overlay_text">${escapeHtml(overlay.text || "")}</textarea></label>
                <label class="form-field"><span>Text size</span><input data-field="overlay_size" type="number" min="20" max="140" step="1" value="${escapeHtml(overlay.size ?? 64)}"></label>
              </div>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">Voiceover</div>
              <div class="slide-control-row">
                <label class="toggle-control"><input data-field="voiceover_enabled" type="checkbox" ${voiceover.enabled !== false ? "checked" : ""}><span>Voiceover on</span></label>
                <div class="voice-select-wrap"><label class="form-field"><span>Voice</span><select data-field="voiceover_voice">${phase6VoiceOptionList(voices, voiceover.voice_id || "", voiceover.voice || "Kate")}</select></label><button type="button" class="voice-preview-button" data-field="voiceover_voice_preview">▶ Preview</button></div>
                <label class="form-field"><span>VO volume override (%)</span><input data-field="voiceover_volume_override" type="number" min="0" max="125" step="1" value="${voiceover.volume_override === null || voiceover.volume_override === undefined ? "" : escapeHtml(phase6FormatPercent(Number(voiceover.volume_override) * 100))}" placeholder="Global ${escapeHtml(phase6FormatPercent(Number(activeCreativeOutput?.voiceover?.volume ?? 1) * 100))}%"></label>
                <div class="form-field"><span>Current audio</span><div class="subtle">${escapeHtml(voiceover.status || "—")}${voiceover.duration_seconds ? ` · ${Number(voiceover.duration_seconds).toFixed(1)}s` : ""} · ${escapeHtml(phase6FormatPercent(Number(voiceover.volume ?? activeCreativeOutput?.voiceover?.volume ?? 1) * 100))}%</div></div>
              </div>
              <label class="form-field"><span>Narration text</span><textarea class="voiceover-text" data-field="voiceover_text">${escapeHtml(voiceover.text || "")}</textarea></label>
            </div>
            <div class="slide-control-section">
              <div class="slide-control-section-title">Motion & transition</div>
              <div class="slide-control-row three">
                <label class="form-field"><span>Motion</span><select data-field="motion_type">${phase6OptionList(motions, slide.motion?.type || "none", { label: phase6MotionLabel })}</select></label>
                <label class="form-field"><span>Transition</span><select data-field="transition_type">${phase6OptionList(transitions, slide.transition?.type || "fade", { label: phase6TransitionLabel })}</select></label>
                <label class="form-field"><span>Transition frames</span><input data-field="transition_frames" type="number" min="0" max="90" step="1" value="${escapeHtml(slide.transition?.duration_frames ?? 12)}"></label>
              </div>
            </div>
          </div>
        </div>
      </article>`;
    }).join("");
    phase6DecorateTooltips(target);
    target.querySelectorAll('[data-field="voiceover_voice_preview"]').forEach((button) => {
      button.addEventListener("click", () => {
        const card = button.closest(".creative-slide-card");
        phase6PreviewSelectedVoice(card?.querySelector('[data-field="voiceover_voice"]'), button);
      });
    });

    let draggedId = null;
    target.querySelectorAll(".creative-slide-card").forEach((card) => {
      card.querySelector(".slide-collapse-button")?.addEventListener("click", () => {
        const id = card.dataset.slideId;
        if (creativeSlideCollapsed.has(id)) creativeSlideCollapsed.delete(id);
        else creativeSlideCollapsed.add(id);
        card.classList.toggle("collapsed", creativeSlideCollapsed.has(id));
        const button = card.querySelector(".slide-collapse-button");
        if (button) {
          const isCollapsed = creativeSlideCollapsed.has(id);
          button.textContent = isCollapsed ? "Expand" : "Collapse";
          button.setAttribute("aria-expanded", isCollapsed ? "false" : "true");
        }
      });
      card.addEventListener("dragstart", () => {
        syncCreativeSlidesFromDom();
        draggedId = card.dataset.slideId;
        card.classList.add("dragging");
      });
      card.addEventListener("dragend", () => {
        card.classList.remove("dragging");
        target.querySelectorAll(".creative-slide-card").forEach((c) => c.classList.remove("drag-over"));
        draggedId = null;
      });
      card.addEventListener("dragover", (event) => { event.preventDefault(); card.classList.add("drag-over"); });
      card.addEventListener("dragleave", () => card.classList.remove("drag-over"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.classList.remove("drag-over");
        const dropId = card.dataset.slideId;
        if (!draggedId || draggedId === dropId) return;
        const from = creativeSlides.findIndex((s) => s.id === draggedId);
        const to = creativeSlides.findIndex((s) => s.id === dropId);
        if (from < 0 || to < 0) return;
        const [moved] = creativeSlides.splice(from, 1);
        creativeSlides.splice(to, 0, moved);
        creativeSlides.forEach((s, i) => { s.order = i + 1; });
        renderCreativeSlides();
        phase6MarkDirty();
      });
      card.querySelector('[data-field="include"]')?.addEventListener("change", (event) => card.classList.toggle("excluded", !event.target.checked));
      card.querySelector('[data-field="safe_area_aware"]')?.addEventListener("change", (event) => card.querySelector(".safe-zone-overlay")?.classList.toggle("on", event.target.checked));
      card.querySelector('[data-field="overlay_style"]')?.addEventListener("change", (event) => {
        if (event.target.value === "No Text") card.querySelector('[data-field="overlay_enabled"]').checked = false;
      });
    });
    renderCreativeRatioPanel();
  }

  function syncCreativeSlidesFromDom() {
    const list = $("creativeSlidesList");
    if (!list) return creativeSlides;
    const byId = new Map(creativeSlides.map((s) => [s.id, s]));
    const collected = [];
    list.querySelectorAll(".creative-slide-card").forEach((card, index) => {
      const base = byId.get(card.dataset.slideId) || { id: card.dataset.slideId };
      const get = (field) => card.querySelector(`[data-field="${field}"]`);
      collected.push({
        ...base,
        order: index + 1,
        include: Boolean(get("include")?.checked),
        duration_seconds: Number(get("duration_seconds")?.value || 4),
        focal_point: get("focal_point")?.value || "center",
        fit_mode: get("fit_mode")?.value || "fill_crop",
        safe_area_aware: Boolean(get("safe_area_aware")?.checked),
        overlay: {
          ...(base.overlay || {}),
          enabled: Boolean(get("overlay_enabled")?.checked),
          text: get("overlay_text")?.value || "",
          style_preset: get("overlay_style")?.value || "Chicago Editorial",
          role: get("overlay_role")?.value || "overlay",
          position: get("overlay_position")?.value || "center",
          size: Number(get("overlay_size")?.value || 64),
        },
        voiceover: {
          ...(base.voiceover || {}),
          enabled: Boolean(get("voiceover_enabled")?.checked),
          text: get("voiceover_text")?.value || "",
          voice_id: phase6SelectedVoice(get("voiceover_voice")).id || base.voiceover?.voice_id || "",
          voice: phase6SelectedVoice(get("voiceover_voice")).name || base.voiceover?.voice || "Kate",
          volume_override: (() => {
            const raw = get("voiceover_volume_override")?.value;
            if (raw === undefined || raw === null || String(raw).trim() === "") return null;
            return Math.max(0, Math.min(1.25, Number(raw) / 100));
          })(),
        },
        motion: { ...(base.motion || {}), type: get("motion_type")?.value || "none" },
        transition: {
          ...(base.transition || {}),
          type: get("transition_type")?.value || "fade",
          duration_frames: Number(get("transition_frames")?.value || 12),
        },
      });
    });
    creativeSlides = collected;
    return creativeSlides;
  }

  function populateCreativeGlobalControls(output) {
    const settings = output.creative_settings || {};
    const manifest = output.creative_manifest || {};
    const manifestPolish = manifest.visualPolish || {};
    const inferredStrategy = manifestPolish.styleMode === "mixed_per_slide" ? "AI vary naturally" : "Manual per slide";
    $("creativeStyleStrategy").value = settings.style_strategy || inferredStrategy;
    $("creativeDefaultDuration").value = settings.default_slide_duration_seconds ?? creativeSlides[0]?.duration_seconds ?? 4;
    $("creativeDefaultTransitionFrames").value = settings.default_transition_frames ?? manifest.transitionFrames ?? 12;
    $("creativeVoiceoverTail").value = output.voiceover_tail_seconds ?? manifest.voiceoverTailSeconds ?? 2;
    $("creativeVariantPolicy").value = settings.variant_policy || "Prefer exact prepared variant";
    $("creativeOpeningTreatment").value = settings.opening_treatment || "Auto";
    $("creativeClosingTreatment").value = settings.closing_treatment || "Auto";

    const defaultMotion = settings.default_motion || creativeSlides[0]?.motion?.type || "none";
    const defaultTransition = settings.default_transition || creativeSlides[0]?.transition?.type || "fade";
    const firstVoiceSlide = creativeSlides.find((s) => s.voiceover?.voice_id || s.voiceover?.voice);
    const defaultVoiceId = settings.default_voice_id || firstVoiceSlide?.voiceover?.voice_id || creativeOptions.default_voice_id || "xVQH621DS3eyBYrseRt5";
    const defaultVoiceName = settings.default_voice || firstVoiceSlide?.voiceover?.voice || "Kate";
    $("creativeDefaultMotion").innerHTML = phase6OptionList(creativeOptions.motions || [], defaultMotion, { label: phase6MotionLabel });
    $("creativeDefaultTransition").innerHTML = phase6OptionList(creativeOptions.transitions || [], defaultTransition, { label: phase6TransitionLabel });
    $("creativeDefaultVoice").innerHTML = phase6VoiceOptionList(creativeOptions.voices || [], defaultVoiceId, defaultVoiceName);
    const voiceNote = creativeOptions.voice_catalog_live
      ? `${phase6NormalizeVoices(creativeOptions.voices || []).length} ElevenLabs voices available from your account.`
      : (creativeOptions.voice_catalog_configured ? "Live ElevenLabs lookup failed; Studio is using its cached voices." : "Add the ELEVENLABS_API_KEY Worker secret to load the full ElevenLabs account voice catalog.");
    $("creativeDefaultVoice").closest(".voice-select-wrap")?.querySelector(".voice-catalog-note")?.remove();
    $("creativeDefaultVoice").closest(".voice-select-wrap")?.insertAdjacentHTML("beforeend", `<div class="voice-catalog-note">${escapeHtml(voiceNote)}</div>`);

    const voiceover = Math.max(0, Math.min(125, Number(output.voiceover?.volume ?? 1) * 100));
    const normal = phase6Percent(output.music?.normal_volume, 24);
    const ducked = phase6Percent(output.music?.ducked_volume, 8);
    $("creativeVoiceoverVolume").value = phase6FormatPercent(voiceover);
    $("creativeVoiceoverVolumeRange").value = phase6FormatPercent(voiceover);
    $("creativeMusicNormal").value = normal;
    $("creativeMusicNormalRange").value = normal;
    $("creativeMusicDucked").value = ducked;
    $("creativeMusicDuckedRange").value = ducked;
    $("creativeDuckingEnabled").checked = output.music?.ducking_enabled !== false;
    $("creativeDuckFadeFrames").value = output.music?.duck_fade_frames ?? 6;
    $("creativeReviewNotes").value = output.review_notes || "";
    updateCreativeAudioSummary();
  }

  function phase6DriveFileId(value) {
    const text = String(value || "").trim();
    if (!text) return null;
    const direct = text.match(/\/d\/([^/?#]+)/);
    if (direct?.[1]) return direct[1];
    try {
      const url = new URL(text, window.location.origin);
      return url.searchParams.get("id") || null;
    } catch {
      return null;
    }
  }

  function phase6DriveEmbedUrl(fileId) {
    return fileId ? `https://drive.google.com/file/d/${encodeURIComponent(fileId)}/preview` : "";
  }

  function showCreativeRenderedPreview(output) {
    const video = $("creativeRenderPreview");
    const drive = $("creativeRenderPreviewDrive");
    const empty = $("creativeRenderPreviewEmpty");
    if (!video || !drive || !empty) return;

    video.pause();
    video.onerror = null;
    video.onloadedmetadata = null;
    video.removeAttribute("src");
    drive.removeAttribute("src");
    video.hidden = true;
    drive.hidden = true;

    const fileId = output.final_file_id || phase6DriveFileId(output.final_file_url) || phase6DriveFileId(output.output_url);
    if (!fileId && !output.final_file_url) {
      empty.hidden = false;
      return;
    }

    empty.hidden = true;
    const fallbackToDrive = () => {
      const embed = phase6DriveEmbedUrl(fileId);
      if (!embed) {
        empty.textContent = "Rendered file exists, but no playable preview source is available.";
        empty.hidden = false;
        video.hidden = true;
        return;
      }
      video.pause();
      video.removeAttribute("src");
      video.hidden = true;
      drive.src = embed;
      drive.hidden = false;
    };

    if (output.id) {
      video.src = `/api/outputs/${encodeURIComponent(output.id)}/preview`;
      video.hidden = false;
      video.onerror = fallbackToDrive;
      video.onloadedmetadata = () => {
        drive.removeAttribute("src");
        drive.hidden = true;
        video.hidden = false;
      };
      video.load();
      return;
    }

    fallbackToDrive();
  }

  function populateCreativeEditor(data) {
    activeCreativeOutput = data.output || null;
    creativeSlides = Array.isArray(data.slides) ? data.slides : [];
    creativeOptions = data.options || {};
    const output = activeCreativeOutput || {};
    $("creativeEditorTitle").textContent = `Output ${output.output_id ?? ""} · ${output.platform || "Creative review"}`;
    $("creativeEditorSubtitle").textContent = `${output.platform_output_type || output.format || "Photo sequence"}${output.aspect_ratio ? ` · ${output.aspect_ratio}` : ""} · creative review`;
    $("creativeSafetyBadge").textContent = output.do_not_publish ? "Publishing locked" : "Editing locked";
    $("creativeSafetyBadge").className = `badge ${output.do_not_publish ? "ready-for-review" : "failed"}`;
    $("creativeSafetyBanner").innerHTML = output.do_not_publish
      ? '<strong>Review mode.</strong> Edit, save, rerender, and approve the preview here. Publishing stays locked until the later publishing step.'
      : '<strong>Creative editing locked.</strong> This output is not currently in a safe review-only state.';

    showCreativeRenderedPreview(output);
    renderCreativeOutputMeta(output);
    populateCreativeGlobalControls(output);
    renderCreativeSlides();
    renderCreativeChangeProgress(data.handoff || creativeHandoffStatus);
    if (!data.handoff && !creativeHandoffStatus) phase6Message("");
    $("creativeEditorPanel").hidden = false;
    $("creativeEditorPanel").scrollIntoView({ behavior: "smooth", block: "start" });
    setCreativeBusy(false);
    $("saveCreativeEditor").disabled = !output.do_not_publish;
    $("creativeRequestChanges").disabled = !output.do_not_publish;
    $("creativeApprovePreview").disabled = !output.do_not_publish;
    requestAnimationFrame(() => phase6MarkSaved());
  }

  async function openCreativeEditor(recordId) {
    if (activeCreativeOutputId && activeCreativeOutputId !== recordId && !phase6ConfirmDiscardUnsaved("open another output")) return;
    if (activeCreativeOutputId !== recordId) creativeSlideCollapsed.clear();
    activeCreativeOutputId = recordId;
    $("creativeEditorPanel").hidden = false;
    $("creativeEditorTitle").textContent = "Loading creative review…";
    $("creativeSlidesList").innerHTML = '<div class="empty">Loading creative directives…</div>';
    phase6Message("Loading saved creative values…");
    setCreativeBusy(true);
    try {
      const data = await api(`/api/outputs/${encodeURIComponent(recordId)}/creative`);
      populateCreativeEditor(data);
      const handoff = data?.handoff || await refreshCreativeChangeProgress();
      const resumable = Boolean(handoff?.active && !handoff?.completed && handoff?.overall_status !== "error");
      if (resumable && data?.output?.do_not_publish) {
        continueCreativeHandoff({ handoff_state: handoff?.handoff_state || "render_prep_needed", handoff, message: handoff?.message || "Resuming the automatic voice/render handoff…" })
          .catch((e) => phase6Message(e.message, "error-text"));
      } else if (handoff?.message) {
        if (handoff.overall_status === "error") phase6Message(handoff.message, "error-text");
        else phase6Message("");
      }
    } catch (e) {
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
    }
  }

  function collectCreativePayload() {
    const slides = syncCreativeSlidesFromDom().map((slide, index) => ({
      id: slide.id,
      order: index + 1,
      include: slide.include !== false,
      duration_seconds: Number(slide.duration_seconds || 4),
      focal_point: slide.focal_point || "center",
      fit_mode: slide.fit_mode || "fill_crop",
      safe_area_aware: slide.safe_area_aware !== false,
      overlay: {
        enabled: slide.overlay?.enabled !== false,
        text: slide.overlay?.text || "",
        style_preset: slide.overlay?.style_preset || "Chicago Editorial",
        role: slide.overlay?.role || "overlay",
        position: slide.overlay?.position || "center",
        size: Number(slide.overlay?.size || 64),
      },
      voiceover: {
        enabled: slide.voiceover?.enabled !== false,
        text: slide.voiceover?.text || "",
        voice_id: slide.voiceover?.voice_id || "",
        voice: slide.voiceover?.voice || "Kate",
        volume_override: slide.voiceover?.volume_override ?? null,
      },
      motion: { type: slide.motion?.type || "none" },
      transition: { type: slide.transition?.type || "fade", duration_frames: Number(slide.transition?.duration_frames ?? 12) },
    }));

    const normalPct = Math.max(0, Math.min(100, phase6NumberFromInput("creativeMusicNormal", 24)));
    const duckedPct = Math.max(0, Math.min(100, phase6NumberFromInput("creativeMusicDucked", 8)));
    const duckingEnabled = Boolean($("creativeDuckingEnabled").checked);
    if (duckingEnabled && duckedPct > normalPct) throw new Error("Music during narration cannot be louder than normal music while ducking is enabled.");

    return {
      audio: {
        voiceover_volume: Math.max(0, Math.min(125, phase6NumberFromInput("creativeVoiceoverVolume", 100))) / 100,
        normal_volume: normalPct / 100,
        ducked_volume: duckedPct / 100,
        ducking_enabled: duckingEnabled,
        duck_fade_frames: Math.round(phase6NumberFromInput("creativeDuckFadeFrames", 6)),
      },
      voiceover_tail_seconds: phase6NumberFromInput("creativeVoiceoverTail", 2),
      review_notes: $("creativeReviewNotes").value || "",
      creative_settings: {
        style_strategy: $("creativeStyleStrategy").value,
        default_slide_duration_seconds: phase6NumberFromInput("creativeDefaultDuration", 4),
        default_motion: $("creativeDefaultMotion").value,
        default_transition: $("creativeDefaultTransition").value,
        default_transition_frames: Math.round(phase6NumberFromInput("creativeDefaultTransitionFrames", 12)),
        default_voice_id: phase6SelectedVoice($("creativeDefaultVoice")).id,
        default_voice: phase6SelectedVoice($("creativeDefaultVoice")).name || "Kate",
        variant_policy: $("creativeVariantPolicy").value,
        opening_treatment: $("creativeOpeningTreatment").value,
        closing_treatment: $("creativeClosingTreatment").value,
      },
      slides,
    };
  }

  async function saveActiveCreative({ quiet = false } = {}) {
    if (!activeCreativeOutputId) throw new Error("Open an output before saving creative settings.");
    const payload = collectCreativePayload();
    setCreativeBusy(true);
    if (!quiet) phase6Message("Saving creative changes…");
    try {
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      activeCreativeOutput = result.record || activeCreativeOutput;
      creativeSlides = Array.isArray(result.slides) ? result.slides : creativeSlides;
      if (!quiet) {
        populateCreativeEditor({ output: activeCreativeOutput, slides: creativeSlides, options: creativeOptions, handoff: creativeHandoffStatus });
        phase6Message("Draft saved. The rendered preview is unchanged until you choose Save & rerender preview.", "success");
        refreshCreativeChangeProgress().catch(() => {});
      } else {
        setCreativeBusy(false);
      }
      return result;
    } catch (e) {
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
      throw e;
    }
  }

  function phase6HandoffNeedsContinuation(state) {
    return ["voice_prep_running", "render_prep_needed", "render_ready", "render_start_pending", "rendering", "finalizing"].includes(String(state || ""));
  }

  async function continueCreativeHandoff(initialResult = null) {
    if (!activeCreativeOutputId) return;
    const outputId = activeCreativeOutputId;
    const token = ++creativeHandoffPollToken;
    let state = initialResult?.handoff_state || "rendering";
    if (!phase6HandoffNeedsContinuation(state)) return;

    setCreativeBusy(true);
    phase6Message("");

    for (let attempt = 0; attempt < 60; attempt += 1) {
      if (token !== creativeHandoffPollToken || activeCreativeOutputId !== outputId) return;
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 4000));
      try {
        const step = await api(`/api/outputs/${encodeURIComponent(outputId)}/creative/render/continue`, {
          method: "POST",
          body: "{}",
          timeoutMs: 30000,
        });
        state = step.handoff_state || state;
        if (step.handoff) renderCreativeChangeProgress(step.handoff);
        else await refreshCreativeChangeProgress().catch(() => null);

        if (state === "rendered_preview_ready" || step.completed || step?.handoff?.completed) {
          const refreshed = await api(`/api/outputs/${encodeURIComponent(outputId)}/creative`);
          if (token !== creativeHandoffPollToken || activeCreativeOutputId !== outputId) return;
          populateCreativeEditor(refreshed);
          renderCreativeChangeProgress(refreshed.handoff || step.handoff);
          phase6Message("");
          await loadOutputs();
          return;
        }

        if (["voice_prep_failed", "render_failed"].includes(state) || step.error || step?.handoff?.overall_status === "error") {
          const h = step.handoff || await refreshCreativeChangeProgress().catch(() => null);
          const errorMessage = h?.message || step.error || step.message || "Automatic preview rerender failed.";
          phase6Message(errorMessage, "error-text");
          setCreativeBusy(false);
          return;
        }

        const h = step.handoff || creativeHandoffStatus;
        if (h?.overall_status === "error") phase6Message(h?.message || step.message || "Studio needs attention.", "error-text");
        else phase6Message("");
      } catch (e) {
        if (token !== creativeHandoffPollToken) return;
        if (isTimeoutError(e)) {
          const h = await refreshCreativeChangeProgress().catch(() => null);
          if (h?.overall_status === "error") phase6Message(h?.message || "Studio needs attention.", "error-text");
          else phase6Message("");
        } else {
          const h = await refreshCreativeChangeProgress().catch(() => null);
          if (h?.overall_status === "error") phase6Message(h?.message || `Automatic handoff check failed: ${e.message}.`, "error-text");
          else phase6Message("");
        }
      }
    }

    if (token === creativeHandoffPollToken && activeCreativeOutputId === outputId) {
      const h = await refreshCreativeChangeProgress().catch(() => null);
      if (h?.overall_status === "error") phase6Message(h?.message || "The creative handoff needs attention.", "error-text");
      else phase6Message("");
      setCreativeBusy(false);
    }
  }

  async function reviewActiveCreative(action) {
    if (!activeCreativeOutputId) return;
    try {
      await saveActiveCreative({ quiet: true });
      phase6Message(action === "approve" ? "Saving review approval…" : "Saving changes request…");
      setCreativeBusy(true);
      const result = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative/review`, {
        method: "POST",
        body: JSON.stringify({ action, notes: $("creativeReviewNotes").value || "" }),
        timeoutMs: 30000,
      });
      const refreshed = await api(`/api/outputs/${encodeURIComponent(activeCreativeOutputId)}/creative`);
      populateCreativeEditor(refreshed);
      renderCreativeChangeProgress(refreshed.handoff || result.handoff || creativeHandoffStatus);
      if (refreshed?.handoff?.overall_status === "error") phase6Message(refreshed.handoff.message || result.message || "Review state needs attention.", "error-text");
      else phase6Message("");
      await loadOutputs();
      if (action !== "approve" && phase6HandoffNeedsContinuation(result.handoff_state)) {
        continueCreativeHandoff(result).catch((e) => phase6Message(e.message, "error-text"));
      }
    } catch (e) {
      if (action !== "approve" && isTimeoutError(e) && activeCreativeOutputId) {
        phase6Message("The save/review request is still being processed. Studio is resuming the handoff automatically…", "success");
        continueCreativeHandoff({ handoff_state: "voice_prep_running", message: "Resuming after a slow save/review response…" })
          .catch((err) => phase6Message(err.message, "error-text"));
        return;
      }
      phase6Message(e.message, "error-text");
      setCreativeBusy(false);
    }
  }


  function renderOutputsTable(target, records) {
    if (!records.length) return target.innerHTML = '<div class="empty">No Platform Output records were returned.</div>';
    const isPipeline = target?.id === "outputsList";
    target.innerHTML = `<table class="data-table"><thead><tr><th>Output</th><th>Platform</th>${isPipeline ? "<th>Type / ratio</th>" : ""}<th>Studio state</th><th>Render</th><th>Review</th><th>Publish</th><th>Progress</th>${isPipeline ? "<th>Creative</th>" : ""}</tr></thead><tbody>${records.map((r) => {
      const pct = r.studio_progress_percent ?? r.youtube_processing_progress_percent ?? r.youtube_upload_progress_percent;
      const postLink = r.platform_post_url ? `<a class="table-link" target="_blank" rel="noopener" href="${escapeHtml(r.platform_post_url)}">Open post ↗</a>` : "";
      const typeCell = isPipeline ? `<td><div>${value(r.platform_output_type || r.format)}</div><div class="subtle">${value(r.aspect_ratio)}</div></td>` : "";
      const creativeCell = isPipeline ? `<td class="creative-output-action-cell"><button type="button" class="creative-button" data-creative-output-id="${escapeHtml(r.id)}" ${r.creative_available ? "" : "disabled"}>${r.creative_available ? "Open editor" : "Not editable here"}</button></td>` : "";
      return `<tr><td><div class="title-cell">Output ${value(r.output_id)}</div><div class="subtle">${value(r.publish_method)}</div>${postLink}</td><td>${value(r.platform)}</td>${typeCell}<td>${badge(r.studio_state)}</td><td>${value(r.render_status)}</td><td>${value(r.review_status)}</td><td>${value(r.platform_publish_status || r.publish_status)}</td><td>${pct === null || pct === undefined ? "—" : `<div>${value(pct)}%</div><div class="progress"><span style="width:${Math.max(0,Math.min(100,Number(pct)||0))}%"></span></div>`}</td>${creativeCell}</tr>`;
    }).join("")}</tbody></table>`;
    if (isPipeline) {
      target.querySelectorAll("[data-creative-output-id]").forEach((button) => {
        button.addEventListener("click", () => openCreativeEditor(button.dataset.creativeOutputId));
      });
      phase6DecorateTooltips(target);
    }
  }

  async function loadOutputs() {
    const target = $("outputsList");
    target.innerHTML = '<div class="empty">Loading outputs…</div>';
    try {
      const { records = [] } = await api("/api/outputs?limit=100");
      pipelineOutputs = records;
      renderOutputsTable(target, records);
    }
    catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  }

  async function loadMusic() {
    const target = $("musicList");
    target.innerHTML = '<div class="empty">Loading music library…</div>';
    try {
      const { records = [] } = await api("/api/music?limit=100");
      if (!records.length) return target.innerHTML = '<div class="empty">No Music assets were returned.</div>';
      target.innerHTML = records.map((r) => {
        const preview = r.preview_url || r.google_drive_url;
        return `<article class="music-card"><h3>${value(r.display_name || r.name)}</h3>${r.display_name && r.display_name !== r.name ? `<div class="raw-filename">${value(r.name)}</div>` : ""}<div class="music-meta">${value(r.mime_type)} · ${value(r.file_size_mb)} MB · ${value(r.rights_status)}</div><div class="subtle">${value(r.description, "No description yet")}</div>${preview ? `<audio class="music-preview" controls preload="metadata" src="${escapeHtml(preview)}"></audio>` : `<div class="subtle">No preview URL available.</div>`}<div class="music-actions">${r.google_drive_url ? `<a class="link-button" target="_blank" rel="noopener" href="${escapeHtml(r.google_drive_url)}">Open source</a>` : ""}<span class="badge ${r.do_not_use ? "failed" : "published"}">${r.do_not_use ? "Do not use" : "Available"}</span></div></article>`;
      }).join("");

      const players = Array.from(target.querySelectorAll("audio.music-preview"));
      players.forEach((player) => player.load());
      players.forEach((player) => player.addEventListener("play", () => {
        players.forEach((other) => { if (other !== player) other.pause(); });
      }));
    } catch (e) { target.innerHTML = `<div class="error">${escapeHtml(e.message)}</div>`; }
  }

  function loadPage(page) {
    if (page === "dashboard") return loadDashboard();
    if (page === "ideas") return loadIdeas();
    if (page === "content") return loadContent();
    if (page === "outputs") return loadOutputs();
    if (page === "music") return loadMusic();
  }


  $("closeCreativeEditor")?.addEventListener("click", () => {
    if (!phase6ConfirmDiscardUnsaved("close the editor")) return;
    creativeHandoffPollToken += 1;
    $("creativeEditorPanel").hidden = true;
    activeCreativeOutputId = null;
    activeCreativeOutput = null;
    creativeSlides = [];
    creativeEditorDirty = false;
    creativeSavedFingerprint = "";
    const video = $("creativeRenderPreview");
    const drive = $("creativeRenderPreviewDrive");
    video?.pause();
    video?.removeAttribute("src");
    drive?.removeAttribute("src");
  });
  $("reloadCreativeEditor")?.addEventListener("click", () => {
    if (!activeCreativeOutputId || !phase6ConfirmDiscardUnsaved("reset to the saved values")) return;
    openCreativeEditor(activeCreativeOutputId);
  });
  $("saveCreativeEditor")?.addEventListener("click", () => saveActiveCreative().catch(() => {}));
  $("creativeRequestChanges")?.addEventListener("click", () => reviewActiveCreative("changes_requested"));
  $("creativeApprovePreview")?.addEventListener("click", () => {
    if (window.confirm("Approve this preview? This records review approval only; it will not publish the output.")) reviewActiveCreative("approve");
  });
  $("creativeDefaultVoicePreview")?.addEventListener("click", () => phase6PreviewSelectedVoice($("creativeDefaultVoice"), $("creativeDefaultVoicePreview")));
  $("creativeVoiceoverVolumeRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeVoiceoverVolumeRange", "creativeVoiceoverVolume"));
  $("creativeVoiceoverVolume")?.addEventListener("input", () => syncCreativeAudioPair("creativeVoiceoverVolume", "creativeVoiceoverVolumeRange"));
  $("creativeMusicNormalRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicNormalRange", "creativeMusicNormal"));
  $("creativeMusicNormal")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicNormal", "creativeMusicNormalRange"));
  $("creativeMusicDuckedRange")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicDuckedRange", "creativeMusicDucked"));
  $("creativeMusicDucked")?.addEventListener("input", () => syncCreativeAudioPair("creativeMusicDucked", "creativeMusicDuckedRange"));
  $("creativeDuckingEnabled")?.addEventListener("change", updateCreativeAudioSummary);

  $("creativeEditorPanel")?.addEventListener("input", (event) => {
    if (event.target.closest("input, textarea, select")) phase6MarkDirty();
  });
  $("creativeEditorPanel")?.addEventListener("change", (event) => {
    if (event.target.closest("input, textarea, select")) phase6MarkDirty();
  });
  $("clearCreativeReviewNotes")?.addEventListener("click", () => {
    if (!$("creativeReviewNotes")) return;
    $("creativeReviewNotes").value = "";
    phase6MarkDirty();
    $("creativeReviewNotes").focus();
  });
  $("collapseCreativeSlides")?.addEventListener("click", () => {
    creativeSlides.forEach((slide) => creativeSlideCollapsed.add(slide.id));
    renderCreativeSlides();
  });
  $("expandCreativeSlides")?.addEventListener("click", () => {
    creativeSlideCollapsed.clear();
    renderCreativeSlides();
  });
  document.querySelectorAll("[data-creative-jump]").forEach((button) => {
    button.addEventListener("click", () => {
      const target = $(button.dataset.creativeJump);
      target?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });
  window.addEventListener("beforeunload", (event) => {
    if (!creativeEditorDirty) return;
    event.preventDefault();
    event.returnValue = "";
  });

  phase6DecorateTooltips(document);
  window.addEventListener("scroll", phase6HideTooltip, true);
  window.addEventListener("resize", phase6HideTooltip);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") phase6HideTooltip(); });

  checkHealth();
  loadDashboard();
})();

// v0.6.17 display-text normalization startup
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", () => startDisplayTextRepair(), { once: true });
} else {
  startDisplayTextRepair();
}
