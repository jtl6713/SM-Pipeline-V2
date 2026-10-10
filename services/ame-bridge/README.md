# Adobe Media Encoder watch-folder bridge

Local file watcher for Adobe Media Encoder 2026. Drop a working copy into a preset inbox. Media Encoder writes the encode to the matching output folder. After that output stops changing and `ffprobe` accepts it, the bridge deletes the inbox copy.

The inbox file is the working copy. The original stays in Drive, on the camera card, or in whatever folder you already keep it. This bridge never scans those locations.

Studio publish, approval, and the existing FFmpeg compressor are unchanged. Cloud fallback and a Studio compression-job queue are later stages.

## Layout

Default root: `D:\Content Creation\ChicagoShining Pipeline\Services\AME_Bridge`

```text
AME_Bridge/
  inbox/social-standard-9x16/     <- Media Encoder watch folder
  out/social-standard-9x16/       <- set this as the watch folder output
  state/completions.jsonl         <- sources removed, with byte counts
```

The same pair exists for `social-high-9x16`, `small-file-9x16`, `landscape-standard-16x9`, `landscape-high-16x9`, and `archive-master`.

If a watch folder is left on Media Encoder's default, the bridge also accepts `inbox/<preset>/Output/`.

## One-time Media Encoder setup

Installed editor: Adobe Media Encoder 2026 (26.5). It has to be open in a logged-on Windows session. Watch Folders do not run after sign-out.

1. Open Adobe Media Encoder.
2. Window → Watch Folders.
3. Add each `inbox/<preset>` folder.
4. Set that folder's output location to the matching `out/<preset>` folder.
5. Create an H.264 preset with the matching frame size, VBR target / max, AAC stereo 48 kHz, and frame rate based on the source. Progressive scan. Turn on fast start if the preset offers it.
6. Use `landscape-high-16x9` only for sources that are already 3840×2160. Do not upscale.
7. For `archive-master`, match the source frame and do not apply a social bitrate preset.

| Preset | Frame | Target / max |
|---|---|---|
| Social Standard 9:16 | 1080×1920 | 8 / 12 Mbps |
| Social High 9:16 | 1080×1920 | 14 / 20 Mbps |
| Small File 9:16 | 1080×1920 | 5 / 8 Mbps |
| Landscape Standard 16:9 | 1920×1080 | 10 / 16 Mbps |
| Landscape High 16:9 | 3840×2160 | 35 / 50 Mbps |
| Archive Master | source | no lossy social preset |

Drop only a copy. To keep a particular inbox file, place an empty `filename.ext.keep` next to it.

## Run

```powershell
cd services\ame-bridge
.\install-ame-bridge.ps1
```

The installer creates the folders, registers the logon task `SM-Pipeline AME Bridge`, and starts it. Health check: `http://127.0.0.1:3342/health`.

`POST /reconcile` with `{"dry_run": true}` reports what would be removed and leaves the inbox file in place.

Copy `ame-bridge.example.json` to `ame-bridge.local.json` to change the root, the 15-second stability window, or to turn deletion off. The local file stays untracked.
