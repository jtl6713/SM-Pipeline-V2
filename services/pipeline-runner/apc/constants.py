from publish.constants import (
    AP0C_SCENARIO_ID,
    AP1C_SCENARIO_ID,
    AP2C_SCENARIO_ID,
    AP3C_SCENARIO_ID,
    AP3P_SCENARIO_ID,
    AP4C_SCENARIO_ID,
    AP4R_SCENARIO_ID,
    AP5C_SCENARIO_ID,
)

MAKE_AP0C_ID = AP0C_SCENARIO_ID
MAKE_AP1C_ID = AP1C_SCENARIO_ID
MAKE_AP2C_ID = AP2C_SCENARIO_ID
MAKE_AP3C_ID = AP3C_SCENARIO_ID
MAKE_AP3P_ID = AP3P_SCENARIO_ID
MAKE_AP4C_ID = AP4C_SCENARIO_ID
MAKE_AP4R_ID = AP4R_SCENARIO_ID
MAKE_AP5C_ID = AP5C_SCENARIO_ID

MAKE_AP0C_NAME = "AP0C - Prepare Carousel Public Assets v1.8.5 - Lettered Public URL Download"
MAKE_AP1C_NAME = "AP1C - Create Instagram Carousel Child Containers v1.0.1 - Single AP2C Handoff"
MAKE_AP2C_NAME = "AP2C - Poll Instagram Carousel Child Containers v1.0.2 - Airtable Verified Counts"
MAKE_AP3C_NAME = "AP3C - Create Instagram Carousel Parent Container v1.0.1 - Safe Caption and Single Parent"
MAKE_AP3P_NAME = "AP3P - Poll Instagram Carousel Parent Container v1.0.2 - Safe Parent Poll Mapping"
MAKE_AP4C_NAME = "AP4C - Publish Instagram Carousel Parent v1.0"
MAKE_AP4R_NAME = "AP4R - Reconcile Ambiguous Instagram Carousel Publish v1.0.1"
MAKE_AP5C_NAME = "AP5C - Finalize Instagram Carousel Publish v1.0.1"

DEFAULT_GRAPH_VERSION = "v25.0"
DEFAULT_POLL_DELAY_MINUTES = 2
DEFAULT_MAX_POLL_ATTEMPTS = 20
DEFAULT_RECONCILE_MAX_ATTEMPTS = 5
DEFAULT_R2_PREFIX = "publish/instagram-carousel"
PUBLIC_MEDIA_BASE = "https://media.chicagoshining.com"
MAX_SLIDES = 20

RETRY_MINUTES = 2

STAGE_AP0C = "AP0C"
STAGE_AP1C = "AP1C"
STAGE_AP2C = "AP2C"
STAGE_AP3C = "AP3C"
STAGE_AP3P = "AP3P"
STAGE_AP4C = "AP4C"
STAGE_AP4R = "AP4R"
STAGE_AP5C = "AP5C"

STATUS_READY_FOR_ASSET_PREP = "Ready for Asset Prep"
STATUS_PREPARING_ASSETS = "Preparing Assets"
STATUS_ASSETS_READY = "Assets Ready"
STATUS_CREATING_CHILDREN = "Creating Children"
STATUS_CHILDREN_PROCESSING = "Children Processing"
STATUS_CHILDREN_READY = "Children Ready"
STATUS_CREATING_PARENT = "Creating Parent"
STATUS_PARENT_PROCESSING = "Parent Processing"
STATUS_PARENT_READY = "Parent Ready"
STATUS_PUBLISHING = "Publishing"
STATUS_RETRY = "Retry Pending"
STATUS_PUBLISHED = "Published"
STATUS_MANUAL_FALLBACK = "Manual Fallback"

PARENT_NOT_CREATED = "Not Created"
PARENT_IN_PROGRESS = "IN_PROGRESS"
PARENT_FINISHED = "FINISHED"
PARENT_ERROR = "ERROR"
PARENT_EXPIRED = "EXPIRED"

CHILD_NOT_CREATED = "Not Created"
CHILD_CREATING = "Creating"
CHILD_IN_PROGRESS = "IN_PROGRESS"
CHILD_FINISHED = "FINISHED"
CHILD_ERROR = "ERROR"
CHILD_EXPIRED = "EXPIRED"
CHILD_RETRY = "Retry Pending"

ASSET_PREPARING = "Preparing"
ASSET_READY = "Ready"
ASSET_FAILED = "Failed"

ERROR_AP0C = "AP0C Asset Preparation"
ERROR_AP1C = "AP1C Child Creation"
ERROR_AP2C = "AP2C Child Polling"
ERROR_AP2C_VERIFY = "AP2C Child Verification"
ERROR_AP3C = "AP3C Parent Creation"
ERROR_AP3P = "AP3P Parent Polling"
ERROR_AP4C = "AP4C Parent Publishing"
ERROR_AP5C = "AP5C Finalization"

PUBLISH_STATUS_READY = "Ready to Publish"
PUBLISH_STATUS_FAILED = "Failed"
PUBLISH_STATUS_PUBLISHED = "Published"
OUTPUT_STATUS_PUBLISHED = "Published"
REPLACE_MANUAL = "Manual Cleanup Required"
