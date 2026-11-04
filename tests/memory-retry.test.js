import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MEMORY_AUTO_RETRY_LIMIT,
  MEMORY_RETRY_EXHAUSTED_WINDOW_NOTE,
  MEMORY_RETRY_STEPS,
  MEMORY_RETRY_STOPPED_NOTE,
  MEMORY_RETRY_STOPPED_SECONDS,
  MEMORY_REVIEW_RETRY_STEPS,
  memoryRetryDelaySeconds,
  memoryRetryStoppedMessage,
  resolveMemoryRetry,
} from "../server/memory-retry.js";
import {
  PROJECT_MEMORY_SIGNAL_KINDS,
  projectMemorySettlementId,
  shouldReuseDocumentSummary,
} from "../server/project-memory.js";

test("重试退避按次数递增，超过上限后停止自动重试", () => {
  assert.deepEqual(
    [...MEMORY_RETRY_STEPS],
    [60, 300, 1800, 7200, 21600],
    "默认退避应逐级放大，避免同一份内容反复调用模型",
  );
  assert.equal(memoryRetryDelaySeconds(1), 60);
  assert.equal(memoryRetryDelaySeconds(2), 300);
  assert.equal(memoryRetryDelaySeconds(MEMORY_AUTO_RETRY_LIMIT), 21600);
  assert.equal(
    memoryRetryDelaySeconds(MEMORY_AUTO_RETRY_LIMIT + 1),
    null,
    "超过自动重试上限应停止，而不是继续调用 Agent",
  );
  assert.equal(memoryRetryDelaySeconds(0), 60, "缺少次数时按首次失败处理");
  assert.equal(memoryRetryDelaySeconds("2"), 300, "字符串次数按数值处理");
});

test("待观察问题复核使用更慢的独立退避", () => {
  assert.deepEqual([...MEMORY_REVIEW_RETRY_STEPS], [300, 900, 3600, 21600, 86400]);
  assert.equal(memoryRetryDelaySeconds(1, MEMORY_REVIEW_RETRY_STEPS), 300);
  assert.equal(memoryRetryDelaySeconds(2, MEMORY_REVIEW_RETRY_STEPS), 900);
  assert.equal(memoryRetryDelaySeconds(6, MEMORY_REVIEW_RETRY_STEPS), null);
});

test("停止自动重试时保留原始原因并写明需要人工重试", () => {
  const message = memoryRetryStoppedMessage("模型调用失败");
  assert.match(message, /模型调用失败/);
  assert.ok(message.includes(MEMORY_RETRY_STOPPED_NOTE));
  assert.ok(
    message.startsWith(MEMORY_RETRY_STOPPED_NOTE),
    "提示应在开头，避免被 255/500 字符上限截断后丢失",
  );
  assert.ok(message.length <= 1000);
  const alreadyNoted = memoryRetryStoppedMessage(`失败；${MEMORY_RETRY_STOPPED_NOTE}`);
  assert.equal(alreadyNoted, `失败；${MEMORY_RETRY_STOPPED_NOTE}`, "重复包装不应叠加提示");
});

test("resolveMemoryRetry 在最后一次自动重试后推到远期并给出停止文案", () => {
  const retrying = resolveMemoryRetry(2, new Error("出处核验失败"));
  assert.deepEqual(retrying, {
    delaySeconds: 300,
    stopped: false,
    error: "出处核验失败",
  });
  const stopped = resolveMemoryRetry(MEMORY_AUTO_RETRY_LIMIT + 1, new Error("出处核验失败"));
  assert.equal(stopped.stopped, true);
  assert.equal(stopped.delaySeconds, MEMORY_RETRY_STOPPED_SECONDS);
  assert.ok(stopped.error.includes("出处核验失败"));
  assert.ok(stopped.error.includes(MEMORY_RETRY_STOPPED_NOTE));
});

test("同内容同现状复用结算身份，内容或项目现状变化才重新分析", () => {
  const candidates = [
    { sourceKind: "task", sourceId: "task-1", fingerprint: "fp-a" },
    { sourceKind: "document_version", sourceId: "version-1", fingerprint: "fp-b" },
  ];
  const base = projectMemorySettlementId({
    projectId: "project-1",
    projectStatus: "项目现状正文",
    candidates,
  });
  const reordered = projectMemorySettlementId({
    projectId: "project-1",
    projectStatus: "项目现状正文",
    candidates: [...candidates].reverse(),
  });
  assert.equal(reordered, base, "信号顺序不同但内容相同，应复用上次结论而不调用模型");
  const contentChanged = projectMemorySettlementId({
    projectId: "project-1",
    projectStatus: "项目现状正文",
    candidates: [{ ...candidates[0], fingerprint: "fp-c" }, candidates[1]],
  });
  assert.notEqual(contentChanged, base, "候选内容变化必须重新分析");
  const statusChanged = projectMemorySettlementId({
    projectId: "project-1",
    projectStatus: "项目现状已更新",
    candidates,
  });
  assert.notEqual(statusChanged, base, "项目现状变化必须重新分析");
});

test("已有摘要的文档只在非手动重试时直接出队", () => {
  assert.equal(shouldReuseDocumentSummary({ triggerOrigin: "discovery", hasSummary: true }), true);
  assert.equal(
    shouldReuseDocumentSummary({ triggerOrigin: "manual", hasSummary: true }),
    false,
    "手动重试代表要求重新识别，不能跳过",
  );
  assert.equal(
    shouldReuseDocumentSummary({ triggerOrigin: "discovery", hasSummary: false }),
    false,
  );
  assert.equal(
    shouldReuseDocumentSummary({
      triggerOrigin: "discovery",
      hasSummary: true,
      summaryMatchesContent: false,
    }),
    false,
    "同版本原地替换内容后旧摘要不能复用",
  );
  assert.equal(shouldReuseDocumentSummary(), false);
});

test("项目记忆只为项目级信号排队，议题页/文件索引页不触发结算", () => {
  assert.deepEqual([...PROJECT_MEMORY_SIGNAL_KINDS].sort(), [
    "archive",
    "document_version",
    "iteration_context",
    "milestone",
    "task",
  ]);
  for (const kind of ["memory_page", "message"])
    assert.equal(
      PROJECT_MEMORY_SIGNAL_KINDS.includes(kind),
      false,
      `${kind} 不应触发项目记忆结算，否则只会得到零产出并白调模型`,
    );
});

test("窗口自动重试用尽后的收口说明保留失败记录与手动重试入口", () => {
  assert.ok(MEMORY_RETRY_EXHAUSTED_WINDOW_NOTE.includes("手动重试"));
  assert.match(MEMORY_RETRY_EXHAUSTED_WINDOW_NOTE, /失败记录保留/);
});
