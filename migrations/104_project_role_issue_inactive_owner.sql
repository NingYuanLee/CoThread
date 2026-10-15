ALTER TABLE project_role_migration_issues
  MODIFY issue_type ENUM('no_legacy_owner','multiple_legacy_owners','inactive_legacy_owner') NOT NULL;
