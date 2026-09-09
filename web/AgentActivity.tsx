import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import React,{useEffect,useState} from 'react';
import {AgentEvent} from './AgentEvent';
import {AgentToolIcon} from './AgentToolIcon';
import {fetchJson} from './api-fetch';
import {agentLabel} from './agent-label';
import type {LiveOutput} from './useAgentLiveOutput';
type Event={id:string;tool:string;status:string;input:string;finished_at:string|null};
const modelPhase=(tool:string)=>['thinking','assistant_text','assistant_final'].includes(tool);
export function AgentActivity({threadId,messageId,events,output,status,hasFinal,versions,threads,progress,startedAt,finishedAt}:{
 threadId:string;messageId:string;events:Event[];output?:LiveOutput;status:string;hasFinal:boolean;
 versions?:{id:string;filename:string;version:number}[];threads?:{id:string;title:string}[];
 progress?:string|null;startedAt?:string;finishedAt?:string|null;
}){
 const [now,setNow]=useState(Date.now());
 const running=['queued','running'].includes(status);
 useEffect(()=>{if(!running||!startedAt)return;setNow(Date.now());const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[running,startedAt]);
 const timestamp=(value?:string|null)=>value?Date.parse(value.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z')):NaN;
 const seconds=Math.max(0,Math.floor(((running?now:timestamp(finishedAt))-timestamp(startedAt))/1000));
 const elapsed=Number.isFinite(seconds)?`${Math.floor(seconds/60)?`${Math.floor(seconds/60)}分`:''}${seconds%60}秒`:'';
 const [open,setOpen]=useState(false);
 const [texts,setTexts]=useState<Record<string,string>>({});
 const [first,setFirst]=useState<{id:string;tool:string;output:string}>();
 const [error,setError]=useState('');
 const ordered=[...events].sort((a,b)=>BigInt(a.id)<BigInt(b.id)?-1:1);
 const revision=ordered.map(e=>`${e.id}:${e.tool}:${e.status}:${e.finished_at}`).join(',');
 useEffect(()=>{
  if(!ordered.some(e=>modelPhase(e.tool)))return;
  const controller=new AbortController();
  fetchJson(`/api/threads/${threadId}/replies/${messageId}/activity?view=first`,{signal:controller.signal})
   .then((rows:{id:string;tool:string;output:string}[])=>{if(!controller.signal.aborted&&rows[0])setFirst(previous=>!previous||BigInt(rows[0].id)<=BigInt(previous.id)?rows[0]:previous);})
   .catch(()=>{});
  return()=>controller.abort();
 },[threadId,messageId,revision]);
 useEffect(()=>{
  if(!output?.event_id||!(output.reasoning||output.content))return;
  const value={id:output.event_id,tool:output.reasoning?'thinking':'assistant_text',output:output.reasoning||output.content};
  setFirst(previous=>!previous||BigInt(value.id)<=BigInt(previous.id)?value:previous);
 },[output]);
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
 const current=!active?({completed:'已完成',failed:'未完成',cancelled:'已停止',queued:'正在思考'}[status]||'执行过程')
  :streaming&&(output.content||output.reasoning)?(output.content?'正在回复':'正在思考')
   :last?.status==='running'?(last.tool==='thinking'?'正在思考':modelPhase(last.tool)?'正在回复':label(last))
    :last?`${modelPhase(last.tool)?'本步处理':label(last)} · ${last.status==='failed'?'失败':'完成'}`:progress||'正在处理';
 const changing=running&&(!startedAt||!!streaming||last?.status==='running');
 const firstTool=ordered.find(e=>String(e.id)===String(first?.id))?.tool||first?.tool;
 const firstVisible=first&&!(hasFinal&&firstTool==='assistant_final');
 const remaining=ordered.filter(e=>String(e.id)!==String(first?.id)&&!(hasFinal&&e.tool==='assistant_final'));
 const extraLive=output?.event_id&&!ordered.some(e=>String(e.id)===String(output.event_id))&&String(output.event_id)!==String(first?.id)&&active;
 const hasContent=remaining.some(e=>!modelPhase(e.tool)||e.status!=='running'||!!texts[e.id]||String(output?.event_id)===String(e.id)&&!!(output?.reasoning||output?.content))||!!extraLive;
 const statusLine=<>
   <span className={`agent-current-step${changing?' agent-step-active':''}`} aria-live="polite" aria-atomic="true">{current}</span>
   {elapsed&&<small className="agent-elapsed">{elapsed}</small>}
   {hasContent&&<svg className="agent-trace-toggle" width="22" height="20" viewBox="0 0 22 20" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M6 3C2 6 2 14 6 17M16 3C20 6 20 14 16 17"/><path className="agent-trace-chevron" d="m8 9 3 3 3-3"/></svg>}
  </>;
 return <div className="agent-trace" data-open={open&&hasContent}>
  {hasContent?<button className="agent-status-line" type="button" aria-expanded={open} title={`${current}；点击展开或收起后续过程`} onClick={()=>setOpen(!open)}>{statusLine}</button>:<div className="agent-status-line">{statusLine}</div>}
  {firstVisible&&<div className="agent-phase agent-first-response" data-event-id={first.id}><div className="message-text"><Markdown remarkPlugins={[remarkGfm]} components={{img:()=> <span>（图片链接）</span>}}>{first.output}</Markdown></div></div>}
  {open&&hasContent&&<div className="agent-activity-items">
   {remaining.map(e=>{
    if(modelPhase(e.tool)){
     const live=String(output?.event_id)===String(e.id)?(e.tool==='thinking'?output?.reasoning:output?.content):undefined;
     return <div className={`agent-phase ${e.tool==='thinking'?'thinking':'text'}`} data-event-id={e.id} key={e.id}>
      <div className="message-text"><Markdown remarkPlugins={[remarkGfm]} components={{img:()=> <span>（图片链接）</span>}}>{live||texts[e.id]||(e.status==='running'?'正在生成…':'')}</Markdown></div>
     </div>;
    }
    const l=agentLabel(e,versions,threads);
    return <AgentEvent key={e.id} threadId={threadId} event={e}><summary><AgentToolIcon category={l.category} status={e.status}/><span className="agent-action-label" title={l.full}>{label(e)}</span><small>{e.status==='running'?'进行中':e.status==='failed'?'失败':'完成'}</small></summary></AgentEvent>;
   })}
   {extraLive&&<div className="agent-phase"><div className="message-text"><Markdown remarkPlugins={[remarkGfm]} components={{img:()=> <span>（图片链接）</span>}}>{output.content||output.reasoning}</Markdown></div></div>}
   {!!output?.truncated&&<small>当前阶段的展示内容已达到长度上限。</small>}
   {error&&<p role="status">{error}</p>}
  </div>}
 </div>;
}
