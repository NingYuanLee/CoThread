import { z } from 'zod/v3';
import { libraryChange } from './library.js';
import { query } from './db.js';
import { HttpError } from './service.js';
const id=z.string().uuid();
export const documentToolSchemas = {
  list_documents:{ projectId:id.optional(),limit:z.number().int().min(1).max(200).default(100),offset:z.number().int().min(0).max(100000).default(0) },
  manage_document:{ projectId:id.optional(),action:z.enum(['rename','move','delete','restore']),artifactId:id.optional(),versionId:id.optional(),scope:z.enum(['document','version']).optional(),name:z.string().min(1).max(160).optional(),folderId:id.nullable().optional() },
  manage_folder:{ projectId:id.optional(),action:z.enum(['create','rename','move','delete']),folderId:id.optional(),name:z.string().min(1).max(160).optional(),parentId:id.nullable().optional() },
};
export async function documentTool(service,user,name,input,job) {
  const args=z.object(documentToolSchemas[name]).parse(input);
  let projectId=args.projectId;
  if(job){const thread=await service.thread(user,job.thread_id);if(projectId && projectId!==thread.project_id)throw new HttpError(403,'仅可操作当前项目');projectId=thread.project_id;}
  id.parse(projectId);
  if(name==='list_documents'){
    const p=await service.project(user,projectId,{display:true});
    const end=args.offset+args.limit;
    return {projectId,folders:p.folders.slice(args.offset,end),versions:p.versions.slice(args.offset,end),page:{nextOffset:end,hasMore:p.folders.length>end||p.versions.length>end}};
  }
  const options={tool:true,authorize:job ? async db=>{
    await service.thread(user,job.thread_id,true,db);
    const [r]=await query(db,'SELECT status FROM assistant_replies WHERE message_id=? FOR UPDATE',[job.message_id]);
    if(r?.status!=='running')throw new HttpError(409,'任务已停止');
  }:undefined};
  if(name==='manage_document'){
    if(['delete','restore'].includes(args.action)&&!args.scope)throw new HttpError(400,'删除或恢复必须明确scope：document为整份文档，version为单个版本');
    const version=args.scope==='version';
    if(version && !['delete','restore'].includes(args.action))throw new HttpError(400,'版本仅支持删除或恢复；重命名和移动作用于整份文档');
    const target=id.parse(version?args.versionId:args.artifactId);
    const data=args.action==='rename'?{name:z.string().min(1).parse(args.name)}:args.action==='move'?{folderId:id.nullable().parse(args.folderId)}:{deleted:args.action==='delete'};
    return {...await libraryChange(service,user,projectId,version?'version':'artifact',target,data,options),action:args.action,scope:args.scope||'document'};
  }
  const target=args.action==='create'?null:id.parse(args.folderId);
  const data=args.action==='create'||args.action==='rename'?{name:z.string().min(1).parse(args.name),...(args.action==='create'?{parentId:args.parentId||null}:{})}:args.action==='move'?{parentId:id.nullable().parse(args.parentId)}:{};
  return {...await libraryChange(service,user,projectId,args.action==='delete'?'remove-folder':'folder',target,data,options),action:args.action};
}
