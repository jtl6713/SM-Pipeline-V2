/* Chicago manual Rendering Review — read-only preview until verified writer/runner integration.
 * No enrollment, producer messages, approvals, hold releases or scheduling actions.
 */
(() => {
  const $ = id => document.getElementById(id);
  const nav = $("navRenderingReview"), root = $("page-rendering-review");
  if (!nav || !root) return;
  const list = $("rrQueueList"), details = $("rrDetails"), status = $("rrStatus");
  const refresh = $("rrRefresh"), next = $("rrNext"), pageLabel = $("rrPage");
  const chicago = "recT2rbKX3MF7cVFU";
  let allowed = false, busy = false, nextCursor = null, currentPage = 0, selection = "";
  const element = (tag, value, className) => {
    const node = document.createElement(tag);
    if (value != null) node.textContent = String(value);
    if (className) node.className = className;
    return node;
  };
  const message = (value, error = false) => {
    status.textContent = String(value);
    status.dataset.error = String(error);
  };
  const safeUrl = value => {
    try {
      const url = new URL(String(value || ""));
      return url.protocol === "https:" ? url.href : "";
    } catch { return ""; }
  };
  async function getJson(path) {
    const res = await fetch(path, {
      method:"GET", credentials:"same-origin", headers:{"Accept":"application/json"},
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body.ok !== true)
      throw new Error(body.error || body.message || "Rendering Review read unavailable");
    return body;
  }
  async function inspect(item) {
    selection = item.output_id;
    details.replaceChildren();
    details.append(element("h3", item.title || "Completed Reel"));
    const label = item.output_number ? "Output #" + item.output_number : "Saved output";
    details.append(element("p", label + " · Chicago Instagram Reel", "subtle"));
    const url = safeUrl(item.final_file_url);
    if (url) {
      const video = element("video", null, "rr-player");
      video.controls = true;
      video.preload = "metadata";
      video.playsInline = true;
      video.src = url;
      details.append(video);
      const external = element("a", "Open original video", "secondary-button");
      external.href = url; external.target = "_blank"; external.rel = "noopener noreferrer";
      details.append(external);
    } else {
      details.append(element("p",
        "A rendered file is recorded, but there is no direct playable preview URL.", "subtle"));
    }
    details.append(element("p", item.review_held
      ? "An existing review hold is recorded. No changes can be made here."
      : item.dispatch_started
        ? "Publishing dispatch has started. This output cannot be enrolled."
        : "Read-only pilot preparation: review chats and render revisions are not active.",
      "rr-guard-note"));
    // Review history can be read for a previously enrolled output; 404 is
    // expected for ordinary renders and must never initiate a session.
    if (!item.review_held) return;
    try {
      const result = await getJson("/api/rendering-review/outputs/" + encodeURIComponent(item.output_id));
      if (selection !== item.output_id) return;
      const messages = result.session?.messages || [];
      const heading = element("h4", "Saved producer conversation");
      details.append(heading);
      if (!messages.length) details.append(element("p", "No messages yet.", "subtle"));
      for (const entry of messages.slice(-40)) {
        const p = element("p", entry.content, "rr-message");
        p.setAttribute("data-actor", entry.role === "producer" ? "producer" : "user");
        details.append(p);
      }
      if (result.integrity_error) details.append(element("p",
        "Review hold integrity requires administrator attention.", "rr-guard-note"));
    } catch {
      if (selection === item.output_id)
        details.append(element("p", "Saved review history is unavailable.", "subtle"));
    }
  }
  async function load(next = false) {
    if (!allowed || busy) return;
    busy = true; refresh.disabled = true; next.disabled = true;
    const cursor = next ? nextCursor : null;
    message("Reading completed Chicago Instagram Reels…");
    try {
      const path = "/api/rendering-review/queue?profile_id=" + chicago +
        (cursor ? "&cursor=" + encodeURIComponent(cursor) : "");
      const data = await getJson(path);
      if (data.flags?.admission_enabled !== false ||
          data.flags?.automatic_sampling_percent !== 0 ||
          data.flags?.integration_verified !== false)
        throw new Error("Pilot safety state changed; read-only preview paused.");
      const queue = Array.isArray(data.queue) ? data.queue : null;
      if (!queue || queue.some(item => item.profile_id !== chicago ||
          item.output_type !== "Instagram Reel" || item.manual_admission_enabled !== false))
        throw new Error("Rendering Review source identity mismatch.");
      list.replaceChildren();
      for (const item of queue) {
        const button = element("button", null, "rr-output-card");
        button.type = "button";
        button.append(element("strong", item.title || "Completed Reel"));
        button.append(element("span", (item.output_number ? "#" + item.output_number + " · " : "") +
          "Instagram Reel", "subtle"));
        button.append(element("small", item.review_held ? "Review hold present" :
          item.dispatch_started ? "Dispatch started" : "Preview only"));
        button.addEventListener("click", () => inspect(item));
        list.append(button);
      }
      if (!queue.length) list.append(element("p",
        "No eligible preview items in this page of the Chicago Reel inventory.", "subtle"));
      nextCursor = typeof data.next_cursor === "string" ? data.next_cursor : null;
      currentPage = next ? currentPage + 1 : 1;
      pageLabel.textContent = "Source page " + currentPage;
      next.hidden = !nextCursor;
      details.replaceChildren(element("p",
        "Select a finished Reel to watch it and inspect any saved review history.", "subtle"));
      message("Showing " + queue.length + " completed Chicago Reels. Read-only — the manual pilot is not active.");
    } catch (err) {
      list.replaceChildren();
      nextCursor = null; next.hidden = true;
      message(err.message || "Rendering Review cannot load.", true);
    } finally { busy = false; refresh.disabled = false; next.disabled = false; }
  }
  // Studio's own showStudioPage handles navigation, unsaved-editor guards,
  // output polling cleanup and sidebar state. Never intercept its clicks.
  const pageObserver = new MutationObserver(() => {
    if (root.classList.contains("active")) {
      load(false);
    } else {
      details.querySelector("video")?.pause();
    }
  });
  pageObserver.observe(root,{attributes:true,attributeFilter:["class"]});
  if (root.classList.contains("active")) load(false);
  refresh.addEventListener("click", () => load(false));
  next.addEventListener("click", () => load(true));
  getJson("/api/session").then(session => {
    const permissions = session?.permissions;
    const canReview = Array.isArray(permissions)
      ? permissions.includes("outputs_review") : permissions?.outputs_review === true;
    allowed = Boolean(session.authenticated === true && session.authorized === true && canReview);
    nav.hidden = !allowed;
  }).catch(() => { allowed = false; nav.hidden = true; });
})();
