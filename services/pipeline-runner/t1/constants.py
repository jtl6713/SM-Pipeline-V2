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
STATUS_PENDING = "Pending"
STATUS_READY = "Ready"
STATUS_SKIPPED = "Skipped"
STATUS_FAILED = "Failed"
DONE_STATUSES = {STATUS_READY, STATUS_SKIPPED}
NATIVE_RENDER = "Native Photo Route"
