# Quality check: Studio Review must play the rendered MP4

**For the quality / regression agent.** This is a playback bug, not a new feature.

Lincoln Park Zoo (2026-09-07) already had Drive MP4s. Joseph opened the Drive link and the clip looked right. Studio Review showed the **cover PNG** instead — “Open rendered file” opened the still, and the player fell back to the same thumbnail.

## What went wrong

1. `mapOutput` / `mapPhase6CreativeOutput` stuffed `studio_preview_url` with the cover JPEG/PNG when `Studio_Preview_URL` was blank, even if `Final_File_ID` pointed at an MP4.
2. Review used `studio_preview_url` first for **Open rendered file**, so the cover won over the Drive file.
3. When `/api/outputs/:id/preview` failed on a ~100MB Drive file, the player called `showCoverStill()` instead of the Drive embed.
4. A leftover `Render_Status=Rendering` after the file was already uploaded treated the row as an in-flight mix and covered the player.

Stories with R2 `current.mp4` looked fine. Mains that only had a Drive final did not.

## Check to add and keep

Run `node --test apps/studio-web/item4-review-preview.test.mjs` (also part of `npm test`).

Contract, fixture = Lincoln Park Zoo IG Reel shape:

| Signal | Must be |
|---|---|
| `Final_File_ID` or Drive `Final_File_URL` present | `preview_kind` = **video**, never **still** |
| `studio_preview_url` mapped for the API | **null** or the R2 MP4 — never `cover-9x16.png` |
| Open rendered file | Drive / R2 MP4 URL, never the cover |
| Preview player fallback | **Drive embed**, not the cover still |
| `Render_Status=Rendering` but a final file exists | not an in-flight mix (no Processing overlay) |

Native photo posts (no `Final_File_ID`) still use the cover still.

## Live Review pass (quality agent)

On any Remotion Reel / Short / TikTok / Story that already has a Drive MP4:

1. Open Review. The player must show **video**, not the 3D cover twice.
2. **Open rendered file** must open the MP4 (Drive or `current.mp4`), not `cover-9x16.png`.
3. Cover remains the **poster / Download cover** link only.

Fixture: [Lincoln Park Zoo](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recN5gK7L7ToiF7Uw) outputs 370–375.

Same-day follow-up: three extra autonomous zoo harvests on this fixture were occupancy bugs, not Review playback. See `docs/handoffs/autonomous-same-topic-harvest.md`. Do not recreate those extras.

Do not Approve those rows unless Joseph says so.
