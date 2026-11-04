import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const factory=fs.readFileSync(new URL('./assets/factory-desk.js',import.meta.url),'utf8');
const footer=fs.readFileSync(new URL('./assets/ai-api-footer.js',import.meta.url),'utf8');
test('Factory continues exact request persistence in memory when Safari rejects every storage write',()=>{
 const data=new Map([['studio.pipelineOutputs.v1:city','large snapshot']]);
 const disk={get length(){return data.size;},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,
 setItem(){throw new DOMException('The quota has been exceeded.','QuotaExceededError');},removeItem:k=>data.delete(k)};
 const code=factory.slice(factory.indexOf('  function factoryStorage()'),factory.indexOf('  const $'));
 const c=vm.createContext({window:{localStorage:disk},Map,Set});vm.runInContext(code+';globalThis.store=factoryStorage();',c);
 c.store.setItem('request','exact-id');assert.equal(c.store.getItem('request'),'exact-id');
 assert.equal(data.size,0);assert.equal(c.store.length,1);assert.equal(c.store.key(0),'request');
 c.store.removeItem('request');assert.equal(c.store.length,0);
});
function harness(fetch){
 const button={addEventListener(_event,fn){this.click=fn;}};
 const host={innerHTML:'',append(node){this.alert=node.textContent;}};
 let load;
 const document={readyState:'loading',getElementById:id=>id==='aiApiFooter'?host:button,
 addEventListener(_event,fn){load=fn;},createElement:()=>({setAttribute(){}})};
 const c=vm.createContext({document,fetch,AbortSignal,sessionStorage:{getItem:()=>JSON.stringify({preferred_provider:'Azure'}),setItem(){}},window:{setInterval(){},setTimeout(){}}});
 vm.runInContext(footer,c);return {button,host,load:()=>load()};
}
const response=provider=>({ok:true,json:async()=>({preferred_provider:provider})});
test('AI preference changes immediately and a stale GET cannot undo the confirmed PATCH',async()=>{
 let resolveRead,resolveWrite;const h=harness((_url,options)=>new Promise(r=>{if(options.method==='PATCH')resolveWrite=r;else resolveRead=r;}));
 const read=h.load();const write=h.button.click({currentTarget:h.button});
 assert.match(h.host.innerHTML,/OpenAI<\/strong>/);assert.equal(h.button.disabled,true);
 resolveWrite(response('OpenAI'));await write;resolveRead(response('Azure'));await read;
 assert.match(h.host.innerHTML,/OpenAI<\/strong>/);assert.doesNotMatch(h.host.innerHTML,/Azure<\/strong>/);
});
test('AI switch errors are visible and restore the previous confirmed provider',async()=>{
 const h=harness(async()=>{throw new Error('Server unavailable');});await h.button.click({currentTarget:h.button});
 assert.match(h.host.innerHTML,/Azure<\/strong>/);assert.match(h.host.alert,/Server unavailable/);
});
