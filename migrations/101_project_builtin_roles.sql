ALTER TABLE members
  MODIFY role ENUM('owner','project_admin','member','viewer') NOT NULL;

ALTER TABLE projects
  ADD COLUMN project_leader_id CHAR(36) NULL AFTER created_by,
  ADD INDEX(project_leader_id),
  ADD CONSTRAINT fk_projects_project_leader FOREIGN KEY(project_leader_id) REFERENCES users(id);

UPDATE projects p
JOIN (
  SELECT m.project_id, MIN(m.user_id) user_id
  FROM members m JOIN users u ON u.id=m.user_id
  WHERE m.role='owner'
  GROUP BY m.project_id
  HAVING COUNT(*)=1 AND SUM(u.disabled_at IS NULL)=1
) legacy_owner ON legacy_owner.project_id=p.id
SET p.project_leader_id=legacy_owner.user_id;

CREATE TABLE IF NOT EXISTS project_role_migration_issues (
  project_id CHAR(36) PRIMARY KEY,
  issue_type ENUM('no_legacy_owner','multiple_legacy_owners','inactive_legacy_owner') NOT NULL,
  candidate_user_ids JSON NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY(project_id) REFERENCES projects(id) ON DELETE CASCADE
);

INSERT INTO project_role_migration_issues(project_id,issue_type,candidate_user_ids)
SELECT p.id,
  CASE
    WHEN COUNT(m.user_id)=0 THEN 'no_legacy_owner'
    WHEN COUNT(m.user_id)>1 THEN 'multiple_legacy_owners'
    ELSE 'inactive_legacy_owner'
  END,
  CASE WHEN COUNT(m.user_id)=0 THEN JSON_ARRAY() ELSE JSON_ARRAYAGG(m.user_id) END
FROM projects p
LEFT JOIN members m ON m.project_id=p.id AND m.role='owner'
WHERE p.project_leader_id IS NULL
GROUP BY p.id;

UPDATE members m
JOIN projects p ON p.id=m.project_id
SET m.role='member'
WHERE m.role='owner' AND p.project_leader_id=m.user_id;

UPDATE members m
JOIN projects p ON p.id=m.project_id
SET m.role='project_admin'
WHERE m.role='owner' AND p.project_leader_id IS NULL;
