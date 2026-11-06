import { createHash, randomUUID } from "node:crypto";
import JSZip from "jszip";
import { z } from "zod/v3";
import { query } from "./db.ts";
import type { Db } from "./types.ts";
import { callProvider, getCloudbaseManager, resolveCloudbaseEnv } from "./cloudbase.js";
import { loadProjectMiniProgramRuntime } from "./miniprogram-config.ts";
import {
  computeMiniprogramSourceHash,
  miniprogramFilesUnderPath,
  miniprogramSnapshot,
  publishMiniprogramSourceFile,
} from "./miniprogram-workspace.ts";
import { HttpError } from "./service.ts";

const FUNCTION_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,58}$/;
const TIMER_NAME = /^[A-Za-z][A-Za-z0-9_-]{0,59}$/;
const MAX_TIMER_TRIGGERS = 10;
const TIMER_MANIFEST = z
  .array(
    z.object({
      name: z.string().trim().regex(TIMER_NAME),
      schedule: z.string().trim().min(1).max(128),
    }),
  )
  .max(MAX_TIMER_TRIGGERS);

/** 定时触发器清单里的一项。 */
type TimerTriggerManifest = z.infer<typeof TIMER_MANIFEST>[number];
/** `cloudbase.json` 的清单结构。 */
type FunctionManifest = z.infer<typeof FUNCTION_MANIFEST>;

/** 统一云函数对外形状里的定时触发器。 */
type TimerTrigger = { name: string; type: string; schedule: string; enabled: boolean };

/** provider 返回的云函数详情；字段名大小写随版本变化，一律按可选处理。 */
type ProviderFunctionDetail = {
  Triggers?: unknown[] | null;
  triggers?: unknown[] | null;
  Status?: unknown;
  StatusDesc?: unknown;
  statusDesc?: unknown;
  Description?: unknown;
  description?: unknown;
  FunctionDesc?: unknown;
  Type?: unknown;
  type?: unknown;
  Handler?: unknown;
  handler?: unknown;
  [field: string]: unknown;
};

/** CloudBase 云函数管理器的能力面（本文件只调用这几个方法）。 */
type CloudbaseFunctionsManager = {
  functions: {
    createFunction(options: Record<string, unknown>): Promise<unknown>;
    getFunctionDetail(name: string): Promise<ProviderFunctionDetail>;
    deleteFunctionTrigger(name: string, triggerName: string): Promise<unknown>;
    createFunctionTriggers(name: string, triggers: Record<string, unknown>[]): Promise<unknown>;
    listFunctions(limit: number, offset: number): Promise<Record<string, unknown>[]>;
  };
};

/** 云函数动作所需的 Service 视图。 */
type CloudbaseFunctionService = {
  db: Db;
  member(
    user: CloudbaseFunctionUser,
    projectId: string,
    write?: boolean,
    db?: Db,
    owner?: boolean,
  ): Promise<unknown>;
};

/** 触发云函数动作的人。 */
type CloudbaseFunctionUser = { id: string; kind?: string | null };

/** 部署一个云函数时要写进工作区的三到四个文件。 */
type FunctionSourceInput = {
  code: string;
  packageDocument: Record<string, unknown>;
  manifest: FunctionManifest;
  timers?: TimerTriggerManifest[] | null;
};

/** 从工作区读回来的完整来源。 */
type CloudbaseFunctionSource = {
  name: string;
  sourceHash: string;
  packageDocument: Record<string, unknown>;
  manifest: FunctionManifest;
  files: { path: string; content: Buffer }[];
  timers: TimerTriggerManifest[] | null;
  workspacePaths: string[];
};

/** 持久化后的单个文件：要么内容未变，要么是一次新的版本。 */
type PublishedSourceFile =
  | { path: string; unchanged: true; sha256: string }
  | Awaited<ReturnType<typeof publishMiniprogramSourceFile>>;

function parseTimerManifest(value: unknown): TimerTriggerManifest[] {
  const timers = TIMER_MANIFEST.parse(value);
  const names = new Set<string>();
  for (const timer of timers) {
    if (names.has(timer.name)) throw new HttpError(400, `定时触发器 ${timer.name} 重复`);
    names.add(timer.name);
    if (timer.schedule.split(/\s+/).length !== 7) {
      throw new HttpError(400, "Cron 表达式需要 7 个字段：秒 分 时 日 月 星期 年");
    }
  }
  return timers;
}

function functionName(value: unknown): string {
  const name = String(value || "").trim();
  if (!FUNCTION_NAME.test(name)) throw new HttpError(400, "CloudBase 云函数名称格式不正确");
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

function packageDocumentFor(name: string, value: string | undefined): Record<string, unknown> {
  if (!value) {
    return {
      name: name.toLowerCase().replaceAll("_", "-"),
      version: "1.0.0",
      private: true,
      main: "index.js",
    };
  }
  let parsed: Record<string, unknown>;
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

async function persistCloudbaseFunctionSource(
  service: CloudbaseFunctionService,
  actor: CloudbaseFunctionUser,
  projectId: string,
  name: string,
  source: FunctionSourceInput,
): Promise<PublishedSourceFile[]> {
  const files: string[][] = [
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
  const versions: PublishedSourceFile[] = [];
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
export async function loadCloudbaseFunctionSource(
  service: CloudbaseFunctionService,
  projectId: string,
  functionValue: unknown,
): Promise<CloudbaseFunctionSource> {
  const name = functionName(functionValue);
  const snapshot = await miniprogramSnapshot(service.db, projectId);
  const files = miniprogramFilesUnderPath(snapshot.areas.miniprogram_server?.files || [], name);
  if (!files.length) throw new HttpError(409, `CloudBase 云函数 ${name} 在服务端目录中没有源码`);
  const rows = await query<{ id: string; content: Buffer }>(
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
    throw new HttpError(409, `CloudBase 云函数 ${name} 缺少 index.js`);
  }
  // 下面三处 `!`：上面与紧邻的分支已经确认文件存在，`Map.get` 的类型仍带 undefined。
  if (!byPath.get("package.json")?.length) {
    throw new HttpError(409, `CloudBase 云函数 ${name} 缺少 package.json`);
  }
  if (!byPath.get("cloudbase.json")?.length) {
    throw new HttpError(409, `CloudBase 云函数 ${name} 缺少 cloudbase.json`);
  }
  let packageDocument: Record<string, unknown>;
  let manifest: FunctionManifest;
  try {
    packageDocument = JSON.parse(byPath.get("package.json")!.toString("utf8"));
  } catch {
    throw new HttpError(409, `CloudBase 云函数 ${name} 的 package.json 不是合法 JSON`);
  }
  if (!packageDocument || typeof packageDocument !== "object" || Array.isArray(packageDocument)) {
    throw new HttpError(409, `CloudBase 云函数 ${name} 的 package.json 必须是 JSON 对象`);
  }
  try {
    manifest = FUNCTION_MANIFEST.parse(JSON.parse(byPath.get("cloudbase.json")!.toString("utf8")));
  } catch {
    throw new HttpError(409, `CloudBase 云函数 ${name} 的 cloudbase.json 配置无效`);
  }
  let timers: TimerTriggerManifest[] | null = null;
  if (byPath.has("timers.json")) {
    try {
      timers = parseTimerManifest(JSON.parse(byPath.get("timers.json")!.toString("utf8")));
    } catch {
      throw new HttpError(
        409,
        `CloudBase 云函数 ${name} 的 timers.json 不是合法的 7 字段 Cron 配置`,
      );
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

async function deployCloudbaseFunctionSource(
  service: CloudbaseFunctionService,
  projectId: string,
  environment: string,
  source: CloudbaseFunctionSource,
) {
  const zip = new JSZip();
  for (const file of source.files) zip.file(file.path, file.content);
  const base64Code = await zip.generateAsync({ type: "base64", compression: "DEFLATE" });
  const { manager, envId } = (await getCloudbaseManager(service, projectId, environment)) as {
    manager: CloudbaseFunctionsManager;
    envId: unknown;
  };
  const result = await callProvider("部署 CloudBase 云函数", () =>
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
  let detail = await callProvider(`读取 CloudBase 云函数 ${source.name}`, () =>
    manager.functions.getFunctionDetail(source.name),
  );
  const timerSync =
    source.timers === null
      ? null
      : await syncCloudbaseFunctionTimers(manager, source.name, source.timers || []);
  if (timerSync) {
    detail = await callProvider(`读取 CloudBase 云函数 ${source.name} 的最新状态`, () =>
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

async function syncCloudbaseFunctionTimers(
  manager: CloudbaseFunctionsManager,
  name: string,
  desiredTimers: TimerTriggerManifest[],
) {
  const currentDetail = (await callProvider(`读取 CloudBase 云函数 ${name} 的定时触发器`, () =>
    manager.functions.getFunctionDetail(name),
  )) as ProviderFunctionDetail;
  const current = (currentDetail?.Triggers || currentDetail?.triggers || [])
    .map(timerTrigger)
    .filter((timer): timer is TimerTrigger => Boolean(timer));
  const desired = new Map(desiredTimers.map((timer) => [timer.name, timer.schedule]));
  const currentByName = new Map(current.map((timer) => [timer.name, timer.schedule]));
  const deleted: string[] = [];
  const created: string[] = [];
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

/** provider 的触发器字段名大小写不固定，先收口到一个普通对象再读。 */
function triggerFields(trigger: unknown): {
  Type?: unknown;
  type?: unknown;
  TriggerDesc?: unknown;
  config?: unknown;
  TriggerName?: unknown;
  name?: unknown;
  Enable?: unknown;
} {
  return typeof trigger === "object" && trigger !== null
    ? (trigger as {
        Type?: unknown;
        type?: unknown;
        TriggerDesc?: unknown;
        config?: unknown;
        TriggerName?: unknown;
        name?: unknown;
        Enable?: unknown;
      })
    : {};
}

function timerTrigger(trigger: unknown): TimerTrigger | null {
  const source = triggerFields(trigger);
  const type = String(source.Type || source.type || "").toLowerCase();
  if (type !== "timer") return null;
  const rawSchedule = source.TriggerDesc ?? source.config ?? "";
  let scheduleValue: unknown = rawSchedule;
  if (typeof scheduleValue === "string") {
    try {
      const parsed = JSON.parse(scheduleValue);
      if (parsed && typeof parsed === "object") scheduleValue = parsed;
    } catch {
      // Older provider responses may return the cron expression directly.
    }
  }
  const schedule =
    scheduleValue && typeof scheduleValue === "object"
      ? (scheduleValue as { cron?: unknown; Cron?: unknown; expression?: unknown }).cron ||
        (scheduleValue as { Cron?: unknown }).Cron ||
        (scheduleValue as { expression?: unknown }).expression ||
        ""
      : scheduleValue;
  return {
    name: String(source.TriggerName || source.name || ""),
    type: "timer",
    schedule: String(schedule),
    enabled: source.Enable === undefined ? true : String(source.Enable).toUpperCase() !== "FALSE",
  };
}

function publicFunction(row: Record<string, unknown>, detail: ProviderFunctionDetail | null) {
  const triggers = (detail?.Triggers || detail?.triggers || [])
    .map(timerTrigger)
    .filter((timer): timer is TimerTrigger => Boolean(timer));
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

export async function listCloudbaseFunctions(
  service: CloudbaseFunctionService,
  user: CloudbaseFunctionUser,
  projectId: string,
  input: { environment?: unknown } = {},
) {
  await service.member(user, projectId, false);
  const environment = String(input.environment || "development");
  const { manager, envId } = (await getCloudbaseManager(service, projectId, environment)) as {
    manager: CloudbaseFunctionsManager;
    envId: unknown;
  };
  const rows = (await callProvider("列举 CloudBase 云函数", () =>
    manager.functions.listFunctions(100, 0),
  )) as Record<string, unknown>[];
  const functions = await Promise.all(
    (rows || []).map(async (row) => {
      const name = row.FunctionName || row.name;
      if (!name) return null;
      let detail: ProviderFunctionDetail | null = null;
      try {
        detail = await callProvider(`读取 CloudBase 云函数 ${name}`, () =>
          manager.functions.getFunctionDetail(String(name)),
        );
      } catch (error) {
        detail = { StatusDesc: errorLike(error).message };
      }
      return publicFunction(row, detail);
    }),
  );
  return { environment, envId, functions: functions.filter(Boolean) };
}

/** `catch` 参数是 `unknown`；这里只取代码真正读到的 `message`。 */
function errorLike(error: unknown): { message?: string } {
  return typeof error === "object" && error !== null ? (error as { message?: string }) : {};
}

export async function deployDevelopmentCloudbaseFunction(
  service: CloudbaseFunctionService,
  user: CloudbaseFunctionUser,
  projectId: string,
  functionValue: unknown,
  input: unknown = {},
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
      timers: z
        .array(
          z.object({
            name: z.string().trim().regex(TIMER_NAME),
            schedule: z.string().trim().min(1).max(128),
          }),
        )
        .max(MAX_TIMER_TRIGGERS)
        .optional(),
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

export async function createCloudbaseTimer(
  service: CloudbaseFunctionService,
  user: CloudbaseFunctionUser,
  projectId: string,
  functionValue: unknown,
  input: unknown = {},
) {
  await service.member(user, projectId, true, service.db, true);
  const name = functionName(functionValue);
  const data = z
    .object({
      environment: z.enum(["development", "production"]).default("development"),
      name: z.string().trim().regex(TIMER_NAME),
      schedule: z.string().trim().min(1).max(128),
    })
    .parse(input || {});
  if (data.schedule.split(/\s+/).length !== 7) {
    throw new HttpError(400, "Cron 表达式需要 7 个字段：秒 分 时 日 月 星期 年");
  }
  const { manager, envId } = (await getCloudbaseManager(service, projectId, data.environment)) as {
    manager: CloudbaseFunctionsManager;
    envId: unknown;
  };
  const detail = (await callProvider(`读取 CloudBase 云函数 ${name}`, () =>
    manager.functions.getFunctionDetail(name),
  )) as ProviderFunctionDetail;
  const timers = (detail?.Triggers || detail?.triggers || [])
    .map(timerTrigger)
    .filter((timer): timer is TimerTrigger => Boolean(timer));
  if (timers.some((timer) => timer.name === data.name)) {
    throw new HttpError(409, `定时触发器 ${data.name} 已存在`);
  }
  if (timers.length >= MAX_TIMER_TRIGGERS) {
    throw new HttpError(409, `一个 CloudBase 云函数最多可配置 ${MAX_TIMER_TRIGGERS} 个定时触发器`);
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
  service: CloudbaseFunctionService,
  user: CloudbaseFunctionUser,
  projectId: string,
  functionValue: unknown,
  triggerValue: unknown,
  input: { environment?: unknown } = {},
) {
  await service.member(user, projectId, true, service.db, true);
  const name = functionName(functionValue);
  const triggerName = functionName(triggerValue);
  const environment = z
    .enum(["development", "production"])
    .default("development")
    .parse(input.environment);
  const { manager, envId } = (await getCloudbaseManager(service, projectId, environment)) as {
    manager: CloudbaseFunctionsManager;
    envId: unknown;
  };
  await callProvider("停用定时任务", () =>
    manager.functions.deleteFunctionTrigger(name, triggerName),
  );
  return { environment, envId, functionName: name, triggerName, enabled: false };
}

export async function promoteCloudbaseFunction(
  service: CloudbaseFunctionService,
  actor: CloudbaseFunctionUser,
  projectId: string,
  request: { resourceName?: unknown; sourceHash?: unknown },
) {
  await service.member(actor, projectId, true, service.db, true);
  const name = functionName(request.resourceName);
  const runtime = await loadProjectMiniProgramRuntime(service, projectId);
  const source = resolveCloudbaseEnv(runtime, "development");
  const target = resolveCloudbaseEnv(runtime, "production");
  const workspaceSource = await loadCloudbaseFunctionSource(service, projectId, name);
  if (request.sourceHash && request.sourceHash !== workspaceSource.sourceHash) {
    throw new HttpError(409, "CloudBase 云函数源码已变化，请重新提交发布申请");
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
