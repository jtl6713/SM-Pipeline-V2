// Presentation-only: hide opaque asset ids on Production and library cards.
(() => {
  const opaque = (value) => {
    const text = String(value || "").trim().replace(/\.[A-Za-z0-9]{2,5}$/i, "");
    if (!text) return false;
    if (/^rec[A-Za-z0-9]{10,}$/.test(text)) return true;
    if (/^[a-f0-9]{16,}$/i.test(text)) return true;
    if (/^[a-f0-9]{8}-[a-f0-9-]{13,}$/i.test(text)) return true;
    return !/\s/.test(text) && text.length >= 20 && /\d/.test(text) && !/[aeiou]{2}/i.test(text);
  };
  const selectors = [
    ".production-render-frame-meta strong",
    ".production-render-frame-meta small",
    ".item4-asset-meta strong",
    ".creative-slide-title",
    ".idea-library-card > span",
    ".library-card[data-library-record-type='media_asset'] h3",
  ].join(",");
  let busy = false;
  function update() {
    if (busy) return;
    busy = true;
    try {
      for (const node of document.querySelectorAll(selectors)) {
        const value = (node.textContent || "").trim();
        const token = value.split("·").pop().trim();
        if (!opaque(value) && !opaque(token)) continue;
        const card = node.closest(".production-render-frame-card, .item4-asset-card, .ez-photo-card, .creative-slide-card, .idea-library-card, .library-card");
        const siblings = card?.parentElement
          ? [...card.parentElement.children].filter((el) => el.classList?.contains(card.classList[0]))
          : [];
        const index = Math.max(0, siblings.indexOf(card));
        const kind = node.closest(".creative-slide-card")
          ? "Slide"
          : (/\bclip\b/i.test(`${card?.className || ""} ${value}`) ? "Clip" : "Photo");
        const replacement = `${kind} ${index + 1}`;
        const next = opaque(value) ? replacement : value.replace(token, replacement);
        if (!next || next === value) continue;
        node.textContent = next;
        if (!node.title) node.title = `Internal asset ID: ${opaque(token) ? token : value}`;
      }
    } finally {
      busy = false;
    }
  }
  const root = document.body || document.documentElement;
  if (!root) return;
  new MutationObserver(update).observe(root, { childList: true, subtree: true });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", update, { once: true });
  else update();
})();
