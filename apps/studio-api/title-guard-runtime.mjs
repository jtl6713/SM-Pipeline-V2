import {titleGuardKey,titleGuardMode,titleGuardMatches,titleGuardDecision,titleGuardExactFormula} from './title-guard.mjs';
const registry='studio_title_registry', auditTable='studio_title_guard_audit';
function err(status,message,code=null) {const e=new Error(message);e.status=status;if(code)e.code=code;return e;}
function conflict(match) {return err(409,'Duplicate title already exists at '+match.stage+' ('+match.kind+' '+match.id+'). Open that record instead.','TITLE_ALREADY_EXISTS');}
function config(message) {return err(503,'Title guard unavailable: '+message);}
async function audit(env,data) {
  const db=env?.STUDIO_TITLE_REGISTRY;
  if(db?.prepare) {
    try {
      await db.prepare('INSERT INTO '+auditTable+' (occurred_at,profile_id,title_key,stage,source,mode,outcome,winning_record_id) VALUES (?,?,?,?,?,?,?,?)')
        .bind(new Date().toISOString(),data.profileId,data.title,data.stage,data.source,data.mode,data.match?'collision':'clear',data.match?.id||null).run();
      return;
    } catch(e) {console.warn('title_guard_audit_error',String(e?.message||e));}
  }
  if(data.match)console.warn('title_guard_collision',JSON.stringify(data));
}
async function readMatches(env,title,profileId,{listRecords,airtableFetch,ideaTableId,requestTableId,contentTableId,outputTableId}) {
  const specs=[[ideaTableId,'Candidate_Title'],[requestTableId,'Requested_Title'],[contentTableId,'Content_Title']];
  const [ideas,requests,contents]=await Promise.all(specs.map(([id,field])=>{
    if(!id)throw config('missing Airtable '+field+' table');
    return listRecords(env,id,{limit:50,filterFormula:titleGuardExactFormula(field,title)});
  }));
  const outputsByContent={};
  if(airtableFetch&&outputTableId) {
    for(const r of contents) {
      const links=Array.isArray(r?.fields?.['Platform Outputs'])?r.fields['Platform Outputs']:[];
      outputsByContent[r.id]=(await Promise.all(links.filter(id=>/^rec[A-Za-z0-9]+$/.test(String(id))).slice(0,25)
        .map(id=>airtableFetch(env,outputTableId,id).catch(e=>{console.warn('title_guard_output_read_failed',id,String(e?.message||e));return null;})))).filter(Boolean);
    }
  }
  return titleGuardMatches({title,profileId,ideas,requests,contents,outputsByContent});
}
async function reserve(env,profileId,title,stage,ideaId,contentId) {
  const db=env?.STUDIO_TITLE_REGISTRY;
  if(!db?.prepare)throw config('STUDIO_TITLE_REGISTRY D1 binding required before blocking');
  const key=titleGuardKey(title),ownerId=contentId||ideaId||'reservation:'+crypto.randomUUID();
  const ownerKind=contentId?'content':ideaId?'idea':'reservation';
  try {
    const result=await db.prepare('INSERT OR IGNORE INTO '+registry+' (profile_id,title_key,title_display,owner_id,owner_kind,stage,updated_at) VALUES (?,?,?,?,?,?,?)')
      .bind(profileId,key,key,ownerId,ownerKind,stage,new Date().toISOString()).run();
    const created=Number(result?.meta?.changes || 0)>0;
    const current=await db.prepare('SELECT owner_id,owner_kind,stage FROM '+registry+' WHERE profile_id=? AND title_key=?').bind(profileId,key).first();
    if(!current)throw config('reservation could not be read');
    if(current.owner_id!==ownerId)throw conflict({kind:current.owner_kind,id:current.owner_id,stage:current.stage});
    return {key,profileId,ownerId,created};
  }catch(e){if(e?.status)throw e;throw config(String(e?.message||e));}
}
export async function titleGuardCommit(env,reservation,id,stage='ideas') {
  if(!reservation?.created||!env?.STUDIO_TITLE_REGISTRY?.prepare||!id)return;
  await env.STUDIO_TITLE_REGISTRY.prepare('UPDATE '+registry+' SET owner_id=?,owner_kind=?,stage=?,updated_at=? WHERE profile_id=? AND title_key=? AND owner_id=?')
    .bind(id,stage==='ideas'?'idea':'content',stage,new Date().toISOString(),reservation.profileId,reservation.key,reservation.ownerId).run();
}
export async function titleGuardRelease(env,reservation) {
  if(!reservation?.created||!env?.STUDIO_TITLE_REGISTRY?.prepare)return;
  await env.STUDIO_TITLE_REGISTRY.prepare('DELETE FROM '+registry+' WHERE profile_id=? AND title_key=? AND owner_id=?')
    .bind(reservation.profileId,reservation.key,reservation.ownerId).run();
}
/** All writes use this preflight. Monitor is observational and always fail-open. */
export async function titleGuardBeforeWrite({env,stage,source,title,profileId,ideaId=null,contentId=null,
  listRecords,airtableFetch,ideaTableId,requestTableId,contentTableId,outputTableId}) {
  const mode=titleGuardMode(env,stage);
  if(mode==='off')return {mode,match:null,reservation:null};
  const key=titleGuardKey(title);
  if(!key||!profileId) {
    if(mode==='block')throw config('missing title/profile identity');
    console.warn('title_guard_missing_identity',{stage,source});
    return {mode,match:null,reservation:null};
  }
  try {
    const matches=await readMatches(env,key,profileId,{listRecords,airtableFetch,ideaTableId,requestTableId,contentTableId,outputTableId});
    const decision=titleGuardDecision({title:key,profileId,ideaId,contentId,matches});
    const evidence={stage,source,title:key,profileId,mode,match:decision.match};
    if(mode==='monitor') {
      void audit(env,evidence).catch(()=>{});
      return {mode,match:decision.match,reservation:null};
    }
    if(decision.match) {
      await audit(env,evidence).catch(()=>{});
      throw conflict(decision.match);
    }
    const reservation=await reserve(env,profileId,key,stage,ideaId,contentId);
    return {mode,match:null,reservation};
  }catch(e){
    if(mode==='monitor') {
      console.warn('title_guard_monitor_failure',{stage,source,error:String(e?.message||e)});
      return {mode,match:null,reservation:null};
    }
    throw e;
  }
}
