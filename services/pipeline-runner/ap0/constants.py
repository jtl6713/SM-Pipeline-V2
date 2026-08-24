from publish.constants import AP0_SCENARIO_ID, AP0_WEBHOOK_URL

MAKE_SCENARIO_ID = AP0_SCENARIO_ID
MAKE_SCENARIO_NAME = (
    "AP0 - Prepare Public Publish Asset - Worker R2 Upload v5.2 - Exact Video Output Webhook"
)
MAKE_WEBHOOK_URL = AP0_WEBHOOK_URL

PUBLIC_MEDIA_BASE = "https://media.chicagoshining.com"
R2_KEY_PREFIX = "publish"
ASSET_HOST = "Cloudflare R2"
CONTENT_TYPE = "video/mp4"

# Make filter is an OR of (platform, Platform_Output_Type) pairs. TikTok is not included
# even though Studio Approve still pulses AP0 before TTD0.
ELIGIBLE_VIDEO_TYPES = frozenset(
    {
        ("instagram", "instagram reel"),
        ("instagram", "instagram story"),
        ("youtube", "youtube short"),
        ("facebook", "facebook reel"),
    }
)

REVIEW_STATUS = "Approved"
OUTPUT_STATUS = "Approved for Publishing"
PUBLISH_METHOD = "Automated"
PUBLISH_STATUS = "Ready to Publish"
