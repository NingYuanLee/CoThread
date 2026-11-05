/** 事件条目：只保留执行状态，不回放工具的输入输出。 */
type ModelEvent = { [field: string]: unknown };

// Models only need member names, IDs and roles. Keep UI profile details at the
// browser boundary, including when reading older archived discussions.
function minimalMemberContext(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(minimalMemberContext);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([key]) => !["avatar", "author_avatar"].includes(key))
      .map(([key, item]) => [
        key,
        key === "members" && Array.isArray(item)
          ? item.map(({ id, name, role, kind }) => ({ id, name, role, ...(kind ? { kind } : {}) }))
          : minimalMemberContext(item),
      ]),
  );
}

/** 交给模型的项目上下文：去掉头像等界面字段。 */
export function modelProject(project: unknown): unknown {
  return minimalMemberContext(project);
}

/** 交给模型的讨论上下文：去掉用量与工具细节，事件只留状态。 */
export function modelDiscussion(context: Record<string, unknown>): unknown {
  const { contextUsage, events, ...discussion } = context;
  const list = Array.isArray(events) ? (events as ModelEvent[]) : [];
  return minimalMemberContext({
    ...discussion,
    // Raw inputs/outputs can embed earlier contexts (including legacy avatars).
    // Return execution status without recursively replaying tool transcripts.
    events: list.map(({ id, message_id, tool, status, created_at, finished_at }) => ({
      id,
      message_id,
      tool,
      status,
      created_at,
      finished_at,
    })),
  });
}
