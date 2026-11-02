CREATE TABLE IF NOT EXISTS workflows (
  id char(36) CHARACTER SET ascii PRIMARY KEY,
  title varchar(200) NOT NULL,
  version integer NOT NULL CHECK (version > 0),
  created_at datetime(6) NOT NULL,
  updated_at datetime(6) NOT NULL,
  INDEX workflows_updated_at_idx (updated_at DESC, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
