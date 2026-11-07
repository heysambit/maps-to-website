import { env } from 'cloudflare:workers';
import { describe, expect, it } from 'vitest';
import { createProject, saveProjectDraft } from '../../apps/builder/src/lib/drafts';
import { createReviewRound, getReviewForRevision, recordDecision, revokeGrant, revokeReview, type GrantInput } from '../../apps/builder/src/lib/reviews';
import { GET as getReviewAsset } from '../../apps/builder/src/pages/r/[revisionId]/media/[digest]';
import { POST as decideReview } from '../../apps/builder/src/pages/api/reviews/[revisionId]/decision';
import { storefrontDraft } from '../fixtures/drafts';
import { toPrivateReviewModel } from '../../apps/builder/src/lib/review-render';

function reviewerRequest(url: string, email?: string, extra: Record<string, string> = {}) {
  const headers = new Headers(extra);
  if (email) headers.set('x-fixture-reviewer-email', email);
  return new Request(url, { headers });
}

async function preparedProject(label = 'Owner review fixture', assetDigest?: string) {
  const project = await createProject(env.DB, label);
  const draft = { ...storefrontDraft, projectId: project.id, version: 0, ...(assetDigest ? { assets: [{ src: `/assets/${assetDigest}`, alt: 'Synthetic review asset', width: 1, height: 1, rights: { status: 'cleared', basis: 'Synthetic rights fixture' } }] } : {}) };
  const saved = await saveProjectDraft(env.DB, project.id, 0, draft);
  expect(saved.status).toBe('saved');
  return { project, version: 1 };
}

const grant = (email: string, role: 'viewer' | 'approver' = 'approver'): GrantInput => ({ name: email.split('@')[0], email, role });
const addReview = (projectId: string, version: number, grants: GrantInput[]) => createReviewRound(env.DB, projectId, version, grants, 'operator@example.test');

describe('private owner review rounds and grants', () => {
  it('requires a signed-in named identity scoped to the review project and revision', async () => {
    const { project, version } = await preparedProject();
    const started = await addReview(project.id, version, [grant('owner@example.test', 'viewer')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    expect(await getReviewForRevision(env.DB, started.revision.id, '')).toBeNull();
    expect(await getReviewForRevision(env.DB, started.revision.id, 'intruder@example.test')).toBeNull();
    const { project: otherProject, version: otherVersion } = await preparedProject('Wrong project grant fixture');
    const otherProjectReview = await addReview(otherProject.id, otherVersion, [grant('other-project-only@example.test', 'viewer')]);
    if (otherProjectReview.status !== 'created') throw new Error('second review fixture was not created');
    expect(await getReviewForRevision(env.DB, started.revision.id, 'other-project-only@example.test')).toBeNull();
    expect(otherProjectReview.revision.projectId).not.toBe(started.revision.projectId);
    const identity = await getReviewForRevision(env.DB, started.revision.id, 'owner@example.test');
    expect(identity).toMatchObject({ review: { status: 'pending' }, grant: { role: 'viewer', email: 'owner@example.test' } });
    expect(await toPrivateReviewModel(env.DB, identity!.revision)).toMatchObject({ businessName: 'Harbor & Pine' });
  });

  it('limits decisions to approvers, rejects cross-origin posts, and records a frozen revision decision once', async () => {
    const { project, version } = await preparedProject();
    const started = await addReview(project.id, version, [grant('viewer@example.test', 'viewer'), grant('approver@example.test')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    expect(started.grants.every((item) => item.expiresAt === started.review.expiresAt)).toBe(true);
    expect(Date.parse(started.review.expiresAt) - Date.now()).toBeGreaterThan(6 * 24 * 60 * 60 * 1000);
    const viewer = await getReviewForRevision(env.DB, started.revision.id, 'viewer@example.test');
    expect(viewer).not.toBeNull();
    expect(await recordDecision(env.DB, viewer!, 'viewer@example.test', 'approved', '')).toBe(false);
    const viewerPost = await decideReview({ request: new Request(`http://127.0.0.1/api/reviews/${started.revision.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://127.0.0.1', 'x-fixture-reviewer-email': 'viewer@example.test' }, body: new URLSearchParams({ action: 'approved' }) }), params: { revisionId: started.revision.id } });
    expect(viewerPost.status).toBe(403);
    const form = new URLSearchParams({ action: 'approved', message: 'Content approved as shown.' });
    const crossOrigin = await decideReview({ request: new Request(`http://127.0.0.1/api/reviews/${started.revision.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'https://evil.example', 'x-fixture-reviewer-email': 'approver@example.test' }, body: form }), params: { revisionId: started.revision.id } });
    expect(crossOrigin.status).toBe(401);
    const result = await decideReview({ request: new Request(`http://127.0.0.1/api/reviews/${started.revision.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://127.0.0.1', 'x-fixture-reviewer-email': 'approver@example.test' }, body: form }), params: { revisionId: started.revision.id } });
    expect(result.status).toBe(200);
    expect(result.headers.get('Cache-Control')).toContain('no-store');
    expect(result.headers.get('X-Robots-Tag')).toContain('noindex');
    expect(await result.json()).toMatchObject({ status: 'approved', revisionId: started.revision.id });
    const repeat = await decideReview({ request: new Request(`http://127.0.0.1/api/reviews/${started.revision.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://127.0.0.1', 'x-fixture-reviewer-email': 'approver@example.test' }, body: form }), params: { revisionId: started.revision.id } });
    expect(repeat.status).toBe(403);
    const decision = await env.DB.prepare('SELECT action, actor_email FROM review_decisions WHERE revision_id = ?').bind(started.revision.id).first<Record<string, unknown>>();
    expect(decision).toMatchObject({ action: 'approved', actor_email: 'approver@example.test' });
  });

  it('lets a named approver request changes with a bounded note', async () => {
    const { project, version } = await preparedProject('Request changes fixture');
    const started = await addReview(project.id, version, [grant('changes@example.test')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    const response = await decideReview({ request: new Request(`http://127.0.0.1/api/reviews/${started.revision.id}/decision`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Origin: 'http://127.0.0.1', 'x-fixture-reviewer-email': 'changes@example.test' }, body: new URLSearchParams({ action: 'changes_requested', message: 'Please correct the opening hours.' }) }), params: { revisionId: started.revision.id } });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: 'changes_requested' });
    const decision = await env.DB.prepare('SELECT action, message FROM review_decisions WHERE review_id = ?').bind(started.review.id).first<Record<string, unknown>>();
    expect(decision).toMatchObject({ action: 'changes_requested', message: 'Please correct the opening hours.' });
  });

  it('rejects tampered revisions, expired grants, and revoked review links', async () => {
    const { project, version } = await preparedProject();
    const started = await addReview(project.id, version, [grant('owner@example.test')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    const tampered = JSON.parse(JSON.stringify(started.revision));
    tampered.content.businessName.value = 'Tampered business';
    await env.DB.prepare('UPDATE frozen_revisions SET content_json = ? WHERE id = ?').bind(JSON.stringify(tampered), started.revision.id).run();
    expect(await getReviewForRevision(env.DB, started.revision.id, 'owner@example.test')).toBeNull();

    const expiredProject = await preparedProject('Expired review fixture');
    const expired = await createReviewRound(env.DB, expiredProject.project.id, expiredProject.version, [grant('old@example.test')], 'operator@example.test', Date.now() - 8 * 24 * 60 * 60 * 1000);
    if (expired.status !== 'created') throw new Error('expired review fixture was not created');
    expect(await getReviewForRevision(env.DB, expired.revision.id, 'old@example.test')).toBeNull();

    const revokedProject = await preparedProject('Revoked review fixture');
    const revoked = await addReview(revokedProject.project.id, revokedProject.version, [grant('revoked@example.test')]);
    if (revoked.status !== 'created') throw new Error('revoked review fixture was not created');
    expect(await revokeReview(env.DB, revokedProject.project.id, revoked.review.id, 'operator@example.test')).toBe(true);
    expect(await getReviewForRevision(env.DB, revoked.revision.id, 'revoked@example.test')).toBeNull();
    await expect(env.DB.prepare('SELECT status, revoked_by FROM review_rounds WHERE id = ?').bind(revoked.review.id).first<Record<string, unknown>>()).resolves.toMatchObject({ status: 'revoked', revoked_by: 'operator@example.test' });
  });

  it('protects assets by exact revision, digest, current grant, and private R2 metadata', async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
    const digest = [...hash].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    const { project, version } = await preparedProject('Asset review fixture', digest);
    const assetId = crypto.randomUUID();
    const objectKey = `projects/${project.id}/media/${assetId}`;
    await env.MEDIA.put(objectKey, bytes, { httpMetadata: { contentType: 'image/png' } });
    await env.DB.prepare('INSERT INTO media_assets (id, project_id, object_key, mime_type, size_bytes, width, height, alt_text, rights_basis, created_at, sha256) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(assetId, project.id, objectKey, 'image/png', bytes.byteLength, 1, 1, 'Synthetic review asset', 'fixture rights', new Date().toISOString(), digest).run();
    const started = await addReview(project.id, version, [grant('owner@example.test', 'viewer')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    const response = await getReviewAsset({ request: reviewerRequest(`http://127.0.0.1/r/${started.revision.id}/media/${digest}`, 'owner@example.test'), params: { revisionId: started.revision.id, digest } });
    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(response.headers.get('X-Robots-Tag')).toContain('noindex');
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([...bytes]);
    const otherEmail = await getReviewAsset({ request: reviewerRequest(`http://127.0.0.1/r/${started.revision.id}/media/${digest}`, 'other@example.test'), params: { revisionId: started.revision.id, digest } });
    expect(otherEmail.status).toBe(404);
    const malformed = await getReviewAsset({ request: reviewerRequest(`http://127.0.0.1/r/${started.revision.id}/media/../media/${digest}`, 'owner@example.test'), params: { revisionId: started.revision.id, digest: '../' + digest } });
    expect(malformed.status).toBe(404);
  });

  it('supersedes an approved round and makes the old grant unable to open the same frozen revision', async () => {
    const { project, version } = await preparedProject('Superseding round fixture');
    const first = await addReview(project.id, version, [grant('first-approver@example.test')]);
    if (first.status !== 'created') throw new Error('review fixture was not created');
    const snapshot = await getReviewForRevision(env.DB, first.revision.id, 'first-approver@example.test');
    expect(await recordDecision(env.DB, snapshot!, 'first-approver@example.test', 'approved', 'Approved in round one.')).toBe(true);
    const second = await addReview(project.id, version, [grant('second-viewer@example.test', 'viewer')]);
    if (second.status !== 'created') throw new Error('second review fixture was not created');
    expect(second.review.roundNo).toBe(2);
    expect(await getReviewForRevision(env.DB, first.revision.id, 'first-approver@example.test')).toBeNull();
    await expect(env.DB.prepare('SELECT status FROM review_rounds WHERE id = ?').bind(first.review.id).first<{ status: string }>()).resolves.toMatchObject({ status: 'superseded' });
    await expect(env.DB.prepare('SELECT action FROM review_decisions WHERE review_id = ?').bind(first.review.id).first<{ action: string }>()).resolves.toMatchObject({ action: 'approved' });
    expect(await getReviewForRevision(env.DB, second.revision.id, 'second-viewer@example.test')).toMatchObject({ review: { roundNo: 2, status: 'pending' }, grant: { role: 'viewer' } });
  });

  it('revokes an individual grant and invalidates an approval made by that approver', async () => {
    const { project, version } = await preparedProject('Grant revocation fixture');
    const started = await addReview(project.id, version, [grant('approver@example.test')]);
    if (started.status !== 'created') throw new Error('review fixture was not created');
    const snapshot = await getReviewForRevision(env.DB, started.revision.id, 'approver@example.test');
    expect(await recordDecision(env.DB, snapshot!, 'approver@example.test', 'approved', '')).toBe(true);
    expect(await revokeGrant(env.DB, project.id, started.review.id, started.grants[0].id, 'operator@example.test')).toBe(true);
    expect(await getReviewForRevision(env.DB, started.revision.id, 'approver@example.test')).toBeNull();
    await expect(env.DB.prepare('SELECT status FROM review_rounds WHERE id = ?').bind(started.review.id).first<{ status: string }>()).resolves.toMatchObject({ status: 'revoked' });
    await expect(env.DB.prepare('SELECT revoked_by FROM review_grants WHERE id = ?').bind(started.grants[0].id).first<{ revoked_by: string }>()).resolves.toMatchObject({ revoked_by: 'operator@example.test' });
  });
});
