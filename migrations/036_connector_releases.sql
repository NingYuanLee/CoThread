CREATE TABLE connector_releases (
  id CHAR(36) PRIMARY KEY,
  version VARCHAR(40) NOT NULL UNIQUE,
  filename VARCHAR(160) NOT NULL,
  size_bytes BIGINT UNSIGNED NOT NULL,
  sha256 CHAR(64) NOT NULL,
  signature TEXT NOT NULL,
  download_url TEXT NOT NULL,
  created_by CHAR(36) NOT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX connector_releases_created (created_at),
  FOREIGN KEY (created_by) REFERENCES users(id)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;

CREATE TABLE connector_release_chunks (
  release_id CHAR(36) NOT NULL,
  part_number INT NOT NULL,
  content MEDIUMBLOB NOT NULL,
  PRIMARY KEY (release_id,part_number),
  FOREIGN KEY (release_id) REFERENCES connector_releases(id) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
