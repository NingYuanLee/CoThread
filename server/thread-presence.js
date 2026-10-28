/**
 * 一个人同一时间只可能在一条迭代里。
 * 新连接会换掉旧的；旧连接断开时，不能把新连接也清掉。
 * 浏览器窗口在最前面，并且这张卡片是选中的，前端才挂这条连接。
 */
const viewers = new Map();
let nextToken = 1;

export function joinThreadViewing(userId, threadId) {
  if (!userId || !threadId) return () => {};
  const token = nextToken++;
  viewers.set(userId, { threadId, token });
  let left = false;
  return () => {
    if (left) return;
    left = true;
    const current = viewers.get(userId);
    if (current && current.token === token) viewers.delete(userId);
  };
}

export function isViewingThread(userId, threadId) {
  return viewers.get(userId)?.threadId === threadId;
}

export function clearThreadViewing(userId) {
  viewers.delete(userId);
}
