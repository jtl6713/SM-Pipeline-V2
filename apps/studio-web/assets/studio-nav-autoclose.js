/* Close the global Studio drawer after a navigation selection, on every viewport.
   Delegate in capture phase so a page handler stopping propagation cannot strand it. */
(() => {
  const sidebar = document.getElementById("studioSidebar");
  const toggle = document.getElementById("studioNavToggle");
  if (!sidebar || !toggle) return;

  sidebar.addEventListener("click", (event) => {
    const item = event.target?.closest?.("button.nav-item[data-page]");
    if (!item || !sidebar.contains(item)) return;
    // Let the existing page routing and drawer state handlers finish first.
    // Use the original toggle so aria-expanded, persistence and backdrop stay in sync.
    queueMicrotask(() => {
      if (document.body.classList.contains("nav-open")) toggle.click();
    });
  }, true);
})();
