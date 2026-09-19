# Add Miami Shining profile — operator handoff

Created 2026-09-14. Content Profile: [`recpNlNn6U6eq0M9r`](https://airtable.com/appe33zkZn35yirTL/tblNYg2QB0BmmVACy/recpNlNn6U6eq0M9r) · Brand [`BRD-MIAMI`](https://airtable.com/appe33zkZn35yirTL/tblUV8Cd7C2UCyuJ9/recpgrCHZ17cgKIGM) · Market [`MKT-US-FL-MIAMI`](https://airtable.com/appe33zkZn35yirTL/tblT2zTdUV5ADPWUU/recarcZgpt3Vygu1v).

## CURRENT STATUS

- Facebook Page **Miami Shining** live: https://www.facebook.com/miamishining · Graph Page ID `1406705239181984` → `MIAMI_FACEBOOK_PAGE_ID`
- Instagram Business `@miamishining` linked · ID `17841434188295858` → `MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID`
- Long-lived Page token (never expires) → `MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN` + `MIAMI_META_GRAPH_API_ACCESS_TOKEN`
- TikTok Worker `chicagoshining-tiktok-auth-miami` deployed · KV `TIKTOK_AUTH_MIAMI` · host `https://auth-miami.chicagoshining.com`
  - All four Worker secrets set; `/health` ok
  - Still needed: TikTok Login Kit redirect URI `https://auth-miami.chicagoshining.com/tiktok/callback` (Live), create `@miamishining`, OAuth connect
- Still needed: YouTube channel + uploader OAuth/deploy, Studio/idea smoke

## Already done in repo / Airtable

- Theme `miami` + prefix `MIAMI_` in pipeline-runner + Studio API
- Studio aqua theme, home images, city copy
- `apps/tiktok-auth-miami/` (needs KV id + secrets + deploy)
- YouTube uploader Miami local-service wiring (port `3343`, hostname `youtube-upload-miami.chicagoshining.com`)
- Airtable Market / Brand / Content Profile / `MIAMI_*` Pipeline Settings
- Membership Allowed Brands include `BRD-MIAMI`
- Smoke fixtures: `deploy/test-miami-idea-create.json`, `.github/workflows/test-miami-idea-create.yml`

## Joseph-only pauses (browser)

Have phone + recovery email ready. Agent fills forms; you enter codes / CAPTCHA / “I’m human”.

### 1. YouTube

1. Create / brand a Google account as **Miami Shining** if needed.
2. Create YouTube channel **Miami Shining**.
3. Deploy runtime: `Deploy-SMService.ps1` → `youtube-uploader-miami` (or copy NYC runtime folder pattern to `Services\youtube-uploader-miami\service`).
4. Run OAuth setup from `services/youtube-uploader/` against the Miami `.env`.
5. Write channel id → Pipeline Setting `MIAMI_YOUTUBE_CHANNEL_ID`.
6. Cloudflare tunnel / hostname `youtube-upload-miami.chicagoshining.com` → localhost `3343`.
7. Confirm `https://youtube-upload-miami.chicagoshining.com/health`.

### 2. Meta (Facebook Page + Instagram)

1. Create Facebook Page **Miami Shining** (Business or Brand).
   - Category: use a fast typeahead pick such as **Travel Company**, **Website**, or **Tourist Information Center**. Do **not** hang on Media/News Company.
2. Create Instagram `@miamishining` (or next available); convert to Professional and link to the Page.
3. Generate long-lived Page token + IG Business Account ID (same path used for LA/Chicago).
4. Write:
   - `MIAMI_FACEBOOK_PAGE_ID`
   - `MIAMI_FACEBOOK_PAGE_ACCESS_TOKEN`
   - `MIAMI_INSTAGRAM_BUSINESS_ACCOUNT_ID`
   - `MIAMI_META_GRAPH_API_ACCESS_TOKEN`
5. Mirror IDs onto Content Profile social fields when present.

### 3. TikTok

1. Create Cloudflare KV namespace for Miami TikTok auth; put the id in `apps/tiktok-auth-miami/wrangler.jsonc` (`REPLACE_WITH_MIAMI_TIKTOK_AUTH_KV_ID`).
2. Copy secrets from NYC/LA Worker: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`, `TIKTOK_MAKE_SHARED_SECRET`, `TIKTOK_OAUTH_STATE_SECRET` (and pipeline shared secret if used).
3. Deploy Worker; confirm DNS/custom domain `auth-miami.chicagoshining.com`.
4. Create TikTok `@miamishining` (or next available).
5. Open `https://auth-miami.chicagoshining.com` and complete OAuth.
6. Confirm `MIAMI_TIKTOK_HANDLE` + profile `TikTok_Handle`.

## Deploy order (code)

1. Merge / deploy Studio API Worker (miami theme detection).
2. Deploy Studio web (theme CSS + home images).
3. Deploy `tiktok-auth-miami` after KV + secrets.
4. Stand up YouTube Miami uploader + tunnel.
5. Run idea smoke: workflow **Test Miami Idea Create** or local create against `recpNlNn6U6eq0M9r`.
6. Assert destination resolution never falls back to Chicago for empty `MIAMI_*` destination keys.

## Out of scope until later

- Miami photo library stamped to this Content Profile
- Live publish tests beyond private/draft
- Separate Drive trees (shared DAM + `Asset_Filter_Tag=Miami`)
