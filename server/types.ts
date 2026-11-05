import type { Pool, PoolConnection } from "mysql2/promise";

/**
 * 一次数据库调用的连接。
 *
 * 传入 `Pool` 表示语句自动提交；传入 `PoolConnection`（事务内）表示受外层
 * 事务控制，提交与回滚由 `transaction()` 负责。两者在 `query()` / `execute()`
 * 上的接口一致，调用方不需要区分，所以统一收成这一个类型。
 */
export type Db = Pool | PoolConnection;

/** SQL 参数数组。mysql2 允许的类型很宽，这里只约束成数组形状。 */
export type SqlParams = readonly unknown[];

/** 登录身份：由 `authenticate` 中间件挂在请求上。 */
export type RequestUser = {
  id: string;
  /** session 是浏览器登录，api 是账号令牌。 */
  kind: "session" | "api";
  name?: string | null;
  username?: string | null;
  credential_id: string | null;
  scope: unknown;
  [field: string]: unknown;
};

declare global {
  namespace Express {
    interface Request {
      /** 鉴权中间件挂上；未经过鉴权的路由不读它。 */
      user: RequestUser;
    }
  }
}
