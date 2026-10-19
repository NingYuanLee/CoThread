-- 侧表代次。聊天轮询带上 sideRevision 且与本列一致时，不再扫描六张侧表。
-- 代次由触发器推进，避免漏掉某条写入路径。
ALTER TABLE threads ADD COLUMN side_revision BIGINT UNSIGNED NOT NULL DEFAULT 0;

CREATE TRIGGER replies_side_ai AFTER INSERT ON assistant_replies FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER replies_side_au AFTER UPDATE ON assistant_replies FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER replies_side_ad AFTER DELETE ON assistant_replies FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=OLD.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER requests_side_ai AFTER INSERT ON agent_requests FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER requests_side_au AFTER UPDATE ON agent_requests FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER requests_side_ad AFTER DELETE ON agent_requests FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=OLD.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER updates_side_ai AFTER INSERT ON agent_task_updates FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER updates_side_au AFTER UPDATE ON agent_task_updates FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=NEW.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER updates_side_ad AFTER DELETE ON agent_task_updates FOR EACH ROW
UPDATE threads t JOIN messages m ON m.id=OLD.message_id SET t.side_revision=t.side_revision+1 WHERE t.id=m.thread_id;

CREATE TRIGGER reviews_side_ai AFTER INSERT ON reviews FOR EACH ROW
UPDATE threads t JOIN versions v ON v.id=NEW.version_id AND v.thread_id=t.id SET t.side_revision=t.side_revision+1;

CREATE TRIGGER reviews_side_au AFTER UPDATE ON reviews FOR EACH ROW
UPDATE threads t JOIN versions v ON v.id=NEW.version_id AND v.thread_id=t.id SET t.side_revision=t.side_revision+1;

CREATE TRIGGER reviews_side_ad AFTER DELETE ON reviews FOR EACH ROW
UPDATE threads t JOIN versions v ON v.id=OLD.version_id AND v.thread_id=t.id SET t.side_revision=t.side_revision+1;

CREATE TRIGGER ctasks_side_ai AFTER INSERT ON connector_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;

CREATE TRIGGER ctasks_side_au AFTER UPDATE ON connector_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;

CREATE TRIGGER ctasks_side_ad AFTER DELETE ON connector_tasks FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=OLD.thread_id;

CREATE TRIGGER runs_side_ai AFTER INSERT ON sandbox_runs FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;

CREATE TRIGGER runs_side_au AFTER UPDATE ON sandbox_runs FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=NEW.thread_id;

CREATE TRIGGER runs_side_ad AFTER DELETE ON sandbox_runs FOR EACH ROW
UPDATE threads SET side_revision=side_revision+1 WHERE id=OLD.thread_id;
