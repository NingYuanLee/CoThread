import { test } from "node:test";
import assert from "node:assert/strict";
import { startConversationToolBridge } from "../server/conversation-memory-tools.ts";

const call = async (bridge, name, args) => {
  const response = await fetch(`${bridge.env.COTHREAD_BRIDGE_URL}/tool`, {
    method: "POST",
    headers: { Authorization: `Bearer ${bridge.env.COTHREAD_BRIDGE_TOKEN}` },
    body: JSON.stringify({ name, args }),
  });
  return JSON.parse(JSON.parse(await response.text()));
};

test("关键发言查询默认限定本次迭代，并支持按成员过滤", async () => {
  const statements = [];
  const db = {
    execute: async (sql, params) => {
      statements.push({ sql: String(sql), params });
      if (String(sql).includes("subject_type='utterance'"))
        return [
          [
            {
              id: "page-1",
              title: "周五前给到",
              excerpt: "我会在周五前给到",
              memberId: "member-1",
              subtype: "commitment",
              updatedAt: "2026-11-03 10:00:00",
              threads: "迭代 A",
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "search_statement_memory", { memberId: "member-1" });
    assert.equal(result.scope, "statement");
    assert.equal(result.memberId, "member-1");
    assert.equal(result.threadId, "thread-1");
    assert.equal(result.count, 1);
    assert.equal(result.rows[0].id, "page-1");
    const query = statements.find((item) => item.sql.includes("subject_type='utterance'"));
    assert.ok(query, "应当查询发言记忆");
    assert.deepEqual(query.params.slice(0, 3), ["project-1", "member-1", "thread-1"]);
    assert.match(query.sql, /m\.thread_id=\?/);
  } finally {
    await bridge.close();
  }
});

test("消息查询默认当前迭代，并支持按顺序向前取前文", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("FROM messages m JOIN threads t"))
        return [
          [
            {
              id: "message-2",
              authorId: "member-1",
              author: "成员",
              threadId: "thread-1",
              threadTitle: "迭代 A",
              sequence: 20,
              excerpt: "上周说周五上线",
              createdAt: "2026-11-03 09:00:00",
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: {
      projectId: "project-1",
      threadId: "thread-1",
      firstSequence: "1",
      lastSequence: "9",
      projectOwner: "owner-1",
    },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "search_messages", { beforeSequence: 21 });
    assert.equal(result.threadId, "thread-1");
    assert.equal(result.count, 1);
    assert.equal(result.rows[0].id, "message-2");
    assert.equal(result.nextBeforeSequence, 20);
    let query = queries.find((item) => item.sql.includes("FROM messages m JOIN threads t"));
    assert.ok(query, "应当查询项目消息");
    assert.deepEqual(query.params.slice(0, 3), ["project-1", "thread-1", 21]);
    assert.match(query.sql, /m\.sequence<\?/);
    // 不传 beforeSequence 时默认只取本次窗口之前的内容。
    await call(bridge, "search_messages", { query: "上线" });
    query = queries.filter((item) => item.sql.includes("FROM messages m JOIN threads t")).at(-1);
    assert.ok(query.params.includes(1));
  } finally {
    await bridge.close();
  }
});

test("文件记忆查询按识别状态和关键词过滤并带路径", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("JOIN file_index_entries"))
        return [
          [
            {
              pageId: "page-9",
              title: "需求说明",
              artifactId: "artifact-9",
              folderId: "folder-1",
              versionId: "version-9",
              filename: "需求.md",
              version: 3,
              mime: "text/markdown",
              recognitionStatus: "partial",
              recognitionNote: "图表未覆盖",
              topics: '["需求"]',
              extractedExcerpt: "需求正文",
              updatedAt: "2026-11-03 10:00:00",
            },
          ],
        ];
      if (String(sql).includes("FROM document_folders"))
        return [[{ id: "folder-1", parent_id: null, name: "正式文件" }]];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "search_files", {
      query: "需求",
      recognitionStatus: "partial",
    });
    assert.equal(result.count, 1);
    assert.equal(result.rows[0].pageId, "page-9");
    assert.equal(result.rows[0].path, "正式文件");
    const query = queries.find((item) => item.sql.includes("JOIN file_index_entries"));
    assert.ok(query);
    assert.match(query.sql, /p\.subject_type='document'/);
    assert.ok(query.params.includes("partial"));
    assert.equal(query.params.filter((item) => item === "%需求%").length, 5);
  } finally {
    await bridge.close();
  }
});

test("文件记忆可按 artifactId 读取正文与位置", async () => {
  const db = {
    execute: async (sql) => {
      if (String(sql).includes("p.body body"))
        return [
          [
            {
              pageId: "page-9",
              title: "需求说明",
              body: "## 文件信息\n- 位置：旧路径\n\n## 识别结果\n- 识别部分",
              artifactId: "artifact-9",
              folderId: "folder-1",
              versionId: "version-9",
              filename: "需求.md",
              version: 3,
              mime: "text/markdown",
              recognitionStatus: "partial",
              recognitionNote: "图表未覆盖",
              topics: '["需求"]',
              extractedExcerpt: "需求正文",
            },
          ],
        ];
      if (String(sql).includes("FROM file_index_entries"))
        return [[{ pageId: "page-9", folderId: "folder-1" }]];
      if (String(sql).includes("FROM document_folders"))
        return [[{ id: "folder-1", parent_id: null, name: "正式文件" }]];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "read_file_memory", { artifactId: "artifact-9" });
    assert.equal(result.pageId, "page-9");
    assert.equal(result.version, 3);
    assert.equal(result.filename, "需求.md");
    assert.match(result.text, /位置：正式文件/);
  } finally {
    await bridge.close();
  }
});

test("项目信息包含描述与项目现状摘录", async () => {
  const db = {
    execute: async (sql) => {
      if (String(sql).includes("FROM projects WHERE id=?"))
        return [
          [
            {
              id: "project-1",
              name: "共序",
              description: "项目描述",
              createdAt: "2026-10-01 10:00:00",
              archivedAt: null,
            },
          ],
        ];
      if (String(sql).includes("FROM project_status WHERE project_id=?"))
        return [
          [
            {
              projectId: "project-1",
              body: "## 当前状态\n\n- 当前处于开发阶段",
              updatedAt: "2026-11-03 10:00:00",
            },
          ],
        ];
      if (String(sql).includes("subject_type IN ('project','task')"))
        return [
          [
            {
              pageId: "milestone-1",
              title: "项目进程一",
              subjectType: "project",
              excerpt: "完成第一版",
              updatedAt: "2026-11-03 09:00:00",
            },
            {
              pageId: "task-1",
              title: "任务一",
              subjectType: "task",
              excerpt: "完成登录",
              updatedAt: "2026-11-03 08:00:00",
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "get_project", {});
    assert.equal(result.name, "共序");
    assert.equal(result.description, "项目描述");
    assert.equal(result.status.title, "项目现状");
    assert.match(result.status.excerpt, /开发阶段/);
    assert.equal(result.milestones[0].pageId, "milestone-1");
    assert.equal(result.importantTasks[0].pageId, "task-1");
  } finally {
    await bridge.close();
  }
});

test("迭代查询默认本次迭代并标注背景截断", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("FROM threads WHERE id=?"))
        return [
          [
            {
              id: "thread-1",
              title: "迭代 A",
              background: "背".repeat(7000),
              goal: "目标",
              status: "active",
              createdAt: "2026-11-01 10:00:00",
              archivedAt: null,
            },
          ],
        ];
      if (String(sql).includes("JOIN wiki_page_sources"))
        return [
          [
            {
              pageId: "milestone-1",
              title: "迭代项目进程",
              subjectType: "project",
              excerpt: "本迭代完成 V1",
              updatedAt: "2026-11-02 10:00:00",
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "get_iteration", {});
    assert.equal(result.id, "thread-1");
    assert.equal(result.background.length, 6000);
    assert.equal(result.backgroundTruncated, true);
    assert.equal(result.backgroundTotalChars, 7000);
    assert.equal(result.goal, "目标");
    assert.equal(result.goalTruncated, false);
    assert.equal(result.memories[0].pageId, "milestone-1");
    const query = queries.find((item) => item.sql.includes("FROM threads WHERE id=?"));
    assert.deepEqual(query.params, ["thread-1", "project-1"]);
  } finally {
    await bridge.close();
  }
});

test("迭代列表返回标题、状态与目标背景摘录", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("FROM threads WHERE project_id=?"))
        return [
          [
            {
              id: "thread-1",
              title: "迭代 A",
              status: "active",
              createdAt: "2026-11-01 10:00:00",
              archivedAt: null,
              goalExcerpt: "目标摘录",
              backgroundExcerpt: "背景摘录",
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "list_iterations", { limit: 5 });
    assert.equal(result.count, 1);
    assert.equal(result.rows[0].title, "迭代 A");
    assert.equal(result.rows[0].goalExcerpt, "目标摘录");
    const query = queries.find((item) => item.sql.includes("FROM threads WHERE project_id=?"));
    assert.deepEqual(query.params, ["project-1", 5]);
  } finally {
    await bridge.close();
  }
});

test("通用记忆检索可按记忆种类限定，只查项目进程或主要任务", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("FROM wiki_pages p WHERE") && !String(sql).includes("MATCH"))
        return [
          [
            {
              id: "milestone-1",
              subjectType: "project",
              subtype: "milestone",
              title: "项目进程一",
              body: "完成第一版",
              status: "current",
              sourceFamily: "project_memory",
              aboutUserId: null,
              recallCount: 0,
              updatedAt: "2026-11-03 10:00:00",
              corrected: 0,
            },
          ],
        ];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "search_memory", { subjects: ["project"] });
    assert.equal(result.entries[0].pageId, "milestone-1");
    assert.equal(result.entries[0].subject, "project");
    const query = queries.find(
      (item) => item.sql.includes("subject_type IN (?)") && item.sql.includes("FROM wiki_pages p"),
    );
    assert.ok(query, "应当按记忆种类过滤");
    assert.ok(query.params.includes("project"));
  } finally {
    await bridge.close();
  }
});

test("议题查询按主题过滤并复用记忆检索口径", async () => {
  const queries = [];
  const db = {
    execute: async (sql, params) => {
      queries.push({ sql: String(sql), params });
      if (String(sql).includes("MATCH(title,body) AGAINST"))
        return [
          [
            {
              id: "discussion-1",
              subjectType: "discussion",
              subtype: "requirements",
              title: "上线时间",
              body: "结论是周五上线",
              status: "current",
              sourceFamily: "conversation",
              aboutUserId: null,
              recallCount: 0,
              updatedAt: "2026-11-03 10:00:00",
              corrected: 0,
              score: 1,
            },
          ],
        ];
      if (String(sql).includes("FROM wiki_page_sources")) return [[]];
      return [[]];
    },
  };
  const bridge = await startConversationToolBridge(db, {
    window: { projectId: "project-1", threadId: "thread-1", projectOwner: "owner-1" },
    pages: [],
    stalePages: [],
  });
  try {
    const result = await call(bridge, "search_discussion_memory", { query: "上线时间" });
    assert.equal(result.scope, "discussion");
    assert.ok(Array.isArray(result.entries));
    assert.equal(result.entries[0].pageId, "discussion-1");
    const query = queries.find((item) => item.sql.includes("MATCH(title,body) AGAINST"));
    assert.ok(query, "应当按关键词检索议题");
    assert.match(query.sql, /subject_type IN \(\?\)/);
    assert.equal(query.params[0], "project-1");
    assert.ok(query.params.includes("discussion"));
  } finally {
    await bridge.close();
  }
});
