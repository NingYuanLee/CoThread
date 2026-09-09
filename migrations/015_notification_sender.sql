ALTER TABLE notifications
 ADD COLUMN sender_name VARCHAR(80) NOT NULL DEFAULT '系统通知',
 ADD INDEX notification_kind_page(user_id,kind,created_at,id);

UPDATE notifications n JOIN messages m ON m.id=n.message_id JOIN users u ON u.id=m.author_id
 SET n.sender_name=IF(m.source='assistant','小祥',u.name);
