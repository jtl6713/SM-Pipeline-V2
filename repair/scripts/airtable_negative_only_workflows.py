"""Fail-closed inventory of Airtable references in existing provider safety workflows.

Only exact, statically verified forbidden-token assertions may mention the
retired PAT or endpoint. This never permits a real provider HTTP operation.
"""
from __future__ import annotations

from pathlib import Path


# Narrow file-level proof, not a whole-file exemption.
# Existing workflows may be absent on an older feature branch; newly merged
# main workflows are present in GitHub's PR merge checkout.
PYTHON_GUARDS = {
    ".github/workflows/issue2374-all-profiles-provider-batch-audit.yml": (
        '"Write-Host $sk","Write-Output $sk","AIRTABLE_PAT","api.airtable.com"]:',
        "assert bad not in s,",
    ),
    ".github/workflows/issue2374-exact-provider-ids-audit.yml": (
        '"Write-Output $key","AIRTABLE_PAT","api.airtable.com"]:',
        "assert bad not in s,",
    ),
    ".github/workflows/issue2374-youtube-tiktok-owner-audit.yml": (
        '"Write-Output $key","AIRTABLE_PAT","api.airtable.com"]:',
        "assert bad not in s,",
    ),
}
POWERSHELL_GUARDS = {
    ".github/workflows/p1-2340-la-youtube-inventory-readonly.yml": (
        ",'AIRTABLE_PAT','https://api.airtable.com','Write-Output $key','Write-Host $key')){",
        "if($source.Contains($bad)){throw 'unsafe_la_inventory_script'}",
    ),
    ".github/workflows/p1-2340-miami-youtube-inventory-readonly.yml": (
        ",'AIRTABLE_PAT','https://api.airtable.com','Write-Output $key','Write-Host $key')){",
        "if($source.Contains($bad)){throw 'unsafe_miami_inventory_script'}",
    ),
}


def permitted_negative_reference_locations(root: Path) -> set[tuple[str, int]]:
    """Return (relative workflow path, zero-based line) for *validated* guards.

    Even inside a known workflow, every other occurrence remains disallowed.
    A structural change, extra occurrence or missing guard causes rejection.
    """
    safe: set[tuple[str, int]] = set()
    for filename, (tail, post_assertion) in PYTHON_GUARDS.items():
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        matches = [
            i for i, line in enumerate(lines)
            if "api.airtable.com" in line or "AIRTABLE_PAT" in line
        ]
        if len(matches) != 1:
            continue
        i = matches[0]
        context = "\n".join(lines[max(0, i - 8):i])
        if (lines[i].strip().endswith(tail)
            and "for bad in [" in context
            and i + 1 < len(lines)
            and lines[i + 1].strip().startswith(post_assertion)):
            safe.add((filename, i))

    for filename, (tail, post_assertion) in POWERSHELL_GUARDS.items():
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        matches = [
            i for i, line in enumerate(lines)
            if "api.airtable.com" in line or "AIRTABLE_PAT" in line
        ]
        # These contain TWO independent guards: initial parser and live step.
        if len(matches) != 2:
            continue
        if all(
            lines[i].strip().startswith("foreach($bad in @(")
            and lines[i].strip().endswith(tail)
            and i + 1 < len(lines)
            and lines[i + 1].strip() == post_assertion
            for i in matches
        ):
            safe.update((filename, i) for i in matches)
    return safe


def unexpected_references(root: Path, tokens: tuple[str, ...]) -> list[str]:
    safe = permitted_negative_reference_locations(root)
    unexpected = []
    for file in sorted((root / ".github/workflows").glob("*.y*ml")):
        relative = file.relative_to(root).as_posix()
        for i, line in enumerate(file.read_text(encoding="utf-8").splitlines()):
            if any(token in line for token in tokens) and (relative, i) not in safe:
                unexpected.append(f"{relative}:{i + 1}")
    return unexpected
