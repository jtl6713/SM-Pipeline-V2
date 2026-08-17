"use strict";
const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");
const { URL } = require("url");

function loadDotEnv() {
  const p = path.join(process.cwd(), ".env");
  if (!fs.existsSync(p)) return;
  for (const raw of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i < 1) continue;
    const k = line.slice(0, i).trim();
    const v = line.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}
loadDotEnv();
const cfg = {
  port: Number(process.env.PORT || 3340),
  secret: process.env.YOUTUBE_UPLOAD_SERVICE_SHARED_SECRET || "",
  clientId: process.env.GOOGLE_CLIENT_ID || "",
  clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
  refreshToken: process.env.GOOGLE_REFRESH_TOKEN || "",
  chunkBytes: Number(process.env.YOUTUBE_UPLOAD_CHUNK_BYTES || 8388608),
  tempDir: path.resolve(process.env.YOUTUBE_TEMP_DIR || "./tmp"),
  jobStore: path.resolve(process.env.YOUTUBE_JOB_STORE || "./data/youtube-jobs.json"),
  retentionHours: Number(process.env.YOUTUBE_JOB_RETENTION_HOURS || 168)
};
if (cfg.chunkBytes < 262144 || cfg.chunkBytes % 262144 !== 0) throw new Error("YOUTUBE_UPLOAD_CHUNK_BYTES must be a multiple of 256 KiB.");
const jobs = new Map();
let saveChain = Promise.resolve();
async function init() {
  await fsp.mkdir(cfg.tempDir, { recursive: true });
  await fsp.mkdir(path.dirname(cfg.jobStore), { recursive: true });
  try { const rows = JSON.parse(await fsp.readFile(cfg.jobStore, "utf8")); for (const j of rows) jobs.set(j.id, j); } catch (e) { if (e.code !== "ENOENT") console.error("Job store load warning:", e.message); }
  cleanupOldJobs();
}
function persist() { saveChain = saveChain.then(() => fsp.writeFile(cfg.jobStore, JSON.stringify([...jobs.values()], null, 2))); return saveChain; }
function cleanupOldJobs() { const cutoff = Date.now() - cfg.retentionHours * 3600000; for (const [id,j] of jobs) if (Date.parse(j.updatedAt || j.createdAt) < cutoff && ["completed","failed"].includes(j.status)) jobs.delete(id); persist().catch(console.error); }
function now() { return new Date().toISOString(); }
function json(res, code, body) { const data=Buffer.from(JSON.stringify(body)); res.writeHead(code,{"Content-Type":"application/json","Content-Length":data.length}); res.end(data); }
async function readJson(req, max=1024*1024) { const chunks=[]; let n=0; for await (const c of req) { n+=c.length; if(n>max) throw new Error("Request body too large"); chunks.push(c); } const body=Buffer.allocUnsafe(n); let offset=0; for(const chunk of chunks){chunk.copy(body,offset);offset+=chunk.length;} return JSON.parse(body.toString("utf8")||"{}"); }
function authorized(req) { if (!cfg.secret) return true; const v=req.headers["x-sm-pipeline-key"]||""; const a=Buffer.from(String(v)); const b=Buffer.from(cfg.secret); return a.length===b.length && crypto.timingSafeEqual(a,b); }
async function accessToken() {
  if (!cfg.clientId || !cfg.clientSecret || !cfg.refreshToken) throw new Error("Google OAuth environment variables are incomplete.");
  const body=new URLSearchParams({client_id:cfg.clientId,client_secret:cfg.clientSecret,refresh_token:cfg.refreshToken,grant_type:"refresh_token"});
  const r=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body});
  const data=await r.json(); if(!r.ok) throw new Error(`OAuth refresh failed ${r.status}: ${JSON.stringify(data)}`); return data.access_token;
}
async function downloadToFile(url, file) {
  const r=await fetch(url,{redirect:"follow"}); if(!r.ok) throw new Error(`Source download failed ${r.status}`);
  const type=(r.headers.get("content-type")||"video/mp4").split(";")[0];
  const out=fs.createWriteStream(file); for await (const chunk of r.body) if(!out.write(chunk)) await new Promise(x=>out.once("drain",x));
  await new Promise((resolve,reject)=>out.end(e=>e?reject(e):resolve())); return type;
}
function metadataFrom(p) {
  const privacy=String(p.privacyStatus||"private").toLowerCase(); if(!["private","unlisted","public"].includes(privacy)) throw new Error("privacyStatus must be private, unlisted, or public");
  const status={privacyStatus:privacy,selfDeclaredMadeForKids:Boolean(p.madeForKids),containsSyntheticMedia:Boolean(p.containsSyntheticMedia)};
  if(p.publishAt){ if(privacy!=="private") throw new Error("Scheduled publish requires privacyStatus=private"); status.publishAt=p.publishAt; }
  return {snippet:{title:String(p.title||"").slice(0,100),description:String(p.description||"").slice(0,5000),tags:Array.isArray(p.tags)?p.tags.slice(0,500):[],categoryId:String(p.categoryId||"22")},status};
}
async function initiateSession(token, metadata, size, mime) {
  const u="https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status";
  const r=await fetch(u,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json; charset=UTF-8","X-Upload-Content-Length":String(size),"X-Upload-Content-Type":mime},body:JSON.stringify(metadata)});
  const text=await r.text(); if(!r.ok) throw new Error(`Session initialization failed ${r.status}: ${text}`); const loc=r.headers.get("location"); if(!loc) throw new Error("YouTube did not return a resumable Location header."); return loc;
}
async function uploadChunks(job, file, mime, token, sessionUrl) {
  const size=(await fsp.stat(file)).size; let start=Number(job.bytesUploaded||0); const fd=await fsp.open(file,"r");
  try {
    while(start<size){ const len=Math.min(cfg.chunkBytes,size-start); const buf=Buffer.allocUnsafe(len); const {bytesRead}=await fd.read(buf,0,len,start); const end=start+bytesRead-1;
      const r=await fetch(sessionUrl,{method:"PUT",headers:{Authorization:`Bearer ${token}`,"Content-Type":mime,"Content-Length":String(bytesRead),"Content-Range":`bytes ${start}-${end}/${size}`},body:buf.subarray(0,bytesRead)});
      if(r.status===308){ const range=r.headers.get("range"); start=range?Number(range.split("-").pop())+1:end+1; }
      else { const text=await r.text(); if(!r.ok) throw new Error(`Upload failed ${r.status}: ${text}`); const video=JSON.parse(text); job.videoId=video.id; job.youtubeResponse=video; start=size; }
      job.bytesUploaded=start; job.progressPercent=Math.floor(start*100/size); job.updatedAt=now(); await persist();
    }
  } finally { await fd.close(); }
}
async function processUpload(jobId,p) {
  const job=jobs.get(jobId); const file=path.join(cfg.tempDir,`${jobId}.mp4`);
  try { job.status="downloading"; job.updatedAt=now(); await persist(); const mime=await downloadToFile(p.sourceUrl,file); const size=(await fsp.stat(file)).size; job.fileSize=size; job.mimeType=mime; job.status="initializing"; await persist();
    const token=await accessToken(); const metadata=metadataFrom(p); const session=await initiateSession(token,metadata,size,mime); job.sessionCreated=true; job.status="uploading"; await persist(); await uploadChunks(job,file,mime,token,session);
    job.status="completed"; job.completedAt=now(); job.updatedAt=now(); await persist();
  } catch(e) { job.status="failed"; job.error=e.message; job.updatedAt=now(); await persist(); }
  finally { fsp.unlink(file).catch(()=>{}); }
}
async function videoStatus(videoId) { const token=await accessToken(); const u=new URL("https://www.googleapis.com/youtube/v3/videos"); u.searchParams.set("part","status,processingDetails,snippet"); u.searchParams.set("id",videoId); const r=await fetch(u,{headers:{Authorization:`Bearer ${token}`}}); const data=await r.json(); if(!r.ok) throw new Error(`videos.list failed ${r.status}: ${JSON.stringify(data)}`); return data; }
async function setThumbnail(videoId, sourceUrl) { const token=await accessToken(); const r0=await fetch(sourceUrl); if(!r0.ok) throw new Error(`Thumbnail download failed ${r0.status}`); const b=Buffer.from(await r0.arrayBuffer()); if(b.length>2097152) throw new Error("Thumbnail exceeds 2 MB"); const mime=(r0.headers.get("content-type")||"image/jpeg").split(";")[0]; const u=`https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${encodeURIComponent(videoId)}&uploadType=media`; const r=await fetch(u,{method:"POST",headers:{Authorization:`Bearer ${token}`,"Content-Type":mime,"Content-Length":String(b.length)},body:b}); const text=await r.text(); if(!r.ok) throw new Error(`thumbnails.set failed ${r.status}: ${text}`); return JSON.parse(text); }
async function handler(req,res){
  try { const u=new URL(req.url,`http://${req.headers.host||"localhost"}`); if(u.pathname==="/health") return json(res,200,{ok:true,service:"sm-pipeline-youtube-uploader",time:now(),oauthConfigured:Boolean(cfg.clientId&&cfg.clientSecret&&cfg.refreshToken)});
    if(!authorized(req)) return json(res,401,{error:"Unauthorized"});
    if(req.method==="POST"&&u.pathname==="/youtube/upload"){ const p=await readJson(req); if(!p.sourceUrl||!p.title) return json(res,400,{error:"sourceUrl and title are required"}); const idem=String(p.idempotencyKey||""); if(idem){ const existing=[...jobs.values()].find(j=>j.idempotencyKey===idem&&!(["failed"].includes(j.status))); if(existing) return json(res,200,existing); }
      const id=crypto.randomUUID(); const job={id,idempotencyKey:idem,status:"queued",progressPercent:0,bytesUploaded:0,createdAt:now(),updatedAt:now(),videoId:null,error:null}; jobs.set(id,job); await persist(); setImmediate(()=>processUpload(id,p)); return json(res,202,job); }
    const jm=u.pathname.match(/^\/youtube\/jobs\/([^/]+)$/); if(req.method==="GET"&&jm){ const j=jobs.get(jm[1]); return j?json(res,200,j):json(res,404,{error:"Job not found"}); }
    const vm=u.pathname.match(/^\/youtube\/videos\/([^/]+)$/); if(req.method==="GET"&&vm) return json(res,200,await videoStatus(vm[1]));
    if(req.method==="POST"&&u.pathname==="/youtube/thumbnail"){ const p=await readJson(req); if(!p.videoId||!p.sourceUrl) return json(res,400,{error:"videoId and sourceUrl are required"}); return json(res,200,await setThumbnail(p.videoId,p.sourceUrl)); }
    return json(res,404,{error:"Not found"});
  } catch(e){ console.error(e); return json(res,500,{error:e.message}); }
}
init().then(()=>http.createServer(handler).listen(cfg.port,"0.0.0.0",()=>console.log(`YouTube uploader listening on ${cfg.port}`))).catch(e=>{console.error(e);process.exit(1)});
