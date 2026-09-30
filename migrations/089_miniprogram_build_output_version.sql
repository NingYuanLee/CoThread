ALTER TABLE miniprogram_builds
  ADD COLUMN output_version_id CHAR(36) NULL AFTER output_folder_id;
