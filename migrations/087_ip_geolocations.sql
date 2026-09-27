CREATE TABLE IF NOT EXISTS ip_geolocations (
  start_ip INT UNSIGNED NOT NULL,
  end_ip INT UNSIGNED NOT NULL,
  country VARCHAR(80) NULL,
  province VARCHAR(80) NULL,
  city VARCHAR(80) NULL,
  district VARCHAR(80) NULL,
  PRIMARY KEY (start_ip, end_ip),
  INDEX idx_ip_geolocations_end (end_ip)
);
