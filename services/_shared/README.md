# Shared Python helpers

`scratch_ttl.py` is the canonical scratch-cleanup module (path-confined TTL sweep). Drive remains the DAM; this only deletes working copies under an explicit root.

Windows deploy copies **one service folder**, and the cloud-vm sidecar build context is `deploy/cloud-vm/scratch-ttl/`, so byte-identical copies also live at:

- `services/frame-extractor/scratch_ttl.py`
- `services/timing-engine/scratch_ttl.py`
- `services/video-compressor/scratch_ttl.py`
- `deploy/cloud-vm/scratch-ttl/scratch_ttl.py`

Edit this file first, copy it to those four paths, then run `pytest services/_shared/test_scratch_ttl.py`. Service Dockerfiles copy `_shared/scratch_ttl.py` last so containers keep the canonical file even if a vendored copy drifted.
