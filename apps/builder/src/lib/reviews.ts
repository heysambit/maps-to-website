import { sealRevision, toRenderModel, type Draft, type Revision } from '@studio/contracts';

export type ReviewRole = 'viewer' | 'approver';
export interface GrantInput { name: string; email: string; role: ReviewRole }
export interface ReviewSnapshot { revision: Revision; review: { id: string; projectId: string; roundNo: number; status: string; expiresAt: string }; grant: { id: string; name: string; email: string; role: ReviewRole; expiresAt: string; revokedAt: string | null }; decision?: { action: string; message: string; actorEmail: string; createdAt: string } }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

export function validateGrantInputs(value: unknown): value is GrantInput[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 20) return false;
  const emails = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== 'object') return false;
    const grant = item as Record<string, unknown>;
    if (typeof grant.name !== 'string' || !grant.name.trim() || grant.name.trim().length > 120 || typeof grant.email !== 'string' || grant.email.length > 254 || !EMAIL.test(grant.email.trim()) || !['viewer', 'approver'].includes(String(grant.role))) return false;
    const email = grant.email.trim().toLowerCase();
    if (emails.has(email)) return false;
    emails.add(email);
  }
  return true;
}

export async function createReviewRound(db: D1Database, projectId: string, baseVersion: number, grants: GrantInput[], actorEmail: string, nowMs = Date.now()) {
  const draftRow = await db.prepare('SELECT version, content_json FROM drafts WHERE project_id = ?').bind(projectId).first<{ version: number; content_json: string }>();
  if (!draftRow) return { status: 'not-found' as const };
  if (draftRow.version !== baseVersion) return { status: 'conflict' as const, currentVersion: draftRow.version };
  const draft = JSON.parse(draftRow.content_json) as Draft;
  const revision = await sealRevision(draft);
  const now = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + SEVEN_DAYS).toISOString();
  const roundId = crypto.randomUUID();
  const previous = await db.prepare('SELECT coalesce(max(round_no), 0) AS round_no FROM review_rounds WHERE project_id = ?').bind(projectId).first<{ round_no: number }>();
  const roundNo = (previous?.round_no || 0) + 1;

  const statements: D1PreparedStatement[] = [
    db.prepare(`INSERT INTO frozen_revisions (id, project_id, version, content_hash, template_version, content_json, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM drafts WHERE project_id = ? AND version = ?)
      ON CONFLICT(id) DO NOTHING`).bind(revision.id, projectId, revision.version, revision.hash, revision.templateVersion, JSON.stringify(revision), now, projectId, baseVersion),
    db.prepare(`INSERT INTO review_rounds (id, project_id, revision_id, round_no, status, created_by, created_at, expires_at)
      SELECT ?, ?, ?, ?, 'pending', ?, ?, ? WHERE EXISTS (SELECT 1 FROM drafts WHERE project_id = ? AND version = ?)
      AND EXISTS (SELECT 1 FROM frozen_revisions WHERE id = ? AND content_hash = ?)`)
      .bind(roundId, projectId, revision.id, roundNo, actorEmail, now, expiresAt, projectId, baseVersion, revision.id, revision.hash),
    db.prepare(`UPDATE review_rounds SET status = 'superseded', superseded_by = ?, superseded_at = ? WHERE project_id = ? AND id <> ?
      AND status IN ('pending', 'approved', 'changes_requested') AND EXISTS (SELECT 1 FROM review_rounds WHERE id = ?)`)
      .bind(roundId, now, projectId, roundId, roundId),
  ];
  const createdGrants: Array<GrantInput & { id: string; expiresAt: string }> = [];
  for (const grant of grants) {
    const grantId = crypto.randomUUID();
    createdGrants.push({ ...grant, id: grantId, email: grant.email.trim().toLowerCase(), expiresAt });
    statements.push(db.prepare(`INSERT INTO review_grants (id, review_id, reviewer_name, email, role, granted_by, created_at, expires_at)
      SELECT ?, ?, ?, ?, ?, ?, ?, ? WHERE EXISTS (SELECT 1 FROM review_rounds WHERE id = ? AND status = 'pending')`)
      .bind(grantId, roundId, grant.name.trim(), grant.email.trim().toLowerCase(), grant.role, actorEmail, now, expiresAt, roundId));
  }
  await db.batch(statements);
  const created = await db.prepare('SELECT id FROM review_rounds WHERE id = ?').bind(roundId).first<{ id: string }>();
  if (!created) return { status: 'conflict' as const, currentVersion: baseVersion };
  return { status: 'created' as const, revision, review: { id: roundId, projectId, roundNo, status: 'pending', expiresAt }, grants: createdGrants };
}

export async function getReviewForRevision(db: D1Database, revisionId: string, email: string, nowMs = Date.now()): Promise<ReviewSnapshot | null> {
  const now = new Date(nowMs).toISOString();
  const row = await db.prepare(`SELECT fr.id AS revision_id, fr.project_id, fr.version, fr.content_hash, fr.template_version, fr.content_json,
      rr.id AS review_id, rr.round_no, rr.status, rr.expires_at AS review_expires_at,
      rg.id AS grant_id, rg.reviewer_name, rg.email, rg.role, rg.expires_at AS grant_expires_at, rg.revoked_at,
      rd.action, rd.message, rd.actor_email, rd.created_at AS decision_created_at
    FROM frozen_revisions fr
    JOIN review_rounds rr ON rr.revision_id = fr.id
    JOIN review_grants rg ON rg.review_id = rr.id
    LEFT JOIN review_decisions rd ON rd.review_id = rr.id
    WHERE fr.id = ? AND lower(rg.email) = ?
      AND rr.id = (SELECT id FROM review_rounds WHERE revision_id = fr.id ORDER BY round_no DESC LIMIT 1)
      AND rr.status IN ('pending', 'approved', 'changes_requested')
      AND rr.expires_at > ? AND rg.expires_at > ? AND rg.revoked_at IS NULL`)
    .bind(revisionId, email.trim().toLowerCase(), now, now).first<Record<string, unknown>>();
  if (!row) return null;
  try {
    const revision = JSON.parse(String(row.content_json)) as Revision;
    if (revision.id !== row.revision_id || revision.projectId !== row.project_id || revision.version !== row.version || revision.hash !== row.content_hash || revision.templateVersion !== row.template_version) return null;
    await toRenderModel(revision);
    return {
      revision,
      review: { id: String(row.review_id), projectId: String(row.project_id), roundNo: Number(row.round_no), status: String(row.status), expiresAt: String(row.review_expires_at) },
      grant: { id: String(row.grant_id), name: String(row.reviewer_name), email: String(row.email), role: String(row.role) as ReviewRole, expiresAt: String(row.grant_expires_at), revokedAt: row.revoked_at ? String(row.revoked_at) : null },
      ...(row.action ? { decision: { action: String(row.action), message: String(row.message || ''), actorEmail: String(row.actor_email), createdAt: String(row.decision_created_at) } } : {}),
    };
  } catch { return null; }
}

export async function recordDecision(db: D1Database, snapshot: ReviewSnapshot, actorEmail: string, action: 'approved' | 'changes_requested', message: string, nowMs = Date.now()): Promise<boolean> {
  if (snapshot.grant.role !== 'approver' || snapshot.review.status !== 'pending') return false;
  const now = new Date(nowMs).toISOString();
  const updated = db.prepare(`UPDATE review_rounds SET status = ? WHERE id = ? AND revision_id = ? AND status = 'pending'
      AND expires_at > ? AND EXISTS (SELECT 1 FROM review_grants WHERE review_id = ? AND email = ? AND role = 'approver' AND revoked_at IS NULL AND expires_at > ?)`)
    .bind(action, snapshot.review.id, snapshot.revision.id, now, snapshot.review.id, actorEmail.trim().toLowerCase(), now);
  const decision = db.prepare(`INSERT INTO review_decisions (id, review_id, revision_id, actor_email, action, message, created_at)
      SELECT ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1`)
    .bind(crypto.randomUUID(), snapshot.review.id, snapshot.revision.id, actorEmail.trim().toLowerCase(), action, message.slice(0, 2000), now);
  const result = await db.batch([updated, decision]);
  return result[0]?.meta.changes === 1 && result[1]?.meta.changes === 1;
}

export async function revokeReview(db: D1Database, projectId: string, reviewId: string, actorEmail: string, nowMs = Date.now()): Promise<boolean> {
  const now = new Date(nowMs).toISOString();
  const result = await db.batch([
    db.prepare(`UPDATE review_rounds SET status = 'revoked', revoked_at = ?, revoked_by = ? WHERE id = ? AND project_id = ? AND status IN ('pending', 'approved', 'changes_requested')`).bind(now, actorEmail, reviewId, projectId),
    db.prepare(`UPDATE review_grants SET revoked_at = ?, revoked_by = ? WHERE review_id = ? AND revoked_at IS NULL AND changes() = 1
      AND EXISTS (SELECT 1 FROM review_rounds WHERE id = ? AND project_id = ?)`)
      .bind(now, actorEmail, reviewId, reviewId, projectId),
  ]);
  return result[0]?.meta.changes === 1;
}

export async function revokeGrant(db: D1Database, projectId: string, reviewId: string, grantId: string, actorEmail: string, nowMs = Date.now()): Promise<boolean> {
  const now = new Date(nowMs).toISOString();
  const result = await db.batch([
    db.prepare(`UPDATE review_grants SET revoked_at = ?, revoked_by = ? WHERE id = ? AND review_id = ? AND revoked_at IS NULL
      AND EXISTS (SELECT 1 FROM review_rounds WHERE id = ? AND project_id = ?)`)
      .bind(now, actorEmail, grantId, reviewId, reviewId, projectId),
    db.prepare(`UPDATE review_rounds SET status = 'revoked', revoked_at = ?, revoked_by = ? WHERE id = ? AND status = 'approved'
      AND EXISTS (SELECT 1 FROM review_decisions d JOIN review_grants g ON g.review_id = d.review_id
        WHERE d.review_id = review_rounds.id AND d.action = 'approved' AND g.id = ? AND g.revoked_at = ?)`)
      .bind(now, actorEmail, reviewId, grantId, now),
  ]);
  return result[0]?.meta.changes === 1;
}

export const reviewExpiryMs = SEVEN_DAYS;
