# Social Engagement Automation — Platform Capability Matrix

Verified against official platform documentation and existing Studio integrations
(`business_discovery`, YouTube Data API `search.list` / OAuth with `youtube.force-ssl`,
TikTok Content Posting, Meta Graph publish paths). **No browser bots, scraping,
unofficial private APIs, or simulated human interaction.**

Last reviewed: 2026-10-08.

## Capability matrix

| Capability | Instagram | Facebook | TikTok | YouTube |
|---|---|---|---|---|
| Discover relevant third-party posts | **Partial** — known Business/Creator usernames via `business_discovery` (requires Meta permission #10; currently blocked in Studio). No general hashtag/keyword search for arbitrary public posts. | **Unsupported** — no official third-party content discovery feed for engagement. Watchlist handles are operator reference only. | **Unsupported** — Content Posting / Research APIs do not provide keyword discovery of others’ posts for engagement. | **Supported** — Data API `search.list` (video/channel) with API key; quota ~100 units/search. |
| Read public captions/content | **Partial** — caption + metadata via `business_discovery` when permission is granted. Comment *lists* on third-party media are not readable through discovery. | **Unsupported** for arbitrary third-party posts with current Page tokens. | **Unsupported** for arbitrary third-party posts. | **Supported** — `videos.list` / `search.list` snippet (title, description). |
| Like third-party content | **Partial / gated** — Instagram Login `/{ig-user-id}/user_likes` can like media when the app uses Instagram Login scopes. Studio Meta tokens today are Facebook-Login Graph paths used for *owned* publishing; third-party like is not enabled until Instagram Login + app review. | **Unsupported** for arbitrary public posts (User Likes deprecated for this use). | **Unsupported** — Content Posting API has no like-others endpoint. | **Supported** — `videos.rate` (`like`/`none`) with OAuth (`youtube.force-ssl` already in uploader scopes). |
| Comment on third-party content | **Unsupported** for others’ media — `/{ig-media-id}/comments` requires a token for the media owner. Outbound comments on third-party posts → **manual Open Post**. | **Unsupported** as a general automation path for arbitrary creators. Page engagement APIs do not authorize mass third-party commenting. | **Unsupported** — no official comment-on-others API. | **Supported** — `commentThreads.insert` with OAuth (`youtube.force-ssl`). Subject to quota and spam policies. |
| Retrieve engagement history | **Partial** — own-media comment moderation only; no reliable outbound “comments we left on others” history API. Studio persists its own Engagement Actions ledger. | Same — Studio ledger only. | Same — Studio ledger only. | **Partial** — can list own channel comments via Data API; Studio also persists Engagement Actions. |

## Permissions, quotas, review, and prohibitions

### Instagram / Facebook (Meta)

- **Needed for discovery:** `instagram_basic`, `instagram_manage_insights`, `pages_read_engagement`, plus Business Manager grants; **`business_discovery` (permission #10)** is required and is currently blocked in this Meta app (Insights watchlist messaging already documents this).
- **Needed for owned comments:** `instagram_manage_comments` — applies to *our* media, not third-party discovery media.
- **User Likes (Instagram Login):** separate Instagram Login product + app review; burst limit ~50 likes / 5s → 1h lockout.
- **Prohibited:** scraping, undocumented mobile APIs, automated mass engagement, engagement bait, impersonation. Unsupported actions must surface as **Open Post** (manual), never as Completed.

### TikTok

- Content Posting API: inbox drafts for *our* content only.
- No official third-party discover / like / comment for growth engagement.
- All TikTok engagement recommendations are **manual Open Post** only.

### YouTube

- **Discovery:** `YOUTUBE_API_KEY` + `search.list` (~100 quota units). Cron ≤ once/day per Studio pattern.
- **Engage:** uploader OAuth already requests `youtube.force-ssl` (comments + rate). Execute only after explicit approval.
- **Quotas:** daily project quotas; exponential backoff on 403/429; never spin-retry ambiguous comment inserts without checking whether the comment already exists.
- **Policies:** no spam, no repetitive identical comments, no promotional link stuffing.

## Studio engagement stages

| Stage | Behavior |
|---|---|
| **A** | Discover + AI suggestions + approval queue. **No external write actions.** |
| **B** | Approved Like/Comment only where matrix = Supported (YouTube). Others → Open Post. |
| **C** | Scheduled daily discovery (≤20 candidates/profile); still requires human approval before publish. |

## Unsupported → manual workflow

When an action is Unsupported or Partial-unavailable, the Engagement UI offers **Open Post** with the original URL and records the operator decision (Skipped / Manual) without claiming the platform action completed.
