const LIMIT = 24576;
const emailPattern = /^[^\s<>@,;\r\n]+@[^\s<>@,;\r\n]+\.[^\s<>@,;\r\n]+$/;
const json = (data,status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const ready = env => env.CONTACT_ENABLED === 'true' && Boolean(env.RESEND_API_KEY && env.CONTACT_RECIPIENT && env.CONTACT_FROM && env.SITE_ORIGIN);
async function readJSON(request){
 if(Number(request.headers.get('Content-Length'))>LIMIT) throw new Error('size');
 if(!request.body) throw new Error('body');
 const reader=request.body.getReader(); let size=0; const chunks=[];
 while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>LIMIT){await reader.cancel();throw new Error('size');}chunks.push(value);}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 return JSON.parse(new TextDecoder().decode(bytes));
}
export function createWorker(assets=new Map(),transport=fetch){
 const recent=new Map();
 function rateLimited(key){
  const now=Date.now();
  for(const [k,v] of recent)if(v.until<=now)recent.delete(k);
  if(recent.size>=2000&&!recent.has(key))return true;
  const value=recent.get(key)||{count:0,until:now+15*60*1000};value.count++;recent.set(key,value);return value.count>5;
 }
 return {async fetch(request,env={}){
  const path=new URL(request.url).pathname;
  if(path==='/api/contact'){
   if(request.method==='GET')return json({available:ready(env)});
   if(request.method!=='POST')return json({ok:false,code:'method'},405);
   if(!ready(env))return json({ok:false,code:'unavailable'},503);
   if(request.headers.get('Origin')!==env.SITE_ORIGIN)return json({ok:false,code:'origin'},403);
   if(!request.headers.get('Content-Type')?.toLowerCase().startsWith('application/json'))return json({ok:false,code:'format'},415);
   let data;try{data=await readJSON(request);}catch(error){return json({ok:false,code:error.message==='size'?'size':'validation'},error.message==='size'?413:400);}
   if(!data||typeof data!=='object'||Array.isArray(data))return json({ok:false,code:'validation'},400);
   const {name,email,message,website,submissionId}=data;
   if(website || typeof name!=='string'||name.trim().length<1||name.length>100||/[\r\n\x00-\x1f]/.test(name)||typeof email!=='string'||email.length>254||!emailPattern.test(email.trim())||typeof message!=='string'||message.trim().length<10||message.length>5000||typeof submissionId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId))return json({ok:false,code:'validation'},400);
   // Best-effort per-isolate throttling. No visitor IPs or message text are logged or stored durably.
   const ip=request.headers.get('CF-Connecting-IP')||'unknown';
   const hashBytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(ip));
   const key=Array.from(new Uint8Array(hashBytes),n=>n.toString(16).padStart(2,'0')).join('');
   if(rateLimited(key))return json({ok:false,code:'rate'},429);
   try{
    const response=await transport('https://api.resend.com/emails',{
     method:'POST',headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`xutu-contact-${submissionId}`},
     body:JSON.stringify({from:env.CONTACT_FROM,to:[env.CONTACT_RECIPIENT],reply_to:email.trim(),subject:'New inquiry from theivyarc.com',text:`Name: ${name.trim()}\nEmail: ${email.trim()}\n\nMessage:\n${message.trim()}`}),signal:AbortSignal.timeout(15000)
    });
    const result=await response.json().catch(()=>null);
    // Never relay a provider error: it may contain private addresses or credentials.
    if(!response.ok||typeof result?.id!=='string')return json({ok:false,code:response.status===429?'rate':'delivery'},response.status===429?429:502);
    return json({ok:true});
   }catch{return json({ok:false,code:'delivery'},502);}
  }
  if(!['GET','HEAD'].includes(request.method))return new Response('Method not allowed',{status:405});
  const asset=assets.get(path==='/'?'/index.html':path);
  if(!asset)return new Response('Not found',{status:404});
  const bytes=request.method==='HEAD'?null:Uint8Array.from(atob(asset.body),c=>c.charCodeAt(0));
  return new Response(bytes,{headers:{'Content-Type':asset.type,'X-Content-Type-Options':'nosniff','Cache-Control':asset.type.startsWith('image/')?'public, max-age=86400':'no-cache','Referrer-Policy':'strict-origin-when-cross-origin'}});
 }};
}
