# Vibe Cut Mode

Vibe Cut is a distinct Studio creation mode for turning one long source video into polished, music-driven 9:16 Reels / Shorts / TikToks. It is **not** Standard stills→Remotion, **not** Timed Script / VO Timeline, and **not** finished-video passthrough.

Music drives the timeline:

`Music → beat map → clip selection → trim points → visual effects`

There is no voiceover and no generated narration.

## Where it lives in Studio

Home wizard start choices:

- An idea…
- Photos…
- AI images…
- Mix…
- **Vibe Cut — long video → music montage**

Selecting Vibe Cut reveals only the controls for this workflow:

| Control | Options |
|---|---|
| Target length | 15 / 30 / 45 / custom / “Find me the best 30 seconds” |
| Style | Smooth Vibes · Beat Cut (default) · Fast Cuts |
| Energy | 1–5 |
| Chronology | Best moments (default) · Chronological |
| Versions | 1–3 proposed cuts |
| Beat sync | On (locked for this mode) |

Production is not lengthened. A thin banner shows the active Vibe Cut summary when the request is `ez-input=vibe-cut`. Downstream render, thumbnail, caption, approve, schedule, and publish stay on the existing pipeline.

## Notes stamp (no Airtable schema change)

```
origin=ez-wizard; ez-input=vibe-cut; ez-caption=ai; ez-package=video
[vibe-cut] {"schema_version":"vibe-cut.1","mode":"vibe_cut","style":"beat-cut","energy":3,"target_seconds":30,"chronology":"best-moments","beat_sync":"on","versions":1,...}
[render-settings] preset=energetic; transition=cut; beat_sync=on; ai_motion=on; pacing=normal; ...
```

Forced production defaults:

- `Master_Content_Type=Vertical Short Video`
- `Voiceover_Mode=No`
- `Background_Music_Mode=Yes`
- `Thumbnail_Mode=Yes`
- Beat sync on

## Editing styles

| Style | Feel |
|---|---|
| **Smooth Vibes** | Longer clips (≈2.4–4.2s), gentle cuts, slower music energy, limited effects. Skyline / beach / architecture. |
| **Beat Cut** | Default. Strong beats drive scene changes. Energetic city montage without looking hyperactive. |
| **Fast Cuts** | Very short moments (≈0.45–1.6s), aggressive beat sync, occasional speed ramps. |

Energy 1–5 shortens preferred clip length and raises effect chances. Clip duration still responds to footage motion: calm river holds 3–4s; high-energy downtown can cut every 0.5–1.5s.

## Multiple cuts + unused footage

`POST /api/vibe-cut/plan` proposes 1–N versions from the same source. Later versions prefer unused ranges.

`POST /api/vibe-cut/another` builds one more cut from unused footage (and can favor a different portion of the song when the beat map is supplied).

UI actions intended per proposal: **Keep**, **Regenerate**, **Create Another Cut from Unused Footage**.

## Processing stages

| Stage | What Studio does |
|---|---|
| Analyze source | Scene changes (ffmpeg), camera movement, people/landmarks, blur, duplicates, dead time |
| Score moments | Composition, movement, subjects, clean footage, reveals/pans |
| Create selects | ~10–25 candidate segments from the long source |
| Analyze music | Timing Engine beats / strengths / sections |
| Build edit | Trim so visual cuts land on musical beats; save a hero shot for the drop |
| Motion treatment | Optional speed ramps, punch-ins, stabilize/reframe when the source is static |
| Format | Auto 9:16 reframe keeping the subject visible |
| Finish | Beat ending, music mix, thumbnail, platform captions/hashtags |

Hard cuts on beats are preferred over artificial transition packs. AI-direct motion is auto-assigned: strong camera motion → leave alone; static → subtle crop/speed.

## APIs

- `POST /api/vibe-cut/plan` — body may include `config`, `selects` **or** `scene_seconds` + `source_duration_seconds`, `beats`, `beat_strengths`, `sections`
- `POST /api/vibe-cut/another` — same inputs plus `used_ranges`

Pure helpers live in `apps/studio-api/vibe-cut.mjs`. Browser helpers in `apps/studio-web/assets/vibe-cut.js`.

## Pipeline follow-through

Scene detection already exists in `services/frame-extractor` and `services/pipeline-runner/t1/scenes.py`. Music analysis is Timing Engine `POST /timeline`. Remotion still renders the final vertical short; T1 should honor `beat_sync=on` and the `[vibe-cut]` clip plan instead of narration duration.

Full source analysis (landmark/people scoring, blur/dead-time filters) can deepen over time without changing the Studio creation surface.
