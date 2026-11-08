/**
 * Explicit human scene count, visual requirements and per-scene narration.
 * The user's numbered directions outrank any AI proposal. Never infer a
 * library asset from these descriptions or rewrite a supplied voiceover line.
 */
const numbers = Object.freeze({
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,
});
const number = value => /^\d+$/.test(value) ? Number(value) : numbers[String(value || "").toLowerCase()];
const compact = value => String(value || "").replace(/\s+/g, " ").trim();
const unquote = value => compact(value).replace(/^[\s"'“”‘’`*]+|[\s"'“”‘’`*]+$/g, "").trim();

function requestedSceneCount(source) {
  const word = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const candidates = [
    new RegExp("\\b" + word + "\\s*[-–—]?\\s*(?:distinct\\s+|separate\\s+|numbered\\s+)?(?:scenes?|shots?|segments?)\\b", "i"),
    new RegExp("\\b(?:number\\s+of\\s+scenes|scene\\s+count|total\\s+scenes|scenes)\\s*[:=]\\s*" + word + "\\b", "i"),
  ];
  for (const re of candidates) {
    const match = source.match(re);
    if (match) return number(match[1]);
  }
  return null;
}

function numberedSection(source, kind) {
  const head = kind === "voice"
    ? /^(?:exact\s+|verbatim\s+|per[- ]scene\s+)?(?:voice\s*over|voiceover|vo|narration)(?:\s+(?:for|by|per)\s+(?:each\s+)?scene)?(?:\s+script)?\s*:?[ \t]*$/i
    : /^(?:required\s+|per[- ]scene\s+)?(?:visuals?|shots?|scene\s+visuals?|shot\s+list|scene\s+list)(?:\s+(?:for|by|per)\s+(?:each\s+)?scene)?\s*:?[ \t]*$/i;
  const lines = source.split(/\n/);
  const found = new Map();
  let active = false;
  for (const raw of lines) {
    const line = raw.trim().replace(/^#{1,5}\s*/, "").replace(/^\*\*(.*?)\*\*$/, "$1");
    if (head.test(line)) { active = true; continue; }
    if (!active) continue;
    const item = line.match(/^(\d{1,2})\s*[.)\]:-]\s*(.+)$/);
    if (item) {
      const n = Number(item[1]);
      const value = unquote(item[2].replace(/^(?:voiceover|voice over|vo|narration|visual|shot)\s*[:—-]\s*/i, ""));
      if (n >= 1 && n <= 12 && value) found.set(n, value);
      continue;
    }
    if (line && !/^[-*•]\s+/.test(line)) active = false;
  }
  return found;
}

export function scriptedShortSceneDirections(brief) {
  const source = String(brief || "").replace(/\r\n?/g, "\n");
  const count = requestedSceneCount(source);
  const voice = numberedSection(source, "voice");
  const visual = numberedSection(source, "visual");
  // A scene block is the strongest source: it binds the exact narration and
  // visual to the same index, regardless of the writer's proposed scene count.
  const headers = [...source.matchAll(/^\s*(?:#{1,4}\s*)?(?:\*\*)?(?:scene|shot|segment)\s*#?\s*(\d{1,2})\b([^\n]*)/gim)];
  const blocks = headers.filter(match => Number(match[1]) >= 1 && Number(match[1]) <= 12);
  for (let i=0; i<blocks.length; i++) {
    const head = blocks[i], n = Number(head[1]);
    const next = blocks[i+1]?.index ?? source.length;
    const body = source.slice(head.index + head[0].length, next);
    const inline = head[2] || "";
    const joined = inline + "\n" + body;
    const voMatch = joined.match(/(?:^|\n)\s*(?:\*\*)?(?:voice\s*over|voiceover|vo|narration|spoken\s+line)(?:\*\*)?\s*[:—=-]\s*([^\n]+)/i)
      || inline.match(/\b(?:voice\s*over|voiceover|vo|narration)\s*[:—=-]\s*([^\n]+)/i);
    const visualMatch = joined.match(/(?:^|\n)\s*(?:\*\*)?(?:visual|image|footage|media|shot\s+description)(?:\*\*)?\s*[:—=-]\s*([^\n]+)/i);
    if (voMatch && !voice.has(n)) voice.set(n, unquote(voMatch[1]));
    if (visualMatch && !visual.has(n)) visual.set(n, unquote(visualMatch[1]));
    if (!visual.has(n)) {
      const heading = unquote(inline.replace(/^\s*[:—-]\s*/, ""));
      if (heading && !/^(?:voiceover|voice over|vo|narration)\s*[:—=-]/i.test(heading)
        && !/^\(?\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(?:s|sec|seconds)?\)?$/.test(heading)) {
        visual.set(n, heading.replace(/^\(?\d{1,2}\s*[-–—:]\s*\d{1,2}\s*(?:s|sec|seconds)?\)?\s*[:—-]?\s*/i, ""));
      }
    }
  }
  // Also support "Voiceover for scene 3: ..." without a numbered block.
  for (const match of source.matchAll(/^\s*(?:voice\s*over|voiceover|vo|narration)\s+(?:for\s+)?scene\s*(\d{1,2})\s*[:—=-]\s*([^\n]+)/gim)) {
    if (!voice.has(Number(match[1]))) voice.set(Number(match[1]), unquote(match[2]));
  }
  const ordered = map => {
    const max = count || (map.size ? Math.max(...map.keys()) : 0);
    if (!max || max > 12) return null;
    return Array.from({length:max},(_,i)=>map.get(i+1)||"");
  };
  return {
    requested_count: count,
    voiceovers: ordered(voice),
    visuals: ordered(visual),
    recognized_voiceovers: voice.size,
    recognized_visuals: visual.size,
  };
}

export function scriptedShortDirectedScenes(brief) {
  const req = scriptedShortSceneDirections(brief);
  const n = req.requested_count;
  if (!n || n < 2 || n > 12 || !req.voiceovers || !req.visuals
      || req.voiceovers.length !== n || req.visuals.length !== n
      || req.voiceovers.some(v=>!v) || req.visuals.some(v=>!v)) return null;
  return Array.from({length:n},(_,i)=>({
    voiceover_text:req.voiceovers[i],
    suggested_visual:req.visuals[i],
    asset_id:"",
    media_asset_id:"",
    shot_status:"suggestion",
  }));
}

export function scriptedShortSceneDirectionErrors(brief, timeline) {
  const req = scriptedShortSceneDirections(brief);
  const scenes = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const errors = [];
  if (req.requested_count) {
    if (req.requested_count < 2 || req.requested_count > 12) {
      errors.push("The requested scene count must be between 2 and 12.");
    } else if (scenes.length !== req.requested_count) {
      errors.push("The brief requires exactly " + req.requested_count +
        " scenes, but the proposal contains " + scenes.length + ". No shortened storyboard was accepted.");
    }
  }
  if (req.recognized_voiceovers > 0) {
    if (!req.voiceovers || req.voiceovers.some(x=>!x) ||
        (req.requested_count && req.recognized_voiceovers !== req.requested_count)) {
      errors.push("The original brief contains incomplete numbered scene voiceovers; all scenes must have their own narration.");
    } else if (scenes.length !== req.voiceovers.length ||
      scenes.some((scene,i)=>compact(scene?.voiceover_text) !== compact(req.voiceovers[i]))) {
      errors.push("The proposal repeats, changes or misassigns the exact voiceover for one or more numbered scenes.");
    }
  } else if (req.requested_count && scenes.length > 2) {
    const narration = scenes.map(s=>compact(s?.voiceover_text)).filter(Boolean);
    if (narration.length === scenes.length &&
        new Set(narration).size === 1 && narration[0].length > 45) {
      errors.push("The same full narration was repeated in every scene instead of being divided by scene.");
    }
  }
  if (req.recognized_visuals > 0 && req.visuals?.every(Boolean)) {
    if (scenes.length !== req.visuals.length ||
      scenes.some((scene,i)=>compact(scene?.suggested_visual) !== compact(req.visuals[i]))) {
      errors.push("The proposal omitted or changed the exact visual requirement for one or more numbered scenes.");
    }
  }
  return {ok:errors.length===0,errors,requirements:req};
}
