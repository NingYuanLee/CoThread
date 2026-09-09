import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React,{useEffect,useState} from 'react';
import {AgentEvent} from './AgentEvent';
import {fetchJson} from './api-fetch';
import {agentLabel} from './agent-label';
import type {LiveOutput} from './useAgentLiveOutput';
type Event={id:string;tool:string;status:string;input:string;finished_at:string|null};
const modelPhase=(tool:string)=>['thinking','assistant_text','assistant_final'].includes(tool);
export function AgentActivity({threadId,messageId,events,output,status,hasFinal,versions,threads}:{
 threadId:string;messageId:string;events:Event[];output?:LiveOutput;status:string;hasFinal:boolean;
 versions?:{id:string;filename:string;version:number}[];threads?:{id:string;title:string}[];
}){
 const [open,setOpen]=useState(false);
 const [texts,setTexts]=useState<Record<string,string>>({});
 const [error,setError]=useState('');
 const ordered=[...events].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 const revision=ordered.map(e=>`${e.id}:${e.tool}:${e.status}:${e.finished_at}`).join(',');
 useEffect(()=>{
  if(!open)return;const controller=new AbortController();setError('');
  fetchJson(`/api/threads/${threadId}/replies/${messageId}/activity`,{signal:controller.signal})
   .then((rows:{id:string;output:string}[])=>{if(!controller.signal.aborted)setTexts(Object.fromEntries(rows.map(r=>[r.id,r.output])));})
   .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[open,threadId,messageId,revision]);
 const last=ordered.at(-1);
 const streaming=output?.event_id && (!last||BigInt(output.event_id)>=BigInt(last.id));
 const active=status==='running';
 const label=(e:Event)=>{const l=agentLabel(e,versions,threads);return `${l.action}${l.target?' '+l.target:''}`;};
 const current=!active?({completed:'已完成',failed:'未完成',cancelled:'已停止',queued:'消息已收到'}[status]||'执行过程')
  :streaming&&(output.content||output.reasoning)?(output.content?'正在回复':'正在思考')
   :last?.status==='running'?(last.tool==='thinking'?'正在思考':modelPhase(last.tool)?'正在回复':label(last))
    :last?`${modelPhase(last.tool)?'本步处理':label(last)} · ${last.status==='failed'?'失败':'完成'}`:'正在处理';
 const changing=active&&(!!streaming||last?.status==='running');
 return <details className="agent-trace" onToggle={e=>setOpen(e.currentTarget.open)}>
  <summary title={`${current}；点击展开或收起执行过程`}>
   <span className={`agent-current-step${changing?' agent-step-active':''}`} aria-live="polite" aria-atomic="true">{current}</span>
   <svg className="agent-trace-toggle" width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3C2 6 2 14 6 17M16 3C20 6 20 14 16 17"/><path className="agent-trace-chevron" d="m8 9 3 3 3-3"/></svg>
  </summary>
  {open&&<div className="agent-activity-items">
   {ordered.filter(e=>!(hasFinal&&e.tool==='assistant_final')).map(e=>{
    if(modelPhase(e.tool)){
     const live=String(output?.event_id)===String(e.id)?(e.tool==='thinking'?output?.reasoning:output?.content):undefined;
     return <div className={`agent-phase ${e.tool==='thinking'?'thinking':'text'}`} data-event-id={e.id} key={e.id}>
      <small>{e.tool==='thinking'?'思考':'说明'}</small><div className="message-text"><Markdown remarkPlugins={[remarkGfm]} components={{img:()=> <span>（图片链接）</span>}}>{live||texts[e.id]||(e.status==='running'?'正在生成…':'')}</Markdown></div>
     </div>;
    }
    const l=agentLabel(e,versions,threads);
    return <AgentEvent key={e.id} threadId={threadId} event={e}><summary><span className={`event-dot ${e.status}`}/><span className="agent-action-label" title={l.full}>{label(e)}</span><small>{e.status==='running'?'进行中':e.status==='failed'?'失败':'完成'}</small></summary></AgentEvent>;
   })}
   {output?.event_id&&!ordered.some(e=>String(e.id)===String(output.event_id))&&active&&<div className="agent-phase"><small>{output.content?'说明':'思考'}</small><div className="message-text"><Markdown remarkPlugins={[remarkGfm]} components={{img:()=> <span>（图片链接）</span>}}>{output.content||output.reasoning}</Markdown></div></div>}
   {!!output?.truncated&&<small>当前阶段的展示内容已达到长度上限。</small>}
   {error&&<p role="status">{error}</p>}
  </div>}
 </details>;
}
