from collections.abc import Callable

from config import StageRequest, StageResult
from stages import p2, r2, r3, r4, r5, rr1, smv1
from stages._stub import run_stub

StageHandler = Callable[[StageRequest], StageResult]

STAGE_NAMES: tuple[str, ...] = (
    "smv1",
    "m1",
    "r2",
    "r2b",
    "r3",
    "r4",
    "r5",
    "rr1",
    "rr2",
    "p1",
    "p2",
    "p3",
    "ap0",
    "publish_ig",
    "publish_fb",
    "publish_tt",
    "publish_yt",
)

_IMPLEMENTED_STAGES = frozenset({"smv1", "r2", "r3", "r4", "r5", "rr1", "p2"})

_HANDLERS: dict[str, StageHandler] = {
    "smv1": smv1.run,
    "r2": r2.run,
    "r3": r3.run,
    "r4": r4.run,
    "r5": r5.run,
    "rr1": rr1.run,
    "p2": p2.run,
}


def is_implemented(stage: str) -> bool:
    return stage.strip().lower().replace("-", "_") in _IMPLEMENTED_STAGES


def get_handler(stage: str) -> StageHandler:
    normalized = stage.strip().lower().replace("-", "_")
    if normalized in _HANDLERS:
        return _HANDLERS[normalized]

    def _stub(request: StageRequest) -> StageResult:
        return run_stub(normalized, request)

    return _stub
