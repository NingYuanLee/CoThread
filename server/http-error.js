/**
 * HTTP 状态错误的共享基元。
 *
 * 放在独立模块是为了让 `server/documents/` 这类领域内核能抛出带状态码的错误，
 * 而不必反向 import 业务门面 `server/service.js`（那会形成循环依赖）。
 * `server/service.js` 继续 re-export 本类，历史调用点无需改动。
 */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
