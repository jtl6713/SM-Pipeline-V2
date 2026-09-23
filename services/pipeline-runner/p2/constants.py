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

PHOTOREALISM:
The scene must look like a real photograph of the place or subject — natural camera, real light, real textures, believable weather and materials. Do not make it illustrated, CGI, painterly, plastic, or like a luxury-ad composite.

CHICAGOSHINING THUMBNAIL TEXT STYLE:
When the thumbnail includes text, use clean, readable block lettering with this mix:
1) DEFAULT (≥ ~80% of posts): restrained gold or black-and-gold lettering — soft brushed or matte gold, or black letters with a thin gold edge. Quiet and sophisticated. Keep lettering secondary to the photo. Do not use chrome, mirror-foil, glow, sparkle, giant arched 3D slabs, or gold-on-everything.
2) OCCASIONAL (≤ ~20% of posts): colorful glossy 3D block lettering only when the subject clearly calls for high-energy playful treatment. Do not default to bright multicolor candy 3D letters.

Text should be large enough to read on a phone and placed near the center or slightly lower than center. Keep text inside safe margins and avoid the top and bottom 10% of the image. Do not let lettering dominate the frame.

PRODUCTION-SAFE THUMBNAIL RULES:
- Preserve the creative intent of the Thumbnail_Prompt.
- Create a photorealistic ChicagoShining social thumbnail / promo still.
- Keep important subjects and any readable text inside safe margins.
- Avoid placing key text in the top or bottom 10% of the image.
- Do not include fake platform UI, fake logos, fake watermarks, cluttered microtext, or distorted lettering.
- Avoid hyper-stylized cinematic grading, heavy bloom, or over-the-top luxury gold treatment."""
