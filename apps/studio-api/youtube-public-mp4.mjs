/** Helpers for staging a YouTube Short final onto the public publish bucket. */

export const PUBLIC_PUT_DIRECT_MAX_BYTES = 95 * 1024 * 1024;
export const PUBLIC_MPU_PART_BYTES = 16 * 1024 * 1024;
export const PUBLIC_MPU_MIN_PART_BYTES = 5 * 1024 * 1024;

export const YOUTUBE_PRIVATE_SOURCE_HEAL_INNER = 'AND({YouTube_Video_ID}="",{Output_Status}="Approved for Publishing",OR({YouTube_Stage}="Terminal Error",AND({YouTube_Stage}="YT1",OR({Publish_Status}="Failed",{Publish_Status}="Ready to Publish",{YouTube_Upload_Status}="Failed"))))';

export function youtubePublishAssetKey(outputId, fileId) {
  const id = String(outputId || "").trim() || "output";
  const source = String(fileId || "").trim() || "finished";
  return `publish/platform-output-${id}/${source}.mp4`;
}

export function shouldUseMultipart(sizeBytes) {
  const size = Number(sizeBytes || 0);
  return !Number.isFinite(size) || size <= 0 || size > PUBLIC_PUT_DIRECT_MAX_BYTES;
}

export function mpuPartRanges(sizeBytes, partBytes = PUBLIC_MPU_PART_BYTES) {
  const size = Number(sizeBytes || 0);
  if (!Number.isFinite(size) || size <= 0) return [];
  const chunk = Math.max(PUBLIC_MPU_MIN_PART_BYTES, Number(partBytes) || PUBLIC_MPU_PART_BYTES);
  const ranges = [];
  let start = 0;
  let partNumber = 1;
  while (start < size) {
    const end = Math.min(start + chunk, size) - 1;
    ranges.push({
      partNumber,
      start,
      end,
      length: end - start + 1,
    });
    start = end + 1;
    partNumber += 1;
  }
  return ranges;
}
