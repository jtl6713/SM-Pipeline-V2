(() => {
  const endpoint = "/api/ai-api";
  let current = "OpenAI";

  function render(payload = {}) {
    const host = document.getElementById("aiApiFooter");
    if (!host) return;
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
    host.innerHTML = [
      '<span class="ai-api-footer-label"><strong>AI API:</strong> <span class="ai-api-dot" aria-hidden="true">🟢</span> ',
      '<strong class="ai-api-provider">' + current + '</strong> <strong>Preferred</strong></span>',
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
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error("AI API status unavailable");
      render(await response.json());
    } catch {
      host.innerHTML = '<span class="ai-api-footer-label"><strong>AI API:</strong> status unavailable</span>';
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
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || payload?.message || "Could not switch AI API");
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

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
  window.setInterval(load, 60000);
})();
