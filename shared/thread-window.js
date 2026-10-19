import { rememberThreadSideState, restoreThreadSideState } from "./thread-side-state.js";

// Only fetched server pages advance the poll cursor. Local sends may already
// have higher sequences while a concurrent member's message remains unseen.
export function threadPollCursor(thread) {
  return thread?.page?.after || undefined;
}

export function mergeThread(previous, incoming, older = false) {
  incoming = restoreThreadSideState(previous, incoming);
  if (!previous) return rememberThreadSideState(incoming);
  const messageMap = new Map(previous.messages.map((item) => [item.id, item]));
  for (const item of incoming.messages) {
    const optimisticKey = `optimistic:${item.id}`;
    const optimistic = messageMap.get(optimisticKey);
    if (optimistic) {
      messageMap.delete(optimisticKey);
      messageMap.set(item.id, { ...item, render_key: optimisticKey });
      continue;
    }
    const local = messageMap.get(item.id);
    messageMap.set(item.id, local?.render_key ? { ...item, render_key: local.render_key } : item);
  }
  const messages = [...messageMap.values()].sort((a, b) => {
    const left = BigInt(a.sequence),
      right = BigInt(b.sequence);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const page = older
    ? incoming.page
      ? { ...incoming.page, after: previous.page?.after ?? null }
      : previous.page
    : previous.page
      ? { ...previous.page, after: incoming.page?.after ?? previous.page.after }
      : incoming.page;
  return rememberThreadSideState({
    ...(older ? previous : incoming),
    messages,
    events: [...new Map([...previous.events, ...incoming.events].map((e) => [e.id, e])).values()],
    page,
  });
}
