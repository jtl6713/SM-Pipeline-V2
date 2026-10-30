# Adobe Media Encoder watch-folder bridge

Local file watcher for Adobe Media Encoder 2026. A large Studio upload (Vibe Cut or finished video) copies the private master into the matching inbox by itself. Media Encoder writes the encode to the matching output folder. After that output stops changing and `ffprobe` accepts it, the bridge deletes the inbox copy and Studio uses the encoded file.

The inbox file is the working copy. The original stays in Drive, in Photos, or on the private master. This bridge never scans those locations. After a finished encode it also deletes the copy Media Encoder parks under `inbox/<preset>/Source`.

If Media Encoder is closed or is not watching the inbox, Studio removes the unclaimed copy and finishes the same upload with the existing FFmpeg compressor. Encoding still does not approve or publish.

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

## Studio source recovery

Studio compression prefers Adobe Media Encoder whenever the local listener on
`127.0.0.1:3344` is healthy. For a fresh uploaded video, the bridge reads a
private `studio/master-assets/` staging key. For a library-sourced video whose
temporary Studio staging key has already been removed, the runner instead reads
the existing authoritative **private Google Drive original** using its
authenticated Google Drive client. Neither path changes or trashes the Drive
original. If Media Encoder does not pick up the inbox copy, the existing local
FFmpeg compressor can use the same authenticated Drive file ID as fallback.

To verify the Chicago recovery example, inspect Production Request
`recZKifUsQgTQBwbR` (Chicago: Life Along the Waterfront) and the video
`Navy Pier Fireworks 12.mp4` (`59a9b4d684904e5382`). Its original is
118,105,125 bytes, stored in Drive, and there is **no** valid
`studio/master-assets/` staging key. A successful retry must show
`compression_status=ready`, a public `studio/previews/` URL,
`compression_provider=adobe-media-encoder` (or `ffmpeg` with an explicit
fallback reason), while preserving `google_drive_file_id` and the original
Drive file untouched. Do not manually fabricate a staging key or make the Drive
original public.

**Watch-folder warning:** Only folders under `AME_Bridge/inbox/` belong in
Media Encoder's Watch Folders list. The separate
`AME_Bridge/out/small-file-9x16` directory must **not** itself be a watch
folder: that can re-encode completed output. Every inbox should write to its
matching `AME_Bridge/out/<preset>` directory. The screenshot's
`archive-master` watch folder is assigned the portrait preset; change it to
a source-matching archive preset if archives are needed. Also confirm that the
standard, high, and small-file portrait presets have their own intended bitrate
targets, not merely the same displayed preset name.

`/health` confirms the Python bridge listener, **not** that the Adobe Media
Encoder GUI process is open, logged in, and actively watching. The safest live
validation is one exact source with an output/probe/readback, then the Studio
manifest status and URL. Do not release or publish any content during a
compression canary.

### Compression result contract

A source must become **smaller than 95 MiB** before Studio declares its
compressed preview Ready. A completed AME encode is not sufficient. The live
Chicago validation showed why: the first AME pass used the displayed
`Drone Portrait 1080p` preset and produced **147,069,566 bytes** from an
original **118,105,125-byte** clip. Runner v2 rejects an AME output larger
than the 95 MiB cap, uses the private local FFmpeg fallback, and refuses to
mark an oversized fallback Ready. Previously-Ready oversized AME outputs are
eligible for exactly-scoped private reprocessing without re-encoding through
the bad AME preset again.

To keep Adobe Media Encoder the successful primary encoder, adjust the
`social-standard-9x16` watch folder to a **real H.264 1080×1920 social preset
with VBR target 8 Mbps / max 12 Mbps** (AAC stereo at 48 kHz). The displayed
`Drone Portrait 1080p` name alone does not guarantee those bitrate values.
For videos longer than approximately 95 seconds, even 8 Mbps can exceed the
95 MiB size budget; the runner therefore still needs the output-size gate
and automatic fallback. The original Drive master is never replaced.

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

The bridge is local service `ame-bridge` on port **3344**. Windows sign-in runs `START ChicagoShining Services`, and that hidden start includes this listener with the others. STOP clears port 3344. The Ops Dashboard (`http://127.0.0.1:3361`) lists it as **AME Bridge** for status, start, restart, and stop. There is no public hostname.

```powershell
cd services\ame-bridge
.\install-ame-bridge.ps1
```

The installer only creates the watch folders. Health check: `http://127.0.0.1:3344/health`.

`POST /reconcile` with `{"dry_run": true}` reports what would be removed and leaves the inbox file in place.

Copy `ame-bridge.example.json` to `ame-bridge.local.json` to change the root, the 15-second stability window, or to turn deletion off. The local file stays untracked.
