(() => {
  const EZ_ORIGIN = "ez-button";
  const EZ_ORIGIN_WIZARD = "ez-wizard";
  const EZ_INPUTS = Object.freeze({
    SINGLE_PHOTO: "single-photo",
    MULTIPLE_PHOTOS: "multiple-photos",
    VIDEO_CLIPS: "video-clips",
    FINISHED_VIDEO: "finished-video",
    SINGLE_AI: "single-ai",
    MULTIPLE_AI: "multiple-ai",
    MIXED: "mixed",
  });
  const EZ_CAPTION_MODES = Object.freeze(["manual", "none", "ai"]);
  const EZ_PHASE1_INPUTS = Object.freeze([EZ_INPUTS.SINGLE_PHOTO, EZ_INPUTS.MULTIPLE_PHOTOS]);
  const EZ_DISABLED_INPUTS = Object.freeze([EZ_INPUTS.VIDEO_CLIPS, EZ_INPUTS.FINISHED_VIDEO]);
  const EZ_PHOTO_PASSES = Object.freeze({
    single: Object.freeze({
      Instagram: "Single Image",
      Facebook: "Single Image",
      TikTok: "Video Draft",
    }),
    multiple: Object.freeze({
      Instagram: "Reel",
      Facebook: "Slideshow Reel",
      TikTok: "Video Draft",
      YouTube: "Short",
    }),
  });
  const EZ_OUTPUT_OPTIONS = Object.freeze([
    Object.freeze({ platform: "Instagram", types: Object.freeze(["Reel", "Story", "Single Image", "Carousel"]) }),
    Object.freeze({ platform: "Facebook", types: Object.freeze(["Reel", "Story", "Single Image", "Multi-Image Post", "Slideshow Reel"]) }),
    Object.freeze({ platform: "TikTok", types: Object.freeze(["Video Draft", "Single Photo", "Multi-Photo"]) }),
    Object.freeze({ platform: "YouTube", types: Object.freeze(["Short", "Standard Video", "Slideshow Video"]) }),
  ]);

  function ezPhotoCountKind(count) {
    const n = Math.max(0, Number(count) || 0);
    return n <= 1 ? EZ_INPUTS.SINGLE_PHOTO : EZ_INPUTS.MULTIPLE_PHOTOS;
  }

  function ezDefaultPassMap(photoCount) {
    const n = Math.max(0, Number(photoCount) || 0);
    return n <= 1 ? { ...EZ_PHOTO_PASSES.single } : { ...EZ_PHOTO_PASSES.multiple };
  }

  function ezMasterContentType(photoCount) {
    return (Math.max(0, Number(photoCount) || 0) <= 1) ? "Feed Post" : "Photo Set";
  }

  function ezPlanFromPhotoCount({ photoCount, platforms } = {}) {
    const count = Math.max(0, Number(photoCount) || 0);
    const defaults = ezDefaultPassMap(count);
    const requested = Array.isArray(platforms) && platforms.length
      ? [...new Set(platforms.map((value) => String(value || "").trim()).filter(Boolean))]
      : Object.keys(defaults);
    const items = [];
    for (const platform of requested) {
      const outputType = defaults[platform];
      if (!outputType) continue;
      items.push({ platform, output_type: outputType });
    }
    return {
      photo_count: count,
      photo_count_kind: ezPhotoCountKind(count),
      master_content_type: ezMasterContentType(count),
      youtube_enabled: Boolean(defaults.YouTube),
      platforms: items.map((item) => item.platform),
      overrides: Object.fromEntries(items.map((item) => [item.platform, item.output_type])),
      items,
    };
  }

  function ezCanonicalOutputType(platform, outputType) {
    return String(outputType || "").trim();
  }

  function ezCaptionFields(mode, { caption = "", captions = [] } = {}) {
    const normalized = String(mode || "ai").trim().toLowerCase();
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

  function ezOriginNotes({ inputKind, captionMode, origin, manualCount, aiCount } = {}) {
    const tag = String(origin || EZ_ORIGIN).trim() || EZ_ORIGIN;
    const input = String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO;
    const caption = String(captionMode || "ai").trim().toLowerCase() || "ai";
    const parts = [`origin=${tag}`, `ez-input=${input}`, `ez-caption=${caption}`];
    const manual = Number(manualCount);
    const ai = Number(aiCount);
    if (Number.isFinite(manual) && manual > 0) parts.push(`ez-manual=${Math.round(manual)}`);
    if (Number.isFinite(ai) && ai > 0) parts.push(`ez-ai=${Math.round(ai)}`);
    return parts.join("; ");
  }

  function ezIdeaSummary({ inputKind } = {}) {
    return `Created from New content (origin=${EZ_ORIGIN}; ez-input=${String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO}).`;
  }

  function parseEzOriginNotes(value) {
    const text = String(value || "");
    const originMatch = /origin=(ez-wizard|ez-button)/i.exec(text);
    if (!originMatch) return null;
    const input = /ez-input=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    const caption = /ez-caption=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    const manual = Number(/ez-manual=(\d+)/i.exec(text)?.[1] || "");
    const ai = Number(/ez-ai=(\d+)/i.exec(text)?.[1] || "");
    return {
      origin: originMatch[1].toLowerCase(),
      inputKind: input,
      captionMode: caption,
      manualCount: Number.isFinite(manual) && manual > 0 ? manual : null,
      aiCount: Number.isFinite(ai) && ai > 0 ? ai : null,
    };
  }

  function ezIntakeKindFromWizard(inputKind) {
    const kind = String(inputKind || "").trim();
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS || kind === EZ_INPUTS.MULTIPLE_AI || kind === EZ_INPUTS.MIXED) {
      return EZ_INPUTS.MULTIPLE_PHOTOS;
    }
    return EZ_INPUTS.SINGLE_PHOTO;
  }

  function ezImageModeFromWizard(inputKind) {
    const kind = String(inputKind || "").trim();
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.MULTIPLE_PHOTOS) return "Manual Upload";
    return "Make AI Generated";
  }

  function ezWizardPhotoCount(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    if (kind === EZ_INPUTS.SINGLE_PHOTO || kind === EZ_INPUTS.SINGLE_AI) return 1;
    if (kind === EZ_INPUTS.MIXED) {
      return Math.max(0, Number(answers.manualCount) || 0) + Math.max(0, Number(answers.aiCount) || 0);
    }
    const n = Math.max(0, Number(answers.photoCount) || 0);
    if (n) return n;
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS || kind === EZ_INPUTS.MULTIPLE_AI) return 4;
    return 1;
  }

  function ezWizardExpectedUploads(answers = {}) {
    const kind = String(answers.inputKind || "").trim();
    if (kind === EZ_INPUTS.SINGLE_AI || kind === EZ_INPUTS.MULTIPLE_AI) return 0;
    if (kind === EZ_INPUTS.SINGLE_PHOTO) return 1;
    if (kind === EZ_INPUTS.MIXED) return Math.max(1, Number(answers.manualCount) || 1);
    if (kind === EZ_INPUTS.MULTIPLE_PHOTOS) return Math.max(2, Number(answers.photoCount) || 2);
    return null;
  }

  function ezWizardRequiresUploads(answers = {}) {
    return ezWizardExpectedUploads(answers) > 0;
  }

  function ezStillsOverrides(photoCount) {
    if (Math.max(0, Number(photoCount) || 0) <= 1) {
      return { Instagram: "Single Image", Facebook: "Single Image", TikTok: "Single Photo" };
    }
    return { Instagram: "Carousel", Facebook: "Multi-Image Post", TikTok: "Multi-Photo" };
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

  function ezWizardPackages(photoCount) {
    const count = Math.max(1, Number(photoCount) || 1);
    const defaults = ezPlanFromPhotoCount({ photoCount: count });
    const videoOverrides = {
      Instagram: "Reel",
      Facebook: "Slideshow Reel",
      TikTok: "Video Draft",
      YouTube: "Short",
    };
    const stills = ezStillsOverrides(count);
    return [
      {
        id: "default",
        label: "Default for this input",
        hint: defaults.items.map((item) => `${item.platform} ${item.output_type}`).join(" · "),
      },
      {
        id: "video",
        label: "Video everywhere",
        hint: "Reel, Slideshow Reel, TikTok draft, YouTube Short",
      },
      {
        id: "stills",
        label: count <= 1 ? "Stills" : "Stills / carousel",
        hint: Object.entries(stills).map(([platform, type]) => `${platform} ${type}`).join(" · "),
      },
      {
        id: "stories",
        label: "Stories plus feed",
        hint: "Default package plus Instagram and Facebook Stories",
      },
      { id: "platforms", label: "Choose platforms", hint: "Instagram, Facebook, TikTok, YouTube" },
      { id: "custom", label: "Custom formats", hint: "Pick each platform format" },
    ];
  }

  function ezWizardResolvePackage(answers = {}) {
    const count = ezWizardPhotoCount(answers);
    const packageId = String(answers.packageId || "default").trim() || "default";
    if (packageId === "custom" && Array.isArray(answers.customItems) && answers.customItems.length) {
      const overrides = {};
      const extras = [];
      const seen = new Set();
      for (const item of answers.customItems) {
        const platform = String(item?.platform || "").trim();
        const outputType = ezCanonicalOutputType(platform, item?.output_type);
        if (!platform || !outputType || outputType === "Story" && platform === "TikTok") continue;
        if (!overrides[platform] && outputType !== "Story") overrides[platform] = outputType;
        else extras.push(`${platform}::${outputType}`);
        seen.add(platform);
      }
      return ezPlanFromOverrides(count, overrides, extras);
    }
    const selected = Array.isArray(answers.platforms) && answers.platforms.length
      ? answers.platforms
      : null;
    if (packageId === "video") {
      const overrides = { Instagram: "Reel", Facebook: "Slideshow Reel", TikTok: "Video Draft", YouTube: "Short" };
      const filtered = selected
        ? Object.fromEntries(Object.entries(overrides).filter(([platform]) => selected.includes(platform)))
        : overrides;
      return ezPlanFromOverrides(count, filtered);
    }
    if (packageId === "stills") {
      const overrides = ezStillsOverrides(count);
      const filtered = selected
        ? Object.fromEntries(Object.entries(overrides).filter(([platform]) => selected.includes(platform)))
        : overrides;
      return ezPlanFromOverrides(count, filtered);
    }
    const planned = ezPlanFromPhotoCount({ photoCount: count, platforms: selected || undefined });
    const extras = packageId === "stories" ? ["Instagram::Story", "Facebook::Story"] : [];
    return { ...planned, extras };
  }

  window.ChicagoShiningEzPlan = {
    EZ_ORIGIN,
    EZ_ORIGIN_WIZARD,
    EZ_INPUTS,
    EZ_CAPTION_MODES,
    EZ_PHASE1_INPUTS,
    EZ_DISABLED_INPUTS,
    EZ_PHOTO_PASSES,
    EZ_OUTPUT_OPTIONS,
    ezPhotoCountKind,
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
    ezWizardExpectedUploads,
    ezWizardRequiresUploads,
    ezWizardPackages,
    ezWizardResolvePackage,
  };
})();
