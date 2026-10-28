import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const f=(record,key)=>record.fields[key];
const markers=['Studio_Render_Review_Hold_Active','Studio_Render_Review_Hold_ID',
  'Studio_Render_Review_Hold_Owner','Studio_Render_Review_Session_ID',
  'Studio_Review_Hold_ID','Studio_Review_Hold_Owner'];
function source(file,name){
  const text=readFileSync(new URL(file,import.meta.url),'utf8');
  const start=text.indexOf('export ',text.indexOf('export function '+name)>=0?
    text.indexOf('export function '+name):text.indexOf('export async function '+name));
  assert.ok(start>=0);
  return text.slice(start,text.indexOf('/*__STUDIO_WORKER_END:'+name+'__*/',start)).replace(/^export /,'');
}
const dispatch=Function('f',source('./worker-functions-03.mjs','studioPublishDispatchTarget')+'; return studioPublishDispatchTarget')(f);
const record=(fields={})=>({id:'recA1B2C3D4E5F6G7',fields:{Platform:'Instagram',Studio_Output_Type:'Reel',
  Platform_Output_Type:'Instagram Reel',Do_Not_Publish:false,...fields}});

test('every retained review marker blocks real Worker dispatch selection independently',()=>{
  for(const marker of markers) assert.equal(dispatch(record({[marker]:marker.endsWith('Active')?true:'review-identity'})),null,marker);
});
test('unselected Reel still uses the existing dispatch target',()=>{
  assert.deepEqual(dispatch(record()),{setting:'AP1_IG_WEBHOOK_URL',target:'AP1-IG'});
});
test('legacy single and batch approval reject held outputs before already-approved shortcut',async()=>{
  class HttpError extends Error {constructor(status,message){super(message);this.status=status}}
  for(const marker of markers){
    const current=record({[marker]:true,Review_Status:'Approved',Output_Status:'Approved for Publishing'});
    const approve=Function('f','HttpError','withOutputApprovalLock','airtableFetch',
      source('./worker-functions-04.mjs','approveOutputRecordForPublishing')+';return approveOutputRecordForPublishing')(
      f,HttpError,async(bucket,id,fn)=>fn(),async()=>current);
    await assert.rejects(()=>approve({AIRTABLE_OUTPUT_TABLE_ID:'outputs'},record(),'',null),e=>e.status===409&&/Rendering Review/.test(e.message));
  }
});
