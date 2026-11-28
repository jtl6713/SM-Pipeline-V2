// Exact service binding transport; original Worker independently authenticates the Runner.
const PATH="/__ZOO_TOKEN__";
export default {async fetch(request,env){
 const u=new URL(request.url);
 const deny=()=>new Response("Not found",{status:404,headers:{"X-Zoo-Bridge":"denied","Cache-Control":"no-store"}});
 if(request.method!=="POST"||u.pathname!==PATH||u.search)return deny();
 const secret=request.headers.get("X-Pipeline-Secret")||"";
 if(secret.length<24||await request.text()!=="")return deny();
 try{
  const r=await env.STUDIO_API.fetch(new Request("https://studio.chicagoshining.com/api/internal/factory/zoo3093-resume",{method:"POST",headers:{"X-Pipeline-Secret":secret,Accept:"application/json"},redirect:"manual"}));
  const d=await r.json().catch(()=>({}));
  const safe={ok:d.ok===true,request_id:d.request_id??null,approved:Number.isInteger(d.approved)?d.approved:null,pending:Number.isInteger(d.pending)?d.pending:null,complete:d.complete===true,publication_authorized:d.publication_authorized===false?false:null};
  // Only known fixed error messages from the target are surfaced.
  const known=["Original group identity unverified","Child scope changed","Original owner consent unverified","Canonical Zoo scope or media changed","Existing approval receipt changed","Pending approval revision changed","Original accepted approval anchor missing","Original group failure or identity changed","Outage or canonical authority changed","Invalid pipeline secret","Exact incident recovery expired"];
  if(known.includes(d.error))safe.error=d.error;
  return Response.json(safe,{status:r.status>=200&&r.status<=599?r.status:502,headers:{"Cache-Control":"no-store"}});
 }catch{return Response.json({ok:false,error:"service_binding_failed"},{status:502,headers:{"Cache-Control":"no-store"}});}
}};
