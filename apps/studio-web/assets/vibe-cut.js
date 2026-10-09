(() => {
  const VIBE_CUT_INPUT = "vibe-cut";
  const STYLES = Object.freeze({
    SMOOTH_VIBES: "smooth-vibes",
    BEAT_CUT: "beat-cut",
    FAST_CUTS: "fast-cuts",
  });
  const STYLE_LABELS = Object.freeze({
    [STYLES.SMOOTH_VIBES]: "Smooth Vibes",
    [STYLES.BEAT_CUT]: "Beat Cut",
    [STYLES.FAST_CUTS]: "Fast Cuts",
  });
  const STYLE_HINTS = Object.freeze({
    [STYLES.SMOOTH_VIBES]: "Longer holds, gentle cuts — skyline, beaches, architecture.",
    [STYLES.BEAT_CUT]: "Default city montage. Cuts land on strong beats.",
    [STYLES.FAST_CUTS]: "Very short moments, aggressive sync, optional speed ramps.",
  });
  const DEFAULT_ENERGY = Object.freeze({
    [STYLES.SMOOTH_VIBES]: 2,
    [STYLES.BEAT_CUT]: 3,
    [STYLES.FAST_CUTS]: 5,
  });

  function normalizeStyle(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    if (raw === "smooth" || raw === "smooth-vibes") return STYLES.SMOOTH_VIBES;
    if (raw === "fast" || raw === "fast-cuts") return STYLES.FAST_CUTS;
    return STYLES.BEAT_CUT;
  }

  function normalizeEnergy(value, style) {
    const n = Math.round(Number(value));
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n;
    return DEFAULT_ENERGY[normalizeStyle(style)] || 3;
  }

  function normalizeTarget(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 30;
    return Math.min(90, Math.max(8, n));
  }

  function normalizeChronology(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/[_\s]+/g, "-");
    if (raw === "chronological" || raw === "chrono") return "chronological";
    return "best-moments";
  }

  function normalizeVersions(value) {
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) return 1;
    return Math.min(5, Math.max(1, n));
  }

  function defaultConfig(partial = {}) {
    const style = normalizeStyle(partial.style);
    return {
      schema_version: "vibe-cut.1",
      mode: "vibe_cut",
      style,
      energy: normalizeEnergy(partial.energy, style),
      target_seconds: normalizeTarget(partial.target_seconds ?? partial.targetSeconds ?? 30),
      chronology: normalizeChronology(partial.chronology),
      beat_sync: String(partial.beat_sync ?? "on").toLowerCase() === "off" ? "off" : "on",
      versions: normalizeVersions(partial.versions),
      prefer_unused: Boolean(partial.prefer_unused),
      find_best: Boolean(partial.find_best),
      aspect_ratio: "9:16",
      voiceover: "off",
    };
  }

  function parseDirective(notes) {
    const match = /(?:^|\n)\[vibe-cut\]\s*(\{[\s\S]*?\})\s*(?:\n|$)/i.exec(String(notes || ""));
    if (!match) return null;
    try {
      return defaultConfig(JSON.parse(match[1]));
    } catch {
      return null;
    }
  }

  function formatDirective(config) {
    return `[vibe-cut] ${JSON.stringify(defaultConfig(config || {}))}`;
  }

  function stripDirective(notes) {
    return String(notes || "")
      .replace(/(?:^|\n)\[vibe-cut\]\s*[^\n]*(?=\n|$)/gi, "")
      .replace(/^\s*\n/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  function isVibeCutNotes(notes) {
    const text = String(notes || "");
    return /ez-input=vibe-cut/i.test(text) || Boolean(parseDirective(text));
  }

  function renderSettingsLine(config) {
    const cfg = defaultConfig(config || {});
    const pacing = cfg.style === STYLES.SMOOTH_VIBES ? "slow" : (cfg.style === STYLES.FAST_CUTS ? "fast" : "normal");
    const preset = cfg.style === STYLES.SMOOTH_VIBES ? "cinematic" : "energetic";
    const intensity = cfg.energy >= 4 ? "high" : (cfg.energy <= 2 ? "low" : "normal");
    return `[render-settings] preset=${preset}; motion=auto; transition=cut; transition_seconds=0; duration_mode=auto; duration_seconds=1.4; intensity=${intensity}; pacing=${pacing}; fit=smart_crop; beat_sync=${cfg.beat_sync}; ai_motion=on`;
  }

  function mergeIntoNotes(notes, config) {
    let next = stripDirective(notes)
      .replace(/(?:^|\n)\[render-settings\]\s*[^\n]*(?=\n|$)/gi, "")
      .replace(/^\s*\n/, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    if (!/ez-input=vibe-cut/i.test(next)) {
      if (/ez-input=[a-z0-9-]+/i.test(next)) {
        next = next.replace(/ez-input=[a-z0-9-]+/i, `ez-input=${VIBE_CUT_INPUT}`);
      } else if (/origin=/i.test(next)) {
        next = next.replace(/(origin=[^;\n]+)/i, `$1; ez-input=${VIBE_CUT_INPUT}`);
      } else {
        next = `origin=ez-wizard; ez-input=${VIBE_CUT_INPUT}; ez-caption=ai; ez-package=video${next ? `\n${next}` : ""}`;
      }
    }
    if (!/ez-package=/i.test(next)) {
      next = next.replace(/(ez-input=vibe-cut)/i, "$1; ez-package=video");
    }
    return [formatDirective(config), renderSettingsLine(config), next].filter(Boolean).join("\n");
  }

  function summaryText(config) {
    const cfg = defaultConfig(config || {});
    const style = STYLE_LABELS[cfg.style] || "Beat Cut";
    const order = cfg.chronology === "chronological" ? "in order" : "best moments";
    const versions = cfg.versions > 1 ? ` · ${cfg.versions} versions` : "";
    const best = cfg.find_best ? " · find best" : "";
    return `${style} · ${cfg.target_seconds}s · energy ${cfg.energy} · ${order}${versions}${best}`;
  }

  window.ChicagoShiningVibeCut = {
    VIBE_CUT_INPUT,
    STYLES,
    STYLE_LABELS,
    STYLE_HINTS,
    DEFAULT_ENERGY,
    normalizeStyle,
    normalizeEnergy,
    normalizeTarget,
    normalizeChronology,
    normalizeVersions,
    defaultConfig,
    parseDirective,
    formatDirective,
    stripDirective,
    isVibeCutNotes,
    mergeIntoNotes,
    renderSettingsLine,
    summaryText,
  };
})();
