MAKE_SCENARIO_ID = 5530955
MAKE_SCENARIO_NAME = "P2 - Voiceover and Thumbnail Generation - Daisy Chain v2.3 - Optional Voiceover"
WEBHOOK_URL = ""
P3_WEBHOOK_URL = ""

VOICEOVER_DRIVE_FOLDER_ID = "1IWtzSArEsbkPeJtCyHeVNpqII6kTMjut"
THUMBNAIL_DRIVE_FOLDER_ID = "19YXOymjeDL8XYFQMg5ZYns1FdCM55_FJ"

ELEVENLABS_MODEL_ID = "eleven_multilingual_v2"
ELEVENLABS_OUTPUT_FORMAT = "mp3_44100_128"
VOICE_ID_GEORGE = "JBFqnCBsd6RMkjVDRZzb"
VOICE_ID_DEFAULT = "xVQH621DS3eyBYrseRt5"

OPENAI_IMAGE_MODEL = "gpt-image-1.5"
OPENAI_IMAGE_QUALITY = "high"

NORMALIZER_TARGET_LUFS = "-16"
NORMALIZER_TRUE_PEAK_DBTP = "-1.5"
NORMALIZER_TARGET_LRA = "7"
NORMALIZER_OUTPUT_BITRATE_KBPS = "128"

PIPELINE_SETTING_NORMALIZER_URL = "Voiceover_Normalization_Service_URL"

THUMBNAIL_PROMPT_SUFFIX = """

IMPORTANT BRANDING RULE:
Do not invent, draw, simulate, approximate, or generate any ChicagoShining logo or watermark in the image. Official branding/watermarking is handled downstream by production assets.

CHICAGOSHINING THUMBNAIL TEXT STYLE:
When the thumbnail includes text, use bold, high-impact block lettering with this mix:
1) DEFAULT (≥ ~80% of posts): premium gold or black-and-gold lettering — metallic gold, slightly arched or refined block letters, sophisticated and cinematic (elegant city light, dusk skyline, reflective water, architectural drama). Prefer this stylish gold look over colorful 3D.
2) OCCASIONAL (≤ ~20% of posts): colorful glossy 3D block lettering only when the subject clearly calls for high-energy playful treatment. Do not default to bright multicolor candy 3D letters.

Text should be large, readable on mobile, visually dramatic, and placed near the center or slightly lower than center. Keep text inside safe margins and avoid the top and bottom 10% of the image.

PRODUCTION-SAFE THUMBNAIL RULES:
- Preserve the creative intent of the Thumbnail_Prompt.
- Create a polished, high-contrast ChicagoShining social thumbnail / promo still.
- Keep important subjects and any readable text inside safe margins.
- Avoid placing key text in the top or bottom 10% of the image.
- Do not include fake platform UI, fake logos, fake watermarks, cluttered microtext, or distorted lettering."""
