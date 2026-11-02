CREATE TABLE IF NOT EXISTS workflow_runs (
  id char(36) CHARACTER SET ascii PRIMARY KEY,
  workflow_id char(36) CHARACTER SET ascii NOT NULL,
  workflow_version integer NOT NULL,
  revision integer NOT NULL,
  status varchar(16) CHARACTER SET ascii NOT NULL CHECK (status IN ('queued', 'preparing', 'running', 'succeeded', 'failed', 'unknown', 'cancelled')),
  request_fingerprint char(64) CHARACTER SET ascii NOT NULL,
  document JSON NOT NULL,
  created_at datetime(6) NOT NULL,
  updated_at datetime(6) NOT NULL,
  INDEX run_history (workflow_id, created_at),
  CONSTRAINT run_workflow_version_fk FOREIGN KEY (workflow_id, workflow_version) REFERENCES workflow_versions(workflow_id, version)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
