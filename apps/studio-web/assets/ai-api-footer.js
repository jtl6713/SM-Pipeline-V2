(() => {
  const endpoint = "/api/ai-api";
  const CACHE_KEY = "studio.ai_api_status_v1";
  let current = "OpenAI";
  let lastPayload = null;

  function readCache() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
      return null;
    }
  }

  function writeCache(payload) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(payload || {}));
    } catch {
      /* ignore */
    }
  }

  function render(payload = {}, { stale = false } = {}) {
    const host = document.getElementById("aiApiFooter");
    if (!host) return;
    lastPayload = payload;
    current = payload.preferred_provider === "Azure" ? "Azure" : "OpenAI";
    const next = current === "OpenAI" ? "Azure" : "OpenAI";
    const currentProvider = payload.current_provider === "Azure" || payload.current_provider === "OpenAI"
      ? payload.current_provider
      : null;
    const failover = Boolean(payload.failover_active);
    const failoverEnabled = Boolean(payload.failover_enabled);
    const primaryStage = String(payload.last_primary_stage || "").trim();
    const primaryKind = String(payload.last_primary_kind || "").trim();
    const primaryAt = String(payload.last_primary_at || "").trim();
    const primaryFailover = Boolean(payload.last_primary_failover);
    const primaryBits = [];
    if (primaryStage) primaryBits.push(primaryStage);
    if (primaryKind) primaryBits.push(primaryKind);
    if (primaryFailover) primaryBits.push("failover");
    const primaryLabel = primaryBits.length
      ? ('<span class="ai-api-primary-hit" title="Last PRIMARY OpenAI hit' + (primaryAt ? (" at " + primaryAt) : "") + '">PRIMARY hit: ' + primaryBits.join(" · ") + "</span>")
      : "";
    const staleNote = stale
      ? '<span class="ai-api-stale" title="Airtable was busy — showing the last known preference">· cached</span>'
      : "";
    host.innerHTML = [
      '<span class="ai-api-footer-label"><strong>AI API:</strong> <span class="ai-api-dot" aria-hidden="true">🟢</span> ',
      '<strong class="ai-api-provider">' + current + '</strong> <strong>Preferred</strong>' + staleNote + '</span>',
      '<span class="ai-api-failover">' + (failoverEnabled ? (next + ' Failover') : (next + ' Standby · disabled')) + '</span>',
      '<button type="button" class="ai-api-toggle" id="aiApiToggle">Make ' + next + ' Preferred</button>',
      currentProvider ? '<span class="ai-api-current" title="Provider that handled the most recent successful AI request">Current: ' + currentProvider + (failover ? ' (failover)' : '') + '</span>' : '',
      primaryLabel
    ].join("");
    document.getElementById("aiApiToggle")?.addEventListener("click", toggle);
  }

  async function load() {
    const host = document.getElementById("aiApiFooter");
    if (!host) return;
    try {
      const response = await fetch(endpoint, {
        credentials: "same-origin",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(6000),
      });
      if (!response.ok) throw new Error("AI API status unavailable");
      const payload = await response.json();
      writeCache(payload);
      render(payload);
    } catch {
      const cached = lastPayload || readCache();
      if (cached) {
        render(cached, { stale: true });
        return;
      }
      // Default preferred so the strip never looks dead when Airtable is cooling down.
      render({ preferred_provider: current || "OpenAI", failover_enabled: true }, { stale: true });
    }
  }

  async function toggle(event) {
    const button = event?.currentTarget;
    const next = current === "OpenAI" ? "Azure" : "OpenAI";
    if (button) {
      button.disabled = true;
      button.textContent = "Switching…";
    }
    try {
      const response = await fetch(endpoint, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ preferred_provider: next }),
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || payload?.message || "Could not switch AI API");
      writeCache(payload);
      render(payload);
      window.setTimeout(load, 1200);
    } catch (error) {
      if (button) {
        button.disabled = false;
        button.textContent = "Make " + next + " Preferred";
        button.title = error?.message || "Could not switch AI API";
      }
    }
  }

  const boot = readCache();
  if (boot) render(boot, { stale: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
  window.setInterval(load, 60000);
})();
