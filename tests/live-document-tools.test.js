import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './database.js';
import {query} from '../server/db.js';
import {Service} from '../server/service.js';
import {trackLiveOutput,liveOutputSnapshot,observeLiveOutput} from '../server/agent-live-output.js';
import {documentTool} from '../server/document-tools.js';
import {createAgentTools} from '../server/agent-tools.js';
import {bindDshL3Execution, createTask} from '../server/task-pool.js';
let database,service,user,project,thread,message,job;
before(async()=>{
 database=await testDatabase();service=new Service(database.db);user={id:randomUUID(),kind:'session'};
 await query(database.db,'INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)',[user.id,user.id+'@test.com','测试','unused']);
 project=await service.createProject(user,{name:'实时与文档工具'});thread=await service.createThread(user,project.id,{title:'工作'});
 message=await service.postMessage(user,thread.id,{body:'@小祥 测试'});
 await query(database.db,"UPDATE assistant_replies SET status='running' WHERE message_id=?",[message.id]);job={thread_id:thread.id,message_id:message.id};
});
after(async()=>database?.close());
test('real stream deltas are isolated, bounded, reset per step and excluded from discussion context',async()=>{
 const tracker=trackLiveOutput(database.db,message.id,'s');
 const emit=(type,data,sessionId='s')=>tracker.notify({method:'session.event',params:{sessionId,event:{type,data}}});
 emit('step/start',{step:1});emit('assistant/chunk',{chunk:{type:'reasoning-delta',text:'正在核对文件'}});
 emit('assistant/chunk',{chunk:{type:'text-delta',text:'已找到'}});emit('assistant/chunk',{chunk:{type:'text-delta',text:'两份文档'}});
 emit('assistant/chunk',{chunk:{type:'reasoning-delta',text:'错误会话'}},'other');await tracker.flush();
 let [row]=await liveOutputSnapshot(database.db,thread.id);assert.equal(row.content,'已找到两份文档');assert.equal(row.reasoning,'正在核对文件');
 assert.ok(!JSON.stringify(await service.context(user,thread.id)).includes('正在核对文件'));
 emit('step/start',{step:2});emit('assistant/chunk',{chunk:{type:'reasoning-delta',text:'a'.repeat(17000)}});await tracker.flush();
 [row]=await liveOutputSnapshot(database.db,thread.id);assert.equal(row.step,2);assert.equal(row.content,'');assert.equal(row.reasoning.length,16000);assert.equal(row.truncated,1);
 await tracker.close();
});
test('same-instance live output arrives before the batched database write and survives closing',async()=>{
 const tracker=trackLiveOutput(database.db,message.id,'fast',{interval:10000});
 const emit=(type,data)=>tracker.notify({method:'session.event',params:{sessionId:'fast',event:{type,data}}});
 emit('step/start',{step:1});await tracker.flush();await liveOutputSnapshot(database.db,thread.id);
 let cancelTimer;
 const notified=new Promise((resolve,reject)=>{cancelTimer=setTimeout(()=>reject(new Error('No live notification')),2000);const stop=observeLiveOutput(database.db,()=>{stop();clearTimeout(cancelTimer);resolve();});});
 try{
  emit('assistant/chunk',{chunk:{type:'text-delta',text:'无需等待落库'}});await notified;
  const [live]=await liveOutputSnapshot(database.db,thread.id);assert.equal(live.content,'无需等待落库');
  const [stored]=await query(database.db,'SELECT content FROM agent_live_output WHERE message_id=?',[message.id]);assert.equal(stored.content,'');
 }finally{clearTimeout(cancelTimer);await tracker.close();}
 const [stored]=await query(database.db,'SELECT content FROM agent_live_output WHERE message_id=?',[message.id]);assert.equal(stored.content,'无需等待落库');
});

test('document tools create folders, rename/move/recycle files and enforce stopped-job guards',async()=>{
 const tools=createAgentTools(service,user,job);
 const folder=await tools('manage_folder',{action:'create',name:'输出'});
 const official=await service.uploadOfficialDocument(user,project.id,{
  folderId:folder.id,title:'初稿',filename:'a.txt',mime:'text/plain',
  contentBase64:Buffer.from('a').toString('base64'),
 });
 await tools('manage_document',{action:'rename',artifactId:official.artifactId,name:'定稿'});
 const [root]=await query(database.db,"SELECT id FROM document_folders WHERE project_id=? AND folder_kind='project_official' AND parent_id IS NULL LIMIT 1",[project.id]);
 await tools('manage_document',{action:'move',artifactId:official.artifactId,folderId:root.id});
 await tools('manage_document',{action:'move',artifactId:official.artifactId,folderId:folder.id});
 assert.ok((await tools('list_documents',{})).versions.some(x=>x.id===official.id&&x.title==='定稿'&&x.folder_id===folder.id));
 const nested=await tools('manage_folder',{action:'create',name:'子目录',parentId:folder.id});
 const child=await service.uploadOfficialDocument(user,project.id,{
  folderId:nested.id,title:'子文件',filename:'child.txt',mime:'text/plain',
  contentBase64:Buffer.from('c').toString('base64'),
 });
 const listed=await tools('list_documents',{folderId:folder.id});
 assert.equal(listed.folder.id,folder.id);
 assert.equal(listed.recursive,false);
 assert.ok(listed.folders.some(item=>item.id===nested.id));
 assert.equal(listed.versions.some(item=>item.id===official.id),true);
 const tree=await tools('list_documents',{folderId:folder.id,recursive:true});
 assert.ok(tree.folders.some(item=>item.id===nested.id));
 assert.ok(tree.versions.some(item=>item.id===child.id&&item.folder_id===nested.id));
 await assert.rejects(tools('manage_folder',{action:'delete',folderId:folder.id}),e=>e.status===409);
 await tools('manage_document',{action:'delete',scope:'document',artifactId:child.artifactId});
 await tools('manage_folder',{action:'delete',folderId:nested.id});
 await tools('manage_document',{action:'delete',scope:'document',artifactId:official.artifactId});
 await tools('manage_folder',{action:'delete',folderId:folder.id});
 await tools('manage_document',{action:'restore',scope:'document',artifactId:official.artifactId});
 const agent={...user,kind:'agent'};
 const output=await service.submitVersion(agent,thread.id,{title:'产物',filename:'out.txt',mime:'text/plain',contentBase64:Buffer.from('b').toString('base64')});
 await tools('manage_document',{action:'delete',scope:'version',versionId:output.id});
 await tools('manage_document',{action:'restore',scope:'version',versionId:output.id});
 await assert.rejects(documentTool(service,user,'manage_document',{action:'delete',scope:'version',artifactId:output.artifactId},job));
 await query(database.db,"UPDATE assistant_replies SET status='cancelled' WHERE message_id=?",[message.id]);
 await assert.rejects(documentTool(service,user,'manage_document',{action:'delete',scope:'document',artifactId:output.artifactId},job),e=>e.status===409);
});

test('L3 can publish after the parent L2 reply has already finished', async () => {
  const db = database.db;
  const l2SessionId = randomUUID();
  const childId = randomUUID();
  await query(db, "INSERT INTO agent_sessions(thread_id,session_id) VALUES(?,?)", [thread.id, l2SessionId]);
  const assist = await createTask(db, {
    projectId: project.id, originThreadId: thread.id, sourceType: "human_member", sourceUserId: user.id,
    createdByType: "l2_session", createdById: l2SessionId, taskType: "assist_l2", title: "L2 结束后仍可提交",
    goal: "发布不依赖父回复 running", targetType: "l2_session", targetId: l2SessionId,
  });
  await bindDshL3Execution(db, l2SessionId, childId, assist.id);
  await query(db, "UPDATE assistant_replies SET status='completed' WHERE message_id=?", [message.id]);
  const data = { title: "L3 产物", filename: "l3.txt", mime: "text/plain",
    contentBase64: Buffer.from("from-l3").toString("base64") };
  await assert.rejects(service.submitVersion({ ...user, kind: "agent" }, thread.id, data, undefined, message.id),
    (error) => error.status === 409);
  const published = await service.submitVersion({ ...user, kind: "agent" }, thread.id, data, undefined, message.id, false,
    { executorSessionId: childId });
  assert.ok(published.id);
  const tools = createAgentTools(service, user, job, {
    role: "coordinator",
    l2SessionId,
    getSandbox: async () => ({
      virtualPath: (path) => path,
      files: { makeDir: async () => {}, write: async () => {} },
      readFile: async () => Buffer.from("from-l3-tool"),
      commands: { run: async () => ({ stdout: "", stderr: "", exitCode: 0 }) },
    }),
  });
  const viaTool = await tools("publish_artifact", { path: "out.txt", title: "工具提交" }, { sessionId: childId });
  assert.equal(viaTool.savedToProject, true);
  const viaLiveRun = await tools("publish_artifact", { path: "out2.txt", title: "无 session 也提交" }, {});
  assert.equal(viaLiveRun.savedToProject, true);
});
test('DSH schema accepts root-directory null parameters',async()=>{
 const {apply}=await import('../runtime/cothread-tools.mjs');
 const entries=[];apply({tools:{guard(){},register(tool){entries.push(tool)}}});
 assert.ok(entries.length>=14);
});

test('live-output migration works when database defaults differ from existing tables',async()=>{
 const {migrate}=await import('../scripts/migrate.js');
 const schema=new URL(database.url).pathname.slice(1);assert.match(schema,/(?:^|_)(?:dev|test)(?:_|$)/i);
 await database.db.query('DROP TABLE agent_live_output');
 await database.db.execute("DELETE FROM schema_migrations WHERE name IN ('020_agent_live_output.sql','021_live_event_cursor.sql')");
 await database.db.query(`ALTER DATABASE \`${schema}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci`);
 await migrate(database.db);
 const [rows]=await database.db.execute("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='agent_live_output'");
 assert.equal(rows[0].TABLE_COLLATION,'utf8mb4_0900_ai_ci');
});
