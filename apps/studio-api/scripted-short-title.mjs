/**
 * Script a Short title suggestion based on the accepted narration and prompt.
 * The prompt is creative direction, never a publishable headline.
 * Pure, cheap and deterministic: no extra model call and no invented landmarks.
 */
const MAX_TITLE_LENGTH = 90;
const instructionWords = /\b(?:utilize|uploaded|you don't|please|don't have to|system|write|generate|create\s+(?:a|an)|make\s+(?:a|an)|caption|hashtags|voiceover|script|use\s+(?:the|my|our))\b/i;
const readable = (value) => String(value || "").replace(/\s+/g, " ").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").trim();

/**
 * Explicit naming instructions are user-authored output data, not creative
 * direction to be overwritten by the automatic headline generator.
 */
export function scriptedShortExplicitTitle(prompt) {
  const source = String(prompt || "").replace(/\r/g, "");
  const patterns = [
    // "Please use this exact title:" is the normal creative-brief syntax.
    // Accept "this" and "please" rather than silently falling back to AI.
    /(?:^|[\n.!?;]\s*)\s*(?:please\s+)?(?:use|set|keep)\s+(?:(?:this|the|my)\s+)?(?:exact\s+)?(?:video\s+|post\s+|short\s+|content\s+)?(?:title|headline)\s*(?:(?:exactly\s+)?(?:as|to|:|=))?\s*([^\n]+)/im,
    /(?:^|[\n.!?;]\s*)\s*(?:please\s+)?(?:the\s+)?(?:exact\s+)?(?:video\s+|post\s+|short\s+|content\s+)?title\s*(?:should\s+be|must\s+be|is|:|=)\s*([^\n]+)/im,
    /\b(?:call|name|title)\s+(?:the\s+)?(?:video|short|reel|post|piece|it|this)\s+(?:exactly\s+)?(?:as\s+)?[:"'“”]?\s*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(source);
    if (!match) continue;
    let title = String(match[1]).trim().replace(/^[:=]\s*/, "");
    // Propose/Accept flatten line breaks in creative briefs. Stop at the
    // next named section so Location/Shot list never become part of a title.
    title = title.split(/\s+(?=(?:location|shot\s*list|sample\s*caption|hashtags?|voiceover|visuals?|asset\s*list|scene\s*\d+)\s*:)/i)[0];
    const quoted = /^(["'“‘])(.+)(["'”’])$/.exec(title);
    if (quoted && ({ '"': '"', "'": "'", '“': '”', '‘': '’' })[quoted[1]] === quoted[3]) {
      title = quoted[2];
    } else {
      title = title.split(/\s*[.;]\s+(?=(?:use|include|make|do not|don't|avoid|with|for)\b)/i)[0];
    }
    // Preserve the user's exact typographic quotation marks and em dash.
    // In "Viaduct — “Architecture in the Light”" the closing quote is not
    // an outer wrapper and must never be stripped.
    title = title.replace(/\s+/g, " ").trim();
    if (title && title.length <= MAX_TITLE_LENGTH) return title;
  }
  return "";
}

function subjectFromNarration(timeline) {
  const scenes = Array.isArray(timeline?.segments) ? timeline.segments : [];
  const opening = readable(scenes[0]?.voiceover_text);
  const match = /\b(?:welcome to|explore|discover|visit|step inside|take a look at|take a tour of)\s+(.+?)(?=\s*(?:[—–:,.!?;]|\bwhere\b|\bwith\b|$))/i.exec(opening);
  if (!match) return "";
  return match[1].trim();
}

function subjectFromPrompt(prompt) {
  const sentence = readable(prompt).split(/[.!?]/)[0] || "";
  const match = /\b(?:history|story|origins|evolution|past)\s+of\s+(.*)/i.exec(sentence)
    || /\b(?:about|explore|discover|feature|visit|showcase)\s+(.*)/i.exec(sentence)
    || /\b(?:guide to|tour of|walk through)\s+(.*)/i.exec(sentence);
  if (!match) return "";
  return match[1]
    .replace(/\s+(?:area|neighborhood|district)\s+of\b.*$/i, "")
    .replace(/\s+(?:using|utilizing|with|featuring|including)\b.*$/i, "")
    .trim();
}

function validSubject(value) {
  let text = readable(value).replace(/^[\s"']*(?:the|a|an)\s+/i, "").replace(/[\s.,:;—–-]+$/g, "");
  if (!text || text.length > 65 || text.split(" ").length > 9 || instructionWords.test(text)) return "";
  // For two related places, ampersand creates a concise, readable title.
  if (text.split(" ").length >= 5) text = text.replace(/\s+and\s+/gi, " & ");
  return text;
}

/**
 * Return the best safe short headline using what the story actually covers.
 * Reject copy-pasted instructions and never use an arbitrary truncated prompt.
 */
export function scriptedShortPublishableTitle(prompt, timeline, market = "") {
  const explicit = scriptedShortExplicitTitle(prompt);
  if (explicit) return explicit;
  const source = readable(prompt);
  const narrated = validSubject(subjectFromNarration(timeline));
  const topic = narrated || validSubject(subjectFromPrompt(source));
  const spoken = (Array.isArray(timeline?.segments) ? timeline.segments : [])
    .map((scene) => readable(scene?.voiceover_text)).join(" ");
  const history = /\b(?:history|historic|past|centur(?:y|ies)|origins|evolution)\b/i.test(source + " " + spoken);
  const waterfront = /\b(?:river|riverside|waterfront|shoreline|coast|harbor|hudson|lakefront|bay|esplanade)\b/i.test(spoken);
  const manhattan = /\b(?:manhattan|new york)\b/i.test(source + " " + spoken);
  const subject = topic || validSubject(market) || "A Story Worth Exploring";
  let suffix = "";
  if (history && waterfront) suffix = manhattan ? "Manhattan's Waterfront Story" : "A Waterfront Through Time";
  else if (history) suffix = "Then and Now";
  else if (waterfront) suffix = "Life Along the Waterfront";
  else if (/\b(?:guide|tips|how to|visit)\b/i.test(source)) suffix = "What to Know Before You Go";
  else suffix = "A Closer Look";
  let title = subject === "A Story Worth Exploring" ? subject : subject + ": " + suffix;
  // Do not truncate the prompt into a fake headline. Shorten the suffix instead.
  if (title.length > MAX_TITLE_LENGTH) title = subject + ": A Closer Look";
  if (title.length > MAX_TITLE_LENGTH) title = subject.slice(0, MAX_TITLE_LENGTH).trim();
  return title;
}
