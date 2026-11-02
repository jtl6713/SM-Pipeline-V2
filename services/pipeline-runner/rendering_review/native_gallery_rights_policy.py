"""Server-only policy gate for new C5-generated gallery derivative rights.

An environment variable alone cannot prove licensing. This verifies an
explicit operator-reviewed policy for the exact image model/provider, and
disables provider failover so a different model cannot silently generate.
Do not expose these parameters to browser requests.
"""
from __future__ import annotations

import os
import re
from urllib.parse import urlsplit

from ai_api_preference import account_to_provider, cross_provider_failover_enabled, get_preferred_account
from carousel.constants import OPENAI_IMAGE_MODEL


class NativeGalleryRightsPolicyDenied(ValueError):
    pass


def build_approved_native_gallery_clearance(settings):
    if not isinstance(settings, dict) or cross_provider_failover_enabled(settings):
        raise NativeGalleryRightsPolicyDenied("native_gallery_rights_provider_failover_not_certified")
    account = get_preferred_account(settings)
    provider = account_to_provider(account)
    effective_model = (str(settings.get("openai_secondary_image_deployment") or "").strip()\n                       if account == "SECONDARY" else OPENAI_IMAGE_MODEL)\n    approved_provider = os.environ.get("NATIVE_GALLERY_RIGHTS_APPROVED_PROVIDER", "").strip()
    approved_model = os.environ.get("NATIVE_GALLERY_RIGHTS_APPROVED_MODEL", "").strip()
    basis = os.environ.get("NATIVE_GALLERY_RIGHTS_POLICY_BASIS", "").strip()
    reviewer = os.environ.get("NATIVE_GALLERY_RIGHTS_REVIEWER", "").strip()
    reference = os.environ.get("NATIVE_GALLERY_RIGHTS_POLICY_URL", "").strip()
    terms = urlsplit(reference)
    if (os.environ.get("NATIVE_GALLERY_RIGHTS_REVIEWED") != "true" or
        not approved_provider or approved_provider != provider or
        approved_model != effective_model or
        not re.fullmatch(r"[A-Za-z0-9._@-]{5,100}", reviewer) or
        not 8 <= len(basis) <= 220 or
        terms.scheme != "https" or not terms.hostname or
        terms.username or terms.password or terms.fragment):
        raise NativeGalleryRightsPolicyDenied("native_gallery_rights_policy_not_approved")

    def approve(**kwargs):
        # The authorization is scoped to a fresh, exact claimed job. The
        # registration adapter still independently checks Drive and Airtable.
        required = ("output_id", "profile_id", "content_item_id",
                    "job_id", "slot_id", "file_id", "sha256")
        if any(not kwargs.get(k) for k in required):
            return {"approved": False}
        return {"approved": True, "provider": provider,
                "rights_basis": (
                    "Reviewed " + approved_model + " policy by " + reviewer +
                    ": " + basis + " (" + reference + ")"
                )[:500]}

    return approve
