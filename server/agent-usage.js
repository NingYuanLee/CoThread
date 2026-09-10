import { query, transaction } from './db.js';

const count=value=>Number.isSafeInteger(value)&&value>=0?value:0;
// DSH reports disjoint input/cache buckets. Reasoning is part of output.
// A chunk and its final message describe the same attempt; retry starts a new one.
export function createUsageMeter(){
 let last,totals={inputTokens:0,outputTokens:0,cacheReadTokens:0,cacheWriteTokens:0,reasoningTokens:0,calls:0},reported=false,reasoningReported=false;
 return {
  notify(event){
   const data=event?.data||{};
   if(event?.type==='llm/retry-started'){if(last?.turn===data.turn&&last.step===data.step)last=undefined;return;}
   const usage=event?.type==='assistant/chunk'&&data.chunk?.type==='usage'?data.chunk.usage:event?.type==='assistant/message'?data.usage:undefined;
   if(!usage)return;
   reported=true;reasoningReported ||= Number.isSafeInteger(usage.reasoningTokens);
   const same=last&&last.turn===data.turn&&last.step===data.step;
   if(!same)totals.calls++;
   for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'])totals[key]+=count(usage[key])-(same?last.values[key]:0);
   last={turn:data.turn,step:data.step,values:Object.fromEntries(['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens'].map(key=>[key,count(usage[key])]))};
  },
  result(){return reported?{...totals,reasoningTokens:reasoningReported?totals.reasoningTokens:null,totalTokens:totals.inputTokens+totals.outputTokens+totals.cacheReadTokens+totals.cacheWriteTokens}:null;},
 };
}

export async function saveReplyUsage(db,messageId,usage){
 await transaction(db,async conn=>{
  const [row]=await query(conn,'SELECT usage_stats FROM assistant_replies WHERE message_id=? FOR UPDATE',[messageId]);
  const prior=typeof row?.usage_stats==='string'?JSON.parse(row.usage_stats):row?.usage_stats;
  const merged={...usage};
  if(prior)for(const key of ['inputTokens','outputTokens','cacheReadTokens','cacheWriteTokens','reasoningTokens','totalTokens','calls','executionDurationMs'])
   merged[key]=prior[key]==null&&usage[key]==null?null:(prior[key]||0)+(usage[key]||0);
  await query(conn,'UPDATE assistant_replies SET usage_stats=? WHERE message_id=?',[JSON.stringify(merged),messageId]);
 });
}
