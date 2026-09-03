"""Shared constants for the A2–A4 / A1P asset chain (Make 5531974 / 5568863 / 5569035 / 5578180 / 5715500)."""

MAKE_A2_SCENARIO_ID = 5531974
MAKE_A2B_SCENARIO_ID = 5568863
MAKE_A3_SCENARIO_ID = 5569035
MAKE_A4_SCENARIO_ID = 5578180
MAKE_A1P_SCENARIO_ID = 5715500
MAKE_A1S_SCENARIO_ID = 5715530
MAKE_A1M_SCENARIO_ID = 5764543

MAKE_A2_WEBHOOK_URL = ""
MAKE_A2B_WEBHOOK_URL = ""
MAKE_A3_WEBHOOK_URL = ""
MAKE_A4_WEBHOOK_URL = ""

GDRIVE_INGESTION_FOLDER = "1VpjoRDHbwUlQrrEjfEpkGrIz1HFFtNNX"
GDRIVE_VIDEO_FOLDER = "1U5BbeeTBEBrMuYKpA5FoQoKY6qbTEwMi"
GDRIVE_BRANDING_FOLDER = "1xwldx93IdH-esoZDsaKJZaaL8O7kMFVC"
# Library stills after A2. Parent Photos folder holds Studio Intake / Variants too.
GDRIVE_PHOTOS_FOLDER = "16CCKNXzRZV6yBAihf_Mocc3uOFulJ1cm"
GDRIVE_MISC_FOLDER = "1mSXEuMAEjxTpe0TJ5E1p9DOBck5Pxngl"
GDRIVE_MUSIC_FOLDER = "1mzNHcVmeXb6I2WybJD5iOTrJUDRQJIN3"

GDRIVE_FOLDERS = {
    "video": GDRIVE_VIDEO_FOLDER,
    "branding": GDRIVE_BRANDING_FOLDER,
    "image": GDRIVE_PHOTOS_FOLDER,
    "other": GDRIVE_MISC_FOLDER,
    "audio": GDRIVE_MUSIC_FOLDER,
}

MAX_FILE_BYTES = 100_000_000
A1P_MAX_RESULT_BYTES = 90_000_000
A2_DRIVE_PAGE_SIZE = 100
A2B_DRIVE_PAGE_SIZE = 20
A2B_EXISTING_MAX_RECORDS = 1000
A3_MAX_RECORDS = 10
A4_MAX_RECORDS = 20
A4_DOWNSTREAM_MAX_RECORDS = 100
A1P_MAX_ATTEMPTS = 10
A1P_POLL_SLEEP_SECONDS = 60
A1P_STALE_RESUME_SECONDS = 90
A1P_DEAD_JOB_SECONDS = 15 * 60
A1P_FINALIZE_LOCK_SECONDS = 10 * 60
A1S_OVERSIZE_BYTES = 100_000_000
A1S_TARGET_BYTES = 84_000_000
A1S_AUDIO_RESERVE_KBPS = 160
A1S_MIN_VIDEO_KBPS = 350
A1S_DRIVE_PAGE_SIZE = 20
A1S_METADATA_WAIT_SECONDS = 90
A1S_METADATA_POLL_SECONDS = 2
A1S_JOB_NOTES = (
    "Local Video Compressor state. Active=true blocks duplicate jobs. "
    "The private original remains unchanged until A1P verifies the replacement in Drive."
)

A2B_EXISTING_VIEW = "viwjkNLLuZYM8dnoK"
A3_CLASSIFY_VIEW = "viwf6dxUJrMx2yNoe"
A4_ORPHAN_VIEW = "viwQv8PDtE8qXwMPk"
SETTINGS_ACTIVE_VIEW = "viwaplWr2J3Hq0Rz1"

DEFAULT_EMAIL_TO = "ChicagoShining@gmail.com"
OPENAI_A3_MODEL = "gpt-5.5"

A2B_SKIP_NAME_FRAGMENTS = (
    "platform-output",
    "make-v",
    "v11-platform-output",
)
A2B_SKIP_BACKFILL_NAMES = (
    "platform-output",
    "make-v",
    "v11-platform-output",
    "RIver 1.mp4",
    "River 2.MOV",
    "River 3.MOV",
    "River 4_compressed.mp4",
    "River Boat 1.mp4",
    "River Boat 2.mp4",
    "River Boat 3.mp4",
    "River Fog 1_compressed.mp4",
    "Streeterville 1_compressed.mp4",
)

BRANDING_KEYWORDS = ("logo", "watermark", "brand")
BRANDING_EXACT = "ChicagoShining"

VOICEOVER_FILENAME_HINTS = (
    "voiceover",
    "voice-over",
    "narration",
    "narrator",
    "spoken",
    "speech",
    "text-to-speech",
    "tts",
    "elevenlabs",
    "english female voice",
    "english male voice",
    "soft accent",
    "_pvc_",
    "_voice_normalized",
    "_voice.mp3",
    "voice_normalized",
)
MUSIC_FILENAME_HINTS = (
    "music",
    "background",
    "instrumental",
    "song",
    "soundtrack",
    "score",
    "beat",
    "loop",
    "track",
)
