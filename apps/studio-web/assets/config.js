window.CHICAGOSHINING_STUDIO_CONFIG = {
  // Empty means use the current origin. /api/* is routed to the Studio API Worker.
  apiBase: ""
};

// Manual idea-generation progress helper.
// The main Studio bundle already renders generated_count when it sees it. This
// lightweight hook starts at 0/N immediately and polls once per second so users
// can see 1/N, 2/N, etc. as I1 creates and links each Idea Candidate.
(() => {
  const nativeFetch = window.fetch.bind(window);
  let batchRecordId = null;
  let requestedCount = 0;
  let pollTimer = null;

  function renderProgress(generated, requested) {
    if (!requested) return;
    const message = document.getElementById("ideaGenerateMessage");
    if (!message) return;
    const current = String(message.textContent || "");
    if (/unable|failed|error/i.test(current)) return;
    message.textContent = `${Math.max(0, Number(generated) || 0)} of ${requested} complete`;
  }

  async function pollBatch() {
    if (!batchRecordId) return;
    try {
      const response = await nativeFetch(`/api/ideas/generate/${encodeURIComponent(batchRecordId)}`, {
        credentials: "same-origin",
        cache: "no-store",
      });
      if (response.ok) {
        const body = await response.json();
        const batch = body?.batch || {};
        requestedCount = Number(batch.requested_count || requestedCount || 0);
        renderProgress(batch.generated_count, requestedCount);
        const status = String(batch.status || "").toLowerCase();
        if (["completed", "failed"].includes(status)) {
          batchRecordId = null;
          pollTimer = null;
          return;
        }
      }
    } catch (_) {
      // The primary Studio poller remains authoritative and handles user-facing errors.
    }
    pollTimer = setTimeout(pollBatch, 1000);
  }

  window.fetch = async (...args) => {
    const response = await nativeFetch(...args);
    try {
      const input = args[0];
      const options = args[1] || {};
      const url = typeof input === "string" ? input : input?.url || "";
      const method = String(options.method || (typeof input !== "string" ? input?.method : "") || "GET").toUpperCase();
      const pathname = new URL(url, window.location.origin).pathname;
      if (pathname === "/api/ideas/generate" && method === "POST" && response.ok) {
        response.clone().json().then((body) => {
          batchRecordId = body?.batch_record_id || null;
          requestedCount = Number(body?.requested_count || 0);
          if (!batchRecordId || !requestedCount) return;
          renderProgress(0, requestedCount);
          if (pollTimer) clearTimeout(pollTimer);
          pollTimer = setTimeout(pollBatch, 250);
        }).catch(() => {});
      }
    } catch (_) {}
    return response;
  };
})();
