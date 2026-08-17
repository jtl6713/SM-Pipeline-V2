import React from 'react';
import {
    AbsoluteFill,
    Audio,
    OffthreadVideo,
    Sequence,
    interpolate,
    staticFile,
    useCurrentFrame,
} from 'remotion';

type ClipName = 'video1' | 'video2' | 'video3';
type MotionStyle = 'slowZoom' | 'none';

export type TestRemotionV2Props = {
    filename?: string;
    titleText?: string;
    brandText?: string;
    musicVolume?: number;
    clipOrder?: ClipName[];
    motionStyles?: MotionStyle[];
};

const clipMap: Record<ClipName, string> = {
    video1: 'Assets/video1_proxy.mp4',
    video2: 'Assets/video2_proxy.mp4',
    video3: 'Assets/video3_proxy.mp4',
};

const defaultClipOrder: ClipName[] = ['video1', 'video2', 'video3'];

const CLIP_DURATION = 90;
const TRANSITION_FRAMES = 15;

export const testRemotionV2DefaultProps: TestRemotionV2Props = {
    filename: 'visible-motion-crossfade-test.mp4',
    titleText: 'Visible Motion Test',
    brandText: 'ChicagoShining',
    musicVolume: 0.12,
    clipOrder: defaultClipOrder,
    motionStyles: ['slowZoom', 'slowZoom', 'slowZoom'],
};

const cleanClipOrder = (clipOrder?: ClipName[]): ClipName[] => {
    if (!clipOrder || clipOrder.length === 0) {
        return defaultClipOrder;
    }

    const valid = clipOrder.filter((clip): clip is ClipName => {
        return clip === 'video1' || clip === 'video2' || clip === 'video3';
    });

    return valid.length > 0 ? valid : defaultClipOrder;
};

const cleanMusicVolume = (value?: number): number => {
    if (typeof value !== 'number' || Number.isNaN(value)) {
        return 0.15;
    }

    return Math.max(0, Math.min(1, value));
};

const cleanMotionStyle = (
    motionStyles: MotionStyle[] | undefined,
    index: number
): MotionStyle => {
    const style = motionStyles?.[index];

    if (style === 'slowZoom' || style === 'none') {
        return style;
    }

    return 'none';
};

const StableClip: React.FC<{
    src: string;
    motionStyle: MotionStyle;
    index: number;
    totalClips: number;
}> = ({ src, motionStyle, index, totalClips }) => {
    const frame = useCurrentFrame();

    const scale =
        motionStyle === 'slowZoom'
            ? interpolate(frame, [0, CLIP_DURATION], [1, 1.08], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
            })
            : 1;

    const fadeIn =
        index === 0
            ? 1
            : interpolate(frame, [0, TRANSITION_FRAMES], [0, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
            });

    const fadeOut =
        index === totalClips - 1
            ? 1
            : interpolate(
                frame,
                [CLIP_DURATION - TRANSITION_FRAMES, CLIP_DURATION],
                [1, 0],
                {
                    extrapolateLeft: 'clamp',
                    extrapolateRight: 'clamp',
                }
            );

    const opacity = Math.min(fadeIn, fadeOut);

    return (
        <AbsoluteFill
            style={{
                backgroundColor: 'black',
                overflow: 'hidden',
                opacity,
            }}
        >
            <OffthreadVideo
                src={staticFile(src)}
                volume={0}
                startFrom={0}
                endAt={CLIP_DURATION}
                style={{
                    width: '100%',
                    height: '100%',
                    objectFit: 'cover',
                    transform: `scale(${scale})`,
                    transformOrigin: 'center center',
                }}
            />
        </AbsoluteFill>
    );
};

export const TestRemotionV2: React.FC<TestRemotionV2Props> = ({
    clipOrder,
    titleText = 'Visible Motion Test',
    brandText = 'ChicagoShining',
    musicVolume = 0.15,
    motionStyles,
}) => {
    const clips = cleanClipOrder(clipOrder);
    const safeMusicVolume = cleanMusicVolume(musicVolume);

    return (
        <AbsoluteFill
            style={{
                backgroundColor: 'black',
                fontFamily: 'Arial, Helvetica, sans-serif',
            }}
        >
            {clips.map((clip, index) => {
                const sequenceStart = index * (CLIP_DURATION - TRANSITION_FRAMES);

                return (
                    <Sequence
                        key={`${clip}-${index}`}
                        from={sequenceStart}
                        durationInFrames={CLIP_DURATION}
                    >
                        <StableClip
                            src={clipMap[clip]}
                            motionStyle={cleanMotionStyle(motionStyles, index)}
                            index={index}
                            totalClips={clips.length}
                        />
                    </Sequence>
                );
            })}

            <Audio src={staticFile('Assets/music.wav')} volume={safeMusicVolume} />

            <AbsoluteFill
                style={{
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingLeft: 90,
                    paddingRight: 90,
                    textAlign: 'center',
                    pointerEvents: 'none',
                }}
            >
                <div
                    style={{
                        fontSize: 82,
                        fontWeight: 800,
                        lineHeight: 1.05,
                        color: 'white',
                        textShadow: '0 8px 24px rgba(0,0,0,0.75)',
                        textTransform: 'uppercase',
                    }}
                >
                    {titleText}
                </div>
            </AbsoluteFill>

            <div
                style={{
                    position: 'absolute',
                    left: 60,
                    right: 60,
                    bottom: 90,
                    fontSize: 34,
                    fontWeight: 700,
                    color: 'white',
                    textAlign: 'center',
                    letterSpacing: 2,
                    textShadow: '0 4px 14px rgba(0,0,0,0.85)',
                    textTransform: 'uppercase',
                    pointerEvents: 'none',
                }}
            >
                {brandText}
            </div>
        </AbsoluteFill>
    );
};
