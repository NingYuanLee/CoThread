export const DIALOGUE_MODES = ["default", "chat", "cloudbase"];

export const DIALOGUE_MODE_LABELS = {
  default: "自由发言",
  chat: "有问必答",
  cloudbase: "小程序云开发",
};

/** Icon names match `web/ui-icon` UiIconName. */
export const DIALOGUE_MODE_UI = {
  default: {
    icon: "users",
    accent: "#6f7f93",
    surface: "#eef2f6",
    label: DIALOGUE_MODE_LABELS.default,
    summary: "默认 @ 与参与规则",
  },
  chat: {
    icon: "chat",
    accent: "#1a9d4a",
    surface: "#e8f6ed",
    label: DIALOGUE_MODE_LABELS.chat,
    summary: "必回，仅只读查询",
  },
  cloudbase: {
    icon: "smartphone",
    accent: "#2a7fd4",
    surface: "#e8f3fc",
    label: DIALOGUE_MODE_LABELS.cloudbase,
    summary: "联动云开发侧栏",
  },
};

export const RIGHT_SIDEBAR_MODE_LABELS = {
  standard: "标准模式",
  cloudbase: "小程序云开发",
};

/** Icon names match `web/ui-icon` UiIconName. */
export const RIGHT_SIDEBAR_MODE_UI = {
  standard: { icon: "library", label: RIGHT_SIDEBAR_MODE_LABELS.standard },
  cloudbase: { icon: "smartphone", label: RIGHT_SIDEBAR_MODE_LABELS.cloudbase },
};

export function normalizeDialogueMode(value) {
  return DIALOGUE_MODES.includes(value) ? value : "default";
}

export function rightSidebarModeFromDialogue(dialogueMode) {
  return normalizeDialogueMode(dialogueMode) === "cloudbase" ? "cloudbase" : "standard";
}

export const CLOUDBASE_DIALOGUE_STEERING =
  "当前迭代处于 CloudBase 云开发对话模式：请优先按微信小程序与腾讯云开发（云函数、云数据库、云存储、静态托管、预览与发布流程）理解成员需求；配置与凭据以项目管理中的小程序与云开发为准。";

export const CHAT_DIALOGUE_STEERING =
  "当前迭代处于 Chat 只读对话模式：你必须回应成员，但不得创建或更新任务，不得写入、修改或删除项目文档、沙箱文件、小程序源码或云资源；仅可使用查询、列表、读取类工具作答。";
