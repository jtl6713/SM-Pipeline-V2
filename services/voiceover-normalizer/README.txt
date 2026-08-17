ChicagoShining Voiceover Normalizer v1.0.0

Purpose
- Normalizes ElevenLabs voiceover audio before Google Drive upload.
- Uses two-pass ffmpeg loudnorm measurement and normalization.
- Default target: -16 LUFS integrated, -1.5 dBTP, LRA 7.
- Runs independently on port 3012 so the validated Remotion render server is unchanged.

Prerequisites
- Node.js
- ffmpeg on PATH, or set FFMPEG_PATH to the full ffmpeg.exe path
- cloudflared on PATH for a temporary/public URL

Start
1. Run start-voiceover-normalizer.bat
2. Run test-health.ps1 or open http://localhost:3012/health
3. Run start-voiceover-tunnel.bat in a second window
4. Copy the generated https://...trycloudflare.com URL into Airtable Pipeline Settings:
   Setting_Name = Voiceover_Normalization_Service_URL
   Active = checked

Endpoints
GET  /health
POST /normalize-audio (raw MP3 body, Content-Type audio/mpeg)
GET  /files/<token> (one-time normalized MP3 download)

Request headers used by P2
X-Filename
X-Target-LUFS: -16
X-True-Peak-dBTP: -1.5
X-Target-LRA: 7
X-Output-Bitrate-Kbps: 128

The download token expires after 15 minutes and is deleted after successful download.
