"""Timing Engine — merge timing sources into one Remotion-ready timeline."""

from timing_engine.rules import DEFAULT_RULES, apply_rules
from timing_engine.sources import SOURCE_REGISTRY, TimingContext, TimingEvent, TimingSource
from timing_engine.timeline import build_timeline, default_transition

__all__ = [
    "DEFAULT_RULES",
    "SOURCE_REGISTRY",
    "TimingContext",
    "TimingEvent",
    "TimingSource",
    "apply_rules",
    "build_timeline",
    "default_transition",
]
