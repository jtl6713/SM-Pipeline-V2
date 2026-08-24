# Wave 3 — P2 voiceover + thumbnail (Python)

Make scenario **5530955** → `POST /stages/p2`

## Cutover

```
STAGE_BACKEND_P2=python
```

Configure: [run 32676302994](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32676302994)  
Worker deploy: [run 32676304332](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32676304332)  
Make **5530955** is **inactive**. Reactivate only for emergency rollback.

## Routes

| Route | Eligibility |
| --- | --- |
| Voiceover + thumbnail | `Content_Status=Ready for Voiceover`, script ready, normalizer URL present |
| Voiceover-only | Same, `Thumbnail_Status=Not Needed` |
| Silent thumbnail | `Include_Voiceover=No`, `Thumbnail_Status=Ready`, blank `Thumbnail_URL` |

Success still chains **P3** via Make webhook `66wq22...` (P3 remains Make until the next wave).

## Proof (2026-08-23)

| Check | Result |
| --- | --- |
| `/health` | `stages_implemented: 7` at cutover (`8` after later runner work) |
| Dry-run CI [95](https://airtable.com/appe33zkZn35yirTL/tblwzN9AXWvmKVKPs/recCTw0gxbR07xGu4) | `route=silent_thumbnail`, no Airtable writes |
| Live CI 95 | Python `silent_thumbnail` OK. `Content_Status=Thumbnail Ready`, Drive `1BtXwbOG2K-YPdbcHQfU72sFhpGdEj225`, P3 webhook `200 Accepted` |
| Voiceover live | Key present in runtime `.env`; not exercised on this silent item |

Do **not** Approve CI 95 or any P3 outputs.

## Runtime secrets

Required in `Services/pipeline-runner/service/.env` (never commit):

- `OPENAI_API_KEY` — Personal org (`gpt-image-1.5`); Encore `sk-proj` keys fail this account
- `ELEVENLABS_API_KEY` — voiceover
- Google OAuth — Drive upload
- `AIRTABLE_PAT`, `PIPELINE_RUNNER_SHARED_SECRET`

Normalizer: Airtable Pipeline Settings `Voiceover_Normalization_Service_URL` = `https://voiceover.chicagoshining.com` (local origin `:3012`).
