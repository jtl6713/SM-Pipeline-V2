"""OpenAI canonical selection — deferred until Make module 7 is ported."""

from __future__ import annotations

from typing import Any

from r2.constants import MAKE_MODULE_OPENAI, MAKE_SCENARIO_ID, MAKE_SCENARIO_NAME


class R2OpenAISelectionDeferred(RuntimeError):
    """Raised when Python must defer canonical selection back to Make."""

    def __init__(
        self,
        *,
        output_record_id: str,
        video_candidates: int,
        music_candidates: int,
    ) -> None:
        self.output_record_id = output_record_id
        self.video_candidates = video_candidates
        self.music_candidates = music_candidates
        super().__init__(
            "OpenAI canonical asset selection is not ported yet; "
            f"continue via Make scenario {MAKE_SCENARIO_ID} module {MAKE_MODULE_OPENAI}."
        )


def select_canonical_package(
    *,
    output: dict[str, Any],
    content_item: dict[str, Any] | None,
    video_candidates: list[dict[str, Any]],
    music_candidates: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Port target: Make module 7 (OpenAI GPT) + module 8 (Parse JSON) + module 9 (Update).

    Blueprint reference: repair/_tmp_make/r2.json
    Live Make scenario: {MAKE_SCENARIO_NAME} ({MAKE_SCENARIO_ID})
    """
    raise R2OpenAISelectionDeferred(
        output_record_id=str(output.get("id") or ""),
        video_candidates=len(video_candidates),
        music_candidates=len(music_candidates),
    )
