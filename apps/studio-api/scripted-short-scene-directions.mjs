/**
 * Parse explicitly authored scene direction from a human Script a Short brief.
 * Counts, exact quoted VO, visuals, on-screen overlays, platform variants and
 * timings are authoritative and must not be silently rewritten by an AI writer.
 * These helpers do not look up or attach library assets.
 */
const WORD_NUMBERS = Object.freeze({
  one:1,two:2,three:3,four:4,five:5,six:6,seven:7,eight:8,nine:9,ten:10,eleven:11,twelve:12,
});
const compact = value => String(value ?? "").replace(/\s+/g," ").trim();
const unquote = value => compact(value).replace(/^["“”'‘’]+|["“”'‘’]+$/g,"").trim();
const number = value => /^\d+$/.test(String(value)) ? Number(value) : WORD_NUMBERS[String(value||"").toLowerCase()];
const validCount = n => Number.isInteger(n) && n >= 2 && n <= 12;

function explicitCount(source) {
  const n = "(\\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)";
  const patterns = [
    new RegExp("\\b"+n+"\\s*[-–—]?\\s*(?:distinct\\s+|separate\\s+|numbered\\s+)?(?:scenes?|shots?|segments?)\\b","i"),
    new RegExp("\\b(?:number\\s+of\\s+scenes|scene\\s+count|total\\s+scenes|scenes)\\s*[:=]\\s*"+n+"\\b","i"),
  ];
  for(const pattern of patterns) {
    const match=source.match(pattern);
    if(match) return number(match[1]);
  }
  return null;
}

function mainAndInstagram(value) {
  const raw=String(value||"").trim();
  const instagram=raw.match(/\(\s*Instagram\s*:\s*["“]([^"”]+)["”]\s*\)/i);
  const withoutInstagram=raw.replace(/\(\s*Instagram\s*:\s*["“][^"”]+["”]\s*\)/gi,"").trim();
  const first=withoutInstagram.match(/^\s*["“]([^"”]+)["”]/);
  return {
    main: first ? first[1].trim() : unquote(withoutInstagram),
    instagram:instagram ? instagram[1].trim() : "",
    trailing:first ? withoutInstagram.slice(first[0].length).trim() : "",
  };
}

function numberedSection(source, kind) {
  const head=kind==="voice"
    ? /^(?:exact\s+|verbatim\s+|per[- ]scene\s+)?(?:voice\s*over|voiceover|vo|narration)(?:\s+(?:for|by|per)\s+(?:each\s+)?scene)?(?:\s+script)?\s*:?\s*$/i
    : /^(?:required\s+|per[- ]scene\s+)?(?:visuals?|shots?|scene\s+visuals?|shot\s+list|scene\s+list)\s*:?\s*$/i;
  const result=new Map();
  let active=false;
  for (const raw of source.split(/\n/)) {
    const line=raw.trim().replace(/^#{1,5}\s*/,"").replace(/^\*\*(.*?)\*\*$/,"$1");
    if (head.test(line)) {active=true;continue;}
    if (!active) continue;
    const item=line.match(/^(\d{1,2})\s*[.)\]:-]\s*(.+)$/);
    if(item) {
      const n=Number(item[1]);
      const text=mainAndInstagram(item[2].replace(/^(?:voiceover|voice over|vo|narration|visual|shot)\s*[:—-]\s*/i,"")).main;
      if(n>=1&&n<=12&&text)result.set(n,text);
    } else if(line && !/^[-*•]\s+/.test(line)) active=false;
  }
  return result;
}

const HEADER = /^\s*(?:#{1,4}\s*)?(?:\*\*)?(?:scene|shot|segment)\s*#?\s*(\d{1,2})\s*(?:\(\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*s?\s*\))?\s*(?::\s*([^\n*]+))?/gim;

const headingPattern = /^\s*(?:#{1,5}\s*)?(?:\*\*)?(?:scene|shot|segment)\s*#?\s*(\d{1,2})(?:\*\*)?\s*(?:\(\s*(\d{1,3})\s*[-–—]\s*(\d{1,3})\s*(?:s|sec|seconds)?\s*\))?\s*[:—-]?\s*([^\n]*)/gim;
const labelledLine = /^\s*(?:[-*•]\s*)?(?:\*\*)?(visual|image|footage|media|shot description|on[- ]screen text|screen text|overlay text|vo|voice ?over|narration|spoken line)(?:\*\*)?\s*[:—=-]\s*(.*?)\s*$/i;
function parseLabelledValue(raw) {
  const value = String(raw || "").trim().replace(/\*\*\s*$/, "");
  const alternate = value.match(/\(\s*Instagram\s*:\s*["“](.*?)["”]\s*\)\s*$/i);
  const main = alternate ? value.slice(0, alternate.index).trim() : value;
  const quoted = main.match(/^\s*["“](.*?)["”]\s*(.*)$/);
  return { primary: quoted ? quoted[1] : unquote(main), instagram: alternate?.[1] || "", trailing: quoted?.[2] || "" };
}
const sequence = (map, count) => {
  const max = count || (map.size ? Math.max(...map.keys()) : 0);
  if (!max || max > 12) return null;
  return Array.from({length:max}, (_,i) => map.get(i + 1) ?? "");
};
export function scriptedShortSceneDirections(brief) {
  const source = String(brief || "").replace(/\r\n?/g, "\n");
  const voice = numberedSection(source, "voice");
  const visual = numberedSection(source, "visual");
  const overlay = new Map(), instagramOverlay = new Map(), instagramVoice = new Map();
  const labels = new Map(), time = new Map(), silent = new Map();
  const headers = [...source.matchAll(headingPattern)].filter(row => +row[1] >= 1 && +row[1] <= 12);
  const consecutive = headers.length >= 2 && headers.every((row,index) => Number(row[1]) === index + 1);
  const statedCount = explicitCount(source);
  const count = statedCount || (consecutive ? headers.length : null);
  for (let i = 0; i < headers.length; i++) {
    const head = headers[i], n = Number(head[1]);
    const body = source.slice(head.index + head[0].length, headers[i+1]?.index ?? source.length);
    if (head[2] !== undefined && head[3] !== undefined) time.set(n, {start:Number(head[2]),end:Number(head[3])});
    const label = compact(head[4]).replace(/^\*\*\s*|\s*\*\*$/g, "");
    if (label) labels.set(n,label);
    for (const line of body.split("\n")) {
      const field = line.match(labelledLine);
      if (!field) continue;
      const kind = field[1].toLowerCase().replace(/[\s-]+/g, "");
      const value = parseLabelledValue(field[2]);
      if (/^(?:vo|voiceover|narration|spokenline)$/.test(kind)) {
        if (value.primary && !voice.has(n)) voice.set(n,value.primary);
        if (value.instagram) instagramVoice.set(n,value.instagram);
        const last = value.trailing.match(/\blast\s+(\d{1,2})\s+seconds?\s+(?:silent|without\s+(?:voice|narration)|music[- ]only)/i);
        if (last) silent.set(n,Number(last[1]));
      } else if (/^(?:onscreentext|screentext|overlaytext)$/.test(kind)) {
        if (value.primary) overlay.set(n,value.primary);
        if (value.instagram) instagramOverlay.set(n,value.instagram);
      } else if (value.primary && !visual.has(n)) visual.set(n,value.primary);
    }
    const last = body.match(/\blast\s+(\d{1,2})\s+seconds?\s+(?:silent|without\s+(?:voice|narration)|music[- ]only)/i);
    if (last) silent.set(n,Number(last[1]));
  }
  for (const row of source.matchAll(/^\s*(?:vo|voiceover|voice over|narration)\s+(?:for\s+)?scene\s*(\d{1,2})\s*[:—=-]\s*([^\n]+)/gim)) {
    if (!voice.has(+row[1])) voice.set(+row[1],parseLabelledValue(row[2]).primary);
  }
  return {
    requested_count:count, explicit_count:statedCount, header_count:headers.length,
    voiceovers:sequence(voice,count), visuals:sequence(visual,count),
    on_screen_text:sequence(overlay,count), on_screen_text_instagram:sequence(instagramOverlay,count),
    voiceovers_instagram:sequence(instagramVoice,count), scene_labels:sequence(labels,count),
    timings:sequence(time,count), music_only_last_seconds:sequence(silent,count)?.map(v => Number(v) || 0) || null,
    recognized_voiceovers:voice.size, recognized_visuals:visual.size, recognized_timings:time.size,
  };
}
export function scriptedShortDirectedScenes(brief) {
  const data = scriptedShortSceneDirections(brief), count = data.requested_count;
  if (!count || count < 2 || count > 12 || !data.voiceovers || !data.visuals ||
      data.voiceovers.length !== count || data.visuals.length !== count ||
      data.voiceovers.some(v => !v) || data.visuals.some(v => !v)) return null;
  const timed = data.timings?.length === count && data.timings.every((row,i) =>
    row && row.start === (i ? data.timings[i-1].end : 0) && row.end > row.start);
  return Array.from({length:count}, (_,i) => ({
    voiceover_text:data.voiceovers[i], suggested_visual:data.visuals[i],
    scene_label:data.scene_labels?.[i] || "",
    on_screen_text:data.on_screen_text?.[i] || "",
    on_screen_text_instagram:data.on_screen_text_instagram?.[i] || "",
    voiceover_instagram:data.voiceovers_instagram?.[i] || "",
    music_only_last_seconds:data.music_only_last_seconds?.[i] || 0,
    ...(timed ? {start_seconds:data.timings[i].start,end_seconds:data.timings[i].end} : {}),
    asset_id:"", media_asset_id:"", shot_status:"suggestion",
  }));
}

/**
 * Restore metadata after timeline normalization, which may otherwise discard
 * exact authored screen text, IG variants or a timed silent hold.
 * Do not change the numbered voiceover or visuals: QA rejects their drift.
 */
export function scriptedShortApplySceneDirections(brief, timeline) {
  const source = scriptedShortSceneDirections(brief);
  const rows = Array.isArray(timeline?.segments) ? timeline.segments : [];
  if (!source.requested_count || rows.length !== source.requested_count) return timeline;
  const timed = source.timings?.every((row,i) =>
    row && row.start === (i ? source.timings[i-1]?.end : 0) && row.end > row.start);
  const segments = rows.map((row,i) => {
    const next = { ...row, index: i + 1,
      scene_label: source.scene_labels?.[i] || "",
      on_screen_text: source.on_screen_text?.[i] || "",
      on_screen_text_instagram: source.on_screen_text_instagram?.[i] || "",
      voiceover_instagram: source.voiceovers_instagram?.[i] || "",
      music_only_last_seconds: source.music_only_last_seconds?.[i] || 0,
    };
    if (timed) {
      next.start_seconds = source.timings[i].start;
      next.end_seconds = source.timings[i].end;
      next.duration_seconds = next.end_seconds - next.start_seconds;
    }
    return next;
  });
  return { ...timeline, segments,
    duration_seconds: timed ? source.timings.at(-1).end : timeline.duration_seconds };
}
export function scriptedShortSceneDirectionErrors(brief, timeline) {
  const data = scriptedShortSceneDirections(brief);
  const scenes = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const errors = [];
  if (data.requested_count) {
    if (data.requested_count < 2 || data.requested_count > 12) {
      errors.push("The requested scene count must be between 2 and 12.");
    } else if (scenes.length !== data.requested_count) {
      errors.push("The brief requires exactly " + data.requested_count +
        " scenes, but the proposal contains " + scenes.length + ". No shortened storyboard was accepted.");
    }
  }
  if (data.explicit_count && data.header_count >= 2 && data.header_count !== data.explicit_count) {
    errors.push("The stated scene count conflicts with the numbered scene instructions.");
  }
  if (data.recognized_voiceovers) {
    if (!data.voiceovers || data.voiceovers.some(v => !v) ||
        (data.requested_count && data.recognized_voiceovers !== data.requested_count)) {
      errors.push("The original brief contains incomplete numbered scene voiceovers.");
    } else if (scenes.length !== data.voiceovers.length ||
      scenes.some((row,i) => compact(row.voiceover_text) !== compact(data.voiceovers[i]))) {
      errors.push("The proposal repeats, changes or misassigns the exact voiceover for one or more numbered scenes.");
    }
  } else if (data.requested_count && scenes.length > 2 && scenes.every(s => compact(s.voiceover_text) === compact(scenes[0]?.voiceover_text)) &&
             compact(scenes[0]?.voiceover_text).length > 45) {
    errors.push("The same full narration was repeated in every scene.");
  }
  if (data.recognized_visuals && data.visuals?.every(Boolean) &&
      (scenes.length !== data.visuals.length || scenes.some((row,i) => compact(row.suggested_visual) !== compact(data.visuals[i])))) {
    errors.push("The proposal changed the numbered visual requirements.");
  }
  if (data.recognized_timings) {
    if (data.recognized_timings !== data.requested_count || !data.timings?.every((row,i) =>
      row && row.start === (i ? data.timings[i-1]?.end : 0) && row.end > row.start)) {
      errors.push("The supplied scene timings are incomplete or not contiguous.");
    } else if (scenes.length !== data.timings.length ||
      scenes.some((row,i) => Number(row.start_seconds) !== data.timings[i].start ||
                           Number(row.end_seconds) !== data.timings[i].end)) {
      errors.push("The proposal changed the scene start or end times.");
    }
  }
  for (const [field,source,label] of [
    ["on_screen_text","on_screen_text","on-screen text"],
    ["on_screen_text_instagram","on_screen_text_instagram","Instagram on-screen text"],
    ["voiceover_instagram","voiceovers_instagram","Instagram voiceover"],
  ]) {
    const expected = data[source];
    if (expected?.some(Boolean) && (scenes.length !== expected.length ||
      scenes.some((row,i) => compact(row[field]) !== compact(expected[i])))) {
      errors.push("The proposal changed the " + label + " instructions.");
    }
  }
  if (data.music_only_last_seconds?.some(Boolean) &&
      (scenes.length !== data.music_only_last_seconds.length ||
       scenes.some((row,i) => (Number(row.music_only_last_seconds) || 0) !== data.music_only_last_seconds[i]))) {
    errors.push("The proposal changed the music-only narration hold.");
  }
  return {ok:errors.length === 0,errors,requirements:data};
}
