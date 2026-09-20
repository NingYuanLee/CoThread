ALTER TABLE members
 ADD COLUMN joined_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6);

UPDATE members m JOIN projects p ON p.id=m.project_id
 SET m.joined_at=COALESCE(m.tab_opened_at,p.created_at);
