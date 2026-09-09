import {useEffect,useState} from 'react';
import {fetchJson} from './api-fetch';
export type LiveOutput={message_id:string;run_id:string;step:number;reasoning:string;content:string;truncated:boolean;status:string;revision:string;reset?:boolean};
export function useAgentLiveOutput(threadId:string,enabled:boolean){
 const [state,setState]=useState<{threadId:string;rows:Record<string,LiveOutput>}>({threadId:'',rows:{}});
 useEffect(()=>{
  setState({threadId,rows:{}});
  if(!threadId)return;
  let alive=true,source:EventSource|undefined,timer:ReturnType<typeof setTimeout>|undefined,guard:ReturnType<typeof setTimeout>|undefined;
  const controller=new AbortController();
  const publish=(rows:LiveOutput[],deltas=false)=>{
   if(!alive)return;
   setState(previous=>{
    const next={...(previous.threadId===threadId?previous.rows:{})};
    for(const row of rows){
     const old=next[row.message_id];
     next[row.message_id]={...row,reasoning:deltas&&!row.reset?(old?.reasoning||'')+row.reasoning:row.reasoning,content:deltas&&!row.reset?(old?.content||'')+row.content:row.content};
    }
    return {threadId,rows:next};
   });
  };
  const poll=async()=>{
   try{publish(await fetchJson(`/api/threads/${threadId}/live?transport=poll`,{signal:controller.signal}));}
   catch(error){if([401,403,404].includes((error as {status?:number}).status||0))return;}
   if(alive&&enabled&&!document.hidden)timer=setTimeout(poll,1000);
  };
  const fallback=()=>{clearTimeout(guard);source?.close();source=undefined;clearTimeout(timer);void poll();};
  let ready=false;
  const touch=()=>{clearTimeout(guard);guard=setTimeout(fallback,8000);};
  const connect=()=>{
   clearTimeout(timer);clearTimeout(guard);source?.close();
   if(!alive||document.hidden)return;
   if(!enabled||typeof EventSource==='undefined'){void poll();return;}
   ready=false;
   source=new EventSource(`/api/threads/${threadId}/live`);
   guard=setTimeout(fallback,8000);
   source.addEventListener('ready',()=>{ready=true;touch();});
   source.addEventListener('pulse',touch);
   source.onmessage=event=>{touch();try{publish(JSON.parse(event.data),true);}catch{fallback();}};
   source.onerror=()=>{if(ready){source?.close();clearTimeout(guard);timer=setTimeout(connect,500);}else fallback();};
  };
  const visibility=()=>{if(document.hidden){source?.close();clearTimeout(timer);clearTimeout(guard);}else connect();};
  connect();document.addEventListener('visibilitychange',visibility);
  return()=>{alive=false;controller.abort();source?.close();clearTimeout(timer);clearTimeout(guard);document.removeEventListener('visibilitychange',visibility);};
 },[threadId,enabled]);
 return state.threadId===threadId?state.rows:{};
}
