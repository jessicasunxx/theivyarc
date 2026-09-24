import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createWorker} from './contact.mjs';
const env={CONTACT_ENABLED:'true',RESEND_API_KEY:'test-key',CONTACT_RECIPIENT:'private@example.test',CONTACT_FROM:'XuTu <sender@example.test>',SITE_ORIGIN:'https://xutu.test'};
const payload={name:'Test visitor',email:'visitor@example.test',message:'I would like help planning a PhD application.',website:'',submissionId:'12345678-1234-4234-8234-123456789abc'};
const req=(data=payload,origin=env.SITE_ORIGIN)=>new Request(env.SITE_ORIGIN+'/api/contact',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,'CF-Connecting-IP':'192.0.2.1'},body:JSON.stringify(data)});
test('forwards only approved fields to fixed recipient, with visitor reply-to',async()=>{
 let sent;const worker=createWorker(new Map(),async(url,options)=>{sent={url,options,body:JSON.parse(options.body)};return Response.json({id:'message-id'});});
 const response=await worker.fetch(req({...payload,to:'attacker@example.test',cc:'attacker@example.test'}),env);
 assert.deepEqual(await response.json(),{ok:true});assert.deepEqual(sent.body.to,[env.CONTACT_RECIPIENT]);assert.equal(sent.body.reply_to,payload.email);assert.equal(sent.body.cc,undefined);assert.equal(sent.options.headers['Idempotency-Key'],'xutu-contact-'+payload.submissionId);
});
test('provider errors never expose recipient or credentials',async()=>{
 const worker=createWorker(new Map(),async()=>Response.json({message:`Private recipient ${env.CONTACT_RECIPIENT}, key ${env.RESEND_API_KEY}`},{status:403}));
 const response=await worker.fetch(req(),env);const text=await response.text();assert.equal(response.status,502);assert.ok(!text.includes(env.CONTACT_RECIPIENT));assert.ok(!text.includes(env.RESEND_API_KEY));
});
test('requires actual delivery setup and never pretends to send',async()=>{
 const worker=createWorker(new Map(),()=>{throw new Error('Must not send');});
 assert.equal((await worker.fetch(req(),{...env,RESEND_API_KEY:''})).status,503);
 const response=await worker.fetch(new Request(env.SITE_ORIGIN+'/api/contact'),{...env,RESEND_API_KEY:''});assert.deepEqual(await response.json(),{available:false});
});
test('rejects cross-origin requests, injection, bots, and oversized messages before sending',async()=>{
 const worker=createWorker(new Map(),()=>{throw new Error('Must not send');});
 assert.equal((await worker.fetch(req(payload,'https://evil.test'),env)).status,403);
 for(const change of [{email:'visitor@example.test\r\nBcc: attacker@example.test'},{name:'Test\nInjected'},{website:'bot'},{message:'short'}])assert.equal((await worker.fetch(req({...payload,...change}),env)).status,400);
 assert.equal((await worker.fetch(req({...payload,message:'a'.repeat(30000)}),env)).status,413);
});
test('handles network failures without leaking or clearing submissions',async()=>{
 const worker=createWorker(new Map(),async()=>{throw new Error('Network failure');});const response=await worker.fetch(req(),env);assert.equal(response.status,502);assert.deepEqual(await response.json(),{ok:false,code:'delivery'});
});
test('throttles repeated sends and serves only explicitly public assets',async()=>{
 const worker=createWorker(new Map([['/index.html',{type:'text/html',body:btoa('Public page')}]]),async()=>Response.json({id:'id'}));
 for(let i=0;i<5;i++)assert.equal((await worker.fetch(req(),env)).status,200);
 assert.equal((await worker.fetch(req(),env)).status,429);
 for(const path of ['/.env','/worker/contact.mjs','/.openai/hosting.json','/server/index.js'])assert.equal((await worker.fetch(new Request(env.SITE_ORIGIN+path),env)).status,404);
 assert.equal(await(await worker.fetch(new Request(env.SITE_ORIGIN+'/'),env)).text(),'Public page');
});
