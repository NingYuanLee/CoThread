export const PREVIEW_CONSOLE_MESSAGE = "cothread-preview-console";
export const PREVIEW_NAVIGATION_MESSAGE = "cothread-preview-navigation";
export const PREVIEW_NEW_WINDOW_MESSAGE = "cothread-preview-new-window";

export function previewConsoleProbeHtml() {
  return `<script data-cothread-preview-console="1">(function(){
    var TYPE=${JSON.stringify(PREVIEW_CONSOLE_MESSAGE)};
    var NAV=${JSON.stringify(PREVIEW_NAVIGATION_MESSAGE)};
    var NEW_WINDOW=${JSON.stringify(PREVIEW_NEW_WINDOW_MESSAGE)};
    function fmt(value){
      if(value==null)return String(value);
      if(typeof value==="string")return value;
      if(value instanceof Error)return value.stack||value.message||String(value);
      try{return JSON.stringify(value);}catch(e){return String(value);}
    }
    function send(level,args){
      var payload={type:TYPE,level:level,args:args};
      try{top.postMessage(payload,"*");}catch(e){
        try{parent.postMessage(payload,"*");}catch(e2){}
      }
    }
    function sendEvent(type,payload){
      var message=Object.assign({type:type},payload||{});
      try{top.postMessage(message,"*");}catch(e){
        try{parent.postMessage(message,"*");}catch(e2){}
      }
    }
    function absoluteUrl(value){
      try{return new URL(String(value||""),location.href).href;}catch(e){return "";}
    }
    function announceNavigation(){sendEvent(NAV,{href:location.href,title:document.title||""});}
    ["pushState","replaceState"].forEach(function(method){
      var original=history[method];
      history[method]=function(){var result=original.apply(this,arguments);announceNavigation();return result;};
    });
    window.addEventListener("popstate",announceNavigation);
    window.addEventListener("hashchange",announceNavigation);
    window.addEventListener("load",announceNavigation);
    document.addEventListener("click",function(event){
      var target=event.target&&event.target.closest?event.target.closest("a[href]"):null;
      if(!target)return;
      var opensNew=target.target==="_blank"||event.metaKey||event.ctrlKey||event.shiftKey||event.button===1;
      if(!opensNew)return;
      var href=absoluteUrl(target.href);
      if(!href)return;
      event.preventDefault();
      event.stopPropagation();
      sendEvent(NEW_WINDOW,{href:href,title:target.textContent||""});
    },true);
    var originalOpen=window.open;
    window.open=function(value){
      var href=absoluteUrl(value);
      if(href){sendEvent(NEW_WINDOW,{href:href,title:""});return null;}
      return originalOpen.apply(this,arguments);
    };
    ["log","info","warn","error","debug"].forEach(function(level){
      var orig=console[level]?console[level].bind(console):function(){};
      console[level]=function(){
        send(level,Array.prototype.slice.call(arguments).map(fmt));
        orig.apply(console,arguments);
      };
    });
    window.addEventListener("error",function(event){
      var target=event.target;
      if(target&&target!==window){
        send("error",["资源加载失败",String(target.src||target.href||target.currentSrc||"")]);
        return;
      }
      send("error",[event.message||"脚本错误",(event.filename||"")+(event.lineno?":"+event.lineno:"")]);
    },true);
    window.addEventListener("unhandledrejection",function(event){
      send("error",["未处理的 Promise",fmt(event.reason)]);
    });
    if(window.fetch){
      var _fetch=window.fetch.bind(window);
      window.fetch=function(){
        return _fetch.apply(this,arguments).then(function(res){
          if(!res.ok)send("warn",["fetch "+res.status,String(res.url)]);
          return res;
        });
      };
    }
  })();</script>`;
}

export function resolvePreviewAssetPath(ref) {
  const trimmed = String(ref || "").trim();
  if (
    !trimmed ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:")
  ) {
    return null;
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return null;
  let path = trimmed.replace(/^\.\//, "");
  const marker = "/preview/";
  const previewAt = path.indexOf(marker);
  if (path.startsWith("/api/versions/") && previewAt >= 0) {
    path = path.slice(previewAt + marker.length);
  } else {
    path = path.replace(/^\/+/, "");
  }
  path = path.replace(/^~t~[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\/?/, "");
  if (!path || path.includes("..")) return null;
  return path;
}

async function replaceAllAsync(html, regexp, replacer) {
  const matches = [...html.matchAll(regexp)];
  let out = html;
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const replacement = await replacer(match);
    out =
      out.slice(0, match.index) +
      replacement +
      out.slice(match.index + match[0].length);
  }
  return out;
}

function escapeEmbedded(text, tag) {
  return String(text).replace(
    new RegExp(`</${tag}`, "gi"),
    `<\\/${tag}`,
  );
}

export async function inlineHtmlPreviewAssets(html, loadAsset) {
  let out = String(html || "").replace(/<base\s[^>]*>/gi, "");
  out = await replaceAllAsync(
    out,
    /<link\b([^>]*?)href\s*=\s*(["'])([^"']+)\2([^>]*)\/?>/gi,
    async (match) => {
      if (!/stylesheet/i.test(match[0])) return match[0];
      const path = resolvePreviewAssetPath(match[3]);
      if (!path) return match[0];
      const css = await loadAsset(path);
      return `<style>${escapeEmbedded(css, "style")}</style>`;
    },
  );
  out = await replaceAllAsync(
    out,
    /<script\b([^>]*?)src\s*=\s*(["'])([^"']+)\2([^>]*)>\s*<\/script>/gi,
    async (match) => {
      const path = resolvePreviewAssetPath(match[3]);
      if (!path) return match[0];
      const js = await loadAsset(path);
      return `<script>${escapeEmbedded(js, "script")}</script>`;
    },
  );
  return out;
}
