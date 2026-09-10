"""Item 4 / SMV1 constants aligned with apps/studio-api/worker.js."""

from __future__ import annotations

VARIANT_RECIPE_VERSION = "fill-crop-v2"
MEDIA_PUBLIC_BASE = "https://media.chicagoshining.com"
STUDIO_MASTER_PREFIX = "studio/master-assets/"
STALE_PROCESSING_MS = 90_000

RATIO_SPECS = {
    "4:5": {"width": 1080, "height": 1350},
    "9:16": {"width": 1080, "height": 1920},
    "1:1": {"width": 1080, "height": 1080},
    "16:9": {"width": 1920, "height": 1080},
}

BROWSER_MASTER_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "avif", "bmp"}

SMV1_BASE_ELIGIBILITY_FORMULA = (
    'OR('
    'AND({Asset_Kind}="Master Original",{Transfer_Status}="Pending"),'
    'AND({Asset_Kind}="Platform Variant",OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded")),'
    'AND(OR({Asset_Kind}="Master Original",{Asset_Kind}="Platform Variant"),'
    '{Transfer_Status}="Ready",{Preview_Status}="Pending")'
    ')'
)

# Unfinished crops only. Exclude Ready+Preview Pending and Master Original so
# neither preview uploads nor master copies can fill the Airtable select window
# and starve Platform Variant Pending rows (the Frames "17/21" stall).
SMV1_PENDING_CROP_FORMULA = (
    'AND({Asset_Kind}="Platform Variant",'
    'OR({Transfer_Status}="Pending",{Transfer_Status}="Drive Uploaded"))'
)

SMV1_PRODUCTION_FORMULA = f'AND({{Test_Run_ID}}=BLANK(),{SMV1_BASE_ELIGIBILITY_FORMULA})'

OUTSTANDING_TRANSFER_STATUSES = {"Pending", "Drive Uploaded", "Processing"}
