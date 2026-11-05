/** 一个键的窗口记录：窗口内已计数，`reset` 之后窗口重开。 */
export type WindowRecord = { count: number; reset: number };

export function sweepExpired(map: Map<string, WindowRecord>, now: number = Date.now()): void {
  for (const [key, value] of map) if (value.reset <= now) map.delete(key);
}

export function touchWindow(
  map: Map<string, WindowRecord>,
  key: string,
  now: number,
  windowMs: number,
): WindowRecord {
  sweepExpired(map, now);
  const current = map.get(key);
  const record = !current || current.reset <= now ? { count: 0, reset: now + windowMs } : current;
  record.count += 1;
  map.set(key, record);
  return record;
}
