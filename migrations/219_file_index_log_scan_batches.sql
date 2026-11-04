-- 扫描批次补充“日志触发”来源：日志驱动的单文件核对也归入批次（按 10 分钟窗口聚合）。
ALTER TABLE file_index_scan_batches
  MODIFY COLUMN trigger_type ENUM('schedule','manual','change','log') NOT NULL;

-- 历史明细没有批次归属：按项目 + 10 分钟时间窗口生成批次，再回填归属。
-- 批次 id 由项目与窗口确定性生成，重复执行只跳过已有行，便于中途失败后继续。
INSERT IGNORE INTO file_index_scan_batches(id,project_id,trigger_type,status,started_at,finished_at)
SELECT
  CONCAT(
    SUBSTRING(h,1,8),'-',SUBSTRING(h,9,4),'-',SUBSTRING(h,13,4),'-',
    SUBSTRING(h,17,4),'-',SUBSTRING(h,21,12)
  ),
  project_id,
  'log',
  'completed',
  MIN(created_at),
  MAX(created_at)
FROM (
  SELECT project_id,created_at,
    MD5(CONCAT(project_id,'#',FLOOR(UNIX_TIMESTAMP(created_at)/600))) h
  FROM file_index_discovery_items
  WHERE batch_id IS NULL
) buckets
GROUP BY project_id,h;

UPDATE file_index_discovery_items i
JOIN (
  SELECT
    project_id,
    bucket,
    CONCAT(
      SUBSTRING(h,1,8),'-',SUBSTRING(h,9,4),'-',SUBSTRING(h,13,4),'-',
      SUBSTRING(h,17,4),'-',SUBSTRING(h,21,12)
    ) id
  FROM (
    SELECT DISTINCT
      project_id,
      FLOOR(UNIX_TIMESTAMP(created_at)/600) bucket,
      MD5(CONCAT(project_id,'#',FLOOR(UNIX_TIMESTAMP(created_at)/600))) h
    FROM file_index_discovery_items
    WHERE batch_id IS NULL
  ) distributed
) batch_map
  ON batch_map.project_id=i.project_id
  AND batch_map.bucket=FLOOR(UNIX_TIMESTAMP(i.created_at)/600)
SET i.batch_id=batch_map.id
WHERE i.batch_id IS NULL;
