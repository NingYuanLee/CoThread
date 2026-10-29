export const DIALOGUE_MODES = ["default", "chat", "miniprogram", "cloudbase"];
export const SELECTABLE_DIALOGUE_MODES = DIALOGUE_MODES.filter((mode) => mode !== "chat");

export const DIALOGUE_MODE_LABELS = {
  default: "自由发言",
  chat: "有问必答",
  miniprogram: "小程序开发",
  cloudbase: "CloudBase开发",
};

/** Icon names match `web/ui-icon` UiIconName. */
export const DIALOGUE_MODE_UI = {
  default: {
    icon: "messageCircle",
    accent: "#6f7f93",
    surface: "#eef2f6",
    label: DIALOGUE_MODE_LABELS.default,
    summary: "默认 @ 与参与规则",
  },
  chat: {
    icon: "messageQuestion",
    accent: "#e8590c",
    surface: "#fff1e6",
    label: DIALOGUE_MODE_LABELS.chat,
    summary: "必回，仅只读查询",
  },
  miniprogram: {
    icon: "miniprogram",
    accent: "#07a85a",
    surface: "#e7f8ee",
    label: DIALOGUE_MODE_LABELS.miniprogram,
    summary: "只做小程序，不用 CloudBase",
  },
  cloudbase: {
    icon: "cloud",
    accent: "#2a7fd4",
    surface: "#e8f3fc",
    label: DIALOGUE_MODE_LABELS.cloudbase,
    summary: "联动 CloudBase 侧栏",
  },
};

export const RIGHT_SIDEBAR_MODE_LABELS = {
  standard: "标准模式",
  cloudbase: "CloudBase",
};

/** Icon names match `web/ui-icon` UiIconName. */
export const RIGHT_SIDEBAR_MODE_UI = {
  standard: { icon: "library", label: RIGHT_SIDEBAR_MODE_LABELS.standard },
  cloudbase: { icon: "cloud", label: RIGHT_SIDEBAR_MODE_LABELS.cloudbase },
};

export function normalizeDialogueMode(value) {
  return DIALOGUE_MODES.includes(value) ? value : "default";
}

export function rightSidebarModeFromDialogue(dialogueMode) {
  const mode = normalizeDialogueMode(dialogueMode);
  return mode === "cloudbase" || mode === "miniprogram" ? "cloudbase" : "standard";
}

export const MINIPROGRAM_DIALOGUE_STEERING =
  "本次请求是仅小程序模式：按微信小程序理解需求，做 Dimina 预览和微信上传。不要使用 CloudBase，不写云函数、云数据库、云存储或静态托管。";

export const CLOUDBASE_DIALOGUE_STEERING =
  "本次请求是 CloudBase 模式：按微信小程序和 CloudBase 理解需求，云函数、云数据库、云存储和静态托管都在范围内。配置以项目管理中的小程序与 CloudBase 为准。";

export const CHAT_DIALOGUE_STEERING =
  "本次请求是 Chat 只读对话模式：你必须回应成员，但不得创建或更新任务，不得写入、修改或删除项目文档、沙箱文件、小程序源码或云资源；仅可使用查询、列表、读取类工具作答。";
