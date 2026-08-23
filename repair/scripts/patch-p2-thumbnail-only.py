#!/usr/bin/env python3
"""Add a silent thumbnail-only route to P2 so AI grid covers generate without voiceover."""
import copy
import json
import os
import urllib.request
import urllib.error

SID = 5530955
THUMB_PROMPT = (
    "{{1.Thumbnail_Prompt}}\r\n\r\n"
    "IMPORTANT BRANDING RULE:\r\n"
    "Do not invent, draw, simulate, approximate, or generate any ChicagoShining logo or watermark in the image. "
    "Official branding/watermarking is handled downstream by production assets.\r\n\r\n"
    "CHICAGOSHINING THUMBNAIL TEXT STYLE:\r\n"
    "When the thumbnail includes text, use bold, high-impact block lettering. Preferred styles are:\r\n"
    "1) colorful 3D block lettering with bright, glossy, dimensional letters, or\r\n"
    "2) black-and-gold slightly arched block lettering with a premium ChicagoShining look.\r\n\r\n"
    "Text should be large, readable on mobile, visually dramatic, and placed near the center or slightly lower than center. "
    "Keep text inside safe margins and avoid the top and bottom 10% of the image.\r\n\r\n"
    "PRODUCTION-SAFE THUMBNAIL RULES:\r\n"
    "- Preserve the creative intent of the Thumbnail_Prompt.\r\n"
    "- Create a polished, high-contrast ChicagoShining social thumbnail / promo still.\r\n"
    "- Keep important subjects and any readable text inside safe margins.\r\n"
    "- Avoid placing key text in the top or bottom 10% of the image.\r\n"
    "- Do not include fake platform UI, fake logos, fake watermarks, cluttered microtext, or distorted lettering."
)


def get_json(url, headers, method="GET", body=None):
    data = None if body is None else json.dumps(body, separators=(",", ":")).encode()
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=180) as resp:
            raw = resp.read()
            return resp.status, json.loads(raw.decode() or "{}")
    except urllib.error.HTTPError as error:
        raise SystemExit(f"HTTP {error.code}: {error.read()[:1600]!r}")


def unwrap_blueprint(payload):
    return (
        payload.get("response", {}).get("blueprint")
        or payload.get("blueprint")
        or payload.get("response")
        or payload
    )


def find(mods, mid):
    for node in mods or []:
        if node.get("id") == mid:
            return node
        hit = find(node.get("flow"), mid) or find(node.get("onerror"), mid)
        if hit:
            return hit
        for route in node.get("routes") or []:
            hit = find(route.get("flow"), mid)
            if hit:
                return hit
    return None


def clone_module(src, new_id, mapper=None, filt=None, name=None):
    node = copy.deepcopy(src)
    node["id"] = new_id
    if mapper is not None:
        node["mapper"] = mapper
    if filt is not None:
        node["filter"] = filt
    if name:
        node.setdefault("metadata", {}).setdefault("designer", {})["name"] = name
    return node


def already_patched(flow):
    return bool(find(flow, 40) and find(flow, 41) and find(flow, 45))


def publish_blueprint(headers, base, bp):
    send = copy.deepcopy(bp)
    send.pop("scheduling", None)
    send.pop("interface", None)
    payload = {"blueprint": json.dumps(send, separators=(",", ":"))}
    status, _ = get_json(f"{base}/scenarios/{SID}?confirmed=true", headers, method="PATCH", body=payload)
    # PATCH can report isinvalid before connections finish. Start relinks the webhook scenario.
    try:
        get_json(f"{base}/scenarios/{SID}/start", headers, method="POST", body={})
    except SystemExit:
        pass
    _, meta = get_json(f"{base}/scenarios/{SID}", headers)
    live = meta.get("scenario") or (meta.get("response") or {}).get("scenario") or meta
    print("patch", status, "invalid", live.get("isinvalid"), "active", live.get("isActive"), "linked", live.get("islinked"), "name", live.get("name"))
    if live.get("isinvalid"):
        raise SystemExit("P2 became invalid after patch")
    return live


def patch_blueprint(bp):
    flow = bp.get("flow") or []
    if already_patched(flow):
        return bp, False
    ids = [node.get("id") for node in flow]
    if ids[:2] != [900, 1] or 10 not in ids:
        raise SystemExit(f"unexpected P2 flow ids: {ids}")
    voiceover_flow = flow[2:]
    module_10 = find(voiceover_flow, 10)
    if not module_10:
        raise SystemExit("P2 module 10 missing")
    module_10["filter"] = {
        "name": "Voiceover path - Content Item is Ready for Voiceover",
        "conditions": [[
            {"a": "{{1.id}}", "o": "exist"},
            {"a": "{{1.Content_Status}}", "b": "Ready for Voiceover", "o": "text:equal"},
        ]],
    }

    gen = find(flow, 5)
    upload = find(flow, 6)
    share = find(flow, 7)
    p3 = find(flow, 902)
    if not (gen and upload and share and p3):
        raise SystemExit("P2 thumbnail modules 5/6/7/902 missing")

    thumb_gen = clone_module(gen, 41, name="8C - Generate Thumbnail PNG Without Voiceover")
    thumb_gen["filter"] = {
        "name": "Thumbnail-only silent cover",
        "conditions": [[
            {"a": "{{1.id}}", "o": "exist"},
            {"a": "{{1.Thumbnail_Status}}", "b": "Ready", "o": "text:equal"},
            {"a": "{{1.Thumbnail_Prompt}}", "o": "exist"},
            {"a": "{{1.Thumbnail_URL}}", "o": "notexist"},
            {"a": "{{1.Include_Voiceover}}", "b": "No", "o": "text:equal"},
        ]],
    }
    thumb_gen["mapper"] = copy.deepcopy(gen.get("mapper") or {})
    thumb_gen["mapper"]["prompt"] = THUMB_PROMPT

    thumb_upload = clone_module(upload, 42, name="9C - Upload Silent Thumbnail to Drive")
    thumb_upload["mapper"] = copy.deepcopy(upload.get("mapper") or {})
    thumb_upload["mapper"]["data"] = "{{41.data[].fileData}}"
    thumb_upload.pop("filter", None)

    thumb_share = clone_module(share, 43, name="10C - Share Silent Thumbnail File")
    thumb_share["mapper"] = copy.deepcopy(share.get("mapper") or {})
    thumb_share["mapper"]["file"] = "{{42.id}}"
    thumb_share.pop("filter", None)

    thumb_recheck = {
        "id": 44,
        "filter": {
            "name": "Recheck silent thumbnail item before write-back",
            "conditions": [[
                {"a": "{{42.id}}", "o": "exist"},
                {"a": "{{43.shareLink}}", "o": "exist"},
            ]],
        },
        "mapper": {
            "base": "appe33zkZn35yirTL",
            "table": "tblwzN9AXWvmKVKPs",
            "formula": (
                "AND(\n"
                "  RECORD_ID() = '{{1.id}}',\n"
                "  {Thumbnail_Status} = \"Ready\",\n"
                "  {Thumbnail_Prompt} != BLANK(),\n"
                "  {Thumbnail_URL} = BLANK(),\n"
                "  {Thumbnail_Google_Drive_File_ID} = BLANK(),\n"
                "  OR({Include_Voiceover} = \"No\", {Voiceover_Status} = \"Not Needed\"),\n"
                "  NOT({Do_Not_Produce})\n"
                ")"
            ),
            "maxRecords": "1",
            "useColumnId": False,
        },
        "module": "airtable:ActionSearchRecords",
        "version": 3,
        "metadata": {"designer": {"x": 1815, "y": 420, "name": "11C - Recheck Silent Thumbnail Item"}},
        "parameters": copy.deepcopy((find(flow, 8) or {}).get("parameters") or {"__IMTCONN__": 9293192}),
    }
    thumb_update = {
        "id": 45,
        "filter": {
            "name": "Commit silent thumbnail only",
            "conditions": [[
                {"a": "{{44.id}}", "o": "exist"},
                {"a": "{{42.id}}", "o": "exist"},
                {"a": "{{43.shareLink}}", "o": "exist"},
            ]],
        },
        "mapper": {
            "id": "{{44.id}}",
            "base": "appe33zkZn35yirTL",
            "table": "tblwzN9AXWvmKVKPs",
            "record": {
                "Thumbnail_URL": "{{42.webContentLink}}",
                "Content_Status": "Thumbnail Ready",
                "Thumbnail_Status": "Generated",
                "Thumbnail_Google_Drive_File_ID": "{{42.id}}",
            },
            "typecast": True,
            "useColumnId": False,
        },
        "module": "airtable:ActionUpdateRecords",
        "version": 3,
        "metadata": {"designer": {"x": 2115, "y": 420, "name": "12C - Update Silent Thumbnail"}},
        "parameters": copy.deepcopy((find(flow, 9) or {}).get("parameters") or {"__IMTCONN__": 9293192}),
    }
    thumb_p3 = clone_module(p3, 46, name="13C - Trigger P3 After Silent Thumbnail")
    thumb_p3["mapper"] = copy.deepcopy(p3.get("mapper") or {})
    thumb_p3["mapper"]["jsonStringBodyContent"] = (
        '{"source":"P2 silent-thumbnail branch","target":"P3",'
        '"content_record_id":"{{45.id}}","test_run_id":"{{1.Test_Run_ID}}",'
        '"requested_at":"{{formatDate(now; \\"YYYY-MM-DDTHH:mm:ssZ\\"; \\"UTC\\")}}"}'
    )

    router = {
        "id": 40,
        "mapper": None,
        "module": "builtin:BasicRouter",
        "routes": [
            {"flow": voiceover_flow},
            {"flow": [thumb_gen, thumb_upload, thumb_share, thumb_recheck, thumb_update, thumb_p3]},
        ],
        "version": 1,
        "metadata": {"designer": {"x": 300, "y": -160, "name": "2 - Route Voiceover vs Silent Thumbnail"}},
        "parameters": {},
    }
    bp["flow"] = [flow[0], flow[1], router]
    notes = (((bp.get("metadata") or {}).get("notes")) or [])
    notes.append({
        "text": "v2.3 adds a silent thumbnail-only route so Include_Voiceover=No items still get a colorful 3D-lettering grid cover."
    })
    bp.setdefault("metadata", {})["notes"] = notes
    bp["name"] = "P2 - Voiceover and Thumbnail Generation - Daisy Chain v2.3 - Optional Voiceover"
    return bp, True


def main():
    token = os.environ["MAKE_TOKEN"].strip()
    base = os.environ["MAKE_BASE"].strip().rstrip("/")
    headers = {
        "Authorization": f"Token {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "User-Agent": "SM-Pipeline-V2-p2-thumb-only/1.0",
    }
    _, wrap = get_json(f"{base}/scenarios/{SID}/blueprint?draft=false", headers)
    bp = copy.deepcopy(unwrap_blueprint(wrap))
    patched, changed = patch_blueprint(bp)
    if changed:
        publish_blueprint(headers, base, patched)
    else:
        _, meta = get_json(f"{base}/scenarios/{SID}", headers)
        live = meta.get("scenario") or (meta.get("response") or {}).get("scenario") or meta
        print("already_patched", "invalid", live.get("isinvalid"), "active", live.get("isActive"), "linked", live.get("islinked"))
        if not live.get("isActive"):
            get_json(f"{base}/scenarios/{SID}/start", headers, method="POST", body={})
            print("started")
    _, wrap2 = get_json(f"{base}/scenarios/{SID}/blueprint?draft=false", headers)
    live_bp = unwrap_blueprint(wrap2)
    if not already_patched(live_bp.get("flow")):
        raise SystemExit("silent thumbnail modules missing after patch")
    _, meta2 = get_json(f"{base}/scenarios/{SID}", headers)
    live2 = meta2.get("scenario") or (meta2.get("response") or {}).get("scenario") or meta2
    print("verified_modules", 40, 41, 45, "invalid", live2.get("isinvalid"), "linked", live2.get("islinked"), "active", live2.get("isActive"))
    if live2.get("isinvalid"):
        raise SystemExit("P2 is invalid")


if __name__ == "__main__":
    main()
