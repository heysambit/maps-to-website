CREATE TABLE IF NOT EXISTS release_records (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_hostname TEXT NOT NULL,
  revision_id TEXT NOT NULL REFERENCES frozen_revisions(id),
  revision_hash TEXT NOT NULL,
  review_id TEXT NOT NULL,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('verified')),
  payment_reference TEXT NOT NULL,
  authority_reference TEXT NOT NULL,
  hostname_evidence TEXT NOT NULL,
  renderer_version TEXT NOT NULL,
  bundle_key TEXT NOT NULL UNIQUE,
  bundle_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('queued','building','scanning','ready','deploying','unknown','needs_reconciliation','verifying','live','failed','rolling_back','rolled_back','takedown_pending','taken_down')),
  provider_version TEXT,
  provider_marker TEXT,
  build_hash TEXT,
  previous_release_id TEXT REFERENCES release_records(id),
  requested_by TEXT NOT NULL,
  requested_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(project_id, target_hostname, revision_id, review_id)
);
CREATE TABLE IF NOT EXISTS release_locks (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  target_hostname TEXT NOT NULL,
  release_id TEXT NOT NULL UNIQUE REFERENCES release_records(id) ON DELETE CASCADE,
  acquired_at TEXT NOT NULL,
  PRIMARY KEY(project_id, target_hostname)
);
CREATE TABLE IF NOT EXISTS release_targets (
  target_hostname TEXT PRIMARY KEY,
  current_release_id TEXT REFERENCES release_records(id),
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS release_audit (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  release_id TEXT NOT NULL REFERENCES release_records(id) ON DELETE CASCADE,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  status TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS release_records_project_created ON release_records(project_id, requested_at DESC);
CREATE TABLE IF NOT EXISTS release_payment_evidence (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  payment_status TEXT NOT NULL CHECK (payment_status IN ('missing','verified','reversed')),
  payment_reference TEXT NOT NULL,
  recorded_by TEXT NOT NULL,
  recorded_at TEXT NOT NULL
);
