(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    loading: false,
    desk: null,
    expandedReviewGroup: null,
    pendingFactoryFeedback: null,
  };

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function setStatus(message, isError = false) {
    const node = $("factoryDeskStatus");
    if (!node) return;
    node.textContent = message || "";
    node.classList.toggle("error-text", Boolean(isError));
  }

  async function fetchJson(path, options = {}) {
    const response = await fetch(path, {
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
      throw new Error(body?.error || body?.message || (`Factory desk failed (${response.status})`));
    }
    return body || {};
  }

  function cardLabel(card) {
    const bits = [];
    if (card.content_id) bits.push(`C${card.content_id}`);
    if (card.output_id) bits.push(`O${card.output_id}`);
    if (card.production_request_number) bits.push(`PR${card.production_request_number}`);
    return bits.length ? `${bits.join(" · ")} — ${card.title || "Untitled"}` : (card.title || "Untitled");
  }

  function selectFactoryProfile(profileId) {
    const id = String(profileId || "").trim();
    const select = $("studioProfileSelect");
    if (!id || !select || select.value === id) return;
    select.value = id;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  }

  function fallbackOpenPage(page) {
    document.querySelector(`.nav-item[data-page="${page}"]`)?.click();
  }

  async function openStudioTarget(card) {
    const target = window.FactoryOpenTargets?.resolve?.(card) || {
      entity: card?.kind === "output" ? "output" : (card?.kind === "idea" ? "idea" : "production_request"),
      id: String(card?.production_request_id || card?.id || "").trim(),
      page: card?.kind === "output" ? "outputs" : (card?.kind === "idea" ? "ideas" : "content"),
      profileId: String(card?.profile_id || "").trim(),
    };
    selectFactoryProfile(target.profileId);

    try {
      if (target.entity === "production_request" && typeof window.StudioOpenProductionRequestById === "function") {
        await window.StudioOpenProductionRequestById(target.id);
        return;
      }
      if (target.entity === "output" && typeof window.StudioOpenPipelineOutputById === "function") {
        await window.StudioOpenPipelineOutputById(target.id);
        return;
      }
      if (target.entity === "idea" && typeof window.StudioOpenIdeaById === "function") {
        await window.StudioOpenIdeaById(target.id);
        return;
      }
      fallbackOpenPage(target.page);
    } catch (error) {
      // Keep a usable destination even if an exact record fetch fails. Production
      // requests never fall back to Ideas, because promoted/stale ideas may be absent.
      fallbackOpenPage(target.page);
      setStatus(`Opened ${target.page === "content" ? "Production" : (target.page === "outputs" ? "Pipeline" : "Ideas")}, but the exact item could not be loaded: ${error.message || error}`, true);
    }
  }

  function canReviewActions(card, { pile = false, candidate = false } = {}) {
    if (pile || candidate) return false;
    if (card?.kind !== "output") return false;
    // studio_state can paint Ready for Review while Output_Status is still
    // In Production. Approve all must only claim Airtable-ready rows.
    const output = String(card.output_status || "").trim().toLowerCase();
    const review = String(card.review_status || "").trim().toLowerCase();
    if (output === "in production" || output === "rendering" || output === "ready for render") return false;
    if (output === "ready for review") return true;
    if (review === "review sent" || review === "ready for review") return true;
    return /ready for review/i.test(String(card.studio_state || ""));
  }

  function canDelete(card, { candidate = false } = {}) {
    if (candidate) return false;
    if (card?.kind === "idea") return true;
    if (card?.kind === "output") return true;
    return false;
  }

  function canPreview(card) {
    if (card?.kind !== "output") return false;
    if (card.can_preview) return true;
    return Boolean(card.preview_url || card.final_file_url || card.thumbnail_url);
  }

  function looksLikeImageOnly(card) {
    const type = `${card.studio_output_type || ""} ${card.platform || ""}`.toLowerCase();
    if (/carousel|single image|single photo|feed post/.test(type) && !/reel|story|short|tiktok|video/.test(type)) {
      return Boolean(card.thumbnail_url) && !card.final_file_url;
    }
    return false;
  }

  function closeFactoryPreview() {
    const backdrop = $("factoryPreviewBackdrop");
    const video = $("factoryPreviewVideo");
    const image = $("factoryPreviewImage");
    const empty = $("factoryPreviewEmpty");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (video) {
      video.pause();
      video.removeAttribute("src");
      video.removeAttribute("poster");
      video.load();
    }
    if (image) {
      image.removeAttribute("src");
      image.hidden = true;
    }
    if (empty) empty.hidden = true;
    dialog?.classList.remove("is-image");
    dialog?.classList.add("is-video");
    if (backdrop) backdrop.hidden = true;
  }

  function openFactoryPreview(card) {
    const backdrop = $("factoryPreviewBackdrop");
    const video = $("factoryPreviewVideo");
    const image = $("factoryPreviewImage");
    const empty = $("factoryPreviewEmpty");
    const title = $("factoryPreviewTitle");
    const dialog = backdrop?.querySelector(".library-preview-dialog");
    if (!backdrop || !video || !image || !dialog) {
      setStatus("Preview UI is missing from this page build.", true);
      return;
    }
    if (title) title.textContent = cardLabel(card);
    empty.hidden = true;
    image.hidden = true;
    image.removeAttribute("src");
    video.pause();
    video.removeAttribute("src");
    video.removeAttribute("poster");

    const thumb = String(card.thumbnail_url || "").trim();
    const previewUrl = String(card.preview_url || "").trim()
      || (/^rec[A-Za-z0-9]+$/.test(String(card.id || "")) ? `/api/outputs/${card.id}/preview` : "");
    const imageOnly = looksLikeImageOnly(card);

    if (imageOnly && thumb) {
      dialog.classList.remove("is-video");
      dialog.classList.add("is-image");
      image.src = thumb;
      image.hidden = false;
      backdrop.hidden = false;
      setStatus(`Previewing still · ${cardLabel(card)}`);
      return;
    }

    if (!previewUrl && !thumb) {
      dialog.classList.add("is-video");
      dialog.classList.remove("is-image");
      empty.hidden = false;
      empty.textContent = "No preview file yet for this output.";
      backdrop.hidden = false;
      setStatus("No preview file yet.", true);
      return;
    }

    dialog.classList.add("is-video");
    dialog.classList.remove("is-image");
    if (thumb) video.setAttribute("poster", thumb);
    video.onerror = () => {
      if (thumb) {
        dialog.classList.remove("is-video");
        dialog.classList.add("is-image");
        image.src = thumb;
        image.hidden = false;
        video.removeAttribute("src");
        setStatus(`Video stream failed — showing cover for ${cardLabel(card)}.`, true);
        return;
      }
      empty.hidden = false;
      empty.textContent = "Preview stream failed. Open Pipeline review for this output.";
      setStatus("Preview stream failed.", true);
    };
    video.src = previewUrl;
    video.hidden = false;
    video.load();
    backdrop.hidden = false;
    setStatus(`Previewing · ${cardLabel(card)}`);
    video.play?.().catch(() => {});
  }

  function renderCard(card, { pile = false, candidate = false, lane = "" } = {}) {
    const actions = [];
    actions.push(`<button type="button" class="text-button" data-factory-open="${esc(card.id)}">Open</button>`);
    if (pile) {
      actions.push(`<button type="button" class="secondary-button" data-factory-unpin="${esc(card.id)}">Remove</button>`);
    } else if (candidate) {
      actions.push(`<button type="button" class="primary-button" data-factory-pin="${esc(card.id)}">Add</button>`);
    }
    if (canPreview(card) && (lane === "needs_eyes" || canReviewActions(card, { pile, candidate }) || lane === "auto_high" || lane === "manual")) {
      actions.push(`<button type="button" class="secondary-button" data-factory-preview="${esc(card.id)}">Preview</button>`);
    }
    if (card.kind === "output" && (canReviewActions(card, { pile, candidate }) || lane === "needs_eyes")) {
      actions.push(`<button type="button" class="primary-button" data-factory-approve="${esc(card.id)}">Approve</button>`);
      actions.push(`<button type="button" class="secondary-button" data-factory-send-back="${esc(card.id)}">Send back</button>`);
    }
    if (canDelete(card, { candidate })) {
      actions.push(`<button type="button" class="secondary-button factory-delete" data-factory-delete="${esc(card.id)}">Delete</button>`);
    }
    const thumb = String(card.thumbnail_url || "").trim();
    const media = canPreview(card)
      ? `<button type="button" class="factory-line-thumb" data-factory-preview="${esc(card.id)}" aria-label="Preview ${esc(cardLabel(card))}">
          ${thumb ? `<img src="${esc(thumb)}" alt="" loading="lazy">` : `<span class="factory-line-play">▶</span>`}
        </button>`
      : `<span class="factory-line-thumb factory-line-thumb-empty" aria-hidden="true"></span>`;
    const alert = card.stuck_kind || card.produce_error || "";
    const state = card.studio_state || (alert ? "Needs repair" : "—");
    const cell = (value) => `<span class="factory-line-cell">${esc(value || "—")}</span>`;
    return `<div class="factory-line" data-factory-id="${esc(card.id)}" data-factory-kind="${esc(card.kind || "")}" data-lane="${esc(lane)}" title="${esc(cardLabel(card))}">
      ${media}
      <span class="factory-line-title">${esc(card.title || cardLabel(card))}</span>
      ${cell(card.profile_name)}
      ${cell(card.platform)}
      ${cell(card.studio_output_type)}
      <span class="factory-line-cell factory-line-state"${alert ? ` title="${esc(alert)}"` : ""}>${esc(state)}</span>
      <div class="factory-line-actions">${actions.join("")}</div>
    </div>`;
  }

  function contentGroupKey(card) {
    const contentId = String(card?.content_id || "").trim();
    if (contentId) return `content:${contentId}`;
    return `solo:${card?.id || ""}`;
  }

  function groupByContent(cards) {
    const groups = [];
    const index = new Map();
    for (const card of cards || []) {
      const key = contentGroupKey(card);
      if (!index.has(key)) {
        const group = { key, cards: [] };
        index.set(key, group);
        groups.push(group);
      }
      index.get(key).cards.push(card);
    }
    return groups;
  }

  function readyContentCards(group) {
    return (group?.cards || []).filter((card) => card?.kind === "output" && canReviewActions(card) && /^rec[A-Za-z0-9]+$/.test(String(card.id || "")));
  }

  function isStoryOutputCard(card) {
    return /story/i.test(String(card?.studio_output_type || card?.format || ""));
  }

  /**
   * Same-content outputs still in Auto-high / Manual (usually Stories still
   * rendering). Approve all only sees Needs eyes, so without this gate mains
   * approve first and Stories reappear alone as Ready for Review.
   */
  function pendingSiblingOutputsForGroup(group) {
    const contentId = String(group?.cards?.[0]?.content_id || "").trim();
    if (!contentId || !state.desk?.lanes) return [];
    const readyIds = new Set((group?.cards || []).map((card) => String(card?.id || "")).filter(Boolean));
    const elsewhere = [
      ...(state.desk.lanes.auto_high || []),
      ...(state.desk.lanes.manual || []),
    ];
    return elsewhere.filter((card) => {
      if (card?.kind !== "output") return false;
      if (String(card.content_id || "").trim() !== contentId) return false;
      if (readyIds.has(String(card.id || ""))) return false;
      return true;
    });
  }

  function pendingSiblingMeta(pending) {
    if (!pending.length) return "";
    const stories = pending.filter(isStoryOutputCard).length;
    if (stories && stories === pending.length) {
      return `${stories} Stor${stories === 1 ? "y" : "ies"} still rendering`;
    }
    if (stories) {
      return `${pending.length} still rendering (${stories} Stor${stories === 1 ? "y" : "ies"})`;
    }
    return `${pending.length} sibling${pending.length === 1 ? "" : "s"} still rendering`;
  }

  function renderContentBar(group, expanded) {
    const ready = readyContentCards(group);
    const pending = pendingSiblingOutputsForGroup(group);
    const pendingLabel = pendingSiblingMeta(pending);
    const first = group.cards[0] || {};
    const contentId = String(first.content_id || "").trim();
    const title = first.title || "Untitled";
    const bits = [];
    if (contentId) bits.push(`Content ${contentId}`);
    bits.push(`${ready.length} ready`);
    if (pendingLabel) bits.push(pendingLabel);
    const meta = bits.join(" · ");
    const approveAll = ready.length > 1
      ? (pending.length
        ? `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}" disabled title="Wait until sibling Stories finish rendering, then Approve all together">${esc(`Approve all (${ready.length}) — wait for Stories`)}</button>`
        : `<button type="button" class="primary-button factory-content-approve" data-factory-approve-content="${esc(group.key)}">Approve all (${ready.length})</button>`)
      : "";
    return `<div class="factory-content-bar" data-factory-content="${esc(group.key)}">
      <button type="button" class="factory-content-toggle" data-factory-toggle-content="${esc(group.key)}" aria-expanded="${expanded}" aria-controls="factory-review-${esc(group.key.replace(/[^a-zA-Z0-9_-]/g, "-"))}">
        <span class="factory-content-chevron" aria-hidden="true">${expanded ? "▾" : "▸"}</span>
        <span class="factory-content-label"><strong class="factory-content-title">${esc(title)}</strong><span class="factory-content-meta">${esc(meta)}</span></span>
      </button>
      ${ready.length ? `<button type="button" class="secondary-button factory-content-send-back" data-factory-send-back-content="${esc(group.key)}">Send back to Production</button>` : ""}
      ${approveAll}
    </div>`;
  }

  function renderLane(listId, cards, emptyCopy, options = {}) {
    const node = $(listId);
    if (!node) return;
    if (!cards?.length) {
      node.innerHTML = `<p class="subtle factory-lane-empty">${esc(emptyCopy)}</p>`;
      return;
    }
    if (options.groupContent) {
      const groups = groupByContent(cards);
      if (!groups.some((group) => group.key === state.expandedReviewGroup)) state.expandedReviewGroup = groups[0]?.key || null;
      node.innerHTML = groups.map((group) => {
        const expanded = group.key === state.expandedReviewGroup;
        const id = `factory-review-${group.key.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
        return renderContentBar(group, expanded) +
          `<div id="${esc(id)}" class="factory-content-rows" ${expanded ? "" : "hidden"}>${group.cards.map((card) => renderCard(card, options)).join("")}</div>`;
      }).join("");
      node.querySelectorAll("[data-factory-toggle-content]").forEach((button) => {
        button.addEventListener("click", () => {
          const key = button.dataset.factoryToggleContent;
          state.expandedReviewGroup = state.expandedReviewGroup === key ? "" : key;
          renderDesk(state.desk);
        });
      });
      return;
    }
    node.innerHTML = cards.map((card) => renderCard(card, options)).join("");
  }

  function setCount(id, text) {
    const node = $(id);
    if (node) node.textContent = text;
  }

  function renderSummary(summary) {
    if (!summary) return;
    setCount("factoryCountAutoHigh", String(Number(summary.auto_high) || 0));
    setCount("factoryCountNeedsEyes", String(Number(summary.needs_eyes) || 0));
    const used = Number(summary.needs_assets_pile) || 0;
    const max = Number(summary.needs_assets_max) || 3;
    setCount("factoryCountNeedsAssets", `${used}/${max}`);
    setCount("factoryCountManual", String(Number(summary.manual) || 0));
  }

  // Review feedback is entered before any state-changing request is sent.
  function openFactoryFeedback({ title, scope, payload }) {
    const backdrop = $("factoryFeedbackBackdrop");
    const textarea = $("factoryFeedbackNotes");
    if (!backdrop || !textarea) {
      setStatus("Review notes window is unavailable. Refresh Studio before sending back.", true);
      return;
    }
    state.pendingFactoryFeedback = { payload, focusedElement: document.activeElement };
    const heading = $("factoryFeedbackTarget");
    const detail = $("factoryFeedbackScope");
    const error = $("factoryFeedbackError");
    if (heading) heading.textContent = title || "Untitled content";
    if (detail) detail.textContent = scope || "Review changes";
    if (error) { error.hidden = true; error.textContent = ""; }
    textarea.value = "";
    const count = $("factoryFeedbackCount");
    if (count) count.textContent = "0 / 3000";
    const submit = $("factoryFeedbackSubmit");
    if (submit) { submit.disabled = false; submit.textContent = "Send back with notes"; }
    backdrop.hidden = false;
    textarea.focus();
  }

  function closeFactoryFeedback() {
    const backdrop = $("factoryFeedbackBackdrop");
    if (backdrop) backdrop.hidden = true;
    const origin = state.pendingFactoryFeedback?.focusedElement;
    state.pendingFactoryFeedback = null;
    if (origin?.isConnected) origin.focus?.();
  }

  async function submitFactoryFeedback(event) {
    event.preventDefault();
    const pending = state.pendingFactoryFeedback;
    if (!pending) return;
    const notes = String($("factoryFeedbackNotes")?.value || "").trim();
    const error = $("factoryFeedbackError");
    if (!notes) {
      if (error) { error.hidden = false; error.textContent = "Describe the changes needed before sending back."; }
      $("factoryFeedbackNotes")?.focus();
      return;
    }
    const submit = $("factoryFeedbackSubmit");
    if (submit) { submit.disabled = true; submit.textContent = "Sending back…"; }
    if (error) { error.hidden = true; error.textContent = ""; }
    try {
      closeFactoryPreview();
      const desk = await mutateDesk({ ...pending.payload, note: notes });
      const requestId = String(desk?.result?.production_request_id || pending.payload.production_request_id || "").trim();
      closeFactoryFeedback();
      if (requestId && typeof window.StudioOpenProductionRequestById === "function") {
        try {
          await window.StudioOpenProductionRequestById(requestId);
          setStatus("Review feedback saved in Production. Edit, then Approve to rerender.");
        } catch (openingError) {
          setStatus("Review notes saved. Open Production to view feedback: " + (openingError.message || openingError), true);
        }
      } else {
        setStatus("Review notes saved. Open the returned item in Production for changes.");
      }
    } catch (err) {
      if (submit) { submit.disabled = false; submit.textContent = "Send back with notes"; }
      if (error) { error.hidden = false; error.textContent = String(err?.message || err); }
      setStatus("Could not send back: " + (err?.message || err), true);
    }
  }

  function bindCardActions(desk) {
    const byId = new Map();
    for (const lane of Object.values(desk?.lanes || {})) {
      for (const card of lane || []) byId.set(card.id, card);
    }
    for (const card of desk?.needs_assets_candidates || []) byId.set(card.id, card);

    const root = $("page-factory");
    if (!root) return;

    root.querySelectorAll("[data-factory-open]").forEach((button) => {
      button.addEventListener("click", async () => {
        const card = byId.get(button.getAttribute("data-factory-open"));
        if (!card) {
          setStatus("Open failed: card not found in desk payload.", true);
          return;
        }
        button.disabled = true;
        const idleText = button.textContent || "Open";
        button.textContent = "Opening…";
        try {
          await openStudioTarget(card);
        } finally {
          button.disabled = false;
          button.textContent = idleText;
        }
      });
    });
    root.querySelectorAll("[data-factory-preview]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-preview"));
        if (!card) {
          setStatus("Preview failed: card not found in desk payload.", true);
          return;
        }
        openFactoryPreview(card);
      });
    });
    root.querySelectorAll("[data-factory-pin]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-pin"));
        if (!card) return;
        mutateDesk({
          action: "pin_needs_assets",
          item: {
            id: card.id,
            kind: card.kind,
            title: card.title,
            profile_name: card.profile_name,
            studio_state: card.studio_state,
          },
        }).catch((error) => setStatus(error.message || String(error), true));
      });
    });
    root.querySelectorAll("[data-factory-unpin]").forEach((button) => {
      button.addEventListener("click", () => {
        mutateDesk({
          action: "unpin_needs_assets",
          id: button.getAttribute("data-factory-unpin"),
        }).catch((error) => setStatus(error.message || String(error), true));
      });
    });
    root.querySelectorAll("[data-factory-send-back-content]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-factory-send-back-content");
        const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
        const ready = readyContentCards({ cards });
        if (!ready.length) {
          setStatus("No reviewable outputs were found for this content.", true);
          return;
        }
        const productionRequestId = String(ready.find((card) => /^rec[A-Za-z0-9]+$/.test(String(card.production_request_id || "")))?.production_request_id || "").trim();
        if (!productionRequestId) {
          setStatus("The linked Production Request could not be resolved.", true);
          return;
        }
        const title = ready[0].title || "this content";
        openFactoryFeedback({
          title,
          scope: `Entire content package · ${ready.length} ready output${ready.length === 1 ? "" : "s"}`,
          payload: {
            action: "send_back_content",
            kind: "output",
            id: ready[0].id,
            production_request_id: productionRequestId,
            output_ids: ready.map((card) => card.id),
          },
        });
      });
    });
    root.querySelectorAll("[data-factory-approve-content]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.getAttribute("data-factory-approve-content");
        approveContentGroup(key, button).catch((error) => {
          button.disabled = false;
          const message = error.message || String(error);
          setStatus(message, true);
          window.alert(`Factory Approve all failed:\n${message}`);
        });
      });
    });
    root.querySelectorAll("[data-factory-approve]").forEach((button) => {
      button.addEventListener("click", () => {
        const id = button.getAttribute("data-factory-approve");
        const card = byId.get(id);
        if (!card) {
          setStatus(`Approve failed: card ${id || "(missing)"} not found in desk payload.`, true);
          return;
        }
        if (!window.confirm(`Approve “${cardLabel(card)}” for publishing?\n\nStudio will use the next open morning, afternoon, or evening. It will not publish immediately. TikTok stays a draft.`)) return;
        button.disabled = true;
        closeFactoryPreview();
        mutateDesk({ action: "approve", id: card.id, kind: card.kind || "output" })
          .catch((error) => {
            button.disabled = false;
            const message = error.message || String(error);
            setStatus(message, true);
            window.alert(`Factory Approve failed:\n${message}`);
          });
      });
    });
    root.querySelectorAll("[data-factory-send-back]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-send-back"));
        if (!card) {
          setStatus("Send back failed: card not found in desk payload.", true);
          return;
        }
        openFactoryFeedback({
          title: card.title || cardLabel(card),
          scope: [card.platform, card.studio_output_type, "Selected output only"].filter(Boolean).join(" · "),
          payload: {
            action: "send_back",
            id: card.id,
            kind: card.kind || "output",
            production_request_id: card.production_request_id || null,
          },
        });
      });
    });
    root.querySelectorAll("[data-factory-delete]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-delete"));
        if (!card) {
          setStatus("Delete failed: card not found in desk payload.", true);
          return;
        }
        const copy = card.kind === "idea"
          ? `Delete idea “${cardLabel(card)}” permanently from Airtable?`
          : `Mark “${cardLabel(card)}” as Skipped and remove it from Factory queues?`;
        if (!window.confirm(copy)) return;
        button.disabled = true;
        closeFactoryPreview();
        mutateDesk({ action: "delete", id: card.id, kind: card.kind || "output" })
          .catch((error) => {
            button.disabled = false;
            const message = error.message || String(error);
            setStatus(message, true);
            window.alert(`Factory Delete failed:\n${message}`);
          });
      });
    });
  }

  function renderDesk(desk) {
    state.desk = desk;
    renderSummary(desk.summary);
    renderLane("factoryLaneAutoHigh", desk.lanes?.auto_high, "Nothing in active produce/render right now.", { lane: "auto_high" });
    renderLane("factoryLaneNeedsEyes", desk.lanes?.needs_eyes, "No Ready for Review items waiting on eyes.", { lane: "needs_eyes", groupContent: true });
    renderLane("factoryLaneNeedsAssets", desk.lanes?.needs_assets, "Pile empty — add up to 3 from candidates below.", { pile: true, lane: "needs_assets" });
    renderLane("factoryLaneManual", desk.lanes?.manual, "No stuck or failed work in view.", { lane: "manual" });
    renderLane(
      "factoryNeedsAssetsCandidates",
      desk.needs_assets_candidates,
      "No photo-wait / assets-needed candidates.",
      { candidate: true, lane: "needs_assets" },
    );
    const pileMeta = $("factoryNeedsAssetsMeta");
    if (pileMeta) {
      const used = desk.summary?.needs_assets_pile || 0;
      const max = desk.summary?.needs_assets_max || 3;
      pileMeta.textContent = `Working pile ${used}/${max}. Pin candidates below.`;
    }
    bindCardActions(desk);
  }

  const ACTION_STATUS = {
    pin_needs_assets: "Added to needs-assets pile.",
    unpin_needs_assets: "Removed from needs-assets pile.",
    approve: "Approved for publishing.",
    send_back: "Sent back to production.",
    send_back_content: "Content sent back to Production.",
    delete: "Deleted / skipped.",
  };

  function approveAllProgressText(result) {
    if (result?.message) return String(result.message);
    const approved = Number(result?.approved_count || 0);
    const failed = Number(result?.failed_count || 0);
    const total = Number(result?.total || 0);
    return `${approved} of ${total} approved · ${failed} failed`;
  }

  async function watchApproveAll(result, profileId) {
    let latest = result || {};
    let jobId = String(latest.job_id || "").trim();
    const started = Date.now();
    // Soft ceiling only: the Worker keeps stamping in the background via
    // waitUntil / cron. Do not fail the click — reload the desk and show progress.
    const softMs = 600000;
    while (jobId && (latest.status === "queued" || latest.status === "running")) {
      setStatus(approveAllProgressText(latest));
      if (Date.now() - started > softMs) {
        return {
          ...latest,
          status: "running",
          message: `${approveAllProgressText(latest)} · still running in background — refresh Factory in a minute`,
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const params = new URLSearchParams({ job_id: jobId });
      if (profileId) params.set("profile", profileId);
      latest = await fetchJson(`/api/outputs/approve-all?${params.toString()}`);
      jobId = String(latest?.job_id || jobId).trim();
    }
    return latest;
  }

  async function approveContentGroup(key, button) {
    const cards = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
    const ready = readyContentCards({ cards });
    if (ready.length < 2) {
      setStatus("This content does not have multiple outputs waiting for approval.", true);
      return;
    }
    const pending = pendingSiblingOutputsForGroup({ cards });
    if (pending.length) {
      const pendingLabel = pendingSiblingMeta(pending);
      setStatus(`Approve all is waiting — ${pendingLabel}. Approve when the whole content is Ready for Review so Stories do not come back alone.`, true);
      window.alert(
        `Approve all is held until sibling outputs finish.\n\n${pendingLabel}.\n\nStories usually land in Needs eyes a few minutes after Reels/Shorts. Wait, then Approve all together.`,
      );
      return;
    }
    const title = ready[0].title || "this content";
    const contentId = String(ready[0].content_id || "").trim();
    const heading = contentId ? `Content ${contentId} · ${title}` : title;
    const list = ready.map((card) => `• ${[card.platform, card.studio_output_type].filter(Boolean).join(" ") || cardLabel(card)}`).join("\n");
    const confirmed = window.confirm(
      `Approve ${ready.length} outputs for “${heading}”?\n\nOnly this content item is included. Each output gets the next open morning, afternoon, or evening for its platform. Nothing publishes immediately. TikTok stays a draft.\n\n${list}`
    );
    if (!confirmed) return;
    if (button) {
      button.disabled = true;
      button.textContent = "Approving…";
    }
    closeFactoryPreview();
    const profileId = String(ready.find((card) => /^rec[A-Za-z0-9]+$/.test(String(card.profile_id || "")))?.profile_id || "").trim();
    const body = {
      notes: "Studio Factory Approve Content",
      record_ids: ready.map((card) => card.id),
      items: ready.map((card) => ({
        id: card.id,
        output_id: card.output_id || null,
        platform: card.platform || null,
        format: card.studio_output_type || null,
      })),
    };
    if (profileId) body.content_profile_id = profileId;
    setStatus(`Approve all started · 0 of ${ready.length} approved · 0 failed`);
    const result = await fetchJson("/api/outputs/approve-all", {
      method: "POST",
      body: JSON.stringify(body),
    });
    const finished = await watchApproveAll(result, profileId);
    await loadFactoryDesk(true);
    const failed = Number(finished?.failed_count || 0);
    const leftover = (state.desk?.lanes?.needs_eyes || []).filter((card) => contentGroupKey(card) === key);
    const leftoverStories = leftover.filter(isStoryOutputCard).length;
    let message = approveAllProgressText(finished);
    if (leftover.length) {
      const failedItems = Array.isArray(finished?.failed) ? finished.failed : [];
      const leftoverFailed = leftover.filter((card) => failedItems.some((row) => row.id === card.id)).length;
      if (leftoverFailed) {
        message += leftoverStories
          ? ` · ${leftoverStories} Stor${leftoverStories === 1 ? "y" : "ies"} still need eyes (approval did not stick)`
          : ` · ${leftover.length} still need eyes (approval did not stick)`;
      } else {
        message += leftoverStories
          ? ` · ${leftoverStories} Stor${leftoverStories === 1 ? "y" : "ies"} still need eyes (not ready yet — wait, then Approve all again)`
          : ` · ${leftover.length} sibling${leftover.length === 1 ? "" : "s"} still need eyes`;
      }
    }
    setStatus(message, failed > 0 || leftover.length > 0);
    if (failed > 0) {
      const failedItems = Array.isArray(finished?.failed) ? finished.failed : [];
      const reasons = [...new Set(failedItems.map((row) => String(row?.error || "").trim()).filter(Boolean))];
      const reasonText = reasons.length
        ? `\n\n${reasons.slice(0, 3).map((err) => `• ${err}`).join("\n")}${reasons.length > 3 ? `\n• …and ${reasons.length - 3} more` : ""}`
        : "";
      window.alert(`Factory Approve all finished with failures:\n${approveAllProgressText(finished)}${reasonText}`);
    }
  }

  async function mutateDesk(payload) {
    setStatus("Saving…");
    const desk = await fetchJson("/api/factory/desk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    // A successful approval is a durable mutation, not a full Desk read.
    // A subsequent refresh error must never be reported as approval failure.
    const savedMessage = desk.message || ACTION_STATUS[payload.action] || "Updated.";
    if (desk.lanes) {
      renderDesk(desk);
    } else if (desk.ok) {
      const refreshed = await loadFactoryDesk(true);
      if (!refreshed) {
        setStatus(savedMessage + " Desk refresh failed; tap Refresh.", false);
        return desk;
      }
    }
    setStatus(savedMessage);
    return desk;
  }

  async function loadFactoryDesk(force = false) {
    if (state.loading && !force) return state.desk;
    state.loading = true;
    setStatus("Loading Factory Desk…");
    try {
      const desk = await fetchJson("/api/factory/desk");
      renderDesk(desk);
      setStatus(desk.warning || "Factory Desk ready.");
      return desk;
    } catch (error) {
      setStatus(error.message || String(error), true);
      return null;
    } finally {
      state.loading = false;
    }
  }

  $("factoryFeedbackForm")?.addEventListener("submit", submitFactoryFeedback);
  $("factoryFeedbackCancel")?.addEventListener("click", closeFactoryFeedback);
  $("factoryFeedbackClose")?.addEventListener("click", closeFactoryFeedback);
  $("factoryFeedbackBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("factoryFeedbackBackdrop") && !$("factoryFeedbackSubmit")?.disabled) closeFactoryFeedback();
  });
  $("factoryFeedbackNotes")?.addEventListener("input", (event) => {
    const node = $("factoryFeedbackCount");
    if (node) node.textContent = `${event.target.value.length} / 3000`;
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("factoryFeedbackBackdrop")?.hidden && !$("factoryFeedbackSubmit")?.disabled) {
      event.preventDefault();
      closeFactoryFeedback();
    }
  });

  $("factoryDeskRefresh")?.addEventListener("click", () => {
    loadFactoryDesk(true).catch(() => {});
  });
  $("factoryPreviewClose")?.addEventListener("click", () => closeFactoryPreview());
  $("factoryPreviewBackdrop")?.addEventListener("click", (event) => {
    if (event.target === $("factoryPreviewBackdrop")) closeFactoryPreview();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !$("factoryPreviewBackdrop")?.hidden) closeFactoryPreview();
  });

  // Four streams start collapsed; operators expand only the queue they need.
  $("factoryLanes")?.addEventListener("click", (event) => {
    const toggle = event.target.closest?.("[data-factory-band-toggle]");
    if (!toggle || !$("factoryLanes").contains(toggle)) return;
    const band = toggle.closest(".factory-band");
    if (!band) return;
    const open = band.classList.toggle("is-collapsed") === false;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    const chevron = toggle.querySelector(".factory-band-chevron");
    if (chevron) chevron.textContent = open ? "▾" : "▸";
  });

  window.StudioFactoryDesk = {
    load: loadFactoryDesk,
  };
})();
