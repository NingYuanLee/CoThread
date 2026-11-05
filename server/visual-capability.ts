/** 视觉验收被跳过时的说明，写进作业结果供界面展示。 */
export type VisualSkipResult = {
  skipped: true;
  reason: "model_no_image_input";
  scope: string;
  message: string;
};

export function visualVerificationEnabled(
  scope: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const key = `${String(scope || "").toUpperCase()}_MODEL_VISION`;
  const value = env[key] ?? env.COTHREAD_MODEL_VISION;
  if (value == null || value === "") return true;
  return !["0", "false", "no", "off", "text-only"].includes(String(value).trim().toLowerCase());
}

export function visualVerificationSkip(
  scope: string,
  // 保留第二个参数与 visualVerificationEnabled 对齐，便于调用方统一传 env。
  _env: NodeJS.ProcessEnv = process.env,
): VisualSkipResult {
  return {
    skipped: true,
    reason: "model_no_image_input",
    scope,
    message: "当前模型未声明图片输入能力，已跳过视觉验收。",
  };
}
