ALTER TABLE messages
  ADD COLUMN folder_refs JSON NULL AFTER refs;
