/**
 * 长连接（SSE）登记表。
 * server.close() 只停止接收新连接，不会结束已经建立的 SSE；presence 心跳这类
 * 没有关闭钩子的长连接会把进程排空拖到关闭超时，发布窗口因此从 1 秒变成 20~30 秒。
 * 进程退出前先调用 endSseStreams() 结束它们，再用 closeAllConnections() 兜底。
 */
const streams = new Set();

/** 登记一条 SSE 响应，返回从登记表移除的回调。 */
export function trackSse(res) {
  streams.add(res);
  const done = () => streams.delete(res);
  res.once("close", done);
  res.once("finish", done);
  return () => {
    done();
    res.removeListener("close", done);
    res.removeListener("finish", done);
  };
}

/** 结束所有登记中的 SSE，返回结束的条数；可重复调用。 */
export function endSseStreams() {
  const open = [...streams];
  streams.clear();
  for (const res of open) {
    try {
      if (!res.writableEnded) res.end();
    } catch {
      // 正在断开的连接由 server.closeAllConnections() 兜底。
    }
  }
  return open.length;
}

export function sseStreamCount() {
  return streams.size;
}
