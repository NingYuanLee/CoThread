ALTER TABLE file_index_entries
  ADD COLUMN extracted_text TEXT NULL,
  ADD COLUMN recognition_note VARCHAR(1000) NULL;
