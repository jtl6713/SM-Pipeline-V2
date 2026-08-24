# Local Video Compressor

Free local FFmpeg replacement for the CloudConvert step used by A1 oversized-video ingestion.

## Status

The service is deployed locally and exposed through its permanent Cloudflare route. Do **not** retire or disable the current CloudConvert A1 path until the exact A1 submit/poll replacement is validated on a disposable/test-only asset.

## Runtime

- Runtime path: `D:\Content Creation\ChicagoShining Pipeline\Services\Video_Compressor`
- Port: `3335`
- Public hostname: `https://compress.chicagoshining.com`
- Requires: Python 3, FFmpeg, FFprobe
- Python dependencies: Flask, requests, google-auth

## Contract

### `GET /health`

Returns service readiness including FFmpeg/FFprobe availability.

### `POST /compress`

Small JSON control request only. The original oversized file is downloaded by the local service from either an HTTPS URL or an authenticated private Google Drive file ID; it is **not** uploaded through Cloudflare.

Example:

```json
{
  "download_url": "https://...",
  "record_id": "recXXXXXXXXXXXXXX",
  "asset_name": "original.mov",
  "target_mb": 95,
  "max_width": 1080,
  "max_height": 1920,
  "audio_kbps": 128
}
```

For a private Google Drive original, provide `drive_file_id` instead of `download_url`:

```json
{
  "drive_file_id": "1j-QltV1ETljTtuYkapQ_AZJU9_lPG5YW",
  "record_id": "recXXXXXXXXXXXXXX",
  "asset_name": "Streeterville 1.mp4",
  "target_mb": 95
}
```

Exactly one source field is required. Existing `download_url` submissions remain supported.

Returns HTTP 202:

```json
{
  "ok": true,
  "job_id": "recXXXXXXXXXXXXXX_ab12cd34ef56",
  "status": "queued",
  "status_url": "https://compress.chicagoshining.com/jobs/...",
  "target_mb": 95
}
```

If `VIDEO_COMPRESSOR_API_KEY` is configured, send it as `X-Compression-Key` for `/compress`, `/jobs/*`, and `DELETE /jobs/*`.

### `GET /jobs/<job_id>`

Poll until `status` is `complete` or `failed`.

A successful terminal payload includes:

- `output_url`
- `output_filename`
- `output_size_bytes`
- `output_size_mb`
- `target_met`
- `compression_ratio`
- output dimensions and selected video/audio bitrate

### `GET /files/<job_id>/<filename>`

Downloads the completed MP4. A1/Make can use this URL to upload the compressed replacement into Google Drive.

### `DELETE /jobs/<job_id>`

Deletes the local completed output after Google Drive replacement has been verified. Active jobs cannot be deleted.

## Compression behavior

- H.264 (`libx264`), AAC audio, MP4 Fast Start
- two-pass bitrate targeting rather than credit-based conversion
- default output target is 95 MB to remain below the 100 MB ingestion threshold with headroom
- maximum dimensions default to 1080x1920 while preserving aspect ratio
- if the first output is still above target, a bounded second encode corrects the bitrate
- the original downloaded source is always removed from local work storage after the job finishes
- completed output remains until A1 verifies Drive upload and calls cleanup
- private Drive downloads use the read-only Drive API scope and never make the original public

## Private Google Drive credential

Store the service-account JSON only in the live runtime at:

```text
D:\Content Creation\ChicagoShining Pipeline\Services\Video_Compressor\credentials\google-drive-service-account.json
```

Do not copy it into the Git checkout. The repository ignores the credentials directory and the deployment installer preserves it in place without copying it into deployment backups. `start-video-compressor.bat` points `GOOGLE_DRIVE_CREDENTIALS_FILE` at this local file and sets the public response base to `https://compress.chicagoshining.com` by default; explicit environment values can override either setting.

Share only the private ingestion folder/files needed by the compressor with the service account. Writer access is sufficient, while the application itself requests only read-only Drive API access for downloads.

## Local install

From the runtime folder:

```powershell
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

Confirm `ffmpeg` and `ffprobe` are available on PATH, then run:

```powershell
.\start-video-compressor.bat
```

Verify:

```powershell
Invoke-RestMethod http://localhost:3335/health
```

Expected for the private-Drive-ready runtime: `ok=true`, `ffmpeg=true`, `ffprobe=true`, and `google_drive_private_downloads=true`. Public health remains available even when the credential is absent.

## A1 cutover plan

Keep CloudConvert live while validating the new path.

1. Deploy the service locally on port 3335.
2. Add the stable Cloudflare hostname `compress.chicagoshining.com -> http://localhost:3335`.
3. Verify local and public `/health`.
4. Clone/repair the existing A1 submit stage so its input/output state contract remains exact-record-addressable.
5. Replace CloudConvert submit with `POST /compress` using the same oversized asset's private Drive file ID and exact Airtable record ID.
6. Store the local `job_id` in the same bounded test record/state used for polling.
7. Replace CloudConvert polling with `GET /jobs/<job_id>`.
8. On `complete`, upload `output_url` to the existing Google Drive ingestion destination.
9. Verify the Drive file exists, is playable, and is below the configured size target before changing/deleting the original.
10. Call `DELETE /jobs/<job_id>` only after Drive verification succeeds.
11. Run a disposable/test-only end-to-end A1 validation with no publishing.
12. Only after validation, switch production A1 to local compression and retain CloudConvert as rollback until a second successful production ingestion.

## Safety rules

- Never delete the original merely because local compression completed.
- Original deletion/replacement remains owned by the existing A1 post-verification logic.
- Never run this against unrelated Airtable records during testing.
- Do not send oversized video bytes through the public control endpoint; submit only a download URL and metadata.
- Keep `MAX_CONCURRENT_JOBS=1` initially to avoid saturating the Windows host while Remotion or other media services are active.
