# Visual-Aware Voiceover & Clip Trimming — Phase 0/1 implementation map

Status: implementation branch only; production flag remains off by default.

## Existing authority and dependency chain

1. **Creative editor UI** — `apps/studio-web/index.html` and `apps/studio-web/assets/app-item4-1008.js`
   - Existing ordered Media / slide sequence.
   - Existing drag reorder, include/exclude, duration, per-slide voiceover and audio controls.
   - Existing rendered-preview review and explicit publishing approval gate.

2. **Studio Worker creative API** — `apps/studio-api/worker-functions-03.mjs`
   - `getOutputCreative` reads the current Platform Output, slides, voice catalog and review status.
   - `updateOutputCreative` is the existing persistence authority for review-time creative directives.
   - `phase6SlidesForOutput` resolves linked Carousel Slides or virtual selected assets.
   - `phase6BuildPreviewRenderPackage` is the existing handoff from saved creative state to the renderer.

3. **Existing persisted data**
   - Platform Output `Studio_Creative_Settings_JSON`: safe additive location for the canonical visual timeline snapshot in Phase 1.
   - Carousel Slide `Creative_Directives_JSON`: remains the existing per-slide creative store; no destructive schema migration is required for the Phase 1 foundation.
   - Prior voiceover URLs, render manifests and final-file references remain unchanged for rollback.

4. **Renderer** — `services/remotion-renderer/src/ChicagoShiningPhotoSequence.tsx`
   - Already accepts per-scene duration and per-scene voiceover.
   - Already omits VO/music duck intervals when a scene has no enabled voice source.
   - Already accepts video `startFromSeconds` / in-point and source-audio controls.
   - The scene Sequence duration supplies the selected out-point behavior without destructive source editing.

## Phase 1 canonical model

New pure module: `apps/studio-api/visual-timeline.mjs`.

The canonical timeline records stable scene identity, authoritative array order, include state, effective visual duration, `narrated|silent` VO mode, narration lock, clip source in/out, source duration, user-trim authority and native-audio policy.

The timeline has:
- monotonically advancing `revision`,
- deterministic `sequence_hash`,
- ordered included scene IDs,
- visual master-clock duration,
- narration-eligible intervals that intentionally contain gaps for silent scenes.

Narration wording is deliberately excluded from the visual sequence hash. Script revisioning will be implemented separately in Phase 3.

## Gating and compatibility

Environment flag: `STUDIO_VISUAL_TIMELINE_V1`.

Default behavior when unset/false:
- creative reads return the existing slide behavior;
- existing preview timing remains voiceover-measured;
- no new visual-timeline mutation is accepted;
- production behavior is unchanged.

When true:
- `getOutputCreative` returns the current canonical `visual_timeline`;
- timeline saves persist inside `Studio_Creative_Settings_JSON.visual_timeline`;
- stale base revision/hash is rejected;
- saved order/mute/trim state is re-applied when slides are loaded;
- preview render uses visual duration as master timing;
- a too-long narration fails review-time render preparation instead of changing the user's visual timing;
- video in-point passes to Remotion through `startFromSeconds`;
- no save automatically triggers TTS, render, approval, scheduling or publication.

## Rollback

Rollback is intentionally non-destructive:
1. Set `STUDIO_VISUAL_TIMELINE_V1` false or unset it.
2. Revert the Worker/UI release if needed.
3. Leave saved `visual_timeline` metadata in place; legacy readers ignore it.
4. Existing Carousel Slide directives, voiceover artifacts, render manifests and prior finished files remain available.

No Airtable field deletion or source-media mutation is part of Phase 1.

## Test coverage added

Pure tests cover:
- narration → silent scene → narration gap/resume;
- multiple, leading and trailing silent scenes;
- clip window slide while preserving duration;
- clip-bound validation including negative and beyond-source values;
- user-set trim authority;
- visual-only revision/hash semantics;
- stale revision/hash rejection;
- order persistence by stable scene identity;
- excluded scenes not extending the visual master clock.

Static integration-contract tests verify:
- the feature gate is wired into the existing creative API;
- persistence stays in the existing creative authority;
- no automatic TTS/render is started by a timeline save;
- preview packaging carries visual duration, clip in-point, silent mode and sequence hash;
- the current Remotion composition supports the required start-offset and scene-scoped VO behavior.

## Deliberately not enabled yet

Phase 1 foundation does **not** yet expose the new editor controls in production. Remaining gated increments:
- Phase 2: touch/desktop trim modal, filmstrip/waveform, exact selected-range preview and numeric timecode editing.
- Phase 3: current-vs-proposed visual-aware script regeneration, selected-scene mode, locks, explicit accept/discard and script version history.
- Phase 4: downstream TTS segment invalidation/reuse, full silent-window composition parity and end-to-end render fixtures.
- Phase 5: authenticated nonpublishing canary with flag enabled on a fixture.
- Phase 6: controlled rollout after CI/canary evidence.
