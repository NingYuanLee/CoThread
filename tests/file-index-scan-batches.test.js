import { test } from "node:test";
import assert from "node:assert/strict";
import { listFileIndexDiscoveryHistory } from "../server/file-index-jobs.js";

test("扫描记录按批次筛选时拒绝非法批次标识", async () => {
  await assert.rejects(
    listFileIndexDiscoveryHistory(null, "project", { batchId: "not-a-uuid" }),
    /无效的扫描批次/,
  );
});
