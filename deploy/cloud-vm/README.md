# Free-tier cloud home for local SM services

Studio API, Studio web, R2, and crons stay on Cloudflare. Airtable and Google Drive stay the database and DAM. This folder runs the eight Windows media services as Linux containers so they can live on an Oracle Always Free Ampere VM without rewriting Workers.

Task Organizer stays on the Windows PC until this stack is stable.

## What this is

| Service | Container | Host port (loopback) | Public hostname |
| --- | --- | ---: | --- |
| Watermark | `watermark` | 3011 | `https://watermark.chicagoshining.com` |
| Voiceover Normalizer | `voiceover-normalizer` | 3012 | `https://voiceover.chicagoshining.com` |
| Remotion Renderer | `remotion-renderer` | 3333 | `https://render.chicagoshining.com` |
| Frame Extractor | `frame-extractor` | 3334 | `https://frames.chicagoshining.com` |
| Video Compressor | `video-compressor` | 3335 | `https://compress.chicagoshining.com` |
| Timing Engine | `timing-engine` | 3336 | `https://timing.chicagoshining.com` |
| YouTube Uploader | `youtube-uploader` | 3340 | `https://youtube-upload.chicagoshining.com` |
| Pipeline Runner | `pipeline-runner` | 3350 | `https://pipeline.chicagoshining.com` |

Scratch TTL: each Python/ffmpeg service sweeps its work dirs, Remotion keeps its 72-hour sweeper, and `scratch-ttl` is an independent hourly sidecar. The Python helper is canonical at `services/_shared/scratch_ttl.py`; this folder keeps a matching copy because its Docker context is `./scratch-ttl`. Do not persist photos, video, music, voiceovers, or thumbnails on the VM. Drive remains authority.

## Phase 1 — Docker on this PC (no Tunnel change)

Install Docker Desktop. From this folder:

```powershell
copy .env.example .env
# Optional: paste runtime secrets. Health checks work without them.
docker compose up -d --build watermark voiceover-normalizer
.\verify-health.sh
```

Git Bash or WSL can run `verify-health.sh`. On PowerShell, curl the same loopback `/health` URLs. Bring up more services when those two are healthy. Do not change Cloudflare Tunnel routes yet.

`network_mode: host` for `cloudflared` is Linux-only. Leave the `vm` profile off on Windows.

## Phase 2 — Oracle Always Free VM

1. Create an Always Free tenancy. Pick a region with Ampere capacity (often Ashburn or Phoenix).
2. Create **one** `VM.Standard.A1.Flex` instance: **2 OCPU / 12 GB RAM**. Do not go above that or Always Free may stop the instance.
3. Attach ~200 GB boot/block volume. Ubuntu 22.04 or 24.04 ARM.
4. VCN security list: **SSH (22) only**. Do not open 3011–3360.
5. In **Budgets**, create a **$1** alert on the compartment even though the target is $0.
6. SSH in, upload this repo or clone it, then:

```bash
sudo bash deploy/cloud-vm/bootstrap-oracle.sh
# fill deploy/cloud-vm/.env and secrets/google-drive-service-account.json
cd /opt/sm-pipeline/deploy/cloud-vm
docker compose --profile vm up -d --build
./verify-health.sh
./prove-arm-remotion.sh
```

Copy secrets from the Windows runtime `.env` files. Do not regenerate them in Git. YouTube OAuth may need a one-time re-consent if `GOOGLE_REDIRECT_URI` no longer matches Google Cloud.

`cloudflared` uses `TUNNEL_TOKEN` against the **existing** named tunnel `f7a22f0f-f760-4e16-a085-3538d22981f1`. Origins stay `http://localhost:<port>` and are evaluated on whichever machine runs the connector.

## Phase 3 — Dual-run hostname cutover

Cutover order (smallest blast radius first): watermark → voiceover → compressor → frames → timing → pipeline → YouTube → Remotion last.

1. Prove the container `/health` on the VM (`verify-health.sh`).
2. Stop the matching Windows `LOC` tab so two origins do not split traffic.
3. Run `cloudflared` on the VM (`docker compose --profile vm up -d`) **or** keep it on Windows and pass `--origin-url http://<tailscale-vm-ip>:<port>`.
4. Flip one hostname:

```bash
export CLOUDFLARE_API_TOKEN=...
python deploy/cloud-vm/switch_tunnel_origin.py --service watermark --origin vm
```

`--dry-run` prints the mapping. `--origin windows` flips back. GitHub workflow: **Switch Tunnel Origin**.

5. Public `https://<hostname>/health` must return `ok: true` before the next hostname.
6. Do **not** move `render.chicagoshining.com` until `./prove-arm-remotion.sh` passes. If Chromium/Remotion fails on Ampere, leave Remotion on Windows.

## Phase 4 — Windows standby

After all eight public `/health` checks pass from the VM connector, stop `1 LOC` through `8 LOC`. Keep START/STOP/VERIFY and `Deploy-SMService.ps1`. If Oracle dies, start Windows services and `python deploy/cloud-vm/switch_tunnel_origin.py --service <name> --origin windows` (or start Windows `cloudflared` with the same token).

## Phase 5 — escape hatch

If Ampere is too slow, the same `docker-compose.yml` runs on a Hetzner CX22 (~$5–8/month, x86). Azure is not the cheap path. Remotion Lambda stays a later optional render backend.

## Deploying a service from Git

On the VM, after an approved SHA is on `main`:

```bash
cd /opt/sm-pipeline
git fetch origin
git checkout <approved-sha>
cd deploy/cloud-vm
docker compose up -d --build <service-name>
```

Rebuild only the service you changed. Do not run production from the Windows Git checkout.

## Concurrency

Keep `MAX_CONCURRENT_JOBS=1`. Do not A1-compress and Remotion-render at the same time on 2 OCPU.
