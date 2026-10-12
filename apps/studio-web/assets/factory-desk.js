(() => {
  const $ = (id) => document.getElementById(id);
  const state = {
    loading: false,
    desk: null,
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

  function openStudioTarget(card) {
    let page = "outputs";
    if (card.kind === "idea" || (!card.content_id && card.idea_id && !card.output_id)) page = "ideas";
    else if (card.kind === "request" && !card.output_id) page = "content";
    document.querySelector(`.nav-item[data-page="${page}"]`)?.click();
  }

  function renderCard(card, { pile = false, candidate = false } = {}) {
    const meta = [
      card.profile_name,
      card.platform,
      card.studio_output_type,
      card.studio_state,
    ].filter(Boolean).map(esc).join(" · ");
    const actions = [];
    actions.push(`<button type="button" class="text-button" data-factory-open="${esc(card.id)}">Open</button>`);
    if (pile) {
      actions.push(`<button type="button" class="secondary-button" data-factory-unpin="${esc(card.id)}">Remove</button>`);
    } else if (candidate) {
      actions.push(`<button type="button" class="primary-button" data-factory-pin="${esc(card.id)}">Add to pile</button>`);
    }
    return `<article class="factory-card" data-factory-id="${esc(card.id)}" data-factory-kind="${esc(card.kind || "")}">
      <div class="factory-card-main">
        <strong class="factory-card-title">${esc(cardLabel(card))}</strong>
        <span class="factory-card-meta">${meta || "—"}</span>
        ${card.stuck_kind || card.produce_error ? `<span class="factory-card-alert">${esc(card.stuck_kind || card.produce_error)}</span>` : ""}
      </div>
      <div class="factory-card-actions">${actions.join("")}</div>
    </article>`;
  }

  function renderLane(listId, cards, emptyCopy, options = {}) {
    const node = $(listId);
    if (!node) return;
    if (!cards?.length) {
      node.innerHTML = `<p class="subtle factory-lane-empty">${esc(emptyCopy)}</p>`;
      return;
    }
    node.innerHTML = cards.map((card) => renderCard(card, options)).join("");
  }

  function renderSummary(summary) {
    const node = $("factoryDeskSummary");
    if (!node || !summary) return;
    const chips = [
      ["Auto-high", summary.auto_high, "ok"],
      ["Needs eyes", summary.needs_eyes, summary.needs_eyes ? "alert" : "ok"],
      [`Needs assets ${summary.needs_assets_pile || 0}/${summary.needs_assets_max || 3}`, summary.needs_assets_candidates, ""],
      ["Manual", summary.manual, summary.manual ? "alert" : "ok"],
    ];
    node.innerHTML = chips.map(([label, count, tone]) => (
      `<span class="ops-desk-chip"${tone ? ` data-tone="${tone}"` : ""}>${esc(label)}: ${Number(count) || 0}</span>`
    )).join("");
  }

  function bindCardActions(desk) {
    const byId = new Map();
    for (const lane of Object.values(desk?.lanes || {})) {
      for (const card of lane || []) byId.set(card.id, card);
    }
    for (const card of desk?.needs_assets_candidates || []) byId.set(card.id, card);

    $("page-factory")?.querySelectorAll("[data-factory-open]").forEach((button) => {
      button.addEventListener("click", () => {
        const card = byId.get(button.getAttribute("data-factory-open"));
        if (card) openStudioTarget(card);
      });
    });
    $("page-factory")?.querySelectorAll("[data-factory-pin]").forEach((button) => {
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
    $("page-factory")?.querySelectorAll("[data-factory-unpin]").forEach((button) => {
      button.addEventListener("click", () => {
        mutateDesk({
          action: "unpin_needs_assets",
          id: button.getAttribute("data-factory-unpin"),
        }).catch((error) => setStatus(error.message || String(error), true));
      });
    });
  }

  function renderDesk(desk) {
    state.desk = desk;
    renderSummary(desk.summary);
    renderLane("factoryLaneAutoHigh", desk.lanes?.auto_high, "Nothing in active produce/render right now.", {});
    renderLane("factoryLaneNeedsEyes", desk.lanes?.needs_eyes, "No Ready for Review items waiting on eyes.", {});
    renderLane("factoryLaneNeedsAssets", desk.lanes?.needs_assets, "Pile empty — add up to 3 from candidates below.", { pile: true });
    renderLane("factoryLaneManual", desk.lanes?.manual, "No stuck or failed work in view.", {});
    renderLane(
      "factoryNeedsAssetsCandidates",
      desk.needs_assets_candidates,
      "No photo-wait / assets-needed candidates.",
      { candidate: true },
    );
    const pileMeta = $("factoryNeedsAssetsMeta");
    if (pileMeta) {
      const used = desk.summary?.needs_assets_pile || 0;
      const max = desk.summary?.needs_assets_max || 3;
      pileMeta.textContent = `Working pile ${used}/${max}. Approve / Send back / Delete come later — this page is the parallel Factory surface.`;
    }
    bindCardActions(desk);
  }

  async function mutateDesk(payload) {
    setStatus("Saving…");
    const desk = await fetchJson("/api/factory/desk", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    renderDesk(desk);
    setStatus(payload.action === "pin_needs_assets" ? "Added to needs-assets pile." : "Updated.");
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

  $("factoryDeskRefresh")?.addEventListener("click", () => {
    loadFactoryDesk(true).catch(() => {});
  });

  window.StudioFactoryDesk = {
    load: loadFactoryDesk,
  };
})();
