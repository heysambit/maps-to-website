ALTER TABLE media_assets ADD COLUMN sha256 TEXT;
CREATE UNIQUE INDEX media_assets_project_digest_idx ON media_assets(project_id, sha256) WHERE sha256 IS NOT NULL;

CREATE TABLE frozen_revisions (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  content_hash TEXT NOT NULL,
  template_version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(project_id, version)
);

CREATE TABLE review_rounds (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  revision_id TEXT NOT NULL REFERENCES frozen_revisions(id),
  round_no INTEGER NOT NULL CHECK(round_no > 0),
  status TEXT NOT NULL CHECK(status IN ('pending', 'approved', 'changes_requested', 'superseded', 'revoked', 'expired')),
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  superseded_by TEXT,
  UNIQUE(project_id, round_no)
);
CREATE INDEX review_rounds_revision_idx ON review_rounds(revision_id, round_no DESC);

CREATE TABLE review_grants (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES review_rounds(id) ON DELETE CASCADE,
  reviewer_name TEXT NOT NULL CHECK(length(reviewer_name) BETWEEN 1 AND 120),
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('viewer', 'approver')),
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(review_id, email)
);
CREATE INDEX review_grants_email_idx ON review_grants(email, review_id);

CREATE TABLE review_decisions (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL UNIQUE REFERENCES review_rounds(id),
  revision_id TEXT NOT NULL REFERENCES frozen_revisions(id),
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('approved', 'changes_requested')),
  message TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TRIGGER review_decisions_no_update BEFORE UPDATE ON review_decisions BEGIN
  SELECT RAISE(ABORT, 'review decisions are immutable');
END;
CREATE TRIGGER review_decisions_no_delete BEFORE DELETE ON review_decisions BEGIN
  SELECT RAISE(ABORT, 'review decisions are immutable');
END;
