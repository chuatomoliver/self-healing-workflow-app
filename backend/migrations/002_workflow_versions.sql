CREATE TABLE IF NOT EXISTS workflow_versions (
  workflow_id char(36) CHARACTER SET ascii NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  draft json NOT NULL CHECK (JSON_TYPE(draft) = 'OBJECT'),
  created_at datetime(6) NOT NULL,
  PRIMARY KEY (workflow_id, version),
  CONSTRAINT workflow_versions_workflow_fk FOREIGN KEY (workflow_id) REFERENCES workflows(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
