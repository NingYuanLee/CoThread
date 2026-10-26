export const name = "cothread-laoweng-tool-policy";
export const inject = ["tools"];

export function apply(ctx) {
  // 老翁 receives bounded structured input from CoThread. Installed DSH plugins
  // must never expand that authority implicitly.
  ctx.tools.guard((call) =>
    (call.name ?? call.tool?.name ?? "") === "beijing_time" ? undefined : "老翁不允许调用工具",
  );
}
