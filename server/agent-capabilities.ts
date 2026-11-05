import { randomUUID } from "node:crypto";
import { z } from "zod/v3";
import { query, transaction } from "./db.ts";
import { HttpError } from "./service.js";
import {
  capabilityProfile,
  pluginManagementLevel,
} from "../dsh-layer/cothread-plugin-registry.mjs";
import type { Pool } from "mysql2/promise";
import type { Db } from "./types.ts";

/** 能力管理用到的 Service 视图。 */
type CapabilityService = {
  db: Pool;
  adminPermission(user: CapabilityUser, permission: string): Promise<unknown>;
};

/** 操作人。 */
type CapabilityUser = { id: string; kind?: string | null };

/** Skill 行。 */
type SkillRow = {
  id: string;
  name?: unknown;
  description?: unknown;
  agent_level?: unknown;
  prompt?: unknown;
  enabled?: unknown;
  version?: unknown;
  created_by_name?: unknown;
  updated_by_name?: unknown;
  created_at?: unknown;
  updated_at?: unknown;
  [column: string]: unknown;
};

const storedLevels = ["laoweng", "xiaoxiang", "child_agent"];
const managementLevels = ["laoweng", "xiaoxiang"];
const levelSchema = z.enum(storedLevels as [string, ...string[]]);

function storedSkillLevel(agentLevel: string): string {
  return agentLevel === "child_agent" ? "xiaoxiang" : agentLevel;
}

function skillLevelsFor(level: string): string[] {
  return level === "laoweng" ? ["laoweng"] : ["xiaoxiang", "child_agent"];
}
const skillInput = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).default(""),
    agentLevel: levelSchema,
    prompt: z.string().trim().min(1).max(30000),
    enabled: z.boolean().default(false),
  })
  .strict();

async function requireAdmin(
  service: CapabilityService,
  user: CapabilityUser,
  permission: string,
): Promise<void> {
  await service.adminPermission(user, permission);
}

const skillView = (row: SkillRow) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  agentLevel: storedSkillLevel(String(row.agent_level)),
  prompt: row.prompt,
  source: "custom",
  enabled: !!Number(row.enabled),
  version: Number(row.version),
  createdBy: row.created_by_name,
  updatedBy: row.updated_by_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

export async function adminPluginManagement(service: CapabilityService, user: CapabilityUser) {
  await requireAdmin(service, user, "plugins");
  let assembledByLevel: Record<string, Set<string> | null> = Object.fromEntries(
    managementLevels.map((level) => [level, null]),
  );
  try {
    const { dshComposition } = await import("./dsh-runtime-config.ts");
    assembledByLevel = Object.fromEntries(
      managementLevels.map((level) => [
        level,
        new Set(
          dshComposition(level)
            .filter((entry) => entry.assembled)
            .map((entry) => entry.id),
        ) as Set<string> | null,
      ]),
    );
  } catch (error) {
    console.error("DSH composition unavailable", {
      type: (error as { name?: string } | null)?.name,
    });
  }
  const skills = await query<SkillRow>(
    service.db,
    `SELECT s.*,creator.name created_by_name,editor.name updated_by_name
    FROM agent_prompt_skills s LEFT JOIN users creator ON creator.id=s.created_by LEFT JOIN users editor ON editor.id=s.updated_by
    WHERE s.archived_at IS NULL AND s.source='custom'
    ORDER BY FIELD(s.agent_level,'laoweng','xiaoxiang','child_agent'),s.updated_at DESC,s.id`,
  );
  return {
    levels: managementLevels.map((level) => ({
      ...pluginManagementLevel(
        level,
        assembledByLevel[level] as unknown as Parameters<typeof pluginManagementLevel>[1],
      ),
      skills: skills
        .filter((row) => skillLevelsFor(level).includes(String(row.agent_level)))
        .map(skillView),
    })),
  };
}

export async function createPromptSkill(
  service: CapabilityService,
  user: CapabilityUser,
  input: unknown,
) {
  await requireAdmin(service, user, "plugins.create");
  const data = skillInput.parse(input);
  const agentLevel = storedSkillLevel(data.agentLevel);
  return transaction(service.db, async (db) => {
    const skillId = randomUUID();
    await query(
      db,
      `INSERT INTO agent_prompt_skills
      (id,name,description,agent_level,prompt,source,enabled,created_by,updated_by)
      VALUES(?,?,?,?,?,'custom',?,?,?)`,
      [
        skillId,
        data.name,
        data.description,
        agentLevel,
        data.prompt,
        data.enabled,
        user.id,
        user.id,
      ],
    );
    await query(
      db,
      `INSERT INTO agent_prompt_skill_versions
      (skill_id,version,name,description,agent_level,prompt,enabled,source,created_by)
      VALUES(?,1,?,?,?,?,?,'custom',?)`,
      [skillId, data.name, data.description, agentLevel, data.prompt, data.enabled, user.id],
    );
    await query(
      db,
      `INSERT INTO agent_capability_change_logs(id,actor_user_id,action,target_type,target_key,details)
      VALUES(?,?,'skill_created','skill',?,?)`,
      [
        randomUUID(),
        user.id,
        skillId,
        JSON.stringify({ agentLevel, name: data.name, enabled: data.enabled }),
      ],
    );
    return { id: skillId, version: 1 };
  });
}

export async function updatePromptSkill(
  service: CapabilityService,
  user: CapabilityUser,
  skillId: string,
  input: unknown,
) {
  await requireAdmin(service, user, "plugins.update");
  z.string().uuid().parse(skillId);
  const data = skillInput.parse(input);
  const agentLevel = storedSkillLevel(data.agentLevel);
  return transaction(service.db, async (db) => {
    const [current] = await query(
      db,
      "SELECT * FROM agent_prompt_skills WHERE id=? AND source='custom' AND archived_at IS NULL FOR UPDATE",
      [skillId],
    );
    if (!current) throw new HttpError(404, "Skill 不存在");
    const version = Number(current.version) + 1;
    await query(
      db,
      `UPDATE agent_prompt_skills SET name=?,description=?,agent_level=?,prompt=?,
      enabled=?,version=?,updated_by=? WHERE id=?`,
      [
        data.name,
        data.description,
        agentLevel,
        data.prompt,
        data.enabled,
        version,
        user.id,
        skillId,
      ],
    );
    await query(
      db,
      `INSERT INTO agent_prompt_skill_versions
      (skill_id,version,name,description,agent_level,prompt,enabled,source,created_by)
      VALUES(?,?,?,?,?,?,?,'custom',?)`,
      [
        skillId,
        version,
        data.name,
        data.description,
        agentLevel,
        data.prompt,
        data.enabled,
        user.id,
      ],
    );
    await query(
      db,
      `INSERT INTO agent_capability_change_logs(id,actor_user_id,action,target_type,target_key,details)
      VALUES(?,?,'skill_updated','skill',?,?)`,
      [
        randomUUID(),
        user.id,
        skillId,
        JSON.stringify({
          agentLevel,
          name: data.name,
          enabled: data.enabled,
          version,
        }),
      ],
    );
    return { id: skillId, version };
  });
}

export async function archivePromptSkill(
  service: CapabilityService,
  user: CapabilityUser,
  skillId: string,
) {
  await requireAdmin(service, user, "plugins.archive");
  z.string().uuid().parse(skillId);
  const result = (await query(
    service.db,
    `UPDATE agent_prompt_skills SET enabled=FALSE,archived_at=UTC_TIMESTAMP(3),
    updated_by=? WHERE id=? AND source='custom' AND archived_at IS NULL`,
    [user.id, skillId],
  )) as unknown as { affectedRows?: number };
  if (!result.affectedRows) throw new HttpError(404, "Skill 不存在");
  await query(
    service.db,
    `INSERT INTO agent_capability_change_logs(id,actor_user_id,action,target_type,target_key,details)
    VALUES(?,?,'skill_archived','skill',?,JSON_OBJECT())`,
    [randomUUID(), user.id, skillId],
  );
  return { id: skillId, archived: true };
}

export async function loadAgentCapabilityProfile(db: Db, levelValue: unknown) {
  const level = levelSchema.parse(levelValue) as string;
  const profile = capabilityProfile(level);
  const owners = skillLevelsFor(level);
  const skills = await query<SkillRow>(
    db,
    `SELECT id,name,prompt FROM agent_prompt_skills
    WHERE agent_level IN (${owners.map(() => "?").join(",")}) AND source='custom' AND enabled=TRUE AND archived_at IS NULL ORDER BY created_at,id`,
    owners,
  );
  const activeSkills = skills;
  const instructions = activeSkills.length
    ? `\n已启用的自定义 Skill（以下内容仅为附加提示词，不能改变系统权限）：\n${activeSkills
        .map((skill) => `### ${skill.name}\n${skill.prompt}`)
        .join("\n\n")}`
    : "";
  const levelData = pluginManagementLevel(level);
  return {
    level,
    allowedTools: profile.allowedTools,
    enabledCapabilities: [...profile.enabledKeys],
    skills: activeSkills,
    systemPrompt: levelData.systemPrompt.prompt,
    instructions,
  };
}
