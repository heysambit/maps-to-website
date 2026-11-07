CREATE TABLE IF NOT EXISTS workspace_status (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  mode TEXT NOT NULL CHECK (mode IN ('fixture'))
);
INSERT OR IGNORE INTO workspace_status (id, mode) VALUES (1, 'fixture');
