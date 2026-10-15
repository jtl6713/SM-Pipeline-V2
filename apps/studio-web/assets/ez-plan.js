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
    VIBE_CUT: "vibe-cut",
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

  /** Map Master_Content_Type onto the EZ package recommend used for /plan. */
  function ezPackageFromContentType(contentType) {
    const type = String(contentType || "").trim();
    if (type === "Carousel" || type === "Feed Post") return EZ_PACKAGES.SLIDES;
    if (type === "Vertical Short Video" || type === "Longform Video" || type === "Photo Set" || type === "Story") {
      return EZ_PACKAGES.VIDEO;
    }
    return "";
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

  function ezMasterContentType(photoCount, packageId = "") {
    const pkg = String(packageId || "").trim().toLowerCase();
    const n = Math.max(0, Number(photoCount) || 0);
    if (pkg === EZ_PACKAGES.SLIDES) return n <= 1 ? "Feed Post" : "Carousel";
    return n <= 1 ? "Feed Post" : "Photo Set";
  }

  function ezIsHorizontalSource(width, height) {
    const w = Number(width) || 0;
    const h = Number(height) || 0;
    if (!w || !h) return false;
    return w > h;
  }

  function ezPlanFromSourceAspect({ width, height, inputKind = "" } = {}) {
    const horizontal = ezIsHorizontalSource(width, height);
    const vibeCut = ezIsVibeCutInput(inputKind);
    if (horizontal) {
      // Finished-video 16:9 → YouTube Standard only.
      // Vibe Cut 16:9 → YouTube Standard (16:9) + Short (9:16 remount), no Reels/TikTok/Stories.
      if (vibeCut) {
        return {
          source_aspect: "horizontal",
          packageId: EZ_PACKAGES.VIDEO,
          master_content_type: "Longform Video",
          platforms: ["YouTube"],
          overrides: { YouTube: "Standard Video" },
          extras: ["YouTube::Short"],
          items: [
            { platform: "YouTube", output_type: "Standard Video" },
            { platform: "YouTube", output_type: "Short" },
          ],
          youtube_enabled: true,
        };
      }
      return {
        source_aspect: "horizontal",
        packageId: EZ_PACKAGES.VIDEO,
        master_content_type: "Longform Video",
        platforms: ["YouTube"],
        overrides: { YouTube: "Standard Video" },
        extras: [],
        items: [{ platform: "YouTube", output_type: "Standard Video" }],
        youtube_enabled: true,
      };
    }
    const overrides = { ...EZ_VIDEO_PASSES };
    const items = Object.entries(overrides).map(([platform, output_type]) => ({ platform, output_type }));
    const extras = [...EZ_VIDEO_STORY_EXTRAS];
    return {
      source_aspect: "vertical",
      packageId: EZ_PACKAGES.VIDEO,
      master_content_type: "Vertical Short Video",
      platforms: items.map((item) => item.platform),
      overrides,
      extras,
      items,
      youtube_enabled: true,
    };
  }

  function ezMergeAspectPlan(basePlan, aspectPlan) {
    if (!aspectPlan) return basePlan;
    const merged = {
      ...(basePlan || {}),
      master_content_type: aspectPlan.master_content_type,
      platforms: [...aspectPlan.platforms],
      overrides: { ...aspectPlan.overrides },
      extras: [...(aspectPlan.extras || [])],
      items: [...(aspectPlan.items || [])],
      youtube_enabled: aspectPlan.youtube_enabled,
      source_aspect: aspectPlan.source_aspect,
    };
    return merged;
  }

  function ezPlanFromPhotoCount({
    photoCount,
    platforms,
    packageId,
    contentType = "",
    clipInput = false,
    finishedVideo = false,
    inputKind = "",
  } = {}) {
    const count = Math.max(0, Number(photoCount) || 0);
    const pkg = String(packageId || "").trim().toLowerCase() || ezPackageFromContentType(contentType);
    const defaults = ezDefaultPassMap(count, pkg, { clipInput, finishedVideo, inputKind });
    const requested = Array.isArray(platforms) && platforms.length
      ? [...new Set(platforms.map((value) => String(value || "").trim()).filter(Boolean))]
      : Object.keys(defaults);
    const items = [];
    for (const platform of requested) {
      const outputType = defaults[platform];
      if (!outputType) continue;
      items.push({ platform, output_type: outputType });
    }
    const extras = (pkg === EZ_PACKAGES.VIDEO || (!pkg && count > 1))
      ? ezVideoStoryExtras(items.map((item) => item.platform))
      : [];
    return {
      photo_count: count,
      photo_count_kind: ezPhotoCountKind(count),
      master_content_type: ezMasterContentType(count, pkg),
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

  function ezOriginNotes({ inputKind, captionMode, origin, manualCount, aiCount, packageId, clipCount, sourceAspect } = {}) {
    const tag = String(origin || EZ_ORIGIN).trim() || EZ_ORIGIN;
    const input = String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO;
    const caption = String(captionMode || "ai").trim().toLowerCase() || "ai";
    const pkg = String(packageId || "").trim().toLowerCase();
    const parts = [`origin=${tag}`, `ez-input=${input}`, `ez-caption=${caption}`];
    if (tag === EZ_ORIGIN_AZ) parts.push("az-auto-queue=1");
    const aspect = String(sourceAspect || "").trim().toLowerCase();
    if (aspect === "horizontal" || aspect === "vertical") parts.push(`source-aspect=${aspect}`);
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
    const sourceAspect = /source-aspect=(horizontal|vertical)/i.exec(text)?.[1] || "";
    return {
      origin: originMatch[1].toLowerCase(),
      inputKind: input,
      captionMode: caption,
      packageId: packageId ? packageId.toLowerCase() : null,
      sourceAspect: sourceAspect ? sourceAspect.toLowerCase() : null,
      manualCount: Number.isFinite(manual) && manual > 0 ? manual : null,
      aiCount: Number.isFinite(ai) && ai > 0 ? ai : null,
      clipCount: Number.isFinite(clips) && clips > 0 ? clips : null,
    };
  }

  function ezIsVibeCutInput(kind) {
    return String(kind || "").trim() === EZ_INPUTS.VIBE_CUT;
  }

  function ezIntakeKindFromWizard(inputKind) {
    const kind = String(inputKind || "").trim();
    if (kind === EZ_INPUTS.VIBE_CUT) return EZ_INPUTS.VIBE_CUT;
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
      || kind === EZ_INPUTS.VIBE_CUT
    ) return "Manual Upload";
    return "Make AI Generated";
  }

  function ezWizardPhotoCount(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.SINGLE_AI || kind === EZ_INPUTS.VIBE_CUT) return 1;
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
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.FINISHED_VIDEO || kind === EZ_INPUTS.VIBE_CUT) return 1;
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
    const vibeCut = ezIsVibeCutInput(answers.inputKind);
    const clipInput = ezIsClipInput(answers.inputKind)
      || String(answers.inputKind || "") === EZ_INPUTS.FINISHED_VIDEO
      || vibeCut;
    const packages = [
      {
        id: EZ_PACKAGES.VIDEO,
        label: vibeCut ? "Video (Vibe Cut)" : "Vertical video",
        hint: vibeCut
          ? "Vertical → Reels/Short/TikTok · Horizontal 16:9 → YouTube Standard + Short"
          : "IG Reel · FB Reel · TikTok · YouTube Short · IG & FB Stories · grid thumbnail",
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
  const EZ_SUGGEST_HORIZON_DAYS = 30;
  const EZ_PRIORITY_SCHEDULE_WINDOWS = ["05:00-07:00", "10:30-12:30", "16:00-18:00"];
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

  const EZ_DEFAULT_TIME_ZONE = "America/Chicago";
  /** Inclusive local blackout: 8:00 PM through 3:30 AM profile time. */
  const EZ_SCHEDULE_BLACKOUT_START_MINUTES = 20 * 60;
  const EZ_SCHEDULE_BLACKOUT_END_MINUTES = 3 * 60 + 30;
  const EZ_SCHEDULE_OPEN_START_MINUTES = 3 * 60 + 31;
  const EZ_SCHEDULE_OPEN_END_MINUTES = 19 * 60 + 59;

  function ezNormalizeHorizonDays(value, fallback = EZ_SUGGEST_HORIZON_DAYS) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return Math.floor(Number(fallback) || EZ_SUGGEST_HORIZON_DAYS);
    return Math.min(90, Math.max(1, Math.floor(n)));
  }

  function ezScheduleLaneKey(platform, outputType) {
    const p = String(platform || "").trim().toLowerCase();
    const t = String(outputType || "").trim().toLowerCase();
    if (!p) return "";
    if (!t) return p;
    return `${p}::${t}`;
  }

  function ezNormalizeTimeZone(value) {
    const zone = String(value || "").trim() || EZ_DEFAULT_TIME_ZONE;
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: zone }).format(new Date());
      return zone;
    } catch {
      return EZ_DEFAULT_TIME_ZONE;
    }
  }

  function ezZonedDateTimeParts(date = new Date(), timeZone = EZ_DEFAULT_TIME_ZONE) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: ezNormalizeTimeZone(timeZone),
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const get = (type) => Number(parts.find((part) => part.type === type)?.value);
    return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
  }

  function ezZonedWallToUtcMs(year, month, day, hour, minute, timeZone = EZ_DEFAULT_TIME_ZONE) {
    const want = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
    let ms = want;
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: ezNormalizeTimeZone(timeZone),
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", hourCycle: "h23",
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

  function ezWeekdayShort(date = new Date(), timeZone = EZ_DEFAULT_TIME_ZONE) {
    return new Intl.DateTimeFormat("en-US", { timeZone: ezNormalizeTimeZone(timeZone), weekday: "short" }).format(date);
  }

  function ezCivilKey(year, month, day) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function ezOccupiedOnDay(occupiedMs, civil, timeZone = EZ_DEFAULT_TIME_ZONE) {
    return (occupiedMs || []).filter((ms) => {
      if (!Number.isFinite(ms)) return false;
      const parts = ezZonedDateTimeParts(new Date(ms), timeZone);
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

  function ezIsBlackoutLocalTime(ms, timeZone = EZ_DEFAULT_TIME_ZONE) {
    if (!Number.isFinite(ms)) return false;
    const parts = ezZonedDateTimeParts(new Date(ms), timeZone);
    const minutes = parts.hour * 60 + parts.minute;
    return minutes >= EZ_SCHEDULE_BLACKOUT_START_MINUTES || minutes <= EZ_SCHEDULE_BLACKOUT_END_MINUTES;
  }

  function ezAdvancePastBlackout(ms, timeZone = EZ_DEFAULT_TIME_ZONE) {
    if (!Number.isFinite(ms) || !ezIsBlackoutLocalTime(ms, timeZone)) return ms;
    const parts = ezZonedDateTimeParts(new Date(ms), timeZone);
    let civil = { year: parts.year, month: parts.month, day: parts.day };
    if (parts.hour >= 23) civil = ezAddCivilDays(civil.year, civil.month, civil.day, 1);
    return ezZonedWallToUtcMs(civil.year, civil.month, civil.day, 3, 1, timeZone);
  }

  function ezIsPriorityLocalTime(ms, timeZone = EZ_DEFAULT_TIME_ZONE) {
    if (!Number.isFinite(ms) || ezIsBlackoutLocalTime(ms, timeZone)) return false;
    const parts = ezZonedDateTimeParts(new Date(ms), timeZone);
    const minutes = parts.hour * 60 + parts.minute;
    for (const window of EZ_PRIORITY_SCHEDULE_WINDOWS) {
      const [start] = window.split("-");
      const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
      if (minutes === hh * 60 + mm) return true;
    }
    return false;
  }

  function ezTimeCrowding(ms, occupiedMs, radiusMinutes = 90, timeZone = EZ_DEFAULT_TIME_ZONE) {
    const target = ezZonedDateTimeParts(new Date(ms), timeZone);
    const targetMinutes = target.hour * 60 + target.minute;
    let count = 0;
    for (const other of occupiedMs || []) {
      if (!Number.isFinite(other)) continue;
      const parts = ezZonedDateTimeParts(new Date(other), timeZone);
      const otherMinutes = parts.hour * 60 + parts.minute;
      const raw = Math.abs(targetMinutes - otherMinutes);
      const distance = Math.min(raw, 1440 - raw);
      if (distance <= radiusMinutes) count += 1;
    }
    return count;
  }

  function ezScoreAnalyticsSlot({ preferred, windowIndex, crowding, platformCrowding, timeCrowding, dayIndex }) {
    let score = 100;
    score += preferred ? 18 : 0;
    score += Math.max(0, 12 - windowIndex * 5);
    score += platformCrowding === 0 ? 14 : 0;
    score += crowding === 0 ? 8 : 0;
    score -= Math.min(platformCrowding, 4) * 42;
    score -= Math.min(crowding, 8) * 12;
    score -= Math.min(timeCrowding, 6) * 8;
    score -= dayIndex * 1.5;
    return score;
  }

  function ezStandardSlotMs(civil, window, timeZone) {
    const [start] = String(window).split("-");
    const [hh, mm] = start.split(":").map((n) => Number(n) || 0);
    return ezZonedWallToUtcMs(civil.year, civil.month, civil.day, hh, mm || 0, timeZone);
  }

  function ezDayStandardsCovered(civil, nowMs, blockers, timeZone) {
    for (const window of EZ_PRIORITY_SCHEDULE_WINDOWS) {
      const ms = ezStandardSlotMs(civil, window, timeZone);
      if (ms <= nowMs || ezIsBlackoutLocalTime(ms, timeZone)) continue;
      if (!ezScheduleConflicts(ms, blockers)) return false;
    }
    return true;
  }

  function ezCivilWithKey(civil) {
    return { ...civil, key: ezCivilKey(civil.year, civil.month, civil.day) };
  }

  function ezExtraCandidateInGap(left, right, windowStart, windowEnd, nowMs, posts, timeZone, gapMs) {
    const span = right - left;
    if (span <= 0) return null;
    const candidates = [];
    const mid = Math.round((left + Math.round(span / 2)) / 60000) * 60000;
    candidates.push(mid);
    const earliest = Math.ceil((left + gapMs) / 60000) * 60000;
    const latest = Math.floor((right - gapMs) / 60000) * 60000;
    if (Number.isFinite(earliest)) candidates.push(earliest);
    if (Number.isFinite(latest)) candidates.push(latest);
    for (let ms = Math.max(windowStart, left); ms <= Math.min(windowEnd, right); ms += 15 * 60 * 1000) {
      candidates.push(ms);
    }
    let chosen = null;
    for (const raw of candidates) {
      const ms = Math.round(raw / 60000) * 60000;
      if (ms < windowStart || ms > windowEnd || ms <= nowMs) continue;
      if (ezIsBlackoutLocalTime(ms, timeZone) || ezScheduleConflicts(ms, posts, gapMs)) continue;
      if (ezIsPriorityLocalTime(ms, timeZone)) continue;
      if (!chosen || Math.abs(ms - mid) < Math.abs(chosen - mid) || (Math.abs(ms - mid) === Math.abs(chosen - mid) && ms < chosen)) {
        chosen = ms;
      }
    }
    return chosen == null ? null : { ms: chosen, span };
  }

  function ezExtraIsoOnDay(civil, nowMs, blockers, timeZone) {
    const openStart = ezZonedWallToUtcMs(
      civil.year,
      civil.month,
      civil.day,
      Math.floor(EZ_SCHEDULE_OPEN_START_MINUTES / 60),
      EZ_SCHEDULE_OPEN_START_MINUTES % 60,
      timeZone,
    );
    const openEnd = ezZonedWallToUtcMs(
      civil.year,
      civil.month,
      civil.day,
      Math.floor(EZ_SCHEDULE_OPEN_END_MINUTES / 60),
      EZ_SCHEDULE_OPEN_END_MINUTES % 60,
      timeZone,
    );
    const windowStart = Math.max(openStart, nowMs + 60 * 1000);
    const windowEnd = openEnd;
    if (!(windowStart < windowEnd)) return "";

    const posts = (blockers || []).filter((ms) => Number.isFinite(ms)).slice().sort((a, b) => a - b);
    let before = null;
    let after = null;
    const interior = [];
    for (const post of posts) {
      if (post < windowStart) before = post;
      else if (post > windowEnd) {
        after = post;
        break;
      } else interior.push(post);
    }
    const markers = [before != null ? before : windowStart, ...interior, after != null ? after : windowEnd];
    let best = null;
    for (let i = 0; i < markers.length - 1; i++) {
      const left = markers[i];
      const right = markers[i + 1];
      const candidate = ezExtraCandidateInGap(left, right, windowStart, windowEnd, nowMs, posts, timeZone, EZ_SCHEDULE_GAP_MS);
      if (!candidate) continue;
      if (!best || candidate.span > best.span || (candidate.span === best.span && candidate.ms < best.ms)) {
        best = candidate;
      }
    }
    return best ? new Date(best.ms).toISOString() : "";
  }

  function ezBlockingTimes(occupiedMs, platformOccupiedMs) {
    const seen = new Set();
    const out = [];
    for (const ms of [...(occupiedMs || []), ...(platformOccupiedMs || [])]) {
      if (!Number.isFinite(ms) || seen.has(ms)) continue;
      seen.add(ms);
      out.push(ms);
    }
    return out;
  }

  function ezOpenMaeSlot(civil, nowMs, blockers, timeZone) {
    for (const window of EZ_PRIORITY_SCHEDULE_WINDOWS) {
      const ms = ezStandardSlotMs(civil, window, timeZone);
      if (ms <= nowMs || ezIsBlackoutLocalTime(ms, timeZone) || ezScheduleConflicts(ms, blockers)) continue;
      return new Date(ms).toISOString();
    }
    return "";
  }

  function ezDayPostCount(civil, times, timeZone) {
    return ezOccupiedOnDay(times, ezCivilWithKey(civil), timeZone).length;
  }

  function ezPickBalancedSuggestedIso(windows, now = new Date(), options = {}) {
    const timeZone = ezNormalizeTimeZone(options.timeZone);
    const occupiedMs = options.occupiedMs || [];
    const platformOccupiedMs = options.platformOccupiedMs || occupiedMs;
    const blockers = ezBlockingTimes(occupiedMs, platformOccupiedMs);
    const nowMs = now.getTime() + (options.leadMs ?? EZ_SUGGEST_LEAD_MS);
    const local = ezZonedDateTimeParts(now, timeZone);
    const horizonDays = ezNormalizeHorizonDays(options.horizonDays, EZ_SUGGEST_HORIZON_DAYS);
    const civils = [];
    for (let i = 0; i < horizonDays; i++) {
      const civil = i === 0
        ? { year: local.year, month: local.month, day: local.day }
        : ezAddCivilDays(local.year, local.month, local.day, i);
      civils.push(ezCivilWithKey(civil));
    }

    // Primary: Day 1 Morning → Afternoon → Evening, then Day 2, … Day X.
    for (const civil of civils) {
      const mae = ezOpenMaeSlot(civil, nowMs, blockers, timeZone);
      if (mae) return mae;
    }

    // Overflow: least-populated eligible day (earliest on ties), widest gap.
    let best = null;
    for (const civil of civils) {
      if (!ezDayStandardsCovered(civil, nowMs, blockers, timeZone)) continue;
      const extra = ezExtraIsoOnDay(civil, nowMs, blockers, timeZone);
      if (!extra) continue;
      const count = ezDayPostCount(civil, platformOccupiedMs, timeZone);
      if (
        !best
        || count < best.count
        || (count === best.count && Date.parse(extra) < Date.parse(best.iso))
      ) {
        best = { iso: extra, count };
      }
    }
    return best ? best.iso : "";
  }

  function ezSuggestedChicagoIso(windows, now = new Date(), options = {}) {
    return ezPickBalancedSuggestedIso(windows, now, options);
  }

  function ezNextOpenScheduleIso(candidateIso, occupiedMs, gapMs = EZ_SCHEDULE_GAP_MS, options = {}) {
    const timeZone = ezNormalizeTimeZone(options.timeZone);
    const now = options.now instanceof Date ? options.now : new Date();
    const platformOccupiedMs = options.platformOccupiedMs || occupiedMs || [];
    const allOccupiedMs = options.occupiedMs || occupiedMs || [];
    // Approve / row paths keep any future non-blackout time that does not clash.
    // Plan regeneration still requires an MAE priority slot unless keepAnyNonClashing.
    const keepAny = options.keepAnyNonClashing === true;
    const ms = Date.parse(candidateIso);
    if (
      Number.isFinite(ms)
      && ms > now.getTime()
      && !ezIsBlackoutLocalTime(ms, timeZone)
      && !ezScheduleConflicts(ms, platformOccupiedMs, gapMs)
      && (keepAny || ezIsPriorityLocalTime(ms, timeZone))
    ) {
      return new Date(ms).toISOString();
    }
    return ezPickBalancedSuggestedIso(EZ_PRIORITY_SCHEDULE_WINDOWS, now, {
      occupiedMs: allOccupiedMs,
      platformOccupiedMs,
      timeZone,
    });
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

  function ezBuildSuggestedScheduleMap(items, occupiedByLane = {}, now = new Date(), options = {}) {
    const reserved = {};
    for (const [lane, times] of Object.entries(occupiedByLane || {})) {
      reserved[lane] = [...(times || [])];
    }
    const horizonDays = ezNormalizeHorizonDays(options.horizonDays, EZ_SUGGEST_HORIZON_DAYS);
    const indexed = (items || []).map((item, index) => ({ item, index }));
    indexed.sort((a, b) => {
      const rank = (/story/i.test(String(a.item.output_type || "")) ? 1 : 0)
        - (/story/i.test(String(b.item.output_type || "")) ? 1 : 0);
      return rank || a.index - b.index;
    });
    const stamps = new Map();
    const laneTimes = (platform, outputType) => {
      const lane = ezScheduleLaneKey(platform, outputType);
      const typed = reserved[lane] || [];
      const legacy = reserved[String(platform || "").trim()]
        || reserved[String(platform || "").trim().toLowerCase()]
        || [];
      return ezBlockingTimes(typed, legacy);
    };
    for (const { item } of indexed) {
      const platform = String(item.platform || "").trim();
      const outputType = String(item.output_type || "").trim();
      if (!platform || !outputType) continue;
      const key = `${platform}::${outputType}`;
      const lane = ezScheduleLaneKey(platform, outputType);
      const existing = String(item.scheduled_at || "").trim();
      if (existing && !Number.isNaN(Date.parse(existing))) {
        const iso = new Date(existing).toISOString();
        const existingMs = Date.parse(iso);
        const occ = laneTimes(platform, outputType);
        const zone = options.timeZone;
        const existingCivil = ezCivilWithKey(ezZonedDateTimeParts(new Date(existingMs), zone));
        const standardsCovered = ezDayStandardsCovered(
          existingCivil,
          now.getTime() + EZ_SUGGEST_LEAD_MS,
          occ,
          zone,
        );
        const reusable = existingMs > now.getTime()
          && !ezIsBlackoutLocalTime(existingMs, zone)
          && !ezScheduleConflicts(existingMs, occ)
          && (ezIsPriorityLocalTime(existingMs, zone) || standardsCovered);
        if (reusable) {
          stamps.set(key, iso);
          (reserved[lane] ||= []).push(existingMs);
          continue;
        }
      }
      const occ = laneTimes(platform, outputType);
      const iso = ezPickBalancedSuggestedIso(EZ_PRIORITY_SCHEDULE_WINDOWS, now, {
        occupiedMs: occ,
        platformOccupiedMs: occ,
        timeZone: options.timeZone,
        horizonDays,
      });
      stamps.set(key, iso);
      if (iso) (reserved[lane] ||= []).push(Date.parse(iso));
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
    const vibeCut = ezIsVibeCutInput(answers.inputKind);
    const clipInput = ezIsClipInput(answers.inputKind) || vibeCut;
    if (vibeCut) {
      const aspect = String(answers.sourceAspect || "").trim().toLowerCase();
      if (aspect === "horizontal"
        || ezIsHorizontalSource(answers.sourceVideoWidth, answers.sourceVideoHeight)) {
        return ezPlanFromSourceAspect({
          width: Number(answers.sourceVideoWidth) || 1920,
          height: Number(answers.sourceVideoHeight) || 1080,
          inputKind: EZ_INPUTS.VIBE_CUT,
        });
      }
      const overrides = ezVideoOverrides({ finishedVideo: false, clipInput: true });
      const filtered = selected
        ? Object.fromEntries(Object.entries(overrides).filter(([platform]) => selected.includes(platform)))
        : overrides;
      const plan = ezPlanFromOverrides(count, filtered, ezVideoStoryExtras(selected || Object.keys(filtered)));
      plan.master_content_type = "Vertical Short Video";
      plan.source_aspect = "vertical";
      return plan;
    }
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
    ezIsVibeCutInput,
    ezIsNativeStillOutput,
    ezPhotoCountKind,
    ezVideoOverrides,
    ezSlidesOverrides,
    ezDefaultPassMap,
    ezPackageFromContentType,
    ezMasterContentType,
    ezPlanFromPhotoCount,
    ezIsHorizontalSource,
    ezPlanFromSourceAspect,
    ezMergeAspectPlan,
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
    ezNextOpenScheduleIso,
    ezIsBlackoutLocalTime,
    ezIsPriorityLocalTime,
    ezNormalizeTimeZone,
    ezNormalizeHorizonDays,
    ezScheduleLaneKey,
    EZ_SUGGEST_HORIZON_DAYS,
    EZ_PRIORITY_SCHEDULE_WINDOWS,
  };
})();
