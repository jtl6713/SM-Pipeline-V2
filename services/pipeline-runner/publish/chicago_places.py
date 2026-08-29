"""Curated Meta / Instagram location page IDs for Chicago places.

Pages Search requires Page Public Metadata Access (App Review). Until that is
approved, publish resolves place tags from this map (plus optional Pipeline
Settings overrides). IDs are Instagram explore/location page IDs, which Meta
accepts as ``location_id`` / ``place`` when the page has lat/lng.
"""

from __future__ import annotations

# name (lowercase) -> Facebook/Instagram location page id
CHICAGO_PLACE_PAGE_IDS: dict[str, str] = {
    "andersonville": "213085162",
    "bridgeport": "215445468",
    "bronzeville": "215445484",
    "bucktown": "215445475",
    "chicago": "212988662",
    "chinatown": "212926558",
    "clark street": "240095110",
    "edgewater": "215331155",
    "fulton market": "1022618899",
    "garfield park": "215331179",
    "gold coast": "215331191",
    "grant park": "213370358",
    "humboldt park": "215331208",
    "hyde park": "220153895",
    "lakeview": "215331247",
    "lincoln park": "213116558",
    "lincoln square": "215331278",
    "logan square": "215331288",
    "loop": "219126758",
    "the loop": "219126758",
    "magnificent mile": "213370385",
    "millennium park": "213370402",
    "museum campus": "1022620361",
    "navy pier": "215331224",
    "near north side": "1022620545",
    "old town": "215331371",
    "pilsen": "214844790",
    "printers row": "1022619648",
    "ravenswood": "215445547",
    "river north": "215445508",
    "rogers park": "215445556",
    "south loop": "215445599",
    "streeterville": "215445616",
    "ukrainian village": "220153978",
    "uptown": "220153990",
    "west loop": "215445650",
    "wicker park": "212926625",
}

# Prefer more specific places when scanning free text (longest names first).
CHICAGO_PLACE_NAMES: tuple[str, ...] = tuple(
    sorted(CHICAGO_PLACE_PAGE_IDS.keys(), key=len, reverse=True)
)
