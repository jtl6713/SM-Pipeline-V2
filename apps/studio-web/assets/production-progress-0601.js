/* Stable Production checklist. Source of truth: item4 workspace state passed by main app. */
(function(){
 const labels=['Timeline created','Stills attached','Platform crops ready','Production approved'];
 const root=document.getElementById('productionProgressChecklist');
 if(!root)return;
 let last=null;
 function render(state={}){
  const flags=[Boolean(state.timeline),Boolean(state.stills),Boolean(state.crops),Boolean(state.approved)];
  if(flags[3])flags.fill(true);
  root.replaceChildren();
  const list=document.createElement('div');list.className='production-progress-list';
  list.setAttribute('role','status');list.setAttribute('aria-label','Production preparation progress');
  labels.forEach((label,i)=>{
   const row=document.createElement('div');row.className='production-progress-step'+(flags[i]?' is-complete':'');
   const mark=document.createElement('span');mark.className='production-progress-mark';mark.setAttribute('aria-hidden','true');mark.textContent=flags[i]?'✓':'';
   const caption=document.createElement('span');caption.textContent=label;row.append(mark,caption);list.append(row);
  });
  const note=document.createElement('div');note.className='production-progress-note';
  note.textContent=flags[3]?'Production approved. Approval does not publish.':(state.note||'Preparing production. Approval does not publish.');
  root.append(list,note);
  last={...state};
 }
 window.studioProductionProgress={update:render,reset:()=>render({note:'Loading media and outputs…'})};
 render({note:'Loading media and outputs…'});
 const workspace=document.getElementById('productionRequestWorkspace');
 if(workspace)new MutationObserver(()=>{
  if(!workspace.hidden&&!last?.approved&&!last?.timeline&&!last?.stills)render({note:'Loading media and outputs…'});
 }).observe(workspace,{attributes:true,attributeFilter:['hidden']});
})();
