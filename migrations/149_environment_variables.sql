CREATE TABLE personal_environment_variables (
  user_id CHAR(36) NOT NULL,
  var_key VARCHAR(64) NOT NULL,
  secret_cipher TEXT NOT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, var_key),
  CONSTRAINT fk_personal_env_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE project_environment_variables (
  project_id CHAR(36) NOT NULL,
  var_key VARCHAR(64) NOT NULL,
  secret_cipher TEXT NOT NULL,
  updated_by CHAR(36) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (project_id, var_key),
  CONSTRAINT fk_project_env_project FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  CONSTRAINT fk_project_env_editor FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);

INSERT INTO personal_environment_variables (user_id, var_key, secret_cipher, updated_at)
SELECT user_id, skill_key, secret_cipher, updated_at FROM user_skill_credentials;

DROP TABLE user_skill_credentials;
