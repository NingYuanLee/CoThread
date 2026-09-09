import React from 'react';

const paths: Record<string,string> = {
 '沙箱操作': 'M3 3h14v14H3z M6 7l3 3-3 3 M11 13h3',
 '项目文档': 'M5 2h7l4 4v12H5z M12 2v5h4 M8 11h5 M8 14h5',
 '会话资料': 'M3 3h14v11H8l-5 4z M6 7h8 M6 10h5',
 '外部工具': 'M7 6V4h6v2 M3 6h14v11H3z M3 10h14 M8 10v2h4v-2',
};
export function AgentToolIcon({category,status}:{category:string;status:string}) {
 return <svg className={`agent-tool-icon ${status}`} data-category={category} width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[category]||paths['外部工具']}/></svg>;
}
