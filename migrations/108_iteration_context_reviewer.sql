ALTER TABLE iteration_context_changes
  ADD COLUMN reviewed_by CHAR(36) NULL AFTER changed_by;
