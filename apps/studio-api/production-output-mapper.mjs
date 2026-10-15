export function mapProductionRequestOutput(record, master = null, { f, item4IsCompanionOutputType }) {
  const links = (name) => Array.isArray(f(record, name)) ? f(record, name) : [];
  const choice = (field, masterValue) => {
    const value = String(f(record, field) || "Inherit").trim() || "Inherit";
    return value === "Inherit" ? masterValue : value;
  };
  const number = (field, masterValue) => {
    const value = f(record, field);
    return value === null || value === undefined || value === "" ? masterValue : value;
  };
  const text = (field, masterValue) => {
    const value = String(f(record, field) || "").trim();
    return value || masterValue || "";
  };

  const selectedMusicLinks = links("Selected_Music_Asset_Override");
  const masterMusicLinks = master && Array.isArray(f(master, "Selected_Music_Asset"))
    ? f(master, "Selected_Music_Asset")
    : [];

  const mapped = {
    id: record.id,
    production_request_output_id: f(record, "Production_Request_Output_ID"),
    production_request_links: links("Production_Request"),
    organization_links: links("Organization"),
    brand_links: links("Brand"),
    created_by_links: links("Created_By"),
    platform: f(record, "Platform"),
    output_type: f(record, "Output_Type"),
    status: f(record, "Output_Status"),
    output_order: f(record, "Output_Order"),
    enabled: Boolean(f(record, "Enabled")),
    active: Boolean(f(record, "Active")),
    voiceover_mode_override: f(record, "Voiceover_Mode_Override") || "Inherit",
    background_music_mode_override: f(record, "Background_Music_Mode_Override") || "Inherit",
    thumbnail_mode_override: f(record, "Thumbnail_Mode_Override") || "Inherit",
    video_duration_seconds_override: f(record, "Video_Duration_Seconds_Override"),
    video_clip_count_mode_override: f(record, "Video_Clip_Count_Mode_Override") || "Inherit",
    video_clip_count_exact_override: f(record, "Video_Clip_Count_Exact_Override"),
    video_clip_count_min_override: f(record, "Video_Clip_Count_Min_Override"),
    video_clip_count_max_override: f(record, "Video_Clip_Count_Max_Override"),
    carousel_slide_count_mode_override: f(record, "Carousel_Slide_Count_Mode_Override") || "Inherit",
    carousel_slide_count_exact_override: f(record, "Carousel_Slide_Count_Exact_Override"),
    carousel_slide_count_min_override: f(record, "Carousel_Slide_Count_Min_Override"),
    carousel_slide_count_max_override: f(record, "Carousel_Slide_Count_Max_Override"),
    carousel_image_mode_override: f(record, "Carousel_Image_Mode_Override") || "Inherit",
    voiceover_tail_seconds_override: f(record, "Voiceover_Tail_Seconds_Override"),
    selected_music_asset_override_links: selectedMusicLinks,
    title_mode_override: f(record, "Title_Mode_Override") || "Inherit",
    requested_title_override: f(record, "Requested_Title_Override"),
    caption_mode_override: f(record, "Caption_Mode_Override") || "Inherit",
    requested_caption_override: f(record, "Requested_Caption_Override"),
    script_mode_override: f(record, "Script_Mode_Override") || "Inherit",
    requested_script_override: f(record, "Requested_Script_Override"),
    output_notes: f(record, "Output_Notes"),
    publish_mode: f(record, "Publish_Mode") || "Inherit",
    scheduled_at: f(record, "Scheduled_At"),
    created_at: f(record, "Created_At"),
    updated_at: f(record, "Updated_At"),
    platform_output_links: links("Platform_Output"),
  };

  if (master) {
    mapped.effective = {
      voiceover_mode: choice("Voiceover_Mode_Override", f(master, "Voiceover_Mode")),
      background_music_mode: choice("Background_Music_Mode_Override", f(master, "Background_Music_Mode")),
      thumbnail_mode: choice("Thumbnail_Mode_Override", f(master, "Thumbnail_Mode")),
      video_duration_seconds: number(
        "Video_Duration_Seconds_Override",
        item4IsCompanionOutputType(f(record, "Output_Type"))
          ? ITEM4_STORY_TEASER_SECONDS
          : f(master, "Video_Duration_Seconds")
      ),
      video_clip_count_mode: choice("Video_Clip_Count_Mode_Override", f(master, "Video_Clip_Count_Mode")),
      video_clip_count_exact: number("Video_Clip_Count_Exact_Override", f(master, "Video_Clip_Count_Exact")),
      video_clip_count_min: number("Video_Clip_Count_Min_Override", f(master, "Video_Clip_Count_Min")),
      video_clip_count_max: number("Video_Clip_Count_Max_Override", f(master, "Video_Clip_Count_Max")),
      carousel_slide_count_mode: choice("Carousel_Slide_Count_Mode_Override", f(master, "Carousel_Slide_Count_Mode")),
      carousel_slide_count_exact: number("Carousel_Slide_Count_Exact_Override", f(master, "Carousel_Slide_Count_Exact")),
      carousel_slide_count_min: number("Carousel_Slide_Count_Min_Override", f(master, "Carousel_Slide_Count_Min")),
      carousel_slide_count_max: number("Carousel_Slide_Count_Max_Override", f(master, "Carousel_Slide_Count_Max")),
      carousel_image_mode: choice("Carousel_Image_Mode_Override", f(master, "Carousel_Image_Mode")),
      voiceover_tail_seconds: number("Voiceover_Tail_Seconds_Override", f(master, "Voiceover_Tail_Seconds")),
      selected_music_asset_links: selectedMusicLinks.length ? selectedMusicLinks : masterMusicLinks,
      title_mode: choice("Title_Mode_Override", f(master, "Title_Mode")),
      requested_title: text("Requested_Title_Override", f(master, "Requested_Title")),
      caption_mode: choice("Caption_Mode_Override", f(master, "Caption_Mode")),
      requested_caption: text("Requested_Caption_Override", f(master, "Requested_Caption")),
      script_mode: choice("Script_Mode_Override", f(master, "Script_Mode")),
      requested_script: text("Requested_Script_Override", f(master, "Requested_Script")),
      production_notes: [String(f(master, "Production_Notes") || "").trim(), String(f(record, "Output_Notes") || "").trim()]
        .filter(Boolean).join("\n\n"),
      publish_mode: String(f(record, "Publish_Mode") || "Inherit").trim() || "Inherit",
      scheduled_at: f(record, "Scheduled_At"),
    };
  }

  return mapped;
}
