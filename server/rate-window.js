export function sweepExpired(map, now = Date.now()) {
  for (const [key, value] of map) if (value.reset <= now) map.delete(key);
}

export function touchWindow(map, key, now, windowMs) {
  sweepExpired(map, now);
  const current = map.get(key);
  const record = !current || current.reset <= now ? { count: 0, reset: now + windowMs } : current;
  record.count += 1;
  map.set(key, record);
  return record;
}
