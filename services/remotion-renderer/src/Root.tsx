import { Composition } from 'remotion';
import { TestRemotion } from './TestRemotion';
import {
    TestRemotionV2,
    testRemotionV2DefaultProps,
} from './TestRemotionV2';
import {
	TestRemotionV3,
	defaultV3Props,
	getV3DurationInFrames,
} from './TestRemotionV3';

import {
    FacebookImageSlideshow9x16,
    type FacebookImageSlideshowProps,
} from './FacebookImageSlideshow9x16';
import {
    ChicagoShiningPhotoSequence,
    type ChicagoShiningPhotoSequenceProps,
} from './ChicagoShiningPhotoSequence';
export const RemotionRoot: React.FC = () => {
    return (
        <>
            <Composition
                id="TEST-REMOTION-V2"
                component={TestRemotionV2}
                durationInFrames={240}
                fps={30}
                width={1080}
                height={1920}
                defaultProps={testRemotionV2DefaultProps}
            />
			<Composition
				id="TEST-REMOTION-V3"
				component={TestRemotionV3}
				width={1080}
				height={1920}
				fps={30}
				durationInFrames={getV3DurationInFrames(defaultV3Props)}
				defaultProps={defaultV3Props}
				calculateMetadata={({ props }) => {
					return {
						durationInFrames: getV3DurationInFrames(props),
						width: 1080,
						height: 1920,
						fps: 30,
					};
				}}
			/>
            <Composition
                id="TEST-REMOTION-V4"
                component={TestRemotionV3}
                durationInFrames={900}
                fps={30}
                width={1080}
                height={1920}
                calculateMetadata={({ props }) => {
                    const clips = Array.isArray(props.clips) ? props.clips : [];

                    const calculatedDuration = clips.reduce((sum, clip) => {
                        return sum + Number(clip.durationFrames || 0);
                    }, 0);

                    return {
                        durationInFrames:
                            Number(props.durationInFrames) ||
                            calculatedDuration ||
                            900,
                        fps: Number(props.fps) || 30,
                        width: Number(props.width) || 1080,
                        height: Number(props.height) || 1920,
                    };
                }}
                defaultProps={{
                    filename: 'test-render.mp4',
                    titleText: 'REMOTE ASSET DOWNLOAD TEST',
                    brandText: 'CHICAGOSHINING',
                    musicVolume: 0.12,
                    voiceoverVolume: 1,
                    durationInFrames: 900,
                    fps: 30,
                    width: 1080,
                    height: 1920,
                    clips: [
                        {
                            id: 'video1',
                            url: 'Assets/video1_proxy.mp4',
                            src: 'Assets/video1_proxy.mp4',
                            durationFrames: 150,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video2',
                            url: 'Assets/video2_proxy.mp4',
                            src: 'Assets/video2_proxy.mp4',
                            durationFrames: 120,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video3',
                            url: 'Assets/video3_proxy.mp4',
                            src: 'Assets/video3_proxy.mp4',
                            durationFrames: 120,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video4',
                            url: 'Assets/video1_proxy.mp4',
                            src: 'Assets/video1_proxy.mp4',
                            durationFrames: 120,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video5',
                            url: 'Assets/video2_proxy.mp4',
                            src: 'Assets/video2_proxy.mp4',
                            durationFrames: 120,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video6',
                            url: 'Assets/video3_proxy.mp4',
                            src: 'Assets/video3_proxy.mp4',
                            durationFrames: 120,
                            motionStyle: 'slowZoom',
                        },
                        {
                            id: 'video7',
                            url: 'Assets/video1_proxy.mp4',
                            src: 'Assets/video1_proxy.mp4',
                            durationFrames: 150,
                            motionStyle: 'slowZoom',
                        },
                    ],
                    music: {
                        url: 'Assets/music.wav',
                        src: 'Assets/music.wav',
                        volume: 0.12,
                    },
                }}
            />

            <Composition<FacebookImageSlideshowProps>
                id="FacebookImageSlideshow9x16"
                component={FacebookImageSlideshow9x16}
                width={1080}
                height={1920}
                fps={30}
                durationInFrames={210}
                defaultProps={{
                    clips: [
                        {
                            src: 'Assets/video1_proxy.mp4',
                            durationFrames: 90,
                        },
                        {
                            src: 'Assets/video2_proxy.mp4',
                            durationFrames: 90,
                        },
                    ],
                    transitionFrames: 12,
                    endHoldFrames: 30,
                }}
                calculateMetadata={({ props }) => {
                    const fps = 30;
                    const clips = Array.isArray(props.clips)
                        ? props.clips
                        : [];

                    const calculatedDuration = clips.reduce(
                        (total, clip) => {
                            const frames = Number(clip.durationFrames);
                            return (
                                total +
                                (Number.isFinite(frames)
                                    ? Math.max(fps, frames)
                                    : fps * 3)
                            );
                        },
                        0
                    );

                    const endingHold = Math.max(
                        0,
                        Number(props.endHoldFrames ?? 30)
                    );

                    return {
                        durationInFrames: Math.max(
                            fps * 4,
                            calculatedDuration + endingHold
                        ),
                        width: 1080,
                        height: 1920,
                        fps,
                    };
                }}
            />
            <Composition<ChicagoShiningPhotoSequenceProps>
                id="ChicagoShiningPhotoSequence"
                component={ChicagoShiningPhotoSequence}
                width={1080}
                height={1920}
                fps={30}
                durationInFrames={300}
                defaultProps={{
                    transitionFrames: 12,
                    endHoldFrames: 0,
                    clips: [
                        {
                            id: 'p020-default-1',
                            src: 'https://media.chicagoshining.com/publish/fb-enhanced-test-01-cover.jpg',
                            durationFrames: 75,
                            overlay: {
                                enabled: true,
                                text: 'P-020 PHOTO SEQUENCE',
                                position: 'lower-third',
                                size: 58,
                                stylePreset: 'Clean Documentary',
                                animation: 'fade',
                            },
                        },
                        {
                            id: 'p020-default-2',
                            src: 'https://media.chicagoshining.com/publish/fb-enhanced-test-02-bean.jpg',
                            durationFrames: 120,
                            overlay: {
                                enabled: true,
                                text: 'SHARED CREATIVE DIRECTIVES',
                                position: 'center',
                                size: 68,
                                stylePreset: '3D Colorful',
                                animation: 'pop',
                            },
                        },
                        {
                            id: 'p020-default-3',
                            src: 'https://media.chicagoshining.com/publish/fb-enhanced-test-03-navy-pier.jpg',
                            durationFrames: 105,
                            overlay: {
                                enabled: true,
                                text: 'CHICAGOSHINING',
                                position: 'bottom',
                                size: 64,
                                stylePreset: 'Black Gold Arched',
                                animation: 'fade',
                            },
                        },
                    ],
                }}
                calculateMetadata={({ props }) => {
                    const fps = 30;
                    const clips = Array.isArray(props.clips) ? props.clips : [];

                    const clipFrames = clips.reduce((total, clip) => {
                        const raw = Number(clip.durationFrames);
                        return total + (
                            Number.isFinite(raw)
                                ? Math.max(fps, Math.round(raw))
                                : fps * 3
                        );
                    }, 0);

                    const endHold = Math.max(
                        0,
                        Math.round(Number(props.endHoldFrames ?? 0))
                    );

                    const ratio = String(props.targetAspectRatio ?? "9:16").trim();

                    const mappedDimensions =
                        ratio === "4:5"
                            ? { width: 1080, height: 1350 }
                            : ratio === "1:1"
                                ? { width: 1080, height: 1080 }
                                : ratio === "16:9"
                                    ? { width: 1920, height: 1080 }
                                    : { width: 1080, height: 1920 };

                    const requestedWidth = Number(props.width);
                    const requestedHeight = Number(props.height);

                    const resolvedWidth = Number.isFinite(requestedWidth) && requestedWidth > 0
                        ? Math.round(requestedWidth)
                        : mappedDimensions.width;

                    const resolvedHeight = Number.isFinite(requestedHeight) && requestedHeight > 0
                        ? Math.round(requestedHeight)
                        : mappedDimensions.height;

                    return {
                        durationInFrames: Math.max(fps, clipFrames + endHold),
                        width: resolvedWidth,
                        height: resolvedHeight,
                        fps,
                    };
                }}
            /></>
    );
};
