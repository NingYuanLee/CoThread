import assert from "node:assert/strict";
import test from "node:test";
import { HttpError } from "../server/http-error.js";
import {
  UNASSIGNED_TASK_NOTE,
  draftBriefClientError,
  formatAssigneeRemarks,
  formatDraftTree,
  parseTaskDraftBrief,
  takeDraftBriefGap,
  taskDraftModelRequest,
} from "../server/task-draft-brief.js";
import {
  DEFAULT_TASK_DRAFT_PROMPT,
  TASK_DRAFT_JSON_TEXT,
  TASK_DRAFT_SYSTEM_PROMPT,
  taskDraftPromptText,
} from "../shared/task-draft-brief.js";

test("parseTaskDraftBrief 读出标题、目标和约束", () => {
  const brief = parseTaskDraftBrief(
    '```json\n{"title":"核对配色","goal":"三个层级都能对上","constraints":"不要改结构"}\n```',
  );
  assert.deepEqual(brief, {
    title: "核对配色",
    goal: "三个层级都能对上",
    constraints: "不要改结构",
  });
});

test("parseTaskDraftBrief 缺标题时不把半截结果交出去", () => {
  assert.throws(
    () => parseTaskDraftBrief('{"goal":"只有目标"}'),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 502);
      return true;
    },
  );
});

test("空白提示词回到默认，JSON 格式固定", () => {
  assert.equal(taskDraftPromptText("  "), DEFAULT_TASK_DRAFT_PROMPT);
  assert.match(TASK_DRAFT_JSON_TEXT, /"title"/);
  assert.match(TASK_DRAFT_SYSTEM_PROMPT, /只输出一个 JSON 对象/);
  assert.match(TASK_DRAFT_SYSTEM_PROMPT, /关键发言只用来认识这个人/);
  assert.match(DEFAULT_TASK_DRAFT_PROMPT, /按发给这个人来起草/);
  assert.doesNotMatch(DEFAULT_TASK_DRAFT_PROMPT, /只输出一个 JSON 对象/);
});

test("打包给模型时保留文件夹层级，正文挂在对应文件下", () => {
  const tree = formatDraftTree({
    folders: [
      { id: "root", parent_id: null, name: "正式文件", folder_kind: "project_official" },
      { id: "child", parent_id: "root", name: "新建文件夹", folder_kind: "project_official" },
      { id: "empty", parent_id: "child", name: "空目录", folder_kind: "project_official" },
    ],
    selectedFolderIds: ["child"],
    files: [
      { folderId: "child", title: "说明.md", body: "第一行\n第二行", note: "" },
      { folderId: "root", title: "根上的文件.md", body: "根目录正文", note: "" },
    ],
  });
  assert.match(
    tree,
    /正式文件\/\n {2}新建文件夹\/\n {4}空目录\/\n {4}说明\.md\n {6}第一行\n {6}第二行/,
  );
  assert.match(tree, /根上的文件\.md\n {4}根目录正文/);
});

test("没选指派成员时只说明暂无明确指派", () => {
  assert.equal(UNASSIGNED_TASK_NOTE, "当前任务暂无明确指派。");
});

test("指派对象的关键发言只作为认识，并标明不要干扰任务", () => {
  const text = formatAssigneeRemarks({
    name: "李宁远",
    remarks: ["先把配色层级定下来"],
  });
  assert.match(text, /指派给：李宁远/);
  assert.match(text, /只用来认识这个人/);
  assert.match(text, /不要用这些发言决定任务要做什么/);
  assert.match(text, /先把配色层级定下来/);
});

test("起草请求保留低档推理，并留出够写完 JSON 的输出额度", () => {
  const call = taskDraftModelRequest([{ role: "user", content: "材料" }]);
  assert.equal(call.reasoningEffort, "low");
  assert.ok(call.maxTokens >= 16384);
  assert.equal(call.scope, "coordinator");
});

test("模型输出被截断时按生成失败返回，不说成数据库故障", () => {
  const error = draftBriefClientError(new Error("Model response incomplete (max_output_tokens)"));
  assert.ok(error instanceof HttpError);
  assert.equal(error.status, 502);
  assert.match(error.message, /没有生成出可用的任务内容/);
  assert.doesNotMatch(error.message, /数据库/);
});

test("takeDraftBriefGap 五秒内拒绝同一个人再生成", () => {
  const userId = `brief-${Date.now()}`;
  takeDraftBriefGap(userId, 10_000);
  assert.throws(
    () => takeDraftBriefGap(userId, 12_000),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 429);
      return true;
    },
  );
  takeDraftBriefGap(userId, 15_000);
});
