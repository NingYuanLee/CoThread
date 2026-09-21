import { z } from 'zod/v3';
import { libraryChange } from './library.js';
import { filterProjectLibraryFolders, filterProjectLibraryVersions } from './project-library.js';
import { query } from './db.js';
import { HttpError } from './service.js';
const id=z.string().uuid();
export const documentToolSchemas = {
  list_documents:{
    projectId:id.optional(),
    folderId:id.optional(),
    recursive:z.boolean().optional(),
    limit:z.number().int().min(1).max(200).default(100),
    offset:z.number().int().min(0).max(100000).default(0),
  },
  manage_document:{ projectId:id.optional(),action:z.enum(['rename','move','delete','restore']),artifactId:id.optional(),versionId:id.optional(),scope:z.enum(['document','version']).optional(),name:z.string().min(1).max(160).optional(),folderId:id.nullable().optional() },
  manage_folder:{ projectId:id.optional(),action:z.enum(['create','rename','move','delete']),folderId:id.optional(),name:z.string().min(1).max(160).optional(),parentId:id.nullable().optional() },
};

function folderDescendantIds(rootId, folders) {
  const children = new Map();
  for (const folder of folders) {
    if (!folder.parent_id) continue;
    const list = children.get(folder.parent_id) || [];
    list.push(folder.id);
    children.set(folder.parent_id, list);
  }
  const ids = new Set([rootId]);
  const stack = [rootId];
  while (stack.length) {
    const current = stack.pop();
    for (const child of children.get(current) || []) {
      if (ids.has(child)) continue;
      ids.add(child);
      stack.push(child);
    }
  }
  return ids;
}

function latestVersions(versions) {
  const latest = new Map();
  for (const item of versions) {
    if (item.deleted_at) continue;
    const prev = latest.get(item.artifact_id);
    if (!prev || (item.version || 0) > (prev.version || 0)) latest.set(item.artifact_id, item);
  }
  return [...latest.values()];
}

export function listDocumentScope(folders, versions, { folderId, recursive = false, limit = 100, offset = 0 } = {}) {
  if (!folderId) {
    const end = offset + limit;
    return {
      folders: folders.slice(offset, end),
      versions: versions.slice(offset, end),
      page: { nextOffset: end, hasMore: folders.length > end || versions.length > end },
    };
  }
  const folder = folders.find((item) => item.id === folderId);
  if (!folder) throw new HttpError(404, '文件夹不存在');
  const scopeIds = recursive ? folderDescendantIds(folderId, folders) : new Set([folderId]);
  const childFolders = folders.filter((item) => recursive
    ? item.id !== folderId && scopeIds.has(item.id)
    : item.parent_id === folderId);
  const childVersions = latestVersions(versions).filter((item) => item.folder_id && (
    recursive ? scopeIds.has(item.folder_id) : item.folder_id === folderId
  ));
  const end = offset + limit;
  return {
    folder,
    recursive: !!recursive,
    folders: childFolders.slice(offset, end),
    versions: childVersions.slice(offset, end),
    page: {
      nextOffset: end,
      hasMore: childFolders.length > end || childVersions.length > end,
    },
  };
}

export async function documentTool(service,user,name,input,job) {
  const args=z.object(documentToolSchemas[name]).parse(input);
  let projectId=args.projectId;
  if(job){const thread=await service.thread(user,job.thread_id);if(projectId && projectId!==thread.project_id)throw new HttpError(403,'仅可操作当前项目');projectId=thread.project_id;}
  id.parse(projectId);
  if(name==='list_documents'){
    if(job)await service.assertDocumentScopeAvailable(service.db,projectId,job.thread_id);
    const p=await service.project(user,projectId,{display:true});
    const folders=job?filterProjectLibraryFolders(p.folders):p.folders;
    const versions=job?filterProjectLibraryVersions(p.versions):p.versions;
    return {projectId, ...listDocumentScope(folders, versions, args)};
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
    const data={...(job?{threadId:job.thread_id}:{}),...(args.action==='rename'?{name:z.string().min(1).parse(args.name)}:args.action==='move'?{folderId:id.nullable().parse(args.folderId)}:{deleted:args.action==='delete'})};
    return {...await libraryChange(service,user,projectId,version?'version':'artifact',target,data,options),action:args.action,scope:args.scope||'document'};
  }
  const target=args.action==='create'?null:id.parse(args.folderId);
  const data={...(job?{threadId:job.thread_id}:{}),...(args.action==='create'||args.action==='rename'?{name:z.string().min(1).parse(args.name),...(args.action==='create'?{parentId:args.parentId||null}:{})}:args.action==='move'?{parentId:id.nullable().parse(args.parentId)}:{})};
  return {...await libraryChange(service,user,projectId,args.action==='delete'?'remove-folder':'folder',target,data,options),action:args.action};
}
