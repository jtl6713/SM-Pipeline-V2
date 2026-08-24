from publish.constants import (
    FB0_SCENARIO_ID,
    FB1_SCENARIO_ID,
    FB2_SCENARIO_ID,
    FB2R_SCENARIO_ID,
    FB3_SCENARIO_ID,
)

MAKE_FB0_ID = FB0_SCENARIO_ID
MAKE_FB1_ID = FB1_SCENARIO_ID
MAKE_FB2_ID = FB2_SCENARIO_ID
MAKE_FB2R_ID = FB2R_SCENARIO_ID
MAKE_FB3_ID = FB3_SCENARIO_ID

MAKE_FB0_NAME = "FB0 - Prepare Facebook 4x5 Asset Set v1.3 - View-Decoupled Shared Asset Search"
MAKE_FB1_NAME = "FB1 - Create Facebook Unpublished Photo Objects v1.5 - Temporary Media + View-Decoupled Search"
MAKE_FB2_NAME = "FB2 - Publish Facebook 4x5 Image Post v1.5 - Binary Response Field Mapping Fix"
MAKE_FB2R_NAME = "FB2R - Reconcile Ambiguous Facebook Page Publish v1.1 - Orchestrator-Owned Handoff"
MAKE_FB3_NAME = "FB3 - Finalize Facebook Page Post v1.0.2 - Use Graph Permalink URL"

DEFAULT_MAX_PHOTOS = 10
DEFAULT_IMAGE_STAGE_MAX_RETRIES = 3
DEFAULT_UNPUBLISHED_RECREATE_HOURS = 20
DEFAULT_RECONCILE_MAX_ATTEMPTS = 5
DEFAULT_GRAPH_VERSION = "v25.0"

RETRY_MINUTES = 5
RECONCILE_RETRY_MINUTES = 2

STAGE_FB0 = "FB0"
STAGE_FB1 = "FB1"
STAGE_FB2 = "FB2"
STAGE_FB2R = "FB2R"
STAGE_FB3 = "FB3"

STATUS_READY_FOR_ASSETS = "Ready for Assets"
STATUS_PREPARING = "Preparing Assets"
STATUS_READY_FOR_PHOTO = "Ready for Photo Media"
STATUS_CREATING_PHOTO = "Creating Photo Media"
STATUS_PHOTO_READY = "Photo Media Ready"
STATUS_PUBLISHING = "Publishing"
STATUS_RECONCILE = "Reconcile Pending"
STATUS_PENDING_FINALIZE = "Published Pending Finalize"
STATUS_PREPARING_SLIDESHOW = "Preparing Slideshow"
STATUS_RETRY = "Retry Pending"
STATUS_PUBLISHED = "Published"
STATUS_MANUAL_FALLBACK = "Manual Fallback Required"

SLIDESHOW_STATUS_NOT_REQUIRED = "Not Required"
SLIDESHOW_STATUS_READY_TO_RENDER = "Ready to Render"
SLIDESHOW_STATUS_RETRY = "Retry Pending"

MODE_SINGLE = "Single Photo"
MODE_SLIDESHOW = "Slideshow Reel"

PUBLISH_STATUS_READY = "Ready to Publish"
PUBLISH_STATUS_PUBLISHING = "Publishing"
PUBLISH_STATUS_FAILED = "Failed"
PUBLISH_STATUS_PUBLISHED = "Published"
OUTPUT_STATUS_PUBLISHED = "Published"

PHOTO_STATUS_CREATING = "Creating"
PHOTO_STATUS_READY = "Ready"
PHOTO_STATUS_RETRY = "Retry Pending"

MANUAL_NOT_REQUIRED = "Not Required"
