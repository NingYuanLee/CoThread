import { mergeThread, threadPollCursor } from "./thread-window.js";
import { threadSideStateToken } from "./thread-side-state.js";

// Keep the exact snapshot used for each request. A concurrent local cache
// update may replace the latest object while the response is in flight.
/**
 * @param {any} getPrevious
 * @param {any} load
 */
export async function readThreadPages(getPrevious, load) {
  const previous = getPrevious();
  const after = threadPollCursor(previous);
  /**
   * @param {any} base
   * @param {any} cursor
   */
  const page = async (base, cursor) => {
    let incoming = await load(cursor, threadSideStateToken(base) || "initial");
    try {
      return { incoming, merged: mergeThread(base, incoming) };
    } catch (caught) {
      const error = /** @type {{code?: string}} */ (caught);
      if (error?.code !== "THREAD_SIDE_STATE_MISMATCH") throw caught;
      incoming = await load(cursor, "initial");
      return { incoming, merged: mergeThread(base, incoming) };
    }
  };
  let result = await page(previous, after);
  let cursor = after;
  while (after && result.incoming.page?.hasMore) {
    const next = result.incoming.page.after;
    if (!next || next === cursor) throw new Error("Chat page cursor did not advance");
    cursor = next;
    result = await page(result.merged, cursor);
  }
  return mergeThread(getPrevious(), result.merged);
}
