import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

/**
 * 部署路径引用的入口必须真实存在。
 *
 * 2026-11-06 首次发布 TypeScript 迁移后的版本时，线上发布卡在 ReleaseWaiting：
 * `scripts/ecs-promote.sh` 的完整性检查与探活启动都还写着 `server/index.js`，
 * 而包里已经是 `server/index.ts`（Node 24 原生擦除类型，不需要编译产物）。
 * 脚本因此判定「release 不完整」并删掉本轮目录，实例上 `current` 纹丝不动，
 * 而 OOS 侧只显示「等待你的操作」，原因要靠翻执行输出才看得见。
 *
 * 这条用例把「脚本实际会用到的入口」与「仓库里真实存在的文件」绑在一起，
 * 以后再改入口名就会在本地测试里直接失败，而不是等到线上发布才发现。
 */
const CHECKS = [
  ["scripts/ecs-promote.sh", /-f "\$RELEASE_DIR\/(server\/index\.[a-z]+)"/, "release 完整性检查"],
  ["scripts/ecs-promote.sh", /nohup node[^\n]*?(server\/index\.[a-z]+)/, "探活启动命令"],
  ["scripts/ecs-promote.sh", /ExecStart=.*?(server\/index\.[a-z]+)/, "systemd ExecStart"],
  ["Dockerfile", /CMD \[[^\]]*?(server\/index\.[a-z]+)/, "容器 CMD"],
];

test("部署脚本与容器入口指向的服务端入口真实存在", () => {
  for (const [file, pattern, label] of CHECKS) {
    const text = readFileSync(file, "utf8");
    const reference = pattern.exec(text)?.[1];
    assert.ok(reference, `${file} 的${label}没有指向服务端入口，先确认脚本是否被改坏`);
    assert.ok(
      existsSync(reference),
      `${file} 的${label}指向不存在的入口 ${reference}：服务端入口改名时必须同步改部署脚本`,
    );
  }
});

test("package.json 的启动脚本指向真实存在的入口", () => {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  for (const script of ["start", "dev:static"]) {
    const command = pkg.scripts?.[script];
    assert.ok(command, `package.json 缺少 ${script} 脚本`);
    const reference = /server\/index\.[a-z]+/.exec(command)?.[0];
    assert.ok(reference, `${script} 没有直接指向服务端入口`);
    assert.ok(existsSync(reference), `${script} 指向不存在的入口 ${reference}`);
  }
});

test("systemd 单元模板与 npm 启动方式用同一个入口", () => {
  const script = readFileSync("scripts/ecs-promote.sh", "utf8");
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const fromUnit = /ExecStart=.*(server\/index\.[a-z]+)/.exec(script)?.[1];
  const fromStart = /server\/index\.[a-z]+/.exec(pkg.scripts.start)?.[0];
  assert.equal(fromUnit, fromStart, "systemd 单元与 npm start 的入口必须一致");
});
