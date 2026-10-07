import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod/v3";
import { query } from "./db.js";
import { callProvider, getCloudbaseManager, resolveCloudbaseEnv } from "./cloudbase.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.js";
import {
  computeMiniprogramSourceHash,
  miniprogramFilesUnderPath,
  miniprogramSnapshot,
  publishMiniprogramSourceFile,
} from "./miniprogram-workspace.js";
import { HttpError } from "./service.js";

const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,58}$/;
const TIMER_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const MAX_TIMER_TRIGGERS = 10;
const TIMER_MANIFEST = z.array(
  z.object({
    name: z.string().trim().regex(TIMER_NAME),
    schedule: z.string().trim().min(1).max(128),
  }),
).max(MAX_TIMER_TRIGGERS);

function parseTimerManifest(value) {
  const timers = TIMER_MANIFEST.parse(value);
  const names = new Set();
  for (const timer of timers) {
    if (names.has(timer.name)) throw new HttpError(400, `定时触发器 ${timer.name} 重复`);
    names.add(timer.name);
    if (timer.schedule.split(/\s+/).length !== 7) {
      throw new HttpError(400, "Cron 表达式需要 7 个字段：秒 分 时 日 月 星期 年");
    }
  }
  return timers;
}

function functionName(value) {
  const name = String(value || "").trim();
  if (!FUNCTION_NAME.test(name)) throw new HttpError(400, "云函数名称格式不正确");
  return name;
}

const FUNCTION_MANIFEST = z.object({
  version: z.literal(1).default(1),
  runtime: z.string().trim().max(40).default("Nodejs20.19"),
  handler: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]+$/)
    .default("index.main"),
  timeout: z.number().int().min(1).max(900).default(10),
});

function packageDocumentFor(name, value) {
  if (!value) {
    return {
      name: name.toLowerCase().replaceAll("_", "-"),
      version: "1.0.0",
      private: true,
      main: "index.js",
    };
  }
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new HttpError(400, "packageJson 不是合法 JSON");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new HttpError(400, "packageJson 必须是 JSON 对象");
  }
  return parsed;
}

async function persistCloudbaseFunctionSource(service, actor, projectId, name, source) {
  const files = [
    ["index.js", source.code, "application/javascript"],
    ["package.json", JSON.stringify(source.packageDocument, null, 2), "application/json"],
    ["cloudbase.json", JSON.stringify(source.manifest, null, 2), "application/json"],
  ];
  if (Array.isArray(source.timers)) {
    files.push(["timers.json", JSON.stringify(source.timers, null, 2), "application/json"]);
  }
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const current = new Map(
    (snapshot.areas.miniprogram_server?.files || []).map((file) => [file.path, file]),
  );
  const versions = [];
  for (const [filename, content, mime] of files) {
    const path = `${name}/${filename}`;
    const buffer = Buffer.from(content, "utf8");
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    if (current.get(path)?.sha256 === sha256) {
      versions.push({ path, unchanged: true, sha256 });
      continue;
    }
    versions.push(
      await publishMiniprogramSourceFile(service.db, actor, projectId, {
        area: "miniprogram_server",
        path,
        content: buffer,
        mime,
        note: `CloudBase ${name} 部署源码`,
      }),
    );
  }
  return versions;
}

/** Load the exact current project-document snapshot used to build a function package. */
export async function loadCloudbaseFunctionSource(service, projectId, functionValue) {
  const name = functionName(functionValue);
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const files = miniprogramFilesUnderPath(snapshot.areas.miniprogram_server?.files || [], name);
  if (!files.length) throw new HttpError(409, `云函数 ${name} 在服务端目录中没有源码`);
  const rows = await query(
    service.db,
    `SELECT id,content FROM versions WHERE id IN (${files.map(() => "?").join(",")})`,
    files.map((file) => file.versionId),
  );
  const contentById = new Map(rows.map((row) => [row.id, row.content]));
  const prefix = `${name}/`;
  const packageFiles = files.map((file) => ({
    path: file.path.slice(prefix.length),
    content: contentById.get(file.versionId) || Buffer.alloc(0),
  }));
  const byPath = new Map(packageFiles.map((file) => [file.path, file.content]));
  if (!byPath.get("index.js")?.length) {
    throw new HttpError(409, `云函数 ${name} 缺少 index.js`);
  }
  if (!byPath.get("package.json")?.length) {
    throw new HttpError(409, `云函数 ${name} 缺少 package.json`);
  }
  if (!byPath.get("cloudbase.json")?.length) {
    throw new HttpError(409, `云函数 ${name} 缺少 cloudbase.json`);
  }
  let packageDocument;
  let manifest;
  try {
    packageDocument = JSON.parse(byPath.get("package.json").toString("utf8"));
  } catch {
    throw new HttpError(409, `云函数 ${name} 的 package.json 不是合法 JSON`);
  }
  if (!packageDocument || typeof packageDocument !== "object" || Array.isArray(packageDocument)) {
    throw new HttpError(409, `云函数 ${name} 的 package.json 必须是 JSON 对象`);
  }
  try {
    manifest = FUNCTION_MANIFEST.parse(JSON.parse(byPath.get("cloudbase.json").toString("utf8")));
  } catch {
    throw new HttpError(409, `云函数 ${name} 的 cloudbase.json 配置无效`);
  }
  let timers = null;
  if (byPath.has("timers.json")) {
    try {
      timers = parseTimerManifest(JSON.parse(byPath.get("timers.json").toString("utf8")));
    } catch {
      throw new HttpError(409, `云函数 ${name} 的 timers.json 不是合法的 7 字段 Cron 配置`);
    }
  }
  return {
    name,
    sourceHash: computeMiniprogramSourceHash(files),
    packageDocument,
    manifest,
    files: packageFiles.filter((file) => !["cloudbase.json", "timers.json"].includes(file.path)),
    timers,
    workspacePaths: files.map((file) => file.path),
  };
}

async function deployCloudbaseFunctionSource(service, projectId, environment, source) {
  const zip = new JSZip();
  for (const file of source.files) zip.file(file.path, file.content);
  const base64Code = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const result = await callProvider("部署云函数", () =>
    manager.functions.createFunction({
      func: {
        name: source.name,
        runtime: source.manifest.runtime,
        handler: source.manifest.handler,
        timeout: source.manifest.timeout,
        installDependency: Boolean(source.packageDocument.dependencies),
        description: `CoThread workspace deployment (${source.sourceHash.slice(0, 12)})`,
      },
      force: true,
      base64Code,
    }),
  );
  let detail = await callProvider(`读取云函数 ${source.name}`, () =>
    manager.functions.getFunctionDetail(source.name),
  );
  const timerSync = source.timers === null ? null : await syncCloudbaseFunctionTimers(
    manager,
    source.name,
    source.timers || [],
  );
  if (timerSync) {
    detail = await callProvider(`读取云函数 ${source.name} 的最新状态`, () =>
      manager.functions.getFunctionDetail(source.name),
    );
  }
  return {
    environment,
    envId,
    function: publicFunction({ FunctionName: source.name }, detail),
    requestId: result?.RequestId || result?.requestId || null,
    sourceHash: source.sourceHash,
    sourceFiles: source.workspacePaths,
    timerSync,
  };
}

async function syncCloudbaseFunctionTimers(manager, name, desiredTimers) {
  const currentDetail = await callProvider(`读取云函数 ${name} 的定时触发器`, () =>
    manager.functions.getFunctionDetail(name),
  );
  const current = (currentDetail?.Triggers || currentDetail?.triggers || [])
    .map(timerTrigger)
    .filter(Boolean);
  const desired = new Map(desiredTimers.map((timer) => [timer.name, timer.schedule]));
  const currentByName = new Map(current.map((timer) => [timer.name, timer.schedule]));
  const deleted = [];
  const created = [];
  for (const timer of current) {
    if (!desired.has(timer.name) || desired.get(timer.name) !== timer.schedule) {
      await callProvider(`删除定时触发器 ${timer.name}`, () =>
        manager.functions.deleteFunctionTrigger(name, timer.name),
      );
      deleted.push(timer.name);
    }
  }
  for (const [timerName, schedule] of desired) {
    if (currentByName.get(timerName) === schedule) continue;
    await callProvider(`创建定时触发器 ${timerName}`, () =>
      manager.functions.createFunctionTriggers(name, [
        { name: timerName, type: "timer", config: schedule },
      ]),
    );
    created.push(timerName);
  }
  return { created, deleted, desired: desiredTimers };
}

function timerTrigger(trigger) {
  const type = String(trigger?.Type || trigger?.type || "").toLowerCase();
  if (type !== "timer") return null;
  const rawSchedule = trigger?.TriggerDesc ?? trigger?.config ?? "";
  let scheduleValue = rawSchedule;
  if (typeof scheduleValue === "string") {
    try {
      const parsed = JSON.parse(scheduleValue);
      if (parsed && typeof parsed === "object") scheduleValue = parsed;
    } catch {
      // Older provider responses may return the cron expression directly.
    }
  }
  const schedule = scheduleValue && typeof scheduleValue === "object"
    ? scheduleValue.cron || scheduleValue.Cron || scheduleValue.expression || ""
    : scheduleValue;
  return {
    name: String(trigger?.TriggerName || trigger?.name || ""),
    type: "timer",
    schedule: String(schedule),
    enabled:
      trigger?.Enable === undefined ? true : String(trigger.Enable).toUpperCase() !== "FALSE",
  };
}

function publicFunction(row, detail) {
  const triggers = (detail?.Triggers || detail?.triggers || []).map(timerTrigger).filter(Boolean);
  return {
    id: row.FunctionId || row.functionId || null,
    name: row.FunctionName || row.name,
    description:
      detail?.Description ||
      detail?.description ||
      detail?.FunctionDesc ||
      row.Description ||
      row.description ||
      row.FunctionDesc ||
      null,
    runtime: row.Runtime || row.runtime || null,
    status: detail?.Status || row.Status || row.status || "Unknown",
    statusDetail: detail?.StatusDesc || detail?.statusDesc || null,
    type: detail?.Type || detail?.type || null,
    handler: detail?.Handler || detail?.handler || null,
    modifiedAt: row.ModTime || row.modifiedAt || null,
    createdAt: row.AddTime || row.createdAt || null,
    timers: triggers,
  };
}

export async function listCloudbaseFunctions(service, user, projectId, input = {}) {
  await service.member(user, projectId, false);
  const environment = String(input.environment || "development");
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  const rows = await callProvider("列举云函数", () => manager.functions.listFunctions(100, 0));
  const functions = await Promise.all(
    (rows || []).map(async (row) => {
      const name = row.FunctionName || row.name;
      if (!name) return null;
      let detail = null;
      try {
        detail = await callProvider(`读取云函数 ${name}`, () =>
          manager.functions.getFunctionDetail(name),
        );
      } catch (error) {
        detail = { StatusDesc: error.message };
      }
      return publicFunction(row, detail);
    }),
  );
  return { environment, envId, functions: functions.filter(Boolean) };
}

export async function deployDevelopmentCloudbaseFunction(
  service,
  user,
  projectId,
  functionValue,
  input = {},
) {
  await service.member(user, projectId, false);
  const name = functionName(functionValue);
  const data = z
    .object({
      environment: z.literal("development").default("development"),
      code: z
        .string()
        .min(1)
        .max(256 * 1024),
      packageJson: z
        .string()
        .max(64 * 1024)
        .optional(),
      runtime: z.string().trim().max(40).default("Nodejs20.19"),
      handler: z
        .string()
        .trim()
        .regex(/^[A-Za-z0-9_.-]+$/)
        .default("index.main"),
      timeout: z.number().int().min(1).max(900).default(10),
      timers: z.array(z.object({
        name: z.string().trim().regex(TIMER_NAME),
        schedule: z.string().trim().min(1).max(128),
      })).max(MAX_TIMER_TRIGGERS).optional(),
    })
    .parse(input || {});
  const packageDocument = packageDocumentFor(name, data.packageJson);
  const manifest = FUNCTION_MANIFEST.parse({
    version: 1,
    runtime: data.runtime,
    handler: data.handler,
    timeout: data.timeout,
  });
  const timers = data.timers === undefined ? undefined : parseTimerManifest(data.timers);
  await persistCloudbaseFunctionSource(service, user, projectId, name, {
    code: data.code,
    packageDocument,
    manifest,
    timers,
  });
  const source = await loadCloudbaseFunctionSource(service, projectId, name);
  return deployCloudbaseFunctionSource(service, projectId, data.environment, source);
}

export async function createCloudbaseTimer(service, user, projectId, functionValue, input = {}) {
  await service.member(user, projectId, true, service.db, true);
  const name = functionName(functionValue);
  const data = z
    .object({
      environment: z.enum(["development", "production"]).default("development"),
      name: z
        .string()
        .trim()
        .regex(TIMER_NAME),
      schedule: z.string().trim().min(1).max(128),
    })
    .parse(input || {});
  if (data.schedule.split(/\s+/).length !== 7) {
    throw new HttpError(400, "Cron 表达式需要 7 个字段：秒 分 时 日 月 星期 年");
  }
  const { manager, envId } = await getCloudbaseManager(service, projectId, data.environment);
  const detail = await callProvider(`读取云函数 ${name}`, () =>
    manager.functions.getFunctionDetail(name),
  );
  const timers = (detail?.Triggers || detail?.triggers || []).map(timerTrigger).filter(Boolean);
  if (timers.some((timer) => timer.name === data.name)) {
    throw new HttpError(409, `定时触发器 ${data.name} 已存在`);
  }
  if (timers.length >= MAX_TIMER_TRIGGERS) {
    throw new HttpError(409, `一个云函数最多可配置 ${MAX_TIMER_TRIGGERS} 个定时触发器`);
  }
  await callProvider("创建定时任务", () =>
    manager.functions.createFunctionTriggers(name, [
      {
        name: data.name,
        type: "timer",
        config: data.schedule,
      },
    ]),
  );
  return { environment: data.environment, envId, functionName: name, triggerName: data.name };
}

export async function deleteCloudbaseTimer(
  service,
  user,
  projectId,
  functionValue,
  triggerValue,
  input = {},
) {
  await service.member(user, projectId, true, service.db, true);
  const name = functionName(functionValue);
  const triggerName = functionName(triggerValue);
  const environment = z
    .enum(["development", "production"])
    .default("development")
    .parse(input.environment);
  const { manager, envId } = await getCloudbaseManager(service, projectId, environment);
  await callProvider("停用定时任务", () =>
    manager.functions.deleteFunctionTrigger(name, triggerName),
  );
  return { environment, envId, functionName: name, triggerName, enabled: false };
}

export async function promoteCloudbaseFunction(service, actor, projectId, request) {
  await service.member(actor, projectId, true, service.db, true);
  const name = functionName(request.resourceName);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const source = resolveCloudbaseEnv(runtime, "development");
  const target = resolveCloudbaseEnv(runtime, "production");
  const workspaceSource = await loadCloudbaseFunctionSource(service, projectId, name);
  if (request.sourceHash && request.sourceHash !== workspaceSource.sourceHash) {
    throw new HttpError(409, "云函数源码已变化，请重新提交发布申请");
  }
  const result = await deployCloudbaseFunctionSource(
    service,
    projectId,
    "production",
    workspaceSource,
  );
  const deploymentId = randomUUID();
  await query(
    service.db,
    `INSERT INTO miniprogram_deployments
       (id,project_id,target,environment,version,status,log,published_by,published_at,confirmed_by,confirmed_at,created_at)
     VALUES(?,?, 'cloudbase_function','production',?,'succeeded',?,?,UTC_TIMESTAMP(3),?,UTC_TIMESTAMP(3),UTC_TIMESTAMP(3))`,
    [
      deploymentId,
      projectId,
      name,
      JSON.stringify({
        functionName: name,
        sourceEnvId: source.envId,
        targetEnvId: target.envId,
        sharedEnvironment: source.envId === target.envId,
        sourceHash: workspaceSource.sourceHash,
        requestId: result.requestId,
      }),
      actor.id,
      actor.id,
    ],
  );
  return {
    deploymentId,
    functionName: name,
    sourceEnvId: source.envId,
    targetEnvId: target.envId,
    sourceHash: workspaceSource.sourceHash,
  };
}
