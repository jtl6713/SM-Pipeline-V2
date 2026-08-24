# Asset chain — A2 / A2B / A3 / A4 / A1P (Python)

Make **5531974**, **5568863**, **5569035**, **5578180**, **5715500** → `POST /stages/a2`, `/a2b`, `/a3`, `/a4`, `/hooks/a1p/<token>`

Parked conductor **5602193** (A0) is also inactive. Studio Operations library intake pulses Python A2; A2 daisy-chains A2B → A3 → A4 in-process. A1S **5715530** stays Make on-demand and posts `poller_url` to the Python A1P hook.

## Cutover

```
STAGE_BACKEND_A2=python
STAGE_BACKEND_A2B=python
STAGE_BACKEND_A3=python
STAGE_BACKEND_A4=python
STAGE_BACKEND_A1P=python
STAGE_BACKEND_AP0=python
STAGE_BACKEND_AP1_IG=python
STAGE_BACKEND_AP1_IGS=python
STAGE_BACKEND_FBS3=python
```

PR: [#13](https://github.com/jtl6713/SM-Pipeline-V2/pull/13)  
Configure: [run 32743287446](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32743287446)  
Worker deploy: [run 32743183839](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32743183839)

Make **5531974**, **5568863**, **5569035**, **5578180**, **5715500**, parked **5602193**, AP0 **5612096**, AP1-IG **5862882**, AP1-IGS **5612664**, AP1-IGS-POLL **5845193**, FBS3 **5816502**, and FBS4 **5816520** are **inactive** in `ARCHIVE_MOVED_TO_PYTHON`. Reactivate only for emergency rollback.

## Proof (2026-08-24)

| Check | Result |
| --- | --- |
| Isolated A2 live | Ingestion `python-a2-proof-20260824.png` → Media Asset [recGU30bCnJBN7YIr](https://airtable.com/appe33zkZn35yirTL/tblSITCujCsJTNcDe/recGU30bCnJBN7YIr) |
| Isolated A3 live | Same record Classified (Graphic / Reference Material) |
| Isolated A4 live | Healthy checkpoint on [recFQ5QoZnAy8MtGU](https://airtable.com/appe33zkZn35yirTL/tblSITCujCsJTNcDe/recFQ5QoZnAy8MtGU) |
| After runner restart | `POST /stages/a2` with `trigger_a2b=true`, `wait_for_next=true` returned `a2b.backend=python`, `a3.backend=python`, `a4.backend=python` |
| Daisy-chain volume | A2 0 files, A2B 0 backfill (117 existing Drive IDs), A3 0 classified, A4 20 healthy / 0 deleted |
| A1P dry-run | `POST /stages/a1p` extra `dry_run=true` returned ok / no CloudConvert poll |
| A1_POLLER_WEBHOOK_URL | [recBrmzuORriwmz13](https://airtable.com/appe33zkZn35yirTL/tblpHPWeEkyJaF7ql/recBrmzuORriwmz13) now points at `https://pipeline.chicagoshining.com/hooks/a1p/<token>` |

Studio intake should return `triggered: "a2-python"` and must not 409 because Make A2 is off. Restart the runner after setting `A1P_WEBHOOK_TOKEN` so `/hooks/a1p/<token>` is live.

## Still Make

| Stage | Make ID | Why |
| --- | --- | --- |
| A1S | 5715530 | On-demand oversized scan. Posts `poller_url` to Python A1P |
| A1M | 5764543 | On-demand duration probe in Backups |

AP0 **5612096**, AP1-IG **5862882**, AP1-IGS **5612664** / **5845193**, and FBS3 **5816502** / FBS4 **5816520** are Python live. Do not Approve live social posts as a cutover test. Facebook slideshow render (FBS1/FBS2), Facebook photos, TikTok, and YouTube publishers stay Make.
