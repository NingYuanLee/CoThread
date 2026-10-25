import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { cleanLegacyContext } from "../shared/legacy-context.js";

// One transcript chunk carries roughly this many characters (~6K tokens at the
// 4-chars-per-token heuristic). Chunks are surface nodes, and DSH's idle
// compaction (compactNow) only selects a range when the surface holds at least
// three nodes, so a single flattened message makes 立即压缩 a no-op.
const CHUNK_CHARS = 24_000;
// Flush before a message would overflow only once the chunk is worth keeping,
// so boundaries stay near message boundaries instead of splitting every turn.
const CHUNK_MIN_FILL = 0.4;
const INTRO =
  "以下是助手已有上下文（包含保留的历史摘要与新消息），仅省略成员头像等资料。梳理讨论直接依据这些内容；聊天记录及文件仍可按 ID 核查。";
const CONTINUED = "（以下是更早上下文的分段续文）";

// An idle DSH session forbids tool/result rewrites outside a turn. Replace its
// complete, balanced surface with a lossless text transcript instead. Raw events
// remain in the checkpoint; real multimodal blocks remain multimodal blocks.
export function repairContext(ctx, session) {
  const nodes = [...session.surface.nodes];
  const messages = session.deriveMessages();
  const cleaned = cleanLegacyContext(messages);
  const removed = JSON.stringify(messages).length - JSON.stringify(cleaned).length;
  if (removed <= 0 || !nodes.length) return 0;
  // DSH 0.2 keeps the system prompt as the surface's first `system/message` node,
  // and only a `system/message` may rewrite it. Leave that head in place and
  // replace the legacy body beneath it.
  const head = session.eventAt(nodes[0])?.type === "system/message" ? 1 : 0;
  const replaceable = nodes.slice(head);
  if (!replaceable.length) return 0;
  const chunks = transcriptChunks(cleaned);
  // The prune may shadow only the body this repair replaces: the system head is
  // protected, and a shadowed span naming it makes DSH reject the stored log as
  // corrupt on the next resume.
  session.append("compaction/prune", {
    shadowedRange: { start: replaceable[0], end: replaceable.at(-1) },
    shadowedSeqs: replaceable,
    shadowedTokenCount: messages.reduce(
      (sum, message) => sum + ctx.tokenMeter.estimateMessage(message),
      0,
    ),
  });
  const [first, ...rest] = chunks;
  session.append(
    "user/message",
    createUserMessage({ content: first, source: { kind: "plugin:cothread-repair" } }),
    {
      surfaceOp: { op: "replace", startSeq: replaceable[0], endSeq: replaceable.at(-1) },
      sourceEventSeqs: replaceable,
    },
  );
  for (const chunk of rest) {
    session.append(
      "user/message",
      createUserMessage({ content: chunk, source: { kind: "plugin:cothread-repair" } }),
      { surfaceOp: "append" },
    );
  }
  return removed;
}

export function transcriptBlocks(messages) {
  const content = [{ type: "text", text: INTRO }];
  for (const message of messages) for (const [block] of messageBlocks(message)) content.push(block);
  return content;
}

export function transcriptChunks(messages, budgetChars = CHUNK_CHARS) {
  const chunks = [];
  let current = [textBlock(INTRO)];
  let size = INTRO.length;
  const flush = () => {
    if (current.length) chunks.push(current);
    current = [textBlock(CONTINUED)];
    size = CONTINUED.length;
  };
  for (const message of messages) {
    const blocks = messageBlocks(message);
    const messageSize = blocks.reduce((sum, entry) => sum + entry[1], 0);
    // A whole message that fits under half a chunk stays together; anything
    // larger is split at block boundaries so one huge tool result cannot become
    // the only body node again.
    const atomic = messageSize <= budgetChars / 2;
    if (size + messageSize > budgetChars && size > budgetChars * CHUNK_MIN_FILL) flush();
    for (const [block, blockSize] of blocks) {
      if (!atomic && size + blockSize > budgetChars && size > budgetChars * CHUNK_MIN_FILL) flush();
      current.push(block);
      size += blockSize;
    }
  }
  if (current.length > 1) chunks.push(current);
  return chunks;
}

function textBlock(text) {
  return { type: "text", text };
}

function blockChars(block) {
  return JSON.stringify(block).length;
}

/** Lossless block list for one message: role header first, then its content. */
function messageBlocks(message) {
  const blocks = [[textBlock(JSON.stringify({ role: message.role, source: message.source })), 0]];
  const appendBlocks = (source) => {
    for (const block of source || []) {
      if (block.type === "text") blocks.push([block, blockChars(block)]);
      else if (block.type === "tool-result") {
        const head = { type: block.type, callId: block.callId, isError: block.isError };
        blocks.push([textBlock(JSON.stringify(head)), 0]);
        appendBlocks(block.content);
      } else if (["image", "audio", "video", "file"].includes(block.type)) {
        blocks.push([block, blockChars(block)]);
      } else blocks.push([textBlock(JSON.stringify(block)), 0]);
    }
  };
  appendBlocks(message.content);
  return blocks.map(([block, size]) => [block, size || blockChars(block)]);
}
