#!/usr/bin/env python3
"""Build the operator Word guide for Quality Agent."""
import sys
from pathlib import Path

from docx import Document
from docx.enum.text import WD_LINE_SPACING
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor

ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = [
    ROOT / "docs" / "handoffs" / "Quality-Agent.docx",
    ROOT / "docs" / "handoffs" / "Autonomous-Service-Agent.docx",
    ROOT / "apps" / "studio-web" / "docs" / "Quality-Agent.docx",
    ROOT / "apps" / "studio-web" / "docs" / "Autonomous-Service-Agent.docx",
]
TEAL = RGBColor(0x0F, 0x5C, 0x57)
INK = RGBColor(0x1A, 0x1F, 0x2B)


def set_run(run, *, size=11, bold=False, color=INK):
    run.bold = bold
    run.font.size = Pt(size)
    run.font.name = "Calibri"
    run.font.color.rgb = color
    rpr = run._element.get_or_add_rPr()
    rfonts = rpr.get_or_add_rFonts()
    rfonts.set(qn("w:ascii"), "Calibri")
    rfonts.set(qn("w:hAnsi"), "Calibri")


def add_heading(doc, text, level=1):
    p = doc.add_heading(text, level=level)
    for run in p.runs:
        set_run(run, size=18 if level == 1 else 14 if level == 2 else 12, bold=True, color=TEAL)


def add_para(doc, text, *, bold=False):
    p = doc.add_paragraph()
    p.paragraph_format.space_after = Pt(8)
    p.paragraph_format.line_spacing_rule = WD_LINE_SPACING.SINGLE
    set_run(p.add_run(text), bold=bold)


def add_bullets(doc, items):
    for item in items:
        p = doc.add_paragraph(style="List Bullet")
        p.paragraph_format.space_after = Pt(4)
        set_run(p.add_run(item))


def add_table(doc, headers, rows):
    table = doc.add_table(rows=1 + len(rows), cols=len(headers))
    table.style = "Table Grid"
    for i, header in enumerate(headers):
        cell = table.rows[0].cells[i]
        cell.text = ""
        set_run(cell.paragraphs[0].add_run(header), bold=True, size=10)
    for r, row in enumerate(rows, start=1):
        for c, value in enumerate(row):
            cell = table.rows[r].cells[c]
            cell.text = ""
            set_run(cell.paragraphs[0].add_run(value), size=10)
    doc.add_paragraph()


def build() -> Document:
    doc = Document()
    section = doc.sections[0]
    section.top_margin = Inches(0.9)
    section.bottom_margin = Inches(0.9)
    section.left_margin = Inches(1.0)
    section.right_margin = Inches(1.0)

    add_heading(doc, "Chicago Shining Quality Agent", 1)
    add_para(
        doc,
        "Operator guide for the Quality Agent: one check catalog for the tester lane and the service lane, "
        "auto-review of stuck pipeline work, bounded auto-correction, and how to read activity logs. "
        "This file lives in Git at docs/handoffs/Quality-Agent.docx "
        "(also Autonomous-Service-Agent.docx) and opens from Studio → Operations → Quality Agent.",
    )
    add_para(doc, "Last updated: 7 September 2026.", bold=True)

    add_heading(doc, "1. What this agent is", 2)
    add_para(
        doc,
        "Quality Agent watches Chicago Shining production against a maintained checklist. "
        "It is not a second publisher. It does not approve library-stills posts, change covers, or move media off Google Drive.",
    )
    add_bullets(
        doc,
        [
            "Runtime healer (always on): Studio Worker cron every two minutes resumes stale produce, render, crop, and AZ work, and drains leftover Drive ingestion files (including already-processed residue).",
            "Quality Agent (mode-gated, ~15 min): reads GET /api/ops/desk/inventory, walks payload.checks, tickets a diagnosis pack, and only then may restart, open a PR, or later auto-merge an allowlisted heal.",
            "Tester lane: last nightly rotation from tests/regression/catalog.json plus PR hermetic packs. The 15-minute tick does not seed live mx1–mx5 rows.",
            "Local companion (this Windows PC): SYNC Git, VERIFY /health, and PLAN/DEPLOY one service when mode allows and a public health check is down.",
        ],
    )

    add_heading(doc, "2. Check catalog", 2)
    add_para(
        doc,
        "Quality Agent is driven by a maintained list of sentences (apps/studio-api/quality-checks.mjs). "
        "Operations shows each sentence as pass, finding, or not yet run. Kind chips remain for fingerprints.",
    )
    add_bullets(
        doc,
        [
            "Intake: processed leftovers, eligible unprocessed files, oversized videos waiting on compress.",
            "Production advancement is origin-aware: autonomous library-stills stop at Ready for Review; AZ finished-video may auto-schedule when cover, caption, and Final_File_URL exist; manual work also stops at Ready for Review.",
            "Jobs and infra: stale/escalated produce, render without a job, long render, produce orphan, variant Preparing, crop Processing/Error, public /health.",
            "Tester lane: last nightly regression rotation plus cheap catalog assertions. Do not seed live platform-matrix rows every 15 minutes.",
        ],
    )

    add_heading(doc, "3. How auto-review works", 2)
    add_para(
        doc,
        "Every few minutes the Worker tries the usual self-heal first. If a job is still stuck after that budget, "
        "or a Windows media service is down, it shows up on the Operations inventory as a fingerprint: kind + record id + error class.",
    )
    add_bullets(
        doc,
        [
            "transient — ticket once, then leave it to Worker heal. Do not open a PR.",
            "infra_down — a public /health is down. The local companion can restart or deploy one service.",
            "data_repair — a bounded Airtable field fix (never schema, never publish).",
            "code_bug — the desk agent may open a cursor/desk-* pull request. You merge unless automerge is later proven.",
            "unknown or the same fingerprint twice in 24 hours — freeze, email chicagoshining@gmail.com, stop.",
            "produce_clip_mismatch — stories Ready for Review while Reels, TikTok, and YouTube stay Ready for Render. Parent job error is Remotion clip count mismatch (expected N, received M). Stories skip T1; T1 expands the clip list past Selected_Clip_Count. Ticket immediately as code_bug. Worker heal cannot fix it until expectedClipCount equals the actual clip list length, then resume studio-produce. Do not Approve publish. Proven fixture: Lincoln Park Zoo reccEj6eVXPPKalJd / outputs 370–375.",
        ],
    )
    add_para(
        doc,
        "Default desk mode is observe if STUDIO_DESK_MODE is empty. Observe tickets only. It does not patch Git, deploy, restart Windows, write Airtable, pulse Make, or Approve publish.",
    )

    add_heading(doc, "4. How auto-correction works", 2)
    add_para(doc, "Correction is a ladder. Each step requires a higher Desk mode on Operations (or the Airtable Pipeline Settings row STUDIO_DESK_MODE).")
    add_table(
        doc,
        ["Mode", "The agent may", "You still do"],
        [
            ["off", "Read inventory only. No tickets.", "Use Operations yourself. Worker heal still runs."],
            ["observe (default)", "Ticket diagnosis packs to Task Organizer.", "Read the log. Merge nothing automatically."],
            ["infra", "Observe, plus local companion SYNC / VERIFY / one-service DEPLOY when /health is down.", "Keep the PC on. Do not leave a dirty Git checkout if you want companion deploys."],
            ["patch", "Infra, plus open cursor/desk-* PRs.", "Review and merge the PR, then SYNC and PLAN/DEPLOY if a local service changed."],
            ["automerge (gated)", "Patch plus auto-merge only allowlisted heal files after CI is green.", "Leave this off until real incidents have proven the caps. Do not turn it on yet."],
        ],
    )
    add_para(doc, "Allowlisted auto-merge paths (Phase 4 only):", bold=True)
    add_bullets(
        doc,
        [
            "apps/studio-api/worker.js and desk-inventory.mjs",
            "services/pipeline-runner/studio_produce/ and item4/",
            "Daily caps: 3 auto-PRs, 1 auto-merge, 2 restarts per service.",
        ],
    )

    add_heading(doc, "5. What it will never do", 2)
    add_bullets(
        doc,
        [
            "Auto-publish or Approve publish.",
            "Skip Ready for Review on library-stills autonomous pieces (origin=autonomous).",
            "Send thumb_offset when a native 3D grid cover is required.",
            "Store photos, video, music, voiceovers, or thumbnails on R2 as the catalog. Drive remains the DAM.",
            "Force-push, git reset --hard, or edit live Services\\ except a true emergency that is then copied back to Git.",
        ],
    )

    add_heading(doc, "6. How you support it", 2)
    add_para(doc, "Do once", bold=True)
    add_bullets(
        doc,
        [
            "Save the Cursor Automation for the 15-minute observe tick if a draft is still open.",
            "Confirm Desk mode on Operations → Quality Agent. Empty Airtable means observe. Leave automerge off.",
            "Run INSTALL Operator Shortcuts if you want DESK Companion next to START / STOP / VERIFY.",
        ],
    )
    add_para(doc, "Do as the human gate", bold=True)
    add_bullets(
        doc,
        [
            "Library-stills autonomous: Ready for Review → Approve publish. Quality Agent must not auto-publish origin=autonomous.",
            "AZ finished-video may auto-schedule. Change or cancel times in Pipeline before they fire.",
            "TikTok: set the cover in the TikTok app.",
            "In patch mode, merge cursor/desk-* PRs yourself after reading the fingerprint and diagnosis.",
            "After a merge that changes Worker or Pages, bump the Cloudflare trigger files. After a local-service change, PLAN then DEPLOY that one service.",
            "Keep this PC’s Git checkout on main when you want the companion to deploy.",
        ],
    )
    add_para(doc, "Leave alone", bold=True)
    add_bullets(
        doc,
        [
            "Do not set Desk mode to automerge.",
            "Do not apply old Git stashes onto current Worker/UI.",
            "Do not move production onto the Oracle Docker stack yet.",
            "timing.chicagoshining.com does not exist yet. Timing Engine health is local-only.",
        ],
    )

    add_heading(doc, "7. How to review activity logs", 2)
    add_para(doc, "Three places hold the story. Start on the Studio page, then open Task Organizer if you need the ticket text.")
    add_table(
        doc,
        ["Where", "What you see", "How to open it"],
        [
            ["Studio Operations → Quality Agent", "Live check catalog (pass/finding) plus stuck inventory fingerprints and recent desk_incident tickets.", "studio.chicagoshining.com → Operations → Quality Agent. Refresh on that page."],
            ["Task Organizer", "The full ticket: fingerprint, class, record id, diagnosis. Posted as type=desk_incident, agent_id=3, task_id=1. Automated test results use type=test_result.", "https://tasks.chicagoshining.com/logs — Quality Agent service lane and tester lane. /docs is API schema only."],
            ["Email", "Produce that exhausted five Worker resumes is parked as escalated and mailed to chicagoshining@gmail.com.", "Gmail for that address. Repeating fingerprints in 24 hours also email and freeze."],
            ["GitHub", "Code heals as pull requests named cursor/desk-* plus CI on the PR.", "github.com/jtl6713/SM-Pipeline-V2/pulls. Merge yourself while mode is patch."],
        ],
    )
    add_para(
        doc,
        "Worker heal itself is not a Task Organizer ticket. Transient resumes stay in Cloudflare Worker logs and on the Production / Pipeline rows (job JSON step, resume_count, Render_Status).",
    )

    add_heading(doc, "8. Companion and Windows services", 2)
    add_para(doc, "On this PC, from the SM-Pipeline-V2 checkout:")
    add_para(doc, "powershell -NoProfile -ExecutionPolicy Bypass -File .\\deploy\\local-services\\Invoke-DeskCompanion.ps1")
    add_bullets(
        doc,
        [
            "-RestartDown requires mode infra or higher.",
            "-DeployDown PLAN/DEPLOYs one matching service from main if public /health is still down after VERIFY.",
            "Caps file: D:\\Content Creation\\ChicagoShining Pipeline\\Deployment Logs\\Local Services\\desk-caps.json",
        ],
    )

    add_heading(doc, "9. Freeze", 2)
    add_para(
        doc,
        "Set Desk mode to off to stop tickets, restarts, PRs, and companion deploys. Inventory and Worker two-minute heal keep running. Turn observe back on when you want ticketing again.",
    )
    return doc


def main() -> None:
    document = build()
    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        try:
            document.save(path)
            print(path)
        except PermissionError:
            print(f"skip locked {path}", file=sys.stderr)


if __name__ == "__main__":
    main()
