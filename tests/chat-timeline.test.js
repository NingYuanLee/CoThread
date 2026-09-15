import { test } from 'node:test';
import assert from 'node:assert/strict';
import { liveCoordinatorDraft, omitInternalCoordinatorPosts, taskTimeline, usageReplyForMessage } from '../web/chat-timeline.ts';
const message = (id, source='human', extra={}) => ({id,sequence:'1',source,body:id,refs:[],...extra});
const reply = {message_id:'user',reply_id:null,participation:'reply',parent_message_id:'user',agent_slot:1};
const request = [{message_id:'user',response_id:'host'}];
const base = [message('user'),message('host','assistant')];
test('queued routing stays invisible until the coordinator produces a reception',()=>{
  const queued={...reply,parent_message_id:null,agent_slot:null};
  const rows=taskTimeline([base[0]],[queued],[{message_id:'user',response_id:null,status:'queued'}],()=>false);
  assert.deepEqual(rows,[base[0]]);
  const done=taskTimeline(base,[queued],[{message_id:'user',response_id:'host',status:'completed'}],()=>false);
  assert.equal(done[1].render_key,'agent-reception:user');
  assert.equal(done.length,2);
  assert.equal(taskTimeline([base[0]],[{...queued,participation:'pending'}],[{message_id:'user',response_id:null,status:'queued'}],()=>false).length,1);
});
test('task remains after reception as publication and final reply arrive; refs stay with steps',()=>{
  const running=taskTimeline(base,[reply],request,()=>true);
  assert.deepEqual(running.map(m=>m.id),['user','host','agent-task:user']);
  const publication=message('file','assistant',{agent_task_id:'user',refs:['v1']});
  const final=message('result','assistant',{agent_task_id:'user'});
  const during=taskTimeline([...base,publication],[reply],request,()=>true);
  const done=taskTimeline([...base,publication,message('followup'),final],[{...reply,reply_id:'result'}],request,()=>true);
  assert.deepEqual(during.map(m=>m.id),running.map(m=>m.id));
  assert.deepEqual(done.map(m=>m.id),['user','host','agent-task:user','followup']);
  assert.equal(done[2].body,'result');
  assert.deepEqual(done[2].refs,['v1']);
});
test('partial history retains task results without the original user or reception',()=>{
  const parts=[message('file','assistant',{agent_task_id:'user',refs:['v1']}),message('result','assistant',{agent_task_id:'user',refs:['v1']})];
  const rows=taskTimeline(parts,[{...reply,reply_id:'result'}],request,()=>true);
  assert.equal(rows.length,1);assert.deepEqual(rows[0].refs,['v1']);
});
test('failed pending coordinator replies stay visible',()=>{
  const failed={message_id:'user',reply_id:null,participation:'pending',parent_message_id:null,agent_slot:null};
  const rows=taskTimeline([base[0]],[failed],[{message_id:'user',response_id:null,status:'failed'}],()=>true);
  assert.equal(rows.length,2);
  assert.equal(rows[1].id,'agent-task:user');
  assert.equal(rows[1].source,'assistant');
});
test('ordinary main replies and empty queued tasks remain unchanged',()=>{
  const normal={...reply,parent_message_id:null,agent_slot:null,reply_id:'host'};
  assert.deepEqual(taskTimeline(base,[normal],request,()=>false),base);
  assert.deepEqual(taskTimeline(base,[reply],request,()=>false),base);
});
test('L2 group posts stay as ordinary messages without a process row',()=>{
  const coordinator={message_id:'user',reply_id:'post2',participation:'reply',parent_message_id:null,agent_slot:null};
  const first=message('post1','assistant',{agent_task_id:'user',body:'先看一下任务'});
  const second=message('post2','assistant',{agent_task_id:'user',body:'再把结果告诉大家'});
  const rows=taskTimeline([base[0],first,second],[coordinator],[{message_id:'user',response_id:null,status:'completed'}],()=>false);
  assert.deepEqual(rows.map(m=>m.id),['user','post1','post2']);
  assert.deepEqual(rows.slice(1).map(m=>m.body),['先看一下任务','再把结果告诉大家']);
});
test('usage chips attach to every L2 post of the same turn, plus executor rows',()=>{
  const coordinator={message_id:'user',reply_id:'post2',participation:'reply',parent_message_id:null,agent_slot:null,usage_stats:{totalTokens:1200,executionDurationMs:1800}};
  const empty={...coordinator,usage_stats:null};
  const executor={message_id:'task',reply_id:'result',participation:'reply',parent_message_id:'task',agent_slot:1};
  assert.equal(usageReplyForMessage({id:'post2',agent_task_id:'user'},[coordinator])?.message_id,'user');
  assert.equal(usageReplyForMessage({id:'post1',agent_task_id:'user'},[coordinator])?.message_id,'user');
  assert.equal(usageReplyForMessage({id:'post2',agent_task_id:'user'},[empty]),null);
  assert.equal(usageReplyForMessage({id:'host'},[coordinator]),null);
  assert.equal(usageReplyForMessage({id:'result',agent_task_id:'task'},[executor])?.message_id,'task');
});
test('wait/finish companion posts stay out of the group timeline',()=>{
  const coordinator={message_id:'user',reply_id:'wrap',participation:'reply',parent_message_id:null,agent_slot:null};
  const rows=[message('user'),message('talk','assistant',{agent_task_id:'user',body:'给成员看'}),message('wrap','assistant',{agent_task_id:'user',body:'已进入等待'})];
  const hidden=omitInternalCoordinatorPosts(rows,[coordinator],[{message_id:'user',tool:'wait_for_updates'}]);
  assert.deepEqual(hidden.map(m=>m.id),['user','talk']);
  assert.deepEqual(omitInternalCoordinatorPosts(rows,[coordinator],[]).map(m=>m.id),['user','talk','wrap']);
});
test('live L2 draft streams until the same body is committed',()=>{
  const running={message_id:'user',status:'running'};
  const posts=[message('post1','assistant',{agent_task_id:'user',body:'先看一下任务'})];
  assert.equal(liveCoordinatorDraft(running,{content:'再把结果告诉大家'},posts),'再把结果告诉大家');
  assert.equal(liveCoordinatorDraft(running,{content:'先看一下任务'},posts),null);
  assert.equal(liveCoordinatorDraft({...running,status:'completed'},{content:'再把结果告诉大家'},posts),null);
  assert.equal(liveCoordinatorDraft(running,{content:'NO_VISIBLE_MESSAGE'},posts),null);
  assert.equal(liveCoordinatorDraft(running,{content:'已进入等待'},posts,[{message_id:'user',tool:'wait_for_updates'}]),null);
});
test('concurrent child tasks keep their own reception anchors and results',()=>{
  const second={...reply,message_id:'user2',parent_message_id:'user2',agent_slot:2,reply_id:'result2'};
  const rows=taskTimeline([...base,message('user2'),message('host2','assistant'),message('result2','assistant',{agent_task_id:'user2'})],[reply,second],[...request,{message_id:'user2',response_id:'host2'}],()=>true);
  assert.deepEqual(rows.map(m=>m.id),['user','host','agent-task:user','user2','host2','agent-task:user2']);
});
