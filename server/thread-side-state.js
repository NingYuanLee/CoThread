import { createHash } from "node:crypto";
import { THREAD_SIDE_COLLECTIONS } from "../shared/thread-side-state.js";

// Opt-in wire optimization only: compute from the actual authorized snapshot,
// so every writer and removal is covered without a separate invalidation cache.
export function projectThreadSideState(context, user, requested, projection) {
  if (typeof requested !== "string") return context;
  const token =
    "s1:" +
    createHash("sha256")
      .update(
        JSON.stringify({
          scope: [user.id, user.kind, user.scope || null, context.id, projection],
          sides: THREAD_SIDE_COLLECTIONS.map((key) => context[key]),
        }),
      )
      .digest("base64url");
  if (requested !== token) return { ...context, sideState: { mode: "snapshot", token } };
  return {
    ...context,
    ...Object.fromEntries(THREAD_SIDE_COLLECTIONS.map((key) => [key, []])),
    sideState: { mode: "unchanged", token },
  };
}
