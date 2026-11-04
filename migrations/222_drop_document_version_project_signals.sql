-- 项目进程不再收文档类信号：文件索引与关联记忆已有独立作业与展示，避免重复且证据更弱。
-- 清掉历史遗留的 document_version 队列行（来源清理逻辑仍保留，用于其它历史数据）。
DELETE FROM agent_project_memory_queue WHERE source_kind='document_version';
