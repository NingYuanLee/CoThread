ALTER TABLE members
 ADD COLUMN tab_visible BOOLEAN NOT NULL DEFAULT FALSE,
 ADD COLUMN tab_opened_at DATETIME(6) NULL,
 ADD COLUMN tab_pinned_at DATETIME(6) NULL;

UPDATE members m JOIN projects p ON p.id=m.project_id
 SET m.tab_visible=TRUE,m.tab_opened_at=p.created_at;
