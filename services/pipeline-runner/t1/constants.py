MAKE_SCENARIO_ID = 0
MAKE_SCENARIO_NAME = "T1 - Timing Engine"
MAX_RECORDS = 5
DEFAULT_RULES = {
    "strategy": "equal_beats",
    "recycle": False,
    "rules": [
        {"equal_duration": True},
    ],
}
VIDEO_RULES = {
    "strategy": "equal_beats",
    "recycle": False,
    "max_clips": 60,
    "post_voiceover_transition_frames": 2,
    "rules": [
        {"equal_duration": True},
    ],
}
DENSE_VIDEO_TRANSITION = {"type": "fade", "duration_frames": 2}
STATUS_PENDING = "Pending"
STATUS_READY = "Ready"
STATUS_SKIPPED = "Skipped"
STATUS_FAILED = "Failed"
DONE_STATUSES = {STATUS_READY, STATUS_SKIPPED}
NATIVE_RENDER = "Native Photo Route"
