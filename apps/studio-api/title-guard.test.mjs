import test from 'node:test';
import assert from 'node:assert/strict';
import {titleGuardKey,titleGuardMode,titleGuardMatches,titleGuardDecision,titleGuardExactFormula} from './title-guard.mjs';
import {titleGuardBeforeWrite} from './title-guard-runtime.mjs';
const row=(id,fields)=>({id,fields}), profile=['p1'];
test('title keys are case-sensitive, whitespace normalized',()=>{
  assert.equal(titleGuardKey('  Tribune  Tower\nStone Hunt '),'Tribune Tower Stone Hunt');
  assert.notEqual(titleGuardKey('Tribune Tower'),titleGuardKey('TRIBUNE TOWER'));
  assert.equal(titleGuardKey('Cafe\u0301'),'Café');
});
test('rollout stages are independently feature-flagged',()=>{
  assert.equal(titleGuardMode({},'ideas'),'off');
  assert.equal(titleGuardMode({STUDIO_TITLE_GUARD_MODE:'monitor'},'ideas'),'monitor');
  assert.equal(titleGuardMode({STUDIO_TITLE_GUARD_MODE:'block',STUDIO_TITLE_GUARD_BLOCK_STAGES:'ideas,production'},'publish'),'monitor');
  assert.equal(titleGuardMode({STUDIO_TITLE_GUARD_MODE:'block',STUDIO_TITLE_GUARD_BLOCK_STAGES:'ideas,production'},'ideas'),'block');
});
test('published > scheduled > production > ideas, one match per content item despite 4 outputs',()=>{
  const title='City Lights';
  const matches=titleGuardMatches({title,profileId:'p1',
    ideas:[row('a',{Candidate_Title:title,Content_Profile:profile})],
    requests:[row('r',{Requested_Title:title,Idea_Candidate:['a'],Request_Status:'Ready'})],
    contents:[row('c1',{Content_Title:title,Content_Profile:profile}),row('c2',{Content_Title:title,Content_Profile:profile})],
    outputsByContent:{c1:[row('ig',{Published_At:'2026-10-15'}),row('fb',{Published_At:'2026-10-15'}),row('tt',{}),row('yt',{})],c2:[row('o',{Scheduled_Post_Date:'2026-10-20'})]}
  });
  assert.deepEqual(matches.map(x=>x.stage),['published','scheduled','production','ideas']);
});
test('same idea lineage is not a duplicate production request',()=>{
  const title='A';
  const matches=titleGuardMatches({title,profileId:'p1',
    ideas:[row('idea',{Candidate_Title:title,Content_Profile:profile,'Content Items':['content']})],
    requests:[row('request',{Requested_Title:title,Idea_Candidate:['idea'],Request_Status:'Draft'})],
    contents:[row('content',{Content_Title:title,Content_Profile:profile})]});
  assert.equal(titleGuardDecision({title,profileId:'p1',ideaId:'idea',matches}).match,null);
  assert.equal(titleGuardDecision({title,profileId:'p1',contentId:'content',matches:matches.filter(x=>x.kind==='content')}).match,null);
});
test('different profiles and rejected ideas cannot block new ideas',()=>{
  const title='City';
  const matches=titleGuardMatches({title,profileId:'p1',ideas:[row('other',{Candidate_Title:title,Content_Profile:['p2']}),row('deleted',{Candidate_Title:title,Content_Profile:profile,Candidate_Status:'Rejected'})]});
  assert.equal(matches.length,0);
});
test('an unrelated existing title is a collision',()=>{
  const title='Old';
  const matches=titleGuardMatches({title,profileId:'p1',contents:[row('x',{Content_Title:title,Content_Profile:profile})]});
  assert.equal(titleGuardDecision({title,profileId:'p1',matches}).match.id,'x');
});
test('escape potentially unsafe Airtable title inputs',()=>{
  assert.equal(titleGuardExactFormula('Content_Title','A "quote"'),'EXACT({Content_Title},"A \\"quote\\"")');
  assert.throws(()=>titleGuardExactFormula('Bad','x'),TypeError);
});
const base={stage:'ideas',source:'unit',title:'City Lights',profileId:'p1',ideaTableId:'ideas',contentTableId:'contents',requestTableId:'requests',
  listRecords:async(_env,table)=>table==='ideas'?[row('old',{Candidate_Title:'City Lights',Content_Profile:profile})]:[]};
test('monitor always fails open and reports matches',async()=>{
  const r=await titleGuardBeforeWrite({...base,env:{STUDIO_TITLE_GUARD_MODE:'monitor'}});
  assert.equal(r.match.id,'old');assert.equal(r.reservation,null);
  const fail=await titleGuardBeforeWrite({...base,env:{STUDIO_TITLE_GUARD_MODE:'monitor'},listRecords:async()=>{throw Error('429')}});
  assert.equal(fail.match,null);
});
test('blocking returns 409 and requires D1 for empty registry atomic claim',async()=>{
  const env={STUDIO_TITLE_GUARD_MODE:'block',STUDIO_TITLE_GUARD_BLOCK_STAGES:'ideas'};
  await assert.rejects(titleGuardBeforeWrite({...base,env}),e=>e.status===409);
  await assert.rejects(titleGuardBeforeWrite({...base,env,listRecords:async()=>[]}),e=>e.status===503);
});
