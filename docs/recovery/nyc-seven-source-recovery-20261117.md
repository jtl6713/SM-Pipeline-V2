# NYC Production Seven — Verified Source Recovery Packet

Date: 2026-11-17 UTC  
Authority: **Supabase-only**; Airtable archive is not a read or write source.  
Incident: [#2113](https://github.com/jtl6713/SM-Pipeline-V2/issues/2113).

## Current state, exact targets

| Piece | Request Airtable ID (identity only) | Content Airtable ID | Unfinished output IDs | Approved siblings — IMMUTABLE |
|---|---|---|---|---|
| Coney Off-Season Vibes #2093 | `recrPqWaf1PUOtmfi` | `recG0Y3ii1T0IKngk` | TikTok `rectkD9qvLLTlOWHL` #10404; IG Reel `recz0kPlG09Qdte9i` #10405; YT Short `rec5NQ6DJK1Y9OhzT` #10406 | IG Story `reciuNHj3mA0orWnl` #10407 |
| Astoria N-Line Soundscape | `recQa6zVwX7vnXOii` | `recEFBgXjqymgqUFn` | FB Reel `rec5KOJdpWCx8Ski4`; IG Reel `recH6GOoGsdsbk7aR`; TikTok `rec7cVToPHOiwpOR0`; YT Short `recBZGTCR9rnQ63zm` | FB Story `recQDq1tVPCuZKHHT`; IG Story `rec2k6jxVzghVsKPs` |

All seven unfinished outputs have `Output_Status=In Production`, no final MP4 and no committed render job. The two Coney/IG and Astoria/FB/IG/YT safeguards are **not failures to bypass**: the existing image selections are semantically invalid. Coney's 10 saved clips are actually Long Island City and Statue of Liberty imagery; Astoria's single clip is `NYC Highline 12`, with 3 explicit visual-integrity blocks and 1 queued TikTok.

The aligned Home/Production counts must remain seven outputs across two NYC pieces until real repairs are completed.

## Coney Island: ten original user-library source candidates

The following are ten visually inspected, distinct original Media Asset records in the **user's own NYC-profile connected Drive**, not variants from another Production Request. All are `active=true`, `do_not_use=false`, `classification_status=Classified`, `rights_status=Owned`, `content_profile_airtable_id=recgtK8Z7eNADNtVy`. “Owned” is catalog metadata, **not proof that a stock-media license covers reuse**.

| Scene | Name | Exact Media Asset record ID | Google Drive file ID | Image verification | Provenance gate |
|---:|---|---|---|---|---|
| 1 | Coney Island 2 — snowy/fenced Wonder Wheel | `recoEynFVBD6NJRCq` | `1HgVZIPSSg7SDfHHSAYjU67YrerSqbtXn` | Visually inspected original; snow & fence | Adobe Stock credit string; verify purchase/use rights |
| 2 | Coney Island 18 — low-crowd broad beach/waves | `recfE3qcKp60UgR0J` | `1qOTzgFCYOnTZoTSASDuzbI-elheMgZK1` | Visually inspected original and existing 9:16 variant; genuine Coney beach amusement landmarks | Catalog Owned; independent rights audit |
| 3 | Coney Island 5 — quieter boardwalk | `recX7kZXba4od5RSN` | `1JHItDk3_-TXzECyoDenDZNnXQnTHEoBb` | Visually inspected original: broad wooden boardwalk, 2 pedestrians, sparse others | Adobe Stock credit; verify rights and actual frame |
| 4 | Coney Island 8 — empty Cyclone framework | `rec7EEZPZTogBzWnn` | `1kqj53udCrWfGV6bYxMApzYUXxb4DcaVa` | Visually inspected original: white Cyclone coaster support structure | Adobe Stock credit; verify rights and actual frame |
| 5 | Coney Island 9 — cloudy Cyclone sign | `rectDvLGoMeqdmLcf` | `1rLviuiq1E5EQkwyZxABToAG453TMvTQ7` | Visually inspected original: CYCLONE neon sign and white track | Adobe Stock credit; verify rights and actual frame |
| 6 | Coney Island 12 — Nathan's sign and facade | `recmcNAsGMsZLRjuP` | `1Sby896ANOYKPTRg9IMsMHNXp8_hTDXYk` | Visually inspected original: Nathan's Famous neon store frontage | Adobe Stock credit; verify rights and actual frame |
| 7 | Coney Island 14 — shut Luna Park gate | `recPr96mYGBDoRAnY` | `1xs6jgouJAKAtwC-5U4x5T5USrJdoGgZ6` | Visually inspected original | Catalog Owned; independent rights audit |
| 8 | Coney Island 21 — cloudy Wonder Wheel entrance | `recsmsw8Uwy1UVXJB` | `1xTZIyQydTNrO8vB7AIVmpTYagIR_knod` | Visually inspected original | Catalog Owned; independent rights audit |
| 9 | Coney Island 15 — Parachute Jump dusk waterfront | `recwaYeoMDp9VsSz7` | `1W1FTr7KkKhzh7WiA-nakurUSgW-wydbY` | Visually inspected original | Catalog Owned; independent rights audit |
| 10 | Coney Island 16 — night amusement park across water | `recufqIz99EbfBtRK` | `1gIUIODHMnY1pAhhx6-OSXXXsdvIgzGZj` | Visually inspected original | Catalog Owned; independent rights audit |

**Explicitly excluded after real-image audit:** `Coney Island 3` original `recc4Jfo8EBBwwKsm` / Drive `1gdWkLDUGH6Jet3nsyfUiT4dMC2QIBUSr`. Although the catalog calls it Steeplechase Pier, the actual image shows a long promenade/pier facing a dense skyline across water and a circular installation, inconsistent with an obvious ocean-facing Coney Island scene. Location is **unverified and possibly misclassified**; do not use it unless independently geolocated. `Coney Island 18` was promoted into scene 2 in its place.

**Avoid:** original Coney 19 (crowded summer swimmers, umbrellas and visible lower-right marking), 20 (active crowded rides), 22 (lifestyle portrait not about quiet off-season), and do not use LI City/Statue of Liberty visuals. Source image 14 clearly shows locked gates but should not be claimed to prove an actual winter date.

**Creative intent:** Coney Production Notes `[timed-script]` is an **exact 30-second, 10 × 3-second intentionally silent** cut with `silent:true`, blank `voiceover_text`. Do **not** feed a 0-second blank script to voiceover generation or synthesize a new narrator; preserve silent intent, then verify whether permitted soundtrack exists separately.

## Astoria: verified external CC BY 4.0 fallback candidates — not yet user-library assets

The connected private `media_assets` index has **zero independently identified Astoria/ Ditmars images**; the current High Line still is not a substitute. These six independently described original photographs depict authentic Astoria BMT Astoria Line stations. Page-level licenses were checked 2026-11-17; all are **CC BY 4.0** (not the share-alike license). Source photographer credit, URL, license URL and modification/crop status must be preserved through the platform output and posted caption/credit before any publishing. Source images must still be visually validated, and some are multiple views of a station, not independent neighborhood subjects.

| Shot | Wikimedia Commons source page | Author | License |
|---|---|---|---|
| Ditmars station train/platform | https://commons.wikimedia.org/wiki/File:Astoria-Ditmars_Boulevard_station_August_2025.jpg | 4300streetcar | CC BY 4.0 |
| Different Ditmars station view | https://commons.wikimedia.org/wiki/File:Astoria-Ditmars_Boulevard_station_August_2025_2.jpg | 4300streetcar | CC BY 4.0 |
| Ditmars station sign | https://commons.wikimedia.org/wiki/File:Ditmars_Blvd_Station_Sign.jpg | Kidfly182 | CC BY 4.0 |
| Astoria Boulevard station | https://commons.wikimedia.org/wiki/File:Astoria_Blvd_Station_02.jpg | Kidfly182 | CC BY 4.0 |
| Separate Astoria Boulevard station view | https://commons.wikimedia.org/wiki/File:Astoria_Blvd_Station_03.jpg | Kidfly182 | CC BY 4.0 |
| Broadway station, actual BMT Astoria Line | https://commons.wikimedia.org/wiki/File:Broadway_Station_Astoria_Line_02.jpg | Kidfly182 | CC BY 4.0 |

License: https://creativecommons.org/licenses/by/4.0/ . Suggested credit text template: “Astoria station photos: 4300streetcar and Kidfly182 / Wikimedia Commons, CC BY 4.0; cropped and edited,” plus each individual source link in an accessible credits location. **Do not mislabel any external CC BY work as 'Owned'.** A third-party import is not approved unless the production media-license/attribution path explicitly supports that identity and the user agrees to external source use.

Astoria parent has a generated voiceover text and a Drive URL, while all pending outputs have `studio_effective_voiceover_mode=No`. That mismatch should be reconciled against the original intended content before plan regeneration; never change audio solely based on available URL.

## Exact-output repair execution contract

**Technical blocker discovered:** Existing native `attachItem4LibraryAssets` in `apps/studio-api/worker-functions-01.mjs` calls `assertEditableProductionRequest`; a `Promoted` request is not editable unless a legitimate `[factory-revision-open]` note exists. These two promoted requests have no such marker. Generic attachment also resets the **entire parent** output plan, variants and status, potentially affecting already-approved Story siblings. **Do not fake a Factory revision marker or use the generic attach route for these repairs.**

A safe implementation must:
1. Require the exact parent Content/Production Request IDs, expected NYC profile, and exact allowlist of **three Coney** or **four Astoria** unapproved `In Production` outputs. Fail closed on changed ownership, active render leases, final MP4s, revisions, unexpected sibling status or missing SQL row.
2. Validate real source bytes, distinct visual subjects, 9:16 aspect targets, provenance/attribution and selected project-specific R2 staging; never copy request-scoped variant URLs or source ownership from another request. Preserve the Coney 10 × 3-second silent timing.
3. Preserve original approved Instagram/Facebook Stories and all other siblings **byte for byte**, including their media, thumbnails, captions, history, scheduled/publication fields and records. Never reopen their review or approvals.
4. Snapshot original unapproved output source fields; build and store new **request-bound source manifest and variants**, then update only allowlisted unapproved output render inputs via validated Supabase SoR adapters/transactionally or with safe compensating rollback. Never use archived Airtable reads/writes.
5. Dry-run all exact-output source integrity assertions **before** any write. Initiate at most one safe bounded R4 render per newly valid output only after an explicit successful preview of source sequence; no manual approval, automatic publishing or scheduling.
6. Recheck R5, CDN/full-video preview, correct visuals, caption/VO intent, Remotion receipts; only then let the existing normal review transition mark an output `Ready for Review`.
7. Persist real execution evidence on issue #2113. If licensing, attribution, visuals or source staging cannot be proven, leave blocked with concrete reason. “7 → 0” is not a valid success metric without seven real creative deliverables.

## Safety and audit history
- The counts-alignment releases (Worker 0.10.1001 / UI 0.6.976) are **display corrections**, not media-recovery evidence.
- No media, output, approval, render or schedule write was performed while assembling this packet.
- The ten scene candidates have now all been visually inspected from their original Drive bytes; Coney 3 was excluded as geographically questionable. Image validity **does not** prove stock reuse rights: five candidate originals have Adobe Stock photographer/credit strings and still require rights attestation.
- Keep all public publishing under operator approval.
