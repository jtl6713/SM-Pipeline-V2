"""Encoding targets for the Adobe Media Encoder watch-folder bridge.

These are the numbers to enter in Media Encoder. The bridge does not generate
.epr preset files; Watch Folders still have to be pointed at the inbox folders
inside Adobe Media Encoder 2026.
"""

from __future__ import annotations

from dataclasses import asdict, dataclass


@dataclass(frozen=True)
class Preset:
    id: str
    label: str
    width: int
    height: int
    aspect: str
    codec: str
    target_mbps: float | None
    max_mbps: float | None
    audio: str
    intended_use: str
    notes: str = ""

    def as_dict(self) -> dict:
        return asdict(self)


# width/height 0 means the Media Encoder preset should match the source frame.
PRESETS: tuple[Preset, ...] = (
    Preset(
        id="social-standard-9x16",
        label="Social Standard 9:16",
        width=1080,
        height=1920,
        aspect="9:16",
        codec="H.264",
        target_mbps=8,
        max_mbps=12,
        audio="AAC stereo 48 kHz",
        intended_use="Instagram Reels, TikTok, YouTube Shorts, Facebook Reels",
    ),
    Preset(
        id="social-high-9x16",
        label="Social High 9:16",
        width=1080,
        height=1920,
        aspect="9:16",
        codec="H.264",
        target_mbps=14,
        max_mbps=20,
        audio="AAC stereo 48 kHz",
        intended_use="High-motion vertical footage",
    ),
    Preset(
        id="small-file-9x16",
        label="Small File 9:16",
        width=1080,
        height=1920,
        aspect="9:16",
        codec="H.264",
        target_mbps=5,
        max_mbps=8,
        audio="AAC stereo 48 kHz",
        intended_use="Size-sensitive vertical content",
    ),
    Preset(
        id="landscape-standard-16x9",
        label="Landscape Standard 16:9",
        width=1920,
        height=1080,
        aspect="16:9",
        codec="H.264",
        target_mbps=10,
        max_mbps=16,
        audio="AAC stereo 48 kHz",
        intended_use="YouTube landscape, widescreen posts, and general video",
    ),
    Preset(
        id="landscape-high-16x9",
        label="Landscape High 16:9",
        width=3840,
        height=2160,
        aspect="16:9",
        codec="H.264",
        target_mbps=35,
        max_mbps=50,
        audio="AAC stereo 48 kHz",
        intended_use="Optional 4K landscape deliverable",
        notes="Do not upscale a smaller source. Use this preset only when the source is already 4K.",
    ),
    Preset(
        id="archive-master",
        label="Archive Master",
        width=0,
        height=0,
        aspect="source",
        codec="match source",
        target_mbps=None,
        max_mbps=None,
        audio="match source",
        intended_use="Recovery and future re-exports",
        notes="Preserve the source frame. Do not apply a lossy social preset.",
    ),
)

PRESET_BY_ID = {preset.id: preset for preset in PRESETS}

SOURCE_EXTENSIONS = {
    ".mp4",
    ".mov",
    ".m4v",
    ".mxf",
    ".mts",
    ".m2ts",
    ".avi",
    ".mkv",
    ".wmv",
    ".mpg",
    ".mpeg",
}

OUTPUT_EXTENSIONS = {".mp4", ".m4v", ".mov", ".mxf"}

SKIP_SUFFIXES = (".tmp", ".part", ".partial", ".crdownload", ".download")
