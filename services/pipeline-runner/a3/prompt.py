"""A3 classification prompts — Make 5569035 modules 14/17/21/31."""

from __future__ import annotations

from typing import Any

from render.fields import field, field_str

JSON_SHAPE = """{
  "Media_Class": "",
  "Asset_Role": "",
  "Raw_Source_Eligibility": "",
  "Exclusion_Reasons": [],
  "Topic": "",
  "Subtopic": "",
  "Location": "",
  "Orientation": "",
  "Aspect_Ratio": "",
  "Visible_Subjects": [],
  "Mood": "",
  "Weather": "",
  "Season": "",
  "Time_Of_Day": "",
  "Shot_Type": "",
  "Movement": "",
  "AI_Tags": [],
  "Search_Keywords": [],
  "Asset_Description": "",
  "Quality_Score": 0,
  "Usefulness_Score": 0,
  "Metadata_Used": true,
  "Frame_Images_Used": false,
  "Frames_Analyzed_Count": 0,
  "Evidence_From_Metadata": "",
  "Evidence_From_Frames": "",
  "Visual_Details_Not_In_Metadata": "",
  "Classification_Status": "Classified"
}"""

ALLOWED_VALUES = """
Allowed values:
Media_Class: Video, Image, Audio, Graphic, Document, Other
Asset_Role: Raw Footage, Raw Photo, Music, Voiceover, Watermark, Logo, Thumbnail, Final Output, Reference Material, Other
Raw_Source_Eligibility: Eligible, Ineligible, Needs Review, Not Applicable
Exclusion_Reasons: Burned-in Text/Captions, Assembled Edit, Watermarked/Branded, Duplicate, Low Quality, Rights/Permission, Missing/Deleted, Wrong Subject, Other
Orientation: Portrait, Landscape, Square, Unknown
Aspect_Ratio: 9:16, 16:9, 4:5, 1:1, 3:2, Unknown
Shot_Type: Wide, Medium, Close-up, Detail, Aerial, POV, Timelapse, Establishing, Unknown
Movement: Static, Pan, Tilt, Push In, Pull Back, Walkthrough, Drone Flyover, Handheld, Unknown
Mood: Bright, Dramatic, Calm, Energetic, Historic, Urban, Luxury, Touristy, Unknown
Weather: Sunny, Cloudy, Rainy, Snowy, Foggy, Night, Indoor, Unknown
Season: Spring, Summer, Fall, Winter, Unknown
Time_Of_Day: Sunrise, Morning, Midday, Afternoon, Golden Hour, Sunset, Night, Unknown
""".strip()

A3_POLICY = """
A3 POLICY PURPOSE
A3 is a descriptive classifier plus an OBJECTIVE safety/availability gate.
A3 must NOT act as the final creative/relevance gate. R2 owns semantic relevance,
creative suitability, and Advisory/Strict selection decisions.

OBJECTIVE HARD-BLOCKER POLICY
Use Raw_Source_Eligibility=Ineligible only for an objective blocker such as:
- Do_Not_Use is true.
- The file is missing/deleted, inaccessible, corrupt, unplayable, or technically unusable.
- Rights_Status clearly requires permission or denies use.
- A known duplicate should not be used.
- Quality is so severely degraded that the footage is technically unusable.
- The asset is unmistakably a Final Output with no reasonable source-media use.

Use Raw_Source_Eligibility=Needs Review when:
- rights are Unknown or evidence about an objective blocker is genuinely insufficient; or
- the file/frames cannot be evaluated well enough to establish basic technical usability.

Otherwise use Raw_Source_Eligibility=Eligible.

NONBLOCKING ADVISORY CONDITIONS
The following conditions may be recorded in Exclusion_Reasons and descriptive evidence,
but they DO NOT by themselves make reusable footage Ineligible:
- Assembled Edit / montage / multiple scenes / multiple camera angles.
- Watermarked/Branded.
- Burned-in Text/Captions when the footage remains usable.
- Wrong Subject. Subject relevance belongs to R2, not A3.
- Minor or moderate Low Quality that is still technically usable.
- Imperfect framing/cropping.
- Small speaker, mute, play, transport, or other player/UI icons.
- Other cosmetic or creative imperfections that do not prevent reuse.

RIGHTS RULE
- Owned, Licensed, or Public Domain supports eligibility when no other objective blocker exists.
- Permission Needed => Ineligible + Rights/Permission.
- Unknown => Needs Review + Rights/Permission unless other metadata establishes permitted use.
""".strip()


def metadata_block(record: dict[str, Any], *, extra: bool = False) -> str:
    fields = [
        f"Asset Record ID: {record.get('id') or ''}",
        f"Asset Name: {field_str(record, 'Asset Name')}",
        f"Current Media Class: {field_str(record, 'Media_Class')}",
        f"Current Asset Role: {field_str(record, 'Asset_Role')}",
        f"Current Raw Source Eligibility: {field_str(record, 'Raw_Source_Eligibility')}",
        f"Capture Source: {field_str(record, 'Capture_Source')}",
        f"Drive Access Status: {field_str(record, 'Drive_Access_Status')}",
        f"Rights Status: {field_str(record, 'Rights_Status')}",
        f"MIME Type: {field_str(record, 'MIME_Type')}",
        f"File Extension: {field_str(record, 'File_Extension')}",
        f"File Size Bytes: {field(record, 'File_Size_Bytes')}",
        f"File Size MB: {field(record, 'File_Size_MB')}",
        f"Google Drive File ID: {field_str(record, 'Google Drive File ID')}",
        f"Google Drive URL: {field_str(record, 'Google Drive URL')}",
        f"Intake Batch ID: {field_str(record, 'Intake_Batch_ID')}",
    ]
    if extra:
        fields.extend(
            [
                f"Asset Status: {field_str(record, 'Asset_Status')}",
                f"Active: {field(record, 'Active')}",
                f"Do_Not_Use: {field(record, 'Do_Not_Use')}",
            ]
        )
    return "\n".join(fields)


def audio_prompt(record: dict[str, Any]) -> str:
    return f"""Classify one ChicagoShining audio asset using metadata only.

You cannot hear the file. Do not invent instruments, voices, lyrics, tempo, genre,
mood, or quality unless clearly present in the filename or metadata.

Required classification:
- Media_Class must be Audio.
- Asset_Role must be Voiceover when filename or metadata indicates generated speech, narration, spoken commentary, text-to-speech, or a named voice export.
- Treat these filename indicators as strong Voiceover evidence: voiceover, voice-over, narration, narrator, spoken, speech, text-to-speech, tts, ElevenLabs, or a filename containing a named voice plus terms such as English Female Voice, English Male Voice, Soft Accent, or pvc.
- Asset_Role must be Music only when filename or metadata indicates music, background music, instrumental, song, soundtrack, score, beat, loop, or track.
- If neither Voiceover nor Music is supported by metadata, use Other. Never default uncertain audio to Music.
- Example: ElevenLabs_2026-07-22T05_16_05_Kate - English Female Voice With Soft Accent_pvc_sp107_s39_sb80_se8_b_m2.mp3 must be Voiceover.
- Raw_Source_Eligibility must be Not Applicable.
- Exclusion_Reasons should normally be [] unless metadata clearly proves a listed issue.
- Set Orientation, Aspect_Ratio, Shot_Type, Movement, Weather, Season, and Time_Of_Day to Unknown.
- Set Metadata_Used=true, Frame_Images_Used=false, Frames_Analyzed_Count=0.
- Evidence_From_Frames must say no visual evidence was used because this is audio.
- Visual_Details_Not_In_Metadata must say not applicable for audio.

{ALLOWED_VALUES}

Do not invent option values. Exclusion_Reasons must be an array using only the listed
values. Use [] when no exclusion reason applies.

Asset metadata:
{metadata_block(record)}

Return only valid JSON with exactly this object shape:
{JSON_SHAPE}
"""


def video_frames_prompt(record: dict[str, Any], *, frames_analyzed: int, unique_frames: list[str], frames: list[str]) -> str:
    unique_text = "\n".join(unique_frames) if unique_frames else "(none)"
    slot_text = "\n".join(frames) if frames else "(none)"
    return f"""Classify one ChicagoShining video asset for an Airtable source-media library.
Analyze all supplied representative frames as coming from the same video.

{A3_POLICY}

Use metadata and visual frame evidence. Visual evidence controls orientation, aspect
ratio, visible subjects, visual conditions, and descriptive warning flags.

Required classification:
- Media_Class must be Video.
- Prefer Asset_Role=Raw Footage when the video contains footage that can reasonably
  be reused as source material, even when the source is multi-shot, a montage, contains
  multiple compositions/angles, has minor embedded branding/watermarks, contains minor
  burned-in text, has imperfect framing, or includes non-destructive UI/player artifacts.
- A montage, multiple scenes, multiple camera angles, or an assembled edit ALONE is
  NOT enough to classify the asset as Final Output.
- Asset_Role=Final Output only when the evidence clearly shows an unmistakable finished
  deliverable intended as the final published/rendered product rather than reusable source
  footage.
- Drone/aerial is represented by Capture_Source, Shot_Type, and Movement—not a
  separate media class.

PLAYER/UI ARTIFACT RULE
Do not treat a small speaker/mute/play/transport/player icon as embedded branding or
a hard defect merely because it appears in a representative frame.

Frame rules:
- Frames_Analyzed_Count must equal {frames_analyzed}.
- Metadata_Used reflects metadata use.
- Frame_Images_Used must be true.
- Vertical frames: Orientation=Portrait and Aspect_Ratio=9:16.
- Horizontal frames: Orientation=Landscape and Aspect_Ratio=16:9.
- Visual evidence wins when metadata conflicts.

{ALLOWED_VALUES}

Asset metadata:
{metadata_block(record, extra=True)}

Frame extractor response:
Frames analyzed: {frames_analyzed}
Unique frame URLs:
{unique_text}
Frame slots supplied:
{slot_text}

Return only valid JSON with exactly this object shape:
{JSON_SHAPE}
"""


def video_metadata_prompt(record: dict[str, Any], *, extractor_payload: Any) -> str:
    return f"""Classify one ChicagoShining video asset using metadata only because
representative frames were unavailable.

Do not claim to see or hear the video. Do not invent visual details.

{A3_POLICY}

Required classification:
- Media_Class must be Video.
- Prefer Asset_Role=Raw Footage unless metadata clearly proves the file is an
  unmistakable finished final deliverable rather than reusable source footage.
- Filename/metadata terms such as montage, compilation, multi-shot, edited, branded,
  or watermarked ALONE do not automatically make the asset Final Output.
- Set Metadata_Used=true, Frame_Images_Used=false, Frames_Analyzed_Count=0.
- Evidence_From_Frames must state no frame evidence was available.
- Visual_Details_Not_In_Metadata must identify visual cleanliness as unverified, not
  invent visual defects.

{ALLOWED_VALUES}

Asset metadata:
{metadata_block(record, extra=True)}

Frame extractor response, if any:
{extractor_payload}

Return only valid JSON with exactly this object shape:
{JSON_SHAPE}
"""


def image_prompt(record: dict[str, Any], *, image_metadata: Any) -> str:
    return f"""Classify one ChicagoShining image, photo, logo, watermark, thumbnail,
graphic, or reference image using metadata and the supplied image.

{A3_POLICY}

Required classification:
- Media_Class=Image for ordinary photographic images.
- Media_Class=Graphic for logos, watermarks, illustrations, designed graphics,
  thumbnails, and unmistakable finished social graphics.
- Asset_Role=Raw Photo for a photographic image that can reasonably be reused as source
  media, even when it has minor branding/watermark, minor text, imperfect framing, or
  ordinary quality limitations.
- Asset_Role=Watermark for a watermark asset.
- Asset_Role=Logo for a logo/brand mark.
- Asset_Role=Thumbnail for a thumbnail or cover asset.
- Asset_Role=Final Output only for an unmistakable finished designed/exported post rather
  than a reusable photograph.
- Asset_Role=Reference Material for archival/reference material not intended as raw media.
For Watermark, Logo, Thumbnail, Final Output, Reference Material, and Other use
Raw_Source_Eligibility=Not Applicable unless an objective status problem requires
Needs Review/Ineligible for operational reasons.
Set Metadata_Used=true when metadata influenced the result.
Set Frame_Images_Used=true and Frames_Analyzed_Count=1.

{ALLOWED_VALUES}

Asset metadata:
{metadata_block(record, extra=True)}

Image metadata response:
{image_metadata}

Return only valid JSON with exactly this object shape:
{JSON_SHAPE}
"""
