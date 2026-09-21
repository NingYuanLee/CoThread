import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FILE_CHUNK_SIZE,
  WEB_FILE_CHUNK_SIZE,
  webFileChunkSize,
} from "../shared/upload-limits.js";

test("browser uploads switch to larger chunks above the MCP slice", () => {
  assert.equal(webFileChunkSize(100), FILE_CHUNK_SIZE);
  assert.equal(webFileChunkSize(FILE_CHUNK_SIZE), FILE_CHUNK_SIZE);
  assert.equal(webFileChunkSize(FILE_CHUNK_SIZE + 1), WEB_FILE_CHUNK_SIZE);
  assert.equal(webFileChunkSize(5 * 1024 * 1024), WEB_FILE_CHUNK_SIZE);
});
