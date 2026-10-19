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
  async function load() {
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
      fields.forEach((key) => { controls[key].value = data.creative?.[key] || ""; });
      disable(!data.can_edit);
      status("Changes apply to newly generated thumbnail designs and AI-written narration. Existing published or approved content is not rewritten.");
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
      fields.forEach((key) => { controls[key].value = data.creative?.[key] || ""; });
      status("Saved to " + ($("operationsCreativeProfile").textContent || "this profile") + ". Future generated media will use this guidance.");
    } catch (error) {
      if (serial === requestSerial) status(error.message || String(error), true);
    } finally {
      pending = false;
      if (serial === requestSerial && profileSelect.value === id) disable(false);
    }
  });
  reload.addEventListener("click", load);
  profileSelect.addEventListener("change", load);
  new MutationObserver(() => {
    if (profileSelect.value !== (loadedProfile || "") && !pending) load();
  }).observe(profileSelect, { childList: true });
  load();
})();