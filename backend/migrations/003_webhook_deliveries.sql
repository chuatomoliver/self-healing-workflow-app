CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id char(36) CHARACTER SET ascii PRIMARY KEY,
  workflow_id char(36) CHARACTER SET ascii NOT NULL,
  workflow_version integer NOT NULL,
  webhook_id varchar(120) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  request_fingerprint char(64) CHARACTER SET ascii NOT NULL,
  status varchar(16) CHARACTER SET ascii NOT NULL CHECK (status IN ('pending', 'succeeded', 'failed', 'unknown')),
  http_status integer NULL,
  duration_ms integer NULL,
  error_code varchar(32) CHARACTER SET ascii NULL,
  created_at datetime(6) NOT NULL,
  completed_at datetime(6) NULL,
  INDEX delivery_history (workflow_id, webhook_id, created_at),
  CONSTRAINT webhook_delivery_version_fk FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_versions(workflow_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
