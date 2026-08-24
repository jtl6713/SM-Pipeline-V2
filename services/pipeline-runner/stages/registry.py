from collections.abc import Callable

from config import StageRequest, StageResult
from stages import a1p, a2, a2b, a3, a4, ap0, ap1_ig, ap1_igs, ap1_igs_poll, c2, c3, c3b, c4, c5, c6, c7, c8, c9, fbs1, fbs2, fbs3, fbs4, i1, i2, i3, i4, p2, p3, p4, p5, r2, r2b, r3, r4, r5, rr1, rr2, sai1, smv1
from stages.letter import run as run_letter
from stages._stub import run_stub

StageHandler = Callable[[StageRequest], StageResult]

STAGE_NAMES: tuple[str, ...] = (
    "smv1",
    "m1",
    "letter",
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
    "p4",
    "p5",
    "sai1",
    "i1",
    "i2",
    "i3",
    "i4",
    "a2",
    "a2b",
    "a3",
    "a4",
    "a1p",
    "c2",
    "c3",
    "c3b",
    "c4",
    "c5",
    "c6",
    "c7",
    "c8",
    "c9",
    "ap0",
    "ap1_ig",
    "ap1_igs",
    "ap1_igs_poll",
    "fbs1",
    "fbs2",
    "fbs3",
    "fbs4",
    "publish_ig",
    "publish_fb",
    "publish_tt",
    "publish_yt",
)

_IMPLEMENTED_STAGES = frozenset(
    {
        "smv1",
        "letter",
        "r2",
        "r2b",
        "r3",
        "r4",
        "r5",
        "rr1",
        "rr2",
        "p2",
        "p3",
        "p4",
        "p5",
        "sai1",
        "i1",
        "i2",
        "i3",
        "i4",
        "a2",
        "a2b",
        "a3",
        "a4",
        "a1p",
        "c2",
        "c3",
        "c3b",
        "c4",
        "c5",
        "c6",
        "c7",
        "c8",
        "c9",
        "ap0",
        "ap1_ig",
        "ap1_igs",
        "ap1_igs_poll",
        "fbs1",
        "fbs2",
        "fbs3",
        "fbs4",
    }
)

_HANDLERS: dict[str, StageHandler] = {
    "smv1": smv1.run,
    "letter": run_letter,
    "r2": r2.run,
    "r2b": r2b.run,
    "r3": r3.run,
    "r4": r4.run,
    "r5": r5.run,
    "rr1": rr1.run,
    "rr2": rr2.run,
    "p2": p2.run,
    "p3": p3.run,
    "p4": p4.run,
    "p5": p5.run,
    "sai1": sai1.run,
    "i1": i1.run,
    "i2": i2.run,
    "i3": i3.run,
    "i4": i4.run,
    "a2": a2.run,
    "a2b": a2b.run,
    "a3": a3.run,
    "a4": a4.run,
    "a1p": a1p.run,
    "c2": c2.run,
    "c3": c3.run,
    "c3b": c3b.run,
    "c4": c4.run,
    "c5": c5.run,
    "c6": c6.run,
    "c7": c7.run,
    "c8": c8.run,
    "c9": c9.run,
    "ap0": ap0.run,
    "ap1_ig": ap1_ig.run,
    "ap1_igs": ap1_igs.run,
    "ap1_igs_poll": ap1_igs_poll.run,
    "fbs1": fbs1.run,
    "fbs2": fbs2.run,
    "fbs3": fbs3.run,
    "fbs4": fbs4.run,
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
