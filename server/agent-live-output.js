import { randomUUID } from 'node:crypto';
import { query } from './db.js';
const observers=new WeakMap();
const caches=new WeakMap();
const localOutputs=new WeakMap();
function signal(db,invalidate=true){if(invalidate)caches.delete(db);for(const fn of observers.get(db)||[])fn();}
function overlay(db,rows){const local=localOutputs.get(db);return rows.map(row=>{
 const live=local?.get(row.message_id);if(row.status!=='running'||live?.run_id!==row.run_id)return row;
 if(row.step>live.step||row.event_id&&live.event_id&&BigInt(row.event_id)>BigInt(live.event_id))return row;
 if(String(row.event_id)===String(live.event_id)&&row.reasoning.startsWith(live.reasoning)&&row.content.startsWith(live.content)&&(row.reasoning.length>live.reasoning.length||row.content.length>live.content.length))return row;
 return {...row,...live};
});}
export function observeLiveOutput(db,fn){let set=observers.get(db);if(!set)observers.set(db,set=new Set());set.add(fn);return()=>set.delete(fn);}

// UI telemetry only. This table is deliberately excluded from model context.
export function trackLiveOutput(db,messageId,sessionId,{interval=300,cursor=()=>Promise.resolve(null)}={}){
 const runId=randomUUID();let step=0,reasoning='',content='',truncated=false,dirty=false,timer,closed=false;
 let local=localOutputs.get(db);if(!local)localOutputs.set(db,local=new Map());
 let localTimer,localRevision=0,localQueue=Promise.resolve(),localPending,localWriting=false;
 const drainLocal=()=>{
  if(localWriting)return;localWriting=true;
  localQueue=(async()=>{while(localPending){
   const {snapshot,event}=localPending;localPending=undefined;const event_id=await event;
   if(closed)return;if(localPending)continue;
   local.set(messageId,{...snapshot,event_id});
   while(local.size>64)local.delete(local.keys().next().value);
   signal(db,false);
  }})().catch(()=>{}).finally(()=>{localWriting=false;if(localPending&&!closed)drainLocal();});
 };
 const broadcast=()=>{
  clearTimeout(localTimer);localTimer=undefined;
  const snapshot={run_id:runId,step,reasoning,content,truncated:Number(truncated),local_revision:++localRevision},event=cursor();
  localPending={snapshot,event};drainLocal();
 };
 let queue=Promise.resolve(),failure,writing=false,pending;
 const persist=()=>{
  clearTimeout(timer);timer=undefined;if(!dirty)return;dirty=false;
  pending={values:[runId,step,reasoning,content,truncated,messageId],event:cursor()};
  if(writing)return;
  writing=true;
  queue=(async()=>{
   while(pending){
    const snapshot=pending;pending=undefined;
    try {
     await query(db,`INSERT INTO agent_live_output(message_id,run_id,step,reasoning,content,truncated,event_id)
       SELECT message_id,?,?,?,?,?,? FROM assistant_replies WHERE message_id=? AND status='running'
       ON DUPLICATE KEY UPDATE run_id=VALUES(run_id),step=VALUES(step),reasoning=VALUES(reasoning),content=VALUES(content),truncated=VALUES(truncated),event_id=VALUES(event_id),revision=revision+1,updated_at=UTC_TIMESTAMP(3)`,[...snapshot.values.slice(0,5),await snapshot.event,messageId]);
     signal(db);
    }catch(error){failure ||= error;}
   }
  })().finally(()=>{writing=false;});
 };
 return {
  beginPhase(kind){if(kind==='thinking'){reasoning='';content='';}else content='';},
  notify(n){
   if(closed||!messageId||n.method!=='session.event'||n.params?.sessionId!==sessionId)return;
   const event=n.params.event;
   if(event?.type==='step/start'){
    persist();step=Number.isSafeInteger(event.data?.step)?event.data.step:step+1;reasoning='';content='';truncated=false;dirty=true;persist();broadcast();return;
   }
   if(event?.type!=='assistant/chunk')return;
   const c=event.data?.chunk;
   if(!c||typeof c.text!=='string')return;
   if(c.type==='reasoning-delta'){
    const next=reasoning+c.text;truncated ||= next.length>16000;reasoning=next.slice(0,16000);
   }else if(c.type==='text-delta'){
    const next=content+c.text;truncated ||= next.length>32000;content=next.slice(0,32000);
   }else return;
   dirty=true;if(!timer){timer=setTimeout(persist,interval);timer.unref?.();}
   if(!localTimer){localTimer=setTimeout(broadcast,80);localTimer.unref?.();}
  },
  async flush(){broadcast();persist();await localQueue;await queue;if(failure){console.error('Live output persistence failed',{code:failure.code||failure.name});failure=undefined;}},
  async close(){closed=true;clearTimeout(localTimer);persist();await localQueue;await queue;if(local.get(messageId)?.run_id===runId)local.delete(messageId);signal(db);},
 };
}
export async function liveOutputSnapshot(db,threadId){
 let cache=caches.get(db);if(!cache)caches.set(db,cache=new Map());
 const previous=cache.get(threadId);if(previous && Date.now()-previous.at<500)return overlay(db,await previous.promise);
 const promise=query(db,`SELECT o.message_id,o.event_id,o.run_id,o.step,o.reasoning,o.content,o.truncated,o.revision,r.status,r.first_response_at
   FROM agent_live_output o JOIN assistant_replies r ON r.message_id=o.message_id JOIN messages m ON m.id=o.message_id
   WHERE m.thread_id=? ORDER BY (r.status='running') DESC,m.sequence DESC LIMIT 3`,[threadId]);
 cache.set(threadId,{at:Date.now(),promise});if(cache.size>64)cache.delete(cache.keys().next().value);
 try{return overlay(db,await promise);}catch(error){cache.delete(threadId);throw error;}
}

export async function streamLiveOutput(service,user,threadId,req,res){
 await service.thread(user,threadId);
 if(req.query.transport==='poll')return res.json(await liveOutputSnapshot(service.db,threadId));
 res.setHeader('Content-Type','text/event-stream');res.setHeader('Cache-Control','no-cache, no-transform');res.setHeader('X-Accel-Buffering','no');
 res.flushHeaders();res.write('event: ready\ndata: {}\n\n');
 let ended=false,busy=false,again=false,last='',checked=Date.now();
 const sent=new Map();
 const finish=()=>{if(ended)return;ended=true;clearInterval(timer);clearTimeout(deadline);unobserve();res.end();};
 const send=async()=>{
  if(ended)return;if(busy){again=true;return;}busy=true;
  try{
   if(Date.now()-checked>10000){await service.thread(user,threadId);checked=Date.now();}
   const rows=await liveOutputSnapshot(service.db,threadId);if(ended)return;
   const revision=JSON.stringify(rows.map(r=>[r.message_id,r.run_id,r.revision,r.local_revision,r.status]));
   if(revision!==last){last=revision;
    const changes=rows.map(row=>{
      const previous=sent.get(row.message_id);
      const reset=!previous || previous.run_id!==row.run_id || previous.step!==row.step || !row.reasoning.startsWith(previous.reasoning) || !row.content.startsWith(previous.content);
      sent.set(row.message_id,row);
      return {...row,reset,reasoning:reset?row.reasoning:row.reasoning.slice(previous.reasoning.length),content:reset?row.content:row.content.slice(previous.content.length)};
    });
    res.write(`data: ${JSON.stringify(changes)}\n\n`);
   }else res.write('event: pulse\ndata: {}\n\n');
  }catch{finish();}finally{busy=false;if(again){again=false;void send();}}
 };
 const timer=setInterval(()=>void send(),1000);
 const deadline=setTimeout(finish,25000);
 const unobserve=observeLiveOutput(service.db,()=>void send());
 res.once('close',finish);void send();
}
