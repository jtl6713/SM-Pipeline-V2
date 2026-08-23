"""Reset the "6 go to things to do" video so the themed AI slot path rebuilds it.

The three AI slots were generated from a prompt that only had the production
request ID to work from, so they came back as generic river shots with no caption
and the narration named only the creator's three photos. Dropping the AI slides
and their masters puts the request back to three photos, which makes the Worker
re-seed through SAI1: themed prompt per slot, an on-photo caption, and one
narration covering all six.
"""

import json
import os
import urllib.parse
import urllib.request

PAT = os.environ["AIRTABLE_PAT"]
BASE = "appe33zkZn35yirTL"
HEADERS = {"Authorization": f"Bearer {PAT}", "Content-Type": "application/json"}

REQUEST = "recii0mzjlA2etf7k"
CONTENT = "recHf7i7NE06UeOyp"
PR_TABLE = "tbl75nxNi6PMUjBQE"
CONTENT_TABLE = "tblwzN9AXWvmKVKPs"
SLIDES = "tblcnQDBvUngpjDED"
OUTPUTS = "tblrlPeboBthkplH0"

OUTPUT_IDS = [
    "recRy7MGA2unM7boq",  # 219 Instagram Reel
    "recEEWqB9zlHbQZzg",  # 220 Instagram Story
    "recSQPqR6v3KcpVrv",  # 221 Facebook Story
    "recC76ADiTH73tTjr",  # 222 Facebook Reel
    "recn2VzjlAewErzpc",  # 223 TikTok Video
]


def api(path, method="GET", payload=None, params=None):
    url = f"https://api.airtable.com/v0/{BASE}/{path}"
    if params:
        url += "?" + urllib.parse.urlencode(params)
    data = json.dumps(payload).encode() if payload else None
    req = urllib.request.Request(url, data=data, headers=HEADERS, method=method)
    with urllib.request.urlopen(req) as resp:
        return json.load(resp)


def main():
    pr = api(f"{PR_TABLE}/{REQUEST}")["fields"]
    assets = json.loads(pr.get("Studio_Master_Assets_JSON") or "[]")
    manual = [a for a in assets if a.get("source") != "studio_ai"]
    ai = [a for a in assets if a.get("source") == "studio_ai"]
    print(f"manual assets kept: {len(manual)}   ai assets dropped: {len(ai)}")

    for asset in ai:
        slide_id = str(asset.get("carousel_slide_id") or "").strip()
        if not slide_id:
            continue
        api(
            f"{SLIDES}/{slide_id}",
            method="PATCH",
            payload={
                "fields": {
                    "Deleted From Carousel": True,
                    "AI Prompt": "",
                    "Content Item": [],
                },
                "typecast": True,
            },
        )
        print(f"  retired slide {slide_id}")

    api(
        f"{CONTENT_TABLE}/{CONTENT}",
        method="PATCH",
        payload={"fields": {"Carousel Slides": []}, "typecast": True},
    )

    for index, asset in enumerate(manual, start=1):
        asset["order"] = index
    api(
        f"{PR_TABLE}/{REQUEST}",
        method="PATCH",
        payload={
            "fields": {
                "Studio_Master_Assets_JSON": json.dumps(manual),
                "Studio_Master_Asset_Count": len(manual),
                "Studio_Variant_Status": "None",
                "Studio_Variant_Manifest_JSON": None,
                "Studio_Variant_Error": None,
                "Studio_Item4_State": "Assets Ready",
            },
            "typecast": True,
        },
    )
    print("request reset to manual photos only")

    # Clear the spoken voiceover so the themed narration is written and re-spoken.
    api(
        f"{CONTENT_TABLE}/{CONTENT}",
        method="PATCH",
        payload={
            "fields": {
                "Voiceover_Script": None,
                "Voiceover_URL": None,
                "Voiceover_Google_Drive_File_ID": None,
                "Voiceover_Status": "Ready",
                "Script_Status": "Ready",
                "Content_Status": "Ready for Voiceover",
            },
            "typecast": True,
        },
    )
    print("voiceover cleared for regeneration")

    for record_id in OUTPUT_IDS:
        api(
            f"{OUTPUTS}/{record_id}",
            method="PATCH",
            payload={
                "fields": {
                    "Output_Status": "In Production",
                    "Render_Status": None,
                    "Remotion_Job_ID": None,
                    "Remotion_Error_Message": None,
                    "Final_File_Error_Message": None,
                    "Final_File_URL": None,
                    "Selected_Assets_JSON": None,
                    "Render_Clip_List_JSON": None,
                    "Review_Status": None,
                },
                "typecast": True,
            },
        )
        print(f"  output {record_id} reset")

    print("done - Worker continuation will now re-theme, re-image and re-render")


if __name__ == "__main__":
    main()
