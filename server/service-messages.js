import { recordMessageActivity } from "./thread-activity.js";
import { attachMessageQuotes } from "./message-quotes.js";
import { markThreadRead as saveThreadRead, threadReadSummary } from "./thread-reads.js";
import {
  AGENT_LAOWENG_PROFILE,
  AGENT_XIAOXIANG_MEMBER,
  AGENT_MEMBER,
  mentionsAgent,
} from "../shared/agent-member.js";
import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.js";
import * as iterationState from "./iteration-state.js";
import { publishWork } from "./work-events.js";
import { queueMemberMemory } from "./project-memory.js";

import { fail, id, title, body, parseMessageRow } from "./service-support.js";

export async function insertMessageOperation(
  service,
  db,
  user,
  threadId,
  text,
  refs = [],
  source = user.kind === "agent" ? "assistant" : user.kind === "api" ? "local_ai" : "human",
  agentTaskId = null,
  messageId = randomUUID(),
  executionTarget = "cloud",
  executionTargetUserId = null,
  folderRefs = [],
  turnId = null,
) {
  if (typeof db.getConnection === "function") {
    return iterationState.withIterationWrite(db, threadId, (conn) =>
      service.insertMessage(
        conn,
        user,
        threadId,
        text,
        refs,
        source,
        agentTaskId,
        messageId,
        executionTarget,
        executionTargetUserId,
        folderRefs,
        turnId,
      ),
    );
  }
  await iterationState.assertIterationWritable(db, threadId);
  const inserted = await query(
    db,
    "INSERT INTO messages(id,thread_id,author_id,source,body,refs,folder_refs,agent_task_id,execution_target,execution_target_user_id,turn_id) VALUES(?,?,?,?,?,?,?,?,?,?,?)",
    [
      messageId,
      threadId,
      user.id,
      source,
      text,
      JSON.stringify(refs),
      JSON.stringify(folderRefs),
      agentTaskId,
      executionTarget,
      executionTargetUserId,
      turnId,
    ],
  );
  await recordMessageActivity(db, messageId);
  if (text && source !== "system") {
    // 项目记忆候选：只排队，不调模型；失败不影响发消息。
    const [signalThread] = await query(db, "SELECT project_id FROM threads WHERE id=?", [threadId]);
    if (signalThread?.project_id) {
      const { noteProjectMemorySignal } = await import("./project-memory.js");
      await noteProjectMemorySignal(
        db,
        signalThread.project_id,
        "message",
        messageId,
        String(text).slice(0, 120),
      ).catch(() => {});
    }
  }
  if (source !== "system") {
    const [thread] = await query(db, "SELECT project_id,title FROM threads WHERE id=?", [threadId]);
    const members = await query(
      db,
      "SELECT u.id,u.name,COALESCE(u.username,u.email) email FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=? AND (?='assistant' OR u.id<>?)",
      [thread.project_id, source, user.id],
    );
    const [author] = await query(db, "SELECT name FROM users WHERE id=?", [user.id]);
    const memoryMembers = new Set([
      ...(source === "human" || source === "local_ai" ? [user.id] : []),
    ]);
    for (const member of members) {
      const escape = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (
        [member.name, member.email].some((value) =>
          new RegExp(`(^|[^\\p{L}\\p{N}_@])@${escape(value)}(?=$|[^\\p{L}\\p{N}_@])`, "u").test(
            text,
          ),
        )
      ) {
        memoryMembers.add(member.id);
        await service.notify(
          db,
          member.id,
          thread.project_id,
          "mention",
          `${source === "assistant" ? AGENT_MEMBER.name : author.name} 在「${thread.title}」中 @了你：${text.slice(0, 500)}`,
          threadId,
          messageId,
          source === "assistant" ? AGENT_MEMBER.name : author.name,
        );
      }
    }
    if (memoryMembers.size)
      await queueMemberMemory(db, thread.project_id, [...memoryMembers], String(inserted.insertId));
  }
  return { id: messageId };
}

export async function markThreadReadOperation(service, user, threadId, input = {}) {
  const thread = await service.thread(user, id.parse(threadId));
  const sequence = z
    .string()
    .regex(/^\d+$/)
    .parse(String(input.sequence || ""));
  await saveThreadRead(service.db, user.id, thread.id, sequence);
  return { ok: true, lastReadSequence: sequence };
}

export async function listMessagesOperation(service, user, threadId, input = {}) {
  await service.thread(user, id.parse(threadId));
  const args = z
    .object({
      limit: z.number().int().min(1).max(100).default(20),
      beforeMessageId: id.optional(),
      afterMessageId: id.optional(),
    })
    .parse(input);
  if (args.beforeMessageId && args.afterMessageId)
    fail(400, "beforeMessageId 与 afterMessageId 不能同时使用");
  const read = await threadReadSummary(service.db, user.id, threadId);
  if (args.afterMessageId) {
    const [anchor] = await query(
      service.db,
      "SELECT sequence FROM messages WHERE id=? AND thread_id=?",
      [args.afterMessageId, threadId],
    );
    if (!anchor) fail(404, "消息不存在于当前会话");
    const [latest] = await query(
      service.db,
      `SELECT id, sequence FROM messages WHERE thread_id=? AND NOT (source='human' AND agent_task_id IS NOT NULL) ORDER BY sequence DESC LIMIT 1`,
      [threadId],
    );
    if (!latest || BigInt(latest.sequence) <= BigInt(anchor.sequence)) {
      return {
        threadId,
        messages: [],
        changed: false,
        read,
        page: {
          hasMore: false,
          beforeMessageId: null,
          afterMessageId: args.afterMessageId,
          latestMessageId: latest?.id || null,
        },
      };
    }
    const rows = await query(
      service.db,
      `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.folder_refs,m.author_id,m.turn_id,u.name author,m.created_at
        FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND NOT (m.source='human' AND m.agent_task_id IS NOT NULL) AND m.sequence>?
        ORDER BY m.sequence ASC LIMIT ?`,
      [threadId, anchor.sequence, args.limit + 1],
    );
    const hasMore = rows.length > args.limit;
    const messages = await attachMessageQuotes(
      service.db,
      rows.slice(0, args.limit).map(parseMessageRow),
    );
    return {
      threadId,
      messages,
      changed: true,
      read,
      page: {
        hasMore,
        beforeMessageId: messages[0]?.id || null,
        afterMessageId: messages.at(-1)?.id || args.afterMessageId,
        latestMessageId: latest.id,
      },
    };
  }
  let sequence;
  if (args.beforeMessageId) {
    const [anchor] = await query(
      service.db,
      "SELECT sequence FROM messages WHERE id=? AND thread_id=?",
      [args.beforeMessageId, threadId],
    );
    if (!anchor) fail(404, "消息不存在于当前会话");
    sequence = anchor.sequence;
  }
  const rows = await query(
    service.db,
    `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.folder_refs,m.author_id,m.turn_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.thread_id=? AND NOT (m.source='human' AND m.agent_task_id IS NOT NULL)${sequence ? " AND m.sequence<?" : ""}
      ORDER BY m.sequence DESC LIMIT ?`,
    [threadId, ...(sequence ? [sequence] : []), args.limit + 1],
  );
  const hasMore = rows.length > args.limit;
  const messages = await attachMessageQuotes(
    service.db,
    rows.slice(0, args.limit).reverse().map(parseMessageRow),
  );
  return {
    threadId,
    messages,
    read,
    page: { hasMore, beforeMessageId: messages[0]?.id || null },
  };
}

export async function readMessageOperation(service, user, threadId, messageId, before = 0) {
  await service.thread(user, id.parse(threadId));
  id.parse(messageId);
  z.number().int().min(0).max(20).parse(before);
  const [row] = await query(
    service.db,
    `SELECT m.id,m.thread_id,m.sequence,m.source,m.body,m.refs,m.folder_refs,m.author_id,m.turn_id,u.name author,m.created_at
      FROM messages m JOIN users u ON u.id=m.author_id WHERE m.id=? AND m.thread_id=?`,
    [messageId, threadId],
  );
  if (!row) fail(404, "消息不存在于当前会话");
  const [message] = await attachMessageQuotes(service.db, [parseMessageRow(row)]);
  const previous = before
    ? (await service.listMessages(user, threadId, { beforeMessageId: messageId, limit: before }))
        .messages
    : [];
  return { message, previous };
}

export async function conversationMembersOperation(service, user, projectId, memberId) {
  await service.member(user, id.parse(projectId));
  if (memberId === AGENT_MEMBER.id)
    return {
      id: AGENT_MEMBER.id,
      name: AGENT_LAOWENG_PROFILE.nickname,
      role: AGENT_MEMBER.role,
      kind: "laoweng",
      identity_tags: ["知识管理员"],
    };
  if (memberId === AGENT_XIAOXIANG_MEMBER.id)
    return {
      id: AGENT_XIAOXIANG_MEMBER.id,
      name: AGENT_XIAOXIANG_MEMBER.name,
      role: AGENT_XIAOXIANG_MEMBER.role,
      kind: "xiaoxiang",
      identity_tags: AGENT_XIAOXIANG_MEMBER.identity_tags,
    };
  if (memberId) id.parse(memberId);
  const rows = await query(
    service.db,
    `SELECT u.id,u.name,m.role${memberId ? ",u.motto,u.identity_tags" : ""}
      FROM members m JOIN users u ON u.id=m.user_id WHERE m.project_id=?${memberId ? " AND u.id=?" : ""} ORDER BY u.name,u.id`,
    [projectId, ...(memberId ? [memberId] : [])],
  );
  if (memberId) {
    if (!rows.length) fail(404, "成员不属于当前项目");
    return { ...rows[0], kind: "human" };
  }
  return [
    ...rows.map((row) => ({ ...row, kind: "human" })),
    {
      id: AGENT_XIAOXIANG_MEMBER.id,
      name: AGENT_XIAOXIANG_MEMBER.name,
      role: AGENT_XIAOXIANG_MEMBER.role,
      kind: "xiaoxiang",
    },
  ];
}

export async function postMessageOperation(service, user, threadId, input) {
  const data = z
    .object({
      body,
      refs: z.array(id).max(30).default([]),
      folderRefs: z.array(id).max(30).default([]),
      quoteIds: z.array(id).max(10).default([]),
      clientMessageId: id.optional(),
      mentionAgent: z.boolean().default(false),
      dialogueMode: z.enum(["default", "chat", "miniprogram", "cloudbase"]).default("default"),
      files: z
        .array(
          z.object({
            title,
            filename: z.string().min(1).max(200),
            mime: z.string().max(200).optional(),
            contentBase64: z.string().max(7_000_000),
            sha256: z.string().optional(),
            folderId: id.nullable().optional(),
          }),
        )
        .max(10)
        .default([]),
    })
    .parse(input);
  if (data.dialogueMode === "chat")
    fail(400, "有问必答已改为项目里和老翁的私聊，群聊不能再选这个模式");
  if (data.refs.length + data.files.length > 30)
    fail(400, "一条消息最多关联 30 个文档版本（含上传文件）");
  if (
    data.files.reduce((sum, file) => sum + Buffer.from(file.contentBase64, "base64").length, 0) >
    20 * 1024 * 1024
  )
    fail(413, "一条消息的文件总大小不能超过 20 MiB");
  const text =
    data.mentionAgent && !mentionsAgent(data.body)
      ? `@${AGENT_MEMBER.name} ${data.body}`
      : data.body;
  body.parse(text);
  const result = await transaction(service.db, async (db) => {
    const thread = await service.thread(user, threadId, true, db);
    if (data.clientMessageId) {
      const [existing] = await query(
        db,
        "SELECT id,thread_id,author_id,source FROM messages WHERE id=?",
        [data.clientMessageId],
      );
      if (existing) {
        if (
          existing.thread_id !== threadId ||
          existing.author_id !== user.id ||
          existing.source !== "human"
        )
          fail(409, "消息标识已被占用");
        return { id: existing.id, duplicate: true };
      }
    }
    await service.refs(db, thread.project_id, data.refs);
    const folderRefs = [...new Set(data.folderRefs)];
    await service.folderRefs(db, thread.project_id, folderRefs);
    const quoteIds = [...new Set(data.quoteIds)];
    if (quoteIds.length) {
      const quoted = await query(
        db,
        `SELECT id FROM messages WHERE thread_id=? AND id IN (${quoteIds.map(() => "?").join(",")})`,
        [threadId, ...quoteIds],
      );
      if (quoted.length !== quoteIds.length) fail(400, "只能引用当前会话中存在的消息");
    }
    const files = [];
    for (const file of data.files) {
      files.push(
        await service.submitVersion(user, threadId, file, undefined, undefined, false, {
          db,
          silent: true,
        }),
      );
    }
    const refs = [...new Set([...data.refs, ...files.map((file) => file.id)])];
    const message = await service.insertMessage(
      db,
      user,
      threadId,
      text,
      refs,
      undefined,
      null,
      data.clientMessageId,
      "cloud",
      null,
      folderRefs,
    );
    for (const quotedId of quoteIds)
      await query(db, "INSERT INTO message_quotes(message_id,quoted_message_id) VALUES(?,?)", [
        message.id,
        quotedId,
      ]);
    if (user.kind === "session" || (user.kind === "api" && mentionsAgent(text))) {
      // MCP is one account capability regardless of which client wrote the config.
      // For audit and task attribution, an online connector bound to service project
      // makes the current API message connector-originated automatically.
      let interactionSource = user.kind === "api" ? "mcp" : null;
      if (user.kind === "api") {
        const [onlineConnector] = await query(
          db,
          `SELECT c.id FROM local_executors c
            JOIN local_executor_projects cp ON cp.local_executor_id=c.id AND cp.project_id=?
            WHERE c.user_id=? AND c.revoked_at IS NULL
              AND c.last_seen_at>DATE_SUB(UTC_TIMESTAMP(3),INTERVAL 45 SECOND) LIMIT 1`,
          [thread.project_id, user.id],
        );
        if (onlineConnector) interactionSource = "connector_mcp";
      }
      await query(
        db,
        "INSERT INTO agent_requests(message_id,interaction_source,dialogue_mode) VALUES(?,?,?)",
        [message.id, interactionSource, data.dialogueMode],
      );
      if (mentionsAgent(text)) {
        // postMessage already holds the discussion row lock. Completion and
        // dispatch use the same lock, so an update cannot fall between tasks.
        const [existing] = await query(
          db,
          `SELECT r.message_id FROM assistant_replies r JOIN messages m ON m.id=r.message_id
             WHERE m.thread_id=? AND m.author_id=? AND r.status IN ('queued','running')
             AND r.participation='reply' ORDER BY m.sequence LIMIT 1`,
          [threadId, user.id],
        );
        if (existing) {
          await query(
            db,
            "INSERT INTO agent_task_updates(message_id,task_message_id) VALUES(?,?)",
            [message.id, existing.message_id],
          );
          return {
            ...message,
            refs,
            folder_refs: folderRefs,
            files,
            updatedTaskId: existing.message_id,
          };
        }
      }
      // Agent is a built-in member, so only real project memberships are
      // stored here. Other members count even when they have not spoken.
      const others = await query(
        db,
        "SELECT user_id FROM members WHERE project_id=? AND user_id<>? LIMIT 1",
        [thread.project_id, user.id],
      );
      const forceReply = data.dialogueMode === "chat" || mentionsAgent(text) || !others.length;
      await query(db, "INSERT INTO assistant_replies(message_id,participation) VALUES(?,?)", [
        message.id,
        forceReply ? "reply" : "pending",
      ]);
    }
    return { ...message, refs, folder_refs: folderRefs, files };
  });
  publishWork(service.db, threadId);
  // Return the committed chat row and receipt so the sender can render them
  // immediately, without waiting for a separate workspace refresh.
  const [saved] = await query(
    service.db,
    `SELECT m.sequence,m.body,m.source,m.execution_target,m.created_at,u.name author,m.author_id,
      q.status request_status,r.participation FROM messages m JOIN users u ON u.id=m.author_id
      LEFT JOIN agent_requests q ON q.message_id=m.id LEFT JOIN assistant_replies r ON r.message_id=m.id
      WHERE m.id=?`,
    [result.id],
  );
  return { ...result, ...saved };
}
