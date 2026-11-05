import { z } from "zod/v3";
import { MEMORY_SUBTYPES } from "../shared/memory-taxonomy.js";
import type { ZodTypeAny } from "zod/v3";

// A model result is only a proposal. In particular, a valid source ID does not
// prove that a source supports a claim; the caller must verify that separately.
const uuid = z.string().uuid();
const sources = z.array(uuid).min(1).max(20);

/** zod 的 enum 需要非空元组；共享常量是只读数组，这里展开一份。 */
function enumOf(values: readonly string[]): z.ZodEnum<[string, ...string[]]> {
  return z.enum([...values] as [string, ...string[]]);
}

const statement = z.object({
  pageId: uuid.optional(),
  correctsPageId: uuid.optional(),
  memberId: uuid,
  subtype: enumOf(MEMORY_SUBTYPES.utterance),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(6000),
  sourceIds: sources,
});
const discussion = z.object({
  pageId: uuid.optional(),
  observationId: uuid.optional(),
  subtype: enumOf(MEMORY_SUBTYPES.discussion),
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().min(1).max(6000),
  stage: z.enum(["pending", "discussing", "concluded", "deferred"]),
  sourceIds: sources,
});
export const observationSchema = z.object({
  question: z.string().trim().min(1).max(500),
  sourceIds: sources,
});

export const conversationMemoryResultSchema = z.object({
  statements: z.array(statement).max(50),
  discussions: z.array(discussion).max(50),
});

/** 校验上下文里的消息与页面。 */
export type MemoryValidationContext = {
  messages: Array<{ id: string; authorId?: string }>;
  pages: Array<{ id: string; subjectType?: string; aboutUserId?: string }>;
};

/** 校验结果：通过的条目、被拒条目（带原因，便于重试）。 */
export type CheckedMemoryResult = {
  statements: unknown[];
  discussions: unknown[];
  rejected: Array<{ kind: string; index: number; reason: string; candidate: unknown }>;
};

/** Validate each output independently, preserving rejected items for retry. */
export function validateConversationMemoryResult(
  result: unknown,
  { messages, pages }: MemoryValidationContext,
): CheckedMemoryResult {
  const parsedResult = result as { statements?: unknown; discussions?: unknown } | null;
  if (
    !parsedResult ||
    !Array.isArray(parsedResult.statements) ||
    !Array.isArray(parsedResult.discussions)
  )
    throw new Error("联合分析结果缺少关键发言或核心议题数组");
  const messageById = new Map(messages.map((message) => [message.id, message]));
  const pageById = new Map(pages.map((page) => [page.id, page]));
  const checked: CheckedMemoryResult = { statements: [], discussions: [], rejected: [] };
  const candidates: Array<[string, ZodTypeAny]> = [
    ["statements", statement],
    ["discussions", discussion],
  ];
  for (const [kind, schema] of candidates) {
    const list = (parsedResult as Record<string, unknown[]>)[kind];
    if (list.length > 50) throw new Error(`${kind} 超过单次候选上限`);
    for (const [index, value] of list.entries()) {
      const parsed = schema.safeParse(value);
      let reason: string | null = parsed.success ? null : "格式不合格";
      const item = parsed.success
        ? (parsed.data as {
            sourceIds: string[];
            memberId: string;
            pageId?: string;
            correctsPageId?: string;
          })
        : null;
      if (item && item.sourceIds.some((id) => !messageById.has(id)))
        reason = "出处不在已核验上下文中";
      if (
        item &&
        kind === "statements" &&
        !item.sourceIds.some((id) => messageById.get(id)?.authorId === item.memberId)
      )
        reason = "关键发言缺少该成员的消息出处";
      if (item?.pageId) {
        const page = pageById.get(item.pageId);
        const subject = kind === "statements" ? "utterance" : "discussion";
        if (
          !page ||
          page.subjectType !== subject ||
          (subject === "utterance" && page.aboutUserId !== item.memberId)
        )
          reason = "更新目标不存在或不属于对应对象";
      }
      if (item?.correctsPageId) {
        const original = pageById.get(item.correctsPageId);
        if (
          !original ||
          original.subjectType !== "utterance" ||
          original.aboutUserId !== item.memberId
        )
          reason = "纠正关系必须指向同一发言者已有发言";
      }
      if (reason) checked.rejected.push({ kind, index, reason, candidate: value });
      else if (kind === "statements") checked.statements.push(item);
      else checked.discussions.push(item);
    }
  }
  return checked;
}
