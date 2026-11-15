/* Manual classification UI for Asset Manager — issue #1716. */
(function () {
  "use strict";
  const DEFINITIONS = [
    ["city", "City", false],
    ["neighborhood", "Neighborhood", false],
    ["location", "Location / address", false],
    ["landmarks", "Landmarks", true],
    ["subjects", "Visible subjects", true],
    ["objects", "Objects", true],
    ["scene_type", "Scene / shot type", false],
    ["time_of_day", "Time of day", false],
    ["weather", "Weather", false],
    ["keywords", "Tags / keywords", true],
  ];
  const selected = new Set();
  let profileOnPage = "";
  let busy = false;
  let editingIds = [];
  const $ = id => document.getElementById(id);
  const bridge = () => window.StudioManualClassificationBridge;
  const profile = () => String(bridge()?.profileId?.() || "").trim();
  const message = text => { const el = $("libraryManualFeedback"); if (el) el.textContent = text || ""; };
  const labelText = value => Array.isArray(value) ? value.join(", ") : String(value ?? "");
  const isUploadStubDescription = value => /studio asset manager upload stored in google drive\.?/i.test(String(value || "").trim());

  function setup() {
    const list = $("libraryList");
    if (!list || $("libraryManualToolbar")) return;
    const toolbar = document.createElement("div");
    toolbar.id = "libraryManualToolbar";
    toolbar.className = "library-manual-toolbar";
    toolbar.hidden = true;
    toolbar.innerHTML = '<div><strong>Manual asset classification</strong><p>Select up to 10 photos or clips to apply the same tags. AI tags are kept separately.</p></div><span id="libraryManualSelectedCount">0 selected</span><button class="secondary-button" id="libraryManualBulk" type="button" disabled>Classify selected</button><button class="secondary-button" id="libraryManualClear" type="button" disabled>Clear</button>';
    list.parentNode.insertBefore(toolbar, list);
    const backdrop = document.createElement("div");
    backdrop.id = "libraryManualBackdrop";
    backdrop.hidden = true;
    backdrop.className = "library-manual-backdrop";
    backdrop.innerHTML = '<div class="library-manual-dialog" role="dialog" aria-modal="true" aria-labelledby="libraryManualHeading"><div class="library-manual-head"><div><h2 id="libraryManualHeading">Edit classification</h2><p id="libraryManualSubtitle" class="subtle"></p></div><button type="button" class="secondary-button" id="libraryManualClose">Close</button></div><div id="libraryManualFeedback" role="status" aria-live="polite"></div><form id="libraryManualForm"><label class="form-field"><span>Save mode</span><select id="libraryManualMode"><option value="override">Replace selected fields (edit existing)</option><option value="add">Add tags; preserve existing entries</option></select></label><p class="subtle">Existing values are loaded so you can edit them. Check each field you want to save. For an intentional blank override, select the field and leave its value empty. AI source data is never deleted.</p><div id="libraryManualFields" class="library-manual-fields"></div><section class="library-manual-audit"><h3>Recent manual classification changes</h3><div id="libraryManualHistory" class="subtle">No manual changes yet.</div></section><div class="library-manual-footer"><button class="secondary-button" type="button" id="libraryManualCancel">Cancel</button><button class="primary-button" type="submit" id="libraryManualSave">Save classification</button></div></form></div>';
    document.body.appendChild(backdrop);
    $("libraryManualClose").addEventListener("click", close);
    $("libraryManualCancel").addEventListener("click", close);
    backdrop.addEventListener("click", event => { if (event.target === backdrop) close(); });
    document.addEventListener("keydown", event => { if (event.key === "Escape" && !backdrop.hidden) close(); });
    $("libraryManualBulk").addEventListener("click", () => open([...selected]));
    $("libraryManualClear").addEventListener("click", () => {
      selected.clear();
      list.querySelectorAll("[data-library-manual-check]").forEach(input => { input.checked = false; });
      updateToolbar();
    });
    $("libraryManualForm").addEventListener("submit", save);
    list.addEventListener("change", event => {
      const input = event.target.closest("[data-library-manual-check]");
      if (!input) return;
      const id = input.dataset.libraryManualCheck;
      if (input.checked && selected.size >= 10 && !selected.has(id)) {
        input.checked = false;
        window.alert("Select no more than 10 assets per bulk update.");
        return;
      }
      if (input.checked) selected.add(id); else selected.delete(id);
      updateToolbar();
    });
    list.addEventListener("click", event => {
      const button = event.target.closest("[data-library-manual-edit]");
      if (button) { event.preventDefault(); open([button.dataset.libraryManualEdit]); }
    });
    let currentCards = "";
    function observeCards() {
      const ids = [...list.querySelectorAll('article[data-library-record-type="media_asset"][data-library-id]')].map(el => el.dataset.libraryId);
      const signature = ids.join("|");
      if (signature !== currentCards || profile() !== profileOnPage) {
        currentCards = signature;
        profileOnPage = profile();
        selected.clear();
      }
      list.querySelectorAll('article[data-library-record-type="media_asset"][data-library-id]').forEach(card => {
        if (card.dataset.libraryManualReady) return;
        const actions = card.querySelector(".music-actions");
        if (!actions) return;
        const id = card.dataset.libraryId;
        const selectLabel = document.createElement("label");
        selectLabel.className = "library-manual-card-select";
        const check = document.createElement("input");
        check.type = "checkbox";
        check.dataset.libraryManualCheck = id;
        check.setAttribute("aria-label", "Select this asset for bulk classification");
        selectLabel.append(check, document.createTextNode(" Select"));
        const button = document.createElement("button");
        button.type = "button";
        button.className = "secondary-button";
        button.dataset.libraryManualEdit = id;
        button.textContent = "Edit classification";
        actions.append(selectLabel, button);
        card.dataset.libraryManualReady = "1";
      });
      updateToolbar();
    }
    new MutationObserver(observeCards).observe(list, {childList: true});
    observeCards();
  }
  function updateToolbar() {
    const count = $("libraryManualSelectedCount");
    const bulk = $("libraryManualBulk");
    const clear = $("libraryManualClear");
    const toolbar = $("libraryManualToolbar");
    const hasAssets = Boolean($("libraryList")?.querySelector('article[data-library-record-type="media_asset"]'));
    if (toolbar) toolbar.hidden = !hasAssets;
    if (count) count.textContent = selected.size + " selected";
    if (bulk) bulk.disabled = selected.size === 0 || busy;
    if (clear) clear.disabled = selected.size === 0 || busy;
  }
  function close() {
    if (busy) return;
    $("libraryManualBackdrop").hidden = true;
    editingIds = [];
    message("");
  }
  function fieldRows(record, bulk) {
    const container = $("libraryManualFields");
    container.replaceChildren();
    const manual = bulk ? {} : (record?.manual_classification || {});
    const ai = bulk ? {} : (record?.ai_classification || {});
    const effective = bulk ? {} : (record?.effective_classification || {});

    // Description is the card prose (Asset_Description) — edit existing text in place.
    const descWrap = document.createElement("label");
    descWrap.className = "library-manual-field library-manual-description";
    const descHeading = document.createElement("span");
    descHeading.className = "library-manual-field-title";
    const descCheck = document.createElement("input");
    descCheck.type = "checkbox";
    descCheck.dataset.classificationApply = "description";
    const descName = document.createElement("strong");
    descName.textContent = "Description";
    descHeading.append(descCheck, descName);
    const descInput = document.createElement("textarea");
    descInput.dataset.classificationInput = "description";
    descInput.rows = 4;
    descInput.placeholder = bulk
      ? "Shared description for each selected asset"
      : "Describe the scene — this is the text shown on the asset card";
    const rawDescription = bulk ? "" : String(record?.description || "");
    if (!bulk && rawDescription && !isUploadStubDescription(rawDescription)) {
      descInput.value = rawDescription;
      descCheck.checked = true;
    } else if (!bulk && isUploadStubDescription(rawDescription)) {
      descInput.placeholder = "Replace the upload stub with a real scene description";
    }
    descInput.addEventListener("input", () => { descCheck.checked = true; });
    const descInfo = document.createElement("small");
    descInfo.textContent = bulk
      ? "Replaces the description on each selected asset"
      : (isUploadStubDescription(rawDescription)
        ? "Current card text is still the upload stub — edit and save to replace it."
        : (rawDescription ? "Loaded from the current Asset Description — edit in place." : "No description yet."));
    descWrap.append(descHeading, descInput, descInfo);
    container.append(descWrap);

    DEFINITIONS.forEach(([key, title, multiple]) => {
      const wrap = document.createElement("label");
      wrap.className = "library-manual-field";
      const heading = document.createElement("span");
      heading.className = "library-manual-field-title";
      const check = document.createElement("input");
      check.type = "checkbox";
      check.dataset.classificationApply = key;
      const name = document.createElement("strong");
      name.textContent = title;
      heading.append(check, name);
      const input = document.createElement(multiple ? "textarea" : "input");
      if (!multiple) input.type = "text";
      input.dataset.classificationInput = key;
      input.placeholder = multiple ? "Comma-separated values" : "Enter classification";
      if (multiple) input.rows = 2;
      // Prefill with effective (manual override, else AI) so existing text is editable.
      const current = Object.prototype.hasOwnProperty.call(manual, key)
        ? manual[key]
        : (Object.prototype.hasOwnProperty.call(effective, key) ? effective[key] : ai[key]);
      if (current != null && labelText(current)) {
        input.value = labelText(current);
        if (!bulk) check.checked = true;
      }
      input.addEventListener("input", () => { check.checked = true; });
      const info = document.createElement("small");
      const source = Object.prototype.hasOwnProperty.call(manual, key)
        ? "manual override saved"
        : (Object.prototype.hasOwnProperty.call(ai, key) && labelText(ai[key]) ? "from AI — edit to override" : "not classified");
      info.textContent = bulk ? "Apply to each selected asset" : "AI: " + (labelText(ai[key]) || "not classified") + " · " + source;
      wrap.append(heading, input, info);
      container.append(wrap);
    });
  }
  function showAudit(record) {
    const target = $("libraryManualHistory");
    target.replaceChildren();
    const events = record?.classification_history || [];
    if (!events.length) { target.textContent = "No manual changes recorded."; return; }
    events.slice(-8).reverse().forEach(event => {
      const row = document.createElement("p");
      const when = event?.at ? new Date(event.at).toLocaleString() : "Date unavailable";
      row.textContent = when + " · " + String(event?.actor || "Studio editor") + " · " + String(event?.mode || "edit") + " · " + (Array.isArray(event?.fields) ? event.fields.join(", ") : "");
      target.append(row);
    });
  }
  async function open(ids) {
    if (busy || !ids.length) return;
    const currentProfile = profile();
    if (!/^rec[A-Za-z0-9]+$/.test(currentProfile)) {
      window.alert("Select the content profile for these assets before classifying.");
      return;
    }
    if (!bridge()?.api) { window.alert("Studio is still loading; open Asset Manager again."); return; }
    editingIds = ids.slice(0, 10);
    const bulk = editingIds.length > 1;
    $("libraryManualBackdrop").hidden = false;
    $("libraryManualHeading").textContent = bulk ? "Bulk classification" : "Edit classification";
    $("libraryManualSubtitle").textContent = bulk
      ? "Applying changes to " + editingIds.length + " selected assets in this profile"
      : "Loading asset classification…";
    $("libraryManualMode").value = bulk ? "add" : "override";
    fieldRows(null, true);
    showAudit(null);
    message("");
    if (!bulk) {
      busy = true;
      try {
        const data = await bridge().api("/api/library/" + encodeURIComponent(ids[0]) + "/manual-classification?profile=" + encodeURIComponent(currentProfile));
        if (!data?.record) throw new Error("Asset details could not be loaded.");
        $("libraryManualSubtitle").textContent = data.record.name || ids[0];
        fieldRows(data.record, false);
        showAudit(data.record);
      } catch (error) {
        message(error?.message || "Unable to load the classification.");
      } finally { busy = false; }
    }
    $("libraryManualFields")?.querySelector("textarea,input")?.focus();
  }
  async function save(event) {
    event.preventDefault();
    if (busy || !editingIds.length) return;
    const patch = {};
    let description;
    let descriptionSelected = false;
    DEFINITIONS.forEach(([key, , multiple]) => {
      if (!$("libraryManualFields").querySelector('[data-classification-apply="' + key + '"]')?.checked) return;
      const raw = $("libraryManualFields").querySelector('[data-classification-input="' + key + '"]')?.value || "";
      patch[key] = multiple ? raw.split(/[,;\n]+/).map(v => v.trim()).filter(Boolean) : raw.trim();
    });
    if ($("libraryManualFields").querySelector('[data-classification-apply="description"]')?.checked) {
      descriptionSelected = true;
      description = $("libraryManualFields").querySelector('[data-classification-input="description"]')?.value || "";
    }
    if (!Object.keys(patch).length && !descriptionSelected) {
      message("Select at least one field to save.");
      return;
    }
    const currentProfile = profile();
    const bulk = editingIds.length > 1;
    const url = bulk ? "/api/library/manual-classification" : "/api/library/" + encodeURIComponent(editingIds[0]) + "/manual-classification";
    busy = true; updateToolbar();
    $("libraryManualSave").disabled = true;
    message("Saving manual classification…");
    try {
      const payload = {mode: $("libraryManualMode").value};
      if (Object.keys(patch).length) payload.patch = patch;
      if (descriptionSelected) payload.description = description;
      if (bulk) payload.record_ids = editingIds.slice();
      const result = await bridge().api(url + "?profile=" + encodeURIComponent(currentProfile), {
        method: bulk ? "POST" : "PATCH",
        body: JSON.stringify(payload),
        timeoutMs: 60000,
        retries: 0,
      });
      if (result.failed) {
        const failures = (result.results || []).filter(row => !row.ok).map(row => row.id + ": " + row.error);
        message(result.message + " " + failures.join(" | "));
      } else {
        $("libraryManualBackdrop").hidden = true;
        editingIds = [];
        selected.clear();
        message("");
      }
      window.StudioManualClassificationRefreshToken = String(Date.now());
      try { await bridge().reload(); } catch {}
      if (!result.failed) {
        const status = $("libraryUploadMessage");
        if (status) status.textContent = result.message || "Manual classification saved.";
      }
    } catch (error) {
      message(error?.message || "Manual classification could not be saved.");
    } finally {
      busy = false;
      $("libraryManualSave").disabled = false;
      updateToolbar();
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", setup);
  else setup();
})();
