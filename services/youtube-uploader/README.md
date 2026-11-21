# youtube-uploader

Authoritative SM Pipeline V2 local service source.

- Runtime source: D:\Content Creation\ChicagoShining Pipeline\Services\youtube-uploader\service
- Local port: 3340
- Permanent public route: https://youtube-upload.chicagoshining.com

Runtime dependencies, caches, media, logs, virtual environments, node_modules,
and secret-bearing .env / OAuth credential files are intentionally excluded
from Git. .env.example contains variable names only when a live .env exists.

Captured files: 6

## P1 #2340: exact-channel historical upload audit (GET-only)

After a reviewed deployment of this source to the relevant **LA** or **Miami**
uploader runtime, call the authenticated endpoint:

    GET /youtube/channel/uploads?expected_channel_id=<configured-channel-id>
    x-sm-pipeline-key: <existing-uploader-shared-secret>

The expected channel ID must come from that profile's authoritative
YOUTUBE_CHANNEL_ID setting, not from the service's own self-reported identity.
The endpoint refuses to operate without a configured shared secret, or if
channels.list(mine=true) does not exactly match the supplied channel ID.

It performs only YouTube Data API channels.list, playlistItems.list, and
videos.list GETs (up to 10 pages / 500 playlist items). The response
contains the verified owning channel, video ID/title/description excerpt,
privacy state, published timestamp, and a truthful complete flag.
complete=false also applies when video detail is missing; duplicate
pagination tokens and any cross-owned video fail closed.

This audit is **not an upload/retry trigger**. Even a complete scan with no
matching title does not prove non-delivery after an ambiguous dispatch; provider
receipts and uploader transaction/job history must also be reconciled.
For LA output #4671 and Miami output #6252, do not post a second video without
separate exact-output authorization and one-shot durable fencing. No Airtable
dependency is introduced. Only code is changed by this PR; Git merge alone
does not deploy the local uploader services.
