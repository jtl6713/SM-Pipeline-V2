const fs=require('fs'),path=require('path');
(async()=>{
 const root='D:\\Content Creation\\ChicagoShining Pipeline\\Services\\youtube-uploader\\service';
 const env={};for(const line of fs.readFileSync(path.join(root,'.env'),'utf8').split(/\r?\n/)){const i=line.indexOf('=');if(i>0)env[line.slice(0,i).trim()]=line.slice(i+1).trim().replace(/^['"]|['"]$/g,'');}
 const rows=JSON.parse(fs.readFileSync(path.resolve(root,env.YOUTUBE_JOB_STORE||'data/youtube-jobs.json'),'utf8'));
 const jobs=rows.filter(j=>j.youtubeResponse?.snippet?.title==='Logan Square Farmers Market Vibe'||j.id==='52778f12-2fcb-469a-9117-e228a47d331c').map(j=>({id:j.id,key:j.idempotencyKey,status:j.status,videoId:j.videoId,createdAt:j.createdAt,error:j.error,title:j.youtubeResponse?.snippet?.title}));
 const response=await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:env.GOOGLE_CLIENT_ID,client_secret:env.GOOGLE_CLIENT_SECRET,refresh_token:env.GOOGLE_REFRESH_TOKEN,grant_type:'refresh_token'})});const auth=await response.json();if(!response.ok||!auth.access_token)throw Error('OAuth refresh failed');
 async function get(endpoint,params){const r=await fetch('https://www.googleapis.com/youtube/v3/'+endpoint+'?'+new URLSearchParams(params),{headers:{Authorization:'Bearer '+auth.access_token}});if(!r.ok)throw Error(endpoint+' HTTP '+r.status);return r.json();}
 const channels=await get('channels',{part:'snippet,contentDetails',mine:'true'});if(channels.items.length!==1)throw Error('Ambiguous channel');const channel=channels.items[0];
 const found=[];let pageToken='';let scanned=0;
 for(let i=0;i<20;i++){const page=await get('playlistItems',{part:'snippet,contentDetails',playlistId:channel.contentDetails.relatedPlaylists.uploads,maxResults:'50',pageToken});scanned+=page.items.length;for(const item of page.items)if(item.snippet.title==='Logan Square Farmers Market Vibe')found.push(item.contentDetails.videoId);pageToken=page.nextPageToken||'';if(!pageToken)break;}
 for(const j of jobs)if(j.videoId&&!found.includes(j.videoId))found.push(j.videoId);
 const videos=[];for(let i=0;i<found.length;i+=50){const r=await get('videos',{part:'snippet,status,statistics,contentDetails',id:found.slice(i,i+50).join(',')});for(const v of r.items)videos.push({id:v.id,title:v.snippet.title,description:v.snippet.description,publishedAt:v.snippet.publishedAt,channelId:v.snippet.channelId,privacy:v.status.privacyStatus,duration:v.contentDetails.duration,views:v.statistics.viewCount,likes:v.statistics.likeCount});}
 const keep='NeiO8Do0PI4';
 if(channel.id!=='UCoKmbeuH294ZpnzE0HnuAnQ')throw Error('Wrong channel');
 const canonical=videos.find(v=>v.id===keep);if(!canonical||canonical.privacy!=='public'||canonical.title!=='Logan Square Farmers Market Vibe'||canonical.duration!=='PT41S')throw Error('Canonical receipt mismatch');
 const cleanup=[];
 for(const v of videos){
  if(v.id===keep||v.privacy==='private')continue;
  if(!jobs.some(j=>j.videoId===v.id)||v.channelId!==channel.id||v.title!==canonical.title||v.duration!==canonical.duration)throw Error('Duplicate guard failed '+v.id);
  const r=await fetch('https://www.googleapis.com/youtube/v3/videos?part=status',{method:'PUT',headers:{Authorization:'Bearer '+auth.access_token,'Content-Type':'application/json'},body:JSON.stringify({id:v.id,status:{privacyStatus:'private'}})});
  if(!r.ok)throw Error('Private update failed '+v.id+' '+r.status);
  const check=await get('videos',{part:'status',id:v.id});if(check.items[0]?.status?.privacyStatus!=='private')throw Error('Privacy readback failed');
  cleanup.push({id:v.id,privacy:'private'});
 }
 console.log(JSON.stringify({channelId:channel.id,scanned,truncated:!!pageToken,jobs,videos,cleanup,canonical}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
