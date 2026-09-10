import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createUsageMeter} from '../server/agent-usage.js';
test('native usage replaces repeated samples and counts retries without counting reasoning twice',()=>{
 const meter=createUsageMeter(),usage={inputTokens:100,cacheReadTokens:400,cacheWriteTokens:20,outputTokens:50,reasoningTokens:30};
 assert.equal(meter.result(),null);
 meter.notify({type:'assistant/chunk',data:{turn:1,step:1,chunk:{type:'usage',usage}}});
 meter.notify({type:'assistant/message',data:{turn:1,step:1,usage}});
 assert.equal(meter.result().totalTokens,570);assert.equal(meter.result().calls,1);
 meter.notify({type:'assistant/message',data:{turn:1,step:1,usage:{...usage,outputTokens:60}}});
 assert.equal(meter.result().totalTokens,580);
 meter.notify({type:'llm/retry-started',data:{turn:1,step:1}});
 meter.notify({type:'assistant/message',data:{turn:1,step:1,usage}});
 meter.notify({type:'assistant/message',data:{turn:1,step:2,usage}});
 assert.equal(meter.result().totalTokens,1720);assert.equal(meter.result().calls,3);assert.equal(meter.result().reasoningTokens,90);
});
test('unreported usage is unknown, while reported zero remains zero',()=>{
 const meter=createUsageMeter();meter.notify({type:'step/end',data:{}});assert.equal(meter.result(),null);
 meter.notify({type:'assistant/message',data:{turn:1,step:1,usage:{inputTokens:0,outputTokens:0}}});
 assert.equal(meter.result().totalTokens,0);assert.equal(meter.result().reasoningTokens,null);
});
