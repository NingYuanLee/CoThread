-- 先把两条旧队列尚未处理的可读取消息合并为按迭代的联合分析队列。
-- 成员队列的序号是全局消息序号；只迁移该成员自己的 human/local_ai 发言。
INSERT INTO conversation_memory_queue(thread_id,project_id,first_sequence,last_sequence)
SELECT pending.thread_id,pending.project_id,MIN(pending.sequence),MAX(pending.sequence)
FROM (
  SELECT m.thread_id,t.project_id,m.sequence
  FROM agent_project_memory_queue q JOIN messages m ON m.id=q.source_id
  JOIN threads t ON t.id=m.thread_id AND t.project_id=q.project_id
  WHERE q.source_kind='message' AND m.source<>'system' AND m.body<>''
  UNION ALL
  SELECT m.thread_id,t.project_id,m.sequence
  FROM agent_member_memory_queue q
  LEFT JOIN agent_member_summaries s ON s.project_id=q.project_id AND s.user_id=q.user_id
  JOIN threads t ON t.project_id=q.project_id
  JOIN messages m ON m.thread_id=t.id AND m.author_id=q.user_id
    AND m.sequence>COALESCE(s.through_sequence,0) AND m.sequence<=q.pending_through_sequence
  WHERE m.source IN ('human','local_ai') AND m.body<>''
) pending
GROUP BY pending.thread_id,pending.project_id
ON DUPLICATE KEY UPDATE
  first_sequence=LEAST(first_sequence,VALUES(first_sequence)),
  last_sequence=GREATEST(last_sequence,VALUES(last_sequence));

-- 只清理已能在新队列定位的旧消息；丢失原消息的候选保留供排查。
DELETE q FROM agent_project_memory_queue q JOIN messages m ON m.id=q.source_id
JOIN threads t ON t.id=m.thread_id AND t.project_id=q.project_id
JOIN conversation_memory_queue cq ON cq.thread_id=t.id AND cq.project_id=q.project_id
  AND m.sequence BETWEEN cq.first_sequence AND cq.last_sequence
WHERE q.source_kind='message';

-- 上述事务外 DDL 迁移按语句顺序执行；成员队列在成功入队后才清除。
-- 没有本人成员发言的项是旧 @ 提及空队列，不包含可处理发言。
DELETE FROM agent_member_memory_queue;
