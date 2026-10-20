"""Safe Studio API Worker rollback across Durable Object lifecycle boundaries.

Cloudflare will not roll a Worker back to a historical version that is missing a
Durable Object namespace the current version already exported. The scheduling
reservation namespace and the independent Home profile-summary namespace are
both SQLite classes. Either one becoming present (or disappearing) is a
lifecycle boundary.

This module never prints binding secrets. Feature-flag evidence is limited to
the named Home/refill/shadow and reservation-authority settings.
"""

from __future__ import annotations

DURABLE_OBJECT_BINDINGS = (
    "STUDIO_SCHEDULE_RESERVATIONS",
    "STUDIO_PROFILE_SUMMARIES",
)

HOME_READ_FLAGS = (
    "STUDIO_HOME_PROFILE_SUMMARY_READS",
    "STUDIO_REFILL_PROFILE_SUMMARY_READS",
)

SHADOW_FLAGS = (
    "STUDIO_PROFILE_SUMMARY_CAPTURE_ENABLED",
    "STUDIO_PROFILE_SUMMARY_RECONCILE_ENABLED",
)

SANITIZED_FLAG_NAMES = HOME_READ_FLAGS + SHADOW_FLAGS + (
    "STUDIO_SCHEDULE_RESERVATION_AUTHORITY_ENABLED",
)


def durable_object_names(bindings):
    names = set()
    for item in bindings or []:
        name = str(item.get("name") or "")
        if name in DURABLE_OBJECT_BINDINGS and str(item.get("type") or "") == "durable_object_namespace":
            names.add(name)
    return names


def lifecycle_delta(before_names, current_names):
    before = set(before_names or ())
    current = set(current_names or ())
    return {
        "added": sorted(current - before),
        "removed": sorted(before - current),
        "crosses": bool(before ^ current),
    }


def sanitize_runtime_flags(plain_vars):
    values = {}
    for name in SANITIZED_FLAG_NAMES:
        if name in (plain_vars or {}):
            values[name] = str(plain_vars[name])
        else:
            values[name] = "absent"
    return values


def home_read_cutover_off(plain_vars):
    values = sanitize_runtime_flags(plain_vars)
    return all(values[name] in ("false", "absent") for name in HOME_READ_FLAGS)


def decide_rollback(*, before_version, current_version, before_bindings, current_bindings, current_plain=None):
    """Return a rollback decision that Cloudflare can actually apply."""
    if not before_version:
        raise SystemExit("Missing captured production version for rollback")
    if not current_version or current_version == before_version:
        return {
            "action": "noop",
            "reason": "production_version_unchanged",
            "before_version": before_version,
            "current_version": current_version or before_version,
            "lifecycle": lifecycle_delta(
                durable_object_names(before_bindings),
                durable_object_names(current_bindings or before_bindings),
            ),
            "flags": sanitize_runtime_flags(current_plain),
        }

    before_do = durable_object_names(before_bindings)
    current_do = durable_object_names(current_bindings)
    delta = lifecycle_delta(before_do, current_do)
    flags = sanitize_runtime_flags(current_plain)
    evidence = {
        "action": "rollback",
        "reason": "same_durable_object_namespaces",
        "before_version": before_version,
        "current_version": current_version,
        "lifecycle": delta,
        "flags": flags,
    }
    if not delta["crosses"]:
        return evidence
    if not home_read_cutover_off(current_plain):
        raise SystemExit(
            "Cannot leave production on a Durable Object lifecycle version "
            "because Home/refill profile-summary reads are enabled"
        )
    evidence["action"] = "skip_lifecycle"
    evidence["reason"] = "durable_object_lifecycle_boundary"
    return evidence
