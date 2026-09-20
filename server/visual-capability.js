export function visualVerificationEnabled(scope, env = process.env) {
  const key = `${String(scope || "").toUpperCase()}_MODEL_VISION`;
  const value = env[key] ?? env.COTHREAD_MODEL_VISION;
  if (value == null || value === "") return true;
  return !["0", "false", "no", "off", "text-only"].includes(String(value).trim().toLowerCase());
}

export function visualVerificationSkip(scope, env = process.env) {
  return {
    skipped: true,
    reason: "model_no_image_input",
    scope,
    message: "当前模型未声明图片输入能力，已跳过视觉验收。",
  };
}
