# Asset chain — A2 / A2B / A3 / A4 (Python)

Make **5531974**, **5568863**, **5569035**, **5578180** → `POST /stages/a2`, `/a2b`, `/a3`, `/a4`

Parked conductor **5602193** (A0) is also inactive. Studio Operations library intake pulses Python A2; A2 daisy-chains A2B → A3 → A4 in-process.

## Cutover

```
STAGE_BACKEND_A2=python
STAGE_BACKEND_A2B=python
STAGE_BACKEND_A3=python
STAGE_BACKEND_A4=python
```

PR: [#13](https://github.com/jtl6713/SM-Pipeline-V2/pull/13)  
Configure: [run 32743287446](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32743287446)  
Worker deploy: [run 32743183839](https://github.com/jtl6713/SM-Pipeline-V2/actions/runs/32743183839)

Make **5531974**, **5568863**, **5569035**, **5578180**, and parked **5602193** are **inactive** in `ARCHIVE_MOVED_TO_PYTHON`. Reactivate only for emergency rollback.

## Proof (2026-08-24)

| Check | Result |
| --- | --- |
| Isolated A2 live | Ingestion `python-a2-proof-20260824.png` → Media Asset [recGU30bCnJBN7YIr](https://airtable.com/appe33zkZn35yirTL/tblSITCujCsJTNcDe/recGU30bCnJBN7YIr) |
| Isolated A3 live | Same record Classified (Graphic / Reference Material) |
| Isolated A4 live | Healthy checkpoint on [recFQ5QoZnAy8MtGU](https://airtable.com/appe33zkZn35yirTL/tblSITCujCsJTNcDe/recFQ5QoZnAy8MtGU) |
| After runner restart | `POST /stages/a2` with `trigger_a2b=true`, `wait_for_next=true` returned `a2b.backend=python`, `a3.backend=python`, `a4.backend=python` |
| Daisy-chain volume | A2 0 files, A2B 0 backfill (117 existing Drive IDs), A3 0 classified, A4 20 healthy / 0 deleted |

Studio intake should return `triggered: "a2-python"` and must not 409 because Make A2 is off.

## Still Make

| Stage | Make ID | Why |
| --- | --- | --- |
| A1P | 5715500 | CloudConvert poll/finalize. Python exists; cut over after A1S posts `poller_url` to `/hooks/a1p/<token>` |
| A1S | 5715530 | On-demand oversized scan. Stays Make until A1P hook is live |
| A1M | 5764543 | On-demand duration probe in Backups |

Do **not** start AP0 **5612096**.
