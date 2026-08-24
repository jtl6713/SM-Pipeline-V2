from asset.constants import MAKE_A4_SCENARIO_ID

MAKE_SCENARIO_ID = MAKE_A4_SCENARIO_ID
MAKE_SCENARIO_NAME = "A4 - Deleted Drive Asset Reconciliation R2B READY v20"
MISSING_NOTES = (
    "A4 detected this Google Drive file is in Trash, missing, or inaccessible using an exact "
    "Drive ID match. It cleaned downstream unpublished Platform Outputs and linked Content Items, "
    "then deleted this Media Assets record from Airtable."
)
HEALTHY_NOTES = (
    "A4 verified this Google Drive file is still available and not in Trash. Healthy checkpoint "
    "updated so the A4 verification view can rotate to the next assets."
)
