"""Browser-safe stills for A3 vision. HEIC/HEIF/AVIF originals are not sent to OpenAI."""

from __future__ import annotations

import base64
import logging
from typing import Any

from asset.helpers import uc_download_url
from asset.routing import a3_needs_jpeg_preview
from render.fields import field_str

logger = logging.getLogger(__name__)


def classification_image_url(record: dict[str, Any], drive=None) -> str:
    file_id = field_str(record, "Google Drive File ID")
    if not file_id:
        return ""
    if a3_needs_jpeg_preview(
        field_str(record, "MIME_Type"),
        field_str(record, "Asset Name"),
        field_str(record, "File_Extension"),
    ):
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
            logger.exception("A3 JPEG thumbnail for classification failed")
    return uc_download_url(file_id)
