const page = (key, label, icon, actions) => ({
  key,
  label,
  icon,
  type: "page",
  children: actions.map(([action, name, permissionKey]) => ({
    key: permissionKey || `${key}.${action}`,
    label: name,
    type: "function",
  })),
});

export const ADMIN_PERMISSION_TREE = [
  {
    key: "work",
    label: "组织工作",
    icon: "project",
    type: "menu",
    children: [
      page("projects", "项目管理", "project", [
        ["create", "新增项目"],
        ["update", "编辑项目信息"],
        ["archive", "归档项目"],
        ["restore", "恢复项目"],
      ]),
      page("iterations", "迭代管理", "iteration", [["update", "修改迭代名称"]]),
      page("tasks", "任务管理", "task", [["update", "修改任务资料"]]),
    ],
  },
  {
    key: "organization",
    label: "账号权限",
    icon: "members",
    type: "menu",
    children: [
      page("accounts", "账号管理", "members", [
        ["create", "新增成员"],
        ["status", "启用与停用成员"],
        ["reset-password", "重置密码"],
        ["assign", "分配成员角色", "roles.assign"],
      ]),
      page("account-changes", "变更记录", "history", [["view-all", "查看全部"]]),
      page("account-logins", "登录记录", "login", [["view-all", "查看全部"]]),
      page("roles", "角色权限", "shield", [["manage", "维护角色及权限"]]),
    ],
  },
  {
    key: "platform",
    label: "平台管理",
    icon: "plugin",
    type: "menu",
    children: [
      page("plugins", "插件管理", "plugin", [
        ["create", "新增 Skill"],
        ["update", "编辑 Skill"],
        ["archive", "归档 Skill"],
      ]),
      page("model-settings", "模型配置", "settings", [["update", "保存模型配置"]]),
    ],
  },
];

export const ADMIN_PERMISSION_KEYS = ADMIN_PERMISSION_TREE.flatMap((menu) => [
  menu.key,
  ...menu.children.flatMap((item) => [item.key, ...item.children.map((action) => action.key)]),
]);

// Personal pages are implicit for every member account and are not role-assignable.
export const MY_WORK_MENU = {
  key: "my-work",
  label: "我的工作",
  icon: "inbox",
  type: "menu",
  children: [
    { key: "my-projects", label: "我的项目", icon: "project", type: "page", children: [] },
    { key: "my-iterations", label: "我的迭代", icon: "iteration", type: "page", children: [] },
    { key: "my-tasks", label: "我的任务", icon: "task", type: "page", children: [] },
  ],
};

export const IMPLICIT_ADMIN_PERMISSIONS = [
  MY_WORK_MENU.key,
  ...MY_WORK_MENU.children.map((item) => item.key),
  "organization",
  "account-changes",
  "account-logins",
];

// A function always carries its page and menu. A menu/page alone never grants functions.
export function expandAdminPermissions(keys) {
  const selected = new Set(keys);
  for (const menu of ADMIN_PERMISSION_TREE) {
    for (const item of menu.children) {
      if (item.children.some((action) => selected.has(action.key))) selected.add(item.key);
      if (selected.has(item.key)) selected.add(menu.key);
    }
  }
  return ADMIN_PERMISSION_KEYS.filter((key) => selected.has(key));
}

export function adminPermissionForRequest(method, path) {
  if (method === "GET" && path === "/access") return null;
  if (
    method === "GET" &&
    (path === "/my/projects" ||
      path === "/my/iterations" ||
      path === "/my/tasks" ||
      /^\/my\/tasks\/[^/]+$/.test(path) ||
      /^\/my\/projects\/[^/]+\/members\/[^/]+\/avatar$/.test(path) ||
      /^\/my\/projects\/[^/]+\/image$/.test(path))
  )
    return null;
  if (path === "/my" || path.startsWith("/my/")) return false;
  if (method === "GET" && path === "/permissions") return "roles";
  if (method === "GET" && path === "/role-members") return "roles.assign";
  if (/^\/roles(?:\/[^/]+)?$/.test(path))
    return method === "GET"
      ? "roles"
      : ["POST", "PATCH", "DELETE"].includes(method)
        ? "roles.manage"
        : false;
  if (method === "GET" && /^\/accounts\/[^/]+\/role-options$/.test(path)) return "roles.assign";
  if (method === "GET" && /^\/accounts\/[^/]+\/avatar$/.test(path)) return "accounts";
  if (method === "GET" && /^\/projects\/[^/]+\/members\/[^/]+\/avatar$/.test(path))
    return "projects";
  if (method === "GET" && /^\/projects\/[^/]+\/image$/.test(path)) return null;
  if (/^\/accounts\/[^/]+\/roles$/.test(path)) return method === "PUT" ? "roles.assign" : false;
  if (method === "GET" && (path === "/account-changes" || path === "/account-logins"))
    return path.slice(1);
  if (method === "GET" && /^\/(projects|accounts|iterations|tasks|plugins)$/.test(path))
    return path.slice(1);
  if (method === "GET" && /^\/tasks\/[^/]+$/.test(path)) return "tasks";
  if (method === "POST" && /^\/(projects|accounts)$/.test(path)) return `${path.slice(1)}.create`;
  const project = path.match(/^\/projects\/[^/]+\/(archive|restore)$/);
  if (method === "PATCH" && project) return `projects.${project[1]}`;
  if (method === "PATCH" && /^\/projects\/[^/]+$/.test(path)) return "projects.update";
  if (method === "PATCH" && /^\/accounts\/[^/]+\/status$/.test(path)) return "accounts.status";
  if (method === "POST" && /^\/accounts\/[^/]+\/reset-password$/.test(path))
    return "accounts.reset-password";
  if (method === "PATCH" && /^\/(iterations|tasks)\/[^/]+$/.test(path))
    return `${path.split("/")[1]}.update`;
  if (method === "POST" && path === "/plugins/skills") return "plugins.create";
  if (/^\/plugins\/skills\/[^/]+$/.test(path))
    return method === "PATCH" ? "plugins.update" : method === "DELETE" ? "plugins.archive" : false;
  if (path === "/model-settings")
    return method === "GET" ? "model-settings" : method === "PUT" ? "model-settings.update" : false;
  return false;
}
