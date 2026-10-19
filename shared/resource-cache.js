// Bound browser memory and deduplicate polls. Superseded requests may complete
// despite abort, so only the current request may publish a new cache entry.
// update() applies its transform first, then supersedes an older read.
export function createResourceCache(limit = 12) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Resource cache limit must be a positive integer");
  }
  const values = new Map(),
    pending = new Map();
  const superseded = () => new DOMException("Request superseded", "AbortError");
  const cancel = (key) => {
    const request = pending.get(key);
    pending.delete(key);
    request?.controller.abort();
  };
  const remember = (key, value) => {
    values.delete(key);
    values.set(key, value);
    while (values.size > limit) values.delete(values.keys().next().value);
    return value;
  };
  return {
    get: (key) => values.get(key),
    cancel,
    delete(key) {
      cancel(key);
      values.delete(key);
    },
    update(key, transform) {
      const value = transform(values.get(key));
      cancel(key);
      return remember(key, value);
    },
    clear() {
      for (const key of pending.keys()) cancel(key);
      values.clear();
    },
    read(key, loader, force = false) {
      if (force) cancel(key);
      if (pending.has(key)) return pending.get(key).promise;
      const request = { controller: new AbortController() };
      request.promise = Promise.resolve()
        .then(() => {
          if (pending.get(key) !== request) throw superseded();
          return loader(request.controller.signal);
        })
        .then((value) => {
          if (pending.get(key) !== request) throw superseded();
          return remember(key, value);
        })
        .catch((error) => {
          if (pending.get(key) !== request) throw superseded();
          if ([401, 403, 404].includes(error.status)) values.delete(key);
          throw error;
        })
        .finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        });
      pending.set(key, request);
      return request.promise;
    },
  };
}
