import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {testDatabase} from './database.js';
import {Service} from '../server/service.js';
import {query} from '../server/db.js';
import {trackThinking} from '../server/agent-thinking.js';
import {createAgentTools} from '../server/agent-tools.js';
test('thinking, intermediate text and tools retain actual order; final text is marked separately',async()=>{
 const database=await testDatabase(),db=database.db;
 try{
  const user={id:randomUUID(),kind:'session'},service=new Service(db);
  await query(db,'INSERT INTO users(id,email,name,password_hash) VALUES(?,?,?,?)',[user.id,user.id+'@test.com','测试','unused']);
  const project=await service.createProject(user,{name:'顺序测试'}),thread=await service.createThread(user,project.id,{title:'执行过程'});
  const message=await service.postMessage(user,thread.id,{body:'@小祥 验证'});
  await query(db,"UPDATE assistant_replies SET status='running' WHERE message_id=?",[message.id]);
  const tracker=trackThinking(db,message.id,'s');
  const emit=(type,data={})=>tracker.notify({method:'session.event',params:{sessionId:'s',event:{type,data}}});
  const chunk=(type,text)=>emit('assistant/chunk',{chunk:{type,text}});
  emit('step/start',{step:1});chunk('reasoning-delta','先确认成员。');chunk('text-delta','我先读取项目成员。');emit('tool/call');await tracker.flush();
  await createAgentTools(service,user,{message_id:message.id,thread_id:thread.id})('list_members',{});
  emit('step/start',{step:2});chunk('reasoning-delta','成员资料已齐全。');chunk('text-delta','最终结果：资料完整。');emit('assistant/message');emit('step/end');await tracker.close('completed','最终结果：资料完整。');
  const rows=await query(db,'SELECT id,tool,output,status FROM agent_events WHERE message_id=? ORDER BY id',[message.id]);
  assert.deepEqual(rows.map(e=>e.tool),['thinking','assistant_text','list_members','thinking','assistant_final']);
  assert.equal(rows[0].output,'先确认成员。');assert.equal(rows[1].output,'我先读取项目成员。');assert.equal(rows[3].output,'成员资料已齐全。');
  assert.ok(rows.every(e=>e.status==='completed'));
  const [live]=await query(db,'SELECT event_id FROM agent_live_output WHERE message_id=?',[message.id]);assert.equal(String(live.event_id),String(rows[4].id));
 }finally{await database.close();}
});
