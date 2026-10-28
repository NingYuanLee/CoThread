import assert from "node:assert/strict";
import test from "node:test";
import { projectActivityKey, sameSnapshot, threadPollKey } from "../shared/poll-signature.js";

test("thread poll key changes when reply progress changes and ignores object identity", () => {
  const thread = {
    id: "t1",
    status: "active",
    title: "迭代",
    messages: [{ id: "m1", sequence: "1", body: "你好", refs: [], quotes: [] }],
    replies: [{ message_id: "m1", status: "running", progress: "读取文件" }],
    page: { hasMore: false, before: "1", after: "1" },
  };
  assert.equal(threadPollKey(thread), threadPollKey({ ...thread, messages: [...thread.messages] }));
  assert.notEqual(
    threadPollKey(thread),
    threadPollKey({
      ...thread,
      replies: [{ message_id: "m1", status: "running", progress: "写入文件" }],
    }),
  );
});

test("project activity key ignores library rows and follows revision", () => {
  const detail = {
    id: "p1",
    name: "项目",
    libraryRevision: "1",
    threads: [
      {
        id: "t1",
        title: "迭代",
        status: "active",
        last_active_at: "2026-10-14 00:00:00",
        creator: "甲",
      },
    ],
    members: [
      {
        id: "u1",
        role: "member",
        name: "甲",
        localExecutor: { online: true, bound: true, lastSeenAt: "2026-10-14 00:00:00" },
      },
    ],
    folders: [{ id: "f1" }],
    versions: [{ id: "v1" }],
  };
  assert.equal(
    projectActivityKey(detail),
    projectActivityKey({ ...detail, folders: [], versions: [] }),
  );
  assert.notEqual(
    projectActivityKey(detail),
    projectActivityKey({ ...detail, libraryRevision: "2" }),
  );
  assert.equal(sameSnapshot([{ id: "a" }], [{ id: "a" }]), true);
  assert.equal(sameSnapshot([{ id: "a" }], [{ id: "b" }]), false);
});

test("iteration metadata and archive decisions refresh without a new message", () => {
  const thread = {
    id: "t1",
    title: "本轮",
    status: "active",
    background: "旧背景",
    goal: "原目标",
    messages: [],
  };
  for (const update of [
    { status: "archiving" },
    { background: "讨论后更新的背景" },
    { goal: "讨论后调整的目标" },
    { archive_snapshot: { conclusion: "人工确认的结论" } },
  ])
    assert.notEqual(threadPollKey(thread), threadPollKey({ ...thread, ...update }));
  const project = { id: "p1", threads: [thread] };
  assert.notEqual(
    projectActivityKey(project),
    projectActivityKey({ ...project, threads: [{ ...thread, goal: "调整后的目标" }] }),
  );
  assert.notEqual(
    projectActivityKey(project),
    projectActivityKey({ ...project, threads: [{ ...thread, unread_mention_count: 2 }] }),
  );
});
