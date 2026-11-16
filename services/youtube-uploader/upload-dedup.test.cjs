const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/youtube-upload-service.js','utf8');
const route=source.slice(source.indexOf('    if (req.method === "POST" && url.pathname === "/youtube/upload")'),source.indexOf('    const jobMatch ='));
function harness(initial=[]){
 const jobs=new Map(initial.map(j=>[j.id,j]));let launched=0;
 const context={jobs,req:{method:'POST'},url:{pathname:'/youtube/upload'},res:{},crypto:require('node:crypto'),now:()=>new Date().toISOString(),json:(_,status,body)=>({status,body}),persist:async()=>{},setImmediate:()=>{launched++}};
 return {jobs,get launched(){return launched},context,call(payload){context.readJson=async()=>payload;return vm.runInNewContext('(async()=>{'+route+'})()',context)}};
}
const payload={sourceUrl:'https://example.com/video.mp4',title:'Test',idempotencyKey:'stable',outputRecordId:'rec123',replaceTransactionId:'BASE'};
test('blank key cannot initiate upload',async()=>{const h=harness();assert.equal((await h.call({...payload,idempotencyKey:' '})).status,400);assert.equal(h.jobs.size,0);assert.equal(h.launched,0)});
test('concurrent retries launch once',async()=>{const h=harness();const results=await Promise.all([h.call(payload),h.call(payload)]);assert.equal(results[0].body.id,results[1].body.id);assert.equal(h.launched,1)});
for(const job of [{status:'completed',videoId:'saved'},{status:'failed',videoId:'saved'},{status:'failed',sessionCreated:true},{status:'uploading'}])test('reuse receipt/session '+JSON.stringify(job),async()=>{const h=harness([{id:'old',idempotencyKey:'stable',...job}]);assert.equal((await h.call(payload)).body.id,'old');assert.equal(h.launched,0)});
test('output identity catches changed key',async()=>{const h=harness([{id:'old',idempotencyKey:'previous',outputRecordId:'rec123',replaceTransactionId:'BASE',status:'completed'}]);assert.equal((await h.call(payload)).body.id,'old');assert.equal(h.launched,0)});
test('new replacement transaction remains distinct',async()=>{const h=harness([{id:'old',idempotencyKey:'previous',outputRecordId:'rec123',replaceTransactionId:'old',status:'completed'}]);assert.equal((await h.call(payload)).status,202)});
test('disk failure prevents launch',async()=>{const h=harness();h.context.persist=async()=>{throw Error('disk')};await assert.rejects(h.call(payload),/disk/);assert.equal(h.launched,0);assert.equal(h.jobs.size,0)});
test('cleanup retains receipts and ambiguous sessions beyond retention',()=>{const jobs=new Map([['a',{status:'completed',videoId:'saved',createdAt:'2020-01-01'}],['b',{status:'failed',sessionCreated:true,createdAt:'2020-01-01'}],['c',{status:'failed',createdAt:'2020-01-01'}]]);const start=source.indexOf('function cleanupOldJobs()');const end=source.indexOf('\n}',start)+2;vm.runInNewContext(source.slice(start,end)+';cleanupOldJobs()',{jobs,cfg:{retentionHours:168},Date,persist:async()=>{}});assert.deepEqual([...jobs.keys()],['a','b'])});
