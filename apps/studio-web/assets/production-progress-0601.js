/* Persistent Production checklist: state derived from request/workspace, not transient toast text. */
(function(){
 const labels=['Timeline created','Stills attached','Platform crops ready','Production approved'];
 const $=id=>document.getElementById(id);
 let updating=false;
 function state(){
  const request=$('productionRequestStatus');
  const workspace=null;
  const status=String(request?.textContent||$('productionRequestStatus')?.textContent||'').trim();
  const message=String($('productionRequestMessage')?.dataset.progressSource||$('productionRequestMessage')?.textContent||'');
  const timeline=/timeline and stills are on production/i.test(message)||/plan is ready|ready to approve|approved\./i.test(String($('productionPromotionCompatibility')?.textContent||''));
  const stills=/timeline and stills are on production/i.test(message)||/photos are saved|plan is ready|ready to approve|approved\./i.test(String($('productionPromotionCompatibility')?.textContent||''));
  const compatibility=String($('productionPromotionCompatibility')?.dataset.progressNote||$('productionPromotionCompatibility')?.textContent||'');
  const crops=/5 platform-ready|variants are ready|ready to approve|approved\.|crops (?:are )?ready/i.test(compatibility+' '+message)&&!/still finishing|still preparing|not ready/i.test(compatibility+' '+message);
  const approved=/^(Promoted|Approved)$/i.test(status);
  return [timeline||approved,stills||approved,crops||approved,approved];
 }
 function render(){
  if(updating)return;
  const target=$('productionPromotionCompatibility')||$('productionRequestMessage');
  if(!target)return;
  const request=$('productionRequestStatus');
  const workspace=null;
  const source=$('productionRequestMessage');
  const sourceText=String(source?.dataset.progressSource||source?.textContent||'');
  const relevant=Boolean(request&&(/timeline and stills are on production/i.test(sourceText)||$('productionPromotionCompatibility')?.textContent?.trim()));
  if(!relevant)return;
  const flags=state();
  const prior=target.querySelector('.production-progress-list');
  const current=target.textContent.trim();
  if(prior&&target.dataset.progressSignature===flags.join(','))return;
  const noteText=prior?(target.dataset.progressNote||''):current;
  const list=document.createElement('div');
  list.className='production-progress-list';
  list.setAttribute('role','status');
  list.setAttribute('aria-label','Production preparation progress');
  labels.forEach((label,i)=>{
   const row=document.createElement('div');
   row.className='production-progress-step'+(flags[i]?' is-complete':'');
   const mark=document.createElement('span');
   mark.className='production-progress-mark';
   mark.setAttribute('aria-hidden','true');
   mark.textContent=flags[i]?'✓':'';
   const text=document.createElement('span');text.textContent=label;
   row.append(mark,text);list.append(row);
  });
  const note=document.createElement('div');
  note.className='production-progress-note';
  note.textContent=flags[3]?'Production approved. Approval does not publish.':(noteText||'Open Production and approve once platform crops are ready. Approval does not publish.');
  updating=true;
  target.dataset.progressSignature=flags.join(',');
  target.dataset.progressNote=note.textContent;
  target.replaceChildren(list,note);
  updating=false;
 }
 const observer=new MutationObserver(()=>{if(!updating)queueMicrotask(render)});
 ['productionRequestMessage','productionPromotionCompatibility','productionRequestStatus'].forEach(id=>{
  const node=$(id);if(node)observer.observe(node,{childList:true,characterData:true,subtree:true});
 });
 render();
})();
