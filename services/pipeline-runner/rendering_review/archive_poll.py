"""Hermetic SoR helpers for quiet-window Airtable archive poll skips.

Phase 0 Rendering Review CI must not import supabase_pipeline (pulls config →
dotenv). Keep this module stdlib-only.
"""
from __future__ import annotations

import os
from typing import Any


def airtable_archive_poll_closed(settings: Any | None = None) -> bool:
    """True when STUDIO_WRITE_SOURCE=supabase and Supabase is configured."""
    cfg = settings if isinstance(settings, dict) else {}
    source = str(
        cfg.get("studio_write_source")
        or os.environ.get("STUDIO_WRITE_SOURCE")
        or "airtable"
    ).strip().lower()
    if source != "supabase":
        return False
    url = str(cfg.get("supabase_url") or os.environ.get("SUPABASE_URL") or "").strip()
    key = str(
        cfg.get("supabase_service_role_key")
        or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        or ""
    ).strip()
    return bool(url and key)
