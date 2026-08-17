import React from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  Sequence,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
  staticFile,
} from "remotion";

export type FacebookSlideshowClip = {
  url?: string;
  src?: string;
  durationFrames?: number;
  slideNumber?: string | number;
  order?: string | number;
};

export type FacebookImageSlideshowProps = {
  clips: FacebookSlideshowClip[];
  transitionFrames?: number;
  endHoldFrames?: number;
  titleText?: string;
  brandText?: string;
  titleDurationFraction?: number;
  coverUrl?: string;
  coverSrc?: string;
  music?: {
    url?: string;
    src?: string;
    volume?: number;
  };
};

const ImageSegment: React.FC<{
  source: string;
  durationInFrames: number;
  transitionFrames: number;
  isLast: boolean;
}> = ({source, durationInFrames, transitionFrames, isLast}) => {
  const frame = useCurrentFrame();

  const fadeIn = interpolate(
    frame,
    [0, Math.max(1, transitionFrames)],
    [0, 1],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"}
  );

  const fadeOut = isLast
    ? 1
    : interpolate(
        frame,
        [
          Math.max(0, durationInFrames - transitionFrames),
          durationInFrames - 1,
        ],
        [1, 0],
        {extrapolateLeft: "clamp", extrapolateRight: "clamp"}
      );

  const scale = interpolate(
    frame,
    [0, Math.max(1, durationInFrames - 1)],
    [1.0, 1.045],
    {extrapolateLeft: "clamp", extrapolateRight: "clamp"}
  );

  return (
    <AbsoluteFill style={{backgroundColor: "black", opacity: fadeIn * fadeOut}}>
      <Img
        src={source}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          filter: "blur(34px) brightness(0.58)",
          transform: "scale(1.12)",
        }}
      />
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          paddingTop: 150,
          paddingBottom: 170,
          paddingLeft: 54,
          paddingRight: 54,
        }}
      >
        <Img
          src={source}
          style={{
            width: "100%",
            height: "100%",
            objectFit: "contain",
            transform: `scale(${scale})`,
            boxShadow: "0 18px 70px rgba(0,0,0,0.42)",
          }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

export const FacebookImageSlideshow9x16: React.FC<
  FacebookImageSlideshowProps
> = ({
  clips,
  transitionFrames = 12,
  endHoldFrames = 30,
  titleText,
  brandText = "ChicagoShining",
  titleDurationFraction = 0.2,
  coverUrl,
  coverSrc,
  music,
}) => {
  const frame = useCurrentFrame();
  const {fps, durationInFrames} = useVideoConfig();

  const safeClips = Array.isArray(clips)
    ? clips.filter((clip) => Boolean(clip?.src ?? clip?.url))
    : [];

  if (safeClips.length === 0) {
    throw new Error(
      "FacebookImageSlideshow9x16 requires at least one clip with src or url."
    );
  }

  let cursor = 0;
  const sequences = safeClips.map((clip, index) => {
    const rawSource = String(clip.src ?? clip.url);
    const source = /^https?:\/\//i.test(rawSource)
      ? rawSource
      : staticFile(rawSource.replace(/^[/\\]+/, ""));
    const baseDuration = Math.max(
      fps,
      Number.isFinite(Number(clip.durationFrames))
        ? Number(clip.durationFrames)
        : fps * 3
    );
    const duration =
      index === safeClips.length - 1
        ? baseDuration + Math.max(0, endHoldFrames)
        : baseDuration;
    const start = cursor;
    cursor += duration;

    return (
      <Sequence
        key={`${source}-${index}`}
        from={start}
        durationInFrames={duration}
      >
        <ImageSegment
          source={source}
          durationInFrames={duration}
          transitionFrames={Math.max(1, transitionFrames)}
          isLast={index === safeClips.length - 1}
        />
      </Sequence>
    );
  });

  const resolveSource = (value?: string) => {
    if (!value) {
      return undefined;
    }

    return /^https?:\/\//i.test(value)
      ? value
      : staticFile(value.replace(/^[/\\]+/, ""));
  };

  const coverSource = resolveSource(coverSrc ?? coverUrl);
  const cleanTitle = String(titleText ?? "").trim();
  const overlayFrames = Math.max(
    fps,
    Math.round(
      durationInFrames *
        Math.max(0, Math.min(1, Number(titleDurationFraction) || 0.2))
    )
  );

  const titleOpacity =
    cleanTitle && frame < overlayFrames
      ? interpolate(
          frame,
          [0, Math.min(10, overlayFrames - 1), Math.max(11, overlayFrames - 12), overlayFrames - 1],
          [0, 1, 1, 0],
          {extrapolateLeft: "clamp", extrapolateRight: "clamp"}
        )
      : 0;

  const musicSource = resolveSource(music?.src ?? music?.url);

  return (
    <AbsoluteFill style={{backgroundColor: "black"}}>
      {sequences}

      {coverSource && frame < overlayFrames ? (
        <AbsoluteFill style={{opacity: 1}}>
          <Img
            src={coverSource}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "blur(34px) brightness(0.56)",
              transform: "scale(1.12)",
            }}
          />
          <AbsoluteFill
            style={{
              alignItems: "center",
              justifyContent: "center",
              paddingTop: 150,
              paddingBottom: 170,
              paddingLeft: 54,
              paddingRight: 54,
            }}
          >
            <Img
              src={coverSource}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "contain",
                boxShadow: "0 18px 70px rgba(0,0,0,0.42)",
              }}
            />
          </AbsoluteFill>
        </AbsoluteFill>
      ) : null}

      {cleanTitle ? (
        <AbsoluteFill
          style={{
            opacity: titleOpacity,
            alignItems: "center",
            justifyContent: "center",
            paddingLeft: 90,
            paddingRight: 90,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              maxWidth: 900,
              textAlign: "center",
              color: "white",
              fontFamily: "Arial, Helvetica, sans-serif",
              fontSize: 88,
              fontWeight: 900,
              lineHeight: 1.02,
              letterSpacing: -1.5,
              textShadow:
                "0 5px 18px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.95)",
              padding: "28px 34px",
              borderRadius: 24,
              backgroundColor: "rgba(0,0,0,0.28)",
            }}
          >
            {cleanTitle}
          </div>
          {brandText ? (
            <div
              style={{
                position: "absolute",
                bottom: 190,
                color: "white",
                fontFamily: "Arial, Helvetica, sans-serif",
                fontSize: 32,
                fontWeight: 800,
                letterSpacing: 2,
                textShadow: "0 3px 12px rgba(0,0,0,0.95)",
              }}
            >
              {brandText}
            </div>
          ) : null}
        </AbsoluteFill>
      ) : null}

      {musicSource ? (
        <Audio
          src={musicSource}
          volume={Math.max(0, Math.min(1, music?.volume ?? 0.07))}
        />
      ) : null}
    </AbsoluteFill>
  );
};
