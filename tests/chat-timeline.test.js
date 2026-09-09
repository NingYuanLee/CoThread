import { test } from 'node:test';
import assert from 'node:assert/strict';
import { taskTimeline } from '../web/chat-timeline.ts';
const message = (id, source='human', extra={}) => ({id,sequence:'1',source,body:id,refs:[],...extra});
const reply = {message_id:'user',reply_id:null,participation:'reply',parent_message_id:'user',agent_slot:1};
const request = [{message_id:'user',response_id:'host'}];
const base = [message('user'),message('host','assistant')];
test('task remains after reception as publication and final reply arrive; refs stay with steps',()=>{
  const running=taskTimeline(base,[reply],request,()=>true);
  assert.deepEqual(running.map(m=>m.id),['user','host','agent-task:user']);
  const publication=message('file','assistant',{agent_task_id:'user',refs:['v1']});
  const final=message('result','assistant',{agent_task_id:'user'});
  const during=taskTimeline([...base,publication],[reply],request,()=>true);
  const done=taskTimeline([...base,publication,message('followup'),final],[{...reply,reply_id:'result'}],request,()=>true);
  assert.deepEqual(during.map(m=>m.id),running.map(m=>m.id));
  assert.deepEqual(done.map(m=>m.id),['user','host','agent-task:user','followup']);
  assert.equal(done[2].body,'file\n\nresult');
  assert.deepEqual(done[2].refs,['v1']);
});
test('partial history retains task results without the original user or reception',()=>{
  const parts=[message('file','assistant',{agent_task_id:'user',refs:['v1']}),message('result','assistant',{agent_task_id:'user',refs:['v1']})];
  const rows=taskTimeline(parts,[{...reply,reply_id:'result'}],request,()=>true);
  assert.equal(rows.length,1);assert.deepEqual(rows[0].refs,['v1']);
});
test('ordinary main replies and empty queued tasks remain unchanged',()=>{
  const normal={...reply,parent_message_id:null,agent_slot:null,reply_id:'host'};
  assert.deepEqual(taskTimeline(base,[normal],request,()=>false),base);
  assert.deepEqual(taskTimeline(base,[reply],request,()=>false),base);
});
test('concurrent child tasks keep their own reception anchors and results',()=>{
  const second={...reply,message_id:'user2',parent_message_id:'user2',agent_slot:2,reply_id:'result2'};
  const rows=taskTimeline([...base,message('user2'),message('host2','assistant'),message('result2','assistant',{agent_task_id:'user2'})],[reply,second],[...request,{message_id:'user2',response_id:'host2'}],()=>true);
  assert.deepEqual(rows.map(m=>m.id),['user','host','agent-task:user','user2','host2','agent-task:user2']);
});
