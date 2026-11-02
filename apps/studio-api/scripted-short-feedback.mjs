/** Safe, preview-only Script a Short proposal edits. No Airtable mutation or publication. */
export const SCRIPTED_SHORT_FEEDBACK_LIMIT = 3000;

const clean = value => String(value ?? "").replace(/\s+/g, " ").trim();
export const normalizedClipName = value => clean(value).toLowerCase()
  .replace(/\.(?:mp4|mov|m4v|webm|avi)$/i, "")
  .replace(/[_–—-]+/g, " ")
  .replace(/[^a-z0-9 ]/g, "")
  .replace(/\s+/g, " ").trim();

const feedbackScene = /\b(?:slide|scene)s?\s*#?\s*(\d{1,2})\b/i;
const feedbackCommand = /\b(remove|delete|drop|replace|swap|substitute|move|reorder|change|edit|set|update)\s+(?:the\s+)?(?:slide|scene)s?\s*#?\s*(\d{1,2})\b/gi;
const cleanClipTitle = value => clean(value)
  .replace(/^(?:the\s+)?(?:following\s+)?(?:clip|video|asset|footage|photo|image)\s*/i, "")
  .replace(/^(?:which\s+)?(?:i\s+)?(?:just\s+)?uploaded\b\s*[.:,-]*/i, "")
  .replace(/^(?:named|called|titled)\s+/i, "")
  .replace(/^[-–—:"'“”]+|[-–—:;,"'“”.]+$/g, "").trim();

/**
 * Named slide replacements are deliberately resolved against the current proposal.
 * User-visible shot labels can be cited instead of slide numbers, but must match
 * one and only one proposed scene. Never guess a scene or partially apply a batch.
 */
function parseNamedScriptedShortReplacements(source, timeline) {
  const clauses = source.split(/[;\r\n]+/).map(value => value.trim()).filter(Boolean);
  const syntax = /^(?:replace|swap|substitute)\s+(.+?)\s+(?:with|using)\s+(.+)$/i;
  const numbered = /^(?:the\s+)?(?:slide|scene)s?\s*#?\s*\d{1,2}\b/i;
  const matches = clauses.map(clause => {
    const match = clause.match(syntax);
    return match && !numbered.test(match[1]) ? match : null;
  });
  if (!matches.some(Boolean)) return null;
  if (!matches.every(Boolean)) {
    throw new Error("Separate named-media replacements from numbered scene changes. No changes were applied.");
  }
  if (!Array.isArray(timeline?.segments) || !timeline.segments.length) {
    throw new Error("A current proposal is required to find scenes by their media names.");
  }
  if (matches.length > 12) throw new Error("Please revise at most 12 scenes at a time.");
  const modified = new Set();
  const actions = matches.map(match => {
    const originalName = clean(match[1]).replace(/^[-–—:\"'“”]+|[-–—:;,\"'“”.]+$/g, "").trim();
    const asset_name = cleanClipTitle(match[2]);
    if (!originalName || originalName.length > 150 || !asset_name || asset_name.length > 150) {
      throw new Error("Each replacement must name the current slide and the exact new library clip.");
    }
    const sourceKey = normalizedClipName(originalName);
    const scenes = timeline.segments.map((segment, index) => (
      normalizedClipName(segment?.suggested_visual) === sourceKey ? index + 1 : null
    )).filter(Boolean);
    if (scenes.length !== 1) {
      const reason = scenes.length ? "is used by multiple scenes" : "is not shown in the current proposal";
      throw new Error("Original media '" + originalName + "' " + reason + ". Use the numbered slide instead. No changes were applied.");
    }
    const scene = scenes[0];
    if (modified.has(scene)) {
      throw new Error("Slide " + scene + " has conflicting edits. No changes were applied.");
    }
    modified.add(scene);
    return { action: "replace", scene, asset_name };
  });
  return actions.length === 1 ? actions[0] : { actions };
}

export function parseScriptedShortFeedback(value, timeline = null) {
  const source = String(value ?? "").trim();
  if (!source || source.length > SCRIPTED_SHORT_FEEDBACK_LIMIT) {
    throw new Error("Enter feedback of 1 to 3,000 characters.");
  }
  const named = parseNamedScriptedShortReplacements(source, timeline);
  if (named) return named;
  // A following scene with its own 'with' inherits the preceding replace verb.
  // Never infer missing clip names, scene numbers or creative instructions.
  const normalized = source.replace(/\band\s+((?:slide|scene)\s*#?\s*\d{1,2}\s+with\b)/gi, "and replace $1");
  const matches = [...normalized.matchAll(feedbackCommand)];
  if (!matches.length) {
    throw new Error("Name a specific slide and an action: remove, replace, move, or change narration.");
  }
  const actions = [];
  for (let index = 0; index < matches.length; index++) {
    const match = matches[index];
    const verb = match[1].toLowerCase();
    const scene = Number(match[2]);
    const suffix = normalized.slice(match.index + match[0].length,
      index + 1 < matches.length ? matches[index + 1].index : normalized.length)
      .replace(/\s*(?:,?\s*(?:and|then)\s*)$/i, "").trim();
    if (["remove","delete","drop"].includes(verb)) {
      const replaceInstead = /\band\s+replace\s+(?:it\s+)?with\b/i.test(suffix);
      if (replaceInstead) {
        const tail = suffix.split(/\band\s+replace\s+(?:it\s+)?with\b/i).pop();
        const bullet = source.match(/(?:^|\n)\s*[-•]\s*([^\r\n]{3,150})\s*$/m);
        const asset_name = cleanClipTitle(bullet?.[1] || tail || "");
        if (!asset_name || asset_name.length > 150 || /\b(?:which|i just uploaded)\b/i.test(asset_name)) {
          throw new Error("Specify the exact uploaded clip name for slide " + scene + ".");
        }
        actions.push({action:"replace",scene,asset_name});
        continue;
      }
      actions.push({action:"remove",scene});
      const extra = suffix.match(/^\s*(?:(?:,|and)\s*(?:(?:slide|scene)\s*#?\s*)?\d{1,2}\s*)+/i);
      if (extra) {
        for (const ref of extra[0].matchAll(/(?:slide|scene)\s*#?\s*(\d{1,2})|\b(\d{1,2})\b/gi)) {
          actions.push({action:"remove",scene:Number(ref[1]||ref[2])});
        }
      } else if (/\b(?:slide|scene)\s*#?\s*\d+\b/i.test(suffix)) {
        throw new Error("Use 'remove slides 2 and 4' or separate remove commands.");
      }
    } else if (["replace","swap","substitute"].includes(verb)) {
      const bullet = source.match(/(?:^|\n)\s*[-•]\s*([^\r\n]{3,150})\s*$/m);
      const afterWith = suffix.match(/^\s*(?:with|using)\s+([\s\S]*)$/i);
      const asset_name = cleanClipTitle(bullet && matches.length===1 ? bullet[1] : afterWith?.[1] || "");
      if (!asset_name || asset_name.length > 150 || /\b(?:which|i just uploaded)\b/i.test(asset_name)) {
        throw new Error("Use 'replace slide " + scene + " with Exact Library Clip Name'.");
      }
      actions.push({action:"replace",scene,asset_name});
    } else if (["move","reorder"].includes(verb)) {
      const target = suffix.match(/^\s*(before|after)\s+(?:the\s+)?(?:slide|scene)\s*#?\s*(\d{1,2})\b/i);
      if (!target) throw new Error("Use 'move slide " + scene + " before slide 2' (or after).");
      actions.push({action:"move",scene,position:target[1].toLowerCase(),target_scene:Number(target[2])});
    } else {
      const timing = suffix.match(/^\s*(?:'s?\s*)?(?:duration|length|timing)\s+(?:to|at|as)\s+(\d{1,2}(?:\.\d)?)\s*(?:seconds?|secs?)\b/i);
      const voice = suffix.match(/^\s*(?:'s?\s*)?(?:voice[\s-]?over|narration|script|spoken\s+line)\s+(?:to|as|:)\s*([\s\S]+)$/i);
      if (timing) {
        throw new Error("Scene timing is determined by recorded narration. Revise the narration text instead of setting seconds.");
      } else if (voice) {
        const text = clean(voice[1]).replace(/^["'“”]+|[;"'“”]+$/g, "").trim();
        if (!text || text.length > 500) throw new Error("Narration must contain 1 to 500 characters.");
        actions.push({action:"narration",scene,text});
      } else {
        throw new Error("For slide " + scene + ", specify 'narration to ...'. Timing follows the recorded voiceover.");
      }
    }
  }
  if (actions.length > 12) throw new Error("Please revise at most 12 scenes at a time.");
  const altered = new Set();
  for (const item of actions) {
    if (!Number.isInteger(item.scene) || item.scene < 1) throw new Error("Slide numbers must be positive.");
    if (altered.has(item.scene)) throw new Error("Slide " + item.scene + " has conflicting edits. Send one change per slide.");
    altered.add(item.scene);
    if (item.action==="move" && item.target_scene===item.scene) {
      throw new Error("A scene cannot be moved relative to itself.");
    }
  }
  // Do not silently ignore another intent which this deterministic parser cannot execute.
  if (/\b(?:and|then)\s+(?:make|adjust|improve|add|include|show|shorten|lengthen)\b/i.test(source)) {
    throw new Error("Separate unsupported creative directions from precise scene changes. Nothing was revised.");
  }
  return actions.length === 1 ? actions[0] : {actions};
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
  const actions = Array.isArray(directive?.actions) ? directive.actions : [directive];
  if (!actions.length || actions.length > 12) throw new Error("Invalid scene revision batch.");
  const initial = timeline.segments.map((item,index) => ({ ...item, _feedback_original: index + 1 }));
  const length = initial.length;
  const removed = new Set(actions.filter(x=>x?.action==="remove").map(x=>x.scene));
  if (length - removed.size < 5) {
    throw new Error("Removing these scenes would leave fewer than five scenes. Replace scenes instead.");
  }
  const edited = new Set();
  for (const operation of actions) {
    const scene = Number(operation?.scene);
    if (!Number.isInteger(scene) || scene < 1 || scene > length) {
      throw new Error("Slide " + String(operation?.scene) + " is not present in this proposal.");
    }
    if (edited.has(scene)) throw new Error("Conflicting edits for slide " + scene + ".");
    edited.add(scene);
    if (operation.action === "move" &&
        (operation.target_scene < 1 || operation.target_scene > length ||
         operation.target_scene===scene || removed.has(operation.target_scene))) {
      throw new Error("The move target must be another scene that remains in the proposal.");
    }
  }
  for (const operation of actions) {
    const row = initial[operation.scene - 1];
    if (operation.action === "remove" || operation.action === "move") continue;
    if (operation.action === "replace") {
      const candidate = operation.clip || (clip instanceof Map ? clip.get(normalizedClipName(operation.asset_name)) : clip);
      if (!candidate?.id || candidate.media_kind !== "video") throw new Error("A verified uploaded video is required.");
      Object.assign(row, {
        asset_id:candidate.id,media_asset_id:candidate.id,
        suggested_visual:candidate.name,shot_status:"owned",
        media_type:candidate.media_type,source_duration_seconds:candidate.source_duration_seconds,
      });
    } else if (operation.action === "narration") {
      if (!operation.text || operation.text.length > 500) throw new Error("Narration must contain 1 to 500 characters.");
      row.voiceover_text=operation.text;
    } else throw new Error("Unsupported feedback operation.");
  }
  const segments = initial.filter(row=>!removed.has(row._feedback_original));
  for (const operation of actions.filter(x=>x.action==="move")) {
    const original = segments.findIndex(row=>row._feedback_original===operation.scene);
    const [moving] = segments.splice(original,1);
    const anchor=segments.findIndex(row=>row._feedback_original===operation.target_scene);
    if(anchor<0)throw new Error("The destination scene is no longer present.");
    segments.splice(anchor+(operation.position==="after"?1:0),0,moving);
  }
  return { ...timeline, segments:segments.map(({_feedback_original,...row})=>row) };
}
