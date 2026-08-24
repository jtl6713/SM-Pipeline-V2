"""Make scenario IDs for publish-chain stages (orchestrators + webhooks)."""

from __future__ import annotations

P1_SCENARIO_ID = 5528742

AP0_SCENARIO_ID = 5612096
AP0_WEBHOOK_URL = "https://hook.us2.make.com/q1lx2g0gg7khxzgvnkums12wu649pjnw"

AP1_IG_SCENARIO_ID = 5862882
AP1_IGS_SCENARIO_ID = 5612664
AP1_IGS_POLL_SCENARIO_ID = 5845193
FBS3_SCENARIO_ID = 5816502
FBS4_SCENARIO_ID = 5816520

PUBLISH_IG_ORCH_ID = 5864632
PUBLISH_FB_ORCH_ID = 5813561
PUBLISH_TT_ORCH_ID = 5806668
PUBLISH_YT_ORCH_ID = 5823581

# Registry stage -> primary orchestrator scenario id
ORCHESTRATOR_BY_STAGE = {
    "publish_ig": PUBLISH_IG_ORCH_ID,
    "publish_fb": PUBLISH_FB_ORCH_ID,
    "publish_tt": PUBLISH_TT_ORCH_ID,
    "publish_yt": PUBLISH_YT_ORCH_ID,
    "ap0": AP0_SCENARIO_ID,
}
