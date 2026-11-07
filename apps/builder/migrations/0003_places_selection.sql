ALTER TABLE projects ADD COLUMN selected_place_id TEXT;
ALTER TABLE projects ADD COLUMN place_selected_at TEXT;
ALTER TABLE projects ADD COLUMN place_selected_by TEXT;
CREATE TABLE places_audit (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  actor_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK (action IN ('lookup', 'selected', 'manual_fallback')),
  outcome TEXT NOT NULL CHECK (length(outcome) <= 32),
  created_at TEXT NOT NULL
);
CREATE INDEX places_audit_project_time_idx ON places_audit(project_id, created_at);
