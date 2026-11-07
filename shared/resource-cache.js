// Bound browser memory and deduplicate polls. Superseded requests may complete
// despite abort, so only the current request may publish a new cache entry.
// update() applies its transform first, then supersedes an older read.
/**
 * @param {number} limit
 * @returns {{
 *   get: (key: string) => any,
 *   cancel: (key: string) => void,
 *   delete: (key: string) => void,
 *   update: (key: string, transform: (value: any) => any) => any,
 *   clear: () => void,
 *   read: (key: string, loader: (signal: AbortSignal) => Promise<any>, force?: boolean) => Promise<any>,
 * }}
 */
export function createResourceCache(limit = 12) {
  if (!Number.isInteger(limit) || limit < 1) {
    throw new RangeError("Resource cache limit must be a positive integer");
  }
  const values = new Map(),
    pending = new Map();
  const superseded = () => new DOMException("Request superseded", "AbortError");
  /**
   * @param {any} key
   */
  const cancel = (key) => {
    const request = pending.get(key);
    pending.delete(key);
    request?.controller.abort();
  };
  /**
   * @param {any} key
   * @param {any} value
   */
  const remember = (key, value) => {
    values.delete(key);
    values.set(key, value);
    while (values.size > limit) values.delete(values.keys().next().value);
    return value;
  };
  return /** @type {any} */ ({
    get: /** @type {(key: string) => any} */ ((key) => values.get(key)),
    cancel,
    delete: /** @type {(key: string) => void} */ (
      (key) => {
        cancel(key);
        values.delete(key);
      }
    ),
    update: /** @type {(key: string, transform: (value: any) => any) => any} */ (
      (key, transform) => {
        const value = transform(values.get(key));
        cancel(key);
        return remember(key, value);
      }
    ),
    clear() {
      for (const key of pending.keys()) cancel(key);
      values.clear();
    },
    read: /** @type {(key: string, loader: (signal: AbortSignal) => Promise<any>, force?: boolean) => Promise<any>} */ (
      (key, loader, force = false) => {
        if (force) cancel(key);
        if (pending.has(key)) return pending.get(key).promise;
        const request = /** @type {{controller: AbortController, promise?: Promise<any>}} */ ({
          controller: new AbortController(),
        });
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
      }
    ),
  });
}
