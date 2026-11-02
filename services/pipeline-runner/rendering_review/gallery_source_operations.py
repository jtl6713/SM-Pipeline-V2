"""Fail-closed original-media gate for the isolated native gallery Runner.

The caller supplies an authoritative Airtable loader. It must reload the
Content Item, Platform Output, Carousel Slides and rights assignments together,
returning the source claims; this adapter never trusts a browser proposal.
"""
import hashlib
import json

from rendering_review.gallery_source_verification import (
    SourceVerificationDenied, verify_original_gallery_sources,
)


def canonical_digest(slides):
    return hashlib.sha256(json.dumps(slides, sort_keys=True,
        separators=(",", ":")).encode("utf-8")).hexdigest()


class VerifiedOriginalSourceOperation:
    """Callable gate suitable for gallery_attempt.operations.verify_original_sources.

    Avoids cache or metadata-only success: always reads authoritative claim
    rows, then downloads every original Drive image for independent readback.
    """
    def __init__(self, *, airtable_source_loader, drive):
        if not callable(airtable_source_loader):
            raise ValueError("gallery_authoritative_source_loader_required")
        self.loader = airtable_source_loader
        self.drive = drive

    def __call__(self, original):
        if not isinstance(original, dict) or original.get("verified") is not True:
            return False
        output = original.get("output_id")
        profile = original.get("profile_id")
        content = original.get("content_item_id")
        aspect = original.get("aspect_ratio")
        if not isinstance(content, str):
            return False
        live = self.loader(output, profile, content)
        if (not isinstance(live, dict) or live.get("authority") != "airtable" or
                live.get("output_id") != output or
                live.get("profile_id") != profile or
                live.get("content_item_id") != content or
                live.get("aspect_ratio") != aspect or
                live.get("rights_verified") is not True or
                live.get("hold_active") is not True):
            return False
        try:
            verified = verify_original_gallery_sources(
                output_id=output, profile_id=profile, content_item_id=content,
                aspect_ratio=aspect, slides=live.get("slides"), drive=self.drive)
        except SourceVerificationDenied:
            return False
        originals = original.get("artifacts")
        if not isinstance(originals, list) or len(originals) != len(verified):
            return False
        # Compare *all* artifact claims; never substitute a newly discovered
        # Drive image while executing a preexisting immutable manifest.
        keys = ("slot_id", "order", "drive_file_id", "output_id", "profile_id",
                "mime_type", "sha256", "byte_count", "width", "height",
                "watermark_verified", "rights_verified")
        if any(any(old.get(key) != actual.get(key) for key in keys)
               for old, actual in zip(originals, verified)):
            return False
        # An existing manifest SHA is a separate signed/committed assertion.
        # It is not recalculated by this gate because other schema fields may
        # be part of its canonical signing format.
        return True
