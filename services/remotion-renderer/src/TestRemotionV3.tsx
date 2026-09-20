import React from 'react';
import {
	AbsoluteFill,
	Audio,
	interpolate,
	OffthreadVideo,
	Sequence,
	staticFile,
	useCurrentFrame,
	useVideoConfig,
} from 'remotion';

type MotionStyle = 'slowZoom' | 'none';

export type V3Clip = {
	id: string;
	src?: string;
	url?: string;
	durationFrames: number;
	motionStyle?: MotionStyle;
};

export type V3Music = {
	src?: string;
	url?: string;
	volume?: number;
};

export type V3Voiceover = {
	src?: string;
	url?: string;
	volume?: number;
};

export type TestRemotionV3Props = {
	filename?: string;
	titleText?: string;
	brandText?: string;
	musicVolume?: number;
	voiceoverVolume?: number;
	durationInFrames?: number;
	voiceoverDurationSeconds?: number;
	voiceoverEndFrame?: number;
	voiceoverTailSeconds?: number;
	postVoiceoverMusicVolume?: number;
	musicBoostFadeFrames?: number;
	musicEndFadeFrames?: number;
	clips?: V3Clip[];
	music?: V3Music;
	voiceover?: V3Voiceover;
};

const FPS = 30;
const DEFAULT_CLIP_DURATION_FRAMES = 90;
const MAX_CROSSFADE_FRAMES = 15;

export const defaultV3Props: TestRemotionV3Props = {
	filename: 'v3-default-test.mp4',
	titleText: 'DYNAMIC ASSET URL TEST',
	brandText: 'CHICAGOSHINING',
	musicVolume: 0.072,
	voiceoverVolume: 1,
	postVoiceoverMusicVolume: 0.102,
	musicBoostFadeFrames: 15,
	musicEndFadeFrames: 15,
	clips: [
		{
			id: 'video1',
			src: 'Assets/video1_proxy.mp4',
			durationFrames: 90,
			motionStyle: 'slowZoom',
		},
		{
			id: 'video2',
			src: 'Assets/video2_proxy.mp4',
			durationFrames: 90,
			motionStyle: 'slowZoom',
		},
		{
			id: 'video3',
			src: 'Assets/video3_proxy.mp4',
			durationFrames: 90,
			motionStyle: 'slowZoom',
		},
	],
	music: {
		src: 'Assets/music.wav',
		volume: 0.12,
	},
};

const getClips = (props: TestRemotionV3Props): V3Clip[] => {
	const clips = props.clips && props.clips.length > 0 ? props.clips : defaultV3Props.clips!;

	return clips.map((clip, index) => ({
		id: clip.id || `clip-${index + 1}`,
		src: clip.src || clip.url || '',
		durationFrames: Math.max(
			1,
			Math.floor(clip.durationFrames || DEFAULT_CLIP_DURATION_FRAMES)
		),
		motionStyle: clip.motionStyle || 'slowZoom',
	}));
};

const getAssetSrc = (src: string): string => {
	if (!src) {
		return '';
	}

	const trimmed = src.trim();

	if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
		return trimmed;
	}

	const publicPath = trimmed.replace(/^\/+/, '');

	return staticFile(publicPath);
};

const getTransitionFrames = (currentClip: V3Clip, nextClip: V3Clip): number => {
	const currentSafe = Math.max(1, currentClip.durationFrames);
	const nextSafe = Math.max(1, nextClip.durationFrames);

	return Math.min(
		MAX_CROSSFADE_FRAMES,
		Math.floor(currentSafe / 3),
		Math.floor(nextSafe / 3)
	);
};

type TimelineClip = V3Clip & {
	startFrame: number;
	endFrame: number;
	sequenceDurationFrames: number;
	transitionInFrames: number;
	transitionOutFrames: number;
};

const buildTimeline = (clips: V3Clip[]): TimelineClip[] => {
	let cursor = 0;

	return clips.map((clip, index) => {
		const previousClip = clips[index - 1];
		const nextClip = clips[index + 1];

		const transitionInFrames = previousClip
			? getTransitionFrames(previousClip, clip)
			: 0;

		const transitionOutFrames = nextClip
			? getTransitionFrames(clip, nextClip)
			: 0;

		// durationFrames remains the interval between this clip's start and the
		// next clip's start. The outgoing clip stays alive for transitionOutFrames
		// beyond that boundary while the incoming clip fades in.
		const startFrame = cursor;
		const sequenceDurationFrames =
			clip.durationFrames + transitionOutFrames;
		const endFrame = startFrame + sequenceDurationFrames;

		// Advance by the assigned core duration. This creates an overlap without
		// shortening the full composition or adding blank frames at the end.
		cursor += clip.durationFrames;

		return {
			...clip,
			startFrame,
			endFrame,
			sequenceDurationFrames,
			transitionInFrames,
			transitionOutFrames,
		};
	});
};

export const getV3DurationInFrames = (props: TestRemotionV3Props): number => {
	const clips = getClips(props);
	const timeline = buildTimeline(clips);

	if (timeline.length === 0) {
		return FPS * 5;
	}

	return Math.max(1, timeline[timeline.length - 1].endFrame);
};

const DynamicClip: React.FC<{
	clip: TimelineClip;
	index: number;
	totalClips: number;
}> = ({clip}) => {
	const frame = useCurrentFrame();
	const localFrame = frame - clip.startFrame;

	const fadeIn =
		clip.transitionInFrames > 0
			? interpolate(
					localFrame,
					[0, clip.transitionInFrames],
					[0, 1],
					{
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}
				)
			: 1;

	const fadeOut =
		clip.transitionOutFrames > 0
			? interpolate(
					localFrame,
					[
						clip.durationFrames,
						clip.durationFrames + clip.transitionOutFrames,
					],
					[1, 0],
					{
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}
				)
			: 1;

	const opacity = Math.min(fadeIn, fadeOut);

	const scale =
		clip.motionStyle === 'none'
			? 1
			: interpolate(
					localFrame,
					[0, clip.sequenceDurationFrames],
					[1, 1.06],
					{
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}
				);

	return (
		<Sequence
			from={clip.startFrame}
			durationInFrames={clip.sequenceDurationFrames}
			name={clip.id}
		>
			<AbsoluteFill style={{opacity, overflow: 'hidden'}}>
				<OffthreadVideo
					src={getAssetSrc(clip.src || '')}
					muted
					loop
					style={{
						width: '100%',
						height: '100%',
						objectFit: 'cover',
						transform: `scale(${scale})`,
					}}
				/>
			</AbsoluteFill>
		</Sequence>
	);
};

export const TestRemotionV3: React.FC<TestRemotionV3Props> = (props) => {
	const clips = getClips(props);
	const timeline = buildTimeline(clips);
	const {durationInFrames} = useVideoConfig();

	const titleText = props.titleText || defaultV3Props.titleText || '';
	const brandText = props.brandText || defaultV3Props.brandText || '';

	const musicSrc =
		props.music?.src ||
		props.music?.url ||
		defaultV3Props.music?.src ||
		defaultV3Props.music?.url;
	const musicVolume =
		props.music?.volume ??
		props.musicVolume ??
		defaultV3Props.music?.volume ??
		0.072;

	const voiceoverSrc = props.voiceover?.src || props.voiceover?.url;
	const voiceoverVolume =
		props.voiceover?.volume ??
		props.voiceoverVolume ??
		defaultV3Props.voiceoverVolume ??
		1;

	const voiceoverEndFrame =
		typeof props.voiceoverEndFrame === 'number' && props.voiceoverEndFrame > 0
			? Math.floor(props.voiceoverEndFrame)
			: undefined;

	const postVoiceoverMusicVolume = Math.max(
		musicVolume,
		Math.min(
			1,
			props.postVoiceoverMusicVolume ??
				defaultV3Props.postVoiceoverMusicVolume ??
				musicVolume
		)
	);

	const musicBoostFadeFrames = Math.max(
		0,
		Math.floor(
			props.musicBoostFadeFrames ??
				defaultV3Props.musicBoostFadeFrames ??
				15
		)
	);

	const musicEndFadeFrames = Math.max(
		0,
		Math.floor(
			props.musicEndFadeFrames ??
				defaultV3Props.musicEndFadeFrames ??
				15
		)
	);

	const getMusicVolumeAtFrame = (frame: number): number => {
		const hasMeasuredVoiceover =
			Boolean(voiceoverSrc) && typeof voiceoverEndFrame === 'number';

		const boostedVolume = hasMeasuredVoiceover
			? interpolate(
					frame,
					[
						voiceoverEndFrame,
						voiceoverEndFrame + Math.max(1, musicBoostFadeFrames),
					],
					[musicVolume, postVoiceoverMusicVolume],
					{
						extrapolateLeft: 'clamp',
						extrapolateRight: 'clamp',
					}
				)
			: musicVolume;

		if (musicEndFadeFrames <= 0) {
			return boostedVolume;
		}

		const endFadeMultiplier = interpolate(
			frame,
			[
				Math.max(0, durationInFrames - musicEndFadeFrames),
				durationInFrames,
			],
			[1, 0],
			{
				extrapolateLeft: 'clamp',
				extrapolateRight: 'clamp',
			}
		);

		return boostedVolume * endFadeMultiplier;
	};

	return (
		<AbsoluteFill style={{backgroundColor: '#050505'}}>
			{timeline.map((clip, index) => (
				<DynamicClip
					key={`${clip.id}-${index}`}
					clip={clip}
					index={index}
					totalClips={timeline.length}
				/>
			))}

			{musicSrc ? (
				<Audio
					src={getAssetSrc(musicSrc)}
					volume={(frame) => getMusicVolumeAtFrame(frame)}
				/>
			) : null}

			{voiceoverSrc ? (
				<Audio
					src={getAssetSrc(voiceoverSrc)}
					volume={voiceoverVolume}
				/>
			) : null}

			<AbsoluteFill
				style={{
					justifyContent: 'flex-start',
					alignItems: 'center',
					paddingTop: 130,
					paddingLeft: 70,
					paddingRight: 70,
					pointerEvents: 'none',
				}}
			>
				<div
					style={{
						color: 'white',
						fontFamily: 'Arial, Helvetica, sans-serif',
						fontSize: 76,
						fontWeight: 900,
						lineHeight: 1.02,
						textAlign: 'center',
						letterSpacing: 1,
						textShadow: '0 8px 22px rgba(0, 0, 0, 0.85)',
					}}
				>
					{titleText}
				</div>
			</AbsoluteFill>

			<AbsoluteFill
				style={{
					justifyContent: 'flex-end',
					alignItems: 'center',
					paddingBottom: 120,
					pointerEvents: 'none',
				}}
			>
				<div
					style={{
						color: 'white',
						fontFamily: 'Arial, Helvetica, sans-serif',
						fontSize: 44,
						fontWeight: 800,
						letterSpacing: 5,
						textAlign: 'center',
						textShadow: '0 6px 18px rgba(0, 0, 0, 0.85)',
					}}
				>
					{brandText}
				</div>
			</AbsoluteFill>
		</AbsoluteFill>
	);
};
