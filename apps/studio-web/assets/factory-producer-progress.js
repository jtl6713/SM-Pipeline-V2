/* Durable Factory Producer activity. The authoritative progress is read from the
 * tenant-scoped Production Request, not inferred from a Factory desk refresh.
 * No notes, media URLs, or credentials are stored in localStorage.
 */
(() => {
  const STORAGE_KEY = "studio.factory.producer-progress.v1";
  const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
  const POLL_MS = 10000;
  const idOk = value => /^rec[A-Za-z0-9]+$/.test(String(value || ""));
  const revisionOk = value => /^fpr-[a-f0-9]+$/.test(String(value || ""));
  const $ = id => document.getElementById(id);
  const text = value => String(value ?? "");
  const esc = value => text(value).replace(/&/g, "&amp;").replace(/</g, "&lt;")
    .replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  const ended = status => ["completed", "needs_attention", "manual", "superseded"].includes(status);
  let checking = false;
  let entries = [];
  function restore() {
    try {
      const rows = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (!Array.isArray(rows)) return [];
      return rows.filter(row => idOk(row?.request_id) &&
        Number(row.started_at) > Date.now() - MAX_AGE_MS &&
        Number(row.started_at) <= Date.now() + 60000)
        .slice(0, 12).map(row => ({
          request_id: row.request_id,
          title: text(row.title).slice(0, 160),
          started_at: Number(row.started_at),
          status: text(row.status).slice(0, 50),
          revision_id: revisionOk(row.revision_id) ? row.revision_id : "",
          phase: Math.max(0, Math.min(5, Number(row.phase) || 0)),
          detail: text(row.detail).slice(0, 240),
          checked_at: Number(row.checked_at) || 0,
          error: text(row.error).slice(0, 240),
        }));
    } catch { return []; }
  }
  entries = restore();
  function persist() {
    entries = entries.sort((a,b) => b.started_at - a.started_at).slice(0, 12);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries)); } catch {}
  }
  const STEPS = ["Received", "Producer prep", "Production / render", "Quality Agent", "Ready for review"];
  function statusText(row) {
    return ({
      submitting: "Sending request — confirmation pending",
      uncertain: "Submission status unconfirmed",
      queued: "Accepted · waiting for Producer",
      preparing: "Producer preparing changes",
      rendering: "Production / rendering underway",
      quality: "Quality Agent verification underway",
      completed: "Ready for your review · QA passed",
      needs_attention: "Needs attention",
      manual: "Saved · manual Producer edits required",
      superseded: "A newer Producer revision exists",
    })[row.status] || "Checking Producer status";
  }
  function render() {
    const panel = $("factoryProducerProgress");
    const list = $("factoryProducerProgressList");
    if (!panel || !list) return;
    panel.hidden = entries.length === 0;
    if (!entries.length) { list.replaceChildren(); return; }
    list.innerHTML = entries.map(row => {
      const phase = Number(row.phase) || 0;
      const waiting = !ended(row.status);
      const stages = STEPS.map((step, index) => {
        const position = index + 1;
        const cls = position < phase ? " is-done" : position === phase ? " is-current" : "";
        return `<li class="factory-producer-step${cls}">${esc(step)}</li>`;
      }).join("");
      const checked = row.checked_at ? "Checked " + new Date(row.checked_at).toLocaleTimeString() : "Awaiting first status check";
      const started = new Date(row.started_at).toLocaleString();
      const detail = row.error || row.detail ||
        (row.status === "uncertain" || row.status === "submitting"
          ? "Do not resubmit until the saved Production Request has been checked."
          : "Your existing video is preserved. Nothing publishes automatically.");
      return `<article class="factory-producer-job" data-factory-producer-request="${esc(row.request_id)}">
        <div class="factory-producer-job-top">
          <div><strong>${esc(row.title || "Production change request")}</strong>
            <small>Requested ${esc(started)}</small></div>
          <strong class="factory-producer-job-state${row.status === "needs_attention" || row.status === "uncertain" ? " is-warning" : ""}">${esc(statusText(row))}</strong>
        </div>
        ${waiting ? '<progress class="factory-producer-wait" aria-label="Producer revision processing; duration unknown"></progress>' : ""}
        <ol class="factory-producer-steps" aria-label="Revision stages">${stages}</ol>
        <p class="factory-producer-job-detail">${esc(detail)}</p>
        <div class="factory-producer-job-actions"><small>${esc(checked)}</small>
          <button type="button" class="secondary-button" data-producer-progress-refresh="${esc(row.request_id)}">Check status</button>
          <button type="button" class="secondary-button" data-producer-progress-open="${esc(row.request_id)}">Open Production</button>
          ${ended(row.status) ? `<button type="button" class="text-button" data-producer-progress-dismiss="${esc(row.request_id)}">Dismiss</button>` : ""}
        </div>
      </article>`;
    }).join("");
  }
  function upsert(requestId, changes) {
    if (!idOk(requestId)) return;
    const before = entries.find(row => row.request_id === requestId);
    const now = Date.now();
    const next = {request_id:requestId, title:changes.title || before?.title || "Production change request",
      started_at:changes.started_at || before?.started_at || now,
      status:changes.status || before?.status || "submitting",
      phase:changes.phase ?? before?.phase ?? 0,
      revision_id:changes.revision_id ?? before?.revision_id ?? "",
      detail:changes.detail ?? before?.detail ?? "",
      error:changes.error ?? before?.error ?? "",
      checked_at:changes.checked_at ?? before?.checked_at ?? 0};
    entries = [next, ...entries.filter(row => row.request_id !== requestId)];
    persist(); render();
  }
  function begin({requestId, title}) {
    if (!idOk(requestId)) return;
    upsert(requestId,{title,started_at:Date.now(),status:"submitting",phase:1,
      revision_id:"",detail:"Sending your feedback to Producer. Waiting for an authoritative receipt.",
      error:"",checked_at:0});
  }
  function accept({requestId,title,result}) {
    if (!idOk(requestId)) return;
    const queued = result?.producer_queued === true;
    upsert(requestId,{title,status:queued?"queued":"manual",phase:queued?1:1,
      revision_id:revisionOk(result?.producer_revision_id)?result.producer_revision_id:"",
      detail:queued
        ? "Change request saved in Airtable. Automatic Producer work is queued; this panel checks its progress."
        : result?.producer_reason || "Feedback was saved. Open Production to make guided edits and approve a rerender.",
      error:"",checked_at:0});
    if (queued) refresh(true);
  }
  function uncertain({requestId, title, message}) {
    if (!idOk(requestId)) return;
    upsert(requestId,{title,status:"uncertain",phase:1,
      detail:"Submission may have been received. Check the authoritative Production Request before sending again.",
      error:text(message).slice(0,240),checked_at:0});
  }
  function reconcile(row, record) {
    const marker = record?.revision;
    const job = record?.job;
    const expected = row.revision_id;
    // Older client clicks or interrupted responses can recover their receipt
    // from the latest Airtable revision marker. Never invent success if absent.
    // A lost HTTP acknowledgement must not be mistaken for an earlier
    // revision's completion. Recover an id only after the POST was confirmed.
    if (!expected && revisionOk(marker?.id) && !["submitting","uncertain"].includes(row.status)) row.revision_id = marker.id;
    if (expected && revisionOk(marker?.id) && marker.id !== expected) {
      row.status = "superseded";row.phase = 1;
      row.detail = "Another revision was submitted later. Open Production to inspect the current version.";
    } else if (row.revision_id && marker?.id === row.revision_id) {
      if (marker.state === "completed") {
        row.status = "completed";row.phase = 5;
        row.detail = "The authoritative Producer revision and Quality Agent validation completed. Review the new output before approving.";
      } else if (marker.state === "needs_attention" || (job?.id === row.revision_id && job.step === "blocked")) {
        row.status = "needs_attention";row.phase = 4;
        row.detail = "Producer work requires attention. Open Production for the error and next steps.";
        row.error = text(job?.error || job?.quality_errors?.[0] || "").slice(0,240);
      } else if (marker.state === "pending") {
        const matchingJob = job?.id === row.revision_id ? job : null;
        const step = text(matchingJob?.step).toLowerCase();
        if (step === "done") {
          row.status = "quality";row.phase = 4;
          row.detail = "Render work has finished; the independent Quality Agent is validating the revision.";
        } else if (text(record.status).toLowerCase() === "promoted" ||
          /render|frame|queue|output/.test(step)) {
          row.status = "rendering";row.phase = 3;
          row.detail = "Production is running. Current stage: " + (matchingJob?.detail || matchingJob?.step || "render processing") + ".";
        } else {
          row.status = "preparing";row.phase = 2;
          row.detail = "Producer has the change request; preparing revised assets and production steps.";
        }
      }
    } else if (row.status === "submitting" || row.status === "uncertain") {
      row.status = "uncertain";row.phase = 1;
      row.detail = "No matching revision receipt has been verified. Check Production before retrying.";
    }
    row.checked_at = Date.now();
    if (row.status !== "needs_attention") row.error = "";
  }
  async function refresh(force = false, requestId = "") {
    if (checking || (!force && (document.hidden || !$("page-factory")?.classList.contains("active")))) return;
    const pending = entries.filter(row => requestId ? row.request_id === requestId : !ended(row.status)).slice(0, 4);
    if (!pending.length) return;
    checking = true;
    try {
      for (const row of pending) {
        // Keep each request independent; one busy Airtable read must not hide
        // all other receipts or replace a previously observed good state.
        try {
          const response = await fetch("/api/production-requests/" + encodeURIComponent(row.request_id) + "?fields=producer-progress", {
            credentials:"same-origin", cache:"no-store", headers:{Accept:"application/json"}
          });
          const body = await response.json().catch(() => ({}));
          if (!response.ok || body.ok !== true || body.record?.id !== row.request_id)
            throw new Error(body.error || body.message || "Status could not be verified");
          reconcile(row,body.record);
        } catch (error) {
          row.checked_at = Date.now();
          row.error = "Progress check unavailable: " + text(error.message || error).slice(0,180) +
            ". Your request has not been marked failed; try Check status.";
        }
        persist();render();
      }
    } finally { checking = false; }
  }
  document.addEventListener("click", event => {
    const button = event.target.closest?.("#factoryProducerProgress [data-producer-progress-refresh], #factoryProducerProgress [data-producer-progress-open], #factoryProducerProgress [data-producer-progress-dismiss]");
    if (!button) return;
    const id = button.getAttribute("data-producer-progress-refresh") ||
      button.getAttribute("data-producer-progress-open") ||
      button.getAttribute("data-producer-progress-dismiss");
    if (!idOk(id)) return;
    if (button.hasAttribute("data-producer-progress-refresh")) {
      // Checking a completed revision must never clear a verified result.
      refresh(true, id);
    } else if (button.hasAttribute("data-producer-progress-open")) {
      if (typeof window.StudioOpenProductionRequestById === "function")
        Promise.resolve(window.StudioOpenProductionRequestById(id)).catch(error => {
          const row = entries.find(entry => entry.request_id === id);
          if (row) {row.error = "Could not open Production: " + text(error?.message || error);render();}
        });
      else document.getElementById("navContent")?.click();
    } else {
      entries = entries.filter(entry => entry.request_id !== id);persist();render();
    }
  });
  render();
  document.addEventListener("visibilitychange", () => { if (!document.hidden) refresh(); });
  setInterval(() => refresh(), POLL_MS);
  window.StudioFactoryProducerProgress = {begin,accept,uncertain,refresh,render};
})();