export const name = "cothread-l1-tool-policy";
export const inject = ["tools"];

export function apply(ctx) {
  // L1 receives bounded structured input from CoThread. Installed DSH plugins
  // must never expand that authority implicitly.
  ctx.tools.guard(() => "一级小祥不允许调用工具");
}
