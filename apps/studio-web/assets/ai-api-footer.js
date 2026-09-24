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
    host.innerHTML = [
      '<span class="ai-api-footer-label"><strong>AI API:</strong> <span class="ai-api-dot" aria-hidden="true">🟢</span> ',
      '<strong class="ai-api-provider">' + current + '</strong> <strong>Preferred</strong></span>',
      '<button type="button" class="ai-api-toggle" id="aiApiToggle">Prefer ' + next + '</button>',
      currentProvider ? '<span class="ai-api-current" title="Provider that handled the most recent successful AI request">Current: ' + currentProvider + (failover ? ' (failover)' : '') + '</span>' : ''
    ].join("");
    document.getElementById("aiApiToggle")?.addEventListener("click", toggle);
  }

  async function load() {
    const host = document.getElementById("aiApiFooter");
    if (!host) return;
    try {
      const response = await fetch(endpoint, { credentials: "same-origin", headers: { Accept: "application/json" } });
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
        button.textContent = "Prefer " + next;
        button.title = error?.message || "Could not switch AI API";
      }
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", load, { once: true });
  else load();
  window.setInterval(load, 60000);
})();
