from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[3]
REMOTION_SOURCE = REPO_ROOT / "services" / "remotion-renderer" / "src" / "ChicagoShiningPhotoSequence.tsx"
WORKER_SOURCE = REPO_ROOT / "apps" / "studio-api" / "worker.js"


def test_remotion_applies_persistent_brand_watermark_to_entire_render():
    source = REMOTION_SOURCE.read_text(encoding="utf-8")
    assert 'data-brand-watermark="persistent"' in source
    assert "<PersistentBrandWatermark" in source
    assert "text={cleanBrandText}" in source
    assert "zIndex: 1000" in source


def test_native_photo_branding_includes_finished_still_passthroughs():
    source = WORKER_SOURCE.read_text(encoding="utf-8")
    start = source.index("async function approveOutputRecordForPublishing")
    end = source.index("function mapApprovedOutputSummary", start)
    approval = source[start:end]
    assert "if (studioOutputIsNativePhoto(record)) {" in approval
    assert "studioIsFinishedPassthrough(record)" not in approval

    needs_start = source.index("function studioNativeStillsNeedLettering")
    needs_end = source.index("function studioOutputNeedsGridCoverForReview", needs_start)
    needs = source[needs_start:needs_end]
    assert "studioIsFinishedPassthrough(record)" not in needs


def test_worker_advertises_visual_watermark_guarantee():
    source = WORKER_SOURCE.read_text(encoding="utf-8")
    assert "studio_all_visual_watermark_v1: true" in source
