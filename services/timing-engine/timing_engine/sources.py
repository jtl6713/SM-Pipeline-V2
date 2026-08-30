from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Protocol


@dataclass(frozen=True)
class TimingEvent:
    kind: str
    time_seconds: float
    strength: float = 1.0
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class TimingContext:
    audio_path: str
    music_start_seconds: float
    music_duration_seconds: float
    extra: dict[str, Any] = field(default_factory=dict)


class TimingSource(Protocol):
    name: str

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        ...


class VoiceoverSource:
    name = "voiceover"

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        return []


class CaptionSource:
    name = "captions"

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        return []


class EnergySource:
    name = "energy"

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        return []


class ChorusSource:
    name = "chorus"

    def analyze(self, ctx: TimingContext) -> list[TimingEvent]:
        return []


SOURCE_REGISTRY: dict[str, type] = {
    "voiceover": VoiceoverSource,
    "captions": CaptionSource,
    "energy": EnergySource,
    "chorus": ChorusSource,
}
