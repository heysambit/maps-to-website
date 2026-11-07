CREATE TABLE IF NOT EXISTS cms_seed_markers (
  release_id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  revision_id TEXT NOT NULL,
  revision_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('seeding', 'failed', 'seeded')),
  lease_token TEXT,
  lease_until TEXT,
  started_at TEXT NOT NULL,
  completed_at TEXT,
  error_code TEXT
);

CREATE INDEX IF NOT EXISTS cms_seed_markers_project ON cms_seed_markers(project_id, status);
