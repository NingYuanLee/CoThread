ALTER TABLE miniprogram_release_requests
  ADD COLUMN batch_id CHAR(36) NULL AFTER id,
  ADD KEY idx_release_requests_batch (project_id, batch_id);
