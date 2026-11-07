import { env } from 'cloudflare:workers';
import { createReleaseBundle, isValidTargetHostname, toRenderModel, validateReleaseGates, type ReleaseAssetDigest, type Revision } from '@studio/contracts';
import { requireOperator } from '../../../../../lib/guards';
import { privateJson, readBoundedRequestBytes } from '../../../../../lib/places/http';

export const prerender = false;
type Context = { request: Request; params: { projectId: string } };
const RENDERER_VERSION = 'astro-renderer-m1';

export async function GET({ request, params }: Context): Promise<Response> {
  if (!await requireOperator(request, env)) return privateJson({ error: 'Unauthorized.' }, 401);
  const rows = await env.DB.prepare(`SELECT rr.id reviewId, rr.revision_id revisionId, rr.round_no roundNo, rr.expires_at expiresAt, fr.content_hash revisionHash
    FROM review_rounds rr JOIN frozen_revisions fr ON fr.id = rr.revision_id
    JOIN review_decisions rd ON rd.review_id = rr.id AND rd.revision_id = rr.revision_id AND rd.action = 'approved'
    WHERE rr.project_id = ? AND rr.status = 'approved' AND rr.expires_at > ?
      AND rr.id = (SELECT id FROM review_rounds WHERE project_id = rr.project_id ORDER BY round_no DESC LIMIT 1)
    ORDER BY rr.round_no DESC`).bind(params.projectId, new Date().toISOString()).all<Record<string, unknown>>();
  return privateJson({ approved: rows.results || [] });
}

export async function POST({ request, params }: Context): Promise<Response> {
  const identity = await requireOperator(request, env);
  if (!identity) return privateJson({ error: 'Unauthorized.' }, 401);
  let body: Record<string, unknown>;
  try { body = JSON.parse(new TextDecoder().decode(await readBoundedRequestBytes(request, 12_000))) as Record<string, unknown>; }
  catch { return privateJson({ error: 'Expected a bounded JSON release request.' }, 400); }
  const revisionId = typeof body.revisionId === 'string' ? body.revisionId : '';
  const target = typeof body.targetHostname === 'string' ? body.targetHostname : '';
  if (!revisionId || !isValidTargetHostname(target) || typeof body.paymentReference !== 'string' || typeof body.authorityReference !== 'string' || typeof body.hostnameEvidence !== 'string') return privateJson({ error: 'Revision, exact target, payment, authority, and hostname evidence are required.' }, 400);
  const paymentStatus = ['missing','verified','reversed'].includes(String(body.paymentStatus)) ? String(body.paymentStatus) : 'missing';
  await env.DB.prepare('INSERT INTO release_payment_evidence (id, project_id, payment_status, payment_reference, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), params.projectId, paymentStatus, String(body.paymentReference).trim().slice(0, 500), identity.email, new Date().toISOString()).run();
  const row = await env.DB.prepare(`SELECT fr.id revision_id, fr.project_id, fr.content_hash, fr.content_json,
      rr.id review_id, rr.status review_status, rr.expires_at, rr.superseded_by, rd.action decision_action, rd.revision_id decision_revision,
      d.version draft_version
    FROM frozen_revisions fr JOIN review_rounds rr ON rr.revision_id = fr.id
    LEFT JOIN review_decisions rd ON rd.review_id = rr.id
    JOIN drafts d ON d.project_id = fr.project_id
    WHERE fr.id = ? AND fr.project_id = ? AND rr.id = ?`).bind(revisionId, params.projectId, String(body.reviewId || '')).first<Record<string, unknown>>();
  if (!row) return privateJson({ error: 'The frozen revision and review do not match this project.' }, 409);
  const latest = await env.DB.prepare('SELECT id FROM review_rounds WHERE project_id = ? ORDER BY round_no DESC LIMIT 1').bind(params.projectId).first<{ id: string }>();
  const revision = JSON.parse(String(row.content_json)) as Revision;
  if (revision.hash !== row.content_hash || revision.id !== revisionId || row.decision_action !== 'approved' || row.decision_revision !== revisionId) return privateJson({ error: 'An intact exact-revision approval is required.' }, 409);
  const media = revision.content.assets || [];
  const manifest: ReleaseAssetDigest[] = [];
  const converted = [];
  for (const asset of media) {
    const match = /\/media\/([^/]+)$/.exec(asset.src);
    if (!match) return privateJson({ error: 'A referenced asset is not a project media object.' }, 422);
    const dbAsset = await env.DB.prepare('SELECT id, object_key, mime_type, size_bytes, width, height, sha256, rights_basis FROM media_assets WHERE id = ? AND project_id = ?').bind(match[1], params.projectId).first<{ id: string; object_key: string; mime_type: string; size_bytes: number; width: number; height: number; sha256: string | null; rights_basis: string }>();
    if (!dbAsset?.sha256 || !dbAsset.rights_basis?.trim() || !['image/jpeg','image/png','image/webp'].includes(dbAsset.mime_type)) return privateJson({ error: 'Every release asset needs a verified digest and cleared rights.' }, 422);
    const object = await env.MEDIA.get(dbAsset.object_key);
    if (!object) return privateJson({ error: 'A referenced private asset is unavailable.' }, 422);
    const bytes = new Uint8Array(await object.arrayBuffer());
    const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    if (digest !== dbAsset.sha256) return privateJson({ error: 'A referenced asset digest does not match its bytes.' }, 422);
    manifest.push({ digest, mime: dbAsset.mime_type as ReleaseAssetDigest['mime'], size: bytes.byteLength, width: dbAsset.width, height: dbAsset.height, rightsNotice: dbAsset.rights_basis.trim().slice(0, 500) });
    converted.push({ ...asset, src: `/assets/${digest}` });
  }
  const allowedHostnames = (env.ALLOWED_RELEASE_HOSTS || '').split(',').map((host) => host.trim()).filter(Boolean);
  const activeReview = row.review_status === 'approved' && latest?.id === row.review_id && !row.superseded_by;
  const issues = validateReleaseGates({ paymentStatus, paymentReference: String(body.paymentReference), authorityVerified: body.authorityVerified === true, authorityReference: String(body.authorityReference), hostnameVerified: body.hostnameVerified === true, hostnameEvidence: String(body.hostnameEvidence), targetHostname: target, allowedHostnames, expectedTargetHostname: target, reviewStatus: activeReview ? 'approved' : row.superseded_by ? 'superseded' : String(row.review_status), reviewRevisionId: String(row.decision_revision || ''), revisionId, reviewExpiresAt: String(row.expires_at), reviewRevoked: false, rightsVerified: true, bundleIntegrityVerified: true, rendererVersion: RENDERER_VERSION, supportedRendererVersions: [RENDERER_VERSION] });
  if (issues.length) return privateJson({ error: 'Release gates are not satisfied.', issues }, 422);
  const id = crypto.randomUUID();
  const model = await toRenderModel(revision);
  model.assets = converted;
  const bundle = await createReleaseBundle({ releaseId: id, revision, content: model, targetHostname: target, rendererVersion: RENDERER_VERSION, assets: manifest });
  const bundleKey = `releases/${params.projectId}/${id}.json`;
  await env.RELEASES.put(bundleKey, JSON.stringify(bundle), { httpMetadata: { contentType: 'application/json', cacheControl: 'private, no-store' } });
  const now = new Date().toISOString();
  const previous = await env.DB.prepare('SELECT current_release_id FROM release_targets WHERE target_hostname = ?').bind(target).first<{ current_release_id: string | null }>();
  try {
    const results = await env.DB.batch([
      env.DB.prepare(`INSERT INTO release_records (id, project_id, target_hostname, revision_id, revision_hash, review_id, payment_status, payment_reference, authority_reference, hostname_evidence, renderer_version, bundle_key, bundle_hash, status, previous_release_id, requested_by, requested_at, updated_at)
        SELECT ?,?,?,?,?,?,'verified',?,?,?,?,?,?,'queued',?,?,?,? WHERE EXISTS (SELECT 1 FROM review_rounds WHERE id = ? AND project_id = ? AND status = 'approved' AND expires_at > ?)
        AND EXISTS (SELECT 1 FROM review_decisions WHERE review_id = ? AND revision_id = ? AND action = 'approved')
        AND NOT EXISTS (SELECT 1 FROM review_rounds WHERE project_id = ? AND round_no > (SELECT round_no FROM review_rounds WHERE id = ?))`)
        .bind(id, params.projectId, target, revisionId, revision.hash, row.review_id, String(body.paymentReference).trim(), String(body.authorityReference).trim(), String(body.hostnameEvidence).trim(), RENDERER_VERSION, bundleKey, bundle.bundleHash, previous?.current_release_id || null, identity.email, now, now, row.review_id, params.projectId, now, row.review_id, revisionId, params.projectId, row.review_id),
      env.DB.prepare(`INSERT INTO release_locks (project_id, target_hostname, release_id, acquired_at)
        SELECT ?,?,?,? WHERE changes() = 1 ON CONFLICT(project_id, target_hostname) DO NOTHING`).bind(params.projectId, target, id, now),
      env.DB.prepare(`INSERT INTO release_audit (release_id, actor, action, status, detail, created_at)
        SELECT ?,?,'requested','queued',?,? WHERE EXISTS (SELECT 1 FROM release_locks WHERE release_id = ? AND project_id = ? AND target_hostname = ?)`)
        .bind(id, identity.email, `bundle:${bundle.bundleHash}`, now, id, params.projectId, target),
    ]);
    if (results[0]?.meta.changes !== 1 || results[1]?.meta.changes !== 1) {
      await env.DB.prepare('DELETE FROM release_records WHERE id = ? AND status = \'queued\'').bind(id).run();
      await env.RELEASES.delete(bundleKey);
      return privateJson({ error: 'Another release holds this project and target, or review gates changed. Reconcile before retrying if a prior deploy may have started.' }, 409);
    }
  } catch {
    await env.RELEASES.delete(bundleKey);
    return privateJson({ error: 'Release request was not recorded. Check the project and target lock before retrying.' }, 409);
  }
  return privateJson({ releaseId: id, status: 'queued', bundleHash: bundle.bundleHash }, 201);
}
