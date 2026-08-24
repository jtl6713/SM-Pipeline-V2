from __future__ import annotations

from collections.abc import Callable
from typing import Any

from asset.helpers import as_bool
from config import StageRequest
from stages._carousel import run_named_stage


def run_tiktok_stage(
    stage: str,
    request: StageRequest,
    *,
    make_id: int,
    process: Callable[..., dict[str, Any]],
    skip_message: str,
    ok_message: str,
    dry_run_message: str,
    extra_keys: tuple[str, ...] = (),
):
    extra = request.extra or {}
    output_id = (
        request.output_record_id
        or request.platform_output_id
        or extra.get("output_record_id")
        or extra.get("record_id")
        or ""
    )
    if isinstance(output_id, str):
        output_id = output_id.strip() or None
    else:
        output_id = None
    kwargs: dict[str, Any] = {
        "output_record_id": output_id,
        "test_run_id": (request.test_run_id or extra.get("test_run_id") or "").strip() or None,
        "replace_transaction_id": str(extra.get("replace_transaction_id") or "").strip() or None,
        "replace_fingerprint": str(extra.get("replace_fingerprint") or "").strip() or None,
        "dry_run": as_bool(extra.get("dry_run")),
    }
    for key in extra_keys:
        value = extra.get(key)
        kwargs[key] = value.strip() if isinstance(value, str) else value
    return run_named_stage(
        stage,
        request,
        make_id=make_id,
        process=process,
        kwargs=kwargs,
        skip_message=skip_message,
        ok_message=ok_message,
        dry_run_message=dry_run_message,
    )
