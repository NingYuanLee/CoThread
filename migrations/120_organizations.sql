CREATE TABLE organizations (
 id CHAR(36) PRIMARY KEY,
 parent_id CHAR(36) NULL,
 name VARCHAR(80) NOT NULL,
 sort_order INT NOT NULL DEFAULT 0,
 archived_at DATETIME(3) NULL,
 created_by CHAR(36) NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 INDEX (parent_id, sort_order),
 FOREIGN KEY (parent_id) REFERENCES organizations(id),
 FOREIGN KEY (created_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE org_members (
 org_id CHAR(36) NOT NULL,
 user_id CHAR(36) NOT NULL,
 kind ENUM('primary','secondary') NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
 PRIMARY KEY (org_id, user_id),
 INDEX (user_id, kind),
 FOREIGN KEY (org_id) REFERENCES organizations(id),
 FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE project_org_links (
 project_id CHAR(36) NOT NULL,
 org_id CHAR(36) NOT NULL,
 role ENUM('host','participant') NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 PRIMARY KEY (project_id, org_id),
 INDEX (org_id, role),
 FOREIGN KEY (project_id) REFERENCES projects(id),
 FOREIGN KEY (org_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE org_change_logs (
 id CHAR(36) PRIMARY KEY,
 actor_user_id CHAR(36) NOT NULL,
 action VARCHAR(80) NOT NULL,
 target_id CHAR(36) NOT NULL,
 details JSON NOT NULL,
 created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
 INDEX (target_id, created_at),
 FOREIGN KEY (actor_user_id) REFERENCES users(id),
 FOREIGN KEY (target_id) REFERENCES organizations(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
