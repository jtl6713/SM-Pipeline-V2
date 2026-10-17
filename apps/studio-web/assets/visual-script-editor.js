(function(root) {
  "use strict";

  const api = {
    syncAvailability,
    open,
    close,
    __test: {
      estimateSeconds,
      fitsVisual,
      normalizeMode,
      selectedIdsFromRows,
    },
  };
  root.StudioVisualScriptEditor = api;
  if (typeof document === "undefined") return;

  let modal = null;
  let refs = null;
  let state = {
    snapshot: null,
    proposal: null,
    currentScript: null,
    busy: false,
  };

  function bridge() {
    return root.StudioVisualScriptBridge || null;
  }

  function clean(value) {
    return String(value ?? "").replace(/\s+/g, " ").trim();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function estimateSeconds(text, wordsPerMinute = 150) {
    const words = clean(text).split(/\s+/).filter(Boolean).length;
    if (!words) return 0;
    return Math.round((words / Math.max(60, finite(wordsPerMinute, 150))) * 60 * 100) / 100;
  }

  function fitsVisual(text, durationMs) {
    return estimateSeconds(text) <= (Math.max(0, finite(durationMs, 0)) / 1000) + 0.05;
  }

  function normalizeMode(value) {
    return clean(value).toLowerCase() === "selected" ? "selected" : "all";
  }

  function selectedIdsFromRows(rows) {
    return Array.from(rows || [])
      .filter((row) => row?.selected && row?.voiceover_mode !== "silent")
      .map((row) => clean(row.scene_id))
      .filter(Boolean);
  }

  function normalizedSnapshot(raw) {
    if (!raw) return null;
    const visualTimeline = raw.visualTimeline || raw.visual_timeline || null;
    const script = raw.script || raw.visual_script || null;
    const slides = Array.isArray(raw.scenes) ? raw.scenes : (Array.isArray(raw.slides) ? raw.slides : []);
    const visualById = new Map(
      (Array.isArray(visualTimeline?.scenes) ? visualTimeline.scenes : [])
        .map((scene, index) => [clean(scene?.scene_id || scene?.id || `scene-${index + 1}`), scene])
    );
    const scriptById = new Map(
      (Array.isArray(script?.scenes) ? script.scenes : [])
        .map((scene, index) => [clean(scene?.scene_id || scene?.id || `scene-${index + 1}`), scene])
    );
    const scenes = slides.map((slide, index) => {
      const id = clean(slide?.scene_id || slide?.id || `scene-${index + 1}`);
      const visual = visualById.get(id) || visualTimeline?.scenes?.[index] || {};
      const accepted = scriptById.get(id) || {};
      const silent = clean(
        visual.voiceover_mode
        || slide.voiceover_mode
        || accepted.voiceover_mode
        || (slide.voiceover?.enabled === false ? "silent" : "narrated")
      ).toLowerCase() === "silent";
      return {
        ...slide,
        scene_id: id,
        voiceover_mode: silent ? "silent" : "narrated",
        narration_locked: Boolean(accepted.narration_locked ?? slide.narration_locked),
        narration_text: silent ? "" : clean(accepted.narration_text ?? slide.voiceover?.text ?? slide.narration_text),
        duration_ms: Math.max(1, finite(visual.duration_ms ?? slide.duration_ms ?? finite(slide.duration_seconds, 4) * 1000, 4000)),
      };
    });
    return {
      featureEnabled: Boolean(raw.featureEnabled ?? raw.enabled),
      outputId: raw.outputId || raw.output_id || null,
      output: raw.output || null,
      visualTimeline,
      script,
      scenes,
    };
  }

  function ensureLauncher() {
    let button = document.getElementById("creativeVisualScriptButton");
    if (button) return button;
    const tools = document.querySelector(".creative-slide-heading-tools");
    if (!tools) return null;
    button = document.createElement("button");
    button.type = "button";
    button.id = "creativeVisualScriptButton";
    button.className = "secondary-button visual-script-launch";
    button.textContent = "Regenerate VO script";
    button.hidden = true;
    button.addEventListener("click", open);
    tools.appendChild(button);
    return button;
  }

  function syncAvailability() {
    const button = ensureLauncher();
    if (!button) return;
    const snapshot = normalizedSnapshot(bridge()?.snapshot?.() || null);
    button.hidden = !snapshot?.featureEnabled || !snapshot?.outputId || !(snapshot?.scenes || []).length;
    if (!button.hidden) {
      const revision = Number(snapshot?.script?.revision || 0);
      button.textContent = revision > 0 ? `Regenerate VO script · v${revision}` : "Regenerate VO script";
      button.title = "Build a visual-aware narration proposal. Nothing changes until you explicitly Accept.";
    }
  }

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "visual-script-backdrop";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="visual-script-dialog" role="dialog" aria-modal="true" aria-labelledby="visualScriptTitle">
        <header class="visual-script-header">
          <div>
            <span class="eyebrow">Visual-aware narration</span>
            <h2 id="visualScriptTitle">Regenerate voiceover script</h2>
            <p>Current narration stays authoritative until you explicitly Accept a proposal.</p>
          </div>
          <button type="button" class="icon-button" data-visual-script-close aria-label="Close narration editor">×</button>
        </header>

        <section class="visual-script-version" data-visual-script-version></section>

        <div class="visual-script-toolbar">
          <fieldset class="visual-script-mode">
            <legend>Regenerate</legend>
            <label><input type="radio" name="visualScriptMode" value="all" checked> All unlocked narrated scenes</label>
            <label><input type="radio" name="visualScriptMode" value="selected"> Selected scenes only</label>
          </fieldset>
          <button type="button" class="primary-button" data-visual-script-generate>Generate proposal</button>
        </div>

        <p class="visual-script-safety">Silent scenes remain silent. Locked scenes remain unchanged. Generating a proposal does not save narration, start TTS, rerender, approve, schedule, or publish.</p>

        <div class="visual-script-scenes" data-visual-script-scenes></div>

        <details class="visual-script-history">
          <summary>Script version history</summary>
          <div data-visual-script-history></div>
        </details>

        <p class="form-message" data-visual-script-message aria-live="polite"></p>

        <footer class="visual-script-actions">
          <button type="button" class="secondary-button" data-visual-script-discard>Discard proposal</button>
          <button type="button" class="secondary-button" data-visual-script-cancel>Close</button>
          <button type="button" class="primary-button" data-visual-script-accept disabled>Accept proposal</button>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);
    refs = {
      version: modal.querySelector("[data-visual-script-version]"),
      scenes: modal.querySelector("[data-visual-script-scenes]"),
      history: modal.querySelector("[data-visual-script-history]"),
      message: modal.querySelector("[data-visual-script-message]"),
      generate: modal.querySelector("[data-visual-script-generate]"),
      accept: modal.querySelector("[data-visual-script-accept]"),
      discard: modal.querySelector("[data-visual-script-discard]"),
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
      if (event.target.closest("[data-visual-script-close],[data-visual-script-cancel]")) close();
      if (event.target.closest("[data-visual-script-generate]")) generate().catch(showError);
      if (event.target.closest("[data-visual-script-accept]")) accept().catch(showError);
      if (event.target.closest("[data-visual-script-discard]")) discard().catch(showError);
    });
    modal.addEventListener("change", (event) => {
      if (event.target.matches('input[name="visualScriptMode"]')) renderScenes();
      if (event.target.matches("[data-script-select],[data-script-lock]")) {
        const row = event.target.closest("[data-script-row]");
        if (event.target.matches("[data-script-lock]")) enforceLockedRow(row);
        else updateRowEditing(row);
        updateAcceptState();
      }
    });
    modal.addEventListener("input", (event) => {
      if (event.target.matches("[data-script-proposed]")) {
        updateRowFit(event.target.closest("[data-script-row]"));
        updateAcceptState();
      }
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal && !modal.hidden) {
        event.preventDefault();
        close();
      }
    });
    return modal;
  }

  function currentMode() {
    return normalizeMode(modal?.querySelector('input[name="visualScriptMode"]:checked')?.value);
  }

  function open() {
    ensureModal();
    const snapshot = normalizedSnapshot(bridge()?.snapshot?.());
    if (!snapshot?.featureEnabled || !snapshot?.outputId) {
      showError(new Error("Visual-aware narration is not enabled for this output."));
      return;
    }
    state = {
      snapshot,
      proposal: null,
      currentScript: snapshot.script || null,
      busy: false,
    };
    refs.accept.disabled = true;
    refs.discard.disabled = true;
    refs.generate.disabled = false;
    setMessage("");
    renderVersion();
    renderScenes();
    renderHistory();
    modal.hidden = false;
    document.body.classList.add("visual-script-open");
  }

  function close() {
    if (!modal || modal.hidden) return;
    if (state.busy) return;
    modal.hidden = true;
    document.body.classList.remove("visual-script-open");
    state.proposal = null;
    ensureLauncher()?.focus?.();
    syncAvailability();
  }

  function setBusy(value, message = "") {
    state.busy = Boolean(value);
    refs.generate.disabled = state.busy;
    refs.discard.disabled = state.busy || !state.proposal;
    refs.accept.disabled = state.busy || !state.proposal || hasInvalidProposal();
    if (message) setMessage(message);
  }

  function setMessage(message, error = false) {
    if (!refs?.message) return;
    refs.message.textContent = String(message || "");
    refs.message.classList.toggle("error-text", Boolean(error));
  }

  function showError(error) {
    setBusy(false);
    setMessage(error?.message || String(error || "Narration request failed."), true);
  }

  function renderVersion() {
    const script = state.currentScript || state.snapshot?.script || {};
    const visual = state.snapshot?.visualTimeline || {};
    refs.version.innerHTML = `
      <span><strong>Accepted script</strong> v${escapeHtml(script.revision || 0)}</span>
      <span><strong>Visual sequence</strong> v${escapeHtml(visual.revision || 0)}</span>
      <span><strong>Scenes</strong> ${escapeHtml((state.snapshot?.scenes || []).length)}</span>
    `;
  }

  function baseRows() {
    const scriptScenes = new Map(
      (state.currentScript?.scenes || state.snapshot?.script?.scenes || [])
        .map((scene) => [clean(scene.scene_id), scene])
        .filter(([id]) => Boolean(id))
    );
    return (state.snapshot?.scenes || []).map((scene, index) => {
      const id = clean(scene.scene_id || scene.id) || `scene-${index + 1}`;
      const script = scriptScenes.get(id) || {};
      const silent = clean(scene.voiceover_mode || script.voiceover_mode).toLowerCase() === "silent";
      return {
        scene_id: id,
        ordinal: index + 1,
        voiceover_mode: silent ? "silent" : "narrated",
        narration_locked: Boolean(script.narration_locked ?? scene.narration_locked),
        narration_text: silent ? "" : clean(script.narration_text ?? scene.narration_text ?? scene.voiceover_text),
        duration_ms: Math.max(1, finite(scene.duration_ms ?? script.duration_ms, 4000)),
        selected: !silent,
      };
    });
  }

  function proposalRows() {
    if (!state.proposal?.scenes) return null;
    return state.proposal.scenes.map((scene, index) => ({
      ...scene,
      scene_id: clean(scene.scene_id) || `scene-${index + 1}`,
      ordinal: index + 1,
      duration_ms: Math.max(1, finite(scene.duration_ms, 4000)),
    }));
  }

  function renderScenes() {
    const mode = currentMode();
    const rows = proposalRows() || baseRows();
    if (!rows.length) {
      refs.scenes.innerHTML = '<div class="empty">No narration scenes are available.</div>';
      return;
    }
    refs.scenes.innerHTML = rows.map((scene) => {
      const silent = scene.voiceover_mode === "silent";
      const locked = Boolean(scene.narration_locked);
      const selected = mode === "all" ? !silent && !locked : Boolean(scene.selected) && !silent;
      const currentText = clean(scene.current_text ?? scene.narration_text);
      const proposedText = clean(scene.proposed_text ?? currentText);
      const duration = scene.duration_ms / 1000;
      const changed = state.proposal && currentText !== proposedText;
      const editable = Boolean(state.proposal) && !silent && !locked && (mode === "all" || selected);
      return `
        <article class="visual-script-row${silent ? " is-silent" : ""}${changed ? " is-changed" : ""}" data-script-row data-scene-id="${escapeHtml(scene.scene_id)}" data-duration-ms="${escapeHtml(scene.duration_ms)}">
          <header class="visual-script-row-head">
            <div>
              <strong>Scene ${escapeHtml(scene.ordinal)}</strong>
              <span>${escapeHtml(duration.toFixed(3))}s</span>
              ${silent ? '<span class="badge">No voiceover</span>' : ""}
              ${changed ? '<span class="badge ready-for-review">Changed</span>' : ""}
            </div>
            <div class="visual-script-row-controls">
              <label><input type="checkbox" data-script-select ${selected ? "checked" : ""} ${silent || mode === "all" ? "disabled" : ""}> Select</label>
              <label><input type="checkbox" data-script-lock ${locked ? "checked" : ""} ${silent ? "disabled" : ""}> Lock</label>
            </div>
          </header>
          <div class="visual-script-compare">
            <label class="form-field"><span>Current</span><textarea rows="4" readonly data-script-current>${escapeHtml(currentText)}</textarea></label>
            <label class="form-field"><span>Proposed</span><textarea rows="4" data-script-proposed ${editable ? "" : "readonly"}>${escapeHtml(silent ? "" : proposedText)}</textarea></label>
          </div>
          <div class="visual-script-fit" data-script-fit></div>
        </article>
      `;
    }).join("");
    refs.scenes.querySelectorAll("[data-script-row]").forEach(updateRowFit);
    updateAcceptState();
  }

  function renderHistory() {
    const history = state.currentScript?.history || state.snapshot?.script?.history || [];
    if (!history.length) {
      refs.history.innerHTML = '<p class="subtle">No prior accepted narration versions are stored yet.</p>';
      return;
    }
    refs.history.innerHTML = [...history].reverse().map((version) => {
      const sceneCount = Array.isArray(version.scenes) ? version.scenes.length : 0;
      const when = clean(version.accepted_at);
      const who = clean(version.accepted_by);
      return `<div class="visual-script-history-row"><strong>v${escapeHtml(version.revision || "?")}</strong><span>${escapeHtml(sceneCount)} scenes</span><span>${escapeHtml(when || "Earlier accepted version")}${who ? ` · ${escapeHtml(who)}` : ""}</span></div>`;
    }).join("");
  }

  function collectControls() {
    const locks = {};
    const selected = [];
    refs.scenes.querySelectorAll("[data-script-row]").forEach((row) => {
      const id = clean(row.dataset.sceneId);
      const lock = Boolean(row.querySelector("[data-script-lock]")?.checked);
      const selectedChecked = Boolean(row.querySelector("[data-script-select]")?.checked);
      locks[id] = lock;
      if (selectedChecked) selected.push(id);
    });
    return { locks, selected };
  }

  async function generate() {
    const b = bridge();
    if (!b?.propose && !b?.request) throw new Error("Studio narration bridge is unavailable.");
    const mode = currentMode();
    const { locks, selected } = collectControls();
    if (mode === "selected" && !selected.length) throw new Error("Select at least one narrated scene.");
    setBusy(true, "Generating a fit-safe narration proposal…");
    const result = b.propose
      ? await b.propose({
          mode,
          selected_scene_ids: selected,
          narration_locks: locks,
        })
      : await b.request({
          visual_script_action: "propose",
          visual_script_mode: mode,
          selected_scene_ids: selected,
          narration_locks: locks,
        });
    state.currentScript = result.current_script || state.currentScript;
    state.proposal = result.proposal || null;
    if (!state.proposal) throw new Error("Studio returned no narration proposal.");
    renderVersion();
    renderScenes();
    renderHistory();
    setBusy(false);
    setMessage(result.message || "Proposal ready. Review or edit the Proposed column, then Accept or Discard.");
  }

  function updateRowEditing(row) {
    if (!row) return;
    const proposed = row.querySelector("[data-script-proposed]");
    if (!proposed) return;
    const silent = row.classList.contains("is-silent");
    const locked = Boolean(row.querySelector("[data-script-lock]")?.checked);
    const selected = Boolean(row.querySelector("[data-script-select]")?.checked);
    proposed.readOnly = silent || locked || (currentMode() === "selected" && !selected);
  }

  function enforceLockedRow(row) {
    if (!row) return;
    const locked = Boolean(row.querySelector("[data-script-lock]")?.checked);
    const current = row.querySelector("[data-script-current]");
    const proposed = row.querySelector("[data-script-proposed]");
    if (locked && proposed && current) proposed.value = current.value;
    if (proposed) {
      const silent = row.classList.contains("is-silent");
      const selected = Boolean(row.querySelector("[data-script-select]")?.checked);
      proposed.readOnly = silent || locked || (currentMode() === "selected" && !selected);
    }
    updateRowFit(row);
  }

  function updateRowFit(row) {
    if (!row) return;
    const fit = row.querySelector("[data-script-fit]");
    if (!fit) return;
    const silent = row.classList.contains("is-silent");
    if (silent) {
      fit.textContent = "Intentional narration gap.";
      fit.className = "visual-script-fit is-good";
      return;
    }
    const proposed = row.querySelector("[data-script-proposed]")?.value || "";
    const durationMs = finite(row.dataset.durationMs, 0);
    const estimated = estimateSeconds(proposed);
    const good = fitsVisual(proposed, durationMs);
    fit.textContent = good
      ? `Estimated VO ${estimated.toFixed(2)}s · visual ${(durationMs / 1000).toFixed(2)}s · fits`
      : `Estimated VO ${estimated.toFixed(2)}s exceeds visual ${(durationMs / 1000).toFixed(2)}s`;
    fit.className = `visual-script-fit ${good ? "is-good" : "is-bad"}`;
  }

  function hasInvalidProposal() {
    if (!state.proposal) return true;
    return Array.from(refs.scenes.querySelectorAll("[data-script-row]")).some((row) => {
      if (row.classList.contains("is-silent")) return false;
      const locked = Boolean(row.querySelector("[data-script-lock]")?.checked);
      if (locked) return false;
      const selected = currentMode() === "all" || Boolean(row.querySelector("[data-script-select]")?.checked);
      if (!selected) return false;
      return !fitsVisual(row.querySelector("[data-script-proposed]")?.value || "", finite(row.dataset.durationMs, 0));
    });
  }

  function updateAcceptState() {
    if (!refs?.accept) return;
    refs.accept.disabled = state.busy || !state.proposal || hasInvalidProposal();
  }

  function proposalFromDom() {
    if (!state.proposal) return null;
    const byId = new Map(
      state.proposal.scenes.map((scene) => [clean(scene.scene_id), { ...scene }])
    );
    refs.scenes.querySelectorAll("[data-script-row]").forEach((row) => {
      const id = clean(row.dataset.sceneId);
      const scene = byId.get(id);
      if (!scene) return;
      scene.narration_locked = Boolean(row.querySelector("[data-script-lock]")?.checked);
      scene.selected = currentMode() === "all" || Boolean(row.querySelector("[data-script-select]")?.checked);
      scene.proposed_text = row.classList.contains("is-silent")
        ? ""
        : clean(row.querySelector("[data-script-proposed]")?.value);
    });
    return {
      ...state.proposal,
      mode: currentMode(),
      selected_scene_ids: currentMode() === "selected"
        ? Array.from(byId.values()).filter((scene) => scene.selected).map((scene) => scene.scene_id)
        : [],
      scenes: state.proposal.scenes.map((scene) => byId.get(clean(scene.scene_id)) || scene),
    };
  }

  async function accept() {
    const b = bridge();
    if (!b?.accept && !b?.request) throw new Error("Studio narration bridge is unavailable.");
    if (!state.proposal) throw new Error("Generate a proposal first.");
    if (hasInvalidProposal()) throw new Error("Shorten any red narration before accepting.");
    setBusy(true, "Accepting this narration version…");
    const acceptedProposal = proposalFromDom();
    const result = b.accept
      ? await b.accept(acceptedProposal)
      : await b.request({
          visual_script_action: "accept",
          visual_script_proposal: acceptedProposal,
        });
    state.currentScript = result.visual_script || result.refreshed?.visual_script || state.currentScript;
    state.proposal = null;
    state.snapshot = normalizedSnapshot(b.snapshot?.()) || state.snapshot;
    renderVersion();
    renderScenes();
    renderHistory();
    setBusy(false);
    setMessage(result.message || "Narration accepted. TTS/render have not started.");
    syncAvailability();
  }

  async function discard() {
    if (!state.proposal) {
      setMessage("There is no proposal to discard.");
      return;
    }
    const b = bridge();
    setBusy(true, "Discarding proposal…");
    const result = b?.discard
      ? await b.discard()
      : (b?.request ? await b.request({ visual_script_action: "discard" }) : null);
    state.proposal = null;
    state.currentScript = result?.current_script || state.currentScript;
    state.snapshot = normalizedSnapshot(b?.snapshot?.()) || state.snapshot;
    renderVersion();
    renderScenes();
    renderHistory();
    setBusy(false);
    setMessage(result?.message || "Proposal discarded. Saved narration is unchanged.");
  }

  ensureLauncher();
  syncAvailability();
})(typeof window !== "undefined" ? window : globalThis);
