import { beforeAll, describe, expect, it } from 'vitest';
import { env } from 'cloudflare:workers';
import { createProject } from '../../apps/builder/src/lib/drafts';
import { createReviewRound, recordDecision, type ReviewSnapshot } from '../../apps/builder/src/lib/reviews';
import { storefrontDraft } from '../fixtures/drafts';
import { POST as requestRelease } from '../../apps/builder/src/pages/api/projects/[projectId]/releases/index';
import { POST as transitionRelease } from '../../apps/builder/src/pages/api/internal/releases/[releaseId]/state';

beforeAll(async () => { await env.DB.exec('PRAGMA foreign_keys = ON'); });

describe('atomic release target lock', () => {
  it('allows one parallel release claim and retains the lock after an unknown provider outcome', async () => {
    const project = await createProject(env.DB, 'Release lock fixture');
    const revisionId = `${project.id}:v1`;
    const now = new Date().toISOString();
    await env.DB.prepare('INSERT INTO frozen_revisions (id, project_id, version, content_hash, template_version, content_json, created_at) VALUES (?, ?, 1, ?, ?, ?, ?)')
      .bind(revisionId, project.id, 'a'.repeat(64), 'm1', '{}', now).run();
    for (const id of ['release-lock-a', 'release-lock-b']) {
      await env.DB.prepare(`INSERT INTO release_records (id, project_id, target_hostname, revision_id, revision_hash, review_id, payment_status, payment_reference, authority_reference, hostname_evidence, renderer_version, bundle_key, bundle_hash, status, requested_by, requested_at, updated_at)
        VALUES (?, ?, 'fixture.example', ?, ?, ?, 'verified', 'receipt', 'owner', 'dns', 'astro-renderer-m1', ?, ?, 'queued', 'fixture-operator', ?, ?)`)
        .bind(id, project.id, revisionId, 'a'.repeat(64), `review-${id}`, `releases/${project.id}/${id}.json`, 'b'.repeat(64), now, now).run();
    }
    const attempts = await Promise.all(['release-lock-a', 'release-lock-b'].map((releaseId) => env.DB.prepare(`INSERT INTO release_locks (project_id, target_hostname, release_id, acquired_at) VALUES (?, 'fixture.example', ?, ?) ON CONFLICT(project_id, target_hostname) DO NOTHING`).bind(project.id, releaseId, now).run()));
    expect(attempts.reduce((total, result) => total + result.meta.changes, 0)).toBe(1);
    const lock = await env.DB.prepare('SELECT release_id FROM release_locks WHERE project_id = ? AND target_hostname = ?').bind(project.id, 'fixture.example').first<{ release_id: string }>();
    await env.DB.prepare("UPDATE release_records SET status = 'unknown' WHERE id = ?").bind(lock!.release_id).run();
    const retained = await env.DB.prepare('SELECT release_id FROM release_locks WHERE project_id = ? AND target_hostname = ?').bind(project.id, 'fixture.example').first<{ release_id: string }>();
    expect(retained?.release_id).toBe(lock?.release_id);
  });

  it('creates one scoped sealed bundle only after payment and the exact approved review pass', async () => {
    const project = await createProject(env.DB, 'Sealed release fixture');
    const draft = { ...structuredClone(storefrontDraft), projectId: project.id, version: 0 };
    await env.DB.prepare('UPDATE drafts SET content_json = ? WHERE project_id = ?').bind(JSON.stringify(draft), project.id).run();
    const created = await createReviewRound(env.DB, project.id, 0, [{ name: 'Approver', email: 'approver@example.test', role: 'approver' }], 'operator@example.test');
    if (created.status !== 'created') throw new Error('fixture review creation failed');
    const snapshot: ReviewSnapshot = { revision: created.revision, review: created.review, grant: { id: created.grants[0]!.id, name: 'Approver', email: 'approver@example.test', role: 'approver', expiresAt: created.grants[0]!.expiresAt, revokedAt: null } };
    expect(await recordDecision(env.DB, snapshot, 'approver@example.test', 'approved', 'Approved fixture revision.')).toBe(true);
    const buildRequest = (paymentStatus: string, reviewId = created.review.id) => new Request('http://127.0.0.1/api/releases', {
      method: 'POST', headers: { origin: 'http://127.0.0.1', authorization: 'Bearer test-only-fixture-operator-token', 'content-type': 'application/json' },
      body: JSON.stringify({ reviewId, revisionId: created.revision.id, targetHostname: 'fixture.example', paymentStatus, paymentReference: 'receipt-fixture', authorityVerified: true, authorityReference: 'owner-confirmed', hostnameVerified: true, hostnameEvidence: 'fixture hostname checked' }),
    });
    const denied = await requestRelease({ request: buildRequest('reversed'), params: { projectId: project.id } });
    expect(denied.status).toBe(422);
    const accepted = await requestRelease({ request: buildRequest('verified'), params: { projectId: project.id } });
    expect(accepted.status).toBe(201);
    const record = await accepted.json() as { releaseId: string; bundleHash: string };
    const row = await env.DB.prepare('SELECT status, bundle_hash, target_hostname FROM release_records WHERE id = ?').bind(record.releaseId).first<{ status: string; bundle_hash: string; target_hostname: string }>();
    expect(row).toMatchObject({ status: 'queued', bundle_hash: record.bundleHash, target_hostname: 'fixture.example' });
    const lock = await env.DB.prepare('SELECT release_id FROM release_locks WHERE project_id = ? AND target_hostname = ?').bind(project.id, 'fixture.example').first<{ release_id: string }>();
    expect(lock?.release_id).toBe(record.releaseId);
    const duplicate = await requestRelease({ request: buildRequest('verified'), params: { projectId: project.id } });
    expect(duplicate.status).toBe(409);
    await env.DB.prepare("UPDATE release_records SET status = 'ready' WHERE id = ?").bind(record.releaseId).run();
    await env.DB.prepare("UPDATE review_rounds SET expires_at = '2026-11-06T00:00:00.000Z' WHERE id = ?").bind(created.review.id).run();
    const transition = () => transitionRelease({ request: new Request(`http://127.0.0.1/api/internal/releases/${record.releaseId}/state`, { method: 'POST', headers: { authorization: 'Bearer test-only-service-token-must-be-over-32-chars', 'content-type': 'application/json' }, body: JSON.stringify({ state: 'deploying' }) }), params: { releaseId: record.releaseId } });
    const expired = await transition();
    expect(expired.status).toBe(422);
    expect((await expired.json() as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code)).toContain('review_expired');
    await env.DB.prepare('UPDATE review_rounds SET expires_at = ? WHERE id = ?').bind(new Date(Date.now() + 60 * 60 * 1000).toISOString(), created.review.id).run();
    await env.DB.prepare('INSERT INTO release_payment_evidence (id, project_id, payment_status, payment_reference, recorded_by, recorded_at) VALUES (?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), project.id, 'reversed', 'receipt-reversed-fixture', 'operator@example.test', new Date(Date.now() + 1000).toISOString()).run();
    const reversed = await transition();
    expect(reversed.status).toBe(422);
    expect((await reversed.json() as { issues: Array<{ code: string }> }).issues.map((issue) => issue.code)).toContain('payment_reversed');
  });
});
