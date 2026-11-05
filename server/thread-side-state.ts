import { createHash } from "node:crypto";
import { THREAD_SIDE_COLLECTIONS } from "../shared/thread-side-state.js";

/** 生成侧状态指纹时用到的身份字段。 */
export type SideStateUser = { id: string; kind?: string | null; scope?: string | null };

// Opt-in wire optimization only: compute from the actual authorized snapshot,
// so every writer and removal is covered without a separate invalidation cache.
export function projectThreadSideState(
  context: Record<string, unknown>,
  user: SideStateUser,
  requested: unknown,
  projection: unknown,
): Record<string, unknown> {
  if (typeof requested !== "string") return context;
  const keys = THREAD_SIDE_COLLECTIONS as string[];
  const token =
    "s1:" +
    createHash("sha256")
      .update(
        JSON.stringify({
          scope: [user.id, user.kind, user.scope || null, context.id, projection],
          sides: keys.map((key) => context[key]),
        }),
      )
      .digest("base64url");
  if (requested !== token) return { ...context, sideState: { mode: "snapshot", token } };
  return {
    ...context,
    ...Object.fromEntries(keys.map((key) => [key, []])),
    sideState: { mode: "unchanged", token },
  };
}
