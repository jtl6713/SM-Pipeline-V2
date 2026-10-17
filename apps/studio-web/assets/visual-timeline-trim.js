(function(root) {
  "use strict";

  const MIN_RANGE_SECONDS = 0.1;
  const DEFAULT_FPS = 30;
  const FILMSTRIP_FRAMES = 8;
  const MAX_WAVEFORM_BYTES = 24 * 1024 * 1024;

  function finite(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, finite(value, min)));
  }

  function roundTime(value) {
    return Math.round(finite(value, 0) * 1000) / 1000;
  }

  function normalizeRange(start, end, duration, minRange = MIN_RANGE_SECONDS) {
    const total = Math.max(minRange, finite(duration, minRange));
    const minimum = Math.max(0.001, finite(minRange, MIN_RANGE_SECONDS));
    let a = clamp(start, 0, total);
    let b = clamp(end, 0, total);
    if (b < a) [a, b] = [b, a];
    if (b - a < minimum) {
      if (a + minimum <= total) b = a + minimum;
      else {
        b = total;
        a = Math.max(0, b - minimum);
      }
    }
    return { start: roundTime(a), end: roundTime(b) };
  }

  function slideRange(start, end, delta, duration) {
    const total = Math.max(MIN_RANGE_SECONDS, finite(duration, MIN_RANGE_SECONDS));
    const normalized = normalizeRange(start, end, total);
    const width = normalized.end - normalized.start;
    let nextStart = normalized.start + finite(delta, 0);
    nextStart = clamp(nextStart, 0, Math.max(0, total - width));
    return {
      start: roundTime(nextStart),
      end: roundTime(nextStart + width),
    };
  }

  function frameSeconds(fps) {
    return 1 / Math.max(1, finite(fps, DEFAULT_FPS));
  }

  function nudgeBoundary(start, end, which, frames, duration, fps) {
    const step = frameSeconds(fps) * finite(frames, 0);
    const current = normalizeRange(start, end, duration);
    if (which === "start") {
      return normalizeRange(
        clamp(current.start + step, 0, Math.max(0, current.end - MIN_RANGE_SECONDS)),
        current.end,
        duration,
      );
    }
    return normalizeRange(
      current.start,
      clamp(current.end + step, current.start + MIN_RANGE_SECONDS, duration),
      duration,
    );
  }

  function formatTimecode(seconds, fps = DEFAULT_FPS) {
    const safe = Math.max(0, finite(seconds, 0));
    const whole = Math.floor(safe);
    const hours = Math.floor(whole / 3600);
    const minutes = Math.floor((whole % 3600) / 60);
    const secs = whole % 60;
    const frames = Math.floor((safe - whole) * Math.max(1, finite(fps, DEFAULT_FPS)) + 1e-6);
    const two = (v) => String(v).padStart(2, "0");
    return `${two(hours)}:${two(minutes)}:${two(secs)}:${two(frames)}`;
  }

  function safeCssUrl(url) {
    return String(url || "").replace(/["\\\n\r]/g, "");
  }

  const api = {
    open,
    close,
    __test: {
      clamp,
      normalizeRange,
      slideRange,
      nudgeBoundary,
      frameSeconds,
      formatTimecode,
    },
  };

  root.VisualTimelineTrimEditor = api;
  if (typeof document === "undefined") return;

  let state = null;
  let modal = null;
  let refs = null;
  let raf = 0;
  let filmstripToken = 0;

  function ensureModal() {
    if (modal) return modal;
    modal = document.createElement("div");
    modal.className = "visual-trim-backdrop";
    modal.hidden = true;
    modal.innerHTML = `
      <section class="visual-trim-dialog" role="dialog" aria-modal="true" aria-labelledby="visualTrimTitle">
        <header class="visual-trim-header">
          <div>
            <span class="eyebrow">Clip trim</span>
            <h2 id="visualTrimTitle">Trim clip</h2>
            <p id="visualTrimSubtitle">The selected range is the authoritative visual duration.</p>
          </div>
          <button type="button" class="icon-button" data-visual-trim-close aria-label="Close trim editor">×</button>
        </header>

        <div class="visual-trim-preview-wrap">
          <video class="visual-trim-preview" playsinline preload="metadata"></video>
          <div class="visual-trim-preview-toolbar">
            <button type="button" class="secondary-button" data-visual-trim-play>▶ Play selected</button>
            <button type="button" class="secondary-button" data-visual-trim-pause>Pause</button>
            <label class="toggle-control visual-trim-loop"><input type="checkbox" data-visual-trim-loop checked><span>Loop selected range</span></label>
            <span class="visual-trim-current" data-visual-trim-current>00:00:00:00</span>
          </div>
        </div>

        <div class="visual-trim-filmstrip" data-visual-trim-filmstrip aria-label="Clip filmstrip"></div>
        <div class="visual-trim-waveform-shell">
          <canvas class="visual-trim-waveform" data-visual-trim-waveform aria-label="Audio waveform"></canvas>
          <span class="visual-trim-waveform-status" data-visual-trim-waveform-status>Waveform checks source size before loading.</span>
        </div>

        <div class="visual-trim-track-shell">
          <div class="visual-trim-track" data-visual-trim-track tabindex="0" role="group" aria-label="Trim range. Drag either handle or drag the selected range to slide the entire window.">
            <div class="visual-trim-track-unselected"></div>
            <div class="visual-trim-selection" data-visual-trim-selection>
              <button type="button" class="visual-trim-handle visual-trim-handle-start" data-visual-trim-handle="start" aria-label="Trim start handle"></button>
              <div class="visual-trim-window-label" data-visual-trim-window-label></div>
              <button type="button" class="visual-trim-handle visual-trim-handle-end" data-visual-trim-handle="end" aria-label="Trim end handle"></button>
            </div>
            <div class="visual-trim-playhead" data-visual-trim-playhead></div>
          </div>
          <div class="visual-trim-track-help">Drag a handle to resize. Drag the highlighted middle to slide the whole range. Arrow keys move one frame; Shift+Arrow moves five.</div>
        </div>

        <div class="visual-trim-grid">
          <label class="form-field"><span>Source in</span><input type="number" step="0.001" min="0" data-visual-trim-in></label>
          <label class="form-field"><span>Source out</span><input type="number" step="0.001" min="0.1" data-visual-trim-out></label>
          <div class="form-field"><span>Selected duration</span><strong data-visual-trim-duration>0.000s</strong></div>
          <div class="form-field"><span>Source duration</span><strong data-visual-trim-source-duration>—</strong></div>
        </div>

        <div class="visual-trim-frame-controls">
          <div>
            <strong>Frame-step preview</strong>
            <span>Changes only the preview playhead. Use the range handles or numeric values to change the trim.</span>
          </div>
          <div class="visual-trim-frame-buttons">
            <button type="button" class="secondary-button" data-visual-trim-frame="-1">−1 frame</button>
            <button type="button" class="secondary-button" data-visual-trim-frame="1">+1 frame</button>
          </div>
        </div>

        <p class="form-message" data-visual-trim-message aria-live="polite"></p>
        <footer class="visual-trim-actions">
          <button type="button" class="secondary-button" data-visual-trim-reset>Reset opened range</button>
          <button type="button" class="secondary-button" data-visual-trim-cancel>Cancel</button>
          <button type="button" class="primary-button" data-visual-trim-apply>Apply selected range</button>
        </footer>
      </section>
    `;
    document.body.appendChild(modal);

    refs = {
      title: modal.querySelector("#visualTrimTitle"),
      subtitle: modal.querySelector("#visualTrimSubtitle"),
      video: modal.querySelector(".visual-trim-preview"),
      filmstrip: modal.querySelector("[data-visual-trim-filmstrip]"),
      waveform: modal.querySelector("[data-visual-trim-waveform]"),
      waveformStatus: modal.querySelector("[data-visual-trim-waveform-status]"),
      track: modal.querySelector("[data-visual-trim-track]"),
      selection: modal.querySelector("[data-visual-trim-selection]"),
      playhead: modal.querySelector("[data-visual-trim-playhead]"),
      windowLabel: modal.querySelector("[data-visual-trim-window-label]"),
      startHandle: modal.querySelector('[data-visual-trim-handle="start"]'),
      endHandle: modal.querySelector('[data-visual-trim-handle="end"]'),
      inInput: modal.querySelector("[data-visual-trim-in]"),
      outInput: modal.querySelector("[data-visual-trim-out]"),
      duration: modal.querySelector("[data-visual-trim-duration]"),
      sourceDuration: modal.querySelector("[data-visual-trim-source-duration]"),
      current: modal.querySelector("[data-visual-trim-current]"),
      loop: modal.querySelector("[data-visual-trim-loop]"),
      message: modal.querySelector("[data-visual-trim-message]"),
    };

    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
      if (event.target.closest("[data-visual-trim-close],[data-visual-trim-cancel]")) close();
      if (event.target.closest("[data-visual-trim-play]")) playSelected();
      if (event.target.closest("[data-visual-trim-pause]")) refs.video.pause();
      if (event.target.closest("[data-visual-trim-reset]")) resetOpenedRange();
      if (event.target.closest("[data-visual-trim-apply]")) apply();
      const frame = event.target.closest("[data-visual-trim-frame]")?.dataset?.visualTrimFrame;
      if (frame) stepPreview(Number(frame));
    });

    refs.video.addEventListener("loadedmetadata", () => {
      if (!state) return;
      const actual = finite(refs.video.duration, 0);
      if (actual > 0) {
        state.duration = actual;
        state.range = normalizeRange(state.range.start, state.range.end, actual);
        refs.inInput.max = String(actual);
        refs.outInput.max = String(actual);
        render();
        buildFilmstrip().catch(() => {});
      }
    });

    refs.video.addEventListener("timeupdate", onVideoTimeUpdate);
    refs.video.addEventListener("ended", onVideoTimeUpdate);
    refs.video.addEventListener("play", startPreviewGuard);
    refs.video.addEventListener("pause", stopPreviewGuard);
    refs.video.addEventListener("error", () => {
      if (!state) return;
      setMessage("Preview could not load. The numeric trim controls still work.", true);
    });

    refs.inInput.addEventListener("input", () => applyNumeric("start"));
    refs.outInput.addEventListener("input", () => applyNumeric("end"));

    bindPointerTrim();
    bindKeyboardTrim();

    document.addEventListener("keydown", (event) => {
      if (modal?.hidden) return;
      if (event.key === "Escape") {
        event.preventDefault();
        close();
      }
    });

    return modal;
  }

  function open(options = {}) {
    ensureModal();
    const trigger = options.trigger || null;
    const card = options.card || trigger?.closest?.(".creative-slide-card") || null;
    const sourceInField = card?.querySelector?.('[data-field="source_in_seconds"]') || null;
    const sourceOutField = card?.querySelector?.('[data-field="source_out_seconds"]') || null;
    const sourceDurationFromField = Number(sourceOutField?.max || sourceInField?.max || 0);
    const sourceDuration = finite(
      options.sourceDurationSeconds
      ?? trigger?.dataset?.trimSourceDuration
      ?? sourceDurationFromField,
      0,
    );
    const sourceIn = finite(
      options.sourceInSeconds
      ?? trigger?.dataset?.trimIn
      ?? sourceInField?.value,
      0,
    );
    const fallbackOut = sourceDuration > 0 ? Math.min(sourceDuration, sourceIn + 4) : sourceIn + 4;
    const sourceOut = finite(
      options.sourceOutSeconds
      ?? trigger?.dataset?.trimOut
      ?? sourceOutField?.value,
      fallbackOut,
    );

    state = {
      trigger,
      card,
      streamUrl: String(options.streamUrl ?? trigger?.dataset?.trimStream ?? "").trim(),
      posterUrl: String(options.posterUrl ?? trigger?.dataset?.trimPoster ?? "").trim(),
      title: String(options.title ?? trigger?.dataset?.trimTitle ?? "Trim clip").trim() || "Trim clip",
      fps: Math.max(1, finite(options.fps ?? trigger?.dataset?.trimFps, DEFAULT_FPS)),
      duration: sourceDuration > 0 ? sourceDuration : Math.max(sourceOut, sourceIn + MIN_RANGE_SECONDS),
      originalRange: null,
      range: null,
      pointer: null,
      waveformAbort: null,
    };
    state.range = normalizeRange(sourceIn, sourceOut, state.duration);
    state.originalRange = { ...state.range };

    refs.title.textContent = state.title;
    refs.subtitle.textContent = "Preview and adjust only the selected source range. Saving this modal does not render, approve, schedule, or publish.";
    refs.video.pause();
    refs.video.poster = state.posterUrl || "";
    refs.video.removeAttribute("src");
    if (state.streamUrl) refs.video.src = state.streamUrl;
    refs.filmstrip.style.setProperty("--trim-poster", state.posterUrl ? `url("${safeCssUrl(state.posterUrl)}")` : "none");
    refs.filmstrip.innerHTML = "";
    filmstripToken += 1;
    setMessage("");
    modal.hidden = false;
    document.body.classList.add("visual-trim-open");
    render();
    if (state.streamUrl) {
      refs.video.load();
      buildFilmstrip().catch(() => {});
      buildWaveform().catch(() => {});
    } else {
      setMessage("No clip preview URL is available. You can still edit the source in/out values.", true);
    }
    requestAnimationFrame(() => refs.track.focus());
  }

  function close() {
    if (!modal || modal.hidden) return;
    filmstripToken += 1;
    state?.waveformAbort?.abort?.();
    refs.video?.pause();
    stopPreviewGuard();
    modal.hidden = true;
    document.body.classList.remove("visual-trim-open");
    const trigger = state?.trigger;
    state = null;
    trigger?.focus?.();
  }

  function setMessage(message, error = false) {
    if (!refs?.message) return;
    refs.message.textContent = String(message || "");
    refs.message.classList.toggle("error-text", Boolean(error));
  }

  function render() {
    if (!state || !refs) return;
    const total = Math.max(MIN_RANGE_SECONDS, state.duration);
    state.range = normalizeRange(state.range.start, state.range.end, total);
    const left = (state.range.start / total) * 100;
    const width = ((state.range.end - state.range.start) / total) * 100;
    refs.selection.style.left = `${left}%`;
    refs.selection.style.width = `${width}%`;
    refs.inInput.value = state.range.start.toFixed(3);
    refs.outInput.value = state.range.end.toFixed(3);
    refs.duration.textContent = `${(state.range.end - state.range.start).toFixed(3)}s`;
    refs.sourceDuration.textContent = state.duration > 0 ? `${state.duration.toFixed(3)}s` : "—";
    refs.windowLabel.textContent = `${formatTimecode(state.range.start, state.fps)} – ${formatTimecode(state.range.end, state.fps)}`;
    refs.startHandle.setAttribute("aria-valuemin", "0");
    refs.startHandle.setAttribute("aria-valuemax", String(state.range.end));
    refs.startHandle.setAttribute("aria-valuenow", String(state.range.start));
    refs.endHandle.setAttribute("aria-valuemin", String(state.range.start));
    refs.endHandle.setAttribute("aria-valuemax", String(state.duration));
    refs.endHandle.setAttribute("aria-valuenow", String(state.range.end));
    updatePlayhead();
  }

  function timeFromClientX(clientX) {
    const rect = refs.track.getBoundingClientRect();
    if (!rect.width) return state.range.start;
    const fraction = clamp((clientX - rect.left) / rect.width, 0, 1);
    return fraction * state.duration;
  }

  function bindPointerTrim() {
    refs.track.addEventListener("pointerdown", (event) => {
      if (!state) return;
      const handle = event.target.closest("[data-visual-trim-handle]")?.dataset?.visualTrimHandle;
      const selection = event.target.closest("[data-visual-trim-selection]");
      const mode = handle || (selection ? "window" : "seek");
      refs.track.setPointerCapture?.(event.pointerId);
      state.pointer = {
        id: event.pointerId,
        mode,
        originX: event.clientX,
        originTime: timeFromClientX(event.clientX),
        range: { ...state.range },
      };
      if (mode === "seek") {
        refs.video.currentTime = clamp(timeFromClientX(event.clientX), state.range.start, state.range.end);
        updatePlayhead();
      }
      event.preventDefault();
    });

    refs.track.addEventListener("pointermove", (event) => {
      if (!state?.pointer || state.pointer.id !== event.pointerId) return;
      const pointer = state.pointer;
      if (pointer.mode === "start") {
        state.range = normalizeRange(
          Math.min(timeFromClientX(event.clientX), pointer.range.end - MIN_RANGE_SECONDS),
          pointer.range.end,
          state.duration,
        );
      } else if (pointer.mode === "end") {
        state.range = normalizeRange(
          pointer.range.start,
          Math.max(timeFromClientX(event.clientX), pointer.range.start + MIN_RANGE_SECONDS),
          state.duration,
        );
      } else if (pointer.mode === "window") {
        const delta = timeFromClientX(event.clientX) - pointer.originTime;
        state.range = slideRange(pointer.range.start, pointer.range.end, delta, state.duration);
      }
      if (pointer.mode !== "seek") {
        render();
        seekPreviewInsideRange();
      }
      event.preventDefault();
    });

    const release = (event) => {
      if (!state?.pointer || state.pointer.id !== event.pointerId) return;
      state.pointer = null;
      refs.track.releasePointerCapture?.(event.pointerId);
    };
    refs.track.addEventListener("pointerup", release);
    refs.track.addEventListener("pointercancel", release);
  }

  function bindKeyboardTrim() {
    const keyHandler = (event, mode) => {
      if (!state || !["ArrowLeft", "ArrowRight"].includes(event.key)) return;
      const frames = (event.key === "ArrowRight" ? 1 : -1) * (event.shiftKey ? 5 : 1);
      if (mode === "window") {
        state.range = slideRange(
          state.range.start,
          state.range.end,
          frameSeconds(state.fps) * frames,
          state.duration,
        );
      } else {
        state.range = nudgeBoundary(
          state.range.start,
          state.range.end,
          mode,
          frames,
          state.duration,
          state.fps,
        );
      }
      render();
      seekPreviewInsideRange();
      event.preventDefault();
    };
    refs.track.addEventListener("keydown", (event) => keyHandler(event, "window"));
    refs.startHandle.addEventListener("keydown", (event) => {
      event.stopPropagation();
      keyHandler(event, "start");
    });
    refs.endHandle.addEventListener("keydown", (event) => {
      event.stopPropagation();
      keyHandler(event, "end");
    });
  }

  function applyNumeric(changed) {
    if (!state) return;
    const start = finite(refs.inInput.value, state.range.start);
    const end = finite(refs.outInput.value, state.range.end);
    if (changed === "start") {
      state.range = normalizeRange(Math.min(start, end - MIN_RANGE_SECONDS), end, state.duration);
    } else {
      state.range = normalizeRange(start, Math.max(end, start + MIN_RANGE_SECONDS), state.duration);
    }
    render();
    seekPreviewInsideRange();
  }

  function seekPreviewInsideRange() {
    if (!state || !refs.video || !Number.isFinite(refs.video.currentTime)) return;
    const current = refs.video.currentTime;
    if (current < state.range.start || current > state.range.end) {
      refs.video.currentTime = state.range.start;
    }
  }

  function playSelected() {
    if (!state || !refs.video) return;
    if (!state.streamUrl) {
      setMessage("No preview stream is available for this clip.", true);
      return;
    }
    const current = finite(refs.video.currentTime, state.range.start);
    if (current < state.range.start || current >= state.range.end - frameSeconds(state.fps)) {
      refs.video.currentTime = state.range.start;
    }
    refs.video.play().catch(() => {
      setMessage("The browser blocked clip playback. Tap the video, then try Play selected again.", true);
    });
  }

  function enforcePreviewBoundary() {
    if (!state || !refs?.video) return;
    const current = finite(refs.video.currentTime, state.range.start);
    const tolerance = Math.min(0.012, frameSeconds(state.fps) / 3);
    if (current >= state.range.end - tolerance) {
      if (refs.loop.checked) {
        refs.video.currentTime = state.range.start;
        if (refs.video.paused) refs.video.play().catch(() => {});
      } else {
        refs.video.pause();
        refs.video.currentTime = state.range.end;
      }
    } else if (current < state.range.start - tolerance) {
      refs.video.currentTime = state.range.start;
    }
    updatePlayhead();
  }

  function onVideoTimeUpdate() {
    enforcePreviewBoundary();
  }

  function startPreviewGuard() {
    stopPreviewGuard();
    const tick = () => {
      if (!state || refs.video.paused) {
        raf = 0;
        return;
      }
      enforcePreviewBoundary();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }

  function stopPreviewGuard() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
  }

  function updatePlayhead() {
    if (!state || !refs?.playhead) return;
    const current = clamp(finite(refs.video?.currentTime, state.range.start), 0, state.duration);
    refs.playhead.style.left = `${(current / Math.max(state.duration, MIN_RANGE_SECONDS)) * 100}%`;
    refs.current.textContent = formatTimecode(current, state.fps);
  }

  function stepPreview(frames) {
    if (!state || !refs.video) return;
    refs.video.pause();
    const step = frameSeconds(state.fps) * finite(frames, 0);
    const current = finite(refs.video.currentTime, state.range.start);
    refs.video.currentTime = clamp(current + step, state.range.start, state.range.end);
    updatePlayhead();
  }

  function resetOpenedRange() {
    if (!state?.originalRange) return;
    state.range = { ...state.originalRange };
    render();
    refs.video.currentTime = state.range.start;
    setMessage("Restored the range that was active when this editor opened.");
  }

  function apply() {
    if (!state) return;
    const card = state.card;
    const sourceIn = card?.querySelector?.('[data-field="source_in_seconds"]');
    const sourceOut = card?.querySelector?.('[data-field="source_out_seconds"]');
    if (!sourceIn || !sourceOut) {
      setMessage("Studio can no longer find this clip card. Close the editor and reopen the output.", true);
      return;
    }
    sourceIn.value = state.range.start.toFixed(3);
    sourceOut.value = state.range.end.toFixed(3);
    sourceIn.dataset.trimTouched = "true";
    sourceOut.dataset.trimTouched = "true";
    sourceIn.dispatchEvent(new Event("input", { bubbles: true }));
    sourceOut.dispatchEvent(new Event("input", { bubbles: true }));
    sourceIn.dispatchEvent(new Event("change", { bubbles: true }));
    sourceOut.dispatchEvent(new Event("change", { bubbles: true }));
    close();
  }

  async function buildWaveform() {
    if (!state || !refs?.waveform || !state.streamUrl) return;
    const canvas = refs.waveform;
    const status = refs.waveformStatus;
    const controller = new AbortController();
    state.waveformAbort?.abort?.();
    state.waveformAbort = controller;
    const setStatus = (text) => {
      if (state && !controller.signal.aborted && status) status.textContent = text;
    };
    setStatus("Checking source size…");

    const sameOrigin = (() => {
      try { return new URL(state.streamUrl, location.href).origin === location.origin; }
      catch { return false; }
    })();
    if (!sameOrigin) {
      setStatus("Waveform skipped for a remote clip source. Filmstrip and exact trim remain available.");
      return;
    }

    let length = 0;
    try {
      const head = await fetch(state.streamUrl, {
        method: "HEAD",
        credentials: "same-origin",
        signal: controller.signal,
      });
      length = Number(head.headers.get("content-length") || 0);
    } catch {
      if (controller.signal.aborted) return;
    }
    if (!length) {
      setStatus("Waveform skipped because source size is unknown. Filmstrip and exact trim remain available.");
      return;
    }
    if (length > MAX_WAVEFORM_BYTES) {
      setStatus(`Waveform skipped for this ${Math.ceil(length / (1024 * 1024))} MB source to avoid a large browser download.`);
      return;
    }

    try {
      setStatus("Building waveform…");
      const response = await fetch(state.streamUrl, {
        method: "GET",
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!response.ok) throw new Error("Waveform source could not be loaded");
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > MAX_WAVEFORM_BYTES) {
        setStatus("Waveform skipped because the downloaded source exceeded the safe browser limit.");
        return;
      }
      const AudioContextCtor = root.AudioContext || root.webkitAudioContext;
      if (!AudioContextCtor) {
        setStatus("Waveform is not supported by this browser.");
        return;
      }
      const audioContext = new AudioContextCtor();
      try {
        const audioBuffer = await audioContext.decodeAudioData(buffer.slice(0));
        drawWaveform(canvas, audioBuffer);
        setStatus("Waveform ready.");
      } finally {
        audioContext.close?.().catch?.(() => {});
      }
    } catch {
      if (!controller.signal.aborted) {
        setStatus("Waveform unavailable for this clip format. Filmstrip and exact trim remain available.");
      }
    }
  }

  function drawWaveform(canvas, audioBuffer) {
    const cssWidth = Math.max(320, Math.round(canvas.clientWidth || 900));
    const cssHeight = Math.max(56, Math.round(canvas.clientHeight || 72));
    const ratio = Math.min(2, root.devicePixelRatio || 1);
    canvas.width = Math.round(cssWidth * ratio);
    canvas.height = Math.round(cssHeight * ratio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const width = canvas.width;
    const height = canvas.height;
    const channels = Math.max(1, audioBuffer.numberOfChannels || 1);
    const data = Array.from({ length: channels }, (_, index) => audioBuffer.getChannelData(index));
    const samplesPerPixel = Math.max(1, Math.floor(audioBuffer.length / width));
    ctx.strokeStyle = "rgba(71, 84, 103, .92)";
    ctx.lineWidth = Math.max(1, ratio);
    ctx.beginPath();
    for (let x = 0; x < width; x += 1) {
      const start = x * samplesPerPixel;
      const end = Math.min(audioBuffer.length, start + samplesPerPixel);
      let peak = 0;
      for (let sample = start; sample < end; sample += 1) {
        let mixed = 0;
        for (let channel = 0; channel < channels; channel += 1) mixed += Math.abs(data[channel][sample] || 0);
        peak = Math.max(peak, mixed / channels);
      }
      const amp = Math.min(1, peak) * (height * 0.45);
      const mid = height / 2;
      ctx.moveTo(x + 0.5, mid - amp);
      ctx.lineTo(x + 0.5, mid + amp);
    }
    ctx.stroke();
  }

  async function buildFilmstrip() {
    if (!state || !refs?.filmstrip) return;
    const token = ++filmstripToken;
    const filmstrip = refs.filmstrip;
    const fallback = () => {
      if (!state || token !== filmstripToken) return;
      const poster = state.posterUrl;
      filmstrip.innerHTML = Array.from({ length: FILMSTRIP_FRAMES }, () =>
        poster
          ? `<span class="visual-trim-film-cell" style="background-image:url(&quot;${safeCssUrl(poster)}&quot;)"></span>`
          : '<span class="visual-trim-film-cell visual-trim-film-cell-empty"></span>'
      ).join("");
    };
    fallback();
    if (!state.streamUrl || state.duration <= 0) return;

    const probe = document.createElement("video");
    probe.muted = true;
    probe.preload = "auto";
    probe.playsInline = true;
    probe.crossOrigin = "anonymous";
    probe.src = state.streamUrl;

    try {
      await waitForEvent(probe, "loadedmetadata", 6000);
      if (!state || token !== filmstripToken) return;
      const cells = [];
      for (let i = 0; i < FILMSTRIP_FRAMES; i += 1) {
        if (!state || token !== filmstripToken) return;
        const time = Math.min(
          Math.max(0, state.duration - frameSeconds(state.fps)),
          (state.duration * (i + 0.5)) / FILMSTRIP_FRAMES,
        );
        probe.currentTime = time;
        await waitForEvent(probe, "seeked", 3000);
        const canvas = document.createElement("canvas");
        canvas.width = 160;
        canvas.height = 90;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Canvas unavailable");
        ctx.drawImage(probe, 0, 0, canvas.width, canvas.height);
        cells.push(canvas.toDataURL("image/jpeg", 0.68));
      }
      if (!state || token !== filmstripToken) return;
      filmstrip.innerHTML = cells.map((src) =>
        `<span class="visual-trim-film-cell" style="background-image:url(&quot;${src}&quot;)"></span>`
      ).join("");
    } catch {
      // Poster-based fallback is already painted. Cross-origin clip sources may
      // intentionally prevent canvas extraction; trimming remains fully usable.
    } finally {
      probe.removeAttribute("src");
      probe.load();
    }
  }

  function waitForEvent(target, eventName, timeoutMs) {
    return new Promise((resolve, reject) => {
      let timer = 0;
      const done = (value, error) => {
        clearTimeout(timer);
        target.removeEventListener(eventName, onEvent);
        target.removeEventListener("error", onError);
        error ? reject(value) : resolve(value);
      };
      const onEvent = () => done(true, false);
      const onError = () => done(new Error("Media preview failed"), true);
      target.addEventListener(eventName, onEvent, { once: true });
      target.addEventListener("error", onError, { once: true });
      timer = setTimeout(() => done(new Error("Media preview timed out"), true), timeoutMs);
    });
  }

  document.addEventListener("click", (event) => {
    const trigger = event.target.closest?.("[data-visual-trim-open]");
    if (!trigger) return;
    event.preventDefault();
    open({ trigger });
  });
})(typeof window !== "undefined" ? window : globalThis);
