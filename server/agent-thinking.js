import { query } from './db.js';
import { trackLiveOutput } from './agent-live-output.js';

// All model phases share the same event sequence as actual tool calls.
export function trackThinking(db,messageId,sessionId,options={}){
 const started=performance.now();let firstChunk=false;
 let queue=Promise.resolve(),phase,lastPhase,timer,failure,closed=false;
 const enqueue=task=>{queue=queue.then(task).catch(error=>{failure ||= error;});return queue;};
 const received=()=>{if(firstChunk)return;firstChunk=true;const receivedAt=new Date();enqueue(()=>query(db,"UPDATE assistant_replies SET first_response_at=COALESCE(first_response_at,?) WHERE message_id=? AND status='running'",[receivedAt,messageId]));console.log('Agent timing',{messageId,stage:'first_model_chunk',elapsedMs:Math.round(performance.now()-started)});};
 const flushText=()=>{
  clearTimeout(timer);timer=undefined;if(!phase)return;
  const current=phase,text=current.text;
  enqueue(async()=>{if(current.id)await query(db,"UPDATE agent_events SET output=? WHERE id=? AND status='running'",[text,current.id]);});
 };
 const publishVisible=async(text)=>{
  const visible=String(text||'').trim();
  if(!visible||visible==='NO_VISIBLE_MESSAGE'||!options.onVisibleText)return;
  await options.onVisibleText(visible);
 };
 const finish = (status = "completed", finalText, { visible = true } = {}) => {
  clearTimeout(timer);timer=undefined;if(!phase)return;
  const current=phase;lastPhase=current;phase=undefined;
  const final=visible&&current.kind==='assistant_text'&&typeof finalText==='string'&&current.text.trim()===finalText.trim();
  enqueue(async()=>{
   if(current.id)await query(db,`UPDATE agent_events SET status=?,output=?,tool=?,finished_at=UTC_TIMESTAMP(3) WHERE id=?`,[status,current.text,final?'assistant_final':current.kind,current.id]);
   if(status==='completed'&&current.kind==='assistant_text'&&visible)
    await publishVisible(typeof finalText==='string'&&finalText.trim()?finalText:current.text);
  });
 };
 const begin=kind=>{
  finish();phase={kind,text:'',id:undefined};const current=phase;
  current.ready=enqueue(async()=>{
    if(!messageId)return;
    const result=await query(db,"INSERT INTO agent_events(message_id,agent_session_id,tool,status,input) VALUES(?,?,?,'running','{}')",[messageId,sessionId,kind]);
    current.id=result.insertId;
    await query(db,"UPDATE assistant_replies SET progress=? WHERE message_id=? AND status='running'",[kind==='thinking'?'正在思考':'正在回复',messageId]);
  });
 };
 const live=trackLiveOutput(db,messageId,sessionId,{cursor:()=>{const current=phase||lastPhase;return (current?.id?Promise.resolve():current?.ready||Promise.resolve()).then(()=>current?.id?String(current.id):null);}});
 return {
  notify(n){
   if(closed||n.method!=='session.event'||n.params?.sessionId!==sessionId)return;
   const e=n.params.event;
   if(e?.type==='step/start'){
    if(!phase)begin('thinking');
   }else if(e?.type==='assistant/chunk'){
    const c=e.data?.chunk;
    const kind=c?.type==='reasoning-delta'?'thinking':c?.type==='text-delta'?'assistant_text':undefined;
    if(kind&&typeof c.text==='string'){
     if(c.text.length)received();
     if(phase?.kind!==kind){begin(kind);live.beginPhase(kind);}
     phase.text=(phase.text+c.text).slice(0,kind==='thinking'?16000:32000);
     if(!timer){timer=setTimeout(flushText,300);timer.unref?.();}
    }
   }else if(['assistant/message','tool/call','step/end','turn/end'].includes(e?.type)){
    if(e.type==='tool/call')received();
    finish('completed');
   }
   live.notify(n);
  },
  async flush(){flushText();await queue;await live.flush();if(failure)throw failure;},
  async close(status,finalText){
   if(closed)return;closed=true;
   const finalPhase=phase||lastPhase;
   finish(status,finalText);await queue;await live.close();
   // step/end may have closed the final text before the final response arrives.
   if(finalText&&finalPhase?.id&&finalPhase.kind==='assistant_text'&&finalPhase.text.trim()&&finalText.trim().startsWith(finalPhase.text.trim()))
    await query(db,"UPDATE agent_events SET tool='assistant_final' WHERE id=?",[finalPhase.id]);
   if(failure)throw failure;
  },
 };
}
