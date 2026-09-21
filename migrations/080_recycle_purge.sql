ALTER TABLE artifacts
  ADD COLUMN purged_at DATETIME(3) NULL AFTER deleted_at;
ALTER TABLE version_recycle
  ADD COLUMN purged_at DATETIME(3) NULL;
