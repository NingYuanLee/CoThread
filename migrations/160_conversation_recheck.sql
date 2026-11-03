-- 同一消息范围允许显式重核；每次分析仍使用独立窗口和候选幂等键。
ALTER TABLE conversation_memory_windows DROP INDEX conversation_window_range,
  ADD KEY conversation_window_range (thread_id,first_sequence,last_sequence);
