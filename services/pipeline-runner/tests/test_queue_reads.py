from item4.constants import SMV1_PENDING_CROP_FORMULA, SMV1_PRODUCTION_FORMULA
from queue_reads import queue_formula_filter


def test_crop_and_variant_selectors_translate():
    crop = queue_formula_filter(f'AND({{Test_Run_ID}}=BLANK(),{SMV1_PENDING_CROP_FORMULA})')
    assert crop is not None
    assert "payload->>asset_kind.eq.Platform Variant" in crop
    assert "status.eq.Pending" in crop
    assert "status.eq.Drive Uploaded" in crop
    processing = queue_formula_filter('AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Processing")')
    assert "status.eq.Processing" in processing
    error = queue_formula_filter('AND({Test_Run_ID}=BLANK(),{Transfer_Status}="Error")')
    assert "status.eq.Error" in error
    assert queue_formula_filter(SMV1_PRODUCTION_FORMULA) is not None
    assert queue_formula_filter('FIND("rec", {Error_Message})') is None
