(() => {
  "use strict";
  // #2574: A time-of-day countdown is not evidence of a successful handoff.
  // Display the saved autonomous attempt's real outcomes without user action.
  const ID = "ideasHandoffHealth";
  const base = String(window.CHICAGOSHINING_STUDIO_CONFIG?.apiBase || "").replace(/\/$/, "")
    || window.location.origin;
  const node = () => document.getElementById(ID);
  const visible = () => document.getElementById("page-ideas")?.classList.contains("active");

  function summary(run) {
    const rows = Array.isArray(run?.resumed) ? run.resumed : [];
    const missing = rows.filter((row) => /No enabled platform destinations were found/i
      .test(String(row?.skip_reason || row?.error || ""))).length;
    const read = rows.filter((row) => /Supabase read unavailable|Canonical Supabase read unavailable/i
      .test(String(row?.skip_reason || row?.error || ""))).length;
    const failed = rows.filter((row) => ["skipped", "failed", "error"].includes(
      String(row?.status || "").toLowerCase())).length;
    const generalFailure = ["failed", "skipped", "error"].includes(String(run?.status || "").toLowerCase());
    if (!failed && !generalFailure) return "";
    const total = rows.length || "unknown";
    const parts = [];
    if (missing) parts.push(`${missing} missing platform destinations`);
    if (read) parts.push(`${read} Supabase read errors`);
    if (!parts.length) parts.push(`${failed || total} failed or skipped requests`);
    const slot = String(run?.slot || "").trim();
    return `Production handoff problem from last autonomous run${slot ? " (" + slot + ")" : ""}: ${parts.join(", ")}. Studio owns recovery; no user action is required.`;
  }

  let busy = false;
  async function refresh() {
    if (busy || !visible() || !node()) return;
    busy = true;
    try {
      const response = await fetch(`${base}/api/operations`, {
        credentials: "same-origin", cache: "no-store",
        signal: AbortSignal.timeout ? AbortSignal.timeout(15000) : undefined,
      });
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      const result = await response.json();
      if (result?.ok === false) throw Error("Operations status unavailable");
      const message = summary(result.last_autonomous_run || {});
      const target = node();
      if (!target) return;
      target.hidden = !message;
      target.textContent = message;
    } catch {
      const target = node();
      if (target) {
        target.hidden = false;
        target.textContent = "Production handoff status could not be verified. The hourly countdown does not guarantee production advanced.";
      }
    } finally {
      busy = false;
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target?.closest?.('[data-page="ideas"]')) setTimeout(refresh, 0);
  });
  setInterval(refresh, 60000);
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", refresh, { once: true });
  } else {
    void refresh();
  }
  window.studioAutonomousHandoffSummary = summary;
})();
