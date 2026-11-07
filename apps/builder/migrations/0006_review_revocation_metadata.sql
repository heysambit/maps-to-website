ALTER TABLE review_rounds ADD COLUMN superseded_at TEXT;
ALTER TABLE review_rounds ADD COLUMN revoked_at TEXT;
ALTER TABLE review_rounds ADD COLUMN revoked_by TEXT;
ALTER TABLE review_grants ADD COLUMN revoked_by TEXT;
