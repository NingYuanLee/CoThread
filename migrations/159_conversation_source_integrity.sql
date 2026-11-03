-- 保存写入时核验过的消息指纹，不对消息加外键，删除后仍能检测。
CREATE TABLE conversation_memory_source_snapshots (
  page_id CHAR(36) NOT NULL,
  message_id CHAR(36) NOT NULL,
  body_sha256 CHAR(64) NOT NULL,
  verified_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY(page_id,message_id),
  KEY conversation_source_message (message_id),
  CONSTRAINT fk_conversation_source_page FOREIGN KEY (page_id) REFERENCES wiki_pages(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

-- 为已写入的本轮联合记忆补充仍可读取的来源；缺失来源以特殊指纹保留为待核对。
INSERT INTO conversation_memory_source_snapshots(page_id,message_id,body_sha256)
SELECT DISTINCT r.page_id,s.source_id,COALESCE((SELECT wm.body_sha256 FROM conversation_window_messages wm
  JOIN conversation_memory_windows w ON w.id=wm.window_id WHERE wm.message_id=s.source_id
  ORDER BY w.created_at DESC LIMIT 1),REPEAT('0',64))
FROM conversation_memory_revisions r JOIN wiki_page_sources s ON s.page_id=r.page_id AND s.source_kind='message'
;
