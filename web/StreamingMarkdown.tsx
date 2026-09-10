import React,{memo,useEffect,useRef,useState} from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
const components={img:()=> <span>（图片链接）</span>};
// Reveal only text already received. Keep a short, bounded visual buffer for
// database/poll batches; completed output and phase replacements are immediate.
export const StreamingMarkdown=memo(function StreamingMarkdown({text,active}:{text:string;active:boolean}){
 const [visible,setVisible]=useState(text),latest=useRef(text);
 useEffect(()=>{
  let timer:ReturnType<typeof setTimeout>|undefined,cancelled=false;
  const from=latest.current;
  const publish=(value:string)=>{latest.current=value;setVisible(value);};
  if(!active||!text.startsWith(from)||window.matchMedia('(prefers-reduced-motion: reduce)').matches){publish(text);return;}
  const start=performance.now(),length=text.length-from.length;
  const advance=()=>{if(cancelled)return;const ratio=Math.min(1,(performance.now()-start)/160),count=Math.min(text.length,from.length+Math.max(Math.min(4,length),Math.ceil(length*ratio)));publish(text.slice(0,count));if(count<text.length)timer=setTimeout(advance,40);};
  advance();return()=>{cancelled=true;clearTimeout(timer);};
 },[text,active]);
 return <Markdown remarkPlugins={[remarkGfm]} components={components}>{!active||!text.startsWith(visible)?text:visible}</Markdown>;
});
