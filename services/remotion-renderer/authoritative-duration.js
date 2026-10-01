"use strict";

function timingToken(value) {
    return String(value || "").trim().toLowerCase();
}

function clipIsAuthoritative(clip) {
    if (!clip || typeof clip !== "object") return false;
    const directive = clip.renderDirective && typeof clip.renderDirective === "object"
        ? clip.renderDirective
        : {};
    const tokens = [
        clip.timingMode,
        clip.timing_mode,
        clip.timingSource,
        clip.timing_source,
        directive.timingMode,
        directive.timingSource,
    ].map(timingToken);
    return tokens.includes("authoritative") || tokens.includes("timed_script");
}

function isAuthoritativeTiming(body, clips) {
    const mode = timingToken(body && (body.timingMode || body.timing_mode));
    const source = timingToken(body && (body.timingSource || body.timing_source));
    if (mode === "authoritative" || source === "timed_script") return true;
    return Array.isArray(clips) && clips.length > 0 && clips.some(clipIsAuthoritative);
}

function sumClipFrames(clips) {
    return (Array.isArray(clips) ? clips : []).reduce((sum, clip) => {
        const frames = Math.round(Number(clip && clip.durationFrames));
        return sum + (Number.isFinite(frames) ? Math.max(1, frames) : 1);
    }, 0);
}

function authoritativeRenderPlan(body, clips) {
    if (!isAuthoritativeTiming(body, clips)) return null;
    const frames = sumClipFrames(clips);
    if (!frames) return null;
    return {
        finalDurationFrames: frames,
        effectiveTailSeconds: 0,
        endHoldFrames: 0,
        keepClipDurations: true,
    };
}

module.exports = {
    authoritativeRenderPlan,
    clipIsAuthoritative,
    isAuthoritativeTiming,
    sumClipFrames,
};
