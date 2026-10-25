import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { readDocumentContent } from "../server/documents/index.js";
import { createMcpServer, mcpReadToolSpecs } from "../server/mcp.js";
import { elderDocumentReadText } from "../server/wiki-questions.js";
import { FILE_CHUNK_SIZE } from "../shared/upload-limits.js";

const textId = "ad62dc74-57ec-46ce-8a60-67e96832817b";
const binaryId = "bd62dc74-57ec-46ce-8a60-67e96832817b";
const projectId = "4cfe4fff-aab4-418d-8e92-80ebd2d7f63b";

test("readDocumentContent returns a text slice and withholds binary bytes", () => {
  const body = "甲".repeat(20) + "尾";
  const text = readDocumentContent(
    {
      id: textId,
      artifact_id: "artifact",
      project_id: projectId,
      title: "说明",
      filename: "note.md",
      version: 3,
      mime: "text/markdown",
      sha256: "ab".repeat(32),
      byte_size: Buffer.byteLength(body),
      folder_id: null,
      content: Buffer.from(body),
    },
    { offset: 0, limit: 10 },
  );
  assert.equal(text.text, true);
  assert.equal(text.content, "甲".repeat(10));
  assert.equal(text.truncated, true);
  assert.equal(text.totalChars, 21);
  assert.equal(text.nextOffset, 10);
  assert.equal("contentBase64" in text, false);
  const rest = readDocumentContent(
    {
      id: textId,
      filename: "note.md",
      mime: "text/markdown",
      sha256: "ab".repeat(32),
      byte_size: Buffer.byteLength(body),
      content: Buffer.from(body),
    },
    { offset: 20, limit: 10 },
  );
  assert.equal(rest.content, "尾");
  assert.equal(rest.truncated, false);
  assert.equal(rest.nextOffset, null);

  const json = readDocumentContent({
    id: textId,
    filename: "data.bin",
    mime: "application/json",
    sha256: "cd".repeat(32),
    byte_size: 2,
    content: Buffer.from("[]"),
  });
  assert.equal(json.text, true);
  assert.equal(json.content, "[]");

  const binary = readDocumentContent({
    id: binaryId,
    title: "图",
    filename: "pic.png",
    mime: "image/png",
    sha256: "ef".repeat(32),
    byte_size: 4,
    version: 1,
    content: Buffer.from([0, 1, 2, 3]),
  });
  assert.equal(binary.text, false);
  assert.equal(binary.mime, "image/png");
  assert.equal(binary.byteSize, 4);
  assert.equal(binary.sha256, "ef".repeat(32));
  assert.equal("content" in binary, false);
  assert.equal("contentBase64" in binary, false);

  const nul = readDocumentContent({
    id: textId,
    filename: "note.md",
    mime: "text/markdown",
    sha256: "ab".repeat(32),
    byte_size: 3,
    content: Buffer.from([0x61, 0x00, 0x62]),
  });
  assert.equal(nul.text, false);
  assert.equal("content" in nul, false);
});

test("MCP read_document returns text and keeps binary downloads on get_document_version", async () => {
  const spec = mcpReadToolSpecs().find((tool) => tool.name === "read_document");
  assert.equal(spec.parameters.versionId.required, true);
  assert.equal(spec.parameters.offset.type, "number");
  assert.equal(spec.parameters.limit.type, "number");
  assert.ok(!spec.parameters.offset.required);
  const body = "正文" + "续".repeat(7000);
  const service = {
    version: async (_user, versionId, options = {}) => {
      const binary = versionId === binaryId;
      const content = binary ? Buffer.from("png") : Buffer.from(body);
      return {
        id: versionId,
        artifact_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
        project_id: projectId,
        title: binary ? "图" : "说明",
        filename: binary ? "pic.png" : "note.md",
        version: 2,
        mime: binary ? "image/png" : "text/markdown",
        sha256: "ab".repeat(32),
        byte_size: content.length,
        folder_id: null,
        content: options.includeContent === false ? undefined : content,
      };
    },
  };
  const server = createMcpServer(service, { id: "user" });
  const client = new Client({ name: "read-document", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const call = async (name, args) => {
      const result = await client.callTool({ name, arguments: args });
      assert.ok(!result.isError, result.content?.[0]?.text);
      return JSON.parse(result.content[0].text);
    };
    const page = await call("read_document", { versionId: textId, limit: 4 });
    assert.equal(page.content, "正文续续");
    assert.equal(page.truncated, true);
    assert.equal(page.nextOffset, 4);
    assert.equal("contentBase64" in page, false);
    const image = await call("read_document", { versionId: binaryId });
    assert.equal(image.text, false);
    assert.equal("content" in image, false);
    assert.equal("contentBase64" in image, false);
    const downloaded = await call("get_document_version", { versionId: binaryId });
    assert.equal(Buffer.from(downloaded.contentBase64, "base64").toString(), "png");
    const shown = elderDocumentReadText(page);
    assert.match(shown, /正文续续/);
    assert.match(shown, /offset=4/);
    assert.equal(shown.includes("contentOmitted"), false);
    assert.equal(shown.includes("contentBase64"), false);
  } finally {
    await client.close();
    await server.close();
  }
});

test("get_document_version resumes by byte offset without returning the whole file", async () => {
  const bytes = Buffer.alloc(FILE_CHUNK_SIZE + 10);
  for (let index = 0; index < bytes.length; index++) bytes[index] = index % 251;
  const sha = createHash("sha256").update(bytes).digest("hex");
  const ranges = [];
  const service = {
    version: async (_user, versionId, options = {}) => {
      const row = {
        id: versionId,
        byte_size: bytes.length,
        sha256: sha,
        filename: "blob.bin",
        mime: "application/octet-stream",
        version: 1,
      };
      if (options.includeContent === false) return row;
      ranges.push({ byteOffset: options.byteOffset, maxBytes: options.maxBytes });
      const start = options.byteOffset || 0;
      return { ...row, content: bytes.subarray(start, start + options.maxBytes) };
    },
  };
  const server = createMcpServer(service, { id: "user" });
  const client = new Client({ name: "download-range", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  const call = async (args) => {
    const result = await client.callTool({ name: "get_document_version", arguments: args });
    return {
      error: !!result.isError,
      data: result.isError ? result.content[0].text : JSON.parse(result.content[0].text),
    };
  };
  try {
    const parts = [];
    let offset = 0;
    for (let guard = 0; guard < 5; guard++) {
      const page = await call({ versionId: binaryId, offset });
      assert.equal(page.error, false, page.data);
      const chunk = Buffer.from(page.data.contentBase64, "base64");
      assert.equal(chunk.length, page.data.returned);
      assert.equal(chunk.length <= FILE_CHUNK_SIZE, true);
      assert.equal(createHash("sha256").update(chunk).digest("hex"), page.data.chunkSha256);
      assert.equal(page.data.sha256, sha);
      parts.push(chunk);
      if (page.data.complete) {
        assert.equal(page.data.nextOffset, null);
        break;
      }
      offset = page.data.nextOffset;
    }
    assert.equal(Buffer.concat(parts).equals(bytes), true);
    assert.deepEqual(ranges, [
      { byteOffset: 0, maxBytes: FILE_CHUNK_SIZE },
      { byteOffset: FILE_CHUNK_SIZE, maxBytes: 10 },
    ]);
    const middle = await call({ versionId: binaryId, offset: FILE_CHUNK_SIZE });
    assert.equal(
      Buffer.from(middle.data.contentBase64, "base64").equals(bytes.subarray(FILE_CHUNK_SIZE)),
      true,
    );
    const past = await call({ versionId: binaryId, offset: bytes.length + 1 });
    assert.equal(past.error, true);
    assert.match(String(past.data), /偏移已经超过文件大小/);
  } finally {
    await client.close();
    await server.close();
  }
});
