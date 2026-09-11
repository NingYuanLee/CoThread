import {StreamingMarkdown} from './StreamingMarkdown';
import React,{useEffect,useState} from 'react';
import {AgentEvent} from './AgentEvent';
import {AgentToolIcon} from './AgentToolIcon';
import {fetchJson} from './api-fetch';
import {agentLabel} from './agent-label';
import type {LiveOutput} from './useAgentLiveOutput';
type Event={id:string;tool:string;status:string;input:string;finished_at:string|null};
const modelPhase=(tool:string)=>['thinking','assistant_text','assistant_final'].includes(tool);
export function AgentActivity({threadId,messageId,events,output,status,hasFinal,versions,threads,progress}:{
 threadId:string;messageId:string;events:Event[];output?:LiveOutput;status:string;hasFinal:boolean;
 versions?:{id:string;filename:string;version:number}[];threads?:{id:string;title:string}[];
 progress?:string|null;
}){
 const running=['queued','running'].includes(status);
 const [open,setOpen]=useState(()=>['queued','running'].includes(status));
 const [texts,setTexts]=useState<Record<string,string>>({});
 const [error,setError]=useState('');
 const ordered=[...events].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 const revision=ordered.map(e=>`${e.id}:${e.tool}:${e.status}:${e.finished_at}`).join(',');
 useEffect(()=>{
  if(output?.event_id&&(output.content||output.reasoning))setTexts(previous=>({...previous,[output.event_id!]:output.content||output.reasoning}));
 },[output]);
 useEffect(()=>{
  if(!open||!events.length)return;const controller=new AbortController();setError('');
  fetchJson(`/api/threads/${threadId}/replies/${messageId}/activity`,{signal:controller.signal})
   .then((rows:{id:string;output:string}[])=>{if(!controller.signal.aborted)setTexts(Object.fromEntries(rows.map(r=>[r.id,r.output])));})
   .catch(e=>{if(!controller.signal.aborted)setError(e.message);});
  return()=>controller.abort();
 },[open,threadId,messageId,revision]);
 const last=ordered.at(-1);
 const streaming=output?.event_id && (!last||BigInt(output.event_id)>=BigInt(last.id));
 const active=status==='running';
 const label=(e:Event)=>{const l=agentLabel(e,versions,threads);return `${l.action}${l.target?' '+l.target:''}`;};
 const current=!active?({completed:'已完成',failed:'未完成',cancelled:'已停止',queued:'正在思考'}[status]||'执行过程')
  :streaming&&(output.content||output.reasoning)?(output.content?'正在回复':'正在思考')
   :last?.status==='running'?(last.tool==='thinking'?'正在思考':modelPhase(last.tool)?'正在回复':label(last))
    :last?`${modelPhase(last.tool)?'本步处理':label(last)} · ${last.status==='failed'?'失败':'完成'}`:progress||'正在处理';
 const changing=running;
 const remaining=ordered.filter(e=>!(hasFinal&&e.tool==='assistant_final'));
 const extraLive=output?.event_id&&!ordered.some(e=>String(e.id)===String(output.event_id))&&active;
 const hasContent=remaining.some(e=>!modelPhase(e.tool)||e.status!=='running'||!!texts[e.id]||String(output?.event_id)===String(e.id)&&!!(output?.reasoning||output?.content))||!!extraLive;
 const statusLine=<>
   <span className={`agent-current-step${changing?' agent-step-active':''}`} aria-live="polite" aria-atomic="true">{current}</span>
   {hasContent&&<svg className="agent-status-chevron" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={open?'m3 7 3-3 3 3':'m4.5 3 3 3-3 3'}/></svg>}
  </>;
 return <div className="agent-trace" data-open={open&&hasContent}>
  {open&&hasContent&&<div className="agent-activity-items">
   {remaining.map(e=>{
    if(modelPhase(e.tool)){
     const live=String(output?.event_id)===String(e.id)?(e.tool==='thinking'?output?.reasoning:output?.content):undefined;
     return <div className={`agent-phase ${e.tool==='thinking'?'thinking':'text'}`} data-event-id={e.id} key={e.id}>
      <div className="message-text"><StreamingMarkdown active={active&&e.status==='running'} text={live||texts[e.id]||''}/></div>
     </div>;
    }
    const l=agentLabel(e,versions,threads);
    return <AgentEvent key={e.id} threadId={threadId} event={e}><summary><AgentToolIcon category={l.category} status={e.status}/><span className="agent-action-label" title={l.full}>{label(e)}</span><small>{e.status==='running'?'进行中':e.status==='failed'?'失败':'完成'}</small></summary></AgentEvent>;
   })}
   {extraLive&&<div className={`agent-phase ${output.content?'text':'thinking'}`}><div className="message-text"><StreamingMarkdown active={active} text={output.content||output.reasoning}/></div></div>}
   {!!output?.truncated&&<small>当前阶段的展示内容已达到长度上限。</small>}
   {error&&<p role="status">{error}</p>}
  </div>}
  {hasContent?<button className="agent-status-line" type="button" aria-expanded={open} title={`${current}；点击展开或收起过程`} onClick={()=>setOpen(!open)}>{statusLine}</button>:<div className="agent-status-line">{statusLine}</div>}
 </div>;
}
