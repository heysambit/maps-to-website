CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL CHECK (length(label) BETWEEN 1 AND 120),
  created_at TEXT NOT NULL
);

CREATE TABLE drafts (
  project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL CHECK (version >= 0),
  content_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX drafts_updated_at_idx ON drafts(updated_at);
