// Bound browser memory and deduplicate polls. Superseded requests may complete
// despite abort, so only the current request may publish a new cache entry.
export function createResourceCache(limit = 12) {
  const values = new Map(), pending = new Map();
  const cancel = (key) => {
    const request = pending.get(key);
    pending.delete(key);
    request?.controller.abort();
  };
  return {
    get: (key) => values.get(key),
    cancel,
    update(key, transform) {
      const value = transform(values.get(key));
      values.set(key, value);
      return value;
    },
    clear() {
      for (const key of pending.keys()) cancel(key);
      values.clear();
    },
    read(key, loader, force = false) {
      if (force) cancel(key);
      if (pending.has(key)) return pending.get(key).promise;
      const request = { controller: new AbortController() };
      request.promise = Promise.resolve().then(() => loader(request.controller.signal))
        .then((value) => {
          if (pending.get(key) !== request) throw new DOMException("Request superseded", "AbortError");
          if (pending.get(key) === request) {
            values.delete(key);
            values.set(key, value);
            while (values.size > limit) values.delete(values.keys().next().value);
          }
          return value;
        }).catch((error) => {
          if (pending.get(key) === request && [401, 403, 404].includes(error.status)) values.delete(key);
          throw error;
        }).finally(() => {
          if (pending.get(key) === request) pending.delete(key);
        });
      pending.set(key, request);
      return request.promise;
    },
  };
}
