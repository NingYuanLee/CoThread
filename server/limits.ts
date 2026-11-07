/**
 * 分页条数收口。
 *
 * MySQL 的 LIMIT 只接受整数：字符串拼接 "LIMIT 10.5" 报 ER_PARSE_ERROR，
 * 走占位符的参数化路径传小数报 ER_WRONG_ARGUMENTS，两者最终都被上层错误
 * 处理映射成 500。查询串里的 limit 由路由层原样透传（Number("10.5") = 10.5），
 * 所以服务端在拼 SQL 前统一取整。
 *
 * 注意：`server/cloudbase.ts` 里还有一个语义不同的私有同名函数 clampLimit
 * （<=0 回落 fallback、Math.floor、用于 CloudBase 查询而不是 MySQL LIMIT），
 * 两者不要混用，也不要合并。
 */

/**
 * 把外部传入的 limit 收敛成 [min, max] 区间内的整数。
 *
 * - 非法值（null / undefined / NaN / Infinity / 非数字）回落到 def
 * - 合法的小数向下截断（10.5 → 10）
 * - 越界值夹到 min / max（999 → max）
 * - 0 落到 min 而不是 def：0 条没有业务含义，按「页大小」的下限处理，
 *   不回落到默认条数。
 */
export function clampLimit(value: unknown, def: number, min: number, max: number): number {
  const raw =
    value === null || value === undefined
      ? Number.NaN
      : typeof value === "number"
        ? value
        : Number(value);
  const fallback = Number.isFinite(def) ? Math.trunc(def) : min;
  const base = Number.isFinite(raw) ? Math.trunc(raw) : fallback;
  if (base < min) return min;
  if (base > max) return max;
  return base;
}
