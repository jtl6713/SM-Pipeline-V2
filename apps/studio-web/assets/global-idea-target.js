/* Global Admin: one Airtable-backed automatic idea target shared by all city profiles. */
(() => {
  const target = document.getElementById("operationsGlobalIdeaTarget");
  const save = document.getElementById("operationsSaveGlobalIdeaTarget");
  const status = document.getElementById("operationsGlobalIdeaTargetStatus");
  const tab = document.getElementById("operationsTabGlobal");
  if (!target || !save || !status || !tab) return;

  const endpoint = "/api/operations/schedule-settings";
  let saving = false;
  function show(message, error = false) {
    status.textContent = message;
    status.classList.toggle("error-text", Boolean(error));
  }
  async function request(method, payload) {
    const response = await fetch(endpoint, {
      method, credentials: "same-origin",
      headers: { Accept: "application/json", ...(payload ? { "Content-Type": "application/json" } : {}) },
      ...(payload ? { body: JSON.stringify(payload) } : {}),
      signal: AbortSignal.timeout(15000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok || data?.ok === false) {
      throw new Error(data?.error || data?.message || "Global settings request failed (" + response.status + ")");
    }
    return data;
  }
  async function load() {
    if (saving) return;
    show("Reading global idea limit from Airtable…");
    try {
      const data = await request("GET");
      if (data.global_automatic_idea_target_invalid ||
          !Number.isInteger(data.global_automatic_idea_target)) {
        throw new Error("Saved global idea limit is invalid. Automatic generation is blocked until corrected.");
      }
      target.value = String(data.global_automatic_idea_target);
      show("Current limit: " + data.global_automatic_idea_target +
        " combined Scheduled + Awaiting Approval outputs across all profiles.");
    } catch (error) {
      show(error.message || String(error), true);
    }
  }
  save.addEventListener("click", async () => {
    if (saving) return;
    const value = Number(target.value);
    if (!Number.isSafeInteger(value) || value < 1 || value > 10000 || target.value.trim() === "") {
      show("Enter a whole number from 1 to 10,000.", true);
      return;
    }
    saving = true;
    save.disabled = true;
    show("Saving global idea limit…");
    try {
      const data = await request("PUT", { global_automatic_idea_target: value });
      if (data.global_automatic_idea_target !== value) throw new Error("The saved value did not match your request");
      const verified = await request("GET");
      if (verified.global_automatic_idea_target !== value) throw new Error("Save responded but readback does not match; verify before continuing");
      show("Saved and verified: " + value +
        " across every active profile. Overnight and hourly automatic generation use this one limit.");
    } catch (error) {
      show(error.message || String(error), true);
    } finally {
      saving = false;
      save.disabled = false;
    }
  });
  tab.addEventListener("click", load);
  if (!document.getElementById("operationsGlobalPanel")?.hidden) load();
})();
