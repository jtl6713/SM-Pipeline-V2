/* #2536 Pipeline content-group paging adapter. Loaded before the lazy Studio core. */
(() => {
  const state = { offset: 0, size: 10, from: "", to: "", more: false, busy: false };
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async function(input, init) {
    const raw = typeof input === "string" ? input : input?.url;
    if (!raw || !/\\/api\\/outputs\\?/.test(raw)) return nativeFetch(input, init);
    const url = new URL(raw, location.href);
    if (url.searchParams.get("mode") !== "history") return nativeFetch(input, init);
    url.searchParams.set("mode", "content_page");
    url.searchParams.set("offset", String(state.offset));
    url.searchParams.set("per_page", String(state.size));
    if (state.from) url.searchParams.set("created_from", state.from);
    if (state.to) url.searchParams.set("created_to", state.to);
    state.busy = true;
    try {
      const response = await nativeFetch(typeof input === "string" ? url.toString() : new Request(url, input), init);
      if (!response.ok) return response;
      const data = await response.clone().json();
      state.more = Boolean(data.has_more);
      update();
      // The legacy core loops over history pages; each UI page must contain
      // only the selected content groups, never append all subsequent pages.
      const page = { ...data, has_more: false, next_offset: null };
      return new Response(JSON.stringify(page), { status: response.status,
        statusText: response.statusText, headers: new Headers(response.headers) });
    } finally { state.busy = false; update(); }
  };
  function update() {
    const previous = document.getElementById("pipelineContentPrev");
    const next = document.getElementById("pipelineContentNext");
    const label = document.getElementById("pipelineContentPageLabel");
    if (previous) previous.disabled = state.busy || state.offset === 0;
    if (next) next.disabled = state.busy || !state.more;
    if (label) label.textContent = `Content IDs ${state.offset + 1}–${state.offset + state.size}`;
  }
  function refresh() {
    update();
    document.querySelector('[data-refresh="outputs"]')?.click();
  }
  function mount() {
    const bar = document.querySelector(".pipeline-command-bar");
    if (!bar || document.getElementById("pipelineContentControls")) return;
    const controls = document.createElement("div");
    controls.id = "pipelineContentControls";
    controls.className = "pipeline-content-controls";
    controls.innerHTML = `<label>Created From <input id="pipelineContentFrom" type="date"></label>
      <label>Created To <input id="pipelineContentTo" type="date"></label>
      <label>Content IDs per page <select id="pipelineContentSize">
      <option value="10">10</option><option value="20">20</option><option value="25">25</option><option value="50">50</option></select></label>
      <button type="button" id="pipelineContentPrev">Previous</button>
      <span id="pipelineContentPageLabel" aria-live="polite"></span>
      <button type="button" id="pipelineContentNext">Next</button>`;
    bar.insertAdjacentElement("afterend", controls);
    const from = controls.querySelector("#pipelineContentFrom");
    const to = controls.querySelector("#pipelineContentTo");
    const size = controls.querySelector("#pipelineContentSize");
    function change() {
      if (from.value && to.value && from.value > to.value) {
        to.setCustomValidity("To date must not precede From date");
        to.reportValidity(); return;
      }
      to.setCustomValidity("");
      state.from = from.value; state.to = to.value;
      state.size = Number(size.value); state.offset = 0; refresh();
    }
    from.addEventListener("change", change);
    to.addEventListener("change", change);
    size.addEventListener("change", change);
    controls.querySelector("#pipelineContentPrev").addEventListener("click", () => {
      state.offset = Math.max(0, state.offset - state.size); refresh();
    });
    controls.querySelector("#pipelineContentNext").addEventListener("click", () => {
      if (!state.more) return;
      state.offset += state.size; refresh();
    });
    update();
  }
  document.addEventListener("DOMContentLoaded", mount);
  document.addEventListener("click", event => {
    if (event.target.closest('[data-page="outputs"]')) setTimeout(mount, 0);
  });
})();
