MAKE_SCENARIO_ID = 5531703
MAKE_SCENARIO_NAME = (
    "P3 - Platform Output Generation v4.9.1 - Formula-Ready Single Parent Studio Outputs + Legacy"
)
WEBHOOK_URL = "https://hook.us2.make.com/66wq22tanm43b7w9b4m8beukmv7z8a65"
LEGACY_CONTENT_VIEW_ID = "viwwnVJVPqfy7iYJK"

NATIVE_PHOTO_OUTPUT_TYPES = frozenset({"Multi-Photo", "Carousel", "Multi-Image Post"})
ELIGIBLE_PARENT_STATUSES = frozenset(
    {"Thumbnail Ready", "Ready for Thumbnail", "Script Generated"}
)

REMOTION_HANDOFF_MARKER = "STUDIO_P3_REMOTION_HANDOFF_V4"
STUDIO_ENRICHMENT_NOTE = (
    "P3 v4.8 STUDIO_P3_REMOTION_HANDOFF_V4: Multi-Photo / Instagram Carousel / "
    "Facebook Multi-Image Post stay Ready for Review; Instagram and Facebook Story "
    "plus other Remotion Studio outputs stay In Production with assets Selected so "
    "R3/R4 can render the 15-second Story teaser."
)

PARENT_REVIEW_STATUS = "Ready for Review"
PARENT_RENDER_STATUS = "Not Ready"
PARENT_CONTENT_STATUS_MATCHED = "Assets Matched"
PARENT_CONTENT_STATUS_NEEDS_ASSETS = "Needs Assets"

DEFAULT_VOICEOVER_TAIL_SECONDS = 2
CONTENT_TYPE_FORMATS = {
    "Reel": "Vertical Short Video",
    "Longform": "Longform Video",
    "Static Image": "Feed Post",
}
