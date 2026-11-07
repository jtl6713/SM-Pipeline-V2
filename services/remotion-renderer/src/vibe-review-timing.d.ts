export function clipFrameDurations(
  clips: Array<{durationFrames?: number}>,
  fps: number,
  studioRevision?: {source?: string},
): number[];
