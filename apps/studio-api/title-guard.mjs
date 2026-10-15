/** Central, profile-scoped, exact-title identity policy. Never merge platform siblings. */
export const TITLE_GUARD_RANK = Object.freeze({ideas:1,production:2,scheduled:3,published:4});
export const TITLE_GUARD_STAGES = Object.freeze(['ideas','production','schedule','publish']);
export const titleGuardKey = x => String(x ?? '').normalize('NFC').trim().replace(/\s+/gu,' ');
export function titleGuardMode(env,stage) {
  const mode=String(env?.STUDIO_TITLE_GUARD_MODE || 'off').toLowerCase().trim();
  if(mode!=='monitor' && mode!=='block') return 'off';
  if(mode==='monitor') return 'monitor';
  return String(env?.STUDIO_TITLE_GUARD_BLOCK_STAGES || '').split(',').map(s=>s.trim()).includes(stage)?'block':'monitor';
}
const values=x=>Array.isArray(x)?x:[];
const get=(r,k)=>r?.fields?.[k] ?? r?.[k];
const linkIds=x=>values(x).map(v=>typeof v==='string'?v:v?.id).filter(Boolean);
export function titleGuardClassifyContent(row,outputs=[]) {
  if(outputs.some(o=>get(o,'Published_At')||get(o,'Platform_Post_URL')||get(o,'Platform_Post_ID')||get(o,'Publish_Status')==='Published')) return 'published';
  if(outputs.some(o=>get(o,'Scheduled_Post_Date') && !get(o,'Do_Not_Publish') && get(o,'Output_Status')!=='Cancelled')) return 'scheduled';
  if(get(row,'Content_Status')==='Published') return 'published';
  if(get(row,'Content_Status')==='Scheduled') return 'scheduled';
  return 'production';
}
export function titleGuardMatches({title,profileId,ideas=[],requests=[],contents=[],outputsByContent={}}) {
  const key=titleGuardKey(title);
  if(!key||!profileId) return [];
  const matches=[];
  const matchingIdeas=new Map();
  for(const r of ideas) {
    if(titleGuardKey(get(r,'Candidate_Title'))!==key || !linkIds(get(r,'Content_Profile')).includes(profileId)) continue;
    if(['Rejected','Deleted'].includes(get(r,'Candidate_Status'))) continue;
    matchingIdeas.set(r.id,r);
    matches.push({id:r.id,kind:'idea',stage:'ideas',ideaId:r.id,linkedContentIds:linkIds(get(r,'Content Items'))});
  }
  for(const r of requests) {
    if(titleGuardKey(get(r,'Requested_Title')||get(r,'Candidate_Title'))!==key) continue;
    const ideaId=linkIds(get(r,'Idea_Candidate'))[0]||null;
    if(!linkIds(get(r,'Content_Profile')).includes(profileId) && !matchingIdeas.has(ideaId)) continue;
    if(get(r,'Request_Status')==='Cancelled'||get(r,'Active')===false) continue;
    matches.push({id:r.id,kind:'request',stage:'production',ideaId,linkedContentIds:linkIds(get(r,'Content Items'))});
  }
  for(const r of contents) {
    if(titleGuardKey(get(r,'Content_Title'))!==key || !linkIds(get(r,'Content_Profile')).includes(profileId)) continue;
    const stage=titleGuardClassifyContent(r,outputsByContent[r.id]||[]);
    if(get(r,'Content_Status')==='Archived' && stage!=='published') continue;
    const ownerIdea=[...matchingIdeas.values()].find(i=>linkIds(get(i,'Content Items')).includes(r.id));
    matches.push({id:r.id,kind:'content',stage,ideaId:ownerIdea?.id||null,linkedContentIds:[r.id]});
  }
  const kinds={content:0,request:1,idea:2};
  return matches.sort((a,b)=>(TITLE_GUARD_RANK[b.stage]-TITLE_GUARD_RANK[a.stage])||(kinds[a.kind]-kinds[b.kind])||a.id.localeCompare(b.id));
}
export function titleGuardDecision({title,profileId,ideaId=null,contentId=null,matches=[]}) {
  if(!titleGuardKey(title)||!profileId) return {valid:false,reason:'missing_identity',match:null,matches:[]};
  const existing=matches.filter(m=>{
    if(contentId && (m.id===contentId||m.linkedContentIds?.includes(contentId))) return false;
    if(ideaId && (m.id===ideaId||m.ideaId===ideaId)) return false;
    return true;
  });
  return {valid:true,reason:existing.length?'existing_title':'available',match:existing[0]||null,matches:existing};
}
export function titleGuardExactFormula(field,title) {
  if(!['Candidate_Title','Requested_Title','Content_Title'].includes(field)) throw new TypeError('Unsupported title field');
  return 'EXACT({' + field + '},"' + String(title).replace(/\\/g,'\\\\').replace(/"/g,'\\"') + '")';
}
