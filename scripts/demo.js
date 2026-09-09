import { randomUUID } from "node:crypto";
import { createDatabase, query } from "../server/db.js";
import { Service } from "../server/service.js";
const db = await createDatabase();
try {
  const [user] = await query(db, "SELECT id FROM users WHERE email=?", [
    process.env.ADMIN_EMAIL,
  ]);
  if (!user) throw new Error("请先创建初始账号");
  if (
    (await query(db, "SELECT id FROM projects WHERE created_by=?", [user.id]))
      .length
  ) {
    console.log("已有项目，跳过示例初始化");
  } else {
    const actor = { ...user, kind: "session" };
    const service = new Service(db);
    const project = await service.createProject(actor, {
      name: "共序 · 产品研发",
      description:
        "让多人和各自的本地 AI，围绕一次迭代协作、提交、审核与归档。",
    });
    const thread = await service.createThread(actor, project.id, {
      title: "v0.1 · 跑通协作闭环",
    });
    await service.postMessage(actor, thread.id, {
      body: "欢迎来到共序。这个项目用来搭建我们自己的协作平台：一个项目沉淀长期资料，一次迭代对应一个群聊，每个人继续使用自己的本地 AI。",
    });
    await service.postMessage(actor, thread.id, {
      body: "本轮实现方向已确定：ACS 是唯一沙箱；项目、成员、讨论、文档内容和版本统一存入 MySQL。后续迁移云端时，先搬迁数据，再调整连接配置。",
    });
    const doc =
      "# 共序 v0.1 · 实现边界\n\n## 目标\n项目 → 迭代群聊 → 本地 AI 提交文档 → 人工审核 → 归档 → 新迭代引用旧版本。\n\n## 已确定技术选择\n- 执行环境：ACS Agent Sandbox（E2B 兼容协议）\n- 持久化：MySQL 8.4，包含文档二进制内容\n- 前端：React + TypeScript\n- 协作接口：HTTP API + Streamable HTTP MCP\n\n## 首版边界\n- 单服务实例、轻量团队试用\n- 单文档不超过 5 MiB\n- 文档上传不等于审核通过\n- 沙箱资料是副本，销毁后不影响项目存储\n- 归档保存消息、审核和精确版本引用\n\n## 待团队确认\n首轮真实业务迭代的目标、参与成员和验收标准。\n";
    await service.submitVersion(actor, thread.id, {
      title: "共序 v0.1 · 实现边界",
      filename: "共序-v0.1-实现边界.md",
      mime: "text/markdown",
      contentBase64: Buffer.from(doc).toString("base64"),
      note: "初始化说明文档，待负责人确认。",
    });
    console.log("已创建起始项目、迭代和待审核的说明文档。");
  }
} finally {
  await db.end();
}
