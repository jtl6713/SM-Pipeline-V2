from asset.constants import MAKE_A3_SCENARIO_ID, OPENAI_A3_MODEL

MAKE_SCENARIO_ID = MAKE_A3_SCENARIO_ID
MAKE_SCENARIO_NAME = "A3 - Asset Classification v5 - Advisory Eligibility + Voiceover-Aware Exclusive MIME Routing"
OPENAI_MODEL = OPENAI_A3_MODEL
VIDEO_NO_FRAMES_NOTES = (
    "A3 fallback: Frame extraction returned zero frames or was unavailable, so this asset was "
    "classified from metadata only. Re-run A3 after fixing frame extraction if richer visual "
    "classification is needed."
)
