/**
 * #3094 Script a Short acceptance freezes the exact approved storyboard.
 * Queue admission is never inferred from a generated draft or a browser flag.
 * The existing ready-production durable queue remains the only executor.
 */
import { parseStoryFirstNotes } from "./idea-first-storyboard.mjs";
export const STORY_AUTO_MARKER="story-first-auto=1";
const marker="[story-first-production.1] ";
const f=(row,key)=>row?.fields?.[key];
export const typedStoryIdea=idea=>f(idea,"Studio_Production_Source")==="script_a_short"&&f(idea,"Studio_Production_Mode")==="automatic";
export const storyAutoStamped=record=>String(f(record,"Production_Notes")||"").split(/\r?\n/).includes(STORY_AUTO_MARKER);
export function storyAutoNotes(notes) {
  const lines=String(notes||"").split(/\r?\n/).filter(line=>line!==STORY_AUTO_MARKER);
  // Existing autonomous/prepare-to-review origin must not be duplicated.
  if(!lines.some(line=>/^origin=(?:autonomous|prepare-to-review)$/.test(line)))lines.push("origin=prepare-to-review");
  lines.push(STORY_AUTO_MARKER);
  return lines.filter(Boolean).join("\n");
}
export function frozenStorySnapshotMatches(idea,record,assets) {
  if(!typedStoryIdea(idea)||!storyAutoStamped(record)||!Array.isArray(assets))return false;
  const story=parseStoryFirstNotes(f(idea,"Production_Config_Notes"));
  const lines=String(f(record,"Production_Notes")||"").split(/\r?\n/).filter(line=>line.startsWith(marker));
  if(!story||lines.length!==1)return false;
  let snapshot;try{snapshot=JSON.parse(lines[0].slice(marker.length))}catch{return false}
  if(snapshot?.schema!=="story-first-production.1"||snapshot.profile_id!==story.profile_id||
      snapshot.target_seconds!==story.target_seconds||!Array.isArray(snapshot.scenes)||
      snapshot.scenes.length!==story.scenes.length||assets.length!==story.scenes.length)return false;
  const texts=["time","voiceover","visual","media","scene_label","on_screen_text","on_screen_text_instagram","voiceover_instagram"];
  return story.scenes.every((scene,i)=>{
    const saved=snapshot.scenes[i];
    return saved&&texts.every(key=>String(scene[key]||"")===String(saved[key]||""))&&
      Number(scene.music_only_last_seconds||0)===Number(saved.music_only_last_seconds||0)&&
      Boolean(scene.media_override)===Boolean(saved.media_override)&&
      /^rec[A-Za-z0-9]{14}$/.test(scene.assigned_asset_id)&&
      saved.asset_id===scene.assigned_asset_id&&assets[i]?.media_asset_record_id===scene.assigned_asset_id;
  });
}
