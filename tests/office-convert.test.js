import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import JSZip from "jszip";
import { buildEncryptedOfficeFile, buildLegacyWordFile } from "./legacy-doc-fixture.js";
import { convertToOoxml, isOoxmlRendition, planOfficeRendition } from "../server/office-convert.ts";

async function buildDocxFixture() {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    '<w:document xmlns:w="urn:test"><w:p><w:r><w:t>预览正文</w:t></w:r></w:p></w:document>',
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

test("只有 OLE2 旧版 Office 需要生成预览派生文件", async () => {
  const plan = planOfficeRendition("批注.docx", buildLegacyWordFile({ text: "预览" }));
  assert.equal(plan.supported, true);
  assert.equal(plan.kind, "docx");
  assert.match(plan.filename, /\.docx$/);

  const docx = await buildDocxFixture();
  assert.equal(planOfficeRendition("正常.docx", docx).supported, false);
  assert.equal(planOfficeRendition("加密.docx", buildEncryptedOfficeFile()).supported, false);
  assert.equal(planOfficeRendition("空.docx", Buffer.alloc(0)).supported, false);
});

test("OOXML 产物按文件头与主文档部件校验", async () => {
  const docx = await buildDocxFixture();
  assert.equal(isOoxmlRendition(docx, "docx"), true);
  assert.equal(isOoxmlRendition(docx, "xlsx"), false);
  assert.equal(isOoxmlRendition(Buffer.from("not a zip"), "docx"), false);
});

test("配置 dsoffice 后端时转换旧版 doc，产物通过校验", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cothread-convert-test-"));
  const legacy = buildLegacyWordFile({ text: "预览" });
  try {
    const fixture = join(dir, "fixture.docx");
    await writeFile(fixture, await buildDocxFixture());
    const cli = join(dir, "fake-cli.mjs");
    await writeFile(
      cli,
      [
        'import { copyFile } from "node:fs/promises";',
        "const args = process.argv.slice(2);",
        'const output = args[args.indexOf("--output") + 1];',
        "await copyFile(process.env.FAKE_DOCX, output);",
      ].join("\n"),
      "utf8",
    );
    process.env.COTHREAD_DSOFFICE_CLI = cli;
    process.env.FAKE_DOCX = fixture;
    const plan = planOfficeRendition("批注.doc", legacy);
    const converted = await convertToOoxml({ content: legacy, plan });
    assert.equal(isOoxmlRendition(converted.content, "docx"), true);
    assert.match(converted.filename, /\.docx$/);
    assert.equal(converted.mime.includes("wordprocessingml"), true);
  } finally {
    delete process.env.COTHREAD_DSOFFICE_CLI;
    delete process.env.FAKE_DOCX;
    await rm(dir, { recursive: true, force: true });
  }
});

test("截断的旧版文件补零到扇区边界后再交给转换器", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cothread-convert-pad-"));
  const truncated = buildLegacyWordFile({ text: "截断", truncatedBy: 100 });
  try {
    const fixture = join(dir, "fixture.docx");
    await writeFile(fixture, await buildDocxFixture());
    const lengthFile = join(dir, "input-length.txt");
    const cli = join(dir, "len-cli.mjs");
    await writeFile(
      cli,
      [
        'import { copyFile, readFile, writeFile } from "node:fs/promises";',
        "const args = process.argv.slice(2);",
        'const input = args[args.indexOf("--input") + 1];',
        'const output = args[args.indexOf("--output") + 1];',
        "const bytes = await readFile(input);",
        "await writeFile(process.env.LEN_FILE, String(bytes.length));",
        "await copyFile(process.env.FAKE_DOCX, output);",
      ].join("\n"),
      "utf8",
    );
    process.env.COTHREAD_DSOFFICE_CLI = cli;
    process.env.FAKE_DOCX = fixture;
    process.env.LEN_FILE = lengthFile;
    const plan = planOfficeRendition("截断.doc", truncated);
    await convertToOoxml({ content: truncated, plan });
    const length = Number(await readFile(lengthFile, "utf8"));
    assert.equal(length % 512, 0);
    assert.ok(length > truncated.length);
  } finally {
    delete process.env.COTHREAD_DSOFFICE_CLI;
    delete process.env.FAKE_DOCX;
    delete process.env.LEN_FILE;
    await rm(dir, { recursive: true, force: true });
  }
});

test("转换进程失败时抛出可记录的原因", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cothread-convert-fail-"));
  const legacy = buildLegacyWordFile({ text: "失败" });
  try {
    const cli = join(dir, "fail-cli.mjs");
    await writeFile(cli, "process.exit(3);\n", "utf8");
    process.env.COTHREAD_DSOFFICE_CLI = cli;
    const plan = planOfficeRendition("批注.doc", legacy);
    await assert.rejects(() => convertToOoxml({ content: legacy, plan }), /退出码 3/);
  } finally {
    delete process.env.COTHREAD_DSOFFICE_CLI;
    await rm(dir, { recursive: true, force: true });
  }
});
