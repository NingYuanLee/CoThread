import {test,before,after} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './database.js';
import {query} from '../server/db.js';
import {Service} from '../server/service.js';
import {trackLiveOutput,liveOutputSnapshot} from '../server/agent-live-output.js';
import {documentTool} from '../server/document-tools.js';
import {createAgentTools} from '../server/agent-tools.js';
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
test('document tools create folders, rename/move/recycle files and enforce stopped-job guards',async()=>{
 const tools=createAgentTools(service,user,job);
 const folder=await tools('manage_folder',{action:'create',name:'输出'});
 const v=await service.submitVersion(user,thread.id,{title:'初稿',filename:'a.txt',mime:'text/plain',contentBase64:Buffer.from('a').toString('base64')});
 await tools('manage_document',{action:'rename',artifactId:v.artifactId,name:'定稿'});
 await tools('manage_document',{action:'move',artifactId:v.artifactId,folderId:folder.id});
 assert.ok((await tools('list_documents',{})).versions.some(x=>x.id===v.id&&x.title==='定稿'&&x.folder_id===folder.id));
 await assert.rejects(tools('manage_folder',{action:'delete',folderId:folder.id}),e=>e.status===409);
 await tools('manage_document',{action:'delete',scope:'version',versionId:v.id});
 await tools('manage_document',{action:'restore',scope:'version',versionId:v.id});
 await tools('manage_document',{action:'move',artifactId:v.artifactId,folderId:null});
 await tools('manage_folder',{action:'delete',folderId:folder.id});
 await assert.rejects(documentTool(service,user,'manage_document',{action:'delete',scope:'version',artifactId:v.artifactId},job));
 await query(database.db,"UPDATE assistant_replies SET status='cancelled' WHERE message_id=?",[message.id]);
 await assert.rejects(documentTool(service,user,'manage_document',{action:'delete',scope:'document',artifactId:v.artifactId},job),e=>e.status===409);
});
test('DSH schema accepts root-directory null parameters',async()=>{
 const {apply}=await import('../runtime/cothread-tools.mjs');
 const entries=[];apply({tools:{guard(){},register(tool){entries.push(tool)}}});
 assert.ok(entries.length>=14);
});

test('live-output migration works when database defaults differ from existing tables',async()=>{
 const {migrate}=await import('../scripts/migrate.js');
 const separate=await testDatabase();
 try {
  const schema=new URL(separate.url).pathname.slice(1);assert.match(schema,/^cothread_test_[a-f0-9]+$/);
  await separate.db.query('DROP TABLE agent_live_output');
  await separate.db.execute("DELETE FROM schema_migrations WHERE name='020_agent_live_output.sql'");
  await separate.db.query(`ALTER DATABASE \`${schema}\` CHARACTER SET utf8mb3 COLLATE utf8mb3_general_ci`);
  await migrate(separate.db);
  const [rows]=await separate.db.execute("SELECT TABLE_COLLATION FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='agent_live_output'");
  assert.equal(rows[0].TABLE_COLLATION,'utf8mb4_0900_ai_ci');
 } finally {await separate.close();}
});
