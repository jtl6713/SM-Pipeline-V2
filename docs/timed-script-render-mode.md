# Timed Script Render Mode

Timed Script Mode is a Production rendering mode for still-image videos whose scene times and narration are already written.

No Airtable schema change is required. The timeline is stored as a structured `[timed-script]` directive on the Production Request `Production_Notes` field, next to the existing `[render-settings]` and `[render-overrides]` directives. Studio strips that line before showing notes, so the notes box stays readable.

The directive is JSON:

```json
{
  "mode": "timed_script",
  "timing_mode": "authoritative",
  "timing_source": "timed_script",
  "duration_seconds": 90,
  "force_exact_voiceover": true,
  "segments": []
}
```

Each segment stores `start_seconds`, `end_seconds`, `duration_seconds`, `voiceover_text`, `suggested_visual`, `asset_id`, `speech_rate`, and `force_exact_voiceover`.

Imported boundaries are authoritative. Pacing, fixed image duration, beat sync, and voiceover-tail extension do not change them. Motion, transitions, fit, intensity, presets, and per-photo overrides still apply. Suggested-still text is assignment context and is never copied into the voiceover script. Saving a timed script sets Script control to Force exact and writes only the voiceover lines into Requested Script.

Narration fit is estimated at 150 words per minute. An overrun can be resolved by a slight speech-rate increase (capped at 1.15), by extending that scene, or by editing the words. The pipeline does not rewrite the text.

## Ideas: Create VO timeline

The Ideas page **Create VO timeline** button writes this table automatically. Studio ranks library stills for the open idea, asks the timed-script writer to pick specific Asset Names, and stores the `[timed-script]` directive plus those stills on a Production draft. Voiceover is on. Approve on Production to render. Nothing publishes from this button.

