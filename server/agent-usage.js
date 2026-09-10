import { query, transaction } from './db.js';

const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
// DSH reports disjoint input/cache buckets. Reasoning is part of output.
// A chunk and its final message describe the same attempt; retry starts a new one.
export function createUsageMeter(){
 let last,totals={inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0,calls:0},reported=false,reasoningReported=false;
 let step,timing={ttftMs:0,ttftSteps:0,decodeMs:0,decodeTokens:0};
 return {
  notify(event){
   const data=event?.data||{};
   // Match DSH sessionStats: first token latency per step, and decode speed
   // over the first-token-to-assistant-message interval (excluding tools).
   if(event?.type==='step/start'&&Number.isFinite(event.time))step={turn:data.turn,step:data.step,start:event.time,first:null};
   const sameStep=step&&step.turn===data.turn&&step.step===data.step;
   const chunk=data.chunk,tokenDelta=['text-delta','reasoning-delta'].includes(chunk?.type)?!!chunk.text:chunk?.type==='tool-call-delta'&&(!!chunk.argumentsDelta||chunk.name!==undefined);
   if(sameStep&&event.type==='assistant/chunk'&&tokenDelta&&Number.isFinite(event.time)&&step.first===null)step.first=event.time;
   if(sameStep&&event.type==='assistant/message'&&Number.isFinite(event.time)){
    if(step.first!==null){timing.ttftMs+=Math.max(0,step.first-step.start);timing.ttftSteps++;
     if(Number.isFinite(data.usage?.outputTokens)){timing.decodeMs+=Math.max(0,event.time-step.first);timing.decodeTokens+=data.usage.outputTokens;}}
    step=undefined;
   }
   if(event?.type==='step/end')step=undefined;
   if(event?.type==='llm/retry-started'){if(last?.turn===data.turn&&last.step===data.step)last=undefined;return;}
   const usage=event?.type==='assistant/chunk'&&data.chunk?.type==='usage'?data.chunk.usage:event?.type==='assistant/message'?data.usage:undefined;
   if(!usage)return;
   reported=true;reasoningReported ||= Number.isSafeInteger(usage.reasoningTokens);
   const same=last&&last.turn===data.turn&&last.step===data.step;
   if(!same)totals.calls++;
   for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'])totals[key]+=count(usage[key])-(same?last.values[key]:0);
   last={turn:data.turn,step:data.step,values:Object.fromEntries(['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'].map(key=>[key,count(usage[key])]))};
  },
  result(){return reported?{...totals,...timing,reasoningTokens:reasoningReported?totals.reasoningTokens:null,totalTokens:totals.inputTokens+totals.outputTokens+totals.cacheReadTokens+totals.cacheWriteTokens}:null;},
 };
}

export async function saveReplyUsage(db,messageId,usage){
 await transaction(db,async conn=>{
  const [row]=await query(conn,'SELECT usage_stats FROM assistant_replies WHERE message_id=? FOR UPDATE',[messageId]);
  const prior=typeof row?.usage_stats==='string'?JSON.parse(row.usage_stats):row?.usage_stats;
  const merged={...usage};
  if(prior)for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','totalTokens','calls','executionDurationMs','ttftMs','ttftSteps','decodeMs','decodeTokens'])
   merged[key]=prior[key]==null&&usage[key]==null?null:(prior[key]||0)+(usage[key]||0);
  await query(conn,'UPDATE assistant_replies SET usage_stats=? WHERE message_id=?',[JSON.stringify(merged),messageId]);
 });
}
