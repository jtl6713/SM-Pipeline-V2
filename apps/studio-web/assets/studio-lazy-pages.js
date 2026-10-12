(() => {
  const manifest = (() => {
    try {
      return JSON.parse(document.getElementById("studioLazyManifest")?.textContent || "{}");
    } catch {
      return {};
    }
  })();
  const version = String(manifest.v || "").trim();
  const loaded = new Map();

  function withVersion(path) {
    const clean = String(path || "").trim();
    if (!clean) return "";
    if (clean.includes("?v=")) return clean;
    return version ? `${clean}?v=${encodeURIComponent(version)}` : clean;
  }

  function loadScript(src) {
    const href = withVersion(src);
    if (!href) return Promise.resolve();
    const existing = loaded.get(href);
    if (existing) return existing;
    const pending = new Promise((resolve, reject) => {
      if (document.querySelector(`script[data-studio-src="${href}"]`)) {
        resolve();
        return;
      }
      const el = document.createElement("script");
      el.src = href;
      el.async = false;
      el.dataset.studioSrc = href;
      el.onload = () => resolve();
      el.onerror = () => reject(new Error(`Could not load ${href}`));
      document.body.appendChild(el);
    });
    loaded.set(href, pending);
    return pending;
  }

  function loadAll(paths) {
    return (paths || []).reduce((chain, src) => chain.then(() => loadScript(src)), Promise.resolve());
  }

  const groups = manifest.groups || {};
  const afterHome = manifest.afterHome || [];
  const prefetch = manifest.prefetch || [];
  const core = manifest.core || [];

  function ensure(page) {
    const key = page === "dashboard" ? "home" : String(page || "home");
    return loadAll(groups[key] || []);
  }

  function prefetchRemaining() {
    const idle = (fn) => {
      if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(fn, { timeout: 4000 });
      else window.setTimeout(fn, 1200);
    };
    idle(() => {
      loadAll(afterHome).catch(() => {});
      loadAll(prefetch).catch(() => {});
    });
  }

  async function boot() {
    await loadAll(core);
    prefetchRemaining();
  }

  window.StudioLazyLoad = { boot, ensure, prefetchRemaining, loadScript };
})();
