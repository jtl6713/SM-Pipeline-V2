/* Profile-scoped creative direction editor. No global/localStorage settings. */
(() => {
  const $ = (id) => document.getElementById(id);
  const profileSelect = $("studioProfileSelect");
  const form = $("operationsCreativeForm");
  if (!profileSelect || !form) return;
  const message = $("operationsCreativeStatus");
  const fields = ["shared_direction", "thumbnail_instructions", "narration_instructions"];
  const controls = Object.fromEntries(fields.map((key) => [key, form.querySelector('[name="' + key + '"]')]));
  const save = $("operationsCreativeSave");
  const reload = $("operationsCreativeReload");
  let revision = "0";
  let loadedProfile = "";
  let requestSerial = 0;
  let pending = false;
  const cardsHost = $("operationsProfiles");

  // The older Operations renderer still fetches all profiles to populate
  // canonical voice/music choices; only the header-selected card is visible.
  function showSelectedProfileOnly() {
    const id = String(profileSelect.value || "");
    if (!cardsHost) return;
    let visible = 0;
    cardsHost.querySelectorAll(".ops-profile-card[data-profile-id]").forEach((card) => {
      const matches = card.dataset.profileId === id;
      card.hidden = !matches;
      if (matches) {
        card.style.removeProperty("display");
        visible += 1;
      } else {
        card.style.setProperty("display", "none", "important");
      }
    });
    const meta = $("operationsIdeaMeta");
    if (visible && meta && !/unable|error|failed/i.test(meta.textContent || "")) {
      meta.textContent = "Showing settings for the selected profile only. Change the Profile in the header to edit a different city.";
    }
  }
  if (cardsHost) new MutationObserver(showSelectedProfileOnly).observe(cardsHost, { childList: true });
  
  function status(text, isError = false) {
    message.textContent = text || "";
    message.classList.toggle("error-text", Boolean(isError));
  }
  function disable(value) {
    for (const control of Object.values(controls)) control.disabled = value;
    save.disabled = value;
    reload.disabled = value;
  }
  async function call(path, options = {}) {
    const response = await fetch(path, {
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      ...options,
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || data?.message || "Creative guidance request failed (" + response.status + ")");
    return data;
  }
  function profileAdminVisible() {
    return !$("operationsProfilesPanel")?.hidden && $("page-operations")?.classList.contains("active");
  }
  async function load() {
    if (!profileAdminVisible()) { loadedProfile = ""; return; }
    const id = String(profileSelect.value || "");
    const serial = ++requestSerial;
    loadedProfile = "";
    revision = "0";
    disable(true);
    if (!/^rec[A-Za-z0-9]{14}$/.test(id)) {
      status("Select a Content Profile in the header to edit its creative instructions.");
      $("operationsCreativeProfile").textContent = "No profile selected";
      return;
    }
    $("operationsCreativeProfile").textContent =
      profileSelect.selectedOptions?.[0]?.textContent?.trim() || id;
    status("Loading instructions for this profile…");
    try {
      const data = await call("/api/operations/profiles/" + id + "/creative");
      if (serial !== requestSerial || profileSelect.value !== id) return;
      loadedProfile = id;
      revision = String(data.revision || "0");
      fields.forEach((key) => {
        controls[key].value = data.creative?.[key] || "";
        const source = $("operationsCreativeSource_" + key);
        if (source) {
          const item = data.sources?.[key] || {};
          source.textContent = item.inherited
            ? "Existing Airtable guidance: " + (item.label || "no value yet") + ". Editing creates a copy for this profile."
            : "Saved in Airtable: " + (item.label || "Profile-specific creative guidance") + ".";
        }
      });
      const referenceHost = $("operationsCreativeReferences");
      if (referenceHost) {
        referenceHost.replaceChildren();
        const addReference = (label, scope, items) => {
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = label + " (" + scope + ")";
          details.append(summary);
          for (const [name, value] of items) {
            if (!value) continue;
            const heading = document.createElement("strong");
            heading.textContent = name;
            const pre = document.createElement("pre");
            pre.className = "ops-prompt-text";
            pre.textContent = value;
            details.append(heading, pre);
          }
          referenceHost.append(details);
        };
        (data.references || []).forEach((ref) => addReference(ref.label, ref.scope, [["Stored database guidance", ref.text]]));
        (data.templates || []).forEach((ref) => addReference(ref.label, ref.scope, [
          ["System Prompt", ref.system_prompt],
          ["User Prompt Template", ref.user_prompt_template],
        ]));
      }
      disable(!data.can_edit);
      status("Loaded existing Airtable prompts and profile overrides. Save creates a selected-profile version; shared Brand, Persona and P1/P2 templates remain unchanged.");
    } catch (error) {
      if (serial !== requestSerial) return;
      status(error.message || String(error), true);
    }
  }
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const id = loadedProfile;
    if (pending || !id || id !== profileSelect.value) return;
    const serial = ++requestSerial;
    const creative = Object.fromEntries(fields.map((key) => [key, controls[key].value]));
    pending = true;
    disable(true);
    status("Saving profile creative instructions…");
    try {
      const data = await call("/api/operations/profiles/" + id + "/creative", {
        method: "PATCH", body: JSON.stringify({ revision, creative }),
      });
      if (serial !== requestSerial || profileSelect.value !== id) return;
      revision = String(data.revision || revision);
      fields.forEach((key) => {
        controls[key].value = data.creative?.[key] || "";
        const source = $("operationsCreativeSource_" + key);
        if (source) source.textContent = "Saved in Airtable: selected profile creative guidance override.";
      });
      status("Saved profile-specific instructions to Airtable for " + ($("operationsCreativeProfile").textContent || "this profile") + ". Shared prompts were not changed.");
    } catch (error) {
      if (serial === requestSerial) status(error.message || String(error), true);
    } finally {
      pending = false;
      if (serial === requestSerial && profileSelect.value === id) disable(false);
    }
  });
  reload.addEventListener("click", load);
  $("operationsTabProfiles")?.addEventListener("click", () => queueMicrotask(load));
  profileSelect.addEventListener("change", () => { showSelectedProfileOnly(); load(); });
  new MutationObserver(() => {
    if (profileSelect.value !== (loadedProfile || "") && !pending) load();
  }).observe(profileSelect, { childList: true });
  // The preexisting tab switcher may not know this new tab. Ensure switching
  // to Global Admin works while preserving its existing scheduling handlers.
  const globalTab = $("operationsTabGlobal");
  const globalPanel = $("operationsGlobalPanel");
  const otherTabs = Array.from(document.querySelectorAll("#operationsControlView .ops-card-tab"))
    .filter((tab) => tab !== globalTab);
  if (globalTab && globalPanel) {
    globalTab.addEventListener("click", () => {
      document.querySelectorAll("#operationsControlView .ops-tab-panel").forEach((panel) => { panel.hidden = panel !== globalPanel; });
      document.querySelectorAll("#operationsControlView .ops-card-tab").forEach((tab) => {
        const active = tab === globalTab;
        tab.classList.toggle("active", active);
        tab.setAttribute("aria-selected", String(active));
        tab.tabIndex = active ? 0 : -1;
      });
    });
    for (const tab of otherTabs) tab.addEventListener("click", () => { globalPanel.hidden = true; });
  }
  showSelectedProfileOnly();
  if (profileAdminVisible()) load();
})();