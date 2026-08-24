from __future__ import annotations

import html


def _page(title: str, body: str, *, status_note: str = "") -> str:
    extra = f"<p>{html.escape(status_note)}</p>" if status_note else ""
    return (
        "<!doctype html><html><head><meta charset='utf-8'><title>"
        f"{html.escape(title)}</title></head>"
        "<body style='font-family:Arial,Helvetica,sans-serif;padding:28px;color:#111827;'>"
        f"<h1>{html.escape(title)}</h1>{extra}{body}"
        "<p style='color:#6b7280;font-size:13px;'>You can close this tab.</p>"
        "</body></html>"
    )


def confirmation(title: str, message: str) -> str:
    return _page(title, f"<p>{html.escape(message)}</p>")


def health_page() -> str:
    return confirmation("C3B is active", "C3B v31 is active")


def unsupported(action: str) -> str:
    return _page("Unsupported C3B action", f"<p>action={html.escape(action or '(blank)')}</p>")


def notes_form(*, action: str, slide_id: str = "", content_item_id: str = "", heading: str, detail: str) -> str:
    hidden = ""
    if slide_id:
        hidden += f"<input type='hidden' name='slide_id' value='{html.escape(slide_id, quote=True)}'>"
    if content_item_id:
        hidden += (
            f"<input type='hidden' name='content_item_id' value='{html.escape(content_item_id, quote=True)}'>"
        )
    return _page(
        heading,
        (
            f"<p>{html.escape(detail)}</p>"
            "<form method='get'>"
            f"<input type='hidden' name='action' value='{html.escape(action, quote=True)}'>"
            f"{hidden}"
            "<p><textarea name='notes' rows='6' cols='60' placeholder='Reviewer notes'></textarea></p>"
            "<p><button type='submit'>Save notes</button></p>"
            "</form>"
        ),
    )
