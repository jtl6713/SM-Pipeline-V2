from publish.constants import FBS1_SCENARIO_ID, FBS2_SCENARIO_ID

MAKE_SCENARIO_ID = FBS1_SCENARIO_ID
MAKE_POLL_SCENARIO_ID = FBS2_SCENARIO_ID
MAKE_SCENARIO_NAME = "FBS1 - Start Facebook Slideshow Render v1.0.7 - Voiceover Payload"
MAKE_POLL_SCENARIO_NAME = "FBS2 - Poll or Stage Facebook Reel MP4 v1.1 - R5 Final MP4 Aware"

PUBLISH_LOCKED_BY = "FBS1"
POLL_LOCKED_BY = "FBS2"
STAGE_LOCKED_BY = "FBS2-DIRECT"
SLIDES_TABLE_VIEW = "FB0 — Ready 4x5 Facebook Slides"
COMPOSITION_ID = "FacebookImageSlideshow9x16"
DEFAULT_BRAND = "ChicagoShining"
DEFAULT_R2_PREFIX = "publish/facebook-slideshow"
DEFAULT_PUBLIC_BASE = "https://media.chicagoshining.com"
DEFAULT_MUSIC_VOLUME = 0.042
CLIP_DURATION_FRAMES = 90
END_HOLD_FRAMES = 30
TRANSITION_FRAMES = 12
TITLE_DURATION_FRACTION = 0.2
FPS = 30
WIDTH = 1080
HEIGHT = 1920
MAX_SLIDES = 25

STATUS_READY_TO_RENDER = "Ready to Render"
STATUS_STARTING = "Starting Render"
STATUS_RENDERING = "Rendering"
STATUS_STAGING = "Staging Final MP4"
STATUS_VIDEO_READY = "Video Ready"
STATUS_RETRY_PENDING = "Retry Pending"
PUBLISH_STATUS_PUBLISHING = "Publishing"
PUBLISH_STATUS_READY = "Ready to Publish"
PUBLISH_STATUS_FAILED = "Failed"
FB_PUBLISH_RENDERING = "Rendering Slideshow"
FB_PUBLISH_READY = "Slideshow Video Ready"
FB_PUBLISH_RETRY = "Retry Pending"
RETRY_MINUTES = 5
POLL_RETRY_MINUTES = 1
COMPLETE_STATUSES = frozenset({"completed", "complete", "done", "rendered"})
FAILED_STATUSES = frozenset({"failed", "error", "errored"})
PROCESSING_STATUSES = frozenset({"rendering", "processing", "queued", "pending", "started"})
