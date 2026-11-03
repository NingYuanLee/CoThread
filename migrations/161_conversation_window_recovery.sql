-- 冻结来源不可再读取时保留旧窗口，并用独立窗口重新核验未完成候选。
ALTER TABLE conversation_memory_windows ADD COLUMN invalidated_at DATETIME(3) NULL;
ALTER TABLE conversation_memory_windows ADD COLUMN predecessor_id CHAR(36) NULL;
ALTER TABLE conversation_memory_windows DROP INDEX conversation_window_range, ADD KEY conversation_window_range (thread_id,first_sequence,last_sequence);
CREATE UNIQUE INDEX conversation_window_predecessor ON conversation_memory_windows(predecessor_id);
