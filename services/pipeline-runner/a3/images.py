"""Browser-safe stills for A3 vision. HEIC/HEIF/AVIF originals are not sent to OpenAI."""

from __future__ import annotations

import base64
import logging
from typing import Any

from asset.helpers import uc_download_url
from render.fields import field_str

logger = logging.getLogger(__name__)


def classification_image_url(record: dict[str, Any], drive=None) -> str:
    file_id = field_str(record, "Google Drive File ID")
    if not file_id:
        return ""

    # Item 4 masters are intentionally private in Drive. A public uc?export=download
    # URL returns an HTML permission page for those files, which OpenAI correctly
    # rejects as "image data ... does not represent a valid image". Prefer Drive's
    # authenticated thumbnail for every still, not just HEIC/HEIF/AVIF assets.
    try:
        client = drive
        if client is None:
            from integrations.google_drive import GoogleDriveClient

            client = GoogleDriveClient()
        grabbed = client.download_thumbnail(file_id, size="w1280")
        if grabbed:
            raw, mime = grabbed
            encoded = base64.standard_b64encode(raw).decode("ascii")
            return f"data:{mime};base64,{encoded}"
    except Exception:
        logger.exception("A3 authenticated image thumbnail for classification failed")

    # Public/manual library uploads can still use the direct Drive URL if a
    # thumbnail cannot be obtained. Browser-incompatible originals depend on the
    # thumbnail path above and will surface a normal A3 Classification Error if
    # Drive cannot provide one.
    return uc_download_url(file_id)
