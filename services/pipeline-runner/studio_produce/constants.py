"""Studio production job contract."""

from __future__ import annotations

JOB_FIELD = "Studio_Production_Job_JSON"
JOB_SCHEMA = "studio.production-job.1"
STALE_AFTER_SECONDS = 180

STEPS = (
    "themes",
    "audio",
    "images",
    "ingest",
    "queue_crops",
    "crops",
    "stamp",
    "render",
    "done",
)

TERMINAL_STEPS = frozenset({"done", "blocked", "escalated"})

STEP_LABELS = {
    "themes": "Writing slide themes",
    "audio": "Generating voiceover and cover",
    "images": "Generating AI images",
    "ingest": "Ingesting source photos",
    "queue_crops": "Queuing platform crops",
    "crops": "Cropping platform variants",
    "stamp": "Packaging outputs",
    "render": "Rendering previews",
    "done": "Ready for Review",
    "blocked": "Blocked",
    "escalated": "Escalated — needs investigation",
}

STEP_PERCENT = {
    "themes": 12,
    "audio": 20,
    "images": 28,
    "ingest": 36,
    "queue_crops": 42,
    "crops": 50,
    "stamp": 58,
    "render": 62,
    "done": 65,
    "blocked": 5,
    "escalated": 5,
}

# Cap for Worker/watchdog auto-resumes before catastrophic escalate + notify.
HEAL_MAX_RESUMES = 5
HEAL_SCHEMA = "studio.produce-heal.1"

NATIVE_OUTPUT_TYPES = frozenset({
    "Single Image",
    "Single Photo",
    "Feed Post",
    "Multi-Image Post",
    "Carousel",
    "Photo Set",
})
STORY_OUTPUT_TYPES = frozenset({"Story"})
REEL_OUTPUT_TYPES = frozenset({
    "Reel",
    "Slideshow Reel",
    "Video Draft",
    "Short",
    "Standard Video",
    "Vertical Short Video",
    "Longform Video",
    "Slideshow Video",
})
RATIO_SPECS = {
    "4:5": {"width": 1080, "height": 1350},
    "9:16": {"width": 1080, "height": 1920},
    "1:1": {"width": 1080, "height": 1080},
    "16:9": {"width": 1920, "height": 1080},
}
VARIANT_RECIPE = "fill-crop-v2"

CONTENT_ITEMS_TABLE = "tblwzN9AXWvmKVKPs"
PLATFORM_OUTPUTS_TABLE = "tblrlPeboBthkplH0"
PRODUCTION_REQUESTS_TABLE = "tbl75nxNi6PMUjBQE"
CAROUSEL_SLIDES_TABLE = "tblcnQDBvUngpjDED"
MEDIA_TRANSFER_QUEUE_TABLE = "tblBZLXPd1p2NRWRK"
PIPELINE_SETTINGS_TABLE = "tblpHPWeEkyJaF7ql"
