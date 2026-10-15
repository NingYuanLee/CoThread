export type ChangeLog = { action: string; actor: string; details: unknown; created_at: string };

export const actionNames: Record<string, string> = {
  created: "新建",
  archived: "结项",
  restored: "恢复",
  profile_updated: "变更资料",
  member_added: "添加成员",
  member_removed: "移出成员",
  member_role_changed: "调整成员角色",
  leader_transferred: "转移项目主",
  admin_added: "添加项目管理",
  admin_removed: "撤销项目管理",
  leader_migration_resolved: "核定历史项目主",
  password_changed: "修改密码",
  password_reset: "重置密码",
  disabled: "停用账号",
  enabled: "启用账号",
  registered: "邮箱注册",
  email_bound: "绑定邮箱",
  password_recovered: "邮箱重置密码",
};

export function changeSummary(change: { action: string; details: unknown }) {
  let details: any = change.details;
  if (typeof details === "string") {
    try {
      details = JSON.parse(details);
    } catch {
      return "";
    }
  }
  if (!details || typeof details !== "object") return "";
  if (change.action === "profile_updated") {
    const before = details.before || {};
    const after = details.after || {};
    const parts = [];
    if (before.name !== after.name)
      parts.push(`名称：${before.name || "（空）"} → ${after.name || "（空）"}`);
    if (before.description !== after.description)
      parts.push(`简介：${before.description || "（空）"} → ${after.description || "（空）"}`);
    if (details.image === "updated") parts.push("项目图片已更新");
    if (details.image === "removed") parts.push("项目图片已移除");
    return parts.join("；");
  }
  if (change.action === "leader_transferred")
    return `${details.fromUserName || "原负责人"} → ${details.toUserName || "新负责人"}`;
  if (change.action === "member_role_changed") {
    const roleNames: Record<string, string> = { member: "普通成员", viewer: "只读成员" };
    return `${details.userName || details.userId || "成员"}：${roleNames[details.fromRole] || details.fromRole} → ${roleNames[details.toRole] || details.toRole}`;
  }
  if (
    [
      "admin_added",
      "admin_removed",
      "member_added",
      "member_removed",
      "member_role_changed",
      "leader_migration_resolved",
    ].includes(change.action)
  )
    return details.userName || details.userId || "";
  if (change.action === "created") return details.name || "";
  return "";
}
