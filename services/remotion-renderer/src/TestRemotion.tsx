import {
  AbsoluteFill,
  Audio,
  Sequence,
  OffthreadVideo,
  interpolate,
  staticFile,
  useCurrentFrame,
} from 'remotion';

type Clip = {
  id: string;
  src: string;
  startFrame: number;
  durationFrames: number;
  trimStartSeconds: number;
  motion: 'slow_zoom_in' | 'slow_zoom_out' | 'pan_right' | 'pan_left' | 'static';
};

type TestRemotionProps = {
  titleText: string;
  brandText: string;
  musicUrl: string;
  musicVolume: number;
  clips: Clip[];
};

const getMediaSrc = (src: string) => {
  if (src.startsWith('http://') || src.startsWith('https://')) {
    return src;
  }

  return staticFile(src);
};

const MovingClip: React.FC<{
  src: string;
  motionStyle: MotionStyle;
}> = ({src}) => {
  return (
    <AbsoluteFill
      style={{
        overflow: 'hidden',
        backgroundColor: 'black',
      }}
    >
      <OffthreadVideo
        src={staticFile(src)}
        volume={0}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
        }}
      />
    </AbsoluteFill>
  );
};

export const TestRemotion: React.FC<TestRemotionProps> = ({
  titleText,
  brandText,
  musicUrl,
  musicVolume,
  clips,
}) => {
  return (
    <AbsoluteFill style={{backgroundColor: 'black'}}>
      {clips.map((clip) => {
        return (
          <Sequence
            key={clip.id}
            from={clip.startFrame}
            durationInFrames={clip.durationFrames}
          >
            <MovingClip clip={clip} />
          </Sequence>
        );
      })}

      <Audio src={getMediaSrc(musicUrl)} volume={musicVolume} />

      <AbsoluteFill
        style={{
          justifyContent: 'space-between',
          paddingTop: 180,
          paddingBottom: 160,
          paddingLeft: 70,
          paddingRight: 70,
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: 82,
            fontWeight: 900,
            lineHeight: 1,
            color: 'white',
            textShadow: '0 8px 24px rgba(0,0,0,0.65)',
            letterSpacing: -3,
            textTransform: 'uppercase',
          }}
        >
          {titleText}
        </div>

        <div
          style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: 42,
            fontWeight: 800,
            color: 'white',
            textShadow: '0 6px 20px rgba(0,0,0,0.75)',
            textAlign: 'right',
          }}
        >
          {brandText}
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
