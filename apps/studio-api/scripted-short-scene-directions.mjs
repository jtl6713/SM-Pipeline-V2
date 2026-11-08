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

export function scriptedShortSceneDirections(brief) {
  const source=String(brief||"").replace(/\r\n?/g,"\n");
  const voice=numberedSection(source,"voice");
  const visual=numberedSection(source,"visual");
  const overlays=new Map(),igOverlays=new Map(),igVoices=new Map(),timings=new Map();
  const labels=new Map(),musicOnly=new Map();
  const headers=[...source.matchAll(HEADER)]
    .filter(match=>Number(match[1])>=1&&Number(match[1])<=12);
  for(let i=0;i<headers.length;i++) {
    const h=headers[i],n=Number(h[1]);
    const next=headers[i+1]?.index??source.length;
    const body=source.slice(h.index+h[0].length,next);
    if(h[2]!==undefined&&h[3]!==undefined) {
      timings.set(n,{start_seconds:Number(h[2]),end_seconds:Number(h[3])});
    }
    const label=compact(h[4]||"").replace(/\*+$/,"");
    if(label)labels.set(n,label);
    for(const raw of body.split(/\n/)) {
      const line=raw.trim().replace(/^[-*•]\s*/,"").replace(/^\*\*(.*?)\*\*$/,"$1");
      const match=line.match(/^(visual|image|footage|media|shot description|on[- ]screen text|on screen|overlay text|voice\s*over|voiceover|vo|narration|spoken line)\s*[:—=-]\s*(.+)$/i);
      if(!match)continue;
      const kind=match[1].toLowerCase().replace(/\s+/g," ");
      const parsed=mainAndInstagram(match[2]);
      if(/^(visual|image|footage|media|shot description)$/.test(kind)) {
        if(!visual.has(n))visual.set(n,parsed.main);
      } else if(/^(on[- ]screen text|on screen|overlay text)$/.test(kind)) {
        overlays.set(n,parsed.main);
        if(parsed.instagram)igOverlays.set(n,parsed.instagram);
      } else {
        voice.set(n,parsed.main);
        if(parsed.instagram)igVoices.set(n,parsed.instagram);
        const note=match[2].match(/\blast\s+(\d{1,2})\s+seconds?\s+silent\b/i)
          || match[2].match(/\bleave\s+(?:the\s+)?last\s+(\d{1,2})\s+seconds?\s+(?:without\s+narration|with\s+just\s+music)\b/i);
        if(note)musicOnly.set(n,Number(note[1]));
      }
    }
  }
  // "VO for Scene 3: ..." without explicit scene headers is also supported.
  for(const match of source.matchAll(/^\s*(?:voice\s*over|voiceover|vo|narration)\s+(?:for\s+)?scene\s*(\d{1,2})\s*[:—=-]\s*([^\n]+)/gim)) {
    if(!voice.has(Number(match[1])))voice.set(Number(match[1]),mainAndInstagram(match[2]).main);
  }
  const headingIndices=[...new Set(headers.map(h=>Number(h[1])))].sort((a,b)=>a-b);
  const headerCount=headingIndices.length>=2
    && headingIndices.every((n,i)=>n===i+1) ? headingIndices.length : null;
  const count=explicitCount(source)??headerCount;
  const ordered=(map,empty="")=> validCount(count)
    ?Array.from({length:count},(_,i)=>map.get(i+1)??empty):null;
  const requestedTimings=ordered(timings,null);
  const validTimings=requestedTimings?.every((t,i)=> t && Number.isInteger(t.start_seconds)
    && Number.isInteger(t.end_seconds) && t.end_seconds>t.start_seconds
    && (i===0?t.start_seconds===0:t.start_seconds===requestedTimings[i-1]?.end_seconds));
  return {
    requested_count:count,
    voiceovers:ordered(voice),
    visuals:ordered(visual),
    on_screen_texts:ordered(overlays),
    on_screen_texts_instagram:ordered(igOverlays),
    voiceovers_instagram:ordered(igVoices),
    scene_labels:ordered(labels),
    music_only_last_seconds:ordered(musicOnly,0),
    timings:validTimings?requestedTimings:null,
    recognized_voiceovers:voice.size,
    recognized_visuals:visual.size,
    recognized_on_screen_texts:overlays.size,
    has_timing_headers:timings.size>0,
  };
}

export function scriptedShortDirectedScenes(brief) {
  const req=scriptedShortSceneDirections(brief),n=req.requested_count;
  if(!validCount(n)||!req.voiceovers||!req.visuals||
     req.voiceovers.some(x=>!x)||req.visuals.some(x=>!x))return null;
  return Array.from({length:n},(_,i)=>({
    voiceover_text:req.voiceovers[i],
    suggested_visual:req.visuals[i],
    ...(req.scene_labels?.[i]?{scene_label:req.scene_labels[i]}:{}),
    ...(req.on_screen_texts?.[i]?{on_screen_text:req.on_screen_texts[i]}:{}),
    ...(req.on_screen_texts_instagram?.[i]?{on_screen_text_instagram:req.on_screen_texts_instagram[i]}:{}),
    ...(req.voiceovers_instagram?.[i]?{voiceover_instagram:req.voiceovers_instagram[i]}:{}),
    ...(req.music_only_last_seconds?.[i]?{music_only_last_seconds:req.music_only_last_seconds[i]}:{}),
    ...(req.timings?.[i]?{start_seconds:req.timings[i].start_seconds,end_seconds:req.timings[i].end_seconds}:{}),
    asset_id:"",media_asset_id:"",shot_status:"suggestion",
  }));
}

/** Attach verbatim scene editorial metadata after internal timeline normalization. */
export function scriptedShortApplySceneDirections(brief,timeline) {
  const req=scriptedShortSceneDirections(brief);
  const rows=Array.isArray(timeline?.segments)?timeline.segments:[];
  if(!validCount(req.requested_count)||rows.length!==req.requested_count)return timeline;
  const segments=rows.map((segment,i)=>{
    const t=req.timings?.[i];
    const result={...segment,index:i+1,
      ...(req.scene_labels?.[i]?{scene_label:req.scene_labels[i]}:{}),
      ...(req.on_screen_texts?.[i]?{on_screen_text:req.on_screen_texts[i]}:{}),
      ...(req.on_screen_texts_instagram?.[i]?{on_screen_text_instagram:req.on_screen_texts_instagram[i]}:{}),
      ...(req.voiceovers_instagram?.[i]?{voiceover_instagram:req.voiceovers_instagram[i]}:{}),
      ...(req.music_only_last_seconds?.[i]?{music_only_last_seconds:req.music_only_last_seconds[i]}:{}),
    };
    if(t) {
      result.start_seconds=t.start_seconds;
      result.end_seconds=t.end_seconds;
      result.duration_seconds=t.end_seconds-t.start_seconds;
    }
    return result;
  });
  return {...timeline,segments,
    duration_seconds:req.timings?.at(-1)?.end_seconds??timeline.duration_seconds};
}

export function scriptedShortSceneDirectionErrors(brief,timeline) {
  const req=scriptedShortSceneDirections(brief);
  const scenes=Array.isArray(timeline?.segments)?timeline.segments:[];
  const errors=[];
  if(req.requested_count) {
    if(!validCount(req.requested_count))
      errors.push("The requested scene count must be between 2 and 12.");
    else if(scenes.length!==req.requested_count)
      errors.push("The brief requires exactly "+req.requested_count+" scenes, but the proposal contains "+scenes.length+". No shortened storyboard was accepted.");
  }
  if(req.recognized_voiceovers>0) {
    if(!req.voiceovers||req.voiceovers.some(x=>!x)||
       (req.requested_count&&req.recognized_voiceovers!==req.requested_count))
      errors.push("The original brief contains incomplete numbered scene voiceovers; all scenes must have their own narration.");
    else if(scenes.length!==req.voiceovers.length||
      scenes.some((s,i)=>compact(s.voiceover_text)!==compact(req.voiceovers[i])))
      errors.push("The proposal repeats, changes or misassigns the exact voiceover for one or more numbered scenes.");
  } else if(req.requested_count&&scenes.length>2) {
    const narration=scenes.map(s=>compact(s.voiceover_text)).filter(Boolean);
    if(narration.length===scenes.length&&new Set(narration).size===1&&narration[0].length>45)
      errors.push("The same full narration was repeated in every scene instead of being divided by scene.");
  }
  if(req.recognized_visuals>0&&req.visuals?.every(Boolean)&&
     (scenes.length!==req.visuals.length||
      scenes.some((s,i)=>compact(s.suggested_visual)!==compact(req.visuals[i]))))
    errors.push("The proposal omitted or changed the exact visual requirement for one or more numbered scenes.");
  if(req.has_timing_headers&&!req.timings)
    errors.push("The original scene timing ranges are incomplete or not contiguous.");
  if(req.timings&&(scenes.length!==req.timings.length||
    scenes.some((s,i)=>Number(s.start_seconds)!==req.timings[i].start_seconds||
      Number(s.end_seconds)!==req.timings[i].end_seconds)))
    errors.push("The scene timings must exactly match the original storyboard.");
  for(const [field,values,label] of [
    ["on_screen_text",req.on_screen_texts,"on-screen text"],
    ["on_screen_text_instagram",req.on_screen_texts_instagram,"Instagram on-screen text"],
    ["voiceover_instagram",req.voiceovers_instagram,"Instagram voiceover"],
    ["scene_label",req.scene_labels,"scene name"],
  ]) {
    if(values?.some(Boolean)&&scenes.length===values.length&&
       scenes.some((s,i)=>values[i]&&compact(s[field])!==compact(values[i])))
      errors.push("The proposal did not preserve the original "+label+" for every scene.");
  }
  if(req.music_only_last_seconds?.some(Boolean)&&scenes.length===req.music_only_last_seconds.length&&
     scenes.some((s,i)=>req.music_only_last_seconds[i] &&
       Number(s.music_only_last_seconds||0)!==req.music_only_last_seconds[i]))
    errors.push("The music-only hold was not preserved.");
  return {ok:errors.length===0,errors,requirements:req};
}
