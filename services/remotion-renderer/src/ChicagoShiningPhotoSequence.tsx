import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  OffthreadVideo,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  TransitionSeries,
  linearTiming,
  useTransitionProgress,
} from "@remotion/transitions";
import {fade} from "@remotion/transitions/fade";
import {slide} from "@remotion/transitions/slide";

export type PhotoSequenceTextStyle =
  | "Clean Documentary"
  | "3D Colorful"
  | "Black Gold Arched"
  | "Lower Third / Minimal"
  | "Cinematic White"
  | "Chicago Editorial"
  | "Glass Card"
  | "Bold Social";

export type PhotoSequenceTextPosition =
  | "top"
  | "center"
  | "bottom"
  | "lower-third"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";

export type PhotoSequenceTextAnimation =
  | "none"
  | "fade"
  | "pop"
  | "slide-up"
  | "reveal";

export type PhotoSequenceTextRole =
  | "caption"
  | "title-card"
  | "callout-card"
  | "end-card";

export type PhotoSequenceMotion =
  | "none"
  | "slowZoom"
  | "slowZoomOut"
  | "panLeft"
  | "panRight"
  | "panUp"
  | "panDown"
  | "kenBurnsLeft"
  | "kenBurnsRight";

export type PhotoSequenceAspectRatio =
  | "9:16"
  | "4:5"
  | "1:1"
  | "16:9";

export type PhotoSequenceFitMode =
  | "fill_crop"
  | "full_with_blur"
  | "full_with_solid_background";

export type PhotoSequenceFocalPoint =
  | "center"
  | "top"
  | "bottom"
  | "left"
  | "right"
  | "top-left"
  | "top-right"
  | "bottom-left"
  | "bottom-right";


export type PhotoSequenceTransitionType =
  | "none"
  | "fade"
  | "slideLeft"
  | "slideRight"
  | "zoom";

export type PhotoSequenceTransition = {
  type?: PhotoSequenceTransitionType;
  durationFrames?: number;
};

export type PhotoSequenceMusic = {
  enabled?: boolean;
  url?: string;
  src?: string;
  volume?: number;
  startFromSeconds?: number;
  duckingEnabled?: boolean;
  duckingMultiplier?: number;
  duckFadeFrames?: number;
  fadeInFrames?: number;
  fadeOutFrames?: number;
  loop?: boolean;
};

export type PhotoSequenceVoiceover = {
  enabled?: boolean;
  url?: string;
  src?: string;
  volume?: number;
};

export type ChicagoShiningPhotoClip = {
  id?: string;
  slideRecordId?: string;
  slideNumber?: string | number;
  order?: string | number;
  mediaKind?: "photo" | "video";
  media_kind?: "photo" | "video";
  inSeconds?: number;
  in_seconds?: number;
  startFromSeconds?: number;
  url?: string;
  src?: string;
  assetVariants?: Partial<Record<PhotoSequenceAspectRatio, string>>;
  fitMode?: PhotoSequenceFitMode;
  backgroundColor?: string;
  focalPoint?: PhotoSequenceFocalPoint;
  transition?: PhotoSequenceTransition;
  durationFrames?: number;
  motionStyle?: string;
  motion?: {
    type?: PhotoSequenceMotion;
  };
  voiceover?: {
    enabled?: boolean;
    url?: string;
    src?: string;
    volume?: number;
    measuredDurationSeconds?: number;
  };
  keepSourceAudio?: boolean;
  muted?: boolean;
  overlay?: {
    enabled?: boolean;
    text?: string;
    position?: PhotoSequenceTextPosition;
    size?: number;
    stylePreset?: PhotoSequenceTextStyle;
    animation?: PhotoSequenceTextAnimation;
    role?: PhotoSequenceTextRole;
    eyebrow?: string;
    subtitle?: string;
    brand?: string;
    accentText?: string;
    backgroundOpacity?: number;
    startFraction?: number;
    endFraction?: number;
    safeArea?: "default" | "tiktok-9x16";
  };
};

export type ChicagoShiningPhotoSequenceProps = {
  clips: ChicagoShiningPhotoClip[];
  transitionFrames?: number;
  endHoldFrames?: number;
  targetAspectRatio?: PhotoSequenceAspectRatio;
  width?: number;
  height?: number;
  defaultFitMode?: PhotoSequenceFitMode;
  defaultBackgroundColor?: string;
  music?: PhotoSequenceMusic;
  voiceover?: PhotoSequenceVoiceover;
  voiceoverDurationSeconds?: number;
  voiceoverEndFrame?: number;
  voiceoverText?: string;
  spokenCaptionsEnabled?: boolean;
  captionTrackMode?: "scene-overlay" | "voiceover-subtitles" | "none";
  spokenCaptionWordsPerPage?: number;
  titleText?: string;
  brandText?: string;
};

const clamp01 = (value: unknown, fallback: number): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(0, Math.min(1, parsed))
    : fallback;
};

const isVideoClip = (clip: ChicagoShiningPhotoClip): boolean => {
  const kind = String(clip.mediaKind || clip.media_kind || "").trim().toLowerCase();
  if (kind === "video") return true;
  if (kind === "photo" || kind === "image") return false;
  const src = String(clip.src || clip.url || "").toLowerCase();
  return /\.(mp4|mov|m4v|webm)(\?|#|$)/i.test(src);
};

const clipStartFromFrames = (clip: ChicagoShiningPhotoClip, fps: number): number => {
  const seconds = Number(
    clip.startFromSeconds ?? clip.inSeconds ?? clip.in_seconds ?? 0,
  );
  return Math.max(0, Math.round((Number.isFinite(seconds) ? seconds : 0) * fps));
};

const resolveSource = (value?: string): string | undefined => {
  const clean = String(value ?? "").trim();
  if (!clean) return undefined;
  return /^https?:\/\//i.test(clean)
    ? clean
    : staticFile(clean.replace(/^[/\\]+/, ""));
};

export const overlayTrackKey = (clip: ChicagoShiningPhotoClip): string => {
  const overlay = clip.overlay;
  const text = String(overlay?.text ?? "").trim();
  if (!overlay || overlay.enabled === false || !text) return "";
  return [
    text.toLowerCase(),
    String(overlay.role ?? "caption"),
    String(overlay.position ?? "lower-third"),
    String(overlay.stylePreset ?? "Clean Documentary"),
    String(overlay.size ?? 62),
    String(overlay.eyebrow ?? "").trim(),
    String(overlay.subtitle ?? "").trim(),
    String(overlay.brand ?? "").trim(),
    String(overlay.accentText ?? "").trim(),
  ].join("|");
};

export const persistentOverlayRuns = (
  clips: ChicagoShiningPhotoClip[],
  durations: number[],
): Array<{
  startFrame: number;
  durationInFrames: number;
  clipIndexes: number[];
  clip: ChicagoShiningPhotoClip;
}> => {
  const runs: Array<{
    startFrame: number;
    durationInFrames: number;
    clipIndexes: number[];
    clip: ChicagoShiningPhotoClip;
  }> = [];
  let index = 0;
  let startFrame = 0;
  while (index < clips.length) {
    const key = overlayTrackKey(clips[index]);
    const runIndexes = [index];
    let duration = Math.max(1, Math.round(Number(durations[index]) || 0));
    let cursor = index + 1;
    if (key) {
      while (cursor < clips.length && overlayTrackKey(clips[cursor]) === key) {
        runIndexes.push(cursor);
        duration += Math.max(1, Math.round(Number(durations[cursor]) || 0));
        cursor += 1;
      }
    }
    if (key && runIndexes.length >= 2) {
      runs.push({
        startFrame,
        durationInFrames: duration,
        clipIndexes: runIndexes,
        clip: clips[index],
      });
    }
    startFrame += key ? duration : Math.max(1, Math.round(Number(durations[index]) || 0));
    index = key ? cursor : index + 1;
  }
  return runs;
};

const aspectDimensions = (
  ratio?: PhotoSequenceAspectRatio,
): {width: number; height: number} => {
  switch (ratio) {
    case "4:5":
      return {width: 1080, height: 1350};
    case "1:1":
      return {width: 1080, height: 1080};
    case "16:9":
      return {width: 1920, height: 1080};
    case "9:16":
    default:
      return {width: 1080, height: 1920};
  }
};

const inferAspectRatioFromDimensions = (
  width?: number,
  height?: number,
): PhotoSequenceAspectRatio => {
  const w = Number(width);
  const h = Number(height);

  if (Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
    const ratio = w / h;
    const candidates: Array<{
      key: PhotoSequenceAspectRatio;
      value: number;
    }> = [
      {key: "9:16", value: 9 / 16},
      {key: "4:5", value: 4 / 5},
      {key: "1:1", value: 1},
      {key: "16:9", value: 16 / 9},
    ];

    candidates.sort(
      (a, b) => Math.abs(ratio - a.value) - Math.abs(ratio - b.value),
    );

    return candidates[0].key;
  }

  return "9:16";
};

const resolveMotionType = (
  clip: ChicagoShiningPhotoClip,
): PhotoSequenceMotion => {
  if (isVideoClip(clip)) return "none";

  // Stamp/Worker used to emit motionStyle "stillPhoto" for non-story stills.
  // That token was not in this switch, so it fell through to slowZoom and Ken
  // Burns ~4.5% into already fill-cropped 9:16 variants.
  switch (String(clip.motion?.type ?? clip.motionStyle ?? "").trim().toLowerCase()) {
    case "none":
    case "still":
    case "stillphoto":
    case "still_photo":
    case "photo_sequence_hold":
    case "photo_sequence_static":
      return "none";
    case "slow_zoom_out":
    case "slowzoomout":
      return "slowZoomOut";
    case "slow_pan_left":
    case "panleft":
      return "panLeft";
    case "slow_pan_right":
    case "panright":
      return "panRight";
    case "slow_pan_up":
    case "panup":
      return "panUp";
    case "slow_pan_down":
    case "pandown":
      return "panDown";
    case "ken_burns_left":
    case "kenburnsleft":
      return "kenBurnsLeft";
    case "ken_burns_right":
    case "kenburnsright":
      return "kenBurnsRight";
    case "slow_zoom_in":
    case "slow_zoom":
    case "slowzoom":
      return "slowZoom";
    default:
      return "none";
  }
};

const focalPointToObjectPosition = (
  focalPoint?: PhotoSequenceFocalPoint,
): string => {
  switch (focalPoint) {
    case "top":
      return "50% 20%";
    case "bottom":
      return "50% 80%";
    case "left":
      return "20% 50%";
    case "right":
      return "80% 50%";
    case "top-left":
      return "20% 20%";
    case "top-right":
      return "80% 20%";
    case "bottom-left":
      return "20% 80%";
    case "bottom-right":
      return "80% 80%";
    case "center":
    default:
      return "50% 50%";
  }
};

const resolveClipSource = (
  clip: ChicagoShiningPhotoClip,
  targetAspectRatio: PhotoSequenceAspectRatio,
): string | undefined => {
  const preferredVariant = clip.assetVariants?.[targetAspectRatio];
  return resolveSource(preferredVariant ?? clip.src ?? clip.url);
};

const safeAreaPadding = (
  ratio: PhotoSequenceAspectRatio,
  mode?: "default" | "tiktok-9x16",
): {top: number; right: number; bottom: number; left: number} => {
  if (mode === "tiktok-9x16") {
    return {top: 285, right: 78, bottom: 285, left: 78};
  }
  switch (ratio) {
    case "16:9":
      return {top: 70, right: 120, bottom: 80, left: 120};
    case "1:1":
      return {top: 90, right: 80, bottom: 100, left: 80};
    case "4:5":
      return {top: 115, right: 76, bottom: 145, left: 76};
    case "9:16":
    default:
      return {top: 190, right: 78, bottom: 270, left: 78};
  }
};

const positionStyle = (
  position: PhotoSequenceTextPosition,
  ratio: PhotoSequenceAspectRatio,
  mode?: "default" | "tiktok-9x16",
): React.CSSProperties => {
  const safe = safeAreaPadding(ratio, mode);
  const base: React.CSSProperties = {
    position: "absolute",
    display: "flex",
    paddingLeft: safe.left,
    paddingRight: safe.right,
    paddingTop: safe.top,
    paddingBottom: safe.bottom,
    width: "100%",
    height: "100%",
  };

  switch (position) {
    case "top":
      return {...base, justifyContent: "flex-start", alignItems: "center"};
    case "bottom":
      return {...base, justifyContent: "flex-end", alignItems: "center"};
    case "lower-third":
      return {
        ...base,
        justifyContent: "flex-end",
        alignItems: "flex-start",
        paddingBottom: safe.bottom + 40,
      };
    case "top-left":
      return {...base, justifyContent: "flex-start", alignItems: "flex-start"};
    case "top-right":
      return {...base, justifyContent: "flex-start", alignItems: "flex-end"};
    case "bottom-left":
      return {...base, justifyContent: "flex-end", alignItems: "flex-start"};
    case "bottom-right":
      return {...base, justifyContent: "flex-end", alignItems: "flex-end"};
    case "center":
    default:
      return {...base, justifyContent: "center", alignItems: "center"};
  }
};

const presetStyle = (
  preset: PhotoSequenceTextStyle,
  size: number,
): React.CSSProperties => {
  const common: React.CSSProperties = {
    fontFamily: "Arial, Helvetica, sans-serif",
    fontSize: size,
    fontWeight: 900,
    lineHeight: 1.04,
    textAlign: "center",
    maxWidth: 920,
    overflowWrap: "anywhere",
  };

  switch (preset) {
    case "3D Colorful":
      return {
        ...common,
        color: "#fff36a",
        WebkitTextStroke: "5px #24105f",
        textShadow:
          "4px 5px 0 #ff3b8d, 8px 10px 0 #11b5e4, 0 18px 28px rgba(0,0,0,.86)",
      };
    case "Black Gold Arched":
      return {
        ...common,
        color: "#f5c451",
        WebkitTextStroke: "5px #090909",
        textShadow:
          "0 7px 0 #6e4600, 0 13px 20px rgba(0,0,0,.92), 0 0 8px rgba(255,205,92,.75)",
        transform: "perspective(800px) rotateX(-5deg)",
        letterSpacing: 1,
      };
    case "Lower Third / Minimal":
      return {
        ...common,
        color: "white",
        fontWeight: 800,
        textAlign: "left",
        textShadow: "0 3px 12px rgba(0,0,0,.9)",
        backgroundColor: "rgba(0,0,0,.70)",
        borderLeft: "12px solid white",
        borderRadius: 12,
        padding: "18px 24px",
      };
    case "Cinematic White":
      return {
        ...common,
        color: "white",
        fontWeight: 800,
        letterSpacing: 2,
        textTransform: "uppercase",
        textShadow: "0 5px 24px rgba(0,0,0,.95)",
      };
    case "Chicago Editorial":
      return {
        ...common,
        color: "#ffffff",
        fontWeight: 900,
        lineHeight: 0.98,
        letterSpacing: -1.2,
        textShadow: "0 5px 18px rgba(0,0,0,.88)",
        borderBottom: "8px solid #f4c54f",
        padding: "18px 10px 22px",
      };
    case "Glass Card":
      return {
        ...common,
        color: "white",
        fontWeight: 800,
        backgroundColor: "rgba(12,18,27,.68)",
        border: "2px solid rgba(255,255,255,.35)",
        borderRadius: 28,
        padding: "28px 34px",
        boxShadow: "0 22px 70px rgba(0,0,0,.48)",
        textShadow: "0 3px 12px rgba(0,0,0,.75)",
      };
    case "Bold Social":
      return {
        ...common,
        color: "#ffffff",
        fontWeight: 950,
        WebkitTextStroke: "3px #0a0a0a",
        backgroundColor: "rgba(0,0,0,.50)",
        borderRadius: 18,
        padding: "18px 28px",
        boxShadow: "8px 9px 0 rgba(244,197,79,.92)",
        textShadow: "0 5px 14px rgba(0,0,0,.9)",
      };
    case "Clean Documentary":
    default:
      return {
        ...common,
        color: "white",
        fontWeight: 850,
        textShadow: "0 4px 16px rgba(0,0,0,.92)",
        backgroundColor: "rgba(0,0,0,.44)",
        borderRadius: 20,
        padding: "22px 28px",
      };
  }
};

const AnimatedText: React.FC<{
  text: string;
  preset: PhotoSequenceTextStyle;
  position: PhotoSequenceTextPosition;
  size: number;
  animation: PhotoSequenceTextAnimation;
  role: PhotoSequenceTextRole;
  eyebrow?: string;
  subtitle?: string;
  brand?: string;
  accentText?: string;
  backgroundOpacity?: number;
  durationInFrames: number;
  targetAspectRatio: PhotoSequenceAspectRatio;
  safeArea?: "default" | "tiktok-9x16";
}> = ({
  text,
  preset,
  position,
  size,
  animation,
  role,
  eyebrow,
  subtitle,
  brand,
  accentText,
  backgroundOpacity,
  durationInFrames,
  targetAspectRatio,
  safeArea,
}) => {
  const frame = useCurrentFrame();
  const {fps} = useVideoConfig();
  const fadeFrames = Math.max(4, Math.round(fps * 0.25));

  const fadeIn = interpolate(
    frame,
    [0, fadeFrames],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  const fadeOut = interpolate(
    frame,
    [
      Math.max(0, durationInFrames - fadeFrames),
      Math.max(1, durationInFrames - 1),
    ],
    [1, 0],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  const progress = spring({
    frame,
    fps,
    config: {damping: 16, stiffness: 130},
  });

  const animationTransform =
    animation === "pop"
      ? `scale(${0.78 + progress * 0.22})`
      : animation === "slide-up" || animation === "reveal"
        ? `translateY(${(1 - progress) * 65}px)`
        : undefined;

  const opacity = animation === "none" ? 1 : Math.min(fadeIn, fadeOut);
  const basePreset = presetStyle(preset, size);
  const combinedTransform = animationTransform
    ? basePreset.transform
      ? `${basePreset.transform} ${animationTransform}`
      : animationTransform
    : basePreset.transform;

  const isCard = role !== "caption";
  const panelOpacity = clampNumber(backgroundOpacity, 0, 0.9, role === "end-card" ? 0.72 : 0.48);
  const cardContainer: React.CSSProperties = isCard
    ? {
        width: role === "callout-card" ? "88%" : "92%",
        maxWidth: targetAspectRatio === "16:9" ? 1280 : 940,
        borderRadius: 30,
        padding: role === "callout-card" ? "30px 34px" : "42px 42px",
        backgroundColor: `rgba(0,0,0,${panelOpacity})`,
        border: "1px solid rgba(255,255,255,.24)",
        boxShadow: "0 24px 90px rgba(0,0,0,.45)",
      }
    : {};

  return (
    <AbsoluteFill
      style={{
        ...positionStyle(position, targetAspectRatio, safeArea),
        pointerEvents: "none",
        opacity,
      }}
    >
      <div style={cardContainer}>
        {eyebrow ? (
          <div
            style={{
              color: "#f4c54f",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: Math.max(22, Math.round(size * 0.34)),
              fontWeight: 900,
              textTransform: "uppercase",
              letterSpacing: 4,
              marginBottom: 14,
              textAlign: "center",
              textShadow: "0 2px 10px rgba(0,0,0,.8)",
            }}
          >
            {eyebrow}
          </div>
        ) : null}

        <div
          style={{
            ...basePreset,
            transform: combinedTransform,
            marginLeft: "auto",
            marginRight: "auto",
          }}
        >
          {text}
        </div>

        {accentText ? (
          <div
            style={{
              marginTop: 14,
              color: "#f4c54f",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: Math.max(26, Math.round(size * 0.48)),
              fontWeight: 900,
              textAlign: "center",
              letterSpacing: 0.5,
            }}
          >
            {accentText}
          </div>
        ) : null}

        {subtitle ? (
          <div
            style={{
              marginTop: 18,
              color: "rgba(255,255,255,.92)",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: Math.max(24, Math.round(size * 0.42)),
              fontWeight: 650,
              lineHeight: 1.22,
              textAlign: "center",
              textShadow: "0 3px 12px rgba(0,0,0,.82)",
            }}
          >
            {subtitle}
          </div>
        ) : null}

        {brand ? (
          <div
            style={{
              marginTop: 22,
              color: "white",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: Math.max(20, Math.round(size * 0.30)),
              fontWeight: 800,
              textTransform: "uppercase",
              letterSpacing: 3,
              textAlign: "center",
              opacity: 0.9,
            }}
          >
            {brand}
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const MediaFill: React.FC<{
  clip: ChicagoShiningPhotoClip;
  source: string;
  style: React.CSSProperties;
}> = ({clip, source, style}) => {
  const {fps} = useVideoConfig();
  if (isVideoClip(clip)) {
    const keepSourceAudio = Boolean(clip.keepSourceAudio) || clip.muted === false;
    return (
      <OffthreadVideo
        src={source}
        muted={!keepSourceAudio}
        volume={keepSourceAudio ? 1 : 0}
        startFrom={clipStartFromFrames(clip, fps)}
        style={style}
      />
    );
  }
  return <Img src={source} style={style} />;
};

const ImageSegment: React.FC<{
  clip: ChicagoShiningPhotoClip;
  source: string;
  durationInFrames: number;
  entryTransitionType?: PhotoSequenceTransitionType;
  exitTransitionType?: PhotoSequenceTransitionType;
  introTransitionType?: PhotoSequenceTransitionType;
  introTransitionFrames?: number;
  defaultFitMode: PhotoSequenceFitMode;
  defaultBackgroundColor: string;
  targetAspectRatio: PhotoSequenceAspectRatio;
  suppressOverlay?: boolean;
}> = ({
  clip,
  source,
  durationInFrames,
  entryTransitionType,
  exitTransitionType,
  introTransitionType,
  introTransitionFrames = 1,
  defaultFitMode,
  defaultBackgroundColor,
  targetAspectRatio,
  suppressOverlay = false,
}) => {
  const frame = useCurrentFrame();
  const {entering, exiting} = useTransitionProgress();

  const motionType = resolveMotionType(clip);
  const progress = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );

  const motionScale =
    motionType === "none"
      ? 1
      : motionType === "slowZoomOut"
        ? 1.045 - 0.045 * progress
        : motionType === "panLeft" ||
            motionType === "panRight" ||
            motionType === "panUp" ||
            motionType === "panDown"
          ? 1.08
          : motionType === "kenBurnsLeft" ||
              motionType === "kenBurnsRight"
            ? 1 + 0.07 * progress
            : 1 + 0.045 * progress;

  const translateX =
    motionType === "panLeft"
      ? 4 - 8 * progress
      : motionType === "panRight"
        ? -4 + 8 * progress
        : motionType === "kenBurnsLeft"
          ? 3 - 6 * progress
          : motionType === "kenBurnsRight"
            ? -3 + 6 * progress
            : 0;

  const translateY =
    motionType === "panUp"
      ? 4 - 8 * progress
      : motionType === "panDown"
        ? -4 + 8 * progress
        : 0;

  const mediaTransform =
    `translate(${translateX}%, ${translateY}%) scale(${motionScale})`;

  // TransitionSeries owns overlap, opacity, and slide geometry.  Zoom keeps
  // the historical scale character while taking its progress from the native
  // transition context instead of from a per-scene faux fade.
  const transitionEntryScale =
    entryTransitionType === "zoom" ? 0.96 + entering * 0.04 : 1;
  const transitionExitScale =
    exitTransitionType === "zoom" ? 1 + exiting * 0.03 : 1;
  const nativeTransitionScale = transitionEntryScale * transitionExitScale;

  // Preserve the pre-existing first-scene reveal. There is no adjacent scene
  // before clip 1, so this is an intro reveal rather than an interscene
  // transition; all actual scene-to-scene transitions are owned by
  // TransitionSeries.
  const introFrames = Math.max(1, Math.round(introTransitionFrames));
  const introProgress = interpolate(
    frame,
    [0, introFrames],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"},
  );
  const introOpacity =
    !introTransitionType || introTransitionType === "none"
      ? 1
      : introTransitionType === "fade"
        ? introProgress
        : Math.min(1, 0.4 + introProgress * 0.6);
  const introTranslateX =
    introTransitionType === "slideLeft"
      ? (1 - introProgress) * 12
      : introTransitionType === "slideRight"
        ? -(1 - introProgress) * 12
        : 0;
  const introScale =
    introTransitionType === "zoom" ? 0.96 + introProgress * 0.04 : 1;

  const overlay = clip.overlay;
  const text = String(overlay?.text ?? "").trim();
  const start = Math.round(
    durationInFrames * clamp01(overlay?.startFraction, 0),
  );
  const end = Math.round(
    durationInFrames * clamp01(overlay?.endFraction, 1),
  );
  const overlayDuration = Math.max(1, end - start);

  const voiceover = clip.voiceover;
  const voiceSource = resolveSource(voiceover?.src ?? voiceover?.url);
  const requestedVoiceVolume = Number(voiceover?.volume);
  const voiceVolume = Number.isFinite(requestedVoiceVolume)
    ? Math.max(0, Math.min(2, requestedVoiceVolume))
    : 1;

  const fitMode = clip.fitMode ?? defaultFitMode;
  const backgroundColor =
    String(clip.backgroundColor ?? defaultBackgroundColor).trim() || "black";
  const objectPosition = focalPointToObjectPosition(clip.focalPoint);

  return (
    <AbsoluteFill
      style={{
        backgroundColor: "black",
        opacity: introOpacity,
        transform: `translateX(${introTranslateX}%) scale(${introScale * nativeTransitionScale})`,
      }}
    >
      {fitMode === "full_with_blur" ? (
        <>
          <MediaFill
            clip={clip}
            source={source}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition,
              filter: "blur(34px) brightness(.58)",
              transform: "scale(1.12)",
            }}
          />
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
              padding: "4%",
            }}
          >
            <MediaFill
              clip={clip}
              source={source}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                objectPosition,
                transform: mediaTransform,
                boxShadow: "0 18px 70px rgba(0,0,0,.42)",
              }}
            />
          </AbsoluteFill>
        </>
      ) : fitMode === "full_with_solid_background" ? (
        <AbsoluteFill
          style={{
            backgroundColor,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <MediaFill
            clip={clip}
            source={source}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              objectPosition,
              transform: mediaTransform,
            }}
          />
        </AbsoluteFill>
      ) : (
        <MediaFill
          clip={clip}
          source={source}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition,
            transform: mediaTransform,
          }}
        />
      )}

      {voiceover?.enabled !== false && voiceSource ? (
        <Sequence durationInFrames={durationInFrames}>
          <Audio
            src={voiceSource}
            volume={voiceVolume}
          />
        </Sequence>
      ) : null}

      {!suppressOverlay && overlay?.enabled !== false && text && end > start ? (
        <Sequence
          from={start}
          durationInFrames={overlayDuration}
        >
          <AnimatedText
            text={text}
            preset={overlay?.stylePreset ?? "Clean Documentary"}
            position={overlay?.position ?? "lower-third"}
            size={Math.max(
              34,
              Math.min(120, Number(overlay?.size) || 62),
            )}
            animation={overlay?.animation ?? "fade"}
            role={overlay?.role ?? "caption"}
            eyebrow={String(overlay?.eyebrow ?? "").trim() || undefined}
            subtitle={String(overlay?.subtitle ?? "").trim() || undefined}
            brand={String(overlay?.brand ?? "").trim() || undefined}
            accentText={String(overlay?.accentText ?? "").trim() || undefined}
            backgroundOpacity={overlay?.backgroundOpacity}
            durationInFrames={overlayDuration}
            targetAspectRatio={targetAspectRatio}
            safeArea={overlay?.safeArea}
          />
        </Sequence>
      ) : null}
    </AbsoluteFill>
  );
};

const clampNumber = (
  value: unknown,
  min: number,
  max: number,
  fallback: number,
): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? Math.max(min, Math.min(max, parsed))
    : fallback;
};

type NativeBoundaryTransition = {
  type: Exclude<PhotoSequenceTransitionType, "none">;
  durationFrames: number;
};

const resolveBoundaryTransition = ({
  incomingClip,
  defaultTransitionFrames,
  outgoingDurationFrames,
  incomingDurationFrames,
}: {
  incomingClip: ChicagoShiningPhotoClip;
  defaultTransitionFrames: number;
  outgoingDurationFrames: number;
  incomingDurationFrames: number;
}): NativeBoundaryTransition | null => {
  // A transition is attached to the clip being entered. This gives each cut
  // exactly one deterministic presentation while preserving the Studio clip
  // contract and the existing global transitionFrames fallback.
  const type = incomingClip.transition?.type ?? "fade";
  if (type === "none") return null;

  const requested = Number(incomingClip.transition?.durationFrames);
  const fallback = Math.max(1, Math.round(defaultTransitionFrames));
  const requestedFrames = Number.isFinite(requested)
    ? Math.max(1, Math.round(requested))
    : fallback;

  // Remotion requires the transition to be shorter than both adjacent scenes.
  const maxSafeFrames = Math.max(
    1,
    Math.min(outgoingDurationFrames - 1, incomingDurationFrames - 1),
  );

  return {
    type,
    durationFrames: Math.min(requestedFrames, maxSafeFrames),
  };
};

const getVoiceoverIntervals = (
  clips: ChicagoShiningPhotoClip[],
  fps: number,
): Array<{start: number; end: number}> => {
  const intervals: Array<{start: number; end: number}> = [];
  let cursor = 0;

  for (const clip of clips) {
    const duration = Math.max(
      1,
      Math.round(Number(clip.durationFrames) || fps * 3),
    );
    const voiceSource = resolveSource(
      clip.voiceover?.src ?? clip.voiceover?.url,
    );
    const measured = Number(clip.voiceover?.measuredDurationSeconds);

    if (clip.voiceover?.enabled !== false && voiceSource) {
      const voiceFrames =
        Number.isFinite(measured) && measured > 0
          ? Math.min(duration, Math.ceil(measured * fps))
          : duration;

      intervals.push({
        start: cursor,
        end: cursor + Math.max(1, voiceFrames),
      });
    }

    cursor += duration;
  }

  return intervals;
};

const getMusicVolume = ({
  frame,
  totalFrames,
  baseVolume,
  duckingEnabled,
  duckingMultiplier,
  duckFadeFrames,
  fadeInFrames,
  fadeOutFrames,
  voiceoverIntervals,
}: {
  frame: number;
  totalFrames: number;
  baseVolume: number;
  duckingEnabled: boolean;
  duckingMultiplier: number;
  duckFadeFrames: number;
  fadeInFrames: number;
  fadeOutFrames: number;
  voiceoverIntervals: Array<{start: number; end: number}>;
}): number => {
  let multiplier = 1;

  if (fadeInFrames > 0) {
    multiplier *= Math.max(0, Math.min(1, frame / fadeInFrames));
  }

  if (fadeOutFrames > 0) {
    const remaining = Math.max(0, totalFrames - 1 - frame);
    multiplier *= Math.max(0, Math.min(1, remaining / fadeOutFrames));
  }

  if (duckingEnabled) {
    let duck = 1;

    for (const interval of voiceoverIntervals) {
      if (frame >= interval.start && frame < interval.end) {
        duck = Math.min(duck, duckingMultiplier);
        continue;
      }

      if (
        duckFadeFrames > 0 &&
        frame >= interval.start - duckFadeFrames &&
        frame < interval.start
      ) {
        const p = Math.max(
          0,
          Math.min(
            1,
            (frame - (interval.start - duckFadeFrames)) / duckFadeFrames,
          ),
        );
        duck = Math.min(
          duck,
          1 - (1 - duckingMultiplier) * p,
        );
      }

      if (
        duckFadeFrames > 0 &&
        frame >= interval.end &&
        frame < interval.end + duckFadeFrames
      ) {
        const p = Math.max(
          0,
          Math.min(1, (frame - interval.end) / duckFadeFrames),
        );
        duck = Math.min(
          duck,
          duckingMultiplier + (1 - duckingMultiplier) * p,
        );
      }
    }

    multiplier *= duck;
  }

  return Math.max(0, baseVolume * multiplier);
};

const SpokenCaptionTrack: React.FC<{
  text: string;
  totalFrames: number;
  endFrame: number;
  wordsPerPage: number;
  targetAspectRatio: PhotoSequenceAspectRatio;
}> = ({
  text,
  totalFrames,
  endFrame,
  wordsPerPage,
  targetAspectRatio,
}) => {
  const words = String(text ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (words.length === 0) return null;

  const safeWordsPerPage = Math.max(
    2,
    Math.min(8, Math.round(Number(wordsPerPage) || 4)),
  );
  const pages: string[] = [];

  for (let index = 0; index < words.length; index += safeWordsPerPage) {
    pages.push(words.slice(index, index + safeWordsPerPage).join(" "));
  }

  const captionFrames = Math.max(
    1,
    Math.min(totalFrames, Math.round(Number(endFrame) || totalFrames)),
  );

  return (
    <>
      {pages.map((page, index) => {
        const start = Math.round((index * captionFrames) / pages.length);
        const end = Math.round(((index + 1) * captionFrames) / pages.length);

        return (
          <Sequence
            key={`${index}-${page}`}
            from={start}
            durationInFrames={Math.max(1, end - start)}
          >
            <AnimatedText
              text={page}
              preset="Bold Social"
              position="bottom"
              size={targetAspectRatio === "16:9" ? 68 : 62}
              animation="fade"
              role="caption"
              backgroundOpacity={0.78}
              durationInFrames={Math.max(1, end - start)}
              targetAspectRatio={targetAspectRatio}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const PersistentBrandWatermark: React.FC<{
  text: string;
  targetAspectRatio: PhotoSequenceAspectRatio;
}> = ({text, targetAspectRatio}) => {
  const label = String(text ?? "").trim();
  if (!label) return null;
  const compact = targetAspectRatio === "16:9";
  return (
    <AbsoluteFill
      style={{
        pointerEvents: "none",
        alignItems: "flex-start",
        justifyContent: "flex-start",
        paddingTop: compact ? "3.2%" : "5.0%",
        paddingLeft: compact ? "2.4%" : "4.0%",
        zIndex: 1000,
      }}
    >
      <div
        data-brand-watermark="persistent"
        style={{
          color: "rgba(255,255,255,.96)",
          fontFamily: "Arial, Helvetica, sans-serif",
          fontSize: compact ? 30 : 34,
          fontWeight: 850,
          letterSpacing: 1.1,
          lineHeight: 1,
          padding: compact ? "8px 13px" : "9px 15px",
          borderRadius: 999,
          backgroundColor: "rgba(0,0,0,.28)",
          border: "1px solid rgba(255,255,255,.32)",
          boxShadow: "0 3px 16px rgba(0,0,0,.34)",
          textShadow: "0 2px 8px rgba(0,0,0,.82)",
          opacity: 0.84,
        }}
      >
        {label}
      </div>
    </AbsoluteFill>
  );
};

export const ChicagoShiningPhotoSequence:
React.FC<ChicagoShiningPhotoSequenceProps> = ({
  clips,
  transitionFrames = 12,
  endHoldFrames = 0,
  targetAspectRatio,
  width,
  height,
  defaultFitMode = "fill_crop",
  defaultBackgroundColor = "black",
  music,
  voiceover,
  voiceoverDurationSeconds,
  voiceoverEndFrame,
  voiceoverText = "",
  spokenCaptionsEnabled = false,
  captionTrackMode = "scene-overlay",
  spokenCaptionWordsPerPage = 4,
  titleText = "",
  brandText = "",
}) => {
  const {fps} = useVideoConfig();

  const resolvedTargetAspectRatio =
    targetAspectRatio ?? inferAspectRatioFromDimensions(width, height);

  const safeClips = Array.isArray(clips)
    ? clips.filter((clip) =>
        Boolean(resolveClipSource(clip, resolvedTargetAspectRatio)),
      )
    : [];

  if (safeClips.length === 0) {
    throw new Error(
      "ChicagoShiningPhotoSequence requires at least one visual clip.",
    );
  }

  const musicSource = resolveSource(music?.src ?? music?.url);
  const musicEnabled = music?.enabled !== false && Boolean(musicSource);
  const baseMusicVolume = clampNumber(music?.volume, 0, 2, 0.042);
  const duckingMultiplier = clampNumber(
    music?.duckingMultiplier,
    0,
    1,
    0.35,
  );
  const duckFadeFrames = Math.max(
    0,
    Math.round(
      clampNumber(music?.duckFadeFrames, 0, fps * 3, fps * 0.2),
    ),
  );
  const fadeInFrames = Math.max(
    0,
    Math.round(
      clampNumber(music?.fadeInFrames, 0, fps * 5, fps * 0.5),
    ),
  );
  const fadeOutFrames = Math.max(
    0,
    Math.round(
      clampNumber(music?.fadeOutFrames, 0, fps * 5, fps * 0.5),
    ),
  );
  const baseDurations = safeClips.map((clip) => {
    const requested = Number(clip.durationFrames);
    return Number.isFinite(requested)
      ? Math.max(fps, Math.round(requested))
      : fps * 3;
  });

  const normalizedEndHoldFrames = Math.max(0, Math.round(endHoldFrames));
  const contentDurations = baseDurations.map((duration, index) =>
    index === safeClips.length - 1
      ? duration + normalizedEndHoldFrames
      : duration,
  );
  const liftedOverlayRuns = persistentOverlayRuns(safeClips, contentDurations);
  const liftedOverlayClips = new Set(
    liftedOverlayRuns.flatMap((run) => run.clipIndexes),
  );

  const boundaryTransitions: Array<NativeBoundaryTransition | null> =
    safeClips.slice(1).map((incomingClip, boundaryIndex) =>
      resolveBoundaryTransition({
        incomingClip,
        defaultTransitionFrames: transitionFrames,
        outgoingDurationFrames: contentDurations[boundaryIndex],
        incomingDurationFrames: contentDurations[boundaryIndex + 1],
      }),
    );

  const transitionSeriesItems: React.ReactNode[] = [];

  safeClips.forEach((clip, index) => {
    const source = resolveClipSource(clip, resolvedTargetAspectRatio)!;
    const incomingTransition =
      index > 0 ? boundaryTransitions[index - 1] : null;
    const outgoingTransition =
      index < boundaryTransitions.length ? boundaryTransitions[index] : null;
    const contentDuration = contentDurations[index];

    // TransitionSeries subtracts the transition duration from the timeline.
    // Extending the outgoing wrapper by the same amount makes the native
    // overlap duration-neutral: the next scene still begins on the exact frame
    // used by the pre-existing voiceover/music/caption contract.
    const sequenceDuration =
      contentDuration + (outgoingTransition?.durationFrames ?? 0);

    transitionSeriesItems.push(
      <TransitionSeries.Sequence
        key={`scene-${clip.id ?? clip.slideRecordId ?? source}-${index}`}
        durationInFrames={sequenceDuration}
      >
        <ImageSegment
          clip={clip}
          source={source}
          durationInFrames={contentDuration}
          entryTransitionType={incomingTransition?.type}
          exitTransitionType={outgoingTransition?.type}
          introTransitionType={index === 0 ? (clip.transition?.type ?? "fade") : undefined}
          introTransitionFrames={
            index === 0
              ? Math.max(
                  1,
                  Math.round(
                    Number(clip.transition?.durationFrames) || transitionFrames,
                  ),
                )
              : 1
          }
          defaultFitMode={defaultFitMode}
          defaultBackgroundColor={defaultBackgroundColor}
          targetAspectRatio={resolvedTargetAspectRatio}
          suppressOverlay={liftedOverlayClips.has(index)}
        />
      </TransitionSeries.Sequence>,
    );

    if (!outgoingTransition) return;

    const timing = linearTiming({
      durationInFrames: outgoingTransition.durationFrames,
    });
    const transitionKey = `transition-${index}-${outgoingTransition.type}`;

    if (outgoingTransition.type === "slideLeft") {
      transitionSeriesItems.push(
        <TransitionSeries.Transition
          key={transitionKey}
          presentation={slide({direction: "from-right"})}
          timing={timing}
        />,
      );
      return;
    }

    if (outgoingTransition.type === "slideRight") {
      transitionSeriesItems.push(
        <TransitionSeries.Transition
          key={transitionKey}
          presentation={slide({direction: "from-left"})}
          timing={timing}
        />,
      );
      return;
    }

    transitionSeriesItems.push(
      <TransitionSeries.Transition
        key={transitionKey}
        presentation={fade({shouldFadeOutExitingScene: true})}
        timing={timing}
      />,
    );
  });

  const totalFrames = contentDurations.reduce(
    (sum, duration) => sum + duration,
    0,
  );
  const perClipVoiceoverIntervals = getVoiceoverIntervals(safeClips, fps);
  const globalVoiceoverSource = resolveSource(voiceover?.src ?? voiceover?.url);
  const globalVoiceoverEnabled =
    perClipVoiceoverIntervals.length === 0 &&
    voiceover?.enabled !== false &&
    Boolean(globalVoiceoverSource);
  const requestedGlobalVoiceoverVolume = Number(voiceover?.volume);
  const globalVoiceoverVolume = Number.isFinite(requestedGlobalVoiceoverVolume)
    ? Math.max(0, Math.min(2, requestedGlobalVoiceoverVolume))
    : 1;
  const measuredGlobalVoiceoverFrames = Math.ceil(
    Math.max(0, Number(voiceoverDurationSeconds) || 0) * fps,
  );
  const globalVoiceoverFrames = Math.max(
    1,
    Math.min(
      totalFrames,
      Math.round(Number(voiceoverEndFrame)) ||
        measuredGlobalVoiceoverFrames ||
        totalFrames,
    ),
  );
  const voiceoverIntervals = globalVoiceoverEnabled
    ? [{start: 0, end: globalVoiceoverFrames}]
    : perClipVoiceoverIntervals;
  const cleanVoiceoverText = String(voiceoverText ?? "").trim();
  const cleanTitleText = String(titleText ?? "").trim();
  const cleanBrandText = String(brandText ?? "").trim();
  const normalizedCaptionTrackMode = String(captionTrackMode ?? "")
    .trim()
    .toLowerCase();
  const hasClipOverlayCaptions = safeClips.some((clip) => {
    const overlayText = String(clip.overlay?.text ?? "").trim();
    return clip.overlay?.enabled !== false && Boolean(overlayText);
  });
  const showSpokenCaptions =
    !hasClipOverlayCaptions &&
    globalVoiceoverEnabled &&
    spokenCaptionsEnabled === true &&
    normalizedCaptionTrackMode === "voiceover-subtitles" &&
    Boolean(cleanVoiceoverText);
  const showTitleCard = !hasClipOverlayCaptions && Boolean(cleanTitleText);

  return (
    <AbsoluteFill style={{backgroundColor: "black"}}>
      {musicEnabled && musicSource ? (
        <Audio
          src={musicSource}
          startFrom={Math.max(0, Math.round(Number(music?.startFromSeconds || 0) * fps))}
          loop={music?.loop !== false}
          volume={(frame) =>
            getMusicVolume({
              frame,
              totalFrames,
              baseVolume: baseMusicVolume,
              duckingEnabled: music?.duckingEnabled !== false,
              duckingMultiplier,
              duckFadeFrames,
              fadeInFrames,
              fadeOutFrames,
              voiceoverIntervals,
            })
          }
        />
      ) : null}

      {globalVoiceoverEnabled && globalVoiceoverSource ? (
        <Audio
          src={globalVoiceoverSource}
          volume={globalVoiceoverVolume}
        />
      ) : null}

      <TransitionSeries>{transitionSeriesItems}</TransitionSeries>

      {liftedOverlayRuns.map((run) => {
        const overlay = run.clip.overlay;
        const text = String(overlay?.text ?? "").trim();
        if (!overlay || !text) return null;
        return (
          <Sequence
            key={`persist-overlay-${run.startFrame}-${text}`}
            from={run.startFrame}
            durationInFrames={run.durationInFrames}
          >
            <AnimatedText
              text={text}
              preset={overlay.stylePreset ?? "Clean Documentary"}
              position={overlay.position ?? "lower-third"}
              size={Math.max(34, Math.min(120, Number(overlay.size) || 62))}
              animation={overlay.animation ?? "fade"}
              role={overlay.role ?? "caption"}
              eyebrow={String(overlay.eyebrow ?? "").trim() || undefined}
              subtitle={String(overlay.subtitle ?? "").trim() || undefined}
              brand={String(overlay.brand ?? "").trim() || undefined}
              accentText={String(overlay.accentText ?? "").trim() || undefined}
              backgroundOpacity={overlay.backgroundOpacity}
              durationInFrames={run.durationInFrames}
              targetAspectRatio={resolvedTargetAspectRatio}
              safeArea={overlay.safeArea}
            />
          </Sequence>
        );
      })}

      {showSpokenCaptions ? (
        <SpokenCaptionTrack
          text={cleanVoiceoverText}
          totalFrames={totalFrames}
          endFrame={globalVoiceoverFrames}
          wordsPerPage={spokenCaptionWordsPerPage}
          targetAspectRatio={resolvedTargetAspectRatio}
        />
      ) : showTitleCard ? (
        <Sequence
          from={0}
          durationInFrames={Math.max(1, Math.min(totalFrames, fps * 5))}
        >
          <AnimatedText
            text={cleanTitleText}
            preset="Chicago Editorial"
            position="lower-third"
            size={resolvedTargetAspectRatio === "16:9" ? 70 : 64}
            animation="fade"
            role="caption"
            brand={cleanBrandText || undefined}
            backgroundOpacity={0.72}
            durationInFrames={Math.max(1, Math.min(totalFrames, fps * 5))}
            targetAspectRatio={resolvedTargetAspectRatio}
          />
        </Sequence>
      ) : null}

      <PersistentBrandWatermark
        text={cleanBrandText}
        targetAspectRatio={resolvedTargetAspectRatio}
      />
    </AbsoluteFill>
  );
};
