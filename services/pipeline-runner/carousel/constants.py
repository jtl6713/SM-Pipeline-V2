CAROUSEL_SLIDES_TABLE_NAME = "Carousel Slides"

C2_DRIVE_FOLDER_ID = "1d5Bs3n4wZVgF__YeAfisgw9FVeGa0Uwu"
C5_DRIVE_FOLDER_ID = "19YXOymjeDL8XYFQMg5ZYns1FdCM55_FJ"
C6_DRIVE_FOLDER_ID = "1d5Bs3n4wZVgF__YeAfisgw9FVeGa0Uwu"

OPENAI_IMAGE_MODEL = "gpt-image-1.5"
OPENAI_IMAGE_QUALITY = "high"

DEFAULT_C3_EMAIL_TO = "chicagoshining@gmail.com"
DEFAULT_WATERMARK_SERVICE_URL = "https://watermark.chicagoshining.com"

SETTING_C3_WEBHOOK = "CAR_CHAIN_C3_WEBHOOK_URL"
SETTING_C4_WEBHOOK = "CAR_CHAIN_C4_WEBHOOK_URL"
SETTING_C5_WEBHOOK = "CAR_CHAIN_C5_WEBHOOK_URL"
SETTING_C6_WEBHOOK = "CAR_CHAIN_C6_WEBHOOK_URL"
SETTING_C7_WEBHOOK = "CAR_CHAIN_C7_WEBHOOK_URL"
SETTING_C8_WEBHOOK = "CAR_CHAIN_C8_WEBHOOK_URL"
SETTING_C9_WEBHOOK = "CAR_CHAIN_C9_WEBHOOK_URL"
SETTING_C3B_REVIEW_URL = "Carousel_Review_Webhook_URL"
SETTING_WATERMARK_URL = "Carousel_Watermark_Service_URL"

C8_EXISTING_OUTPUTS_VIEW = "C8 - Existing Carousel Outputs"
C9_READY_OUTPUT_VIEW = "C9 - Ready for Carousel Publish Package"
C9_FINAL_SLIDES_VIEW = "C9 - Final Slides Linked to Publish Package"
C6_WATERMARK_ASSET_VIEW = "C6 - Active Small Branding Watermark"
C4_DECISIONS_VIEW = "C4 - Review Decisions Ready"

IMAGE_PROMPT_SUFFIX = """

STRICT OUTPUT RULES:
- Generate a clean photo-style image only.
- Do not add captions, labels, titles, borders, logos, or watermarks.
- Official ChicagoShining watermarking is handled downstream.
- Target platform: {platform}
- Target aspect ratio: {ratio}
- Keep important subjects safely centered for later exact crop/resizing."""

REPLACEMENT_PROMPT_SUFFIX = """

Reviewer notes for replacement:
{notes}

Original slide prompt:
{original}

STRICT OUTPUT RULES:
- Generate a replacement clean photo-style image only.
- Do not add captions, labels, titles, borders, logos, or watermarks.
- Official ChicagoShining watermarking is handled downstream.
- Target platform: {platform}
- Target aspect ratio: {ratio}
- Keep important subjects safely centered for later exact crop/resizing."""

MAKE_IDS = {
    "sai1": 6023816,
    "c2": 5582071,
    "c3": 5587853,
    "c3b": 5592384,
    "c4": 5587860,
    "c5": 5582074,
    "c6": 5589218,
    "c7": 5589819,
    "c8": 5589822,
    "c9": 5589932,
}

MAKE_HOOK_URLS = {}
