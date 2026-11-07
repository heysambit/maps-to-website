import { env } from 'cloudflare:workers';
import { assertReleaseTransition, canTransitionRelease, validateReleaseGates, verifyReleaseBundle, type ReleaseStatus } from '@studio/contracts';
import { privateJson } from '../../../../../lib/places/http';

export const prerender = false;
export async function GET({ request, params }: { request: Request; params: { releaseId: string } }): Promise<Response> {
  if (!env.RELEASE_SERVICE_TOKEN || env.RELEASE_SERVICE_TOKEN.length < 32 || request.headers.get('authorization') !== `Bearer ${env.RELEASE_SERVICE_TOKEN}`) return privateJson({ error: 'Release service identity required.' }, 401);
  const row = await env.DB.prepare('SELECT id releaseId, status, project_id projectId, target_hostname targetHostname, provider_version providerVersion, provider_marker providerMarker, build_hash buildHash FROM release_records WHERE id = ?').bind(params.releaseId).first<Record<string, unknown>>();
  return row ? privateJson(row) : privateJson({ error: 'Release not found.' }, 404);
}
export async function POST({ request, params }: { request: Request; params: { releaseId: string } }): Promise<Response> {
  if (!env.RELEASE_SERVICE_TOKEN || env.RELEASE_SERVICE_TOKEN.length < 32 || request.headers.get('authorization') !== `Bearer ${env.RELEASE_SERVICE_TOKEN}`) return privateJson({ error: 'Release service identity required.' }, 401);
  let body: Record<string, unknown>; try { body = await request.json() as Record<string, unknown>; } catch { return privateJson({ error: 'Expected JSON.' }, 400); }
  const next = String(body.state || '') as ReleaseStatus;
  if (!['building','scanning','ready','deploying','unknown','needs_reconciliation','verifying','live','failed','rolling_back','rolled_back','takedown_pending','taken_down'].includes(next)) return privateJson({ error: 'Invalid release state.' }, 400);
  const row = await env.DB.prepare(`SELECT r.status, r.project_id, r.target_hostname, r.previous_release_id, r.review_id, r.revision_id, r.revision_hash,
      r.payment_reference, r.authority_reference, r.hostname_evidence, r.renderer_version, r.bundle_key, r.bundle_hash,
      rr.status review_status, rr.expires_at review_expires_at, rr.revoked_at,
      rd.action decision_action, rd.revision_id decision_revision,
      (SELECT id FROM review_rounds WHERE project_id = r.project_id ORDER BY round_no DESC LIMIT 1) latest_review,
      (SELECT payment_status FROM release_payment_evidence WHERE project_id = r.project_id ORDER BY recorded_at DESC LIMIT 1) latest_payment_status,
      (SELECT payment_reference FROM release_payment_evidence WHERE project_id = r.project_id ORDER BY recorded_at DESC LIMIT 1) latest_payment_reference
    FROM release_records r JOIN review_rounds rr ON rr.id = r.review_id
    LEFT JOIN review_decisions rd ON rd.review_id = r.review_id WHERE r.id = ?`).bind(params.releaseId).first<Record<string, unknown>>();
  if (!row || typeof row.status !== 'string' || !canTransitionRelease(row.status, next)) return privateJson({ error: 'Release transition is not allowed.' }, 409);
  assertReleaseTransition(row.status, next);
  const now = new Date().toISOString();
  if (next === 'deploying') {
    const stored = await env.RELEASES.get(String(row.bundle_key));
    let bundle: unknown = null;
    try { if (stored) bundle = JSON.parse(await stored.text()) as unknown; } catch { /* fail closed below */ }
    const integrity = Boolean(bundle && await verifyReleaseBundle(bundle)
      && (bundle as { releaseId: string }).releaseId === params.releaseId
      && (bundle as { projectId: string }).projectId === row.project_id
      && (bundle as { revisionId: string }).revisionId === row.revision_id
      && (bundle as { revisionHash: string }).revisionHash === row.revision_hash
      && (bundle as { bundleHash: string }).bundleHash === row.bundle_hash);
    const assets = integrity ? (bundle as { assets: Array<{ digest: string }> }).assets : [];
    let rightsVerified = integrity;
    for (const asset of assets) {
      const media = await env.DB.prepare('SELECT rights_basis, sha256 FROM media_assets WHERE project_id = ? AND sha256 = ?').bind(row.project_id, asset.digest).first<{ rights_basis: string; sha256: string }>();
      if (!media?.rights_basis?.trim() || media.sha256 !== asset.digest) rightsVerified = false;
    }
    const reviewStatus = row.latest_review !== row.review_id ? 'superseded' : row.revoked_at ? 'revoked' : String(row.review_status);
    const allowedHostnames = (env.ALLOWED_RELEASE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);
    const issues = validateReleaseGates({
      paymentStatus: String(row.latest_payment_status || 'missing'),
      paymentReference: row.latest_payment_reference === row.payment_reference ? String(row.latest_payment_reference || '') : '',
      authorityVerified: Boolean(row.authority_reference), authorityReference: String(row.authority_reference || ''),
      hostnameVerified: Boolean(row.hostname_evidence), hostnameEvidence: String(row.hostname_evidence || ''), targetHostname: String(row.target_hostname),
      allowedHostnames, expectedTargetHostname: String(row.target_hostname), reviewStatus,
      reviewRevisionId: String(row.decision_revision || ''), revisionId: String(row.revision_id), reviewExpiresAt: String(row.review_expires_at), reviewRevoked: Boolean(row.revoked_at),
      rightsVerified, bundleIntegrityVerified: integrity, rendererVersion: String(row.renderer_version), supportedRendererVersions: ['astro-renderer-m1'],
    });
    if (row.decision_action !== 'approved' || row.decision_revision !== row.revision_id || row.latest_payment_reference !== row.payment_reference) issues.push({ code: 'evidence_changed', field: 'payment/review', message: 'The stored payment or approval evidence no longer matches this release.' });
    if (issues.length) return privateJson({ error: 'Dispatch gates changed or bundle integrity failed.', issues }, 422);
  }
  if (next === 'rolling_back' || next === 'takedown_pending') {
    const lock = await env.DB.prepare(`INSERT INTO release_locks (project_id, target_hostname, release_id, acquired_at)
      SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM release_locks WHERE project_id = ? AND target_hostname = ?) ON CONFLICT(project_id, target_hostname) DO NOTHING`)
      .bind(row.project_id, row.target_hostname, params.releaseId, now, row.project_id, row.target_hostname).run();
    if (lock.meta.changes !== 1) return privateJson({ error: 'Another deployment holds this target. Reconcile it before rollback.' }, 409);
    const changed = await env.DB.prepare('UPDATE release_records SET status = ?, updated_at = ? WHERE id = ? AND status = ? AND EXISTS (SELECT 1 FROM release_locks WHERE release_id = ?)')
      .bind(next, now, params.releaseId, row.status, params.releaseId).run();
    if (changed.meta.changes !== 1) { await env.DB.prepare('DELETE FROM release_locks WHERE release_id = ?').bind(params.releaseId).run(); return privateJson({ error: 'Release state changed before rollback started.' }, 409); }
    await env.DB.prepare('INSERT INTO release_audit (release_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(params.releaseId, 'release-service', 'transition', next, 'target-locked', now).run();
    return privateJson({ releaseId: params.releaseId, status: next });
  }
  if (next === 'live') {
    await env.DB.batch([
      env.DB.prepare('UPDATE release_records SET status = ?, provider_version = ?, provider_marker = ?, build_hash = ?, updated_at = ? WHERE id = ? AND status = ?').bind(next, String(body.providerVersion || ''), String(body.providerMarker || ''), String(body.buildHash || ''), now, params.releaseId, row.status),
      env.DB.prepare(`INSERT INTO release_targets (target_hostname, current_release_id, updated_at) VALUES (?, ?, ?) ON CONFLICT(target_hostname) DO UPDATE SET current_release_id = excluded.current_release_id, updated_at = excluded.updated_at`).bind(row.target_hostname, params.releaseId, now),
      env.DB.prepare('DELETE FROM release_locks WHERE release_id = ?').bind(params.releaseId),
      env.DB.prepare('INSERT INTO release_audit (release_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(params.releaseId, 'release-service', 'transition', next, String(body.providerVersion || ''), now),
    ]);
  } else if (next === 'taken_down') {
    await env.DB.batch([
      env.DB.prepare('UPDATE release_records SET status = ?, provider_version = ?, provider_marker = ?, updated_at = ? WHERE id = ? AND status = ?').bind(next, String(body.providerVersion || ''), String(body.providerMarker || ''), now, params.releaseId, row.status),
      env.DB.prepare('UPDATE release_targets SET current_release_id = NULL, updated_at = ? WHERE target_hostname = ? AND current_release_id = ?').bind(now, row.target_hostname, params.releaseId),
      env.DB.prepare('DELETE FROM release_locks WHERE release_id = ?').bind(params.releaseId),
      env.DB.prepare('INSERT INTO release_audit (release_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(params.releaseId, 'release-service', 'transition', next, 'first-release-takedown', now),
    ]);
  } else if (next === 'rolled_back') {
    await env.DB.batch([
      env.DB.prepare('UPDATE release_records SET status = ?, provider_version = ?, provider_marker = ?, updated_at = ? WHERE id = ? AND status = ? AND EXISTS (SELECT 1 FROM release_locks WHERE release_id = ?)').bind(next, String(body.providerVersion || ''), String(body.providerMarker || ''), now, params.releaseId, row.status, params.releaseId),
      env.DB.prepare('UPDATE release_targets SET current_release_id = ?, updated_at = ? WHERE target_hostname = ? AND EXISTS (SELECT 1 FROM release_records WHERE id = ? AND previous_release_id = ?)').bind(row.previous_release_id, now, row.target_hostname, params.releaseId, row.previous_release_id),
      env.DB.prepare('DELETE FROM release_locks WHERE release_id = ?').bind(params.releaseId),
      env.DB.prepare('INSERT INTO release_audit (release_id, actor, action, status, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)').bind(params.releaseId, 'release-service', 'transition', next, String(body.providerVersion || ''), now),
    ]);
  } else {
    await env.DB.batch([
      env.DB.prepare('UPDATE release_records SET status = ?, provider_version = coalesce(?, provider_version), provider_marker = coalesce(?, provider_marker), build_hash = coalesce(?, build_hash), updated_at = ? WHERE id = ? AND status = ?').bind(next, typeof body.providerVersion === 'string' ? body.providerVersion : null, typeof body.providerMarker === 'string' ? body.providerMarker : null, typeof body.buildHash === 'string' ? body.buildHash : null, now, params.releaseId, row.status),
      env.DB.prepare(`INSERT INTO release_audit (release_id, actor, action, status, detail, created_at) VALUES (?, ?, 'transition', ?, ?, ?)`).bind(params.releaseId, 'release-service', next, typeof body.detail === 'string' ? body.detail.slice(0, 500) : null, now),
    ]);
    // Indeterminate outcomes deliberately retain the target lock.
  }
  return privateJson({ releaseId: params.releaseId, status: next });
}
