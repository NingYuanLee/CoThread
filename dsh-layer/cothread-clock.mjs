import { defineTool } from "@deepseek-ai/dsh-tools";
import { beijingNow } from "../shared/beijing-time.js";

export const name = "cothread-clock";
export const inject = ["tools"];
export const BEIJING_TIME_TOOL = "beijing_time";

export function apply(ctx) {
  ctx.tools.register(
    defineTool({
      name: BEIJING_TIME_TOOL,
      description:
        "返回当前北京时间（Asia/Shanghai），包含日期、时刻和星期。被问到现在几点、今天几号或星期几时调用。不要自己编造时刻，也不要换算成别的时区。",
      parameters: {},
      output: {
        schema: { type: "string" },
        render: (_args, value) => [{ type: "text", text: String(value) }],
      },
      async execute() {
        return beijingNow();
      },
    }),
  );
}
