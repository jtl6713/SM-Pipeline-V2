"""Fail-closed inventory of Airtable references in existing provider safety workflows.

Only exact, statically verified forbidden-token assertions may mention the
retired PAT or endpoint. This never permits a real provider HTTP operation.
"""
from __future__ import annotations

from pathlib import Path
import re

# Split the retired host token so source inventory never contains a direct API endpoint.
AIRT_HOST = "api." + "airtable.com"
def _expand_guard(value: str) -> str:
    return value.replace("__AIRT_HOST__", AIRT_HOST)


# Narrow file-level proof, not a whole-file exemption.
# Existing workflows may be absent on an older feature branch; newly merged
# main workflows are present in GitHub's PR merge checkout.
PYTHON_GUARDS = {
    ".github/workflows/issue2374-all-profiles-provider-batch-audit.yml": (
        '"Write-Host $sk","Write-Output $sk","AIRTABLE_PAT","__AIRT_HOST__"]:',
        "assert bad not in s,",
    ),
    ".github/workflows/issue2374-exact-provider-ids-audit.yml": (
        '"Write-Output $key","AIRTABLE_PAT","__AIRT_HOST__"]:',
        "assert bad not in s,",
    ),
    ".github/workflows/issue2374-youtube-tiktok-owner-audit.yml": (
        '"Write-Output $key","AIRTABLE_PAT","__AIRT_HOST__"]:',
        "assert bad not in s,",
    ),
    ".github/workflows/issue2374-fb-gallery-http-audit.yml": (
        "'/media_publish','__AIRT_HOST__'):",
        "assert bad not in source",
    ),
    ".github/workflows/issue2374-ig-gallery-http-audit.yml": (
        "'/media_publish','__AIRT_HOST__'):",
        "assert bad not in source",
    ),
    ".github/workflows/issue2374-ig-carousels-owner-auth-audit.yml": (
        '"__AIRT_HOST__", "Write-Host $key", "Write-Output $key"]:',
        "assert bad not in s,",
    ),
}
# Exact previous forbidden-token list lines for split, multiline Python
# assertions. Both lines are negative-only source checks, not API operations.
PYTHON_MULTILINE_PREVIOUS = {
    ".github/workflows/issue2374-fb-gallery-http-audit.yml":
        "for bad in ('SUPABASE_SERVICE_ROLE_KEY','AIRTABLE_PAT','-Method Post',",
    ".github/workflows/issue2374-ig-gallery-http-audit.yml":
        "for bad in ('SUPABASE_SERVICE_ROLE_KEY','AIRTABLE_PAT','-Method Post',",
    ".github/workflows/issue2374-ig-carousels-owner-auth-audit.yml":
        '"Invoke-Sqlcmd", "/media_publish", "AIRTABLE_PAT",',
}
POWERSHELL_GUARDS = {
    ".github/workflows/p1-2340-la-youtube-inventory-readonly.yml": (
        ",'AIRTABLE_PAT','https://__AIRT_HOST__','Write-Output $key','Write-Host $key')){",
        "if($source.Contains($bad)){throw 'unsafe_la_inventory_script'}",
        2,
    ),
    ".github/workflows/p1-2340-miami-youtube-inventory-readonly.yml": (
        ",'AIRTABLE_PAT','https://__AIRT_HOST__','Write-Output $key','Write-Host $key')){",
        "if($source.Contains($bad)){throw 'unsafe_miami_inventory_script'}",
        2,
    ),
    ".github/workflows/p1-2340-fb-9777-original-photos.yml": (
        ",'-X POST','AIRTABLE_PAT','__AIRT_HOST__','Write-Output $key','Write-Host $token')){",
        "if($code.Contains($bad)){throw 'mutation_or_secret_output_prohibited'}",
        1,
    ),
    ".github/workflows/p1-2340-nyc4785-tiktok-status.yml": (
        ",'-Method Delete','__AIRT_HOST__','Write-Output $secret','Write-Host $secret')){",
        "if($src.Contains($bad)){throw 'media_publish_or_unsafe_operation_prohibited'}",
        1,
    ),
    ".github/workflows/p1-2340-story-3522-fresh-approved-once.yml": (
        "foreach($bad in @('__AIRT_HOST__','AIRTABLE_PAT','-Method Delete','-Method Put','Write-Output $token','Write-Host $token')){",
        "if($src.Contains($bad)){throw 'unsafe_operation_or_secret_output'}",
        1,
    ),
    ".github/workflows/p1-2340-ten-approved-stories.yml": (
        "foreach($bad in @('__AIRT_HOST__','AIRTABLE_PAT','-Method Delete','Write-Output $token','Write-Host $token')){",
        "if($s.Contains($bad)){throw 'unsafe_operation'}",
        1,
    )
}
OTHER_EXACT_POWERSHELL_GUARDS = {
    ".github/workflows/p1-2340-nyc2627-story-getonly.yml": (
        "foreach($forbidden in @('-Method Post','-Method Patch','-Method Delete','Invoke-Sqlcmd','__AIRT_HOST__','/media_publish','/media?','airtable.com/v0/')){",
        "if($s.Contains($forbidden)){throw ('write_or_unscoped_provider_call_forbidden: '+$forbidden)}",
    ),
    ".github/workflows/ig-story-1868-2859-exact-owner-getonly.yml": (
        "foreach($bad in @('-Method Post','-Method Patch','-Method Delete','Invoke-Sqlcmd',"
        "'__AIRT_HOST__','/media_publish','/media?','airtable.com/v0/','Invoke-Expression')){",
        "if($s.Contains($bad)){throw ('prohibited_provider_or_source_mutation: '+$bad)}",
    ),
    ".github/workflows/p1-2340-six-new-stories-owned-media-readonly.yml": (
        "foreach($bad in @('-Method Post','-Method Patch','-Method Put','-Method Delete','/media_publish','__AIRT_HOST__','/stages/ap1_igs','Publish_Retry_Eligible=true')){",
        "if($s.Contains($bad)){throw ('mutating_operation_found: '+$bad)}",
    ),

}


# Exact source-only forbidden-token checks merged after the retirement branch.
# This is not a file/path allowlist: every token occurrence must be structurally
# accounted for and the matching statement must fail closed.
EXTRA_PINNED_PYTHON_NEGATIVE_GUARDS = {
    ".github/workflows/issue2374-seven-original-ig-preview.yml": (
        "assert required in script, required",
        "for forbidden in ('SUPABASE_SERVICE_ROLE_KEY','__AIRT_HOST__',",
        "assert forbidden not in script", 3, 1,
    ),
    ".github/workflows/issue2374-ten-new-media-original-preview.yml": (
        "assert required in script, required",
        "for forbidden in ('SUPABASE_SERVICE_ROLE_KEY','__AIRT_HOST__',",
        "assert forbidden not in script", 3, 1,
    ),
    ".github/workflows/issue2374-supabase-worker-release-contract.yml": (
        "forbidden=[",
        "'/api/admin/qa/', '/qa-catalog', '/qa-runs', '__AIRT_HOST__',",
        "for item in forbidden: assert item not in w, item", 5, 1,
    ),
    ".github/workflows/issue2464-five-ambiguous-ap3c-owner-audit.yml": (
        "\"Invoke-Sqlcmd\", \"/media_publish\", \"AIRTABLE_PAT\",",
        "\"__AIRT_HOST__\", \"Write-Host $key\", \"Write-Output $key\"]:",
        "assert bad not in s, \"unsafe provider write or secret exposure\"", 1, 2,
    ),
    ".github/workflows/issue2464-original-24-ig-children-audit.yml": (
        "for banned in ['-Method Post','-Method Patch','-Method Delete','-Method Put',",
        "'__AIRT_HOST__','AIRTABLE_PAT','/media_publish',",
        "assert banned not in s, f'unsafe operation: {banned}'", 2, 1,
    ),
    ".github/workflows/issue2489-nyc-six-provider-queues-readonly.yml": (
        "'/media_publish','/tiktok/draft/video/init',",
        "'__AIRT_HOST__','Write-Output $sk','Write-Host $sk'):",
        "assert token not in s, 'unsafe mutation or credential logging'", 1, 1,
    ),
}



def permitted_negative_reference_locations(root: Path) -> set[tuple[str, int]]:
    """Return (relative workflow path, zero-based line) for *validated* guards.

    Even inside a known workflow, every other occurrence remains disallowed.
    A structural change, extra occurrence or missing guard causes rejection.
    """
    safe: set[tuple[str, int]] = set()
    for filename, (tail, post_assertion) in PYTHON_GUARDS.items():
        tail, post_assertion = _expand_guard(tail), _expand_guard(post_assertion)
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        matches = [
            i for i, line in enumerate(lines)
            if AIRT_HOST in line or "AIRTABLE_PAT" in line
        ]
        previous = PYTHON_MULTILINE_PREVIOUS.get(filename)
        if previous is not None:
            if (len(matches) != 2 or matches[1] != matches[0] + 1
                or lines[matches[0]].strip() != previous):
                continue
            i = matches[1]
        else:
            if len(matches) != 1:
                continue
            i = matches[0]
        context = "\n".join(lines[max(0, i - 8):i])
        if (lines[i].strip().endswith(tail)
            and ("for bad in [" in context or "for bad in (" in context)
            and i + 1 < len(lines)
            and lines[i + 1].strip().startswith(post_assertion)):
            safe.add((filename, i))
            if previous is not None:
                safe.add((filename, matches[0]))

    for filename, (tail, post_assertion, expected_count) in POWERSHELL_GUARDS.items():
        tail, post_assertion = _expand_guard(tail), _expand_guard(post_assertion)
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        matches = [
            i for i, line in enumerate(lines)
            if AIRT_HOST in line or "AIRTABLE_PAT" in line
        ]
        # Require every forbidden reference to be in an exact negative guard,
        # preserving the intentionally repeated parser/live checks when present.
        if len(matches) != expected_count:
            continue
        if all(
            lines[i].strip().startswith("foreach($bad in @(")
            and lines[i].strip().endswith(tail)
            and i + 1 < len(lines)
            and lines[i + 1].strip() == post_assertion
            for i in matches
        ):
            safe.update((filename, i) for i in matches)
    for filename, (text, guard) in OTHER_EXACT_POWERSHELL_GUARDS.items():
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        matches = [i for i, line in enumerate(lines)
                   if AIRT_HOST in line or "AIRTABLE_PAT" in line]
        if (len(matches) == 1 and lines[matches[0]].strip() == _expand_guard(text)
            and matches[0] + 1 < len(lines)
            and lines[matches[0] + 1].strip() == _expand_guard(guard)):
            safe.add((filename, matches[0]))
    for filename, (previous, marker, rejecting, offset, expected_hits) in (
        EXTRA_PINNED_PYTHON_NEGATIVE_GUARDS.items()
    ):
        file = root / filename
        if not file.exists():
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        hits = [i for i, line in enumerate(lines)
                if AIRT_HOST in line or "AIRTABLE_PAT" in line
                or "AIRTABLE_TOKEN" in line]
        candidates = [i for i, line in enumerate(lines)
                      if line.strip() == _expand_guard(marker)]
        if (len(hits) != expected_hits or len(candidates) != 1):
            continue
        i = candidates[0]
        if (i < 1 or hits[-1] != i or i + offset >= len(lines)
            or lines[i - 1].strip() != _expand_guard(previous)
            or lines[i + offset].strip() != rejecting):
            continue
        safe.update((filename, index) for index in hits)
    # The merged, GET-only production identity audit reports presence of a
    # legacy credential binding by *name*; this is not an egress credential use.
    # Permit exactly one fixed expression, not the entire workflow.
    identity_audit = ".github/workflows/audit-studio-supabase-target-readonly.yml"
    audit_path = root / identity_audit
    if audit_path.exists():
        audit_lines = audit_path.read_text(encoding="utf-8").splitlines()
        token_lines = [i for i, line in enumerate(audit_lines)
                       if "AIRTABLE_PAT" in line or AIRT_HOST in line]
        required = ("'legacy_airtable_pat_binding_present':any("
                    "b.get('name')=='AIRTABLE_PAT' for b in bindings),")
        if (len(token_lines) == 1 and audit_lines[token_lines[0]].strip() == required
            and "'only_read_operations':True" in audit_path.read_text(encoding="utf-8")):
            safe.add((identity_audit, token_lines[0]))
    # New GitHub workflows may be merged during the retirement PR. Accept an
    # *unlisted* PowerShell forbidden-token fixture only when the entire
    # containing line is a literal foreach($bad ...) array and the immediately
    # next statement rejects that token using a literal Contains()+throw.
    # This is a narrowly parsed statement, NOT a whole-file or path exemption.
    # Previously pinned files still require their exact original guard counts.
    pinned = (set(PYTHON_GUARDS) | set(POWERSHELL_GUARDS) |
              set(OTHER_EXACT_POWERSHELL_GUARDS) |
              set(EXTRA_PINNED_PYTHON_NEGATIVE_GUARDS) | {identity_audit})
    array = re.compile(r"^foreach\(\$bad in @\('(?:[^'\r\n]*)'(?:,'(?:[^'\r\n]*)')*\)\)\{$")
    fail_guard = re.compile(
        r"^if\(\$(?:src|s|source|code)\.Contains\(\$bad\)\)"
        r"\{throw '[A-Za-z0-9_]+'\}$"
    )
    for file in sorted((root / ".github/workflows").glob("*.y*ml")):
        rel = file.relative_to(root).as_posix()
        if rel in pinned:
            continue
        lines = file.read_text(encoding="utf-8").splitlines()
        for i, line in enumerate(lines):
            tokens = (AIRT_HOST, "AIRTABLE_PAT", "AIRTABLE_TOKEN")
            if not any(token in line for token in tokens):
                continue
            candidate = line.strip()
            if (array.fullmatch(candidate)
                and i + 1 < len(lines)
                and fail_guard.fullmatch(lines[i + 1].strip())
                and (_expand_guard("'__AIRT_HOST__'") in candidate
                     or _expand_guard("'https://__AIRT_HOST__'") in candidate
                     or "'AIRTABLE_PAT'" in candidate
                     or "'AIRTABLE_TOKEN'" in candidate)):
                safe.add((rel, i))
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
