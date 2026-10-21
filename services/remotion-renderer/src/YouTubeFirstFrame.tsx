import React from 'react';
import {AbsoluteFill, Img, interpolate, staticFile, useCurrentFrame} from 'remotion';

/**
 * A visual-only top layer: the original clips, narration, captions and music
 * continue on their pre-existing frame numbers. The cover occupies existing
 * frames instead of inserting new ones.
 */
export type YouTubeFirstFrameConfig = {
  enabled?: boolean;
  src?: string;
  holdFrames?: number;
  fadeFrames?: number;
};

export const openingFrameOpacity = (
  frame: number,
  holdFrames = 21,
  fadeFrames = 4,
): number => {
  const hold = Math.max(1, Math.round(holdFrames));
  const fade = Math.max(1, Math.round(fadeFrames));
  if (frame < hold) return 1;
  return interpolate(frame, [hold, hold + fade], [1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
};

export const YouTubeFirstFrameOverlay: React.FC<{
  config?: YouTubeFirstFrameConfig;
}> = ({config}) => {
  const frame = useCurrentFrame();
  if (!config?.enabled) return null;
  if (!config.src) {
    throw new Error('YouTube first-frame cover enabled but no localized cover image was supplied.');
  }
  const imageSrc = /^https?:\/\//i.test(config.src) ? config.src : staticFile(config.src.replace(/^[/\\\\]+/, ''));
  const opacity = openingFrameOpacity(
    frame,
    config.holdFrames ?? 21,
    config.fadeFrames ?? 4,
  );
  if (opacity <= 0) return null;
  return (
    <AbsoluteFill style={{zIndex: 2000, pointerEvents: 'none', opacity}}>
      <Img
        src={imageSrc}
        style={{width: '100%', height: '100%', objectFit: 'cover'}}
      />
    </AbsoluteFill>
  );
};

export const withYouTubeFirstFrame = <P extends object>(
  Component: React.ComponentType<P>,
): React.FC<P & {youtubeFirstFrame?: YouTubeFirstFrameConfig}> => {
  return (props) => (
    <AbsoluteFill>
      <Component {...(props as P)} />
      <YouTubeFirstFrameOverlay config={props.youtubeFirstFrame} />
    </AbsoluteFill>
  );
};
