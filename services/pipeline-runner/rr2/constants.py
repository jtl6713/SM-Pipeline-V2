MAKE_SCENARIO_ID = 5576353
MAKE_SCENARIO_NAME = "RR2 - Render Review Decision Handler"
MAKE_HOOK_ID = 2538648

DECISION_APPROVED = "approved"
DECISION_CHANGES = "changes"
DECISION_REJECTED = "rejected"
DECISION_DO_NOT_PUBLISH = "do_not_publish"

DECISION_ALIASES = {
    "approved": DECISION_APPROVED,
    "approve": DECISION_APPROVED,
    "changes": DECISION_CHANGES,
    "changes_requested": DECISION_CHANGES,
    "rejected": DECISION_REJECTED,
    "reject": DECISION_REJECTED,
    "do_not_publish": DECISION_DO_NOT_PUBLISH,
    "donotpublish": DECISION_DO_NOT_PUBLISH,
}

DECISION_LABELS = {
    DECISION_APPROVED: "Approved for Publishing",
    DECISION_CHANGES: "Changes Requested",
    DECISION_REJECTED: "Rejected",
    DECISION_DO_NOT_PUBLISH: "Do Not Publish",
}

# Make modules 93–95 start these orchestrators after Approve. YT-ORCH is not started.
PUBLISHER_START_SCENARIOS = (
    (5864632, "IG-PUB-ORCH"),
    (5813561, "FB-ORCH"),
    (5806668, "TTD-ORCH"),
)
