import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
export type UsageStats={model?:string;inputTokens?:number;outputTokens?:number;cacheReadTokens?:number;cacheWriteTokens?:number;reasoningTokens?:number|null;totalTokens?:number;calls?:number;executionDurationMs?:number};
type Record={usage_stats?:UsageStats|string|null;first_response_at?:string|null;finished_at?:string|null};
const timestamp=(value?:string|null)=>value?Date.parse(value.replace(' ','T')+(/Z$|[+-]\d\d:\d\d$/.test(value)?'':'Z')):NaN;
const duration=(ms:number)=>Number.isFinite(ms)?`${(Math.max(0,ms)/1000).toFixed(1)} 秒`:'未记录';
const number=(value?:number|null)=>value==null?'未记录':value.toLocaleString('zh-CN');
export function MessageUsage({record,finishedAt,createdAt}:{record?:Record;finishedAt?:string;createdAt?:string}){
 const [open,setOpen]=useState(false),root=useRef<HTMLDivElement>(null),panel=useRef<HTMLDivElement>(null);
 const [position,setPosition]=useState({top:0,left:0});
 useEffect(()=>{if(!open)return;const close=(e:PointerEvent)=>{if(!root.current?.contains(e.target as Node)&&!panel.current?.contains(e.target as Node))setOpen(false);};const key=(e:KeyboardEvent)=>{if(e.key==='Escape')setOpen(false);};const scroll=(e:Event)=>{if(!panel.current?.contains(e.target as Node))setOpen(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',key);window.addEventListener('scroll',scroll,true);window.addEventListener('resize',scroll);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',key);window.removeEventListener('scroll',scroll,true);window.removeEventListener('resize',scroll);};},[open]);
 let usage:UsageStats={};try{usage=typeof record?.usage_stats==='string'?JSON.parse(record.usage_stats):record?.usage_stats||{};}catch{}
 const end=timestamp(record?.finished_at||finishedAt),first=timestamp(record?.first_response_at),start=timestamp(createdAt);
 const elapsed=end-first;
 const rows=[['模型',usage.model||'未记录'],['未缓存输入',number(usage.inputTokens)],['缓存读取',number(usage.cacheReadTokens)],['缓存写入',number(usage.cacheWriteTokens)],['输出',number(usage.outputTokens)],['其中思考',number(usage.reasoningTokens)],['总 token',number(usage.totalTokens)],['模型调用次数',number(usage.calls)],['首次返回后用时',duration(elapsed)],['首次返回前等待',duration(first-start)],['调用执行用时',duration(usage.executionDurationMs??NaN)],['从消息发送到完成',duration(end-start)]];
 return <div className="message-usage" ref={root}>
  <button type="button" className="message-usage-trigger" aria-expanded={open} aria-label="查看本次用量与耗时" onClick={()=>{const rect=root.current!.getBoundingClientRect(),height=Math.min(460,window.innerHeight-16),width=Math.min(290,window.innerWidth*.7);setPosition({left:Math.max(8,Math.min(rect.right-width,window.innerWidth-width-8)),top:Math.max(8,Math.min(rect.bottom+8,window.innerHeight-height-8))});setOpen(!open);}}>{usage.totalTokens==null?'token 未记录':`${number(usage.totalTokens)} token`} · {duration(elapsed)}</button>
  {open&&createPortal(<div ref={panel} style={position} className="message-usage-popover" role="dialog" aria-label="本次用量与耗时"><strong>本次回复</strong><dl>{rows.map(([label,value])=><React.Fragment key={label}><dt>{label}</dt><dd>{value}</dd></React.Fragment>)}</dl><p>按本条回复的模型调用汇总。思考 token 已包含在输出中；调用执行用时包含工具操作。</p></div>,document.body)}
 </div>;
}
