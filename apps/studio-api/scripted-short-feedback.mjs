/** Safe, preview-only Script a Short proposal edits. No Airtable mutation or publication. */
export const SCRIPTED_SHORT_FEEDBACK_LIMIT = 3000;

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
export const normalizedClipName = value => clean(value).toLowerCase()
  .replace(/\.(?:mp4|mov|m4v|webm|avi)$/i, "")
  .replace(/[_–—-]+/g, " ")
  .replace(/[^a-z0-9 ]/g, "")
  .replace(/\s+/g, " ").trim();

export function parseScriptedShortFeedback(value) {
  const source = String(value ?? "").trim();
  if (!source || source.length > SCRIPTED_SHORT_FEEDBACK_LIMIT) {
    throw new Error("Enter feedback of 1 to 3,000 characters.");
  }
  const references = [...source.matchAll(/\b(?:slide|scene)\s*#?\s*(\d{1,2})\b/gi)];
  if (references.length !== 1) {
    throw new Error("For a precise revision, identify one slide number, such as 'replace slide 4 with Central Park At Night 1'.");
  }
  const scene = Number(references[0][1]);
  const replacement = /\b(?:replace|swap|substitute)\b/i.test(source);
  const removal = /\b(?:remove|delete|drop)\b/i.test(source);
  if (!replacement && !removal) {
    throw new Error("Describe a change to the slide: remove it, or replace it with an uploaded clip.");
  }
  if (!replacement) return { action: "remove", scene };
  // Respect a distinct asset title after a bullet or the upload description.
  const bullet = source.match(/(?:^|\n)\s*[-•]\s*([^\r\n]{3,150})\s*$/m)
    || source.match(/\b(?:uploaded|named|called|titled)\s*[.:]\s*[-–—]\s*([^\r\n]{3,150})\s*$/i);
  const afterWith = source.match(/\b(?:replace|swap|substitute)\b[\s\S]*?\bwith\s+([\s\S]+)$/i);
  let name = bullet?.[1] || afterWith?.[1] || "";
  name = clean(name).replace(/^(?:the\s+)?(?:following\s+)?(?:clip|video|asset|footage|photo|image)\b\s*/i, "")
    .replace(/^(?:which\s+)?(?:i\s+)?(?:just\s+)?uploaded\b\s*[.:,-]*\s*/i, "")
    .replace(/^(?:named|called|titled)\s+/i, "")
    .replace(/^[-–—:"'“”]+|[-–—:"'“”.]+$/g, "").trim();
  if (!name || name.length > 150 || /\b(?:which|i just uploaded)\b/i.test(name)) {
    throw new Error("Specify the uploaded clip's exact library name after 'with', or on a separate '- Clip Name' line.");
  }
  return { action: "replace", scene, asset_name: name };
}

export function chooseScriptedShortLibraryClip(rows, assetName, profileId = "") {
  const requested = normalizedClipName(assetName);
  const matches = (Array.isArray(rows) ? rows : []).filter(row => {
    const fields = row?.fields || {};
    return normalizedClipName(fields["Asset Name"] || row?.name) === requested;
  });
  if (matches.length === 0) throw new Error("No exact library clip named '" + assetName + "' was found. Check its upload name.");
  const scoped = matches.filter(row => {
    const profile = row?.fields?.Content_Profile ?? row?.profile_id;
    const ids = Array.isArray(profile) ? profile : (profile ? [profile] : []);
    return !profileId || ids.length === 0 || ids.some(id => String(id?.id || id) === String(profileId));
  });
  if (!scoped.length) throw new Error("That clip belongs to another profile; select a clip for the current Shining city.");
  if (scoped.length !== 1) throw new Error("More than one uploaded clip has that name. Rename one of them or provide a unique library name.");
  const row = scoped[0], f = row.fields || {};
  if (f.Do_Not_Use) throw new Error("That clip is marked Do Not Use.");
  const mime = clean(f.MIME_Type || row.media_type).toLowerCase();
  const type = clean(f["Asset Type"] || f.Media_Class || row.media_kind).toLowerCase();
  const name = clean(f["Asset Name"] || row.name);
  if (!(mime.startsWith("video/") || type.includes("video") || /\.(mp4|mov|m4v|webm)$/i.test(name))) {
    throw new Error("The requested library asset is not a video clip.");
  }
  if (!clean(f["Google Drive File ID"] || row.google_drive_file_id)) {
    throw new Error("The clip has not finished saving to Google Drive. Complete its upload before revising.");
  }
  if (!/^rec[A-Za-z0-9]+$/.test(String(row.id || ""))) throw new Error("The library clip has an invalid record ID.");
  return {
    id: row.id,
    name,
    media_kind: "video",
    media_type: mime || "video",
    source_duration_seconds: Number(f.Duration_Seconds || row.duration_seconds || 0) || null,
    profile_id: profileId,
  };
}

export function applyScriptedShortFeedback(timeline, directive, clip = null) {
  if (!Array.isArray(timeline?.segments) || !timeline.segments.length) {
    throw new Error("An existing proposal is required before giving feedback.");
  }
  const scene = Number(directive?.scene);
  if (!Number.isInteger(scene) || scene < 1 || scene > timeline.segments.length) {
    throw new Error("Slide " + String(directive?.scene) + " is not present in this proposal.");
  }
  const segments = timeline.segments.map(item => ({ ...item }));
  if (directive.action === "remove") {
    if (segments.length <= 5) throw new Error("Removing this scene would leave fewer than five scenes. Replace it instead.");
    segments.splice(scene - 1, 1);
  } else if (directive.action === "replace") {
    if (!clip?.id || clip.media_kind !== "video") throw new Error("A verified uploaded video is required.");
    const existing = segments[scene - 1];
    // Existing narration, order and estimated timing stay unchanged unless the operator asks otherwise.
    segments[scene - 1] = {
      ...existing,
      asset_id: clip.id,
      media_asset_id: clip.id,
      suggested_visual: clip.name,
      shot_status: "owned",
      media_type: clip.media_type,
      source_duration_seconds: clip.source_duration_seconds,
    };
  } else {
    throw new Error("Unsupported feedback operation.");
  }
  return { ...timeline, segments };
}
