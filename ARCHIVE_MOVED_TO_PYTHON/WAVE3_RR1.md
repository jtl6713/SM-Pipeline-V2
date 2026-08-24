# Wave 3 — RR1 review email (Python)

Make scenario **5576363** → `POST /stages/rr1`

## Cutover

```
STAGE_BACKEND_RR1=python
```

Requires Gmail send scope on `GOOGLE_REFRESH_TOKEN` plus optional:

```
RR1_REVIEW_EMAIL_TO=chicagoshining@gmail.com
RR1_DECISION_WEBHOOK_URL=https://hook.us2.make.com/4la4htbwby73twc4omljrc2iip5f50zu
```

## Wave 4 (next) — P3 / publishing

| Stage | Make ID | Status |
|-------|---------|--------|
| P2 | 5530955 | Python live (`STAGE_BACKEND_P2=python`); silent-thumbnail proven on CI 95 |
| P3 | 5531703 | Scaffold only |
| AP0 | 5612096 | Python implemented (`POST /stages/ap0`); `STAGE_BACKEND_AP0` still **make**. Do not Approve / do not live-post. |
| publish_ig/fb/tt/yt | 5864632 / 5813561 / 5806668 / 5823581 | YouTube webhook chain is Python; orch stays parked |

Recommended order: **P3 → AP0 → publish_tt → publish_fb → publish_ig → publish_yt**
