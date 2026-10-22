CREATE TABLE IF NOT EXISTS platform_model_settings (
  id CHAR(36) NOT NULL PRIMARY KEY,
  singleton TINYINT NOT NULL DEFAULT 1,
  version INT UNSIGNED NOT NULL,
  base_url VARCHAR(512) NOT NULL,
  model_name VARCHAR(191) NOT NULL,
  reasoning_effort VARCHAR(16) NOT NULL,
  api_key_ciphertext TEXT NOT NULL,
  knowledge_override TINYINT NOT NULL DEFAULT 0,
  knowledge_base_url VARCHAR(512) NULL,
  knowledge_model_name VARCHAR(191) NULL,
  knowledge_reasoning_effort VARCHAR(16) NULL,
  knowledge_api_key_ciphertext TEXT NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_by CHAR(36) NULL,
  UNIQUE KEY platform_model_settings_singleton (singleton),
  CONSTRAINT platform_model_settings_one CHECK (singleton = 1),
  CONSTRAINT platform_model_settings_updated_by FOREIGN KEY (updated_by) REFERENCES users(id) ON DELETE SET NULL
);
