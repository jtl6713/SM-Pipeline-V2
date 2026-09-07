# Quality check: do not harvest a second autonomous idea on an occupied place

**For the quality / regression agent.** This is a recurrence watch, not a new feature.

On 2026-09-07 the Chicago 4pm autonomous window created **three** `origin=autonomous` Lincoln Park Zoo packages in one afternoon, on top of a **manual** zoo piece from earlier the same day. Pipeline looked like four zoo stories. Joseph asked to stop same-topic harvest, then deleted the three autonomous dupes. Keep the manual piece.

Fix: [PR 187](https://github.com/jtl6713/sm-pipeline-v2/pull/187). Live extras are already gone. Do not recreate them. Do not delete Worth the trip.

Related Review playback handoff: `docs/handoffs/studio-review-plays-rendered-mp4.md` (same fixture CI).

## What happened

Four zoo titles on 2026-09-07:

| Title | Origin | Idea | Keep? |
|---|---|---|---|
| Lincoln Park Zoo - Worth the trip? | manual | `recEMuJACqAnqsRPu` | **Yes** — [content item `recN5gK7L7ToiF7Uw`](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recN5gK7L7ToiF7Uw) (outputs 370–375) |
| Free Zoo Escape | autonomous | `recdGHU0uHq3ktPje` | Deleted |
| Lincoln Park Zoo Stroll: Birds to Rhinos | autonomous | `recPy3fzh3rdnsVta` | Deleted |
| Lincoln Park Zoo: Quick Stroll | autonomous | `recFDCznRGtj50Do8` | Deleted |

The three autonomous ideas were stamped in one Chicago 4pm window (~21:05, 21:31, 21:55 UTC). Occupancy should have treated the first zoo title (manual **or** autonomous) as blocking the rest.

## What caused it

1. **Occupied-topic harvest sorted Idea Candidates by `Created_At`.** That table’s created-time field is **`Create_Date`**. Airtable failed the sorted list; `.catch(() => [])` swallowed it; occupancy was empty except published titles.
2. Occupancy only counted `Generated` / `Promoted`, so **`Approved` / `Sent for Review`** in-flight ideas were invisible.
3. Token matching dropped words **&lt; 4 chars** (`zoo`) and required **2 shared tokens**, so `Free Zoo Escape` did not collide with `Lincoln Park Zoo: Quick Stroll`.
4. Unused library stills were filtered only by **media asset IDs**, not location/landmark, so more zoo photos were offered to the picker.
5. After a successful pick, a later produce **`status=skipped`** released the AM/PM slot (`autonomousSlotAlreadyClaimed`), so the same window harvested again.
6. `worker.js` had duplicated occupancy helpers instead of importing `apps/studio-api/autonomous-produce.mjs`.

## What already auto-corrects (Worker)

After PR 187 is on production Worker:

- Harvest sorts ideas by `Create_Date`, with an unsorted fallback if that field name is wrong again.
- Occupied statuses include Generated, Approved, Sent for Review, Promoted.
- Same named place (`AUTONOMOUS_LANDMARKS` + `IDEA_LIBRARY_NAMED_PLACES`) or same `Primary_Location` (other than `chicago`) is a conflict. Zoo stills for an occupied zoo are not offered.
- A skipped produce **with an `idea_id`** still claims the AM/PM slot unless `status=reset`.

Run `node --test apps/studio-api/autonomous-produce.test.mjs apps/studio-api/desk-inventory.test.mjs`.

## Watch (every desk / quality tick)

Read `GET /api/ops/desk/inventory` (or Airtable if Studio Access is down). Look for:

| Signal | Kind | Meaning |
|---|---|---|
| Two or more recent packages share `lincoln park zoo` / another landmark, and at least one extra is `origin=autonomous` | `autonomous_topic_collision` | Same-place harvest leaked again |
| Idea Candidates `origin=autonomous` with the same `Primary_Location` or title place inside ~14 days | same | Occupancy empty or slot leak |
| YouTube, Approved for Publishing, Publish Failed, `YouTube_Stage=YT1`, no `YouTube_Video_ID`, Drive `Final_File_URL`, empty/non-CDN `Publish_Asset_URL` | `youtube_private_source_fail` | Output 375-class stuck upload |

Airtable (base `appe33zkZn35yirTL`):

- Ideas `tblTQapddqD47GOIG` — `Production_Config_Notes` contains `origin=autonomous`, sort `Create_Date` desc
- Production Requests `tbl75nxNi6PMUjBQE` — `Production_Notes` contains `origin=autonomous`
- Platform Outputs `tblrlPeboBthkplH0` — YouTube Failed / YT1 / blank video id

Keep row for the 2026-09-07 zoo fixture: [Lincoln Park Zoo - Worth the trip?](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recN5gK7L7ToiF7Uw).

## Auto-correct later

### A. Same-place autonomous extras

1. Confirm Worker occupancy still skips the pick (`autonomousIdeaConflictsOccupied`). If a new autonomous idea was created anyway, occupancy or the slot claim regressed — open a `cursor/desk-topic-collision` PR, do not harvest another idea to “replace” it.
2. **Keep** any manual / non-autonomous package on that place (Worth the trip pattern). **Keep** library stills and the shared crop folder.
3. For **unpublished** `origin=autonomous` extras (idea still Generated/Approved/Sent for Review, or PR Draft/Ready/Submitted, no Published outputs): ticket `desk_incident` fingerprint `autonomous_topic_collision:<place>:same_place`. In `observe`, stop after the ticket. If Desk_Mode allows Airtable data repair, **Cancel** those extra PRs (`Request_Status=Cancelled`) and do not enqueue produce. Do not trash Drive masters that other packages still use.
4. For extras that already have **Published** outputs: ticket only. Do not delete live posts.
5. Do not harvest a new autonomous idea while any `origin=autonomous` PR is Draft, Ready, or Submitted.

### B. YouTube Failed at YT1 with a private Drive MP4 (Output 375 class)

Fixture that already failed this way: Platform Output `recRxp28DYcT9SEMW` (Output 375, Worth the trip YouTube Short).

Cause: upload used Drive `Final_File_URL`. Graph/YouTube cannot fetch `uc?id=` / `webContentLink`. Heal used to match only `YouTube_Stage=Terminal Error` plus `source download failed 401` / `YTS1_UPLOAD`, so a YT1 + Failed + Drive-final row sat at 0% forever. Reconcile also skips `Publish_Status=Failed`.

Auto-correct (Worker heal `studioHealFailedYoutubeSourceDownloads` / desk leaves `class=transient` to cron):

1. Stage a short-lived public MP4 onto `https://media.chicagoshining.com/publish/` or `studio/previews/` (AP0). Drive stays DAM. Do not `STUDIO_MEDIA.put` a permanent original.
2. `studioResetYoutubeUploadForRetry`, then pulse **YTP1**.
3. After processing, YouTube Shorts **`thumbnails.set`** with the public 3D cover. Do **not** send `thumb_offset` (offset wins and shows a video frame).
4. Do not Approve or publish library-stills autonomous work. 375 was already Approved for Publishing (human gate already passed). Leave siblings 370–374 unless Joseph names them.

If heal still ignores YT1/Failed, that is a `code_bug`: widen the scan the same way as Terminal Error, then re-run tests.

## Do not

- Approve Worth the trip outputs unless Joseph says so.
- Recreate Free Zoo Escape / Birds to Rhinos / Quick Stroll.
- Treat a missing IG Reel cover as “thumbnail not needed.” Native grid cover rules still apply.
- Persist zoo photos on R2.
