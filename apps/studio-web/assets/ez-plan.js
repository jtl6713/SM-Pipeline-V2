(() => {
  const EZ_ORIGIN = "ez-button";
  const EZ_ORIGIN_WIZARD = "ez-wizard";
  const EZ_ORIGIN_AZ = "az-finished-video";
  const EZ_INPUTS = Object.freeze({
    SINGLE_PHOTO: "single-photo",
    MULTIPLE_PHOTOS: "multiple-photos",
    VIDEO_CLIPS: "video-clips",
    PHOTOS_AND_CLIPS: "photos-and-clips",
    FINISHED_VIDEO: "finished-video",
    FINISHED_STILLS: "finished-stills",
    SINGLE_AI: "single-ai",
    MULTIPLE_AI: "multiple-ai",
    MIXED: "mixed",
  });
  const EZ_CAPTION_MODES = Object.freeze(["manual", "none", "ai"]);
  const EZ_PHASE1_INPUTS = Object.freeze([EZ_INPUTS.SINGLE_PHOTO, EZ_INPUTS.MULTIPLE_PHOTOS]);
  const EZ_DISABLED_INPUTS = Object.freeze([]);
  const EZ_CLIP_INPUTS = Object.freeze([EZ_INPUTS.VIDEO_CLIPS, EZ_INPUTS.PHOTOS_AND_CLIPS]);
  const EZ_NATIVE_STILL_TYPES = Object.freeze({
    Instagram: Object.freeze(["Single Image", "Carousel"]),
    Facebook: Object.freeze(["Single Image", "Multi-Image Post"]),
    TikTok: Object.freeze(["Single Photo", "Multi-Photo"]),
  });
  const EZ_VIDEO_PASSES = Object.freeze({
    Instagram: "Reel",
    Facebook: "Reel",
    TikTok: "Video Draft",
    YouTube: "Short",
  });
  const EZ_PACKAGES = Object.freeze({
    VIDEO: "video",
    SLIDES: "slides",
    CUSTOM: "custom",
  });
  const EZ_VIDEO_STORY_EXTRAS = Object.freeze(["Instagram::Story", "Facebook::Story"]);
  const EZ_PHOTO_PASSES = Object.freeze({
    single: Object.freeze({
      Instagram: "Single Image",
      Facebook: "Single Image",
      TikTok: "Single Photo",
    }),
    video: Object.freeze({
      Instagram: "Reel",
      Facebook: "Reel",
      TikTok: "Video Draft",
      YouTube: "Short",
    }),
    slides: Object.freeze({
      Instagram: "Carousel",
      Facebook: "Multi-Image Post",
      TikTok: "Multi-Photo",
      YouTube: "Slideshow Video",
    }),
  });
  const EZ_OUTPUT_OPTIONS = Object.freeze([
    Object.freeze({ platform: "Instagram", types: Object.freeze(["Reel", "Story", "Single Image", "Carousel"]) }),
    Object.freeze({ platform: "Facebook", types: Object.freeze(["Reel", "Story", "Single Image", "Multi-Image Post", "Slideshow Reel"]) }),
    Object.freeze({ platform: "TikTok", types: Object.freeze(["Video Draft", "Single Photo", "Multi-Photo"]) }),
    Object.freeze({ platform: "YouTube", types: Object.freeze(["Short", "Standard Video", "Slideshow Video"]) }),
  ]);

  function ezIsClipInput(kind) {
    return EZ_CLIP_INPUTS.includes(String(kind || "").trim());
  }

  function ezIsNativeStillOutput(platform, outputType) {
    const types = EZ_NATIVE_STILL_TYPES[String(platform || "").trim()] || [];
    return types.includes(String(outputType || "").trim());
  }

  function ezPhotoCountKind(count) {
    const n = Math.max(0, Number(count) || 0);
    return n <= 1 ? EZ_INPUTS.SINGLE_PHOTO : EZ_INPUTS.MULTIPLE_PHOTOS;
  }

  function ezVideoOverrides({ finishedVideo = false, clipInput = false } = {}) {
    if (finishedVideo || clipInput) return { ...EZ_VIDEO_PASSES };
    return { ...EZ_PHOTO_PASSES.video };
  }

  function ezVideoStoryExtras(platforms) {
    const selected = Array.isArray(platforms) && platforms.length ? platforms : null;
    return [...EZ_VIDEO_STORY_EXTRAS].filter((key) => {
      const platform = key.split("::", 1)[0];
      return !selected || selected.includes(platform);
    });
  }

  function ezSlidesOverrides(photoCount) {
    if (Math.max(0, Number(photoCount) || 0) <= 1) return { ...EZ_PHOTO_PASSES.single };
    return { ...EZ_PHOTO_PASSES.slides };
  }

  function ezDefaultPassMap(photoCount, packageId, { clipInput = false, finishedVideo = false, inputKind = "" } = {}) {
    const clip = Boolean(clipInput) || ezIsClipInput(inputKind);
    const finished = Boolean(finishedVideo) || String(inputKind || "") === EZ_INPUTS.FINISHED_VIDEO;
    const pkg = String(packageId || "").trim().toLowerCase();
    if (pkg === EZ_PACKAGES.VIDEO) return ezVideoOverrides({ finishedVideo: finished, clipInput: clip });
    if (pkg === EZ_PACKAGES.SLIDES) return ezSlidesOverrides(photoCount);
    const n = Math.max(0, Number(photoCount) || 0);
    if (clip || finished) return ezVideoOverrides({ finishedVideo: finished, clipInput: clip });
    return n <= 1 ? { ...EZ_PHOTO_PASSES.single } : { ...EZ_PHOTO_PASSES.video };
  }

  function ezMasterContentType(photoCount) {
    return (Math.max(0, Number(photoCount) || 0) <= 1) ? "Feed Post" : "Photo Set";
  }

  function ezPlanFromPhotoCount({ photoCount, platforms, packageId, clipInput = false, finishedVideo = false, inputKind = "" } = {}) {
    const count = Math.max(0, Number(photoCount) || 0);
    const defaults = ezDefaultPassMap(count, packageId, { clipInput, finishedVideo, inputKind });
    const requested = Array.isArray(platforms) && platforms.length
      ? [...new Set(platforms.map((value) => String(value || "").trim()).filter(Boolean))]
      : Object.keys(defaults);
    const items = [];
    for (const platform of requested) {
      const outputType = defaults[platform];
      if (!outputType) continue;
      items.push({ platform, output_type: outputType });
    }
    const pkg = String(packageId || "").trim().toLowerCase();
    const extras = (pkg === EZ_PACKAGES.VIDEO || (!pkg && count > 1))
      ? ezVideoStoryExtras(items.map((item) => item.platform))
      : [];
    return {
      photo_count: count,
      photo_count_kind: ezPhotoCountKind(count),
      master_content_type: ezMasterContentType(count),
      youtube_enabled: Boolean(defaults.YouTube),
      platforms: items.map((item) => item.platform),
      overrides: Object.fromEntries(items.map((item) => [item.platform, item.output_type])),
      extras,
      items,
    };
  }

  function ezCanonicalOutputType(platform, outputType) {
    return String(outputType || "").trim();
  }

  function ezCaptionFields(mode, { caption = "", captions = [], finished = false } = {}) {
    const normalized = String(mode || "ai").trim().toLowerCase();
    if (finished) {
      return {
        mode: normalized === "manual" ? "manual" : (normalized === "none" ? "none" : "ai"),
        overlay_titles: false,
        title_mode: "Leave blank",
        requested_title: "",
        caption_mode: normalized === "manual" ? "Force exact" : (normalized === "none" ? "Leave blank" : "AI decides"),
        requested_caption: String(caption || "").trim(),
        slide_captions: [],
      };
    }
    if (normalized === "manual") {
      const parts = Array.isArray(captions) ? captions.map((value) => String(value || "").trim()).filter(Boolean) : [];
      return {
        mode: "manual",
        overlay_titles: true,
        title_mode: "AI decides",
        requested_title: "",
        caption_mode: "AI decides",
        requested_caption: String(caption || "").trim(),
        slide_captions: parts,
      };
    }
    if (normalized === "none") {
      return {
        mode: "none",
        overlay_titles: false,
        title_mode: "Leave blank",
        requested_title: "",
        caption_mode: "Leave blank",
        requested_caption: "",
        script_mode: "Leave blank",
        requested_script: "",
        live_fallback: {
          title_mode: "Force exact",
          requested_title: " ",
          caption_mode: "Force exact",
          requested_caption: " ",
          script_mode: "AI decides",
          requested_script: "",
        },
      };
    }
    return {
      mode: "ai",
      overlay_titles: true,
      title_mode: "AI decides",
      requested_title: "",
      caption_mode: "AI decides",
      requested_caption: "",
    };
  }

  function ezOriginNotes({ inputKind, captionMode, origin, manualCount, aiCount, packageId, clipCount } = {}) {
    const tag = String(origin || EZ_ORIGIN).trim() || EZ_ORIGIN;
    const input = String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO;
    const caption = String(captionMode || "ai").trim().toLowerCase() || "ai";
    const pkg = String(packageId || "").trim().toLowerCase();
    const parts = [`origin=${tag}`, `ez-input=${input}`, `ez-caption=${caption}`];
    if (tag === EZ_ORIGIN_AZ) parts.push("az-auto-queue=1");
    if (pkg === EZ_PACKAGES.VIDEO || pkg === EZ_PACKAGES.SLIDES || pkg === EZ_PACKAGES.CUSTOM) {
      parts.push(`ez-package=${pkg}`);
    }
    const manual = Number(manualCount);
    const ai = Number(aiCount);
    const clips = Number(clipCount);
    if (Number.isFinite(manual) && manual > 0) parts.push(`ez-manual=${Math.round(manual)}`);
    if (Number.isFinite(ai) && ai > 0) parts.push(`ez-ai=${Math.round(ai)}`);
    if (Number.isFinite(clips) && clips > 0) parts.push(`ez-clips=${Math.round(clips)}`);
    return parts.join("; ");
  }

  function ezIdeaSummary({ inputKind } = {}) {
    return `Created from New content (origin=${EZ_ORIGIN}; ez-input=${String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO}).`;
  }

  function parseEzOriginNotes(value) {
    const text = String(value || "");
    const originMatch = /origin=(az-finished-video|ez-wizard|ez-button)/i.exec(text);
    if (!originMatch) return null;
    const input = /ez-input=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    const caption = /ez-caption=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    const manual = Number(/ez-manual=(\d+)/i.exec(text)?.[1] || "");
    const ai = Number(/ez-ai=(\d+)/i.exec(text)?.[1] || "");
    const packageId = /ez-package=(video|slides|custom)/i.exec(text)?.[1] || "";
    const clips = Number(/ez-clips=(\d+)/i.exec(text)?.[1] || "");
    return {
      origin: originMatch[1].toLowerCase(),
      inputKind: input,
      captionMode: caption,
      packageId: packageId ? packageId.toLowerCase() : null,
      manualCount: Number.isFinite(manual) && manual > 0 ? manual : null,
      aiCount: Number.isFinite(ai) && ai > 0 ? ai : null,
      clipCount: Number.isFinite(clips) && clips > 0 ? clips : null,
    };
  }

  function ezIntakeKindFromWizard(inputKind) {
    const kind = String(inputKind || "").trim();
    if (kind === EZ_INPUTS.FINISHED_VIDEO) return EZ_INPUTS.FINISHED_VIDEO;
    if (kind === EZ_INPUTS.FINISHED_STILLS) return EZ_INPUTS.FINISHED_STILLS;
    if (ezIsClipInput(kind)) return kind;
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS || kind === EZ_INPUTS.MULTIPLE_AI || EZ_INPUTS.MIXED === kind) {
      return EZ_INPUTS.MULTIPLE_PHOTOS;
    }
    return EZ_INPUTS.SINGLE_PHOTO;
  }

  function ezImageModeFromWizard(inputKind) {
    const kind = String(inputKind || "").trim();
    if (
      kind === EZ_INPUTS.SINGLE_PHOTO
      || kind === EZ_INPUTS.MULTIPLE_PHOTOS
      || ezIsClipInput(kind)
      || kind === EZ_INPUTS.FINISHED_VIDEO
      || kind === EZ_INPUTS.FINISHED_STILLS
    ) return "Manual Upload";
    return "Make AI Generated";
  }

  function ezWizardPhotoCount(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.SINGLE_AI) return 1;
    if (kind === EZ_INPUTS.VIDEO_CLIPS) return 0;
    if (kind === EZ_INPUTS.MIXED) {
      return Math.max(0, Number(answers.manualCount) || 0) + Math.max(0, Number(answers.aiCount) || 0);
    }
    const n = Math.max(0, Number(answers.photoCount) || 0);
    if (n) return n;
    const max = Math.max(0, Number(answers.photoCountMax) || 0);
    if (max) return max;
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS || kind === EZ_INPUTS.MULTIPLE_AI) return 4;
    if (kind === EZ_INPUTS.PHOTOS_AND_CLIPS) return 3;
    return 1;
  }

  function ezWizardClipCount(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    const n = Math.max(0, Number(answers.clipCount) || 0);
    if (n) return n;
    if (kind === EZ_INPUTS.PHOTOS_AND_CLIPS || kind === EZ_INPUTS.VIDEO_CLIPS) return 1;
    return 0;
  }

  function ezWizardExpectedUploads(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    if (answers.photoWait) return 0;
    if (kind === EZ_INPUTS.SINGLE_AI || kind === EZ_INPUTS.MULTIPLE_AI) return 0;
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.FINISHED_VIDEO) return 1;
    if (kind === EZ_INPUTS.PHOTOS_AND_CLIPS) {
      return Math.max(1, ezWizardPhotoCount(answers)) + Math.max(1, ezWizardClipCount(answers));
    }
    if (kind === EZ_INPUTS.VIDEO_CLIPS) return Math.max(1, ezWizardClipCount(answers));
    if (kind === EZ_INPUTS.FINISHED_STILLS) return Math.max(1, Number(answers.photoCount) || 1);
    if (kind === EZ_INPUTS.MIXED) return Math.max(1, Number(answers.manualCount) || 1);
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS) return Math.max(2, Number(answers.photoCount) || 2);
    return null;
  }

  function ezWizardRequiresUploads(answers = {}) {
    return ezWizardExpectedUploads(answers) > 0;
  }

  function ezPlanFromOverrides(photoCount, overrides, extras = []) {
    const count = Math.max(0, Number(photoCount) || 0);
    const map = overrides && typeof overrides === "object" ? overrides : {};
    const items = Object.entries(map)
      .map(([platform, outputType]) => ({
        platform: String(platform || "").trim(),
        output_type: ezCanonicalOutputType(platform, outputType),
      }))
      .filter((item) => item.platform && item.output_type);
    return {
      photo_count: count,
      photo_count_kind: ezPhotoCountKind(count),
      master_content_type: ezMasterContentType(count),
      youtube_enabled: items.some((item) => item.platform === "YouTube"),
      platforms: items.map((item) => item.platform),
      overrides: Object.fromEntries(items.map((item) => [item.platform, item.output_type])),
      extras: (Array.isArray(extras) ? extras : []).map(String).filter(Boolean),
      items,
    };
  }

  function ezWizardPackages(photoCount, answers = {}) {
    const count = Math.max(1, Number(photoCount) || 1);
    const clipInput = ezIsClipInput(answers.inputKind) || String(answers.inputKind || "") === EZ_INPUTS.FINISHED_VIDEO;
    const packages = [
      {
        id: EZ_PACKAGES.VIDEO,
        label: "Vertical video",
        hint: "IG Reel · FB Reel · TikTok · YouTube Short · IG & FB Stories · grid thumbnail",
      },
    ];
    if (!clipInput) {
      packages.push({
        id: EZ_PACKAGES.SLIDES,
        label: "Scrollable slides",
        hint: count <= 1
          ? "IG / FB / TikTok stills. YouTube has no image post — pick Vertical video for a Short."
          : "IG carousel · FB album · TikTok photos. YouTube is a rendered video, not an image post.",
      });
    }
    packages.push({ id: EZ_PACKAGES.CUSTOM, label: "Custom formats", hint: "Pick each platform format" });
    return packages;
  }

  const EZ_SCHEDULE_GAP_MS = 90 * 60 * 1000;
  const EZ_SUGGEST_HORIZON_DAYS = 7;
  const EZ_SUGGEST_LEAD_MS = 10 * 60 * 1000;

  function ezIndustryBestWindows(platform, outputType) {
    const p = String(platform || "").toLowerCase();
    const t = String(outputType || "").toLowerCase();
    if (p.includes("tiktok")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["19:00-21:00"] };
    if (p.includes("youtube") && (t.includes("standard") || t.includes("long"))) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["10:00-16:00"] };
    if (p.includes("youtube")) return { days: ["Wed", "Thu", "Fri", "Sat"], windows: ["14:00-16:00", "20:00-22:00"] };
    if (t.includes("story")) return { days: ["Mon", "Tue", "Wed", "Thu", "Fri"], windows: ["16:00-18:00", "19:00-21:00"] };
    if (t.includes("carousel") || t.includes("single") || t.includes("feed") || t.includes("multi-image") || t.includes("photo")) {
      return { days: ["Wed", "Thu"], windows: ["12:00-14:00", "18:00-20:00"] };
    }
    if (p.includes("facebook")) return { days: ["Tue", "Wed", "Thu"], windows: ["12:00-13:00", "18:00-20:00"] };
    return { days: ["Tue", "Wed", "Thu"], windows: ["11:00-13:00", "18:00-21:00"] };
  }

  function ezChicagoDateTimeParts(date = new Date()) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return {
      year: get("year"),
      month: get("month"),
      day: get("day"),
      hour: get("hour"),
      minute: get("minute"),
    };
  }

  function ezChicagoWallToUtcMs(year, month, day, hour, minute) {
    const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let ms = want;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Chicago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    });
    for (let i = 0; i < 8; i++) {
      const parts = fmt.formatToParts(new Date(ms));
      const get = (type) => Number(parts.find((part) => part.type === type)?.value);
      const got = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), 0, 0);
      const delta = want - got;
      if (delta === 0) return ms;
      ms += delta;
    }
    return ms;
  }

  function ezAddCivilDays(year, month, day, delta) {
    const utc = Date.UTC(year, month - 1, day) + delta * 86400000;
    const next = new Date(utc);
    return { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
  }

  function ezChicagoWeekdayShort(date = new Date()) {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", weekday: "short" }).format(date);
  }

  function ezCivilKey(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function ezOccupiedOnDay(occupiedMs, civil) {
    return (occupiedMs || []).filter((ms) => {
      if (!Number.isFinite(ms)) return false;
      const parts = ezChicagoDateTimeParts(new Date(ms));
      return ezCivilKey(parts.year, parts.month, parts.day) === civil.key;
    });
  }

  function ezFlattenOccupied(occupiedByPlatform) {
    return Object.values(occupiedByPlatform || {}).flat().filter((ms) => Number.isFinite(ms));
  }

  function ezScheduleConflicts(ms, occupiedMs, gapMs = EZ_SCHEDULE_GAP_MS) {
    if (!Number.isFinite(ms)) return false;
    return (occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs);
  }

  function ezScoreAnalyticsSlot({ preferred, windowIndex, crowding, platformCrowding, dayIndex }) {
    let score = 100;
    score += preferred ? 40 : 0;
    score += Math.max(0, 16 - windowIndex * 6);
    score -= Math.min(platformCrowding, 4) * 6;
    score -= Math.min(crowding, 6) * 2;
    score -= dayIndex * 2;
    return score;
  }

  function ezPickBalancedSuggestedIso(windows, now = new Date(), options = {}) {
    const daysPref = Array.isArray(options.days) ? options.days.filter(Boolean) : [];
    const occupiedMs = options.occupiedMs || [];
    const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
    const windowList = Array.isArray(windows) && windows.length ? windows : ["12:00-13:00"];
    const nowMs = now.getTime() + EZ_SUGGEST_LEAD_MS;
    const chicago = ezChicagoDateTimeParts(now);
    const horizon = [];
    for (let i = 0; i < EZ_SUGGEST_HORIZON_DAYS; i++) {
      const civilBase = i === 0
        ? { year: chicago.year, month: chicago.month, day: chicago.day }
        : ezAddCivilDays(chicago.year, chicago.month, chicago.day, i);
      const noonMs = ezChicagoWallToUtcMs(civilBase.year, civilBase.month, civilBase.day, 12, 0);
      horizon.push({
        ...civilBase,
        index: i,
        weekday: ezChicagoWeekdayShort(new Date(noonMs)),
        key: ezCivilKey(civilBase.year, civilBase.month, civilBase.day),
      });
    }

    const collect = (preferredOnly) => {
      let best = null;
      for (const civil of horizon) {
        const preferred = !daysPref.length || daysPref.includes(civil.weekday);
        if (preferredOnly && daysPref.length && !preferred) continue;
        const crowding = ezOccupiedOnDay(occupiedMs, civil).length;
        const platformCrowding = ezOccupiedOnDay(platformOccupiedMs, civil).length;
        for (let windowIndex = 0; windowIndex < windowList.length; windowIndex++) {
          const first = String(windowList[windowIndex] || "12:00-13:00").split("-")[0] || "12:00";
          const [hh, mm] = first.split(":").map((n) => Number(n) || 0);
          const ms = ezChicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
          if (ms <= nowMs) continue;
          if (ezScheduleConflicts(ms, platformOccupiedMs)) continue;
          const score = ezScoreAnalyticsSlot({
            preferred,
            windowIndex,
            crowding,
            platformCrowding,
            dayIndex: civil.index,
          });
          if (!best || score > best.score) best = { score, ms };
        }
      }
      return best;
    };

    const preferred = collect(true);
    if (preferred) return new Date(preferred.ms).toISOString();
    const openWindow = collect(false);
    if (openWindow) return new Date(openWindow.ms).toISOString();
    const first = String(windowList[0] || "12:00-13:00");
    const start = first.split("-")[0] || "12:00";
    const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
    let civil = { year: chicago.year, month: chicago.month, day: chicago.day };
    let ms = ezChicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
    if (ms <= nowMs) {
      civil = ezAddCivilDays(civil.year, civil.month, civil.day, 1);
      ms = ezChicagoWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0);
    }
    return ezNextOpenScheduleIso(new Date(ms).toISOString(), platformOccupiedMs);
  }

  function ezSuggestedChicagoIso(windows, now = new Date(), options = {}) {
    return ezPickBalancedSuggestedIso(windows, now, options);
  }

  function ezNextOpenScheduleIso(candidateIso, occupiedMs, gapMs = EZ_SCHEDULE_GAP_MS) {
    let ms = Date.parse(candidateIso);
    if (Number.isNaN(ms)) ms = Date.now();
    let guard = 0;
    while ((occupiedMs || []).some((other) => Number.isFinite(other) && Math.abs(other - ms) < gapMs) && guard < 36) {
      ms += gapMs;
      guard += 1;
    }
    return new Date(ms).toISOString();
  }

  function ezPlanScheduleItems(planned) {
    const items = [];
    const seen = new Set();
    const push = (platform, outputType) => {
      const p = String(platform || "").trim();
      const t = String(outputType || "").trim();
      if (!p || !t) return;
      const key = `${p}::${t}`;
      if (seen.has(key)) return;
      seen.add(key);
      items.push({ platform: p, output_type: t });
    };
    for (const item of planned?.items || []) push(item.platform, item.output_type);
    for (const extra of planned?.extras || []) {
      const [platform, ...rest] = String(extra).split("::");
      push(platform, rest.join("::"));
    }
    return items;
  }

  function ezBuildSuggestedScheduleMap(items, occupiedByPlatform = {}, now = new Date()) {
    const reserved = {};
    for (const [platform, times] of Object.entries(occupiedByPlatform || {})) {
      reserved[platform] = [...(times || [])];
    }
    const indexed = (items || []).map((item, index) => ({ item, index }));
    indexed.sort((a, b) => {
      const rank = (/story/i.test(String(a.item.output_type || "")) ? 1 : 0)
        - (/story/i.test(String(b.item.output_type || "")) ? 1 : 0);
      return rank || a.index - b.index;
    });
    const stamps = new Map();
    for (const { item } of indexed) {
      const platform = String(item.platform || "").trim();
      const outputType = String(item.output_type || "").trim();
      if (!platform || !outputType) continue;
      const key = `${platform}::${outputType}`;
      const existing = String(item.scheduled_at || "").trim();
      if (existing && !Number.isNaN(Date.parse(existing))) {
        const iso = new Date(existing).toISOString();
        stamps.set(key, iso);
        (reserved[platform] ||= []).push(Date.parse(iso));
        continue;
      }
      const industry = ezIndustryBestWindows(platform, outputType);
      const iso = ezPickBalancedSuggestedIso(industry.windows, now, {
        days: industry.days,
        occupiedMs: ezFlattenOccupied(reserved),
        platformOccupiedMs: reserved[platform] || [],
      });
      stamps.set(key, iso);
      (reserved[platform] ||= []).push(Date.parse(iso));
    }
    return stamps;
  }

  function ezWizardResolvePackage(answers = {}) {
    const count = ezWizardPhotoCount(answers);
    const packageId = String(answers.packageId || EZ_PACKAGES.VIDEO).trim() || EZ_PACKAGES.VIDEO;
    if (packageId === "custom" && Array.isArray(answers.customItems) && answers.customItems.length) {
      const overrides = {};
      const extras = [];
      const seen = new Set();
      for (const item of answers.customItems) {
        const platform = String(item?.platform || "").trim();
        const outputType = ezCanonicalOutputType(platform, item?.output_type);
        if (!platform || !outputType || outputType === "Story" && platform === "TikTok") continue;
        if (ezIsClipInput(answers.inputKind) && ezIsNativeStillOutput(platform, outputType)) continue;
        if (!overrides[platform] && outputType !== "Story") overrides[platform] = outputType;
        else extras.push(`${platform}::${outputType}`);
        seen.add(platform);
      }
      return ezPlanFromOverrides(count, overrides, extras);
    }
    const selected = Array.isArray(answers.platforms) && answers.platforms.length
      ? answers.platforms
      : null;
    const finishedVideo = String(answers.inputKind || "") === EZ_INPUTS.FINISHED_VIDEO;
    const clipInput = ezIsClipInput(answers.inputKind);
    if (clipInput || finishedVideo || packageId === EZ_PACKAGES.VIDEO) {
      const overrides = ezVideoOverrides({ finishedVideo, clipInput });
      const filtered = selected
        ? Object.fromEntries(Object.entries(overrides).filter(([platform]) => selected.includes(platform)))
        : overrides;
      return ezPlanFromOverrides(count, filtered, ezVideoStoryExtras(selected || Object.keys(filtered)));
    }
    if (!clipInput && (String(answers.inputKind || "") === EZ_INPUTS.FINISHED_STILLS || packageId === EZ_PACKAGES.SLIDES || packageId === "stills")) {
      const overrides = ezSlidesOverrides(count);
      const filtered = selected
        ? Object.fromEntries(Object.entries(overrides).filter(([platform]) => selected.includes(platform)))
        : overrides;
      return ezPlanFromOverrides(count, filtered);
    }
    return ezPlanFromPhotoCount({
      photoCount: count,
      platforms: selected || undefined,
      packageId,
      inputKind: answers.inputKind,
      clipInput,
      finishedVideo,
    });
  }

  window.ChicagoShiningEzPlan = {
    EZ_ORIGIN,
    EZ_ORIGIN_WIZARD,
    EZ_ORIGIN_AZ,
    EZ_INPUTS,
    EZ_CAPTION_MODES,
    EZ_PHASE1_INPUTS,
    EZ_DISABLED_INPUTS,
    EZ_CLIP_INPUTS,
    EZ_NATIVE_STILL_TYPES,
    EZ_PACKAGES,
    EZ_VIDEO_STORY_EXTRAS,
    EZ_VIDEO_PASSES,
    EZ_PHOTO_PASSES,
    EZ_OUTPUT_OPTIONS,
    ezIsClipInput,
    ezIsNativeStillOutput,
    ezPhotoCountKind,
    ezVideoOverrides,
    ezSlidesOverrides,
    ezDefaultPassMap,
    ezMasterContentType,
    ezPlanFromPhotoCount,
    ezCanonicalOutputType,
    ezCaptionFields,
    ezOriginNotes,
    ezIdeaSummary,
    parseEzOriginNotes,
    ezIntakeKindFromWizard,
    ezImageModeFromWizard,
    ezWizardPhotoCount,
    ezWizardClipCount,
    ezWizardExpectedUploads,
    ezWizardRequiresUploads,
    ezWizardPackages,
    ezWizardResolvePackage,
    ezPlanScheduleItems,
    ezBuildSuggestedScheduleMap,
    ezPickBalancedSuggestedIso,
  };
})();
