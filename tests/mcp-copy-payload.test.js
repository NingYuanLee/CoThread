import { test } from "node:test";
import assert from "node:assert/strict";
import { MCP_COPY_INSTRUCTION, formatMcpCopyPayload } from "../shared/mcp-guide.js";

const server = "https://co.example.com/mcp";
const base = { server, projectId: "prj_1234567890" };
const payloadOrder = ["server", "projectId", "threadId", "taskId", "instruction"];
const nameFields = ["project", "iteration", "task", "folder"];

const copyCases = {
  会话: { ...base, threadId: "thr_1234567890" },
  任务: { ...base, threadId: "thr_1234567890", taskId: "tsk_1234567890" },
  项目: base,
};

test("复制载荷统一：字段顺序固定，作用域只追加定位 ID", () => {
  for (const [scope, fields] of Object.entries(copyCases)) {
    const keys = Object.keys(JSON.parse(formatMcpCopyPayload(fields)));
    assert.deepEqual(
      keys,
      payloadOrder.filter((key) => keys.includes(key)),
      scope + "的字段顺序偏离标准",
    );
    assert.ok(keys.includes("server"), scope + "缺少连接地址");
    assert.ok(keys.includes("projectId"), scope + "缺少项目 ID");
  }
});

test("复制载荷只带 ID：名称字段一律不写入剪贴板", () => {
  for (const [scope, fields] of Object.entries(copyCases)) {
    const record = JSON.parse(
      formatMcpCopyPayload({
        ...fields,
        project: "共序 CoThread",
        iteration: "迭代标题",
        task: "任务标题",
        folder: "正式文件",
      }),
    );
    for (const key of nameFields) {
      assert.ok(!(key in record), scope + "仍带名称字段 " + key);
    }
    assert.equal(record.instruction, MCP_COPY_INSTRUCTION);
  }
});

test("复制载荷统一：所有作用域共用同一句调用说明且足够短", () => {
  for (const [scope, fields] of Object.entries(copyCases)) {
    assert.equal(JSON.parse(formatMcpCopyPayload(fields)).instruction, MCP_COPY_INSTRUCTION);
  }
  assert.ok(MCP_COPY_INSTRUCTION.length <= 120, "统一说明不能重新变成大段约束");
});

test("项目设置复制不再是裸 ID，任务复制不再附带长段约束", () => {
  const project = JSON.parse(formatMcpCopyPayload(base));
  assert.equal(project.server, server);
  assert.equal(project.projectId, base.projectId);

  const task = JSON.parse(formatMcpCopyPayload(copyCases.任务));
  assert.equal(task.taskId, "tsk_1234567890");
  assert.equal(task.instruction, MCP_COPY_INSTRUCTION);
  assert.ok(formatMcpCopyPayload(copyCases.任务).length < 400);
});

test("空定位字段不写入复制结果", () => {
  const record = JSON.parse(formatMcpCopyPayload({ ...base, taskId: "", threadId: null }));
  assert.deepEqual(Object.keys(record), ["server", "projectId", "instruction"]);
});
