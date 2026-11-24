// Read-only native-gallery viewer. No gallery requests on Pipeline list load.
// The caller supplies the existing authenticated exact-output Creative GET.
(() => {
  "use strict";
  const recordPattern = /^rec[A-Za-z0-9]+$/;
  function isGallery(output = {}) {
    const platform = String(output.platform || "").trim().toLowerCase();
    const type = String(output.studio_output_type || output.platform_output_type || output.format || "").trim();
    if (/reel|video|story|single/i.test(type)) return false;
    return (platform === "instagram" && /carousel/i.test(type))
      || (platform === "facebook" && /photo\s*set|multi[-\s]*image/i.test(type))
      || (platform === "tiktok" && /multi[-\s]*photo|slideshow/i.test(type));
  }
  function publicImage(value) {
    try {
      const url = new URL(String(value || ""));
      if (url.origin !== "https://media.chicagoshining.com" || url.username || url.password
          || !/\.(jpe?g|png|webp|gif|avif)$/i.test(url.pathname)) return "";
      return url.href;
    } catch { return ""; }
  }
  function readSlides(data, recordId, {requireCompleteTikTok = false} = {}) {
    if (data?.ok !== true || !recordPattern.test(recordId)
        || data.output?.id !== recordId || !isGallery(data.output)
        || !Array.isArray(data.slides)) throw Error("The exact photo package could not be verified.");
    const ratio = String(data.output.aspect_ratio || "");
    const included = data.slides.filter(slide => slide && slide.include !== false);
    const seen = new Set();
    if (included.length > 100) throw Error("Photo package exceeds the preview limit.");
    const slides = included.map(slide => {
      const order = Number(slide.order);
      if (!Number.isSafeInteger(order) || order < 1 || seen.has(order)) {
        throw Error("The photo package has invalid or duplicate slide order.");
      }
      seen.add(order);
      // Virtual slides are persisted selected media, not independent final
      // gallery receipts. Never label them final-approved or swap in a cover.
      const final = slide.virtual === true ? "" : publicImage(slide.final_image_url);
      const image = final || [slide.variants?.[ratio], slide.current_image_url, slide.preview_url]
        .map(publicImage).find(Boolean) || "";
      return { order, image, sourceOnly: !final, label: String(slide.name || "Photo").slice(0, 160) };
    }).sort((a, b) => a.order - b.order);
    const expected = Number(data.output.selected_clip_count || 0);
    if (requireCompleteTikTok && (String(data.output.platform || "").toLowerCase() !== "tiktok"
        || ratio !== "9:16" || !Number.isSafeInteger(expected) || expected < 2
        || expected !== slides.length || slides.some((slide,i) => slide.order !== i+1 || !slide.image))) {
      throw Error("The complete ordered TikTok photo package could not be verified.");
    }
    return { slides, sourceOnly: slides.some(slide => slide.sourceOnly),
      expected: Number.isSafeInteger(expected) && expected > 0 ? expected : null };
  }

  let activeDialog = null;
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function button(label, action) {
    const node = element("button", label, "secondary-button");
    node.type = "button";
    node.addEventListener("click", action);
    return node;
  }
  async function open({ recordId, label, load, isCurrent = () => true, requireCompleteTikTok = false }) {
    if (!recordPattern.test(recordId) || typeof load !== "function") return;
    if (activeDialog) activeDialog.close();
    const dialog = element("dialog", "", "pipeline-photo-dialog");
    activeDialog = dialog;
    dialog.setAttribute("aria-label", "Photo package preview");
    const title = element("h2", String(label || "Photo package"), "pipeline-photo-title");
    const close = button("Close", () => dialog.close());
    const header = element("div", "", "pipeline-photo-toolbar");
    header.append(title, close);
    const status = element("p", "Loading saved photos…", "pipeline-photo-status");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    const frame = element("div", "", "pipeline-photo-frame");
    const image = element("img");
    image.alt = "";
    image.draggable = false;
    const missing = element("p", "", "pipeline-photo-missing");
    frame.append(image, missing);
    const count = element("span", "", "pipeline-photo-count");
    count.setAttribute("aria-live", "polite");
    const previous = button("← Previous", () => move(-1));
    const next = button("Next →", () => move(1));
    const controls = element("div", "", "pipeline-photo-toolbar pipeline-photo-controls");
    controls.append(previous, count, next);
    const name = element("p", "", "pipeline-photo-name");
    const retry = button("Retry loading photos", () => void reload());
    const note = element("p", "Preview only. No approval, scheduling or publishing changes are made here.", "pipeline-photo-note");
    dialog.append(header, status, frame, controls, name, retry, note);
    let inventory = [];
    let position = 0;
    let requestVersion = 0;
    let gesture = null;
    function current(version) {
      return activeDialog === dialog && dialog.open && isCurrent() && version === requestVersion;
    }
    function paint() {
      const slide = inventory[position];
      image.removeAttribute("src");
      image.hidden = true;
      missing.hidden = true;
      controls.hidden = !slide;
      frame.hidden = !slide;
      name.textContent = slide ? slide.label : "";
      count.textContent = slide ? (position + 1) + " of " + inventory.length : "";
      previous.disabled = position === 0;
      next.disabled = position >= inventory.length - 1;
      if (!slide) return;
      if (!slide.image) {
        missing.textContent = "Slide " + (position + 1) + " preview unavailable.";
        missing.hidden = false;
        return;
      }
      image.alt = "Slide " + (position + 1) + ": " + slide.label;
      image.hidden = false;
      image.src = slide.image;
    }
    image.addEventListener("error", () => {
      if (!dialog.open || !image.getAttribute("src")) return;
      image.hidden = true;
      missing.textContent = "This slide could not be loaded. Use Next or Previous to continue.";
      missing.hidden = false;
    });
    function move(delta) {
      const destination = position + delta;
      if (destination < 0 || destination >= inventory.length) return;
      position = destination;
      paint();
    }
    dialog.addEventListener("keydown", event => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      move(event.key === "ArrowLeft" ? -1 : 1);
    });
    frame.addEventListener("pointerdown", event => {
      if (event.pointerType !== "touch" && event.pointerType !== "pen") return;
      gesture = { x: event.clientX, y: event.clientY, id: event.pointerId };
      frame.setPointerCapture?.(event.pointerId);
    });
    frame.addEventListener("pointercancel", () => { gesture = null; });
    frame.addEventListener("pointerup", event => {
      const start = gesture;
      gesture = null;
      if (!start || start.id !== event.pointerId) return;
      const dx = event.clientX - start.x, dy = event.clientY - start.y;
      if (Math.abs(dx) >= 45 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
    });
    async function reload() {
      const version = ++requestVersion;
      inventory = [];
      position = 0;
      retry.hidden = true;
      status.textContent = "Loading saved photos…";
      paint();
      try {
        const data = await load();
        if (!current(version)) return;
        const result = readSlides(data, recordId, {requireCompleteTikTok});
        inventory = result.slides;
        status.textContent = !inventory.length
          ? "No linked or selected photos are available yet."
          : result.sourceOnly
            ? requireCompleteTikTok ? "Saved TikTok photo sequence — review only; not a final publishing receipt." : "Saved photo previews — final gallery verification may still be pending."
            : "Linked gallery slide previews — review only.";
        if (result.expected && result.expected !== inventory.length) {
          status.textContent += " " + inventory.length + " of " + result.expected + " expected photos available.";
        }
        retry.hidden = inventory.length > 0 && (!result.expected || result.expected === inventory.length);
        paint();
      } catch {
        if (!current(version)) return;
        status.textContent = "Photo package could not be loaded. No cover was substituted.";
        retry.hidden = false;
      }
    }
    dialog.addEventListener("close", () => {
      ++requestVersion;
      image.removeAttribute("src");
      if (activeDialog === dialog) activeDialog = null;
      dialog.remove();
    }, { once: true });
    document.body.append(dialog);
    dialog.showModal();
    close.focus();
    await reload();
  }
  globalThis.StudioPipelineGallery = Object.freeze({ isGallery, readSlides, open });
})();
