from __future__ import annotations


def stale_render_formula(base_url: str) -> str:
    escaped = (base_url or "").replace("\\", "\\\\").replace('"', '\\"')
    return (
        'AND({Test_Run_ID}=BLANK(),AND({Render_Status}="Rendering",'
        '{Remotion_Job_ID}!="",{Remotion_Status_URL}!="",{Render_Server_URL}!="",'
        f'{{Final_File_URL}}="",OR(FIND("{escaped}",{{Remotion_Status_URL}})=0,'
        f'FIND("{escaped}",{{Render_Server_URL}})=0)))'
    )


def uses_obsolete_url(record_fields: dict, base_url: str) -> bool:
    status_url = str(record_fields.get("Remotion_Status_URL") or "")
    server_url = str(record_fields.get("Render_Server_URL") or "")
    current = (base_url or "").strip()
    if not current:
        return False
    return current not in status_url or current not in server_url
