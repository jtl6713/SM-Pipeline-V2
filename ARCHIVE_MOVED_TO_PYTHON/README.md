# ARCHIVE_MOVED_TO_PYTHON

Make.com scenarios replaced by `services/pipeline-runner/` (Python on `pipeline.chicagoshining.com`).

| Stage | Make scenario ID | Python path | Archived blueprint | Production |
| --- | --- | --- | --- | --- |
| SMV1 | 5894885 | `POST /stages/smv1` | `smv1-5894885-studio-media-variant-worker.json` | Python |
| R2 | 5569495 | `POST /stages/r2` | `r2-5569495-auto-asset-selection.json` | Python |
| R3 | 5557966 | `POST /stages/r3` | `r3-5557966-deterministic-render-prep.json` | Python |
| R4 | 5556716 | `POST /stages/r4` | `r4-5556716-start-remotion-render.json` | Python |
| R5 | 5565333 | `POST /stages/r5` | `r5-5565333-render-poller-final-upload.json` | Python |
| RR1 | 5576363 | `POST /stages/rr1` | `rr1-5576363-render-review-email.json` | Python |
| P2 | 5530955 | `POST /stages/p2` | Make blueprint retained (inactive) | Python |
| A0 | 5602193 | Python A2→A2B→A3→A4 daisy-chain | Parked conductor (inactive) | Python |
| A2 | 5531974 | `POST /stages/a2` | Make blueprint retained (inactive) | Python |
| A2B | 5568863 | `POST /stages/a2b` | Make blueprint retained (inactive) | Python |
| A3 | 5569035 | `POST /stages/a3` | Make blueprint retained (inactive) | Python |
| A4 | 5578180 | `POST /stages/a4` | Make blueprint retained (inactive) | Python |
| A1P | 5715500 | `POST /hooks/a1p/<token>` | Make blueprint retained (inactive) | Python |
| A1S | 5715530 | `POST /stages/a1s` | Make blueprint retained (inactive) | Python |
| A1M | 5764543 | `POST /stages/a1m` | Make blueprint retained (inactive) | Python |
| AP0 | 5612096 | `POST /stages/ap0` | Make blueprint retained (inactive) | Python |
| AP1-IG | 5862882 | `POST /stages/ap1_ig` | Make blueprint retained (inactive) | Python |
| AP1-IGS | 5612664 | `POST /stages/ap1_igs` | Make blueprint retained (inactive) | Python |
| AP1-IGS-POLL | 5845193 | `POST /stages/ap1_igs_poll` | Make blueprint retained (inactive) | Python |
| FBS1 | 5816409 | `POST /stages/fbs1` | Make blueprint retained (inactive) | Python |
| FBS2 | 5816495 | `POST /stages/fbs2` | Make blueprint retained (inactive) | Python |
| FBS3 | 5816502 | `POST /stages/fbs3` | Make blueprint retained (inactive) | Python |
| FBS4 | 5816520 | `POST /stages/fbs4` | Make blueprint retained (inactive) | Python |
| YT0 | 5823572 | `POST /stages/yt0` | Make blueprint retained (inactive) | Python |
| YTP1 | 5830810 | `POST /stages/ytp1` | Make blueprint retained (inactive) | Python |
| YTS1 | 5830609 | `POST /stages/yts1` | Make blueprint retained (inactive) | Python |
| YTS2 | 5830616 | `POST /stages/yts2` | Make blueprint retained (inactive) | Python |
| YTS3 | 5830623 | `POST /stages/yts3` | Make blueprint retained (inactive) | Python |
| TTD0 | 5806658 | `POST /stages/ttd0` | Make blueprint retained (inactive) | Python |
| TTD1 | 5806644 | `POST /stages/ttd1` | Make blueprint retained (inactive) | Python |
| TTD2 | 5806597 | `POST /stages/ttd2` | Make blueprint retained (inactive) | Python |
| TTD3 | 5806570 | `POST /stages/ttd3` | Make blueprint retained (inactive) | Python |
| TTD4 | 5806518 | `GET/POST /hooks/ttd4` | Make blueprint retained (inactive) | Python |
| FB0 | 5813436 | `POST /stages/fb0` | Make blueprint retained (inactive) | Python |
| FB1 | 5813463 | `POST /stages/fb1` | Make blueprint retained (inactive) | Python |
| FB2 | 5813487 | `POST /stages/fb2` | Make blueprint retained (inactive) | Python |
| FB2R | 5813511 | `POST /stages/fb2r` | Make blueprint retained (inactive) | Python |
| FB3 | 5813534 | `POST /stages/fb3` | Make blueprint retained (inactive) | Python |

Wave 2 cutover guide: `WAVE2_R3_R4_R5.md`  
Wave 3: `WAVE3_RR1.md`, `WAVE3_P2.md`  
Asset chain: `WAVE_ASSET.md`

## Cutover (2026-08-23)

Worker env vars:

```
STAGE_BACKEND_SMV1=python
STAGE_BACKEND_R2=python
STAGE_BACKEND_R3=python
STAGE_BACKEND_R4=python
STAGE_BACKEND_R5=python
STAGE_BACKEND_RR1=python
STAGE_BACKEND_P2=python
STAGE_BACKEND_A2=python
STAGE_BACKEND_A2B=python
STAGE_BACKEND_A3=python
STAGE_BACKEND_A4=python
STAGE_BACKEND_A1P=python
STAGE_BACKEND_A1S=python
STAGE_BACKEND_AP0=python
STAGE_BACKEND_AP1_IG=python
STAGE_BACKEND_AP1_IGS=python
STAGE_BACKEND_FBS1=python
STAGE_BACKEND_FBS3=python
STAGE_BACKEND_YT0=python
STAGE_BACKEND_TTD0=python
STAGE_BACKEND_FB0=python
STAGE_BACKEND_AP0C=python
PIPELINE_RUNNER_URL=https://pipeline.chicagoshining.com
PIPELINE_RUNNER_SHARED_SECRET=<secret>
```

Make scenarios **5557966**, **5556716**, **5565333**, **5576363**, **5530955**, **5602193**, **5531974**, **5568863**, **5569035**, **5578180**, **5715500**, **5715530**, **5764543**, **5612096**, **5862882**, **5612664**, **5845193**, **5816409**, **5816495**, **5816502**, **5816520**, **5823572**, **5830810**, **5830609**, **5830616**, **5830623**, **5806658**, **5806644**, **5806597**, **5806570**, **5806518**, **5813436**, **5813463**, **5813487**, **5813511**, **5813534**, **5786899**, **5790745**, **5791231**, **5791273**, **5791336**, **5791356**, **5791396**, and **5791424** are **inactive**. Reactivate only for emergency rollback. TTD-ORCH **5806668**, YT-ORCH **5823581**, FB-ORCH **5813561**, and AP-CAR-ORCH **5791537** stay parked.

## Rollback

1. Set `STAGE_BACKEND_SMV1=make` and/or `STAGE_BACKEND_R2=make` on `chicagoshining-studio-api`
2. Reactivate archived scenarios in Make from blueprints in this folder
3. Redeploy Worker without Python routing (or leave routing; Make wins when vars unset)

## Archive manifest

See `MANIFEST.json` for archive metadata and deactivation status.
