import React,{useEffect,useLayoutEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export type UsageStats={provider?:string;model?:string;inputTokens?:number;outputTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;reasoningTokens?:number|null;totalTokens?:number;calls?:number;executionDurationMs?:number;ttftMs?:number;ttftSteps?:number;decodeMs?:number;decodeTokens?:number};
type Record={usage_stats?:UsageStats|string|null;first_response_at?:string|null;finished_at?:string|null};
const timestamp=(value?:string|null)=>value?Date.parse(value.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z')):NaN;
const duration=(ms:number)=>Number.isFinite(ms)?`${Number((Math.max(0,ms)/1000).toFixed(1))}秒`:'未记录';
const tokens=(n?:number)=>n==null?'未记录':`${n.toLocaleString('en-US')} tok`;
function MetricIcon({kind}:{kind:'usage'|'time'}){return <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='usage'?<><ellipse cx="10" cy="4" rx="6" ry="2.5"/><path d="M4 4v6c0 3.3 12 3.3 12 0V4M4 10v6c0 3.3 12 3.3 12 0v-6"/></>:<><circle cx="10" cy="10" r="8"/><path d="M10 5v5l3 2"/></>}</svg>;}
export function MessageUsage({record,finishedAt}:{record?:Record;finishedAt?:string;createdAt?:string}){
 const [open,setOpen]=useState<'usage'|'time'|null>(null),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null),anchor=useRef<HTMLButtonElement|null>(null);
 const [position,setPosition]=useState({top:0,left:0});
 useLayoutEffect(()=>{if(!open||!panel.current||!anchor.current)return;const a=anchor.current.getBoundingClientRect(),p=panel.current.getBoundingClientRect();setPosition({left:Math.max(8,Math.min(a.left,window.innerWidth-p.width-8)),top:a.top>=p.height+16?a.top-p.height-8:Math.max(8,Math.min(a.bottom+8,window.innerHeight-p.height-8))});},[open]);
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(null);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape'){setOpen(null);anchor.current?.focus();}};const scroll=(e:Event)=>{if(!panel.current?.contains(e.target as Node))setOpen(null);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};},[open]);
 let usage:UsageStats={};try{usage=typeof record?.usage_stats==='string'?JSON.parse(record.usage_stats):record?.usage_stats||{};}catch{}
 const end=timestamp(record?.finished_at||finishedAt),elapsed=usage.executionDurationMs??(end-timestamp(record?.first_response_at));
 const prompt=usage.inputTokens==null?NaN:usage.inputTokens+(usage.cacheReadTokens||0)+(usage.cacheWriteTokens||0);
 const cacheHit=prompt>0?`${((usage.cacheReadTokens||0)/prompt*100).toFixed(1)}%`:'未记录';
 const speed=usage.decodeMs&&usage.decodeTokens!=null?`${Math.round(usage.decodeTokens/(usage.decodeMs/1000))} tok/s`:'未记录';
 const ttft=usage.ttftSteps?duration((usage.ttftMs||0)/usage.ttftSteps):'未记录';
 const rows=open==='usage'?[['提供方 / 模型',[usage.provider,usage.model].filter(Boolean).join('/')||'未记录'],['缓存命中',cacheHit],['未缓存输入',tokens(usage.inputTokens)],['缓存读取',tokens(usage.cacheReadTokens)],...(usage.cacheWriteTokens?[['缓存写入',tokens(usage.cacheWriteTokens)]]:[]),['输出',tokens(usage.outputTokens)]]:[['本轮总用时',duration(elapsed)],['输出速度（TPS）',speed],['首 token 用时（TTFT）',ttft]];
 const compact=usage.totalTokens==null?'未记录':usage.totalTokens>=1000?`${(usage.totalTokens/1000).toFixed(1)}K tok`:tokens(usage.totalTokens);
 return <div className="message-usage" ref={root}>
  {(['usage','time'] as const).map(kind=><button key={kind} type="button" className="message-usage-trigger" aria-expanded={open===kind} aria-label={kind==='usage'?'查看本轮用量':'查看本轮用时和速度'} onClick={e=>{anchor.current=e.currentTarget;setOpen(open===kind?null:kind);}}><MetricIcon kind={kind}/><span>{kind==='usage'?`用量 ${compact}`:`用时 ${duration(elapsed)}`}</span></button>)}
  {Number.isFinite(end)&&<time className="message-usage-time">{new Date(end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}</time>}
  {open&&createPortal(<div ref={panel} style={position} className={`message-usage-popover ${open}`} role="dialog" aria-label={open==='usage'?'本轮用量':'本轮用时和速度'}><header><MetricIcon kind={open}/><span>{open==='usage'?'本轮用量':'本轮用时和速度'}</span>{open==='usage'&&<strong>{tokens(usage.totalTokens)}</strong>}</header><dl>{rows.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl></div>,document.body)}
 </div>;
}
