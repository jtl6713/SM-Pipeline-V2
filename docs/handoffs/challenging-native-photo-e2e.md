# Challenging native-photo E2E — handoff for a new Agent chat

Paste this file into a **new** Agent chat as the first message (or `@` this path). Do not continue the 227/244 thread as the test operator. That chat proved Instagram carousel + Graph single-image *dispatch*. These scripts test the gaps.

**Date context:** Monday 24 Aug 2026. Production Studio Worker `0.10.128-native-still-handoff`. Pages UI `0.6.126`. Cadence parked (`PRODUCTION_CADENCE_PARKED` is a Worker constant, currently `true`). Base `appe33zkZn35yirTL`. Make team `2410882`. Studio: `https://studio.chicagoshining.com`.

Prior live proofs (do not reuse, do not re-Approve):

| Output | What it proved | Do not |
| --- | --- | --- |
| [244](https://www.instagram.com/p/DcaM78dj92H/) | IG carousel, lettered slides, Graph caption | Re-seed rainy CI 89 |
| [227](https://airtable.com/appe33zkZn35yirTL/tblrlPeboBthkplH0/rec6Wk2Sel4frhWSm) | IG Single Image Graph path, caption *under* the post | Post the 3D cover as the body again |
| 224–226, 228, 245, 246 | Leftovers / never-live FB+TT | Approve unless Joseph names that ID |

227 posted `90_thumb.png` (1024×1024 3D cover) because Instagram Single Image cannot use a separate grid tile **and** because Approve handoff / Graph `image_url` preferred the cover CDN. Joseph confirmed the Graph caption was on the post. Studio “Rendering mix” after Approve was a false Remotion handoff (fixed in 0.10.128 / UI 0.6.126).

Graph `image_url` must be `https://media.chicagoshining.com/studio/previews/...`. Drive URLs 404 Graph. `STUDIO_MEDIA` keys under `publish/` are **not** on that custom domain. Studio isolate PUT to the R2 upload worker (`chicagoshining-r2-upload.joseph-t-logan.workers.dev`) has hit Cloudflare 1010/404; a laptop Python PUT with `User-Agent: chicagoshining-studio-api/publish-dispatch` worked for 227. **For Case A, a laptop PUT is a fail**, not a workaround.

---

## 0. Operator contract (read before TC0)

You run the **autonomous Studio path**: one front door (GH scenario seed or Studio API via the E2E bridge), then Worker cron. Joseph is pulled in only at **Approve for live publish**.

**Forbidden:** browser click-through as the test method; Make `scenarios_run` / webhook POSTs as a cron substitute; Worker repair endpoints as a cron substitute; Airtable PATCH of `Output_Status`, `Render_Status`, `Review_Status`, `Publish_Status`; stamping `Test_Run_ID`; leaving MAKE-ADMIN-BRIDGE `5893243` running; turning on AP-CAR-ORCH `5791537` or FB-ORCH `5813561`; mapping IG Single Image to AP1-IG; Approving leftover IDs above unless Joseph names that ID; laptop PUT of the Graph JPEG as the happy path.

**Allowed:** `e2e-studio-scenario-seed.yml` / `e2e-studio-native-photo-seed.yml`; `e2e-studio-api-control.yml` for `/api/outputs/rec…/creative` GET/POST (including `/creative/review`); Airtable MCP; Make MCP **read** (`scenarios_get`, `executions_list`); Worker logs; smallest Worker/Pages fix so the **next cron tick** would move the row; Studio Approve via the E2E bridge **only after Joseph names the Output_ID**.

---

## How to perform the tests (tools and loops)

### IDs you will use constantly

| Thing | ID |
| --- | --- |
| Base | `appe33zkZn35yirTL` |
| Ideas | `tblTQapddqD47GOIG` |
| Production Requests | `tbl75nxNi6PMUjBQE` |
| Content Items | `tblwzN9AXWvmKVKPs` |
| Platform Outputs | `tblrlPeboBthkplH0` |
| Pipeline Settings | `tblpHPWeEkyJaF7ql` |
| P2 (thumbnails) | Make `5530955` |
| FB0 chain (optional later) | `5813436` → `5813463` → `5813487` → `5813511` → `5813534`. Pulse setting `FB0_WEBHOOK_URL` only |
| AP0C (IG carousel, Approve-armed) | Do not webhook-run it. Studio Approve starts it |

Airtable: `search_bases` is unnecessary; use the IDs above. `list_records_for_table` with `recordIds` or sort `Output_ID` desc. `get_table_schema` before filtering singleSelects.

Make: `scenarios_get` with `scenarioId` 5530955. Check `isinvalid`, `islinked`, `isActive`. Do **not** `scenarios_run`.

### How a seed actually happens

The GH seed workflow spins a **one-time Workers service bridge** that calls production Studio API as `joseph.t.logan@gmail.com`. It does **not** Approve. It stops after Promote. Cron does the rest.

**You must commit the scenario onto the branch you dispatch**, because checkout uses that ref.

1. Add both keys from section 5 into `deploy/e2e-studio-scenarios.json` (valid JSON, unique titles).
2. Add `cu-still-body` and `cu-cover-first` to the `options:` list in **both**:
   - `.github/workflows/e2e-studio-scenario-seed.yml`
   - `.github/workflows/e2e-studio-native-photo-seed.yml`
3. HEAD each Commons URL (`curl -sI`). If HTML/404, replace with another Chicago still. Do not reuse 227 Cloud Gate or 244 rainy files.
4. Commit, push the **current production-capable branch** (today: `cursor/asset-chain-python` has Worker 0.10.128; do not dispatch seed from a branch whose `worker.js` is AP0-only unless that Worker is live).
5. Dispatch **one** scenario:

```powershell
gh workflow run e2e-studio-native-photo-seed.yml --ref <branch> -f scenario_id=cu-still-body
gh run list --workflow=e2e-studio-native-photo-seed.yml --limit 1
```

Prefer `e2e-studio-native-photo-seed.yml` (35m timeout, waits variants). Watch the run until it prints `idea_id`, `production_request_id`, `content_item_record_id`, `test_run_id` (must be empty/null).

6. If the Commons download is too small or HTML, the seed fails in GH. Fix the URL, push, re-dispatch. Do not upload from your laptop into Airtable as a substitute unless seed auth is broken — then stop and ping Joseph.

**Resume:** if the same `title` already exists unpromoted, the seed script **reuses** that idea. After a failed promote, either finish that PR in Studio API or use a **new title**.

### How you watch cron (do not pulse)

Worker `scheduled` is about every **two minutes**. After Promote:

1. Wait 8 minutes (four ticks) before declaring a stall, unless a Make run for P2/P3/SMV1 is clearly in flight (`executions_list` on those scenario IDs).
2. Re-read the new Platform Outputs (sort `Output_ID` desc, newest two for Case A, newest three for Case B).
3. Stall = expected fields still empty **and** no in-flight Make execution **and** two more ticks passed.
4. Then: diagnose continuation skip reason from Worker logs / code (`wait_thumbnail`, `wait_variants`, `missing_ratio_crop`, `p2_budget`, `no_package`). Patch Worker or mapping so the **next tick** would match. Wait again. Max three unique root causes per gate.
5. Never `scenarios_run` P2/P3/SMV1/AP0C/FB0 to “hurry.”

### How you tell the 3D thumb from the photo still

| Signal | 3D cover (fail for Case A body) | Photo still (Case A pass) |
| --- | --- | --- |
| Drive filename | `*_thumb.png` / `90_thumb` style | Original upload name (`navy-pier-still.jpg`) |
| Pixels | Often 1024×1024 PNG | 4:5 JPEG, typically 1080×1350-class crop |
| URL | Parent `Thumbnail_URL`; output thumb stamped from P2 | `Selected_Assets_JSON` clip URL; lettered path contains `/lettered/` |
| Airtable | `ITEM4-VARIANT-fill-crop` is a **raw crop**, not 3D cover | Lettered CDN under `studio/previews/lettered/...` |

Download with `User-Agent: chicagoshining-studio-api/publish-dispatch` if `media.chicagoshining.com` 403s a default UA. Read PNG IHDR for width×height.

### How Graph chooses the Case A image (this is the bug under test)

On Approve, `studioPublishHandoffFields` for IG Single Image sets `Publish_Asset_URL` from `studioPublicJpegCoverUrl` (clips first, else **Thumbnail_URL**). Then `studioEnsurePublicJpegForPublish` **returns that existing CDN URL** if it already starts with `media.chicagoshining.com`. Graph POSTs that as `image_url`.

So if the still never lands in `Selected_Assets_JSON` / clip URLs, Graph will post the 3D thumb again (227). **Do not PATCH Publish_Asset_URL to the thumb to “make Graph work.”** Fix selection/lettering/CDN so the **still** is the public URL, then Approve.

If clips exist but Graph still posted the thumb, patch `studioEnsurePublicJpegForPublish` / handoff to prefer a non-thumb still over `Thumbnail_URL` for Single Image, deploy Worker from `cursor/asset-chain-python` (`deploy-cloudflare-worker-production.yml`), and Approve a **new** output (do not re-Approve a Published row).

### How Case B cover-first is supposed to exist

244 posted lettered **photos**; grid was the first photo, not the 3D cover. Case B needs the **cover as carousel slide 1**. If `Selected_Assets_JSON` is only the three stills and `Thumbnail_URL` is the cover, AP0C will post three photos and the grid will be photo 1.

**Perform Case B like this:**

1. Seed and wait until 3D cover exists **and** lettered 4:5 clips exist (244-class).
2. Inspect slide JSON. If slide 1 is not the cover, that is the product gap: implement Worker continuation to **prepend** the public 3D cover as clip 1 for IG Carousel when `Include_Thumbnail=Yes`. Deploy. Wait for cron to refresh slides. Do not Airtable-hand-edit stage fields; a JSON clip prepend in Worker-owned publish prep is the fix under test.
3. Only then invite Joseph to Approve.

### How Joseph Approve is performed (after he names the rec)

He can click **Approve for publishing** in Studio on that one output. You may instead, **only after his Output_ID**:

1. Write `deploy/e2e-studio-api-command.json` (unique `correlation_id`). **Approve-only** — do not GET `/creative` (that dumps the ElevenLabs catalog and truncates GH logs).

```json
{
  "correlation_id": "CU-STILL-APPROVE-IG-<outputid>-<yyyymmdd>",
  "requests": [
    {
      "name": "approve-ig-only",
      "method": "POST",
      "path": "/api/outputs/<RECORD_ID>/creative/review",
      "body": {
        "action": "approve_for_publishing",
        "notes": "Joseph authorized live IG only for this challenging E2E. Do not approve the Facebook sibling or leftovers."
      }
    }
  ]
}
```

2. Commit, push, dispatch:

```powershell
gh workflow run e2e-studio-api-control.yml --ref <branch>
```

(`workflow_dispatch` exists on v1. v2 is push-to-main on `e2e-studio-api-command-v2.json` only.)

3. Watch the run. Then Airtable: `Publish_Status`, `Platform_Post_URL`, `Publish_Error_Message`, `Studio_Publish_Dispatch_*`.
4. Reconcile cron may finish Graph after HTTP returns (`waitUntil`). Wait up to ~10 minutes for permalink if Approve returned 200 with dispatch pending.
5. Tell Joseph the `/p/` URL. He deletes after checking.
6. Studio Pipeline must not show “Rendering mix” (0.10.128). If it does, that is a regression; do not keep Approving.

Path allowlist on the control workflow: `/api/outputs/rec[A-Za-z0-9]+/(preview|creative)(/|$)` — review POST is allowed. Production-request paths are locked to old recs; **do not** try to seed through this control file.

### What Joseph looks at (give him this checklist)

**Case A IG**

- Permalink is `instagram.com/p/…`, not `/reel/`
- Full-size image is the **Navy Pier (or chosen) photo**, not a square 3D title card as the only content
- Caption under the post (two-line Airtable caption; hashtags if copied)
- Studio footer 0.6.126; no yellow “Rendering a new mix”

**Case B IG**

- Carousel `/p/`
- Grid / first slide = designed title card (prefer gold / black-and-gold sophisticated lettering; colorful 3D only occasionally)
- Swipe = the three photos (lettering on slides if lettering ran)
- Caption under the post

---

## 1. The two cases (why they are hard)

### Case A — Still-as-body (`cu-still-body`)

One new Chicago still. Silent. Plan: Instagram **Single Image**, Facebook **Single Image**. `Include_Thumbnail=Yes`.

**Hard part:** Graph publishes the **4:5 designed still**, not the P2 3D thumb. Caption + hashtags under the post. Public `studio/previews` URL from the pipeline, not a laptop PUT.

Facebook sibling stays Ready for Review unless Joseph asks (FB0 chain above).

### Case B — Cover-first carousel (`cu-cover-first`)

Three **new** stills. Silent. Instagram **Carousel**, Facebook **Multi-Image Post**.

**Hard part:** 3D cover as **slide 1 / grid**, lettered photos when you swipe. Single Image cannot do this. 244 did not put the cover on the grid.

Run Case A to Joseph’s gate (or a written fail) **before** seeding Case B. Approve Case B only after Case A’s live IG check is done.

---

## 2. Step-by-step scripts

### TC0 — Control plane

Do these **read-only** checks in order. Write one line each in the evidence file.

1. **Cadence parked:** In live `apps/studio-api/worker.js` on the deployed Worker, `PRODUCTION_CADENCE_PARKED` is `true` (health flag `production_make_idle_cadence_v1`). Make: publishers/R/RR interval scenarios should be inactive unless the Worker just pulsed one. `5893243` MAKE-ADMIN-BRIDGE must be **off**.
2. **P2:** `scenarios_get` `5530955` → `isinvalid=false`, `islinked=true`. Do not PATCH blueprint `n` while P2 has queued runs.
3. **Worker version:** Deployed Worker should still be `0.10.128-native-still-handoff` (or newer that keeps `studio_ig_fb_photo_dispatch_v1` + `studio_native_still_no_mix_handoff_v1`). Confirm via last successful `deploy-cloudflare-worker-production.yml` run, not by deploying AP0-python.
4. **Pages:** Joseph already saw UI `0.6.126`. No Pages deploy needed unless you change `studio-web`.
5. **Leftovers:** Platform Outputs 224–226, 227, 228, 245, 246 must not be Ready-for-Review **and** selected in Approve All. If Approve All count includes them, stop and tell Joseph — do not Approve All.

**Pass:** all five. **Fail:** cadence live, P2 invalid, or Approve All would fire leftovers.

### TC1 — Seed Case A

1. Add JSON + workflow choices (see “How a seed actually happens”). Push.
2. `gh workflow run e2e-studio-native-photo-seed.yml --ref <branch> -f scenario_id=cu-still-body`
3. On success, record idea / PR / CI recs from the run log.
4. Airtable Content Item: `Test_Run_ID` empty; `Include_Thumbnail` Yes; Voiceover No.
5. Platform Outputs: exactly **two** new rows, `Output_ID` **> 246**, types Instagram `Single Image` / `Instagram Feed Post` and Facebook `Single Image` / `Facebook Post`. Not Reel. Not Slideshow Reel.

**Fail:** IG Reel; empty Test_Run_ID violated; seed timed out with no CI. Diagnose seed logs (Wikimedia, Studio 500, membership). Do not create the idea in Airtable by hand.

### TC2 — Case A package (observe)

Poll every 2–4 minutes. Stop when Ready for Review **or** stall rule fires.

**Content Item (parent)**

- `Thumbnail_URL` is a Drive/P2 thumb (not `ITEM4-VARIANT-fill-crop`)
- `Caption` non-empty (AI decides is OK if copy exists)
- `Hashtags` may be on parent; outputs should get them before Approve

**Instagram output**

| Field | Expected |
| --- | --- |
| `Output_Status` | Ready for Review |
| `Review_Status` | Review Sent (or equivalent reviewable) |
| `Render_Status` | Native Photo Route |
| `Remotion_Job_ID` | empty |
| `Studio_Output_Type` / mapping | Single Image / Instagram Feed Post |
| `Selected_Assets_JSON` | At least one clip that is the **photo**, not `*_thumb` |
| Lettered URL | Prefer `…/studio/previews/lettered/…` if lettering ran |
| `Publish_Asset_URL` / preview | Must be the **still** on `studio/previews` before you invite Joseph. If this is still the thumb, **do not Approve** |
| `Output_Caption` | Non-empty |
| `Auto_Publish_Enabled` | still off until Approve |

**Facebook output:** same native route, stay unapproved.

If body still never appears: defect in SMV1 / lettering / clip JSON. Fix Worker so cron attaches the 4:5 still. Do not stamp the thumb as the body.

**Joseph gate A:** Message him with IG `Output_ID`, rec id, Studio pipeline link, and “I will not Approve until you reply with this ID.” After Authorize, Approve via Studio or E2E command. Wait for permalink. He deletes.

Live fail = thumb posted, no caption, Reel, or mix overlay. Record and patch; **new** output for retry.

### TC3 — Seed Case B

Only after TC2 is at gate A or has a written fail.

Same seed mechanics, `scenario_id=cu-cover-first`. Expect **three** outputs (IG Carousel, FB Multi-Image, and if the planner adds TikTok Multi-Photo leave it unapproved). IDs > Case A. Facebook must not be Slideshow Reel.

### TC4 — Case B package

| Check | Expected |
| --- | --- |
| Render | Native Photo Route, `Remotion_Job_ID` blank |
| Cover | Parent + output `Thumbnail_URL` is 3D, not fill-crop |
| Slides | `Selected_Assets_JSON` / carousel children: **index 0 = cover CDN**, rest = lettered 4:5 |
| Caption | On IG (and FB) outputs |
| Review | Ready for Review |

If lettering never runs: RC-NATIVE-D5-class. Do not Approve until Joseph accepts unlettered photos **or** you fix lettering and wait for cron.

**Joseph gate B:** Approve **IG Carousel rec only**. Same E2E command pattern. He checks grid vs swipe, then deletes.

### TC5 — Optional Facebook

Joseph names 228-class **new** FB row (not leftover 228/245 unless he explicitly wants those). Confirm FB0–FB3 armed, FB-ORCH off. Approve that rec. Expect a Page photo, not `facebook.com/reel/`.

### TC6 — Evidence

Folder `repair/evidence/cu-native-20260824/` (use the real date):

- `tc0.json` — P2 flags, Worker version, leftover check
- `case-a.md` — recs, field snapshots before Approve, permalink, pass/fail
- `case-b.md` — same
- Skip/error strings: `missing-cdn-preview`, `upload-http-404`, `1010`, Graph create message

Do not put tokens or webhook URLs in evidence.

---

## 3. Seed JSON (add to `deploy/e2e-studio-scenarios.json`)

Validate Commons URLs before commit. Replace if 404.

```json
"cu-still-body": {
  "title": "Navy Pier — still-as-body native test",
  "summary": "One Chicago still. Silent native singles. Graph must post the 4:5 photo still, not the 3D thumb. Caption and hashtags on the post.",
  "content_type": "Feed Post",
  "photo_count": 1,
  "voiceover_mode": "No",
  "background_music_mode": "No",
  "thumbnail_mode": "Yes",
  "platforms": ["Instagram", "Facebook"],
  "overrides": { "Instagram": "Single Image", "Facebook": "Single Image" },
  "extras": [],
  "photos": [
    {
      "filename": "navy-pier-still.jpg",
      "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Navy_Pier_Chicago_2022.jpg?width=1280"
    }
  ]
},
"cu-cover-first": {
  "title": "Three Chicago stills — cover-first carousel",
  "summary": "Silent native carousel. Slide 1 is the AI 3D cover (grid). Remaining slides are lettered 4:5 photos. Graph caption on the album.",
  "content_type": "Photo Set",
  "photo_count": 3,
  "voiceover_mode": "No",
  "background_music_mode": "No",
  "thumbnail_mode": "Yes",
  "platforms": ["Instagram", "Facebook"],
  "overrides": { "Instagram": "Carousel", "Facebook": "Multi-Image Post" },
  "extras": [],
  "photos": [
    { "filename": "chicago-buckingham.jpg", "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Buckingham_Fountain_(29636521305).jpg?width=1280" },
    { "filename": "chicago-river.jpg", "url": "https://commons.wikimedia.org/wiki/Special:FilePath/Chicago_River_from_Lake_Street_Bridge.jpg?width=1280" },
    { "filename": "chicago-el.jpg", "url": "https://commons.wikimedia.org/wiki/Special:FilePath/CTA_Loop_L_train.jpg?width=1280" }
  ]
}
```

---

## 4. First actions in the new chat

1. State leftover IDs you will not Approve.
2. Run TC0 (Make `5530955`, last Worker deploy, Approve All risk).
3. HEAD Commons URLs; patch JSON if needed.
4. Commit scenario keys + workflow `options`, push, dispatch `cu-still-body` only.
5. Poll Case A until Ready for Review **and** the IG public URL is the **still**. Then ping Joseph with that Output_ID. Stop.

Prior thread for defects only: conversation `d3a53042-a899-422e-a02b-cdb85853ceb5`.
