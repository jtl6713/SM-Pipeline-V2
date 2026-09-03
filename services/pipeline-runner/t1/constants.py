MAKE_SCENARIO_ID = 0
MAKE_SCENARIO_NAME = "T1 - Timing Engine"
MAX_RECORDS = 5
DEFAULT_RULES = {
    "strategy": "vo_phased",
    "recycle": False,
    "vo_clip_share": 0.35,
    "rules": [
        {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
        {"remaining": True, "every_n_beats": 1},
    ],
}
VIDEO_RULES = {
    "strategy": "vo_phased",
    "recycle": True,
    "max_clips": 60,
    "vo_clip_share": 0.35,
    "post_voiceover_transition_frames": 2,
    "rules": [
        {"until": "voiceover_end", "every_n_beats": 8, "spread": True},
        {"remaining": True, "every_n_beats": 1},
    ],
}
DENSE_VIDEO_TRANSITION = {"type": "fade", "duration_frames": 2}
STATUS_PENDING = "Pending"
STATUS_READY = "Ready"
STATUS_SKIPPED = "Skipped"
STATUS_FAILED = "Failed"
DONE_STATUSES = {STATUS_READY, STATUS_SKIPPED}
NATIVE_RENDER = "Native Photo Route"
