(() => {
  const EZ_ORIGIN = "ez-button";
  const EZ_INPUTS = Object.freeze({
    SINGLE_PHOTO: "single-photo",
    MULTIPLE_PHOTOS: "multiple-photos",
    VIDEO_CLIPS: "video-clips",
    FINISHED_VIDEO: "finished-video",
  });
  const EZ_CAPTION_MODES = Object.freeze(["manual", "none", "ai"]);
  const EZ_PHASE1_INPUTS = Object.freeze([EZ_INPUTS.SINGLE_PHOTO, EZ_INPUTS.MULTIPLE_PHOTOS]);
  const EZ_DISABLED_INPUTS = Object.freeze([EZ_INPUTS.VIDEO_CLIPS, EZ_INPUTS.FINISHED_VIDEO]);
  const EZ_PHOTO_PASSES = Object.freeze({
    single: Object.freeze({
      Instagram: "Single Image",
      Facebook: "Single Image",
      TikTok: "Multi-Photo",
    }),
    multiple: Object.freeze({
      Instagram: "Carousel",
      Facebook: "Multi-Image Post",
      TikTok: "Multi-Photo",
      YouTube: "Short",
    }),
  });

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

  function ezCaptionFields(mode, { caption = "", captions = [] } = {}) {
    const normalized = String(mode || "ai").trim().toLowerCase();
    if (normalized === "manual") {
      const parts = Array.isArray(captions) ? captions.map((value) => String(value || "").trim()).filter(Boolean) : [];
      const text = String(caption || "").trim() || parts.join("\n\n");
      return {
        mode: "manual",
        overlay_titles: true,
        title_mode: "AI decides",
        requested_title: "",
        caption_mode: "Force exact",
        requested_caption: text,
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

  function ezOriginNotes({ inputKind, captionMode } = {}) {
    const input = String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO;
    const caption = String(captionMode || "ai").trim().toLowerCase() || "ai";
    return `origin=${EZ_ORIGIN}; ez-input=${input}; ez-caption=${caption}`;
  }

  function ezIdeaSummary({ inputKind } = {}) {
    return `Created from New content (origin=${EZ_ORIGIN}; ez-input=${String(inputKind || EZ_INPUTS.SINGLE_PHOTO).trim() || EZ_INPUTS.SINGLE_PHOTO}).`;
  }

  function parseEzOriginNotes(value) {
    const text = String(value || "");
    if (!text.includes(`origin=${EZ_ORIGIN}`)) return null;
    const input = /ez-input=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    const caption = /ez-caption=([a-z0-9-]+)/i.exec(text)?.[1] || "";
    return { origin: EZ_ORIGIN, inputKind: input, captionMode: caption };
  }

  window.ChicagoShiningEzPlan = {
    EZ_ORIGIN,
    EZ_INPUTS,
    EZ_CAPTION_MODES,
    EZ_PHASE1_INPUTS,
    EZ_DISABLED_INPUTS,
    EZ_PHOTO_PASSES,
    ezPhotoCountKind,
    ezDefaultPassMap,
    ezMasterContentType,
    ezPlanFromPhotoCount,
    ezCaptionFields,
    ezOriginNotes,
    ezIdeaSummary,
    parseEzOriginNotes,
  };
})();
