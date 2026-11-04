-- 扫描批次：一次项目扫描轮次的开始/结束、触发来源与状态。
-- 明细仍存 file_index_discovery_items，通过 batch_id 归属批次。日志驱动的单文件
-- 核对没有批次归属（batch_id 为空），它本身不是一次“扫描轮次”。
CREATE TABLE IF NOT EXISTS file_index_scan_batches (
  id CHAR(36) NOT NULL PRIMARY KEY,
  project_id CHAR(36) NOT NULL,
  trigger_type ENUM('schedule','manual','change') NOT NULL,
  status ENUM('running','completed','failed') NOT NULL DEFAULT 'running',
  started_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  finished_at DATETIME(3) NULL,
  error VARCHAR(1000) NULL,
  KEY file_index_scan_batches_history(project_id,started_at,id),
  KEY file_index_scan_batches_open(status,started_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE file_index_project_reconciliations ADD COLUMN batch_id CHAR(36) NULL;
ALTER TABLE file_index_reconcile_requests ADD COLUMN batch_id CHAR(36) NULL;
ALTER TABLE file_index_reconcile_requests ADD INDEX file_index_reconcile_batch(batch_id);
ALTER TABLE file_index_discovery_items ADD COLUMN batch_id CHAR(36) NULL;
ALTER TABLE file_index_discovery_items ADD INDEX file_index_discovery_batch(batch_id,created_at,id);
