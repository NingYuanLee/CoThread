import { createUserMessage } from "@deepseek-ai/dsh-llm";
import { cleanLegacyContext } from "../shared/legacy-context.js";

// An idle DSH session forbids tool/result rewrites outside a turn. Replace its
// complete, balanced surface with a lossless text transcript instead. Raw events
// remain in the checkpoint; real multimodal blocks remain multimodal blocks.
export function repairContext(ctx, session) {
  const nodes = [...session.surface.nodes];
  const messages = session.deriveMessages();
  const cleaned = cleanLegacyContext(messages);
  const removed = JSON.stringify(messages).length - JSON.stringify(cleaned).length;
  if (removed <= 0 || !nodes.length) return 0;
  const content = transcriptBlocks(cleaned);
  session.append("compaction/prune", {
    shadowedRange: { start: nodes[0], end: nodes.at(-1) }, shadowedSeqs: nodes,
    shadowedTokenCount: messages.reduce((sum, message) => sum + ctx.tokenMeter.estimateMessage(message), 0),
  });
  session.append("user/message", createUserMessage({ content, source: { kind: "plugin", plugin: "cothread-repair" } }), {
    surfaceOp: { op: "replace", start: nodes[0], end: nodes.at(-1) }, sourceEventSeqs: nodes,
  });
  return removed;
}

export function transcriptBlocks(messages) {
  const content = [{ type: "text", text: "以下是助手已有上下文（包含保留的历史摘要与新消息），仅省略成员头像等资料。梳理讨论直接依据这些内容；聊天记录及文件仍可按 ID 核查。" }];
  const appendBlocks = (blocks) => {
    for (const block of blocks || []) {
      if (block.type === "text") content.push(block);
      else if (block.type === "tool-result") {
        content.push({ type: "text", text: JSON.stringify({ type: block.type, callId: block.callId, isError: block.isError }) });
        appendBlocks(block.content);
      } else if (["image", "audio", "video", "file"].includes(block.type)) content.push(block);
      else content.push({ type: "text", text: JSON.stringify(block) });
    }
  };
  for (const message of messages) {
    content.push({ type: "text", text: JSON.stringify({ role: message.role, source: message.source }) });
    appendBlocks(message.content);
  }
  return content;
}
