ALTER TABLE agent_tasks
  ADD COLUMN thread_number SMALLINT UNSIGNED NULL AFTER origin_thread_id;

UPDATE agent_tasks t
JOIN (
  SELECT id,
    ROW_NUMBER() OVER (PARTITION BY origin_thread_id ORDER BY created_at, id) AS rn
  FROM agent_tasks
  WHERE origin_thread_id IS NOT NULL
) numbered ON numbered.id = t.id
SET t.thread_number = numbered.rn;

CREATE UNIQUE INDEX agent_tasks_thread_number
  ON agent_tasks (origin_thread_id, thread_number);
