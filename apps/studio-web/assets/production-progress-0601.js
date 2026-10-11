/* Noninteractive progress indicators for Production timeline handoff. */
(function(){
 const target=document.getElementById('productionRequestMessage');
 if(!target)return;
 let updating=false;
 function render(){
  if(updating)return;
  const raw=(target.dataset.progressSource||target.textContent||'').trim();
  if(!/timeline and stills are on production|platform crops are still finishing/i.test(raw)){
   if(target.dataset.progressSource){updating=true;target.replaceChildren(document.createTextNode(raw));delete target.dataset.progressSource;updating=false}
   return;
  }
  const ready=/crops (?:are )?ready|ready for production approve|ready for approval/i.test(raw)&&!/still finishing|still preparing|not ready/i.test(raw);
  const steps=[['Timeline created',true],['Stills attached',true],['Platform crops ready',ready],['Production approved',false]];
  updating=true;
  target.dataset.progressSource=raw;
  const list=document.createElement('div');list.className='production-progress-list';list.setAttribute('role','status');list.setAttribute('aria-label','Production preparation progress');
  steps.forEach(([label,complete])=>{
   const row=document.createElement('div');row.className='production-progress-step'+(complete?' is-complete':'');
   const mark=document.createElement('span');mark.className='production-progress-mark';mark.setAttribute('aria-hidden','true');mark.textContent=complete?'✓':'';
   const text=document.createElement('span');text.textContent=label;
   row.append(mark,text);list.append(row);
  });
  const note=document.createElement('div');note.className='production-progress-note';note.textContent='Open Production and approve once platform crops are Ready. Approval does not publish.';
  target.replaceChildren(list,note);
  updating=false;
 }
 const observer=new MutationObserver(()=>{
  if(updating)return;
  if(target.querySelector('.production-progress-list'))return;
  delete target.dataset.progressSource;
  render();
 });
 observer.observe(target,{childList:true,characterData:true,subtree:true});
 render();
})();
